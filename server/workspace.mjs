import {all,one,fail,json,publicUser,activeScope,period,requireRole} from './core.mjs';
import {invitationView} from './auth.mjs';

const studentView=row=>({...publicUser(row),programId:row.program_id,year:row.training_year,recordVersion:row.record_version,doctorId:row.doctor_id,active:row.status!=='inactive',pending:row.status==='pending',joined:row.joined_at.slice(0,10)});
const fileView=row=>({id:row.id,studentId:row.resident_id,number:row.file_number,date:row.worked_date,createdAt:row.created_at,reviewed:!!row.reviewed_at});
const actionLabels={
  'owner.initialized':['Owner account prepared','تم تجهيز حساب مدير البرنامج'],
  'invitation.accepted':['Invitation accepted','تم قبول الدعوة'],
  'invitation.created':['Supervisor invitation created','تم إنشاء دعوة مشرف'],
  'invitation.reissued':['Invitation renewed','تم تجديد الدعوة'],
  'invitation.revoked':['Invitation revoked','تم إلغاء الدعوة'],
  'student.created':['Resident registered','تم تسجيل طبيب مقيم'],
  'student.updated':['Resident profile updated','تم تحديث ملف الطبيب المقيم'],
  'doctor.updated':['Supervisor profile updated','تم تحديث ملف المشرف'],
  'template.updated':['Assessment questions updated','تم تحديث أسئلة التقييم'],
  'evaluation.draft':['Assessment draft saved','تم حفظ مسودة التقييم'],
  'evaluation.published':['Assessment published','تم نشر التقييم'],
  'file.created':['File reference added','تمت إضافة رقم ملف'],
  'file.reviewed':['File reference reviewed','تمت مراجعة رقم الملف'],
  'session.created':['Account signed in','تم تسجيل الدخول']
};

export async function workspace(env,cfg,actor){
  await requireRole(actor,'admin','doctor','student');const db=env.DB;
  const data={version:2,students:[],doctors:[],programs:[],evaluations:[],files:[],invitations:[],activity:[]};
  const studentScope=activeScope(actor,'r','user_id');
  const students=await all(db,`SELECT u.*,r.program_id,r.training_year,r.joined_at,a.doctor_id FROM resident_profiles r JOIN users u ON u.id=r.user_id LEFT JOIN assignments a ON a.resident_id=r.user_id AND a.ended_at IS NULL WHERE ${studentScope.sql} ORDER BY u.name_en`,...studentScope.args);
  data.students=students.map(studentView);
  const filesScope=activeScope(actor,'f');
  data.files=(await all(db,`SELECT f.* FROM file_log f WHERE ${filesScope.sql} ORDER BY f.created_at DESC`,...filesScope.args)).map(fileView);
  if(actor.role==='student'){
    const rating=await one(db,'SELECT e.overall_score AS score,e.period FROM evaluation_heads h JOIN evaluations e ON e.id=h.published_id WHERE h.resident_id=? ORDER BY h.period DESC LIMIT 1',actor.id);
    return json({data,studentRating:rating?{score:rating.score,period:rating.period}:null,period:cfg.period,today:cfg.today});
  }
  const programWhere=actor.role==='admin'?'1=1':`p.id IN(SELECT program_id FROM doctor_programs WHERE doctor_id=? UNION SELECT r.program_id FROM resident_profiles r JOIN assignments a ON a.resident_id=r.user_id WHERE a.doctor_id=? AND a.ended_at IS NULL)`;
  const programArgs=actor.role==='admin'?[]:[actor.id,actor.id];
  const programs=await all(db,`SELECT p.*,v.version AS template_version FROM programs p JOIN template_versions v ON v.id=p.current_template_id WHERE ${programWhere} ORDER BY p.rowid`,...programArgs);
  const questions=await all(db,`SELECT q.* FROM template_questions q JOIN programs p ON p.current_template_id=q.template_version_id WHERE ${programWhere} ORDER BY q.position`,...programArgs);
  data.programs=programs.map(p=>({id:p.id,name:{en:p.name_en,ar:p.name_ar},color:p.color,description:{en:p.description_en,ar:p.description_ar},templateVersionId:p.current_template_id,templateVersion:p.template_version,questions:questions.filter(q=>q.template_version_id===p.current_template_id).map(q=>({id:q.question_key,en:q.label_en,ar:q.label_ar}))}));
  const scope=activeScope(actor);const visible=`${scope.sql} AND ((e.status='published' AND EXISTS(SELECT 1 FROM evaluation_heads h WHERE h.published_id=e.id)) OR (e.status='draft' AND e.doctor_id=?))`;const args=[...scope.args,actor.id];
  const evaluations=await all(db,`SELECT e.*,n.note_en,n.note_ar FROM evaluations e LEFT JOIN evaluation_notes n ON n.evaluation_id=e.id WHERE ${visible} ORDER BY e.period DESC,e.created_at DESC`,...args);
  const snapshots=await all(db,`SELECT q.* FROM evaluation_questions q JOIN evaluations e ON e.id=q.evaluation_id WHERE ${visible} ORDER BY q.position`,...args);
  data.evaluations=evaluations.map(e=>{const q=snapshots.filter(q=>q.evaluation_id===e.id);return {id:e.id,studentId:e.resident_id,doctorId:e.doctor_id,programId:e.program_id,trainingYear:e.training_year,period:e.period,status:e.status,version:e.version,templateVersionId:e.template_version_id,scores:q.map(q=>q.score),questions:q.map(q=>({id:q.question_key,en:q.label_en,ar:q.label_ar})),note:{en:e.note_en||'',ar:e.note_ar||''},createdAt:e.created_at,...(e.published_at?{publishedAt:e.published_at,superseded:false}:{})};});
  const doctorWhere=actor.role==='admin'?"u.role IN('doctor','admin')":`u.id=? OR u.id IN(SELECT e.doctor_id FROM evaluations e WHERE ${visible})`;
  const doctorArgs=actor.role==='admin'?[]:[actor.id,...args];
  const doctors=await all(db,`SELECT u.* FROM users u WHERE ${doctorWhere} ORDER BY u.name_en`,...doctorArgs);
  const memberships=actor.role==='admin'?await all(db,'SELECT * FROM doctor_programs'):await all(db,'SELECT * FROM doctor_programs WHERE doctor_id=?',actor.id);
  data.doctors=doctors.map(d=>({...publicUser(d),email:actor.role==='admin'||d.id===actor.id?d.email:'',programs:memberships.filter(m=>m.doctor_id===d.id).map(m=>m.program_id),active:d.status!=='inactive',pending:d.status==='pending'}));
  if(actor.role==='admin'){
    const invitations=await all(db,'SELECT i.*,u.name_en,u.name_ar,u.email,u.role FROM invitations i JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC LIMIT 300');
    data.invitations=invitations.map(i=>invitationView(i,i));
    data.activity=(await all(db,'SELECT id,action,created_at FROM audit_events ORDER BY created_at DESC,rowid DESC LIMIT 50')).map(a=>({id:a.id,type:a.action,text:{en:(actionLabels[a.action]||['Program updated','تم تحديث البرنامج'])[0],ar:(actionLabels[a.action]||['Program updated','تم تحديث البرنامج'])[1]},at:a.created_at}));
  }
  return json({data,studentRating:null,period:cfg.period,today:cfg.today});
}

