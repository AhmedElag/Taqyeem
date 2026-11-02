import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';

// Optional local-only runtime smoke. Uses Wrangler's pinned Miniflare/workerd and
// an ephemeral D1 database; it never deploys remotely or sends email.
const origin='http://localhost:8787';
const secret='local-workerd-smoke-secret-not-for-production';
const runtime=new Miniflare(convertV4MiniflareOptions({
  modules:['worker','core','auth','workspace','admin','evaluations'].map(name=>({type:'ESModule',path:fileURLToPath(new URL('../server/'+name+'.mjs',import.meta.url))})),
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
  for(const file of ['../migrations/0001_initial.sql','../server/setup/psychiatry.sql']){
    const source=await readFile(new URL(file,import.meta.url),'utf8');await database.batch(unstable_splitSqlQuery(source).map(sql=>database.prepare(sql)));
  }
  const admin=new Client();assert.deepEqual((await admin.request('/api/health')).data,{ok:true,app:'Taqyeem'});
  const start=await admin.request('/api/auth/bootstrap','POST',{}, {Authorization:'Bearer '+secret});assert.equal(start.status,201,JSON.stringify(start));await admin.accept(start.data.activationUrl);
  const supervisorInvite=await admin.request('/api/admin/invitations','POST',{nameEn:'Dr. Runtime Test',nameAr:'طبيب اختبار',email:'doctor@example.test',programId:'adult',role:'doctor'});assert.equal(supervisorInvite.status,201,JSON.stringify(supervisorInvite));const doctor=new Client();await doctor.accept(supervisorInvite.data.invitation.url);
  const residentInvite=await admin.request('/api/admin/students','POST',{nameEn:'Runtime Resident',nameAr:'مقيم اختبار',email:'resident@example.test',programId:'adult',year:2,doctorId:doctor.user.id});assert.equal(residentInvite.status,201,JSON.stringify(residentInvite));const resident=new Client();await resident.accept(residentInvite.data.invitation.url);
  const workspace=await doctor.workspace();const profile=workspace.data.students[0],program=workspace.data.programs.find(p=>p.id==='adult');const payload={studentId:profile.id,expectedResidentVersion:profile.recordVersion,period:workspace.period,templateVersionId:program.templateVersionId,scores:program.questions.map(()=>8),note:{en:'PRIVATE RUNTIME NOTE',ar:''},expectedVersion:0,basePublishedId:null};
  const draft=await doctor.request('/api/evaluations/draft','POST',payload);assert.equal(draft.status,200,JSON.stringify(draft));assert.equal((await resident.workspace()).studentRating,null);
  const stale=await doctor.request('/api/evaluations/publish','POST',payload);assert.equal(stale.status,409,JSON.stringify(stale));
  const publication=await doctor.request('/api/evaluations/publish','POST',{...payload,expectedVersion:1});assert.equal(publication.status,200,JSON.stringify(publication));const view=await resident.workspace();assert.deepEqual(view.studentRating,{score:8,period:payload.period});assert.equal(view.data.students.length,1);for(const field of ['evaluations','programs','doctors','invitations','activity'])assert.deepEqual(view.data[field],[]);assert.equal(JSON.stringify(view).includes('PRIVATE RUNTIME NOTE'),false);
  const guards=await database.prepare('SELECT count(*) AS n FROM transaction_guards').first();assert.equal(guards.n,0);
  console.log('workerd + local D1: health, owner activation, supervisor/resident onboarding, draft, stale-write rejection, publication and student projection passed.');
}finally{await runtime.dispose();}
