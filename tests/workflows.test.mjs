import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,makeEnv,Client,evaluationBody} from './helpers/fixture.mjs';
import {SqliteD1} from './helpers/sqlite-d1.mjs';

const post=(client,path,body={})=>client.request(path,{method:'POST',body});
const patch=(client,path,body)=>client.request(path,{method:'PATCH',body});
const success=response=>assert.ok([200,201].includes(response.status),response.raw);
const privateFields=['observations','goals','reviewers','reviewRequests'];
const dateAfterWeeks=(iso,weeks)=>new Date(Date.parse(iso.slice(0,10)+'T12:00:00Z')+weeks*7*86400000).toISOString().slice(0,10);
const profile=async(f)=>(await f.admin.workspace()).data.students.find(s=>s.id===f.resident.user.id);
const requestById=async(client,id)=>(await client.workspace()).data.reviewRequests.find(r=>r.id===id);
async function draftAndReview(f,reviewer,overrides={}){
  const body=await evaluationBody(f.manager,f.resident,overrides);
  const draft=await post(f.manager,'/api/evaluations/draft',body);success(draft);
  const sent=await post(f.manager,'/api/evaluation-reviews',{evaluationId:draft.data.evaluationId,reviewerId:reviewer.user.id,expectedVersion:draft.data.version});success(sent);
  return {body:{...body,expectedVersion:draft.data.version},draft:draft.data,reviewId:sent.data.id};
}

test('workflow migration upgrades existing resident and file records; health rejects the previous schema',async()=>{
  const db=new SqliteD1({migrate:false,seed:false});try{
    db.sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));db.seed();
    const timestamp='2026-01-01T12:00:00.000Z';
    db.sqlite.prepare("INSERT INTO users(id,email,name_en,name_ar,role,status,created_at,updated_at) VALUES('legacy','legacy@example.test','Legacy Resident','مقيم سابق','student','active',?,?)").run(timestamp,timestamp);
    db.sqlite.prepare("INSERT INTO resident_profiles(user_id,program_id,training_year,joined_at) VALUES('legacy','adult',2,?)").run(timestamp);
    db.sqlite.prepare("INSERT INTO file_log(id,resident_id,file_number,worked_date,created_at) VALUES('legacy-file','legacy','FILE-1','2026-01-01',?)").run(timestamp);
    const client=new Client(makeEnv(db));assert.equal((await client.request('/api/health')).status,503);
    db.sqlite.exec(readFileSync(new URL('../migrations/0002_review_workflows.sql',import.meta.url),'utf8'));
    assert.equal((await client.request('/api/health')).status,200);
    assert.equal(db.sqlite.prepare("SELECT review_interval_weeks FROM resident_profiles WHERE user_id='legacy'").get().review_interval_weeks,4);
    assert.throws(()=>db.sqlite.prepare("UPDATE resident_profiles SET review_interval_weeks=2.5 WHERE user_id='legacy'").run(),/CHECK constraint failed/);
    assert.equal(db.sqlite.prepare("SELECT review_interval_weeks FROM resident_profiles WHERE user_id='legacy'").get().review_interval_weeks,4);
    const file=db.sqlite.prepare("SELECT * FROM file_log WHERE id='legacy-file'").get();assert.equal(file.file_number,'FILE-1');assert.equal(file.version,1);
  }finally{db.close();}
});

