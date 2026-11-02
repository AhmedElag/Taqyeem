import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,makeEnv,Client,evaluationBody} from './helpers/fixture.mjs';
import {SqliteD1} from './helpers/sqlite-d1.mjs';
import worker from '../server/worker.mjs';
import {sha} from '../server/core.mjs';

// A test must explicitly install a local mock before exercising email delivery.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network access is disabled in backend tests');};
test.after(()=>{globalThis.fetch=nativeFetch;});
const count=(db,table)=>db.sqlite.prepare('SELECT count(*) AS n FROM '+table).get().n;
const post=(client,path,body,extra={})=>client.request(path,{method:'POST',body,...extra});

test('production setup contains only programs/questions; health validates migrations; bootstrap is single-use',async()=>{
  const db=new SqliteD1();const env=makeEnv(db);const client=new Client(env);
  try{
    db.seed();assert.equal(count(db,'programs'),3);assert.equal(count(db,'template_questions'),30);for(const table of ['users','sessions','invitations','evaluations','file_log'])assert.equal(count(db,table),0);
    assert.deepEqual((await client.request('/api/health')).data,{ok:true,app:'Taqyeem'});
    assert.equal((await post(client,'/api/auth/bootstrap',{}, {headers:{Authorization:'Bearer invalid'}})).status,403);
    const response=await post(client,'/api/auth/bootstrap',{}, {headers:{Authorization:'Bearer '+env.BOOTSTRAP_TOKEN}});assert.equal(response.status,201,response.raw);assert.equal(count(db,'users'),1);assert.equal(count(db,'invitations'),1);assert.equal(db.sqlite.prepare('SELECT role,status FROM users').get().status,'pending');
    const raw=new URL(response.data.activationUrl).hash.slice(8);const stored=db.sqlite.prepare('SELECT token_hash FROM invitations').get().token_hash;assert.equal(stored,await sha(raw));assert.notEqual(stored,raw);
    const preview=await post(client,'/api/auth/invitation',{token:raw});assert.equal(preview.data.role,'admin');assert.equal(preview.data.name.en,'Dr. Khaled Abdelazim');
    assert.equal((await post(client,'/api/auth/bootstrap',{}, {headers:{Authorization:'Bearer '+env.BOOTSTRAP_TOKEN}})).status,409);
    const empty=new SqliteD1({migrate:false});try{assert.equal((await new Client(makeEnv(empty)).request('/api/health')).status,503);}finally{empty.close();}
  }finally{db.close();}
});

test('owner activation recovery rotates only a pending owner and never resets an active owner',async()=>{
  const env=makeEnv();const client=new Client(env);try{
    const headers={Authorization:'Bearer '+env.BOOTSTRAP_TOKEN};const start=await post(client,'/api/auth/bootstrap',{}, {headers});const oldToken=new URL(start.data.activationUrl).hash.slice(8);
    assert.equal((await post(client,'/api/auth/recover-owner',{}, {headers:{Authorization:'Bearer wrong'}})).status,403);
    const response=await post(client,'/api/auth/recover-owner',{}, {headers});assert.equal(response.status,200,response.raw);assert.equal((await post(client,'/api/auth/invitation',{token:oldToken})).status,410);assert.equal(count(env.DB,'users'),1);
    await client.accept(response.data.activationUrl);assert.equal((await post(client,'/api/auth/recover-owner',{}, {headers})).status,409);assert.equal((await post(client,'/api/auth/bootstrap',{}, {headers})).status,409);
  }finally{env.DB.close();}
});