function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function report(request,env,actor){
  await requireRole(actor,'admin');const url=new URL(request.url);const month=period(url.searchParams.get('period'));const program=url.searchParams.get('programId')||'all';const resident=url.searchParams.get('studentId')||'all';const lang=url.searchParams.get('lang')==='ar'?'ar':'en';const format=url.searchParams.get('format')||'csv';
  if(!['csv','json'].includes(format))fail(422,'invalid_format','Choose CSV or JSON.');
  const clauses=['e.period=?'];const args=[month];
  if(program!=='all'){if(!await one(env.DB,'SELECT 1 FROM programs WHERE id=?',program))fail(422,'invalid_program','Select an existing program.');clauses.push('e.program_id=?');args.push(program);}
  if(resident!=='all'){if(!await one(env.DB,'SELECT 1 FROM resident_profiles WHERE user_id=?',resident))fail(422,'invalid_student','Select an existing resident.');clauses.push('e.resident_id=?');args.push(resident);}
  const rows=await all(env.DB,`SELECT e.id,e.resident_id,e.program_id,e.training_year,e.period,e.overall_score,e.published_at,u.name_en,u.name_ar,u.email,p.name_en AS program_en,p.name_ar AS program_ar,d.name_en AS doctor_en,d.name_ar AS doctor_ar,q.question_key,q.label_en,q.label_ar,q.score,(SELECT count(*) FROM file_log f WHERE f.resident_id=e.resident_id AND substr(f.worked_date,1,7)=e.period) AS files FROM evaluation_heads h JOIN evaluations e ON e.id=h.published_id JOIN users u ON u.id=e.resident_id JOIN users d ON d.id=e.doctor_id JOIN programs p ON p.id=e.program_id JOIN evaluation_questions q ON q.evaluation_id=e.id WHERE ${clauses.join(' AND ')} ORDER BY u.name_en,q.position`,...args);
  if(format==='json')return json({period:month,rows:rows.map(r=>({evaluationId:r.id,studentId:r.resident_id,name:r['name_'+lang],email:r.email,programId:r.program_id,program:r['program_'+lang],trainingYear:r.training_year,period:r.period,doctor:r['doctor_'+lang],overallScore:r.overall_score,questionId:r.question_key,question:r['label_'+lang],score:r.score,fileCount:r.files,publishedAt:r.published_at}))});
  const header=lang==='ar'?['معرّف التقييم','الطبيب المقيم','البريد الإلكتروني','البرنامج','سنة التدريب','الشهر','المشرف','الدرجة الإجمالية','معرّف البند','بند التقييم','الدرجة','عدد أرقام الملفات','تاريخ النشر']:['Assessment ID','Resident','Email','Program','Training year','Period','Supervisor','Overall score','Category ID','Category','Score','File references','Published at'];
  const values=rows.map(r=>[r.id,r['name_'+lang],r.email,r['program_'+lang],r.training_year,r.period,r['doctor_'+lang],r.overall_score,r.question_key,r['label_'+lang],r.score,r.files,r.published_at]);
  const csv='\uFEFF'+[header,...values].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  return new Response(csv,{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':`attachment; filename="taqyeem-${month}-${lang}.csv"`,'Cache-Control':'no-store'}});
}
