import {all,one,statement,fail,now,id,text,integer,guard,actorGuard,batch,audit,json,requireRole,residentAccess} from './core.mjs';
import {bilingualText,facultyResidentGuard} from './teaching.mjs';

// Referral access expires when the underlying draft, enrollment, template, assignment,
// sender account, or published head changes. It never expands residentAccess().
export function reviewContextSql(alias='rv'){
  return `EXISTS(SELECT 1 FROM evaluations re JOIN resident_profiles rp ON rp.user_id=re.resident_id JOIN users ru ON ru.id=rp.user_id JOIN programs pg ON pg.id=rp.program_id JOIN users au ON au.id=re.doctor_id WHERE re.id=${alias}.evaluation_id AND re.status='draft' AND re.version=${alias}.evaluation_version AND re.review_required=1 AND re.doctor_id=${alias}.from_doctor_id AND re.resident_id=${alias}.resident_id AND ru.status!='inactive' AND ru.record_version=${alias}.resident_record_version AND au.status='active' AND re.program_id=rp.program_id AND re.training_year=rp.training_year AND re.template_version_id=pg.current_template_id AND re.template_version_id=${alias}.template_version_id AND COALESCE(re.base_published_id,'')=COALESCE(${alias}.base_published_id,'') AND COALESCE((SELECT published_id FROM evaluation_heads WHERE resident_id=re.resident_id AND period=re.period),'')=COALESCE(${alias}.base_published_id,'') AND (au.role='admin' OR EXISTS(SELECT 1 FROM assignments ca JOIN doctor_programs dp ON dp.doctor_id=ca.doctor_id AND dp.program_id=rp.program_id WHERE ca.resident_id=re.resident_id AND ca.doctor_id=au.id AND ca.ended_at IS NULL)))`;
}
export function reviewView(row){return {id:row.id,evaluationId:row.evaluation_id,studentId:row.resident_id,fromDoctorId:row.from_doctor_id,toDoctorId:row.to_doctor_id,evaluationVersion:row.evaluation_version,status:row.status,comment:{en:row.comment_en,ar:row.comment_ar},createdAt:row.created_at,reviewedAt:row.reviewed_at,closedAt:row.closed_at,evaluationStatus:row.evaluation_status,publishedAt:row.evaluation_published_at||null,snapshot:JSON.parse(row.snapshot_json)};}