test('role and record authorization apply independently of UI; exact Origin and CSRF are required',async()=>{
  const f=await fixture();try{
    assert.equal((await new Client(f.env).request('/api/workspace')).status,401);
    assert.equal((await f.resident.request('/api/reports?period=2026-01')).status,403);
    assert.equal((await post(f.resident,'/api/admin/invitations',{})).status,403);
    assert.equal((await post(f.manager,'/api/admin/students',{})).status,403);
    assert.equal((await post(f.admin,'/api/admin/invitations',{}, {origin:false})).status,403);
    assert.equal((await post(f.admin,'/api/admin/invitations',{}, {headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await post(f.admin,'/api/admin/invitations',{}, {csrf:false})).status,403);
    assert.equal((await post(f.admin,'/api/admin/invitations',{}, {headers:{'X-CSRF-Token':f.resident.csrf}})).status,403);
    assert.equal((await post(f.admin,'/api/admin/invitations',{role:'admin'})).status,422);
    const second=await f.doctor('Dr. Other Manager','other@example.test');const peer=await f.student(second,'Other Resident','other-resident@example.test');
    const workspace=await f.manager.workspace();assert.deepEqual(workspace.data.students.map(s=>s.id),[f.resident.user.id]);
    const body=await evaluationBody(f.admin,peer);assert.equal((await post(f.manager,'/api/evaluations/publish',body)).status,403);
    assert.equal((await post(f.resident,'/api/evaluations/publish',body)).status,403);
    assert.equal((await post(f.manager,'/api/files',{number:'123',date:workspace.today})).status,403);
  }finally{f.close();}
});

test('single-use login links create bounded HttpOnly sessions; logout, idle and absolute expiry work',async()=>{
  const f=await fixture();try{
    const client=new Client(f.env);const unknown=await post(client,'/api/auth/request-link',{email:'unknown@example.test'});assert.equal(unknown.status,202);assert.deepEqual(unknown.data,{ok:true});
    const response=await post(client,'/api/auth/request-link',{email:f.manager.user.email});assert.equal(response.status,202);const token=new URL(response.data.developmentLoginUrl).hash.slice(7);
    const row=f.db.sqlite.prepare('SELECT token_hash,expires_at,created_at FROM login_tokens WHERE user_id=?').get(f.manager.user.id);assert.equal(row.token_hash,await sha(token));assert.equal(Date.parse(row.expires_at)-Date.parse(row.created_at),900000);
    const consumed=await post(client,'/api/auth/consume',{token});assert.equal(consumed.status,200,consumed.raw);assert.match(consumed.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict/);assert.equal((await post(new Client(f.env),'/api/auth/consume',{token})).status,410);await client.session();
    assert.equal((await post(client,'/api/auth/logout',{})).status,200);assert.equal((await client.request('/api/workspace')).status,401);
    f.db.sqlite.prepare("UPDATE sessions SET last_seen_at='2000-01-01T00:00:00.000Z' WHERE user_id=?").run(f.resident.user.id);assert.equal((await f.resident.request('/api/workspace')).status,401);
    f.db.sqlite.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id=?").run(f.manager.user.id);assert.equal((await f.manager.request('/api/workspace')).status,401);
  }finally{f.close();}
});

test('invitation creation, reissue, revocation, expiry and simultaneous activation preserve single-use semantics',async()=>{
  const f=await fixture();try{
    const payload={nameEn:'Dr. Pending',nameAr:'طبيب جديد',email:'pending@example.test',role:'doctor',programId:'adult'};const created=await post(f.admin,'/api/admin/invitations',payload);assert.equal(created.status,201);const original=created.data.invitation;const oldToken=new URL(original.url).hash.slice(8);
    const pending=(await f.admin.workspace()).data.doctors.find(d=>d.email===payload.email);assert.equal(pending.pending,true);
    const ineligible=await post(f.admin,'/api/admin/students',{nameEn:'No Supervisor',nameAr:'طبيب مقيم',email:'unassigned@example.test',programId:'adult',year:1,doctorId:pending.id});assert.equal(ineligible.status,422);assert.equal(f.db.sqlite.prepare('SELECT 1 FROM users WHERE email=?').get('unassigned@example.test'),undefined);
    const reissued=await post(f.admin,`/api/admin/invitations/${original.id}/reissue`,{});assert.equal(reissued.status,200);assert.equal((await post(new Client(f.env),'/api/auth/invitation',{token:oldToken})).status,410);const latest=reissued.data.invitation;const raw=new URL(latest.url).hash.slice(8);
    const outcomes=await Promise.all([post(new Client(f.env),'/api/auth/accept-invitation',{token:raw}),post(new Client(f.env),'/api/auth/accept-invitation',{token:raw})]);
    assert.equal(outcomes.filter(r=>r.status===200).length,1);
    // A replay seen during preflight is 410; a replay losing the atomic guard is 409.
    const rejected=outcomes.filter(r=>r.status!==200);assert.equal(rejected.length,1);assert.ok([409,410].includes(rejected[0].status),rejected[0].raw);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(pending.id).n,1);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) AS n FROM invitations WHERE user_id=? AND status='accepted'").get(pending.id).n,1);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE actor_id=? AND action='invitation.accepted'").get(pending.id).n,1);
    assert.equal(f.db.sqlite.prepare('SELECT status FROM users WHERE id=?').get(pending.id).status,'active');assert.equal(count(f.db,'transaction_guards'),0);
    const workspace=await f.admin.workspace();assert.ok(workspace.data.invitations.every(i=>!Object.hasOwn(i,'url')&&!Object.hasOwn(i,'token_hash')));
    const again=await post(f.admin,'/api/admin/invitations',{...payload,email:'expired@example.test'});const expired=new URL(again.data.invitation.url).hash.slice(8);f.db.sqlite.prepare("UPDATE invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(again.data.invitation.id);assert.equal((await post(new Client(f.env),'/api/auth/accept-invitation',{token:expired})).status,410);
    const revoked=await f.admin.request(`/api/admin/invitations/${again.data.invitation.id}`,{method:'DELETE',body:{}});assert.equal(revoked.status,200);assert.equal(f.db.sqlite.prepare('SELECT status FROM invitations WHERE id=?').get(again.data.invitation.id).status,'revoked');
  }finally{f.close();}
});

