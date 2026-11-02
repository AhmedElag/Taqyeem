import {all,one,statement,fail,now,id,integer,text,period,isoDate,guard,actorGuard,batch,audit,json,requireRole,residentAccess} from './core.mjs';
import {reviewContextSql} from './reviews.mjs';

export async function handleEvaluation(path,request,body,env,cfg,actor){
  if(!['/api/evaluations/draft','/api/evaluations/publish'].includes(path)||request.method!=='POST')return null;
  await requireRole(actor,'admin','doctor');const db=env.DB,publish=path.endsWith('/publish');const residentId=text(body.studentId,'Resident ID',1,80);const resident=await residentAccess(db,actor,residentId);const month=period(body.period);const expected=integer(body.expectedVersion,0,1000000,'Draft version');const expectedResidentVersion=integer(body.expectedResidentVersion,1,1000000,'Resident version');
  if(expectedResidentVersion!==resident.record_version)fail(409,'resident_changed','The resident’s profile, program, training year or supervisor changed. Refresh and review the current form.');
  if(body.basePublishedId!==null&&(typeof body.basePublishedId!=='string'||body.basePublishedId.length>80))fail(422,'invalid_publication','The current publication ID is required.');
  const program=await one(db,'SELECT * FROM programs WHERE id=?',resident.program_id);if(body.templateVersionId!==program.current_template_id)fail(409,'template_changed','The program or assessment questions changed. Refresh and review the current form.');
  const questions=await all(db,'SELECT * FROM template_questions WHERE template_version_id=? ORDER BY position',program.current_template_id);
  if(!Array.isArray(body.scores)||body.scores.length!==questions.length)fail(422,'invalid_scores','Provide one score for each assessment category.');
  const scores=body.scores.map(score=>{if(score===null&&!publish)return null;return integer(score,1,10,'Each score');});
  if(body.note!==undefined&&(!body.note||typeof body.note!=='object'||Array.isArray(body.note)))fail(422,'invalid_note','Feedback must contain English and Arabic text fields.');const note={en:text(body.note?.en??'','English feedback',0,3000),ar:text(body.note?.ar??'','Arabic feedback',0,3000)};
  const ownDraft=await one(db,"SELECT * FROM evaluations WHERE resident_id=? AND doctor_id=? AND period=? AND status='draft'",resident.id,actor.id,month);
  const head=await one(db,'SELECT h.published_id,e.version FROM evaluation_heads h JOIN evaluations e ON e.id=h.published_id WHERE h.resident_id=? AND h.period=?',resident.id,month);
  if((ownDraft?.version||0)!==expected||(head?.published_id??null)!==body.basePublishedId)fail(409,'assessment_changed','This assessment changed. Refresh and review the latest version.');
  const review=ownDraft?await one(db,"SELECT * FROM evaluation_reviews WHERE evaluation_id=? AND status IN('pending','approved','changes_requested')",ownDraft.id):null;
  if(publish&&ownDraft?.review_required){
    if(!review||review.status!=='approved'||review.evaluation_version!==ownDraft.version)fail(409,'review_required','This assessment needs approval or an explicit withdrawal of its review request before publication.');
    const snapshot=JSON.parse(review.snapshot_json).evaluation;
    if(JSON.stringify(scores)!==JSON.stringify(snapshot.scores)||note.en!==snapshot.note.en||note.ar!==snapshot.note.ar)fail(409,'approved_content_changed','The ratings or notes changed after approval. Save and send the updated assessment for review.');
    if(!await one(db,`SELECT 1 FROM evaluation_reviews rv WHERE rv.id=? AND ${reviewContextSql()}`,review.id))fail(409,'review_stale','The resident, assignment or assessment changed. Send a fresh review request.');
  }

  const a=actorGuard(actor);const assignment=actor.role==='admin'?'1=1':"EXISTS(SELECT 1 FROM assignments ca JOIN doctor_programs dp ON dp.doctor_id=ca.doctor_id AND dp.program_id=r.program_id WHERE ca.resident_id=r.user_id AND ca.doctor_id=? AND ca.ended_at IS NULL)";
  const condition=a.sql+` AND EXISTS(SELECT 1 FROM resident_profiles r JOIN users u ON u.id=r.user_id JOIN programs p ON p.id=r.program_id WHERE r.user_id=? AND u.status!='inactive' AND u.record_version=? AND r.program_id=? AND r.training_year=? AND p.current_template_id=? AND ${assignment}) AND COALESCE((SELECT version FROM evaluations WHERE resident_id=? AND doctor_id=? AND period=? AND status='draft'),0)=? AND COALESCE((SELECT published_id FROM evaluation_heads WHERE resident_id=? AND period=?),'')=?`;
  const reviewGuard=` AND COALESCE((SELECT review_required FROM evaluations WHERE resident_id=? AND doctor_id=? AND period=? AND status='draft'),0)=? AND COALESCE((SELECT id||':'||status FROM evaluation_reviews WHERE evaluation_id=? AND status IN('pending','approved','changes_requested')),'')=?`+(publish&&ownDraft?.review_required?` AND EXISTS(SELECT 1 FROM evaluation_reviews rv WHERE rv.id=? AND rv.status='approved' AND ${reviewContextSql()})`:'');
  const g=guard(db,condition+reviewGuard,...a.args,resident.id,expectedResidentVersion,resident.program_id,resident.training_year,program.current_template_id,...(actor.role==='doctor'?[actor.id]:[]),resident.id,actor.id,month,expected,resident.id,month,body.basePublishedId??'',resident.id,actor.id,month,ownDraft?.review_required||0,ownDraft?.id||'',review?review.id+':'+review.status:'',...(publish&&ownDraft?.review_required?[review.id]:[]));
  const evaluationId=ownDraft?.id||id('evaluation'),version=publish?(head?.version||0)+1:expected+1,time=now();const writes=[g.start];
  if(!publish&&ownDraft&&review)writes.push(statement(db,"UPDATE evaluation_reviews SET status='superseded',closed_at=? WHERE id=?",time,review.id));
  if(ownDraft){writes.push(statement(db,'DELETE FROM evaluation_questions WHERE evaluation_id=?',evaluationId),statement(db,'DELETE FROM evaluation_notes WHERE evaluation_id=?',evaluationId),statement(db,'UPDATE evaluations SET program_id=?,training_year=?,template_version_id=?,version=?,base_published_id=?,overall_score=NULL,published_at=NULL WHERE id=?',resident.program_id,resident.training_year,program.current_template_id,version,body.basePublishedId,evaluationId));}
  else writes.push(statement(db,"INSERT INTO evaluations(id,resident_id,doctor_id,program_id,training_year,period,template_version_id,status,version,base_published_id,created_at) VALUES(?,?,?,?,?,?,?,'draft',?,?,?)",evaluationId,resident.id,actor.id,resident.program_id,resident.training_year,month,program.current_template_id,version,body.basePublishedId,time));
  questions.forEach((q,index)=>writes.push(statement(db,'INSERT INTO evaluation_questions(evaluation_id,question_key,position,label_en,label_ar,score) VALUES(?,?,?,?,?,?)',evaluationId,q.question_key,index,q.label_en,q.label_ar,scores[index])));
  writes.push(statement(db,'INSERT INTO evaluation_notes(evaluation_id,note_en,note_ar) VALUES(?,?,?)',evaluationId,note.en,note.ar));
  if(publish){const mean=scores.reduce((sum,s)=>sum+s,0)/scores.length;writes.push(statement(db,"UPDATE evaluations SET status='published',overall_score=?,published_at=? WHERE id=?",mean,time,evaluationId),statement(db,'INSERT INTO evaluation_heads(resident_id,period,published_id) VALUES(?,?,?) ON CONFLICT(resident_id,period) DO UPDATE SET published_id=excluded.published_id',resident.id,month,evaluationId));}
  writes.push(audit(db,actor,publish?'evaluation.published':'evaluation.draft',resident.id,{evaluationId,period:month,programId:resident.program_id,version}),g.end);await batch(db,writes,'The assessment, program or supervisor changed. Refresh and review before saving again.');return json({ok:true,evaluationId,version});
}

