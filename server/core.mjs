const encoder = new TextEncoder();
export class HttpError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
export function fail(status,code,message){throw new HttpError(status,code,message);}
export const id = prefix => prefix+'_'+crypto.randomUUID();
export const now = () => new Date().toISOString();
export const after = milliseconds => new Date(Date.now()+milliseconds).toISOString();
export function token(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function equal(a,b){a=String(a??'');b=String(b??'');let difference=a.length^b.length;const size=Math.max(a.length,b.length);for(let i=0;i<size;i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
export function normalizeEmail(value){const email=String(value??'').trim().toLowerCase();if(email.length>150||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(422,'invalid_email','Enter a valid email address.');return email;}
export function text(value,label,min=1,max=70){if(typeof value!=='string')fail(422,'invalid_field',label+' is required.');const result=value.trim();if(result.length<min||result.length>max)fail(422,'invalid_field',label+' has an invalid length.');return result;}
export function names(body,existing=null){const en=text(body.nameEn??existing?.name_en,'English name',2,70);const ar=text(body.nameAr??existing?.name_ar??en,'Arabic name',2,70);return {en,ar};}
export function integer(value,min,max,label){if(!Number.isInteger(value)||value<min||value>max)fail(422,'invalid_number',label+' is invalid.');return value;}
export function period(value){if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||value<'2020-01'||value>'2099-12')fail(422,'invalid_period','Choose a valid assessment month.');return value;}
export function isoDate(value){const date=typeof value==='string'?new Date(value+'T12:00:00Z'):null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!date||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)fail(422,'invalid_date','Choose a valid date.');return value;}
export function config(env){
  let origin;try{const url=new URL(env.APP_ORIGIN);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error();origin=url.origin;}catch(_){fail(503,'configuration_required','Set APP_ORIGIN to the deployed application origin.');}
  const hostname=new URL(origin).hostname;const local=['localhost','127.0.0.1','[::1]'].includes(hostname);const dev=String(env.DEVELOPMENT)==='true'&&local;
  if(!dev&&!origin.startsWith('https://'))fail(503,'configuration_required','Production requires an HTTPS application origin.');
  if(typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32)fail(503,'configuration_required','Configure a SESSION_SECRET of at least 32 characters.');
  const timezone=env.APP_TIMEZONE||'UTC';let today;try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=type=>parts.find(p=>p.type===type).value;today=part('year')+'-'+part('month')+'-'+part('day');}catch(_){fail(503,'configuration_required','APP_TIMEZONE must be a valid IANA time zone.');}
  return {origin,dev,timezone,today,period:today.slice(0,7),cookieName:dev?'taqyeem_dev_session':'__Host-taqyeem_session'};
}
export function assertOrigin(request,cfg){if(request.headers.get('Origin')!==cfg.origin)fail(403,'origin_rejected','This request did not originate from the application.');const site=request.headers.get('Sec-Fetch-Site');if(site&&site!=='same-origin'&&site!=='none')fail(403,'origin_rejected','Cross-site requests are not allowed.');}
export async function jsonBody(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'json_required','Use application/json.');
  if(Number(request.headers.get('Content-Length')||0)>65536)fail(413,'body_too_large','The request is too large.');
  const reader=request.body?.getReader();if(!reader)return {};const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();fail(413,'body_too_large','The request is too large.');}chunks.push(value);}
  if(!length)return {};const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch(_){fail(400,'invalid_json','The request contains invalid JSON.');}
  if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'invalid_json','A JSON object is required.');return body;
}
export function json(body,status=200,headers={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',...headers}});}
export function secureResponse(response,cfg=null){const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");if(cfg&&!cfg.dev)headers.set('Strict-Transport-Security','max-age=31536000');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
export const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
export const one=async(db,sql,...args)=>statement(db,sql,...args).first();
export const all=async(db,sql,...args)=>(await statement(db,sql,...args).all()).results;
export const run=(db,sql,...args)=>statement(db,sql,...args).run();
export function audit(db,actor,action,subject=null,metadata={}){return statement(db,'INSERT INTO audit_events(id,actor_id,action,subject_id,metadata_json,created_at) VALUES(?,?,?,?,?,?)',id('audit'),actor?.id||null,action,subject,JSON.stringify(metadata),now());}
export function guard(db,condition,...args){const guardId=id('guard');return {start:statement(db,'INSERT INTO transaction_guards(id,ok) VALUES(?,CASE WHEN '+condition+' THEN 1 ELSE 0 END)',guardId,...args),end:statement(db,'DELETE FROM transaction_guards WHERE id=?',guardId)};}
export function actorGuard(actor){return {sql:"EXISTS(SELECT 1 FROM users gu JOIN sessions gs ON gs.user_id=gu.id WHERE gu.id=? AND gu.status='active' AND gu.auth_version=? AND gs.id=? AND gs.auth_version=gu.auth_version AND gs.revoked_at IS NULL AND gs.expires_at>? AND gs.last_seen_at>?)",args:[actor.id,actor.auth_version,actor.session_id,now(),after(-30*60*1000)]};}
export async function batch(db,statements,message='This record changed. Refresh and try again.'){
  try{return await db.batch(statements);}catch(error){if(/constraint|immutable|guard|sole_admin|publication|unique/i.test(String(error)))fail(409,'conflict',message);throw error;}
}
export async function limit(db,env,request,namespace,maximum,windowSeconds,subject=''){
  const cfg=config(env);const bucket=await hmac(env.SESSION_SECRET,namespace+'|'+(subject||request.headers.get('CF-Connecting-IP')||'local'));
  const window=Math.floor(Date.now()/(windowSeconds*1000));
  const result=await one(db,'INSERT INTO rate_limit_buckets(bucket_key,window_start,hits) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET hits=CASE WHEN window_start=excluded.window_start THEN hits+1 ELSE 1 END, window_start=excluded.window_start RETURNING hits',bucket,window);
  if(result.hits>maximum)fail(429,'rate_limited','Too many attempts. Please try again later.');
}
export function publicUser(row){return {id:row.id,role:row.role,name:{en:row.name_en,ar:row.name_ar},email:row.email,initials:row.name_en.replace(/^Dr\.?\s*/i,'').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase(),color:row.color};}
export async function requireRole(actor,...roles){if(!actor)fail(401,'sign_in_required','Please sign in.');if(!roles.includes(actor.role))fail(403,'forbidden','This action is not available to your role.');}
export function activeScope(actor,alias='e',field='resident_id'){
  if(actor.role==='admin')return {sql:'1=1',args:[]};
  if(actor.role==='doctor')return {sql:`EXISTS(SELECT 1 FROM assignments sa JOIN users su ON su.id=sa.resident_id WHERE sa.resident_id=${alias}.${field} AND sa.doctor_id=? AND sa.ended_at IS NULL AND su.status!='inactive')`,args:[actor.id]};
  return {sql:`${alias}.${field}=?`,args:[actor.id]};
}
export async function residentAccess(db,actor,residentId){
  await requireRole(actor,'admin','doctor');
  const resident=await one(db,"SELECT u.*,r.program_id,r.training_year,a.doctor_id FROM users u JOIN resident_profiles r ON r.user_id=u.id LEFT JOIN assignments a ON a.resident_id=u.id AND a.ended_at IS NULL WHERE u.id=? AND u.role='student'",residentId);
  if(!resident||resident.status==='inactive'||(actor.role==='doctor'&&resident.doctor_id!==actor.id))fail(403,'resident_not_assigned','This resident is not currently assigned to you.');return resident;
}
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