test('publication derives actor, all scores and mean; student JSON exposes only own overall rating and file log',async()=>{
  const f=await fixture();try{
    const other=await f.doctor('Dr. Peer Manager','peer-manager@example.test');const peer=await f.student(other,'PRIVATE PEER NAME','peer-resident@example.test');const body=await evaluationBody(f.manager,f.resident,{scores:[7,8,9,10,7,8,9,10,8,9],doctorId:other.user.id,note:{en:'SECRET SUPERVISOR FEEDBACK',ar:'ملاحظة سرية'}});
    const response=await post(f.manager,'/api/evaluations/publish',body);assert.equal(response.status,200,response.raw);const stored=f.db.sqlite.prepare('SELECT * FROM evaluations WHERE id=?').get(response.data.evaluationId);assert.equal(stored.doctor_id,f.manager.user.id);assert.equal(stored.overall_score,8.5);
    const own=await f.resident.workspace();assert.deepEqual(own.studentRating,{score:8.5,period:body.period});assert.deepEqual(own.data.students.map(s=>s.id),[f.resident.user.id]);for(const k of ['evaluations','doctors','programs','invitations','activity'])assert.deepEqual(own.data[k],[]);const serialized=JSON.stringify(own);for(const secret of ['SECRET SUPERVISOR FEEDBACK','Psychiatric interviewing','PRIVATE PEER NAME',peer.user.email])assert.equal(serialized.includes(secret),false);
    assert.equal((await other.workspace()).data.evaluations.length,0);const adminBody=await evaluationBody(f.admin,f.resident,{period:'2025-02'});assert.equal((await post(f.admin,'/api/evaluations/publish',adminBody)).status,200);const managerView=await f.manager.workspace();assert.ok(managerView.data.doctors.some(d=>d.id===f.admin.user.id&&d.role==='admin'));assert.equal(managerView.data.doctors.find(d=>d.role==='admin').email,'');
  }finally{f.close();}
});

