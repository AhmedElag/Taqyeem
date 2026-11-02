import {one,statement,fail,now,id,text,guard,actorGuard,batch,audit,json,requireRole,residentAccess} from './core.mjs';

export function bilingualText(value,label='Text',max=1500,required=true){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(422,'invalid_text',label+' must contain English or Arabic text.');
  const result={en:text(value.en??'',label,0,max),ar:text(value.ar??'',label,0,max)};
  if(required&&!result.en&&!result.ar)fail(422,'invalid_text','Enter '+label.toLowerCase()+'.');return result;
}
export function facultyResidentGuard(db,actor,resident,extra='1=1',args=[]){
  const a=actorGuard(actor);const assigned=actor.role==='admin'?'1=1':'EXISTS(SELECT 1 FROM assignments WHERE resident_id=u.id AND doctor_id=? AND ended_at IS NULL)';
  return guard(db,a.sql+` AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.status!='inactive' AND u.record_version=? AND ${assigned}) AND (${extra})`,...a.args,resident.id,resident.record_version,...(actor.role==='admin'?[]:[actor.id]),...args);
}
export async function handleTeaching(path,request,body,env,cfg,actor){
  const goalMatch=path.match(/^\/api\/goals\/([^/]+)\/review$/);
  if(!['/api/observations','/api/goals'].includes(path)&&!goalMatch)return null;
  if(request.method!=='POST')return null;await requireRole(actor,'admin','doctor');const db=env.DB;
  if(goalMatch){
    const goal=await one(db,'SELECT * FROM teaching_goals WHERE id=?',goalMatch[1]);if(!goal)fail(404,'not_found','Teaching goal not found.');
    const resident=await residentAccess(db,actor,goal.resident_id);if(goal.reviewed_at)fail(409,'goal_reviewed','This teaching goal has already been reviewed.');
    const g=facultyResidentGuard(db,actor,resident,'EXISTS(SELECT 1 FROM teaching_goals WHERE id=? AND reviewed_at IS NULL)',[goal.id]);const time=now();
    await batch(db,[g.start,statement(db,'UPDATE teaching_goals SET reviewed_at=?,reviewed_by=? WHERE id=?',time,actor.id,goal.id),audit(db,actor,'goal.reviewed',resident.id,{goalId:goal.id}),g.end]);return json({ok:true});
  }
  const resident=await residentAccess(db,actor,text(body.studentId,'Resident ID',1,80));const content=bilingualText(body.text,path==='/api/goals'?'Teaching goal':'Observation');const goal=path==='/api/goals',recordId=id(goal?'goal':'observation');
  const g=facultyResidentGuard(db,actor,resident,goal?'NOT EXISTS(SELECT 1 FROM teaching_goals WHERE resident_id=? AND reviewed_at IS NULL)':'1=1',goal?[resident.id]:[]);
  await batch(db,[g.start,statement(db,`INSERT INTO ${goal?'teaching_goals':'observations'}(id,resident_id,doctor_id,text_en,text_ar,created_at) VALUES(?,?,?,?,?,?)`,recordId,resident.id,actor.id,content.en,content.ar,now()),audit(db,actor,goal?'goal.created':'observation.created',resident.id,{id:recordId}),g.end],goal?'Review the existing teaching goal before adding another.':'The resident assignment changed. Refresh before adding the observation.');
  return json({ok:true,id:recordId},201);
}
