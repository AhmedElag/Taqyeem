import assert from 'node:assert/strict';
import worker from '../../server/worker.mjs';
import {SqliteD1} from './sqlite-d1.mjs';

export const makeEnv=(db=new SqliteD1())=>({DB:db,APP_ORIGIN:'http://localhost:8787',APP_TIMEZONE:'UTC',DEVELOPMENT:'true',SESSION_SECRET:'test-session-secret-is-long-and-test-only',BOOTSTRAP_TOKEN:'test-bootstrap-secret-long-and-test-only',ADMIN_EMAIL:'owner@example.test'});
export class Client {
  constructor(env){this.env=env;this.cookie='';this.csrf='';this.user=null;}
  async request(path,{method='GET',body,headers={},origin=true,csrf=true}={}){
    const h=new Headers(headers);if(this.cookie)h.set('Cookie',this.cookie);if(method!=='GET'){if(origin&&!h.has('Origin'))h.set('Origin',this.env.APP_ORIGIN);if(!h.has('Content-Type'))h.set('Content-Type','application/json');if(csrf&&this.csrf&&!h.has('X-CSRF-Token'))h.set('X-CSRF-Token',this.csrf);}
    const response=await worker.fetch(new Request(this.env.APP_ORIGIN+path,{method,headers:h,...(method==='GET'?{}:{body:JSON.stringify(body??{})})}),this.env,{});
    if(response.headers.has('Set-Cookie'))this.cookie=response.headers.get('Set-Cookie').split(';')[0];
    const raw=await response.text();let data;try{data=JSON.parse(raw);}catch(_){data=raw;}return {status:response.status,headers:response.headers,data,raw};
  }
  async session(){const response=await this.request('/api/session');assert.equal(response.status,200,response.raw);assert.equal(response.data.authenticated,true,response.raw);this.csrf=response.data.csrfToken;this.user=response.data.user;return response.data;}
  async accept(url){const token=new URL(url).hash.slice('#invite='.length);const response=await this.request('/api/auth/accept-invitation',{method:'POST',body:{token}});assert.equal(response.status,200,response.raw);await this.session();return token;}
  async workspace(){const response=await this.request('/api/workspace');assert.equal(response.status,200,response.raw);return response.data;}
}
export async function fixture(){
  const env=makeEnv();const admin=new Client(env);const bootstrap=await admin.request('/api/auth/bootstrap',{method:'POST',headers:{Authorization:'Bearer '+env.BOOTSTRAP_TOKEN}});assert.equal(bootstrap.status,201,bootstrap.raw);await admin.accept(bootstrap.data.activationUrl);
  async function doctor(name='Dr. Test Supervisor',email='supervisor@example.test',programId='adult'){
    const response=await admin.request('/api/admin/invitations',{method:'POST',body:{nameEn:name,nameAr:'الطبيب المشرف',email,programId,role:'doctor'}});assert.equal(response.status,201,response.raw);const client=new Client(env);await client.accept(response.data.invitation.url);return client;
  }
  async function student(supervisor,name='Test Resident',email='resident@example.test',programId='adult'){
    const response=await admin.request('/api/admin/students',{method:'POST',body:{nameEn:name,nameAr:'الطبيب المقيم',email,programId,year:2,doctorId:supervisor.user.id}});assert.equal(response.status,201,response.raw);const client=new Client(env);await client.accept(response.data.invitation.url);return client;
  }
  const manager=await doctor();const resident=await student(manager);
  const close=()=>env.DB.close();return {env,db:env.DB,admin,manager,resident,doctor,student,close};
}
export async function evaluationBody(actor,resident,overrides={}){
  const workspace=await actor.workspace();const profile=workspace.data.students.find(s=>s.id===resident.user.id);const program=workspace.data.programs.find(p=>p.id===profile.programId);return {studentId:resident.user.id,expectedResidentVersion:profile.recordVersion,period:workspace.period,templateVersionId:program.templateVersionId,scores:Array(program.questions.length).fill(8),note:{en:'Private educational feedback',ar:'ملاحظات تعليمية خاصة'},expectedVersion:0,basePublishedId:null,...overrides};
}