test('invalid/incomplete scores do not write evaluations, children, heads or audit records',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const before=count(f.db,'audit_events');
    for(const scores of [[...body.scores.slice(1)],[null,...body.scores.slice(1)],[0,...body.scores.slice(1)],[11,...body.scores.slice(1)],[1.5,...body.scores.slice(1)],['8',...body.scores.slice(1)]])assert.equal((await post(f.manager,'/api/evaluations/publish',{...body,scores})).status,422);
    for(const table of ['evaluations','evaluation_questions','evaluation_notes','evaluation_heads'])assert.equal(count(f.db,table),0);assert.equal(count(f.db,'audit_events'),before);
    const saved=await post(f.manager,'/api/evaluations/draft',{...body,scores:body.scores.map(()=>null)});assert.equal(saved.status,200);assert.equal(count(f.db,'evaluation_heads'),0);assert.equal((await f.resident.workspace()).studentRating,null);
    assert.equal((await post(f.manager,'/api/evaluations/publish',{...body,expectedVersion:1,note:{en:'x'.repeat(3001)}})).status,422);assert.equal(f.db.sqlite.prepare("SELECT version FROM evaluations WHERE status='draft'").get().version,1);
  }finally{f.close();}
});

test('draft optimistic version checks prevent stale writes and roll back when concurrent change happens after read',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const first=await post(f.manager,'/api/evaluations/draft',body);assert.equal(first.status,200);const auditBefore=count(f.db,'audit_events');assert.equal((await post(f.manager,'/api/evaluations/draft',{...body,scores:Array(10).fill(3)})).status,409);
    f.db.beforeBatch=db=>db.sqlite.prepare('UPDATE evaluations SET version=version+1 WHERE id=?').run(first.data.evaluationId);
    const late=await post(f.manager,'/api/evaluations/draft',{...body,expectedVersion:1,scores:Array(10).fill(4)});assert.equal(late.status,409,late.raw);assert.equal(count(f.db,'audit_events'),auditBefore);assert.equal(count(f.db,'transaction_guards'),0);assert.equal(f.db.sqlite.prepare('SELECT score FROM evaluation_questions WHERE evaluation_id=? LIMIT 1').get(first.data.evaluationId).score,8);assert.equal(f.db.sqlite.prepare('SELECT version FROM evaluations WHERE id=?').get(first.data.evaluationId).version,2);
  }finally{f.close();}
});

test('simultaneous publication has one winner and corrections preserve immutable history',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const adminBody={...body,note:{en:'Owner correction'}};const outcomes=await Promise.all([post(f.manager,'/api/evaluations/publish',body),post(f.admin,'/api/evaluations/publish',adminBody)]);assert.deepEqual(outcomes.map(r=>r.status).sort((a,b)=>a-b),[200,409]);assert.equal(count(f.db,'evaluations'),1);assert.equal(count(f.db,'evaluation_heads'),1);
    const original=f.db.sqlite.prepare('SELECT * FROM evaluations').get();const correction=await post(f.admin,'/api/evaluations/publish',{...body,basePublishedId:original.id,scores:Array(10).fill(9)});assert.equal(correction.status,200,correction.raw);assert.equal(count(f.db,'evaluations'),2);assert.equal(f.db.sqlite.prepare('SELECT published_id FROM evaluation_heads').get().published_id,correction.data.evaluationId);assert.equal(f.db.sqlite.prepare('SELECT overall_score FROM evaluations WHERE id=?').get(original.id).overall_score,8);assert.equal((await f.resident.workspace()).studentRating.score,9);
    const stale=await post(f.manager,'/api/evaluations/publish',{...body,basePublishedId:original.id});assert.equal(stale.status,409);assert.equal(count(f.db,'evaluations'),2);assert.equal(count(f.db,'transaction_guards'),0);
  }finally{f.close();}
});