test('only admin sets an integer review interval of 1–52 weeks; publication drives the next due date',async()=>{
  const f=await fixture();try{
    let resident=await profile(f);assert.equal(resident.reviewIntervalWeeks,4);assert.equal(resident.nextReviewDate,resident.joined);assert.equal(resident.reviewDue,true);
    const path=`/api/admin/students/${resident.id}`;
    for(const reviewIntervalWeeks of [0,53,1.5,'2',null])assert.equal((await patch(f.admin,path,{reviewIntervalWeeks})).status,422);
    assert.equal((await profile(f)).reviewIntervalWeeks,4);
    assert.equal((await patch(f.manager,path,{reviewIntervalWeeks:1})).status,403);
    assert.equal((await patch(f.resident,path,{reviewIntervalWeeks:1})).status,403);
    success(await patch(f.admin,path,{reviewIntervalWeeks:1}));
    const body=await evaluationBody(f.manager,f.resident);const publication=await post(f.manager,'/api/evaluations/publish',body);success(publication);
    const published=f.db.sqlite.prepare('SELECT published_at FROM evaluations WHERE id=?').get(publication.data.evaluationId).published_at;
    resident=await profile(f);assert.equal(resident.reviewIntervalWeeks,1);assert.equal(resident.nextReviewDate,dateAfterWeeks(published,1));assert.equal(resident.reviewDue,false);
    success(await patch(f.admin,path,{reviewIntervalWeeks:52}));resident=await profile(f);assert.equal(resident.nextReviewDate,dateAfterWeeks(published,52));
    const replacement=await post(f.manager,'/api/evaluations/publish',await evaluationBody(f.manager,f.resident,{basePublishedId:publication.data.evaluationId,scores:Array(10).fill(9)}));success(replacement);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM evaluations WHERE resident_id=?').get(resident.id).n,2);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM evaluation_heads WHERE resident_id=?').get(resident.id).n,1);
    assert.equal((await f.resident.workspace()).studentRating.score,9);
  }finally{f.close();}
});

test('observations and one open teaching goal are faculty-only, assignment-scoped and validated',async()=>{
  const f=await fixture();try{
    const outsider=await f.doctor('Dr. Other Faculty','other-teaching@example.test');const studentId=f.resident.user.id;
    const observation={studentId,text:{en:'PRIVATE OBSERVATION',ar:'ملاحظة خاصة'}};
    const goal={studentId,text:{en:'PRIVATE TEACHING GOAL',ar:'هدف تعليمي خاص'}};
    for(const client of [f.resident,outsider]){
      assert.equal((await post(client,'/api/observations',observation)).status,403);
      assert.equal((await post(client,'/api/goals',goal)).status,403);
    }
    for(const text of [{en:'',ar:''},{en:'x'.repeat(1501)},'not-an-object'])assert.equal((await post(f.manager,'/api/observations',{studentId,text})).status,422);
    success(await post(f.manager,'/api/observations',observation));
    const goals=await Promise.all([post(f.manager,'/api/goals',goal),post(f.admin,'/api/goals',goal)]);
    assert.equal(goals.filter(r=>[200,201].includes(r.status)).length,1);assert.equal(goals.filter(r=>r.status===409).length,1);
    const goalId=goals.find(r=>[200,201].includes(r.status)).data.id;
    assert.equal((await post(outsider,`/api/goals/${goalId}/review`)).status,403);
    assert.equal((await post(f.resident,`/api/goals/${goalId}/review`)).status,403);
    let staff=await f.manager.workspace();assert.equal(staff.data.observations[0].text.en,observation.text.en);assert.equal(staff.data.goals.filter(g=>!g.reviewedAt).length,1);
    success(await post(f.manager,`/api/goals/${goalId}/review`));
    assert.equal((await post(f.manager,`/api/goals/${goalId}/review`)).status,409);
    success(await post(f.admin,'/api/goals',{studentId,text:{en:'New goal after review',ar:''}}));
    staff=await f.manager.workspace();assert.equal(staff.data.goals.filter(g=>!g.reviewedAt).length,1);assert.equal(staff.data.goals.length,2);
    const student=await f.resident.workspace();for(const field of privateFields)assert.deepEqual(student.data[field],[]);
    assert.equal(JSON.stringify(student).includes('PRIVATE'),false);
    const other=await outsider.workspace();assert.deepEqual(other.data.observations,[]);assert.deepEqual(other.data.goals,[]);
  }finally{f.close();}
});

