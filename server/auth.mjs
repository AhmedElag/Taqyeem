import {all,one,run,statement,fail,now,after,id,token,sha,hmac,equal,normalizeEmail,config,limit,guard,batch,audit,json,publicUser,escapeHtml} from './core.mjs';

const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function sessionCookie(cfg,raw,maxAge=28800){return `${cfg.cookieName}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.dev?'':'; Secure'}`;}
export async function authentication(request,env,cfg){
  const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cfg.cookieName+'='));
  const raw=cookie?.slice(cfg.cookieName.length+1);if(!validToken(raw))return null;
  const found=await one(env.DB,`SELECT u.*,s.id AS session_id,s.expires_at,s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND s.auth_version=u.auth_version AND u.status='active'`,await sha(raw),now(),after(-30*60*1000));
  if(!found)return null;
  await run(env.DB,'UPDATE sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL',now(),found.session_id);
  return {user:found,raw,csrfToken:await hmac(env.SESSION_SECRET,'csrf|'+raw)};
}
export function requireCsrf(request,auth){if(!auth)fail(401,'sign_in_required','Please sign in.');if(!equal(request.headers.get('X-CSRF-Token'),auth.csrfToken))fail(403,'csrf_rejected','Your session could not validate this action. Refresh and try again.');}
async function makeSession(user){const raw=token();return {raw,id:id('session'),hash:await sha(raw),userId:user.id,version:user.auth_version,created:now(),expires:after(8*60*60*1000)};}
function insertSession(db,s){return statement(db,'INSERT INTO sessions(id,token_hash,user_id,auth_version,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',s.id,s.hash,s.userId,s.version,s.created,s.expires,s.created);}
export async function prepareInvitation(db,userId,programId,actor,cfg){
  const raw=token();const invitation={id:id('invite'),userId,programId:programId||null,hash:await sha(raw),createdAt:now(),expiresAt:after(7*24*60*60*1000),url:cfg.origin+'/#invite='+raw};
  return {record:invitation,insert:statement(db,"INSERT INTO invitations(id,user_id,token_hash,program_id,status,created_by,created_at,expires_at) VALUES(?,?,?,?,'pending',?,?,?)",invitation.id,userId,invitation.hash,programId||null,actor?.id||null,invitation.createdAt,invitation.expiresAt)};
}
export function invitationView(i,user,url){return {id:i.id,name:{en:user.name_en,ar:user.name_ar},email:user.email,role:user.role,programId:i.programId??i.program_id??null,status:i.status||'pending',createdAt:i.createdAt||i.created_at,expiresAt:i.expiresAt||i.expires_at,...(url?{url}:{})};}
export function revokeAccess(db,userId,time=now()){return [
  statement(db,'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',time,userId),
  statement(db,'UPDATE login_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',time,userId),
  statement(db,"UPDATE invitations SET status='revoked',revoked_at=? WHERE user_id=? AND status='pending'",time,userId)
];}
async function invitationRecord(db,raw){
  if(!validToken(raw))fail(400,'invalid_invitation','This invitation is invalid or has expired.');
  const row=await one(db,`SELECT i.*,u.email,u.name_en,u.name_ar,u.role,u.auth_version,u.status AS user_status,u.color FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.status='pending' AND i.expires_at>? AND u.status='pending'`,await sha(raw),now());
  if(!row)fail(410,'invalid_invitation','This invitation is invalid or has expired.');return row;
}
export async function handleAuth(path,request,body,env,cfg,auth,ctx){
  const db=env.DB;
  if(path==='/api/session'&&request.method==='GET')return json(auth?{authenticated:true,user:publicUser(auth.user),csrfToken:auth.csrfToken,period:cfg.period,today:cfg.today}:{authenticated:false});
  if(path==='/api/auth/recover-owner'&&request.method==='POST'){
    await limit(db,env,request,'owner-recovery',6,900);
    if(typeof env.BOOTSTRAP_TOKEN!=='string'||env.BOOTSTRAP_TOKEN.length<32)fail(503,'configuration_required','Configure a BOOTSTRAP_TOKEN of at least 32 characters.');
    if(!equal(request.headers.get('Authorization'),'Bearer '+env.BOOTSTRAP_TOKEN))fail(403,'bootstrap_denied','The bootstrap credential is invalid.');
    let email;try{email=normalizeEmail(env.ADMIN_EMAIL);}catch(_){fail(503,'configuration_required','Set ADMIN_EMAIL to the owner’s real email address before setup.');}
    const user=await one(db,"SELECT * FROM users WHERE role='admin' AND email=? AND status='pending'",email);
    if(!user)fail(409,'owner_recovery_unavailable','Recovery is only available for the configured owner before initial activation.');
    const invitation=await prepareInvitation(db,user.id,null,null,cfg);const g=guard(db,"EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND email=? AND status='pending' AND record_version=?)",user.id,email,user.record_version);
    await batch(db,[g.start,...revokeAccess(db,user.id),statement(db,'UPDATE users SET auth_version=auth_version+1,record_version=record_version+1,updated_at=? WHERE id=?',now(),user.id),invitation.insert,audit(db,null,'owner.activation_reissued',user.id),g.end],'The owner has already been activated or changed.');return json({ok:true,activationUrl:invitation.record.url});
  }
  if(path==='/api/auth/bootstrap'&&request.method==='POST'){
    await limit(db,env,request,'bootstrap',6,900);
    if(typeof env.BOOTSTRAP_TOKEN!=='string'||env.BOOTSTRAP_TOKEN.length<32)fail(503,'configuration_required','Configure a BOOTSTRAP_TOKEN of at least 32 characters.');
    if(!equal(request.headers.get('Authorization'), 'Bearer '+env.BOOTSTRAP_TOKEN))fail(403,'bootstrap_denied','The bootstrap credential is invalid.');
    let email;try{email=normalizeEmail(env.ADMIN_EMAIL);}catch(_){fail(503,'configuration_required','Set ADMIN_EMAIL to the owner’s real email address before setup.');}
    if(await one(db,'SELECT 1 FROM bootstrap_state WHERE singleton=1'))fail(409,'already_initialized','This application has already been initialized.');
    if(!(await one(db,'SELECT count(*) AS n FROM programs WHERE current_template_id IS NOT NULL')).n)fail(503,'setup_required','Apply the psychiatry starter setup before creating the owner.');
    const user={id:id('user'),email,name_en:'Dr. Khaled Abdelazim',name_ar:'د. خالد عبد العظيم',role:'admin',auth_version:1,color:'#155f53'};
    const invitation=await prepareInvitation(db,user.id,null,null,cfg);const g=guard(db,"NOT EXISTS(SELECT 1 FROM bootstrap_state) AND NOT EXISTS(SELECT 1 FROM users WHERE role='admin')");
    await batch(db,[g.start,statement(db,"INSERT INTO users(id,email,name_en,name_ar,role,status,created_at,updated_at) VALUES(?,?,?,?,'admin','pending',?,?)",user.id,email,user.name_en,user.name_ar,now(),now()),invitation.insert,statement(db,'INSERT INTO bootstrap_state VALUES(1,?)',now()),audit(db,null,'owner.initialized',user.id),g.end],'This application has already been initialized.');
    return json({ok:true,activationUrl:invitation.record.url},201);
  }
  if(path==='/api/auth/request-link'&&request.method==='POST'){
    await limit(db,env,request,'login-ip',20,900);const email=normalizeEmail(body.email);await limit(db,env,request,'login-email',3,900,email);
    if(!cfg.dev&&(!env.RESEND_API_KEY||!env.MAIL_FROM))fail(503,'mail_not_configured','Sign-in email is not configured. Contact the program administrator.');
    const user=await one(db,"SELECT * FROM users WHERE email=? AND status='active'",email);
    if(!user)return json({ok:true},202);
    const raw=token();const hash=await sha(raw);const url=cfg.origin+'/#login='+raw;
    await run(db,'INSERT INTO login_tokens(token_hash,user_id,auth_version,created_at,expires_at) VALUES(?,?,?,?,?)',hash,user.id,user.auth_version,now(),after(15*60*1000));
    if(cfg.dev)return json({ok:true,developmentLoginUrl:url},202);
    const send=async()=>{
      try{const ar=body.lang==='ar';const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':hash},body:JSON.stringify({from:env.MAIL_FROM,to:[user.email],subject:ar?'رابط تسجيل الدخول إلى تقييم':'Your Taqyeem sign-in link',text:(ar?'استخدم هذا الرابط لتسجيل الدخول. ينتهي خلال ١٥ دقيقة.\n':'Use this link to sign in. It expires in 15 minutes.\n')+url,html:`<div dir="${ar?'rtl':'ltr'}"><h2>Taqyeem · تقييم</h2><p>${escapeHtml(ar?user.name_ar:user.name_en)}</p><p><a href="${url}">${ar?'تسجيل الدخول':'Sign in to Taqyeem'}</a></p><p>${ar?'الرابط صالح لمرة واحدة وينتهي خلال ١٥ دقيقة.':'This single-use link expires in 15 minutes.'}</p></div>`})});if(!response.ok){await run(db,'UPDATE login_tokens SET used_at=? WHERE token_hash=?',now(),hash);console.error('Taqyeem sign-in email delivery failed.');}}
      catch(_){await run(db,'UPDATE login_tokens SET used_at=? WHERE token_hash=?',now(),hash);console.error('Taqyeem sign-in email delivery failed.');}
    };
    if(ctx?.waitUntil)ctx.waitUntil(send());else await send();return json({ok:true},202);
  }
  if(path==='/api/auth/invitation'&&request.method==='POST'){
    await limit(db,env,request,'invitation-check',60,900);const record=await invitationRecord(db,body.token);return json({name:{en:record.name_en,ar:record.name_ar},role:record.role,programId:record.program_id,expiresAt:record.expires_at});
  }
  if(path==='/api/auth/accept-invitation'&&request.method==='POST'){
    await limit(db,env,request,'token-consume',60,900);const record=await invitationRecord(db,body.token);const user={id:record.user_id,auth_version:record.auth_version};const s=await makeSession(user);
    const g=guard(db,"EXISTS(SELECT 1 FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.id=? AND i.status='pending' AND i.expires_at>? AND u.status='pending' AND u.auth_version=?)",record.id,now(),record.auth_version);
    await batch(db,[g.start,statement(db,"UPDATE users SET status='active',record_version=record_version+1,updated_at=? WHERE id=?",now(),user.id),statement(db,"UPDATE invitations SET status='accepted',accepted_at=? WHERE id=?",now(),record.id),insertSession(db,s),audit(db,user,'invitation.accepted',record.id),g.end],'This invitation has already been used or revoked.');
    return json({ok:true},200,{'Set-Cookie':sessionCookie(cfg,s.raw)});
  }
  if(path==='/api/auth/consume'&&request.method==='POST'){
    await limit(db,env,request,'token-consume',60,900);if(!validToken(body.token))fail(400,'invalid_login_link','This sign-in link is invalid or expired.');
    const hash=await sha(body.token);const record=await one(db,"SELECT t.*,u.id,u.auth_version FROM login_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>? AND t.auth_version=u.auth_version AND u.status='active'",hash,now());
    if(!record)fail(410,'invalid_login_link','This sign-in link is invalid or expired.');
    const s=await makeSession(record);const g=guard(db,"EXISTS(SELECT 1 FROM login_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>? AND t.auth_version=u.auth_version AND u.status='active')",hash,now());
    await batch(db,[g.start,statement(db,'UPDATE login_tokens SET used_at=? WHERE token_hash=?',now(),hash),insertSession(db,s),audit(db,record,'session.created',s.id),g.end],'This sign-in link has already been used.');
    return json({ok:true},200,{'Set-Cookie':sessionCookie(cfg,s.raw)});
  }
  if(path==='/api/auth/logout'&&request.method==='POST'){
    requireCsrf(request,auth);await run(db,'UPDATE sessions SET revoked_at=? WHERE id=?',now(),auth.user.session_id);return json({ok:true},200,{'Set-Cookie':sessionCookie(cfg,'',0)});
  }
  return null;
}