test('failed database writes roll back every publication component and audit entry',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const before=count(f.db,'audit_events');f.db.failStatement=(sql,args)=>sql.startsWith('INSERT INTO evaluation_questions')&&args[2]===5;const response=await post(f.manager,'/api/evaluations/publish',body);assert.equal(response.status,500);assert.equal(response.raw.includes('Injected'),false);
    for(const table of ['evaluations','evaluation_questions','evaluation_notes','evaluation_heads','transaction_guards'])assert.equal(count(f.db,table),0);assert.equal(count(f.db,'audit_events'),before);
  }finally{f.close();}
});

test('assignment changes block an in-flight assessment and preserve assignment history',async()=>{
  const f=await fixture();try{
    const replacement=await f.doctor('Dr. Replacement','replacement@example.test');const body=await evaluationBody(f.manager,f.resident);f.db.beforeBatch=db=>{db.sqlite.prepare('UPDATE assignments SET ended_at=? WHERE resident_id=? AND ended_at IS NULL').run(new Date().toISOString(),f.resident.user.id);db.sqlite.prepare('INSERT INTO assignments(id,resident_id,doctor_id,started_at,created_by) VALUES(?,?,?,?,?)').run('assignment_race',f.resident.user.id,replacement.user.id,new Date().toISOString(),f.admin.user.id);};
    const response=await post(f.manager,'/api/evaluations/publish',body);assert.equal(response.status,409);assert.equal(count(f.db,'evaluations'),0);assert.equal((await f.manager.workspace()).data.students.length,0);assert.equal((await replacement.workspace()).data.students.length,1);assert.equal(count(f.db,'assignments'),2);
  }finally{f.close();}
});

test('template revisions reject stale forms; publication snapshots retain original questions, program and year',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const published=await post(f.manager,'/api/evaluations/publish',body);assert.equal(published.status,200);const program=(await f.admin.workspace()).data.programs.find(p=>p.id==='adult');const revised=program.questions.map((q,i)=>({...q,...(i===0?{en:'A revised educational criterion',ar:'بند تعليمي معدل'}:{})}));
    const change=await f.admin.request('/api/admin/programs/adult/questions',{method:'PUT',body:{expectedVersion:program.templateVersion,questions:revised}});assert.equal(change.status,200,change.raw);assert.equal(change.data.templateVersion,2);assert.equal((await f.admin.request('/api/admin/programs/adult/questions',{method:'PUT',body:{expectedVersion:program.templateVersion,questions:revised}})).status,409);
    assert.equal((await post(f.manager,'/api/evaluations/draft',{...body,basePublishedId:published.data.evaluationId})).status,409);f.db.seed();assert.equal(f.db.sqlite.prepare("SELECT current_template_id FROM programs WHERE id='adult'").get().current_template_id,change.data.templateVersionId);
    const updated=await f.admin.request(`/api/admin/doctors/${f.manager.user.id}`,{method:'PATCH',body:{programs:['adult','child']}});assert.equal(updated.status,200,updated.raw);const moved=await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{programId:'child',year:3}});assert.equal(moved.status,200,moved.raw);
    const historical=(await f.admin.workspace()).data.evaluations.find(e=>e.id===published.data.evaluationId);assert.equal(historical.programId,'adult');assert.equal(historical.trainingYear,2);assert.equal(historical.questions[0].en,program.questions[0].en);assert.equal(count(f.db,'assignments'),2);
    const report=await f.admin.request(`/api/reports?period=${body.period}&programId=adult&format=json`);assert.equal(report.data.rows[0].programId,'adult');assert.equal(report.data.rows[0].trainingYear,2);assert.equal(report.data.rows[0].question,program.questions[0].en);
  }finally{f.close();}
});

