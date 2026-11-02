import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';

// Optional local-only runtime smoke. Uses Wrangler's pinned Miniflare/workerd and
// an ephemeral D1 database; it never deploys remotely or sends email.
const origin='http://localhost:8787';
const secret='local-workerd-smoke-secret-not-for-production';
const moduleFiles=['worker.mjs',...(await readdir(new URL('../server/',import.meta.url))).filter(name=>name.endsWith('.mjs')&&name!=='worker.mjs').sort()];
const runtime=new Miniflare(convertV4MiniflareOptions({
  modules:moduleFiles.map(name=>({type:'ESModule',path:fileURLToPath(new URL('../server/'+name,import.meta.url))})),
  compatibilityDate:'2026-11-01',d1Databases:['DB'],d1Persist:false,
  bindings:{APP_ORIGIN:origin,APP_TIMEZONE:'UTC',DEVELOPMENT:'true',SESSION_SECRET:secret,BOOTSTRAP_TOKEN:secret,ADMIN_EMAIL:'owner@example.test'},
  log:new Log(LogLevel.ERROR)
}));
class Client {
  constructor(){this.cookie='';this.csrf='';}
  async request(path,method='GET',body={},extra={}){
    const headers={...extra};if(this.cookie)headers.Cookie=this.cookie;if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';if(this.csrf)headers['X-CSRF-Token']=this.csrf;}
    const response=await runtime.dispatchFetch(origin+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});
    if(response.headers.has('Set-Cookie'))this.cookie=response.headers.get('Set-Cookie').split(';')[0];
    const data=await response.json();return {status:response.status,data};
  }
  async accept(url){const token=new URL(url).hash.slice(8);const result=await this.request('/api/auth/accept-invitation','POST',{token});assert.equal(result.status,200,JSON.stringify(result));const session=await this.request('/api/session');this.csrf=session.data.csrfToken;this.user=session.data.user;assert.ok(this.csrf);}
  async workspace(){const result=await this.request('/api/workspace');assert.equal(result.status,200,JSON.stringify(result));return result.data;}
}
try{
  const database=await runtime.getD1Database('DB');
  // Use the same SQL splitter as the pinned Wrangler migration command. D1 exec
  // splits on line breaks, which cannot parse multiline CREATE TRIGGER bodies.
  const migrations=(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort().map(name=>'../migrations/'+name);
  for(const file of [...migrations,'../server/setup/psychiatry.sql']){
    const source=await readFile(new URL(file,import.meta.url),'utf8');await database.batch(unstable_splitSqlQuery(source).map(sql=>database.prepare(sql)));
  }
  const admin=new Client();assert.deepEqual((await admin.request('/api/health')).data,{ok:true,app:'Taqyeem'});
  const start=await admin.request('/api/auth/bootstrap','POST',{}, {Authorization:'Bearer '+secret});assert.equal(start.status,201,JSON.stringify(start));await admin.accept(start.data.activationUrl);
  const supervisorInvite=await admin.request('/api/admin/invitations','POST',{nameEn:'Dr. Runtime Test',nameAr:'طبيب اختبار',email:'doctor@example.test',programId:'adult',role:'doctor'});assert.equal(supervisorInvite.status,201,JSON.stringify(supervisorInvite));const doctor=new Client();await doctor.accept(supervisorInvite.data.invitation.url);
  const residentInvite=await admin.request('/api/admin/students','POST',{nameEn:'Runtime Resident',nameAr:'مقيم اختبار',email:'resident@example.test',programId:'adult',year:2,doctorId:doctor.user.id,reviewIntervalWeeks:2});assert.equal(residentInvite.status,201,JSON.stringify(residentInvite));const resident=new Client();await resident.accept(residentInvite.data.invitation.url);
  const workspace=await doctor.workspace();const profile=workspace.data.students[0],program=workspace.data.programs.find(p=>p.id==='adult');const payload={studentId:profile.id,expectedResidentVersion:profile.recordVersion,period:workspace.period,templateVersionId:program.templateVersionId,scores:program.questions.map(()=>8),note:{en:'PRIVATE RUNTIME NOTE',ar:''},expectedVersion:0,basePublishedId:null};
  assert.equal(profile.reviewIntervalWeeks,2);assert.equal(profile.reviewDue,true);
  const observation=await doctor.request('/api/observations','POST',{studentId:profile.id,text:{en:'PRIVATE RUNTIME OBSERVATION',ar:''}});assert.equal(observation.status,201,JSON.stringify(observation));
  const goal=await doctor.request('/api/goals','POST',{studentId:profile.id,text:{en:'PRIVATE RUNTIME GOAL',ar:''}});assert.equal(goal.status,201,JSON.stringify(goal));
  const draft=await doctor.request('/api/evaluations/draft','POST',payload);assert.equal(draft.status,200,JSON.stringify(draft));assert.equal((await resident.workspace()).studentRating,null);
  const stale=await doctor.request('/api/evaluations/publish','POST',payload);assert.equal(stale.status,409,JSON.stringify(stale));
  const referral=await doctor.request('/api/evaluation-reviews','POST',{evaluationId:draft.data.evaluationId,reviewerId:admin.user.id,expectedVersion:draft.data.version});assert.equal(referral.status,201,JSON.stringify(referral));
  assert.equal((await doctor.request('/api/evaluations/publish','POST',{...payload,expectedVersion:1})).status,409);
  const approval=await admin.request(`/api/evaluation-reviews/${referral.data.id}/respond`,'POST',{decision:'approved',comment:{en:'Reviewed in workerd',ar:''}});assert.equal(approval.status,200,JSON.stringify(approval));
  const publication=await doctor.request('/api/evaluations/publish','POST',{...payload,expectedVersion:1});assert.equal(publication.status,200,JSON.stringify(publication));const view=await resident.workspace();assert.deepEqual(view.studentRating,{score:8,period:payload.period});assert.equal(view.data.students.length,1);for(const field of ['evaluations','programs','doctors','invitations','activity','observations','goals','reviewers','reviewRequests'])assert.deepEqual(view.data[field],[]);assert.equal(JSON.stringify(view).includes('PRIVATE RUNTIME'),false);
  assert.equal((await doctor.workspace()).data.students[0].reviewDue,false);
  const fileCreated=await resident.request('/api/files','POST',{number:'RUNTIME-١٢٣',date:workspace.today});assert.equal(fileCreated.status,201,JSON.stringify(fileCreated));
  let file=(await resident.workspace()).data.files[0];assert.equal(file.number,'RUNTIME-123');
  assert.equal((await doctor.request(`/api/files/${file.id}/review`,'POST',{reviewed:true,expectedVersion:file.version})).status,200);
  file=(await resident.workspace()).data.files[0];assert.equal(file.reviewed,true);
  const corrected=await resident.request(`/api/files/${file.id}`,'PATCH',{number:'RUNTIME-۱۲۴',expectedVersion:file.version});assert.equal(corrected.status,200,JSON.stringify(corrected));
  file=(await resident.workspace()).data.files[0];assert.equal(file.number,'RUNTIME-124');assert.equal(file.needsRecheck,true);
  assert.equal((await doctor.workspace()).data.files[0].corrections[0].previousNumber,'RUNTIME-123');
  assert.equal((await doctor.request(`/api/files/${file.id}/review`,'POST',{reviewed:true,expectedVersion:file.version})).status,200);
  assert.equal((await doctor.request(`/api/goals/${goal.data.id}/review`,'POST')).status,200);
  const previousCookie=doctor.cookie;assert.equal((await doctor.request('/api/auth/logout','POST')).status,200);doctor.cookie=previousCookie;assert.equal((await doctor.request('/api/workspace')).status,401);
  const guards=await database.prepare('SELECT count(*) AS n FROM transaction_guards').first();assert.equal(guards.n,0);
  console.log('workerd + local D1: migrations, onboarding, review intervals, private teaching notes/goals, draft referral/approval/publication, student projection, corrected-file acknowledgment and lock-session revocation passed.');
}finally{await runtime.dispose();}