export async function handleReviews(path,request,body,env,cfg,actor){
  const match=path.match(/^\/api\/evaluation-reviews\/([^/]+)\/(respond|cancel)$/);
  if(path!=='/api/evaluation-reviews'&&!match)return null;if(request.method!=='POST')return null;
  await requireRole(actor,'admin','doctor');const db=env.DB;const a=actorGuard(actor);
  if(!match){
    const evaluation=await one(db,"SELECT e.*,n.note_en,n.note_ar FROM evaluations e LEFT JOIN evaluation_notes n ON n.evaluation_id=e.id WHERE e.id=? AND e.status='draft'",text(body.evaluationId,'Evaluation ID',1,80));
    if(!evaluation||evaluation.doctor_id!==actor.id)fail(403,'not_your_draft','Only the author can send this draft for review.');
    if(integer(body.expectedVersion,1,1000000,'Draft version')!==evaluation.version)fail(409,'draft_changed','This draft changed. Refresh before sending it for review.');
    const resident=await residentAccess(db,actor,evaluation.resident_id);const program=await one(db,'SELECT * FROM programs WHERE id=?',resident.program_id);
    const head=await one(db,'SELECT published_id FROM evaluation_heads WHERE resident_id=? AND period=?',resident.id,evaluation.period);
    if(evaluation.program_id!==resident.program_id||evaluation.training_year!==resident.training_year||evaluation.template_version_id!==program.current_template_id||(evaluation.base_published_id??null)!==(head?.published_id??null))fail(409,'draft_changed','Save the current assessment before sending it for review.');
    const reviewer=await one(db,"SELECT id FROM users WHERE id=? AND role IN('doctor','admin') AND status='active'",text(body.reviewerId,'Reviewer ID',1,80));
    if(!reviewer||reviewer.id===actor.id)fail(422,'invalid_reviewer','Choose another active doctor or the administrator.');
    const questions=await all(db,'SELECT * FROM evaluation_questions WHERE evaluation_id=? ORDER BY position',evaluation.id);const scores=questions.map(q=>q.score);const complete=scores.length&&scores.every(Number.isInteger);
    const snapshot={student:{id:resident.id,name:{en:resident.name_en,ar:resident.name_ar},programName:{en:program.name_en,ar:program.name_ar},year:resident.training_year},evaluation:{scores,questions:questions.map(q=>({id:q.question_key,en:q.label_en,ar:q.label_ar})),note:{en:evaluation.note_en||'',ar:evaluation.note_ar||''},period:evaluation.period,overall:complete?scores.reduce((sum,s)=>sum+s,0)/scores.length:null}};
    const assignment=actor.role==='admin'?'1=1':'EXISTS(SELECT 1 FROM assignments ca JOIN doctor_programs dp ON dp.doctor_id=ca.doctor_id AND dp.program_id=r.program_id WHERE ca.resident_id=r.user_id AND ca.doctor_id=? AND ca.ended_at IS NULL)';
    const condition=a.sql+` AND EXISTS(SELECT 1 FROM evaluations e JOIN resident_profiles r ON r.user_id=e.resident_id JOIN users u ON u.id=r.user_id JOIN programs p ON p.id=r.program_id WHERE e.id=? AND e.doctor_id=? AND e.status='draft' AND e.version=? AND u.status!='inactive' AND u.record_version=? AND e.program_id=r.program_id AND e.training_year=r.training_year AND e.template_version_id=p.current_template_id AND COALESCE(e.base_published_id,'')=COALESCE((SELECT published_id FROM evaluation_heads WHERE resident_id=e.resident_id AND period=e.period),'') AND ${assignment}) AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND role IN('admin','doctor')) AND NOT EXISTS(SELECT 1 FROM evaluation_reviews WHERE evaluation_id=? AND status IN('pending','approved','changes_requested'))`;
    const g=guard(db,condition,...a.args,evaluation.id,actor.id,evaluation.version,resident.record_version,...(actor.role==='admin'?[]:[actor.id]),reviewer.id,evaluation.id);const reviewId=id('review');
    await batch(db,[g.start,statement(db,'UPDATE evaluations SET review_required=1 WHERE id=?',evaluation.id),statement(db,"INSERT INTO evaluation_reviews(id,evaluation_id,resident_id,from_doctor_id,to_doctor_id,evaluation_version,resident_record_version,template_version_id,base_published_id,snapshot_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?)",reviewId,evaluation.id,resident.id,actor.id,reviewer.id,evaluation.version,resident.record_version,evaluation.template_version_id,evaluation.base_published_id,JSON.stringify(snapshot),now()),audit(db,actor,'evaluation.review_requested',resident.id,{reviewId,evaluationId:evaluation.id,reviewerId:reviewer.id}),g.end],'The draft changed or already has a review. Refresh before sending again.');
    return json({ok:true,id:reviewId},201);
  }
  const review=await one(db,'SELECT * FROM evaluation_reviews WHERE id=?',match[1]);if(!review)fail(404,'not_found','Review request not found.');
  if(match[2]==='respond'){
    if(review.to_doctor_id!==actor.id)fail(403,'not_your_review','Only the requested reviewer can respond.');
    if(!['approved','changes_requested'].includes(body.decision))fail(422,'invalid_decision','Approve the assessment or request changes.');
    if(review.status!=='pending')fail(409,'review_completed','This request has already been answered or withdrawn.');
    const content=bilingualText(body.comment??{},'Review comment',1500,body.decision==='changes_requested');
    if(body.decision==='approved'){
      const scores=JSON.parse(review.snapshot_json).evaluation.scores;
      if(!scores.length||!scores.every(s=>Number.isInteger(s)&&s>=1&&s<=10))fail(422,'incomplete_assessment','Every category needs a score before this assessment can be approved.');
    }
    const g=guard(db,a.sql+` AND EXISTS(SELECT 1 FROM evaluation_reviews rv WHERE rv.id=? AND rv.status='pending' AND ${reviewContextSql()})`,...a.args,review.id);const time=now();
    await batch(db,[g.start,statement(db,'UPDATE evaluation_reviews SET status=?,comment_en=?,comment_ar=?,reviewed_at=? WHERE id=?',body.decision,content.en,content.ar,time,review.id),audit(db,actor,'evaluation.review_responded',review.resident_id,{reviewId:review.id,decision:body.decision}),g.end],'The draft, resident, or review changed. The author must send a fresh review request.');
    return json({ok:true});
  }
  if(actor.role!=='admin'&&review.from_doctor_id!==actor.id)fail(403,'not_your_review','Only the sender or administrator can withdraw this request.');
  const resident=await residentAccess(db,actor,review.resident_id);
  if(review.status==='cancelled')fail(409,'review_completed','This request has already been withdrawn.');
  const g=facultyResidentGuard(db,actor,resident,"EXISTS(SELECT 1 FROM evaluations WHERE id=? AND status='draft' AND review_required=1) AND EXISTS(SELECT 1 FROM evaluation_reviews WHERE id=? AND status=?) AND NOT EXISTS(SELECT 1 FROM evaluation_reviews WHERE evaluation_id=? AND id!=? AND status IN('pending','approved','changes_requested')) AND NOT EXISTS(SELECT 1 FROM evaluation_reviews newer WHERE newer.evaluation_id=? AND newer.rowid>(SELECT rowid FROM evaluation_reviews WHERE id=?))",[review.evaluation_id,review.id,review.status,review.evaluation_id,review.id,review.evaluation_id,review.id]);
  await batch(db,[g.start,statement(db,"UPDATE evaluation_reviews SET status='cancelled',closed_at=? WHERE id=?",now(),review.id),statement(db,'UPDATE evaluations SET review_required=0 WHERE id=?',review.evaluation_id),audit(db,actor,'evaluation.review_cancelled',review.resident_id,{reviewId:review.id}),g.end],'This review or draft changed. Refresh before withdrawing it.');return json({ok:true});
}