test('file references normalize Arabic/Persian digits, deduplicate per resident, validate dates and enforce review assignment',async()=>{
  const f=await fixture();try{
    const today=(await f.resident.workspace()).today;assert.equal((await post(f.resident,'/api/files',{number:' psych-١٢٣/۴۵ ',date:today})).status,201);assert.equal((await post(f.resident,'/api/files',{number:'PSYCH-123/45',date:today})).status,409);
    for(const payload of [{number:'123',date:'2026-02-30'},{number:'123',date:'2099-01-01'},{number:'patient name',date:today},{number:'123',date:today,studentId:f.admin.user.id}])assert.equal((await post(f.resident,'/api/files',payload)).status,422);
    const file=(await f.resident.workspace()).data.files[0];assert.equal(file.number,'PSYCH-123/45');const outsider=await f.doctor('Dr. Outsider','outsider@example.test');assert.equal((await post(outsider,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:file.version})).status,403);assert.equal((await post(f.resident,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:file.version})).status,403);assert.equal((await post(f.manager,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:file.version})).status,200);assert.equal((await f.resident.workspace()).data.files[0].reviewed,true);
    const peer=await f.student(outsider,'Another Resident','another@example.test');assert.equal((await post(peer,'/api/files',{number:'PSYCH-123/45',date:today})).status,201);assert.equal((await f.manager.workspace()).data.files.length,1);
  }finally{f.close();}
});

test('CSV reports use current published snapshots, authorized filters, BOM and formula-safe bilingual values; feedback stays private',async()=>{
  const f=await fixture();try{
    assert.equal((await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{nameEn:'=DANGEROUS()'}})).status,200);const body=await evaluationBody(f.manager,f.resident);assert.equal((await post(f.manager,'/api/evaluations/publish',body)).status,200);await post(f.resident,'/api/files',{number:'100',date:(await f.resident.workspace()).today});
    const response=await f.admin.request(`/api/reports?period=${body.period}&programId=adult&studentId=${f.resident.user.id}&lang=en&format=csv`);assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/csv/);assert.ok(response.raw.includes('"\'=DANGEROUS()"'));assert.equal(response.raw.includes('Private educational feedback'),false);assert.equal(response.raw.trim().split('\r\n').length,11);assert.match(response.raw,/,"1","\d{4}-/);
    const native=await worker.fetch(new Request(f.env.APP_ORIGIN+`/api/reports?period=${body.period}`,{headers:{Cookie:f.admin.cookie}}),f.env,{});const bytes=new Uint8Array(await native.arrayBuffer());assert.deepEqual(Array.from(bytes.slice(0,3)),[0xef,0xbb,0xbf]);
    const arabic=await f.admin.request(`/api/reports?period=${body.period}&lang=ar`);assert.ok(arabic.raw.includes('الطبيب المقيم'));assert.ok(arabic.raw.includes('الدرجة الإجمالية'));
    assert.equal((await f.manager.request(`/api/reports?period=${body.period}`)).status,403);assert.equal((await f.admin.request(`/api/reports?period=${body.period}&programId=child&format=json`)).data.rows.length,0);assert.equal((await f.admin.request('/api/reports?period=garbage')).status,422);
  }finally{f.close();}
});

test('deactivation revokes sessions and outstanding login tokens; reactivation requires a new invitation',async()=>{
  const f=await fixture();try{
    const pending=await post(new Client(f.env),'/api/auth/request-link',{email:f.resident.user.email});const raw=new URL(pending.data.developmentLoginUrl).hash.slice(7);const deactivated=await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{active:false}});assert.equal(deactivated.status,200);assert.equal((await f.resident.request('/api/workspace')).status,401);assert.equal((await post(new Client(f.env),'/api/auth/consume',{token:raw})).status,410);assert.deepEqual((await post(new Client(f.env),'/api/auth/request-link',{email:f.resident.user.email})).data,{ok:true});
    const active=await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{active:true}});assert.equal(active.status,200);assert.ok(active.data.invitation.url);assert.equal((await f.resident.request('/api/workspace')).status,401);await f.resident.accept(active.data.invitation.url);assert.equal((await f.resident.request('/api/workspace')).status,200);
    assert.equal((await f.admin.request(`/api/admin/doctors/${f.admin.user.id}`,{method:'PATCH',body:{active:false}})).status,404);
  }finally{f.close();}
});