test('file corrections are own-record only, normalized, versioned, and require a fresh acknowledgment',async()=>{
  const f=await fixture();try{
    const day=(await f.resident.workspace()).today;success(await post(f.resident,'/api/files',{number:'PSYCH-١٢٣',date:day}));
    success(await post(f.resident,'/api/files',{number:'PSYCH-999',date:day}));
    let file=(await f.resident.workspace()).data.files.find(x=>x.number==='PSYCH-123');assert.equal(file.version,1);
    const peer=await f.student(f.manager,'Second Resident','file-peer@example.test');
    for(const actor of [peer,f.manager,f.admin])assert.ok([403,404].includes((await patch(actor,`/api/files/${file.id}`,{number:'PSYCH-124',expectedVersion:file.version})).status));
    assert.equal((await patch(f.resident,`/api/files/${file.id}`,{number:'psych-٩٩٩',expectedVersion:file.version})).status,409);
    assert.equal((await patch(f.resident,`/api/files/${file.id}`,{number:'bad !',expectedVersion:file.version})).status,422);
    success(await post(f.manager,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:file.version}));
    file=(await f.resident.workspace()).data.files.find(x=>x.id===file.id);assert.equal(file.reviewed,true);
    const reviewedVersion=file.version;
    success(await patch(f.resident,`/api/files/${file.id}`,{number:' psych-۱۲۴ ',expectedVersion:reviewedVersion}));
    file=(await f.resident.workspace()).data.files.find(x=>x.id===file.id);
    assert.equal(file.number,'PSYCH-124');assert.equal(file.version,reviewedVersion+1);assert.equal(file.reviewed,false);assert.equal(file.needsRecheck,true);assert.equal(file.corrections?.length||0,0);
    assert.equal((await post(f.manager,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:reviewedVersion})).status,409);
    assert.equal((await patch(f.resident,`/api/files/${file.id}`,{number:'PSYCH-125',expectedVersion:reviewedVersion})).status,409);
    const facultyFile=(await f.manager.workspace()).data.files.find(x=>x.id===file.id);assert.equal(facultyFile.corrections.length,1);assert.equal(facultyFile.corrections[0].previousNumber,'PSYCH-123');assert.equal(facultyFile.corrections[0].number,'PSYCH-124');assert.equal(facultyFile.corrections[0].wasReviewed,true);
    success(await post(f.manager,`/api/files/${file.id}/review`,{reviewed:true,expectedVersion:file.version}));
    const acknowledged=(await f.resident.workspace()).data.files.find(x=>x.id===file.id);assert.equal(acknowledged.reviewed,true);assert.equal(acknowledged.needsRecheck,false);
    assert.equal((await f.admin.workspace()).data.files.find(x=>x.id===file.id).corrections.length,1);
  }finally{f.close();}
});

