import {all,one,statement,fail,now,id,names,normalizeEmail,integer,text,guard,actorGuard,batch,audit,json,requireRole} from './core.mjs';
import {prepareInvitation,invitationView,revokeAccess} from './auth.mjs';

const returnInvite=(prepared,user)=>invitationView(prepared.record,user,prepared.record.url);
const eligibility=(doctorId,programId)=>({sql:"EXISTS(SELECT 1 FROM users d JOIN doctor_programs dp ON dp.doctor_id=d.id WHERE d.id=? AND d.role='doctor' AND d.status='active' AND dp.program_id=?)",args:[doctorId,programId]});
async function validateProgram(db,value){const program=typeof value==='string'?await one(db,'SELECT * FROM programs WHERE id=?',value):null;if(!program)fail(422,'invalid_program','Select an existing psychiatry program.');return program;}
async function validateDoctor(db,value,programId){const condition=eligibility(value,programId);if(typeof value!=='string'||!await one(db,'SELECT 1 WHERE '+condition.sql,...condition.args))fail(422,'invalid_supervisor','Select an active supervisor in the resident’s program.');}
function guarded(db,actor,extra='1=1',args=[]){const a=actorGuard(actor);return guard(db,a.sql+' AND ('+extra+')',...a.args,...args);}
function validateActive(body){if(body.active!==undefined&&typeof body.active!=='boolean')fail(422,'invalid_status','Active must be true or false.');}