test('supervisor removal/program removal/email change requires reassignment; resident email change renews access',async()=>{
  const f=await fixture();try{
    for(const body of [{active:false},{programs:['child']},{email:'changed-supervisor@example.test'}])assert.equal((await f.admin.request(`/api/admin/doctors/${f.manager.user.id}`,{method:'PATCH',body})).status,409);
    const replacement=await f.doctor('Dr. New Supervisor','new-supervisor@example.test');assert.equal((await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{doctorId:replacement.user.id}})).status,200);assert.equal((await f.admin.request(`/api/admin/doctors/${f.manager.user.id}`,{method:'PATCH',body:{active:false}})).status,200);assert.equal((await f.manager.request('/api/workspace')).status,401);
    const updated=await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{email:'resident-new@example.test'}});assert.equal(updated.status,200);assert.ok(updated.data.invitation.url);assert.equal((await f.resident.request('/api/workspace')).status,401);await f.resident.accept(updated.data.invitation.url);assert.equal(f.resident.user.email,'resident-new@example.test');
  }finally{f.close();}
});

test('database constraints protect published snapshots, score bounds, templates and append-only audit',async()=>{
  const f=await fixture();try{
    const body=await evaluationBody(f.manager,f.resident);const result=await post(f.manager,'/api/evaluations/publish',body);assert.equal(result.status,200);const published=result.data.evaluationId;
    for(const [sql,args] of [
      ['UPDATE evaluations SET overall_score=4 WHERE id=?',[published]],['DELETE FROM evaluations WHERE id=?',[published]],['UPDATE evaluation_questions SET score=1 WHERE evaluation_id=?',[published]],['DELETE FROM evaluation_notes WHERE evaluation_id=?',[published]],['INSERT INTO evaluation_notes(evaluation_id,note_en) VALUES(?,?)',[published,'attempt']],['UPDATE template_questions SET label_en=? WHERE template_version_id=?',['Changed',body.templateVersionId]],['INSERT INTO template_questions(template_version_id,question_key,position,label_en,label_ar) VALUES(?,?,?,?,?)',[body.templateVersionId,'extra',10,'New','جديد']],['UPDATE audit_events SET action=?',['tampered']],['DELETE FROM audit_events',[]]
    ])assert.throws(()=>f.db.sqlite.prepare(sql).run(...args));
    const draft=await post(f.manager,'/api/evaluations/draft',{...body,period:'2025-01'});assert.equal(draft.status,200);assert.throws(()=>f.db.sqlite.prepare('UPDATE evaluation_questions SET score=11 WHERE evaluation_id=?').run(draft.data.evaluationId));assert.throws(()=>f.db.sqlite.prepare('UPDATE evaluation_questions SET evaluation_id=? WHERE evaluation_id=?').run(published,draft.data.evaluationId));assert.throws(()=>f.db.sqlite.prepare("INSERT INTO evaluations(id,resident_id,doctor_id,program_id,training_year,period,template_version_id,status,version,overall_score,created_at,published_at) VALUES(?,?,?,?,?,?,?,'published',1,8,?,?)").run('illegal',f.resident.user.id,f.manager.user.id,'adult',2,'2025-03',body.templateVersionId,new Date().toISOString(),new Date().toISOString()));
  }finally{f.close();}
});