function normalizedFileNumber(value){
  if(typeof value!=='string')fail(422,'invalid_file_number','Enter a file number.');
  const number=value.trim().replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x6f0)).toUpperCase();
  if(!/^[A-Z0-9_/-]{1,40}$/.test(number))fail(422,'invalid_file_number','Use letters, digits, slash, hyphen or underscore, up to 40 characters.');return number;
}
export async function handleFiles(path,request,body,env,cfg,actor){
  const db=env.DB;
  if(path==='/api/files'&&request.method==='POST'){
    await requireRole(actor,'student');if(Object.hasOwn(body,'studentId')||Object.hasOwn(body,'residentId'))fail(422,'invalid_field','A file reference is always added to your own account.');
    const number=normalizedFileNumber(body.number),date=isoDate(body.date);if(date>cfg.today)fail(422,'future_date','The worked date cannot be in the future.');
    const a=actorGuard(actor);const g=guard(db,a.sql+' AND EXISTS(SELECT 1 FROM resident_profiles WHERE user_id=?)',...a.args,actor.id);const fileId=id('file');await batch(db,[g.start,statement(db,'INSERT INTO file_log(id,resident_id,file_number,worked_date,created_at) VALUES(?,?,?,?,?)',fileId,actor.id,number,date,now()),audit(db,actor,'file.created',actor.id,{fileId}),g.end],'This file number is already in your log.');return json({ok:true},201);
  }
  const correction=path.match(/^\/api\/files\/([^/]+)$/);
  if(correction&&request.method==='PATCH'){
    await requireRole(actor,'student');if(Object.keys(body).some(key=>!['number','expectedVersion'].includes(key)))fail(422,'invalid_field','Only your file number can be corrected.');
    const file=await one(db,'SELECT * FROM file_log WHERE id=? AND resident_id=?',correction[1],actor.id);if(!file)fail(403,'not_your_file','Only your own file numbers can be corrected.');
    const number=normalizedFileNumber(body.number),expected=integer(body.expectedVersion,1,1000000,'File version');
    if(expected!==file.version)fail(409,'file_changed','This file changed. Refresh before correcting it.');
    if(number===file.file_number)return json({ok:true,version:file.version});
    const a=actorGuard(actor),g=guard(db,a.sql+' AND EXISTS(SELECT 1 FROM file_log WHERE id=? AND resident_id=? AND version=?)',...a.args,file.id,actor.id,expected);const time=now();
    await batch(db,[g.start,statement(db,'INSERT INTO file_corrections(id,file_id,previous_number,file_number,version,was_reviewed,changed_by,created_at) VALUES(?,?,?,?,?,?,?,?)',id('correction'),file.id,file.file_number,number,expected+1,file.reviewed_at?1:0,actor.id,time),statement(db,'UPDATE file_log SET file_number=?,version=version+1,needs_recheck=CASE WHEN reviewed_at IS NOT NULL OR needs_recheck=1 THEN 1 ELSE 0 END,reviewed_at=NULL,reviewed_by=NULL WHERE id=?',number,file.id),audit(db,actor,'file.corrected',actor.id,{fileId:file.id,version:expected+1}),g.end],'This number is already in your log, or the entry changed. Refresh and try again.');return json({ok:true,version:expected+1});
  }
  const match=path.match(/^\/api\/files\/([^/]+)\/review$/);
  if(match&&request.method==='POST'){
    await requireRole(actor,'admin','doctor');if(body.reviewed!==true)fail(422,'invalid_review','Set reviewed to true.');const expected=integer(body.expectedVersion,1,1000000,'File version');
    const file=await one(db,'SELECT * FROM file_log WHERE id=?',match[1]);if(!file)fail(404,'not_found','File reference not found.');
    const resident=await residentAccess(db,actor,file.resident_id);if(file.version!==expected)fail(409,'file_changed','The file number changed. Review the latest entry.');
    const a=actorGuard(actor);let condition=a.sql+" AND EXISTS(SELECT 1 FROM users WHERE id=? AND status!='inactive' AND record_version=?) AND EXISTS(SELECT 1 FROM file_log WHERE id=? AND version=?)";const args=[...a.args,file.resident_id,resident.record_version,file.id,expected];
    if(actor.role==='doctor'){condition+=' AND EXISTS(SELECT 1 FROM assignments WHERE resident_id=? AND doctor_id=? AND ended_at IS NULL)';args.push(file.resident_id,actor.id);}
    const g=guard(db,condition,...args);await batch(db,[g.start,statement(db,'UPDATE file_log SET reviewed_at=?,reviewed_by=?,needs_recheck=0,version=version+1 WHERE id=?',now(),actor.id,file.id),audit(db,actor,'file.reviewed',file.resident_id,{fileId:file.id,version:expected+1}),g.end]);return json({ok:true,version:expected+1});
  }
  return null;
}