test('a review referral shares only its frozen assessment with the selected active reviewer',async()=>{
  const f=await fixture();try{
    const reviewer=await f.doctor('Dr. Reviewing Faculty','reviewer@example.test','child');
    const stranger=await f.doctor('Dr. Unrelated Faculty','stranger@example.test');const studentId=f.resident.user.id;
    success(await post(f.manager,'/api/observations',{studentId,text:{en:'NEVER SHARE OBSERVATION',ar:''}}));
    success(await post(f.manager,'/api/goals',{studentId,text:{en:'NEVER SHARE GOAL',ar:''}}));
    success(await post(f.resident,'/api/files',{number:'PRIVATE-FILE-123',date:(await f.resident.workspace()).today}));
    const pending=await draftAndReview(f,reviewer,{note:{en:'INTENTIONALLY SHARED ASSESSMENT',ar:''}});
    const inbox=await reviewer.workspace();assert.equal(inbox.data.reviewRequests.length,1);assert.equal(inbox.data.reviewRequests[0].id,pending.reviewId);
    assert.equal(inbox.data.reviewRequests[0].snapshot.evaluation.note.en,'INTENTIONALLY SHARED ASSESSMENT');assert.equal(inbox.data.reviewRequests[0].snapshot.student.id,studentId);
    for(const field of ['students','evaluations','files','observations','goals'])assert.deepEqual(inbox.data[field],[]);
    const serialized=JSON.stringify(inbox);for(const text of ['NEVER SHARE OBSERVATION','NEVER SHARE GOAL','PRIVATE-FILE-123'])assert.equal(serialized.includes(text),false);
    assert.ok(inbox.data.reviewers.every(person=>!person.email));
    assert.deepEqual((await stranger.workspace()).data.reviewRequests,[]);
    assert.equal((await post(stranger,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved',comment:{en:'',ar:''}})).status,403);
    assert.equal((await post(f.resident,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved'})).status,403);
    assert.equal((await post(reviewer,'/api/evaluations/publish',pending.body)).status,403);
    assert.equal((await post(reviewer,'/api/evaluation-reviews',{evaluationId:pending.draft.evaluationId,reviewerId:stranger.user.id,expectedVersion:pending.body.expectedVersion})).status,403);
    const student=await f.resident.workspace();for(const field of privateFields)assert.deepEqual(student.data[field],[]);assert.equal(JSON.stringify(student).includes('INTENTIONALLY SHARED ASSESSMENT'),false);assert.equal(student.studentRating,null);
  }finally{f.close();}
});

test('review approval is explicit and tied to exact draft content; the author alone completes publication',async()=>{
  const f=await fixture();try{
    const reviewer=await f.doctor('Dr. Review Approval','approval@example.test');const pending=await draftAndReview(f,reviewer);
    assert.equal((await post(f.manager,'/api/evaluations/publish',pending.body)).status,409);
    assert.equal((await post(f.manager,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved'})).status,403);
    success(await post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved',comment:{en:'Reviewed and approved',ar:'تمت المراجعة'}}));
    assert.equal((await requestById(f.manager,pending.reviewId)).status,'approved');assert.equal((await f.resident.workspace()).studentRating,null);
    assert.equal((await post(f.manager,'/api/evaluations/publish',{...pending.body,scores:Array(10).fill(10)})).status,409);
    assert.equal((await post(f.manager,'/api/evaluations/publish',{...pending.body,note:{en:'Modified after approval',ar:''}})).status,409);
    success(await post(f.manager,'/api/evaluations/publish',pending.body));assert.equal((await f.resident.workspace()).studentRating.score,8);
    assert.equal((await post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'changes_requested',comment:{en:'Too late',ar:''}})).status,409);
  }finally{f.close();}
});

test('editing a reviewed draft invalidates the old approval without silently bypassing the review requirement',async()=>{
  const f=await fixture();try{
    const reviewer=await f.doctor('Dr. Review Revision','revision@example.test');const pending=await draftAndReview(f,reviewer);
    success(await post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved',comment:{en:'Approved first version',ar:''}}));
    const revised={...pending.body,scores:Array(10).fill(9),note:{en:'Revised observations',ar:''}};
    const saved=await post(f.manager,'/api/evaluations/draft',revised);success(saved);revised.expectedVersion=saved.data.version;
    assert.equal((await requestById(f.manager,pending.reviewId)).status,'superseded');
    assert.equal((await post(f.manager,'/api/evaluations/publish',revised)).status,409);
    const resent=await post(f.manager,'/api/evaluation-reviews',{evaluationId:pending.draft.evaluationId,reviewerId:reviewer.user.id,expectedVersion:revised.expectedVersion});success(resent);
    assert.equal((await post(f.manager,`/api/evaluation-reviews/${pending.reviewId}/cancel`)).status,409);
    success(await post(reviewer,`/api/evaluation-reviews/${resent.data.id}/respond`,{decision:'approved',comment:{en:'Approved changed scores',ar:''}}));
    success(await post(f.manager,'/api/evaluations/publish',revised));assert.equal((await f.resident.workspace()).studentRating.score,9);
    assert.equal((await requestById(f.manager,pending.reviewId)).snapshot.evaluation.scores[0],8);
  }finally{f.close();}
});

test('changes requested block publishing; explicit cancellation and fresh reviews are available',async()=>{
  const f=await fixture();try{
    const pending=await draftAndReview(f,f.admin);
    assert.equal((await post(f.manager,'/api/evaluation-reviews',{evaluationId:pending.draft.evaluationId,reviewerId:f.manager.user.id,expectedVersion:pending.body.expectedVersion})).status,422);
    assert.equal((await post(f.manager,'/api/evaluation-reviews',{evaluationId:pending.draft.evaluationId,reviewerId:f.resident.user.id,expectedVersion:pending.body.expectedVersion})).status,422);
    success(await post(f.admin,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'changes_requested',comment:{en:'Please clarify the rationale',ar:''}}));
    assert.equal((await requestById(f.manager,pending.reviewId)).status,'changes_requested');
    assert.equal((await post(f.manager,'/api/evaluations/publish',pending.body)).status,409);
    success(await post(f.manager,`/api/evaluation-reviews/${pending.reviewId}/cancel`));
    assert.equal((await requestById(f.manager,pending.reviewId)).status,'cancelled');
    success(await post(f.manager,'/api/evaluations/publish',pending.body));
  }finally{f.close();}
});

test('review responses reject stale resident, rubric and publication context',async()=>{
  for(const change of ['resident','rubric','publication']){
    const f=await fixture();try{
      const reviewer=await f.doctor('Dr. Context Reviewer','context@example.test');const pending=await draftAndReview(f,reviewer);
      if(change==='resident')success(await patch(f.admin,`/api/admin/students/${f.resident.user.id}`,{year:3}));
      if(change==='rubric'){
        const program=(await f.admin.workspace()).data.programs.find(p=>p.id==='adult');
        const response=await f.admin.request('/api/admin/programs/adult/questions',{method:'PUT',body:{expectedVersion:program.templateVersion,questions:program.questions.map((q,i)=>i===0?{...q,en:q.en+' revised'}:q)}});success(response);
      }
      if(change==='publication')success(await post(f.admin,'/api/evaluations/publish',await evaluationBody(f.admin,f.resident)));
      assert.equal((await post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved',comment:{en:'Old context',ar:''}})).status,409,change);
      assert.equal((await post(f.manager,'/api/evaluations/publish',pending.body)).status,409,change);
    }finally{f.close();}
  }
});

test('concurrent review decisions have one winner; an incomplete draft cannot be approved',async()=>{
  const f=await fixture();try{
    const reviewer=await f.doctor('Dr. Concurrent Reviewer','concurrent-review@example.test');const pending=await draftAndReview(f,reviewer,{scores:[null,...Array(9).fill(8)]});
    assert.equal((await post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'approved',comment:{en:'',ar:''}})).status,422);
    const answers=await Promise.all([
      post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'changes_requested',comment:{en:'Complete all categories',ar:''}}),
      post(reviewer,`/api/evaluation-reviews/${pending.reviewId}/respond`,{decision:'changes_requested',comment:{en:'Second response',ar:''}})
    ]);
    assert.deepEqual(answers.map(r=>r.status).sort((a,b)=>a-b),[200,409]);assert.equal((await requestById(f.manager,pending.reviewId)).status,'changes_requested');
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM transaction_guards').get().n,0);
  }finally{f.close();}
});

test('locking by logout revokes the original cookie rather than only clearing the interface',async()=>{
  const f=await fixture();try{
    const replay=new Client(f.env);replay.cookie=f.manager.cookie;replay.csrf=f.manager.csrf;
    success(await post(f.manager,'/api/auth/logout'));
    assert.equal((await replay.request('/api/workspace')).status,401);
    assert.equal((await post(replay,'/api/observations',{studentId:f.resident.user.id,text:{en:'Must not save',ar:''}})).status,401);
    assert.deepEqual((await replay.request('/api/session')).data,{authenticated:false});
  }finally{f.close();}
});