test('login rate limits and production configuration prevent secret-bearing development links outside localhost',async()=>{
  const f=await fixture();try{
    const anonymous=new Client(f.env);for(let i=0;i<3;i++)assert.equal((await post(anonymous,'/api/auth/request-link',{email:'rate-test@example.test'})).status,202);assert.equal((await post(anonymous,'/api/auth/request-link',{email:'rate-test@example.test'})).status,429);
    const prodEnv={...f.env,APP_ORIGIN:'https://hospital.example.test',DEVELOPMENT:'true',RESEND_API_KEY:'mock-only',MAIL_FROM:'Taqyeem <signin@example.test>'};const client=new Client(prodEnv);let sent;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent={options,body:JSON.parse(options.body)};return new Response('{}',{status:200});};
    const response=await post(client,'/api/auth/request-link',{email:f.manager.user.email,lang:'ar'});assert.equal(response.status,202);assert.deepEqual(response.data,{ok:true});assert.ok(sent.options.signal);assert.match(sent.options.headers['Idempotency-Key'],/^[a-f0-9]{64}$/);const token=sent.body.text.match(/#login=([A-Za-z0-9_-]+)/)[1];const consumed=await post(client,'/api/auth/consume',{token});assert.equal(consumed.status,200);assert.match(consumed.headers.get('Set-Cookie'),/^__Host-taqyeem_session=/);assert.match(consumed.headers.get('Set-Cookie'),/; Secure/);assert.equal(consumed.headers.get('Referrer-Policy'),'no-referrer');assert.match(consumed.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.ok(consumed.headers.get('Strict-Transport-Security'));
    const noMail=new Client({...prodEnv,RESEND_API_KEY:''});assert.equal((await post(noMail,'/api/auth/request-link',{email:'no-mail@example.test'})).status,503);const bad=new Client({...f.env,APP_ORIGIN:'http://hospital.example.test'});assert.equal((await bad.request('/api/health')).status,503);
  }finally{globalThis.fetch=async()=>{throw new Error('Network access is disabled in backend tests');};f.close();}
});

test('training year changes reject stale assessment forms and preserve the saved draft until context is refreshed',async()=>{
  const f=await fixture();
  try{
    const original=await evaluationBody(f.manager,f.resident);
    const saved=await post(f.manager,'/api/evaluations/draft',original);
    assert.equal(saved.status,200,saved.raw);
    assert.equal(saved.data.version,1);

    const changed=await f.admin.request(`/api/admin/students/${f.resident.user.id}`,{method:'PATCH',body:{year:3}});
    assert.equal(changed.status,200,changed.raw);
    const auditCount=count(f.db,'audit_events');
    const stale={...original,expectedVersion:saved.data.version,scores:Array(original.scores.length).fill(10)};
    for(const path of ['/api/evaluations/draft','/api/evaluations/publish']){
      const rejected=await post(f.manager,path,stale);
      assert.equal(rejected.status,409,rejected.raw);
      assert.equal(rejected.data.error.code,'resident_changed');
    }

    const draft=f.db.sqlite.prepare('SELECT status,version,training_year FROM evaluations WHERE id=?').get(saved.data.evaluationId);
    assert.equal(draft.status,'draft');
    assert.equal(draft.version,1);
    assert.equal(draft.training_year,2);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM evaluation_questions WHERE evaluation_id=? AND score=8').get(saved.data.evaluationId).n,original.scores.length);
    assert.equal(count(f.db,'evaluation_heads'),0);
    assert.equal(count(f.db,'audit_events'),auditCount);
    assert.equal((await f.resident.workspace()).studentRating,null);

    const refreshed=await evaluationBody(f.manager,f.resident,{expectedVersion:saved.data.version});
    assert.ok(refreshed.expectedResidentVersion>original.expectedResidentVersion);
    const published=await post(f.manager,'/api/evaluations/publish',refreshed);
    assert.equal(published.status,200,published.raw);
    const result=f.db.sqlite.prepare('SELECT status,training_year,overall_score FROM evaluations WHERE id=?').get(published.data.evaluationId);
    assert.equal(result.status,'published');
    assert.equal(result.training_year,3);
    assert.equal(result.overall_score,8);
    assert.equal((await f.resident.workspace()).studentRating.score,8);
  }finally{f.close();}
});