export async function handleAdmin(path,request,body,env,cfg,actor){
  if(!path.startsWith('/api/admin/'))return null;await requireRole(actor,'admin');const db=env.DB;
  if(path==='/api/admin/students'&&request.method==='POST'){
    const name=names(body),email=normalizeEmail(body.email),program=await validateProgram(db,body.programId),year=integer(body.year,1,6,'Training year');await validateDoctor(db,body.doctorId,program.id);
    const user={id:id('user'),email,name_en:name.en,name_ar:name.ar,role:'student'};const invitation=await prepareInvitation(db,user.id,program.id,actor,cfg);const eligible=eligibility(body.doctorId,program.id);const g=guarded(db,actor,eligible.sql,eligible.args);const time=now();
    await batch(db,[g.start,statement(db,"INSERT INTO users(id,email,name_en,name_ar,role,status,color,created_at,updated_at) VALUES(?,?,?,?,'student','pending','#cf9a55',?,?)",user.id,email,name.en,name.ar,time,time),statement(db,'INSERT INTO resident_profiles(user_id,program_id,training_year,joined_at) VALUES(?,?,?,?)',user.id,program.id,year,time),statement(db,'INSERT INTO assignments(id,resident_id,doctor_id,started_at,created_by) VALUES(?,?,?,?,?)',id('assignment'),user.id,body.doctorId,time,actor.id),invitation.insert,audit(db,actor,'student.created',user.id,{programId:program.id}),g.end],'This email is already registered, or the supervisor changed. Refresh and try again.');
    return json({ok:true,invitation:returnInvite(invitation,user)},201);
  }
  if(path==='/api/admin/invitations'&&request.method==='POST'){
    if(body.role!=='doctor')fail(422,'invalid_role','This invitation is for a supervising psychiatrist.');const name=names(body),email=normalizeEmail(body.email),program=await validateProgram(db,body.programId);const user={id:id('user'),email,name_en:name.en,name_ar:name.ar,role:'doctor'};const invitation=await prepareInvitation(db,user.id,program.id,actor,cfg);const g=guarded(db,actor);const time=now();
    await batch(db,[g.start,statement(db,"INSERT INTO users(id,email,name_en,name_ar,role,status,color,created_at,updated_at) VALUES(?,?,?,?,'doctor','pending','#5487a1',?,?)",user.id,email,name.en,name.ar,time,time),statement(db,'INSERT INTO doctor_programs(doctor_id,program_id) VALUES(?,?)',user.id,program.id),invitation.insert,audit(db,actor,'invitation.created',user.id,{programId:program.id}),g.end],'This email address is already registered.');
    return json({ok:true,invitation:returnInvite(invitation,user)},201);
  }
  const invitationMatch=path.match(/^\/api\/admin\/invitations\/([^/]+)(\/reissue)?$/);
  if(invitationMatch){
    const record=await one(db,'SELECT i.*,u.name_en,u.name_ar,u.email,u.role,u.status AS user_status,u.record_version FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.id=?',invitationMatch[1]);if(!record)fail(404,'not_found','Invitation not found.');
    if(invitationMatch[2]&&request.method==='POST'){
      if(record.user_status!=='pending')fail(409,'account_not_pending','Only a pending account can receive a new invitation.');const invitation=await prepareInvitation(db,record.user_id,record.program_id,actor,cfg);const g=guarded(db,actor,"EXISTS(SELECT 1 FROM users WHERE id=? AND status='pending' AND record_version=?)",[record.user_id,record.record_version]);
      await batch(db,[g.start,...revokeAccess(db,record.user_id),statement(db,'UPDATE users SET auth_version=auth_version+1,record_version=record_version+1,updated_at=? WHERE id=?',now(),record.user_id),invitation.insert,audit(db,actor,'invitation.reissued',record.user_id),g.end]);return json({ok:true,invitation:returnInvite(invitation,record)});
    }
    if(!invitationMatch[2]&&request.method==='DELETE'){
      if(record.status!=='pending')fail(409,'invitation_not_pending','This invitation is no longer pending.');const g=guarded(db,actor,"EXISTS(SELECT 1 FROM invitations WHERE id=? AND status='pending')",[record.id]);await batch(db,[g.start,statement(db,"UPDATE invitations SET status='revoked',revoked_at=? WHERE id=?",now(),record.id),audit(db,actor,'invitation.revoked',record.user_id),g.end]);return json({ok:true});
    }
  }
  const studentMatch=path.match(/^\/api\/admin\/students\/([^/]+)$/);
  if(studentMatch&&request.method==='PATCH'){
    const existing=await one(db,"SELECT u.*,r.program_id,r.training_year,a.doctor_id,a.id AS assignment_id FROM users u JOIN resident_profiles r ON r.user_id=u.id LEFT JOIN assignments a ON a.resident_id=u.id AND a.ended_at IS NULL WHERE u.id=? AND u.role='student'",studentMatch[1]);if(!existing)fail(404,'not_found','Resident not found.');validateActive(body);
    const name=names(body,existing),email=body.email===undefined?existing.email:normalizeEmail(body.email),program=await validateProgram(db,body.programId??existing.program_id),year=integer(body.year??existing.training_year,1,6,'Training year'),doctorId=body.doctorId??existing.doctor_id;
    const emailChanged=email!==existing.email;const reactivate=body.active===true&&existing.status==='inactive';let status=body.active===false?'inactive':(emailChanged||reactivate?'pending':existing.status);
    if(status!=='inactive')await validateDoctor(db,doctorId,program.id);
    const assignmentChanged=doctorId!==existing.doctor_id||program.id!==existing.program_id;const revoke=emailChanged||reactivate||status==='inactive';const user={...existing,email,name_en:name.en,name_ar:name.ar};const invitation=status==='pending'&&(emailChanged||reactivate)?await prepareInvitation(db,user.id,program.id,actor,cfg):null;
    const eligible=status==='inactive'?{sql:'1=1',args:[]}:eligibility(doctorId,program.id);const g=guarded(db,actor,'EXISTS(SELECT 1 FROM users WHERE id=? AND record_version=?) AND '+eligible.sql,[existing.id,existing.record_version,...eligible.args]);const time=now();const writes=[g.start];
    if(revoke)writes.push(...revokeAccess(db,user.id,time));
    writes.push(statement(db,'UPDATE users SET email=?,name_en=?,name_ar=?,status=?,auth_version=auth_version+?,record_version=record_version+1,updated_at=? WHERE id=?',email,name.en,name.ar,status,revoke?1:0,time,user.id),statement(db,'UPDATE resident_profiles SET program_id=?,training_year=? WHERE user_id=?',program.id,year,user.id));
    if(assignmentChanged){writes.push(statement(db,'UPDATE assignments SET ended_at=? WHERE resident_id=? AND ended_at IS NULL',time,user.id));if(doctorId)writes.push(statement(db,'INSERT INTO assignments(id,resident_id,doctor_id,started_at,created_by) VALUES(?,?,?,?,?)',id('assignment'),user.id,doctorId,time,actor.id));}
    if(invitation)writes.push(invitation.insert);writes.push(audit(db,actor,'student.updated',user.id,{programId:program.id,status}),g.end);await batch(db,writes,'This resident, email or supervisor changed. Refresh and try again.');return json({ok:true,...(invitation?{invitation:returnInvite(invitation,user)}:{})});
  }
  const doctorMatch=path.match(/^\/api\/admin\/doctors\/([^/]+)$/);
  if(doctorMatch&&request.method==='PATCH'){
    const existing=await one(db,"SELECT * FROM users WHERE id=? AND role='doctor'",doctorMatch[1]);if(!existing)fail(404,'not_found','Supervising psychiatrist not found.');validateActive(body);
    const name=names(body,existing),email=body.email===undefined?existing.email:normalizeEmail(body.email);const prior=(await all(db,'SELECT program_id FROM doctor_programs WHERE doctor_id=?',existing.id)).map(p=>p.program_id);let programs=body.programs??prior;
    if(!Array.isArray(programs)||programs.length<1||programs.length>20||new Set(programs).size!==programs.length)fail(422,'invalid_programs','Select one or more distinct programs.');for(const program of programs)await validateProgram(db,program);
    const emailChanged=email!==existing.email,reactivate=body.active===true&&existing.status==='inactive';const status=body.active===false?'inactive':(emailChanged||reactivate?'pending':existing.status);const revoke=emailChanged||reactivate||status==='inactive';
    const assigned=await all(db,"SELECT r.program_id FROM assignments a JOIN users u ON u.id=a.resident_id JOIN resident_profiles r ON r.user_id=a.resident_id WHERE a.doctor_id=? AND a.ended_at IS NULL AND u.status!='inactive'",existing.id);
    if(assigned.some(r=>status!=='active'||!programs.includes(r.program_id)))fail(409,'reassignment_required','Reassign this supervisor’s active residents before deactivating, changing email, or removing their program.');
    const removed=prior.filter(p=>!programs.includes(p));const checkAssigned=status==='active'?(removed.length?`NOT EXISTS(SELECT 1 FROM assignments a JOIN users u ON u.id=a.resident_id JOIN resident_profiles r ON r.user_id=a.resident_id WHERE a.doctor_id=? AND a.ended_at IS NULL AND u.status!='inactive' AND r.program_id IN(${removed.map(()=>'?').join(',')}))`:'1=1'):"NOT EXISTS(SELECT 1 FROM assignments a JOIN users u ON u.id=a.resident_id WHERE a.doctor_id=? AND a.ended_at IS NULL AND u.status!='inactive')";
    const assignmentArgs=status==='active'?(removed.length?[existing.id,...removed]:[]):[existing.id];const g=guarded(db,actor,'EXISTS(SELECT 1 FROM users WHERE id=? AND record_version=?) AND '+checkAssigned,[existing.id,existing.record_version,...assignmentArgs]);
    const user={...existing,email,name_en:name.en,name_ar:name.ar};const invitation=status==='pending'&&(emailChanged||reactivate)?await prepareInvitation(db,user.id,programs[0],actor,cfg):null;const time=now();const writes=[g.start];if(revoke)writes.push(...revokeAccess(db,user.id,time));
    writes.push(statement(db,'UPDATE users SET email=?,name_en=?,name_ar=?,status=?,auth_version=auth_version+?,record_version=record_version+1,updated_at=? WHERE id=?',email,name.en,name.ar,status,revoke?1:0,time,user.id),statement(db,'DELETE FROM doctor_programs WHERE doctor_id=?',user.id));for(const programId of programs)writes.push(statement(db,'INSERT INTO doctor_programs(doctor_id,program_id) VALUES(?,?)',user.id,programId));if(invitation)writes.push(invitation.insert);writes.push(audit(db,actor,'doctor.updated',user.id,{status,programs}),g.end);await batch(db,writes,'This supervisor or email changed. Refresh and try again.');return json({ok:true,...(invitation?{invitation:returnInvite(invitation,user)}:{})});
  }
  const templateMatch=path.match(/^\/api\/admin\/programs\/([^/]+)\/questions$/);
  if(templateMatch&&request.method==='PUT'){
    const program=await validateProgram(db,templateMatch[1]);const current=await one(db,'SELECT version FROM template_versions WHERE id=?',program.current_template_id);const expected=integer(body.expectedVersion,1,1000000,'Template version');if(expected!==current.version)fail(409,'template_changed','These questions changed. Refresh before editing.');
    if(!Array.isArray(body.questions)||body.questions.length<1||body.questions.length>20)fail(422,'invalid_questions','Provide between one and twenty assessment categories.');const questions=body.questions.map(q=>{if(!q||typeof q!=='object'||Array.isArray(q))fail(422,'invalid_questions','Each category requires an ID and bilingual labels.');const key=text(q.id,'Category ID',1,60);if(!/^[A-Za-z0-9_-]+$/.test(key))fail(422,'invalid_questions','Category IDs may contain letters, numbers, underscores and hyphens.');return {id:key,en:text(q.en,'English category',1,90),ar:text(q.ar,'Arabic category',1,90)};});
    for(const field of ['id','en','ar'])if(new Set(questions.map(q=>q[field].toLocaleLowerCase())).size!==questions.length)fail(422,'duplicate_questions','Category IDs and labels must be distinct.');
    const versionId=id('template'),version=current.version+1;const g=guarded(db,actor,'EXISTS(SELECT 1 FROM programs WHERE id=? AND current_template_id=?)',[program.id,program.current_template_id]);const writes=[g.start,statement(db,'INSERT INTO template_versions(id,program_id,version,created_by,created_at) VALUES(?,?,?,?,?)',versionId,program.id,version,actor.id,now())];questions.forEach((q,index)=>writes.push(statement(db,'INSERT INTO template_questions(template_version_id,question_key,position,label_en,label_ar) VALUES(?,?,?,?,?)',versionId,q.id,index,q.en,q.ar)));writes.push(statement(db,'UPDATE programs SET current_template_id=? WHERE id=?',versionId,program.id),audit(db,actor,'template.updated',program.id,{version}),g.end);await batch(db,writes,'These questions changed. Refresh before editing.');return json({ok:true,templateVersionId:versionId,templateVersion:version});
  }
  return null;
}
