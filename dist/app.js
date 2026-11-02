/* Taqyeem: English/Arabic psychiatry residency workspace. Explicit demo or authenticated live mode. */
(function () {
  'use strict';
  const LIVE = window.TAQYEEM_MODE === 'live';
  const STORE = 'taqyeem-psychiatry-demo-v2';
  let PERIOD = '2026-11';
  let PREVIOUS = '2026-10';
  let DEMO_DATE = '2026-11-01';
  const emptyWorkspace = () => ({version:2,students:[],doctors:[],programs:[],evaluations:[],files:[],invitations:[],activity:[],observations:[],goals:[],reviewers:[],reviewRequests:[]});
  let session = null;
  let studentRating = null;
  let liveBusy = false;
  const invitationUrls = new Map();
  const auth = {state:'loading',token:null,kind:null,invitation:null,error:'',email:'',developmentUrl:null};
  function captureAuthFragment(){
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (!fragment.has('login') && !fragment.has('invite')) return false;
    auth.kind = fragment.has('invite') ? 'invite' : 'login';
    auth.token = fragment.get(auth.kind);
    // Tokens live only in this tab's memory, never in history or browser storage.
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }
  if (LIVE) captureAuthFragment();
  let db = emptyWorkspace();
  if (!LIVE) {
    try { db = JSON.parse(localStorage.getItem(STORE)); } catch (_) {}
    if (!db || db.version !== 2 || !Array.isArray(db.students) || !Array.isArray(db.evaluations)) db = window.makeTaqyeemSeed();
    for (const e of db.evaluations) {const student=db.students.find(s=>s.id===e.studentId);if(!e.programId||!Number.isInteger(e.trainingYear))e.comparisonMetadataMissing=true;if(student&&!e.programId){e.programId=student.programId;e.trainingYear=student.year;}}
  }
  function normalizeDemoWorkflows(){
    for(const key of ['observations','goals','reviewers','reviewRequests'])if(!Array.isArray(db[key]))db[key]=[];
    for(const student of db.students){if(!Number.isInteger(student.reviewIntervalWeeks)||student.reviewIntervalWeeks<1||student.reviewIntervalWeeks>52)student.reviewIntervalWeeks=4;if(!student.recordVersion)student.recordVersion=1;}
    for(const file of db.files){file.version=Number.isInteger(file.version)?file.version:1;file.needsRecheck=!!file.needsRecheck;if(!Array.isArray(file.corrections))file.corrections=[];}
    for(const evaluation of db.evaluations)if(!Number.isInteger(evaluation.version))evaluation.version=1;
  }
  if(!LIVE)normalizeDemoWorkflows();
  const LOCK_KEY='taqyeem-screen-locked-'+(LIVE?'live':'demo');
  let initiallyLocked=false;try{initiallyLocked=sessionStorage.getItem(LOCK_KEY)==='1';}catch(_){}
  let lastInteraction=Date.now();
  let lockInFlight=false;
  let language = 'en';
  try { language = localStorage.getItem('taqyeem-language') === 'ar' ? 'ar' : 'en'; } catch (_) {}
  const ui = {role:'admin',page:'overview',lang:language,program:'all',search:'',status:'active',doctorId:'d1',studentId:'s1',questionProgram:'adult',reportProgram:'all',reportStudent:'all',reportPeriod:PERIOD,filesFilter:'all',mobileOpen:false,evalDraft:null,questionDraft:null,modal:null,overviewFilter:'all',dashboardProgram:'all',locked:initiallyLocked,lockStatus:'',lockPending:false};
  const icons = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    user:'<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    stethoscope:'<path d="M6 3H4v6a5 5 0 0 0 10 0V3h-2M9 14v2a5 5 0 0 0 10 0v-3"/><circle cx="19" cy="10" r="3"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m9 13 2 2 4-4"/>',
    sliders:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>',
    chart:'<path d="M3 3v18h18M7 16v-5m5 5V6m5 10v-8"/>',
    folder:'<path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2Z"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h6"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    arrowUp:'<path d="m6 14 5-5 4 4 6-6M16 7h5v5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v4"/>',
    shield:'<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    edit:'<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.4 7a8 8 0 0 1 13.2-2L20 7M4 17l1.4 2A8 8 0 0 0 18.6 17"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    printer:'<path d="M6 9V3h12v6M6 18H3V9h18v9h-3"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M17 11h.01"/>',
    book:'<path d="M12 5c-3-2-7-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Zm0 0v15"/>',
    sparkle:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM21 2v4m-2-2h4"/>',
    link:'<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    logout:'<path d="M9 5H3v14h6M9 12h12m-5-5 5 5-5 5"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>'
  };
  const icon = (key,size=17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]||icons.grid}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr = (en,ar) => ui.lang === 'ar' ? ar : en;
  const label = value => typeof value === 'object' && value ? (value[ui.lang] || value.en || value.ar || '') : String(value ?? '');
  const avg = values => {const valid=values.filter(v=>Number.isFinite(v));return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null;};
  const rating = evaluation => evaluation ? avg(evaluation.scores) : null;
  const fmt = value => value == null ? '—' : Number(value).toFixed(1);
  const byId = (collection,id) => db[collection].find(item=>item.id===id);
  const programName = id => label(byId('programs',id)?.name);
  const personName = (collection,id) => label((LIVE&&session?.user.id===id?session.user:byId(collection,id))?.name);
  const safeColor = color => /^#[0-9a-f]{6}$/i.test(color||'') ? color : '#668777';
  const dateLabel = (value,short=false) => {try{return new Intl.DateTimeFormat(ui.lang==='ar'?'ar-EG':'en-GB',{day:'numeric',month:short?'short':'long',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(new Date(value.length===10?value+'T12:00:00Z':value));}catch(_){return value;}};
  const periodLabel = period => {try{return new Intl.DateTimeFormat(ui.lang==='ar'?'ar-EG':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T12:00:00Z'));}catch(_){return period;}};
  const activeStudents = () => db.students.filter(s=>s.active);
  const assignedStudents = () => activeStudents().filter(s=>s.doctorId===ui.doctorId);
  const currentStudents = () => ui.role==='admin'?activeStudents():ui.role==='doctor'?assignedStudents():db.students.filter(s=>s.id===ui.studentId&&s.active);
  const canInspect = id => ui.role==='admin' || (ui.role==='doctor' && byId('students',id)?.doctorId===ui.doctorId && byId('students',id)?.active);
  const latest = (id,period=null,status='published') => db.evaluations.filter(e=>e.studentId===id && e.status===status && !e.superseded && (!period||e.period===period)).sort((a,b)=>b.period.localeCompare(a.period)||b.createdAt.localeCompare(a.createdAt))[0];
  const visibleFiles = () => db.files.filter(f=>currentStudents().some(s=>s.id===f.studentId));
  const uid = prefix => prefix+'-'+(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  function save(){if(LIVE)return;for(const request of db.reviewRequests||[])if(!request.publishedAt&&['pending','approved','changes_requested'].includes(request.status)&&!demoReferralCurrent(request))request.status='superseded';try{localStorage.setItem(STORE,JSON.stringify(db));}catch(_){toast(tr('Changes are available in this tab. Browser storage is unavailable.','التغييرات متاحة في هذه الصفحة. تخزين المتصفح غير متاح.'));}}
  function activity(type,en,ar){db.activity.unshift({id:uid('a'),type,text:{en,ar},at:now()});db.activity=db.activity.slice(0,60);}
  function avatar(person,size=''){return `<span class="avatar ${size}" style="background:${safeColor(person?.color)}18;color:${safeColor(person?.color)}">${esc(person?.initials||'DR')}</span>`;}
  function button(text,action,iconKey='',classes='',attrs=''){return `<button type="button" class="btn ${classes}" data-action="${action}" ${attrs}>${iconKey?icon(iconKey,15):''}${text}</button>`;}
  const pill = (text,kind='',dot=false) => `<span class="pill ${kind}">${dot?'<i class="dot"></i>':''}${esc(text)}</span>`;
  function brand(){return `<div class="brand"><div class="brand-symbol"><svg width="25" height="25" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M5 7h20M15 7v18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><div class="brand-name">${tr('taqyeem','تقييم')}</div><div class="brand-subtitle">${tr('Psychiatry','الطب النفسي')}</div></div></div>`;}
  function persona(){if(LIVE)return session?.user?{...session.user,active:true}:null;if(ui.role==='admin')return {id:'admin',role:'admin',active:true,name:{en:'Dr. Khaled Abdelazim',ar:'د. خالد عبد العظيم'},initials:'KA',color:'#155f53'};return byId(ui.role==='doctor'?'doctors':'students',ui.role==='doctor'?ui.doctorId:ui.studentId);}
  const roleName = role => role==='admin'?tr('Administrator','المسؤول'):role==='doctor'?tr('Supervising doctor','الطبيب المشرف'):tr('Student','الطالب');
  function navigation(){
    return ui.role==='admin'?[['overview','grid',tr('Dashboard','لوحة المتابعة')],['students','users',tr('Residents','المقيمون')],['files','folder',tr('File log','سجل الملفات')],['reports','chart',tr('Reports','التقارير')],['settings','sliders',tr('Settings','الإعدادات')]]:ui.role==='doctor'?[['overview','grid',tr('Overview','نظرة عامة')],['students','users',tr('My residents','المقيمون لديّ')],['files','folder',tr('File log','سجل الملفات')]]:[['student','grid',tr('My workspace','مساحتي')]];
  }
  function allowedPages(){return ui.role==='admin'?['overview','students','files','reports','settings','doctors','questions','access','evaluations','evaluate','reviews']:ui.role==='doctor'?['overview','students','files','evaluations','evaluate','reviews']:['student'];}
  function pageTitle(){return ({overview:ui.role==='admin'?tr('Dashboard','لوحة المتابعة'):tr('Overview','نظرة عامة'),students:tr('Residents','المقيمون'),files:tr('File log','سجل الملفات'),reports:tr('Reports','التقارير'),settings:tr('Settings','الإعدادات'),doctors:tr('Doctors','الأطباء'),questions:tr('Assessment categories','بنود التقييم'),access:tr('Invitations','الدعوات'),evaluations:tr('Evaluations','التقييمات'),evaluate:tr('Evaluation','التقييم'),reviews:tr('Review requests','طلبات المراجعة'),student:tr('My workspace','مساحتي')})[ui.page]||'';}
  function render(){
    if(ui.locked){renderLock();return;}
    if(LIVE && (!session?.authenticated || auth.token || auth.state==='error')){renderAuth();return;}
    document.body.classList.toggle('live-mode',LIVE);document.body.classList.remove('auth-mode');
    if(!allowedPages().includes(ui.page))ui.page=ui.role==='student'?'student':'overview';
    document.documentElement.lang=ui.lang;document.documentElement.dir=ui.lang==='ar'?'rtl':'ltr';
    document.title=tr('Taqyeem — Psychiatry Residency & Evaluation','تقييم — تدريب وتقييم الأطباء النفسيين المقيمين');
    const me=persona();const nav=navigation();
    const section=ui.page==='reviews'?'overview':['doctors','questions','access'].includes(ui.page)?'settings':['evaluations','evaluate'].includes(ui.page)?'students':ui.page;
    document.getElementById('app').innerHTML=`
      ${!LIVE?`<div class="demo-bar"><span class="demo-caption"><i class="demo-dot"></i>${tr('DEMO · Sample data','عرض تجريبي · بيانات وهمية')}</span><div class="role-switch" aria-label="${tr('Preview role','معاينة الدور')}">${['admin','doctor','student'].map(r=>`<button data-action="role" data-role="${r}" class="${ui.role===r?'active':''}" aria-pressed="${ui.role===r}">${r==='admin'?tr('Admin','المسؤول'):r==='doctor'?tr('Doctor','الطبيب'):tr('Student','الطالب')}</button>`).join('')}</div>${ui.role==='doctor'?`<select id="demo-doctor" class="demo-person-select" aria-label="${tr('Preview doctor','معاينة الطبيب')}">${db.doctors.filter(d=>d.active&&!d.pending&&d.role!=='admin').map(d=>`<option value="${esc(d.id)}" ${d.id===ui.doctorId?'selected':''}>${esc(label(d.name))}</option>`).join('')}</select>`:''}<button class="demo-reset" data-action="reset">${icon('refresh',12)}${tr('Reset','إعادة ضبط')}</button></div>`:''}
      <div class="mobile-scrim ${ui.mobileOpen?'open':''}" data-action="menu"></div>
      <aside class="sidebar ${ui.mobileOpen?'open':''}">${brand()}<nav class="nav" aria-label="${tr('Main navigation','القائمة الرئيسية')}">${nav.map(n=>`<button class="nav-item ${section===n[0]?'active':''}" data-action="nav" data-page="${n[0]}" ${section===n[0]?'aria-current="page"':''}>${icon(n[1],17)}${n[2]}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-user">${avatar(me,'small')}<div><div class="sidebar-user-name">${esc(label(me?.name))}</div><div class="sidebar-user-role">${roleName(ui.role)}</div></div></div></div></aside>
      <div class="shell"><header class="topbar"><div class="inline gap8"><button class="icon-btn mobile-menu" data-action="menu" aria-label="${tr('Open navigation','فتح القائمة')}">${icon('menu',20)}</button><div class="breadcrumb">${section==='settings'&&ui.page!=='settings'?`<button class="link-btn" data-action="nav" data-page="settings">${tr('Settings','الإعدادات')}</button><span>/</span>`:''}<span class="current">${pageTitle()}</span></div></div><div class="topbar-actions"><button class="language-switch" data-action="language" aria-label="${tr('Switch to Arabic','التبديل إلى الإنجليزية')}">${icon('globe',14)}${tr('العربية','English')}</button>${ui.role!=='student'?`<button class="icon-btn" data-action="activity" aria-label="${tr('Recent activity','النشاط الأخير')}">${icon('bell',16)}</button>`:''}<button class="icon-btn lock-button" data-action="lock-screen" aria-label="${tr('Lock screen','قفل الشاشة')}" title="${tr('Lock screen · automatically after 15 minutes of inactivity','قفل الشاشة · تلقائياً بعد ١٥ دقيقة من عدم النشاط')}">${icon('lock',16)}</button>${avatar(me,'small')}${LIVE?`<button class="icon-btn logout-button" data-action="logout" aria-label="${tr('Sign out','تسجيل الخروج')}" title="${tr('Sign out','تسجيل الخروج')}">${icon('logout',16)}</button>`:''}</div></header><main id="main" class="main">${renderPage()}</main></div>`;
    if(!ui.modal)document.getElementById('overlay-root').innerHTML='';
  }
  function renderPage(){
    const me=persona();
    if(ui.role!=='admin'&&!me?.active)return `<div class="card account-locked">${empty(tr('This demo account is inactive','هذا الحساب التجريبي غير نشط'),tr('Switch to Administrator to reactivate this account.','انتقل إلى دور المسؤول لإعادة تفعيل الحساب.'))}</div>`;
    const pages={overview:overview,students:studentsPage,doctors:doctorsPage,evaluations:evaluationsPage,files:filesPage,questions:questionsPage,reports:reportsPage,settings:settingsPage,access:accessPage,student:studentPage,evaluate:evaluatePage,reviews:reviewsPage};
    return (pages[ui.page]||overview)();
  }
  function heading(title,subtitle,actions='',classes=''){return `<div class="page-heading${classes?' '+esc(classes):''}"><div><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div>${actions?`<div class="page-heading-actions">${actions}</div>`:''}</div>`;}
  function empty(title,description,action=''){return `<div class="empty-state">${icon('folder',34)}<h3>${title}</h3><p>${description}</p>${action}</div>`;}
  function metric(title,value,unit,foot,iconKey,tone='',spark=false){return `<div class="metric"><div class="metric-top"><span>${title}</span><span class="metric-icon">${icon(iconKey,15)}</span></div><div class="metric-value mono">${value}<small>${unit}</small></div><div class="metric-bottom"><span class="${tone}">${foot}</span></div>${spark?'<svg class="sparkline" viewBox="0 0 70 28" fill="none" aria-hidden="true"><path d="M1 25 12 22 21 24 32 13 42 16 53 9 69 3V28H1Z" fill="#edf5ee"/><path d="M1 25 12 22 21 24 32 13 42 16 53 9 69 3" stroke="#8cbaa1" stroke-width="1.6"/></svg>':''}</div>`;}
  const actorId=()=>LIVE?session?.user?.id:(ui.role==='admin'?'admin':ui.role==='doctor'?ui.doctorId:ui.studentId);
  const facultyName=id=>id==='admin'?tr('Dr. Khaled Abdelazim','د. خالد عبد العظيم'):label((db.reviewers.find(d=>d.id===id)||db.doctors.find(d=>d.id===id)||{}).name);
  function faculty(){return LIVE?db.reviewers:[{id:'admin',role:'admin',name:{en:'Dr. Khaled Abdelazim',ar:'د. خالد عبد العظيم'}},...db.doctors.filter(d=>d.active&&!d.pending&&d.role!=='admin').map(d=>({...d,role:'doctor'}))];}
  const weeksLabel=n=>tr(`${n} ${n===1?'week':'weeks'}`,n===1?'أسبوع واحد':n===2?'أسبوعان':`${n} ${n<=10?'أسابيع':'أسبوعاً'}`);
  const everyWeeks=n=>tr('Every '+weeksLabel(n),n===1?'كل أسبوع':n===2?'كل أسبوعين':'كل '+weeksLabel(n));
  function nextReviewDate(student){
    if(LIVE&&/^\d{4}-\d{2}-\d{2}$/.test(student.nextReviewDate||''))return student.nextReviewDate;
    const last=latest(student.id);const base=last?.publishedAt||last?.createdAt;
    if(!base)return (student.joined||DEMO_DATE).slice(0,10);
    const date=new Date(base);if(Number.isNaN(date.getTime()))return DEMO_DATE;
    date.setUTCDate(date.getUTCDate()+(student.reviewIntervalWeeks||4)*7);return date.toISOString().slice(0,10);
  }
  function reviewDue(student){return !!student.active&&!student.pending&&(LIVE&&typeof student.reviewDue==='boolean'?student.reviewDue:nextReviewDate(student)<=DEMO_DATE);}
  function scheduleNote(student){return `<div class="review-schedule-note">${icon('calendar',14)}<span>${esc(everyWeeks(student.reviewIntervalWeeks||4))} · ${tr('Next review','المراجعة القادمة')} <bdi>${dateLabel(nextReviewDate(student))}</bdi></span>${reviewDue(student)?pill(tr('Due now','مستحق الآن'),'amber'):''}</div>`;}
  function newestReview(evaluationId){return db.reviewRequests.filter(r=>r.evaluationId===evaluationId).reverse().sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null;}
  function currentDraftReview(){
    const d=ui.evalDraft;if(!d)return null;const request=newestReview(d.evaluationId);
    return request&&request.fromDoctorId===actorId()&&request.status!=='cancelled'&&!request.publishedAt?request:null;
  }
  function draftFrozen(){return ['pending','approved','changes_requested'].includes(currentDraftReview()?.status);}
  function reviewStatusText(status){return ({pending:tr('Awaiting review','بانتظار المراجعة'),approved:tr('Approved for publication','معتمد للنشر'),changes_requested:tr('Changes requested','مطلوب تعديل'),cancelled:tr('Withdrawn','تم السحب'),superseded:tr('Updated draft · send again','مسودة محدّثة · أعد الإرسال')})[status]||status;}
  function visibleReviews(){const id=actorId();return ui.role==='student'?[]:db.reviewRequests.filter(r=>ui.role==='admin'||r.toDoctorId===id||r.fromDoctorId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  function reviewHub(){
    if(ui.role==='student')return '';
    const id=actorId();const records=visibleReviews();const incoming=records.filter(r=>r.toDoctorId===id&&r.status==='pending'&&!r.publishedAt).length;const outgoing=records.filter(r=>r.fromDoctorId===id&&!r.publishedAt&&['pending','approved','changes_requested','superseded'].includes(r.status)).length;
    return `<section class="card review-hub"><div><h2>${tr('Review requests','طلبات المراجعة')}</h2><p>${incoming?tr(`${incoming} waiting for your feedback`,`${incoming} بانتظار ملاحظاتك`):tr('Send an evaluation for a second opinion.','أرسل تقييماً للحصول على رأي آخر.')}${outgoing?` · ${outgoing} ${tr('sent','مرسلة')}`:''}</p></div><div class="review-hub-actions">${incoming?pill(String(incoming),'amber'):''}${button(tr('Open reviews','فتح المراجعات'),'nav','clipboard','small','data-page="reviews"')}</div></section>`;
  }
  function reviewsPage(){
    const records=visibleReviews();const id=actorId();
    const rows=records.map(r=>`<button class="review-request-row" data-action="review-request" data-id="${esc(r.id)}"><span class="file-icon">${icon(r.toDoctorId===id?'clipboard':'mail',18)}</span><span class="file-info"><strong>${esc(label(r.snapshot?.student?.name))}</strong><small>${r.toDoctorId===id?tr('From','من'):tr('To','إلى')} ${esc(facultyName(r.toDoctorId===id?r.fromDoctorId:r.toDoctorId))} · ${dateLabel(r.createdAt,true)}</small></span>${pill(r.publishedAt?tr('Published','منشور'):reviewStatusText(r.status),r.status==='pending'||r.status==='changes_requested'?'amber':r.status==='approved'?'':'gray')}${icon('chevron',15)}</button>`).join('');
    return heading(tr('Review requests','طلبات المراجعة'),tr('An opinion on a saved evaluation. The author publishes the final rating.','رأي في تقييم محفوظ. ينشر صاحب التقييم الدرجة النهائية.'),button(tr('Back to dashboard','العودة للوحة المتابعة'),'nav','arrow','','data-page="overview"'))+`<section class="card review-list">${rows||empty(tr('No review requests yet','لا توجد طلبات مراجعة بعد'),tr('Open an evaluation and choose Send for review.','افتح تقييماً واختر الإرسال للمراجعة.'))}</section>`;
  }
  function showReview(id){
    const request=visibleReviews().find(r=>r.id===id);if(!request)return;
    const snapshot=request.snapshot||{};const assessment=snapshot.evaluation||{};const student=snapshot.student||{};const canRespond=request.toDoctorId===actorId()&&request.status==='pending'&&!request.publishedAt;
    const complete=Array.isArray(assessment.scores)&&assessment.scores.length===(assessment.questions||[]).length&&assessment.scores.length>0&&assessment.scores.every(n=>Number.isInteger(n)&&n>=1&&n<=10);
    const body=`<div class="review-snapshot"><div class="spread mb20"><div><strong>${esc(label(student.name))}</strong><p class="subtle">${esc(label(student.programName))} · ${tr('Year','السنة')} ${esc(student.year)} · ${periodLabel(assessment.period)}</p></div>${pill(request.publishedAt?tr('Published','منشور'):reviewStatusText(request.status),request.status==='approved'?'':'amber')}</div>${(assessment.questions||[]).map((q,i)=>`<div class="category-detail"><span>${esc(label(q))}</span><strong>${assessment.scores?.[i]??'—'} / 10</strong></div>`).join('')}${label(assessment.note)?`<div class="private-note mt20"><strong>${tr('Shared assessment notes','ملاحظات التقييم المشتركة')}</strong>${esc(label(assessment.note))}</div>`:''}<p class="subtle mt20">${tr('Only this saved assessment is shared for review.','تتم مشاركة هذا التقييم المحفوظ فقط للمراجعة.')}</p>${label(request.comment)?`<div class="private-note mt20"><strong>${tr('Reviewer feedback','ملاحظات المراجع')}</strong>${esc(label(request.comment))}</div>`:''}</div>${canRespond?`<form data-form="review-response" data-id="${esc(id)}" id="review-response-form" class="mt20"><div class="form-field"><label for="review-decision">${tr('Your decision','قرارك')}</label><select id="review-decision" name="decision"><option value="approved" ${!complete?'disabled':''}>${tr('Approve for publication','اعتماد للنشر')}</option><option value="changes_requested" ${!complete?'selected':''}>${tr('Request changes','طلب تعديل')}</option></select>${!complete?`<small>${tr('Every category needs a score before approval.','تحتاج كل فئة إلى درجة قبل الاعتماد.')}</small>`:''}</div><div class="form-field mt20"><label for="review-comment">${tr('Feedback','الملاحظات')}</label><textarea id="review-comment" name="comment" maxlength="1500" rows="3" placeholder="${tr('Add feedback for the author…','أضف ملاحظات لصاحب التقييم…')}"></textarea></div><div class="form-error" role="alert"></div></form>`:''}`;
    const canCancel=(request.fromDoctorId===actorId()||ui.role==='admin')&&['pending','approved','changes_requested','superseded'].includes(request.status)&&!request.publishedAt;
    modal(tr('Review evaluation','مراجعة التقييم'),`${tr('From','من')} ${esc(facultyName(request.fromDoctorId))} · ${tr('To','إلى')} ${esc(facultyName(request.toDoctorId))}`,body,button(tr('Close','إغلاق'),'close')+(canCancel?button(tr('Withdraw request','سحب الطلب'),'cancel-review','close','','data-id="'+esc(id)+'"'):'')+(canRespond?`<button type="submit" form="review-response-form" class="btn primary">${icon('check',15)}${tr('Send feedback','إرسال الملاحظات')}</button>`:''),true);
  }
  function teachingPanel(studentId){
    if(!canInspect(studentId))return '';
    const observations=db.observations.filter(o=>o.studentId===studentId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const goals=db.goals.filter(g=>g.studentId===studentId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const goal=goals.find(g=>!g.reviewedAt);
    return `<details class="secondary-details teaching-panel"><summary>${icon('book',15)}${tr('Teaching notes','ملاحظات التدريب')} ${observations.length?pill(String(observations.length),'gray'):''}</summary><div class="details-content"><p class="subtle">${tr('Private to the supervising doctor and admin.','خاصة بالطبيب المشرف والمسؤول.')}</p><section class="teaching-goal mt20"><div class="spread"><h3>${tr('Current teaching goal','الهدف التدريبي الحالي')}</h3>${goal?button(tr('Mark reviewed','تمت المراجعة'),'review-goal','check','small','data-id="'+esc(goal.id)+'"'):button(tr('Add goal','إضافة هدف'),'add-goal','plus','small','data-id="'+esc(studentId)+'"')}</div>${goal?`<p>${esc(label(goal.text))}</p><small>${esc(facultyName(goal.doctorId))} · ${dateLabel(goal.createdAt,true)}</small>`:`<p class="subtle">${tr('One focus for the next review.','نقطة تركيز واحدة للمراجعة القادمة.')}</p>`}</section><div class="spread mt20"><h3>${tr('Quick observations','ملاحظات سريعة')}</h3>${button(tr('Quick note','ملاحظة سريعة'),'add-observation','plus','small','data-id="'+esc(studentId)+'"')}</div><div class="observation-list">${observations.slice(0,8).map(o=>`<article class="observation-item"><p>${esc(label(o.text))}</p><small>${esc(facultyName(o.doctorId))} · ${dateLabel(o.createdAt,true)}</small></article>`).join('')||`<p class="subtle mt20">${tr('Record a short teaching observation during the month.','سجّل ملاحظة تدريبية قصيرة خلال الشهر.')}</p>`}</div>${goals.some(g=>g.reviewedAt)?`<details class="secondary-details mt20"><summary>${tr('Reviewed goals','الأهداف التي تمت مراجعتها')}</summary><div class="details-content">${goals.filter(g=>g.reviewedAt).slice(0,5).map(g=>`<div class="observation-item"><p>${esc(label(g.text))}</p><small>${tr('Reviewed','تمت المراجعة')} · ${dateLabel(g.reviewedAt,true)}</small></div>`).join('')}</div></details>`:''}</div></details>`;
  }
  function teachingForm(kind,studentId){
    if(!canInspect(studentId))return;const student=byId('students',studentId);if(!student?.active||student.pending)return;
    const isGoal=kind==='goal';if(isGoal&&db.goals.some(g=>g.studentId===studentId&&!g.reviewedAt)){toast(tr('Review the current goal before adding another.','راجع الهدف الحالي قبل إضافة آخر.'));return;}
    modal(isGoal?tr('Add teaching goal','إضافة هدف تدريبي'):tr('Quick observation','ملاحظة سريعة'),esc(label(student.name)),`<form id="teaching-form" data-form="${kind}" data-id="${esc(studentId)}"><div class="form-field"><label for="teaching-text">${isGoal?tr('One focus for the next review','نقطة تركيز للمراجعة القادمة'):tr('What did you observe?','ما الذي لاحظته؟')}</label><textarea id="teaching-text" name="text" maxlength="1500" rows="4" required placeholder="${isGoal?tr('e.g. More structured case presentations','مثال: عرض الحالات بشكل أكثر تنظيماً'):tr('A short observation about the resident’s learning…','ملاحظة قصيرة عن تطور المقيم…')}"></textarea><small>${tr('Educational feedback only. No patient details.','ملاحظات تدريبية فقط. دون تفاصيل المرضى.')}</small></div><div class="form-error" role="alert"></div></form>`,button(tr('Cancel','إلغاء'),'close')+`<button type="submit" form="teaching-form" class="btn primary">${icon('check',15)}${tr('Save','حفظ')}</button>`);
  }
  function correctionForm(id){
    const file=byId('files',id);if(ui.role!=='student'||file?.studentId!==ui.studentId)return;
    modal(tr('Correct file number','تصحيح رقم الملف'),dateLabel(file.date,true),`<form id="correction-form" data-form="file-correction" data-id="${esc(id)}" data-version="${file.version||1}"><div class="form-field"><label for="corrected-number">${tr('File number','رقم الملف')}</label><input id="corrected-number" name="number" value="${esc(file.number)}" dir="ltr" maxlength="40" required autocomplete="off"></div>${file.reviewed||file.needsRecheck?`<p class="file-correction-note mt20">${tr('Your doctor will review the corrected number again.','سيراجع طبيبك الرقم المصحح مرة أخرى.')}</p>`:''}<div class="form-error" role="alert"></div></form>`,button(tr('Cancel','إلغاء'),'close')+`<button type="submit" form="correction-form" class="btn primary">${icon('check',15)}${tr('Save correction','حفظ التصحيح')}</button>`);
  }
  function sendReviewForm(){
    const draft=ui.evalDraft;if(!draft||!draft.evaluationId||!canInspect(draft.studentId))return;
    const choices=faculty().filter(d=>d.id!==actorId());
    modal(tr('Send for review','إرسال للمراجعة'),esc(label(byId('students',draft.studentId)?.name)),`<form id="send-review-form" data-form="send-review"><div class="form-field"><label for="reviewer-select">${tr('Doctor or administrator','الطبيب أو المسؤول')}</label><select id="reviewer-select" name="reviewerId" required><option value="">${tr('Choose a reviewer','اختر المراجع')}</option>${choices.map(d=>`<option value="${esc(d.id)}">${esc(label(d.name))}${d.role==='admin'?' · '+tr('Admin','المسؤول'):''}</option>`).join('')}</select></div><div class="info-box mt20">${icon('lock',16)}<span>${tr('Shares this saved evaluation and its private notes. You publish the final rating after review.','يشارك هذا التقييم المحفوظ وملاحظاته الخاصة. أنت تنشر الدرجة النهائية بعد المراجعة.')}</span></div><div class="form-error" role="alert"></div></form>`,button(tr('Cancel','إلغاء'),'close')+`<button type="submit" form="send-review-form" class="btn primary">${icon('mail',15)}${tr('Send for review','إرسال للمراجعة')}</button>`);
  }
  function draftReviewPanel(){
    const request=currentDraftReview();if(!request)return '';
    return `<section class="review-status mt20"><strong>${reviewStatusText(request.status)}</strong><p>${tr('Reviewer','المراجع')}: ${esc(facultyName(request.toDoctorId))}</p>${label(request.comment)?`<p>${esc(label(request.comment))}</p>`:''}<div class="inline wrap">${button(tr('View request','عرض الطلب'),'review-request','eye','small','data-id="'+esc(request.id)+'"')}${['pending','approved','changes_requested','superseded'].includes(request.status)?button(tr('Withdraw and edit','سحب الطلب والتعديل'),'cancel-review','edit','small','data-id="'+esc(request.id)+'"'):''}</div></section>`;
  }

  function dashboardGreeting(){
    const hour=new Date().getHours();
    const greeting=hour<12?tr('Good morning','صباح الخير'):hour<18?tr('Good afternoon','مساء الخير'):tr('Good evening','مساء الخير');
    let name=tr('Dr. Khaled','د. خالد');
    if(ui.role==='doctor'){
      const profileName=persona()?.name;
      const names=profileName&&typeof profileName==='object'?[profileName[ui.lang],profileName.en,profileName.ar]:[profileName];
      const rawName=names.map(value=>String(value??'').trim()).find(Boolean)||'';
      const bareName=rawName.replace(/^(?:dr(?:\.|\s+)|doctor\s+|د\.\s*|د\s+|(?:ال)?دكتور(?:ة)?\s+)\s*/iu,'').trim();
      name=bareName?tr('Dr. '+bareName,'د. '+bareName):'';
    }
    return greeting+(name?tr(', ','، ')+'<bdi>'+esc(name)+'</bdi>':'');
  }
  function dashboardMetric(title,value,unit,foot,iconKey,page,action='nav',attrs=''){
    return `<button class="card admin-metric" data-action="${action}" ${page?`data-page="${page}"`:''} ${attrs}><span class="admin-metric-label">${esc(title)}${icon(iconKey,18)}</span><span class="admin-metric-value"><strong>${esc(value)}</strong>${unit?`<small>${esc(unit)}</small>`:''}</span><span class="admin-metric-foot">${esc(foot)}</span></button>`;
  }
  function comparablePrevious(evaluation,studentId){
    const prior=latest(studentId,PREVIOUS);
    if(!prior||prior.comparisonMetadataMissing||evaluation.comparisonMetadataMissing||!prior.programId||!evaluation.programId||!Number.isInteger(prior.trainingYear)||!Number.isInteger(evaluation.trainingYear)||prior.programId!==evaluation.programId||prior.trainingYear!==evaluation.trainingYear)return null;
    if(prior.templateVersionId&&evaluation.templateVersionId)return prior.templateVersionId===evaluation.templateVersionId?prior:null;
    const signature=e=>JSON.stringify((e.questions||[]).map(q=>[q.id,q.en,q.ar]));
    return evaluation.questions?.length&&signature(prior)===signature(evaluation)?prior:null;
  }
  function adminRatingBody(students){
    const rows=students.map(student=>({student,evaluation:latest(student.id,PERIOD)})).filter(row=>row.evaluation&&Number.isFinite(rating(row.evaluation))&&(ui.dashboardProgram==='all'||row.evaluation.programId===ui.dashboardProgram));
    if(!rows.length)return `<div class="admin-chart-empty">${icon('chart',32)}<p>${tr('Published ratings will appear here.','ستظهر التقييمات المنشورة هنا.')}</p></div>`;
    const paired=rows.map(row=>({current:rating(row.evaluation),prior:rating(comparablePrevious(row.evaluation,row.student.id))})).filter(row=>row.prior!=null);
    const mean=avg(rows.map(row=>rating(row.evaluation)));const change=avg(paired.map(row=>row.current-row.prior));
    const visible=rows.slice(0,16);const step=458/visible.length;const width=Math.min(29,step*.55);
    return `<div class="admin-chart-summary"><div><strong>${fmt(mean)}</strong><small>/ 10</small></div>${change!=null?`<span class="delta" title="${tr('Change for residents with the same program, training year and assessment categories in both months.','التغير لدى المقيمين في البرنامج والسنة التدريبية وبنود التقييم نفسها في الشهرين.')}" aria-label="${esc(tr(`${change>=0?'+':''}${change.toFixed(1)} points across ${paired.length} matched residents`,`${change>=0?'+':''}${change.toFixed(1)} نقطة لدى ${paired.length} من المقيمين ذوي التقييمات المتطابقة`))}">${change>=0?'+':''}${change.toFixed(1)} <small>${tr('matched residents','للتقييمات المتطابقة')}</small></span>`:''}</div><div class="admin-chart-scroll"><svg class="admin-chart-svg" viewBox="0 0 520 210" role="img" aria-labelledby="dashboard-chart-title dashboard-chart-description" dir="ltr"><title id="dashboard-chart-title">${tr('Published ratings by resident','التقييمات المنشورة لكل مقيم')}</title><desc id="dashboard-chart-description">${tr('Bars show current overall ratings. Gray markers show the previous month when the program, training year and assessment categories match.','الأعمدة تعرض التقييمات الإجمالية الحالية. والعلامات الرمادية تعرض الشهر السابق عند تطابق البرنامج والسنة التدريبية وبنود التقييم.')}</desc>${[0,2,4,6,8,10].map(n=>`<line x1="33" y1="${178-n*14.5}" x2="512" y2="${178-n*14.5}" stroke="#e7eeea" stroke-dasharray="3 5"/><text x="18" y="${182-n*14.5}" text-anchor="middle" font-size="10" fill="#81958a">${n}</text>`).join('')}${visible.map((row,i)=>{const value=rating(row.evaluation);const prior=rating(comparablePrevious(row.evaluation,row.student.id));const x=42+step*i+(step-width)/2;const name=label(row.student.name);return `<rect x="${x}" y="${178-value*14.5}" width="${width}" height="${value*14.5}" rx="4" fill="${i%3===0?'#397f66':'#a4cbb6'}"><title>${esc(name)} · ${periodLabel(PERIOD)}: ${fmt(value)} / 10</title></rect>${prior!=null?`<line x1="${x-4}" y1="${178-prior*14.5}" x2="${x+width+4}" y2="${178-prior*14.5}" stroke="#91a0a7" stroke-width="3" stroke-linecap="round"><title>${esc(name)} · ${periodLabel(PREVIOUS)}: ${fmt(prior)} / 10</title></line>`:''}<text x="${x+width/2}" y="200" text-anchor="middle" font-size="9" fill="#73897d">${esc(name.trim().split(/\s+/)[0])}</text>`;}).join('')}</svg></div><div class="chart-legend"><span><i class="legend-line"></i>${periodLabel(PERIOD)}</span><span><i class="legend-line prev"></i>${periodLabel(PREVIOUS)}</span></div>${rows.length>16?`<p class="admin-chart-limit">${tr(`Showing 16 of ${rows.length} residents`, `عرض 16 من ${rows.length} مقيماً`)} · <button class="link-btn" data-action="nav" data-page="reports">${tr('Reports','التقارير')}</button></p>`:''}`;
  }
  function adminProgramProgress(students){
    const programs=db.programs.filter(p=>students.some(s=>s.programId===p.id));
    return `<section class="card admin-programs"><div class="card-header"><div><h2>${tr('Program progress','تقدم البرامج')}</h2><p>${tr('Published this month','المنشور هذا الشهر')}</p></div>${icon('book',18)}</div><div class="admin-program-list">${programs.map(p=>{const list=students.filter(s=>s.programId===p.id);const done=list.filter(s=>latest(s.id,PERIOD)).length;const progress=Math.round(done/list.length*100);return `<button class="admin-program-row" data-action="dashboard-program" data-program="${esc(p.id)}"><span class="admin-program-top"><span><i class="color-dot" style="background:${safeColor(p.color)}"></i>${esc(label(p.name))}</span><strong dir="ltr">${done} / ${list.length}</strong></span><span class="progress-track"><span style="width:${progress}%;background:${safeColor(p.color)}"></span></span><span class="admin-program-bottom"><span>${list.length} ${tr('residents','مقيمين')}</span><span dir="ltr">${progress}%</span></span></button>`;}).join('')||`<p class="admin-chart-empty">${tr('Add a resident to see program progress.','أضف مقيماً لعرض تقدم البرامج.')}</p>`}</div></section>`;
  }
  function adminResidentQueue(students){
    const pending=students.filter(reviewDue);const done=students.length-pending.length;const filter=ui.overviewFilter||'all';
    const list=students.filter(s=>filter==='all'||(filter==='pending'?reviewDue(s):!reviewDue(s)));
    return `<section class="card overview-workspace" id="admin-residents"><div class="card-header overview-toolbar"><h2>${tr('Your residents, at a glance','نظرة على المقيمين')}</h2><button class="link-btn" data-action="dashboard-residents">${tr('View all residents','عرض جميع المقيمين')}${icon('arrow',13)}</button></div><div class="table-toolbar"><div class="tabs"><button class="tab ${filter==='all'?'active':''}" data-action="overview-filter" data-filter="all">${tr('All residents','جميع المقيمين')}<span>${students.length}</span></button><button class="tab ${filter==='pending'?'active':''}" data-action="overview-filter" data-filter="pending">${tr('Due for review','مستحق للمراجعة')}<span>${pending.length}</span></button><button class="tab ${filter==='complete'?'active':''}" data-action="overview-filter" data-filter="complete">${tr('Scheduled','مجدول')}<span>${done}</span></button></div><label class="search">${icon('search',14)}<input id="overview-search" aria-label="${tr('Search residents','البحث عن مقيم')}" placeholder="${tr('Search…','بحث…')}" /></label></div><div id="overview-table">${list.length?residentTable(list.slice(0,5)):empty(filter==='pending'?tr('All caught up','اكتملت التقييمات'):tr('No residents yet','لا يوجد مقيمون بعد'),'')}</div></section>`;
  }
  function adminDashboard(){
    const students=currentStudents();const published=students.map(s=>latest(s.id,PERIOD)).filter(Boolean);const done=published.length;const pending=students.filter(reviewDue).length;const completion=students.length?Math.round(done/students.length*100):0;
    const files=visibleFiles();const unreviewed=files.filter(f=>!f.reviewed).length;const programs=db.programs.filter(p=>students.some(s=>s.programId===p.id));
    const doctors=db.doctors.filter(d=>d.active&&!d.pending&&d.role!=='admin').length;
    const activities=[...db.activity].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,4);
    return `<div class="admin-dashboard">${heading(tr('Residency dashboard','لوحة متابعة التدريب'),periodLabel(PERIOD),button(tr('Reports','التقارير'),'nav','chart','','data-page="reports"')+button(tr('Add resident','إضافة مقيم'),'add-student','plus','primary'),'admin-dashboard-heading')}
      <section class="admin-welcome"><div class="admin-welcome-copy"><span class="eyebrow">${tr('YOUR DEPARTMENT, AT A GLANCE','نظرة متكاملة على القسم')}</span><h2>${dashboardGreeting()}</h2><p>${students.length?(pending?tr(`${pending} residents are due for review.`,`${pending} مقيمين مستحقين للمراجعة.`):tr('No resident reviews are due today.','لا توجد مراجعات مستحقة للمقيمين اليوم.')):tr('Add your first resident to get started.','أضف أول مقيم للبدء.')}</p>${button(students.length?(pending?tr('Review due residents','مراجعة المقيمين المستحقين'):tr('View evaluations','عرض التقييمات')):tr('Add resident','إضافة مقيم'),students.length?(pending?'dashboard-pending':'pending-evaluations'):'add-student',students.length?'arrow':'plus','welcome-action')}</div><div class="admin-completion"><div class="admin-completion-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="completion-track" cx="60" cy="60" r="51" fill="none" stroke-width="7"/><circle class="completion-value" cx="60" cy="60" r="51" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${2*Math.PI*51}" stroke-dashoffset="${2*Math.PI*51*(1-completion/100)}" transform="rotate(-90 60 60)"/></svg><div class="admin-completion-value"><strong dir="ltr">${completion}%</strong><small>${tr('COMPLETE','مكتمل')}</small></div></div><div class="completion-caption"><bdi>${done} / ${students.length}</bdi> ${tr('published','منشور')}</div></div></section>
      <div class="admin-metrics">${dashboardMetric(tr('Residents','المقيمون'),students.length,'',tr(`Across ${programs.length} programs`,`ضمن ${programs.length} برامج`),'users','students','dashboard-residents')}${dashboardMetric(tr('Published evaluations','التقييمات المنشورة'),done,'/ '+students.length,tr('This evaluation cycle','دورة التقييم الحالية'),'clipboard','evaluations')}${dashboardMetric(tr('Average rating','متوسط التقييم'),fmt(avg(published.map(rating))),'/ 10',tr('Published ratings only','التقييمات المنشورة فقط'),'star','reports','dashboard-reports')}${dashboardMetric(tr('Files submitted','الملفات المسجلة'),files.length,'',tr(`${unreviewed} awaiting review`,`${unreviewed} بانتظار المراجعة`),'folder','', 'dashboard-files','data-filter="all"')}</div>
      ${reviewHub()}<div class="admin-insights"><section class="card admin-ratings"><div class="card-header"><div><h2>${tr('Published rating overview','نظرة على التقييمات المنشورة')}</h2><p>${tr('By resident · current and previous month','حسب المقيم · الشهر الحالي والسابق')}</p></div><select id="dashboard-chart-program" class="input" aria-label="${tr('Rating chart program','برنامج مخطط التقييمات')}">${programOptions(ui.dashboardProgram)}</select></div><div id="dashboard-chart-body">${adminRatingBody(students)}</div></section>${adminProgramProgress(students)}</div>
      ${adminResidentQueue(students)}
      <div class="admin-secondary"><section class="card admin-quick-actions"><div class="card-header"><h2>${tr('Manage your department','إدارة القسم')}</h2></div><div class="admin-action-grid"><button class="admin-action" data-action="nav" data-page="doctors">${icon('stethoscope',20)}<strong>${tr('Doctors','الأطباء')}</strong><small>${doctors} ${tr('active supervisors','مشرفين نشطين')}</small></button><button class="admin-action" data-action="nav" data-page="questions">${icon('sliders',20)}<strong>${tr('Assessment categories','بنود التقييم')}</strong><small>${tr('Edit questions','تعديل البنود')}</small></button><button class="admin-action" data-action="nav" data-page="access">${icon('mail',20)}<strong>${tr('Invitations','الدعوات')}</strong><small>${tr('Manage access','إدارة الانضمام')}</small></button><button class="admin-action" data-action="dashboard-files" data-filter="pending">${icon('folder',20)}<strong>${tr('File review','مراجعة الملفات')}</strong><small>${unreviewed} ${tr('pending','معلّقة')}</small></button></div></section><section class="card admin-recent-activity"><div class="card-header"><h2>${tr('Recent activity','النشاط الأخير')}</h2><button class="link-btn" data-action="activity">${tr('View all','عرض الكل')}${icon('arrow',13)}</button></div><div class="activity-list">${activities.map(a=>`<div class="activity"><span class="activity-icon">${icon(String(a.type||'').startsWith('evaluation')?'clipboard':String(a.type||'').startsWith('file')?'file':String(a.type||'').startsWith('invit')?'mail':'users',15)}</span><div><p>${esc(label(a.text))}</p><time>${dateLabel(a.at,true)}</time></div></div>`).join('')||`<p class="subtle">${tr('No activity yet','لا يوجد نشاط بعد')}</p>`}</div></section></div>
    </div>`;
  }
  function overview(){
    if(ui.role==='admin')return adminDashboard();
    const students=currentStudents();const pending=students.filter(reviewDue);const done=students.length-pending.length;
    const filter=ui.overviewFilter||'pending';const list=students.filter(s=>filter==='all'||(filter==='pending'?reviewDue(s):!reviewDue(s)));
    return heading(dashboardGreeting(),periodLabel(PERIOD),button(tr('New evaluation','تقييم جديد'),'choose-evaluation','plus','primary'),'greeting-heading')+`
      <section class="overview-summary" aria-label="${tr('This month','هذا الشهر')}"><div class="summary-stat"><span>${tr('Residents','المقيمون')}</span><strong>${students.length}</strong></div><div class="summary-stat"><span>${tr('To evaluate','بانتظار التقييم')}</span><strong>${pending.length}</strong></div><div class="summary-stat"><span>${tr('Files to review','ملفات للمراجعة')}</span><strong>${visibleFiles().filter(f=>!f.reviewed).length}</strong></div></section>
      ${reviewHub()}<section class="card overview-workspace"><div class="card-header overview-toolbar"><h2>${tr('Review queue','قائمة المراجعات')}</h2><button class="link-btn" data-action="nav" data-page="evaluations">${tr('View all','عرض الكل')}${icon('arrow',13)}</button></div><div class="table-toolbar"><div class="tabs"><button class="tab ${filter==='pending'?'active':''}" data-action="overview-filter" data-filter="pending">${tr('Due for review','مستحق للمراجعة')}<span>${pending.length}</span></button><button class="tab ${filter==='complete'?'active':''}" data-action="overview-filter" data-filter="complete">${tr('Scheduled','مجدول')}<span>${done}</span></button><button class="tab ${filter==='all'?'active':''}" data-action="overview-filter" data-filter="all">${tr('All','الكل')}<span>${students.length}</span></button></div><label class="search">${icon('search',14)}<input id="overview-search" aria-label="${tr('Search residents','البحث عن مقيم')}" placeholder="${tr('Search…','بحث…')}" /></label></div><div id="overview-table">${list.length?residentTable(list.slice(0,8)):empty(filter==='pending'?tr('All caught up','اكتملت التقييمات'):tr('No evaluations yet','لا توجد تقييمات بعد'),'')}</div></section>`;
  }
  function competencyChart(students){
    const cohort=students.filter(s=>latest(s.id,PERIOD));
    const currentAvg=avg(cohort.map(s=>rating(latest(s.id,PERIOD))));
    const previousAvg=avg(students.map(s=>rating(latest(s.id,PREVIOUS))));
    const change=currentAvg!=null&&previousAvg!=null?currentAvg-previousAvg:null;
    const step=410/Math.max(cohort.length,1);const width=Math.min(27,step*.57);
    return `<section class="card"><div class="card-header"><div><h2>${tr('Published rating overview','نظرة على التقييمات المنشورة')}</h2><p>${tr('Overall ratings by resident · this cycle and last','التقييم الإجمالي لكل مقيم · الدورة الحالية والسابقة')}</p></div>${pill(periodLabel(PERIOD),'gray')}</div><div class="chart-area"><div class="chart-summary"><strong>${fmt(currentAvg)}<small style="font-size:11px;color:#aab7b0;font-weight:400;letter-spacing:0"> / 10</small></strong>${change!=null?`<span>${change>=0?'+':''}${change.toFixed(1)} ${tr('vs. last cycle','مقارنة بالدورة الماضية')}</span>`:''}</div><svg class="chart-svg" viewBox="0 0 455 175" preserveAspectRatio="none" role="img" aria-label="${tr('Overall ratings. Bars show this cycle; gray markers show the previous cycle where available.','التقييمات الإجمالية. الأعمدة للدورة الحالية والعلامات الرمادية للدورة السابقة عند توفرها.')}">${[0,2,4,6,8,10].map(n=>`<line x1="30" y1="${154-n*12.5}" x2="450" y2="${154-n*12.5}" stroke="#edf1ef" stroke-width=".7" stroke-dasharray="3 4"/><text x="15" y="${157-n*12.5}" fill="#a9b4b8" font-size="8" font-family="sans-serif">${n}</text>`).join('')}${cohort.map((s,i)=>{const value=rating(latest(s.id,PERIOD));const prior=rating(latest(s.id,PREVIOUS));const x=34+step*i+(step-width)/2;return `<rect x="${x}" y="${154-value*12.5}" width="${width}" height="${value*12.5}" rx="3.5" fill="${i%3===0?'#71a78a':'#a8cbb6'}"><title>${esc(label(s.name))}: ${fmt(value)} / 10</title></rect>${prior!=null?`<line x1="${x-3}" y1="${154-prior*12.5}" x2="${x+width+3}" y2="${154-prior*12.5}" stroke="#9aa9b1" stroke-width="2" stroke-linecap="round"><title>${esc(label(s.name))} · ${periodLabel(PREVIOUS)}: ${fmt(prior)}</title></line>`:''}<text x="${x+width/2}" y="169" text-anchor="middle" fill="#8ea19a" font-size="7.3" font-family="sans-serif">${esc(label(s.name).split(' ')[0])}</text>`;}).join('')}</svg><div class="chart-legend"><span><i class="legend-line"></i>${periodLabel(PERIOD)}</span><span><i class="legend-line prev"></i>${periodLabel(PREVIOUS)}</span></div></div></section>`;
  }
  function programProgress(students){return `<section class="card"><div class="card-header"><div><h2>${tr('Program progress','تقدم البرامج')}</h2><p>${tr('Published evaluations this month','التقييمات المنشورة هذا الشهر')}</p></div>${icon('book',16)}</div><div class="program-list">${db.programs.filter(p=>students.some(s=>s.programId===p.id)).map(p=>{const list=students.filter(s=>s.programId===p.id);const done=list.filter(s=>latest(s.id,PERIOD)).length;return `<div class="program-item"><div class="program-item-head"><span class="program-name"><i class="color-dot" style="background:${safeColor(p.color)}"></i>${esc(label(p.name))}</span><span class="program-num">${done}/${list.length}</span></div><div class="progress-track"><span style="width:${list.length?done/list.length*100:0}%;background:${safeColor(p.color)}"></span></div><div class="program-item-sub"><span>${list.length} ${tr('residents','مقيمين')}</span><span>${Math.round(done/list.length*100)}%</span></div></div>`;}).join('')}</div><div class="soft-footer">${icon('info',12)}${tr('Every resident deserves a meaningful check-in.','كل مقيم يستحق متابعة تُحدث فرقاً.')}</div></section>`;}
  function residentTable(students,adminActions=false){
    if(!students.length)return empty(tr('No residents found','لا توجد نتائج'),tr('Try another search.','جرّب بحثاً آخر.'));
    return `<div class="table-wrap resident-table"><table><thead><tr><th>${tr('Resident','المقيم')}</th><th>${tr('Program / year','البرنامج / السنة')}</th><th>${tr('Rating','التقييم')}</th><th>${tr('Status','الحالة')}</th><th><span class="sr-only">${tr('Actions','إجراءات')}</span></th></tr></thead><tbody>${students.map(s=>{const e=latest(s.id);const done=latest(s.id,PERIOD);const due=reviewDue(s);return `<tr><td><button class="link-btn" data-action="resident" data-id="${s.id}" style="text-align:start;padding:0;color:inherit"><span class="row-person">${avatar(s,'small')}<span class="person-name">${esc(label(s.name))}</span></span></button></td><td><span class="muted">${esc(programName(s.programId))}</span><span class="person-meta" style="display:block">${tr('Year','السنة')} ${s.year} · ${esc(everyWeeks(s.reviewIntervalWeeks||4))}</span></td><td><span class="score">${fmt(rating(e))}${e?'<small>/ 10</small>':''}</span></td><td>${!s.active?pill(tr('Inactive','غير نشط'),'gray',true):s.pending?pill(tr('Invited','مدعو'),'blue',true):due?pill(tr('Due for review','مستحق للمراجعة'),'amber',true):pill(tr('Scheduled','مجدول'),'',true)}</td><td><div class="table-actions">${s.active?`<button class="link-btn" data-action="evaluate" data-id="${s.id}">${due?tr('Evaluate','تقييم'):tr('Review','مراجعة')}${icon('chevron',12)}</button>`:button(tr('Reactivate','إعادة التفعيل'),'toggle-student','refresh','small','data-id="'+s.id+'"')}${s.active?`<button class="icon-btn" data-action="add-observation" data-id="${esc(s.id)}" aria-label="${esc(tr('Quick note for ','ملاحظة سريعة عن ')+label(s.name))}" title="${tr('Quick note','ملاحظة سريعة')}">${icon('book',13)}</button>`:''}${adminActions&&s.active?`<button class="icon-btn" data-action="edit-student" data-id="${s.id}" aria-label="${tr('Edit resident','تعديل المقيم')}">${icon('edit',13)}</button>`:''}</div></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function programOptions(selected='all',all=true,items=db.programs){return (all?`<option value="all">${tr('All programs','جميع البرامج')}</option>`:'')+items.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(label(p.name))}</option>`).join('');}
  function filteredStudents(){return (ui.role==='admin'?db.students.filter(s=>ui.status==='inactive'?!s.active:s.active):assignedStudents()).filter(s=>(ui.program==='all'||s.programId===ui.program)&&(!ui.search||[s.name.en,s.name.ar,s.email].join(' ').toLowerCase().includes(ui.search.toLowerCase())));}
  function studentsPage(){return heading(ui.role==='admin'?tr('Residents','المقيمون'):tr('My residents','المقيمون لديّ'),'',ui.role==='admin'?button(tr('Add resident','إضافة مقيم'),'add-student','plus','primary'):'')+`<div class="filter-row"><label class="search">${icon('search',16)}<input id="resident-search" value="${esc(ui.search)}" placeholder="${tr('Search…','بحث…')}" aria-label="${tr('Search residents','بحث عن مقيم')}"></label><div class="inline"><select id="resident-program" class="select-small" aria-label="${tr('Program filter','تصفية حسب البرنامج')}">${programOptions(ui.program)}</select>${ui.role==='admin'?`<select id="resident-status" class="select-small" aria-label="${tr('Account status','حالة الحساب')}"><option value="active" ${ui.status==='active'?'selected':''}>${tr('Active','نشط')}</option><option value="inactive" ${ui.status==='inactive'?'selected':''}>${tr('Inactive','غير نشط')}</option></select>`:''}</div></div><div class="card"><div id="resident-table">${residentTable(filteredStudents(),ui.role==='admin')}</div></div>`;}

  function doctorsPage(){return heading(tr('Doctors','الأطباء'),'',button(tr('Invite doctor','دعوة طبيب'),'invite','plus','primary'))+`<div class="directory-grid">${db.doctors.filter(d=>d.role!=='admin').map(d=>{const students=activeStudents().filter(s=>s.doctorId===d.id);return `<div class="card doctor-card">${avatar(d,'large')}<span class="status">${pill(d.pending?tr('Invited','مدعو'):d.active?tr('Active','نشط'):tr('Inactive','غير نشط'),d.pending?'amber':d.active?'':'gray',true)}</span><h3>${esc(label(d.name))}</h3><div class="email ltr">${esc(d.email)}</div><div class="inline wrap" style="margin-top:12px">${d.programs.map(p=>pill(programName(p),'gray')).join('')}</div><div class="spread mt20"><span class="subtle">${students.length} ${tr('residents','مقيمين')}</span>${button(tr('Manage','إدارة'),'edit-doctor','edit','small','data-id="'+d.id+'"')}</div></div>`;}).join('')}</div>`;}

  function evaluationsPage(){const students=currentStudents();const pending=students.filter(reviewDue);const records=students.map(s=>latest(s.id,PERIOD)).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return heading(tr('Evaluations','التقييمات'),periodLabel(PERIOD),button(tr('New evaluation','تقييم جديد'),'choose-evaluation','plus','primary'))+`<div class="card mb20"><div class="card-header"><h2>${tr('Due for review','مستحق للمراجعة')}</h2>${pill(String(pending.length),'amber')}</div>${pending.length?residentTable(pending):empty(tr('No reviews due today','لا توجد مراجعات مستحقة اليوم'),'')}</div><div class="card"><div class="card-header"><h2>${tr('Published','منشورة')}</h2>${pill(String(records.length),'gray')}</div>${records.length?records.map(e=>{const s=byId('students',e.studentId);return `<div class="evaluation-row">${avatar(s)}<div class="eval-info"><h3>${esc(label(s.name))}</h3><p>${esc(programName(e.programId||s.programId))}</p></div><span class="rating">${fmt(rating(e))}<small style="font-size:10px;color:#6c7c74"> / 10</small></span>${button(tr('View','عرض'),'resident','eye','small','data-id="'+s.id+'"')}</div>`;}).join(''):empty(tr('No published evaluations','لا توجد تقييمات منشورة'),'')}</div>`;}

  function filesPage(){const files=visibleFiles().filter(f=>ui.filesFilter==='all'||(ui.filesFilter==='pending'?!f.reviewed:f.reviewed)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return heading(tr('File log','سجل الملفات'),'')+`<div class="filter-row"><div class="tabs"><button class="tab ${ui.filesFilter==='all'?'active':''}" data-action="file-filter" data-filter="all">${tr('All files','جميع الملفات')}</button><button class="tab ${ui.filesFilter==='pending'?'active':''}" data-action="file-filter" data-filter="pending">${tr('Awaiting review','بانتظار المراجعة')}</button><button class="tab ${ui.filesFilter==='reviewed'?'active':''}" data-action="file-filter" data-filter="reviewed">${tr('Reviewed','تمت المراجعة')}</button></div><span class="subtle">${LIVE?tr('File numbers only · no patient details','أرقام الملفات فقط · دون تفاصيل المرضى'):tr('File numbers only · fictional demo records','أرقام الملفات فقط · سجلات تجريبية')}</span></div><div class="card">${files.length?`<div class="table-wrap"><table><thead><tr><th>${tr('File number','رقم الملف')}</th><th>${tr('Resident','المقيم')}</th><th>${tr('Program','البرنامج')}</th><th>${tr('Date worked','تاريخ العمل')}</th><th>${tr('Review status','حالة المراجعة')}</th><th></th></tr></thead><tbody>${files.map(f=>{const s=byId('students',f.studentId);return `<tr><td><span class="inline strong">${icon('file',16)}<bdi class="mono">${esc(f.number)}</bdi></span>${f.corrections?.length?`<span class="person-meta" style="display:block">${button(tr('Correction history','سجل التصحيحات'),'file-history','clock','small','data-id="'+esc(f.id)+'"')}</span>`:''}</td><td><button class="link-btn" data-action="resident" data-id="${s.id}">${esc(label(s.name))}</button></td><td><span class="muted">${esc(programName(s.programId))}</span></td><td><span class="muted">${dateLabel(f.date,true)}</span></td><td>${pill(f.reviewed?tr('Reviewed','تمت المراجعة'):f.needsRecheck?tr('Corrected · review again','مصحح · راجعه مجدداً'):tr('Awaiting review','بانتظار المراجعة'),f.reviewed?'':'amber',true)}</td><td>${!f.reviewed?button(tr('Mark reviewed','تأكيد المراجعة'),'review-file','check','small','data-id="'+f.id+'"'):icon('checkCircle',16)}</td></tr>`;}).join('')}</tbody></table></div>`:empty(tr('No files in this view','لا توجد ملفات في هذا العرض'),tr('File numbers submitted by residents will appear here.','ستظهر هنا أرقام الملفات التي يسجلها المقيمون.'))}</div>`;}
  function startEvaluation(id){
    const student=byId('students',id);if(!student||!student.active||!canInspect(id))return;
    const doctorId=LIVE?session.user.id:ui.role==='admin'?'admin':ui.doctorId;
    const saved=db.evaluations.filter(e=>e.studentId===id&&e.period===PERIOD&&e.status==='draft'&&e.doctorId===doctorId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    const published=latest(id,PERIOD);
    const program=byId('programs',student.programId);if(!program)return;
    const templateChanged=saved&&saved.templateVersionId!==program.templateVersionId;
    const questions=JSON.parse(JSON.stringify(program.questions));
    const existing=saved||(reviewDue(student)?null:published);
    const scores=questions.map(q=>{const index=existing?.questions.findIndex(old=>old.id===q.id);return index>=0?existing.scores[index]:null;});
    ui.evalDraft={evaluationId:saved?.id||null,reviewRequired:!!saved?.reviewRequired,studentId:id,doctorId,programId:student.programId,trainingYear:student.year,expectedResidentVersion:student.recordVersion,period:PERIOD,templateVersionId:program.templateVersionId,templateChanged,expectedVersion:saved?.version||0,basePublishedId:published?.id||null,questions,scores,note:JSON.parse(JSON.stringify(existing?.note||{en:'',ar:''}))};
    closeModal();ui.page='evaluate';ui.mobileOpen=false;render();window.scrollTo({top:0,behavior:'auto'});
  }
  function evaluatePage(){
    const draft=ui.evalDraft;if(!draft||!canInspect(draft.studentId))return empty(tr('Choose a resident','اختر مقيماً'),'',button(tr('Choose resident','اختيار مقيم'),'choose-evaluation','users','primary'));
    const s=byId('students',draft.studentId);const count=draft.scores.filter(Number.isInteger).length;const mean=count===draft.questions.length?avg(draft.scores):null;const frozen=draftFrozen();const review=currentDraftReview();const blocked=!!draft.reviewRequired&&review?.status!=='approved';const files=db.files.filter(f=>f.studentId===s.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return heading(tr('Evaluation','التقييم'),'',button(tr('Back','رجوع'),'nav','arrow','','data-page="evaluations"'))+`<div class="evaluation-layout compact-evaluation"><section class="card evaluation-main"><div class="evaluation-profile">${avatar(s,'large')}<div><h3>${esc(label(s.name))}</h3><p>${esc(programName(draft.programId))} · ${tr('Year','السنة')} ${draft.trainingYear} · ${periodLabel(draft.period)}</p>${scheduleNote(s)}</div></div>${draft.templateChanged?`<div class="info-box amber mb20">${icon('refresh',16)}<span>${tr('Categories changed. Review the carried-forward scores.','تغيّرت البنود. راجع الدرجات المنقولة.')}</span></div>`:''}<div class="scale-note">${tr('1 = Needs development · 10 = Excellent','١ = يحتاج إلى تطوير · ١٠ = ممتاز')}</div><div>${draft.questions.map((q,i)=>`<div class="question-row"><label class="question-title" id="question-${i}" for="score-${i}"><span class="question-number">${String(i+1).padStart(2,'0')}</span> ${esc(label(q))}</label><div class="score-select-wrap"><select class="rating-select" id="score-${i}" data-score-index="${i}" aria-labelledby="question-${i}" ${frozen?'disabled':''}><option value="" ${draft.scores[i]==null?'selected':''}>—</option>${Array.from({length:10},(_,n)=>n+1).map(n=>`<option value="${n}" ${draft.scores[i]===n?'selected':''}>${n}</option>`).join('')}</select><small>/ 10</small></div></div>`).join('')}</div><details class="secondary-details" ${(draft.note.en||draft.note.ar)?'open':''}><summary>${icon('lock',14)}${tr('Private notes','ملاحظات خاصة')}</summary><div class="details-content form-field"><label for="private-note">${tr('Doctor and admin only','للطبيب والمسؤول فقط')}</label><textarea id="private-note" ${frozen?'readonly':''} maxlength="3000" rows="4" placeholder="${tr('Add a note…','أضف ملاحظة…')}">${esc(label(draft.note))}</textarea></div></details>${teachingPanel(s.id)}<div class="form-error" id="evaluation-error" role="alert"></div></section><aside class="evaluation-sidebar"><div class="stack"><section class="card card-pad"><h3>${tr('Overall rating','التقييم الإجمالي')}</h3><div class="rating-summary"><strong id="evaluation-average">${fmt(mean)}</strong><small> / 10</small></div><div class="summary-row"><span>${tr('Completed','المكتمل')}</span><strong id="evaluation-completion">${count} / ${draft.questions.length}</strong></div><div class="stack" style="gap:9px;margin-top:20px">${button(tr('Publish','نشر'),'confirm-publish','checkCircle','primary w100',blocked?'disabled':'')}${!frozen?button(tr('Send for review','إرسال للمراجعة'),'prepare-review','mail','w100')+button(tr('Save draft','حفظ مسودة'),'save-draft','edit','w100'):''}</div>${draftReviewPanel()}</section><details class="secondary-details card"><summary>${icon('folder',15)}${tr('Files','الملفات')} ${pill(String(files.length),'gray')}</summary><div class="details-content file-list">${files.map(fileItem).join('')||`<p class="subtle">${tr('No files yet','لا توجد ملفات بعد')}</p>`}</div></details></div></aside></div>`;
  }
  function fileItem(f){return `<div class="file-item"><span class="file-icon">${icon('file',16)}</span><div class="file-info"><strong class="ltr">${esc(f.number)}</strong><small>${dateLabel(f.date,true)}</small></div>${f.reviewed?icon('checkCircle',14):pill(f.needsRecheck?tr('Corrected','مصحح'):tr('New','جديد'),'amber')}${f.corrections?.length?button(tr('History','السجل'),'file-history','clock','small','data-id="'+esc(f.id)+'"'):''}</div>`;}
  function fileHistory(id){
    const file=byId('files',id);if(ui.role==='student'||!file||!canInspect(file.studentId))return;const corrections=(file.corrections||[]).slice().reverse();
    modal(tr('File number history','سجل رقم الملف'),esc(personName('students',file.studentId)),`<div class="observation-list">${corrections.map(c=>`<article class="observation-item"><p><span class="subtle">${tr('Previous','السابق')}</span> <bdi class="mono">${esc(c.previousNumber)}</bdi></p><p><span class="subtle">${tr('Corrected to','صُحّح إلى')}</span> <bdi class="mono">${esc(c.number)}</bdi></p><small>${dateLabel(c.createdAt)}${c.wasReviewed?' · '+tr('Returned for review','أُعيد للمراجعة'):''}</small></article>`).join('')}</div>`,button(tr('Close','إغلاق'),'close')) ;
  }
  function questionsPage(){
    const p=byId('programs',ui.questionProgram)||db.programs[0];
    if(!p)return empty(tr('No programs available','لا توجد برامج متاحة'),tr('Program setup is required.','يجب إعداد البرامج أولاً.'));
    if(!ui.questionDraft||ui.questionDraft.programId!==p.id)ui.questionDraft={programId:p.id,expectedVersion:p.templateVersion,questions:JSON.parse(JSON.stringify(p.questions))};
    return heading(tr('Assessment categories','بنود التقييم'),'')+`<div class="filter-row"><div class="inline"><span class="field-label">${tr('Residency program','برنامج الإقامة')}</span><select id="question-program" class="select-small">${programOptions(p.id,false)}</select></div>${pill(tr('Equal weighting · 1–10 scale','أوزان متساوية · مقياس ١–١٠'),'gray')}</div><form data-form="questions"><div class="card"><div class="card-header"><div><h2>${esc(label(p.name))}</h2></div>${button(tr('Add category','إضافة فئة'),'add-question','plus','small')}</div><div class="question-column-head"><span></span><span>${tr('English label','العنوان بالإنجليزية')}</span><span>${tr('Arabic label','العنوان بالعربية')}</span><span></span></div><div class="question-editor">${ui.questionDraft.questions.map((q,i)=>`<div class="editable-question"><span class="question-number">${String(i+1).padStart(2,'0')}</span><input value="${esc(q.en)}" data-question-index="${i}" data-question-lang="en" aria-label="English category ${i+1}" maxlength="90" required dir="ltr"><input value="${esc(q.ar)}" data-question-index="${i}" data-question-lang="ar" aria-label="الفئة بالعربية ${i+1}" maxlength="90" required dir="rtl"><button type="button" class="icon-btn" data-action="remove-question" data-index="${i}" aria-label="${tr('Remove category','حذف الفئة')} ${i+1}" ${ui.questionDraft.questions.length<=1?'disabled':''}>${icon('trash',13)}</button></div>`).join('')}<div class="form-error" role="alert"></div></div><div class="question-save-bar"><span>${tr('Previous evaluations stay unchanged.','تبقى التقييمات السابقة كما هي.')}</span><button type="submit" class="btn primary">${icon('check',15)}${tr('Save questions','حفظ الأسئلة')}</button></div></div></form><details class="secondary-details"><summary>${tr('About these categories','عن هذه البنود')}</summary><div class="details-content">${tr('Starter categories for faculty review. Not an accredited assessment instrument.','بنود مقترحة لمراجعة هيئة التدريب، وليست أداة تقييم معتمدة.')}</div></details>`;
  }
  function reportData(){return db.students.map(student=>{const evaluation=latest(student.id,ui.reportPeriod);const programId=evaluation?.programId||student.programId;return {student,evaluation,programId,year:evaluation?.trainingYear||student.year,supervisorId:evaluation?.doctorId||student.doctorId,files:db.files.filter(f=>f.studentId===student.id&&f.date.startsWith(ui.reportPeriod))};}).filter(r=>(ui.reportProgram==='all'||r.programId===ui.reportProgram)&&(ui.reportStudent==='all'||r.student.id===ui.reportStudent));}
  function reportsPage(){
    const data=reportData();const evaluated=data.filter(r=>r.evaluation);const average=avg(evaluated.map(r=>rating(r.evaluation)));const categories=new Map();
    evaluated.forEach(({evaluation:e})=>e.questions.forEach((q,i)=>{const key=label(q);if(!categories.has(key))categories.set(key,[]);categories.get(key).push(e.scores[i]);}));
    const categoryScores=Array.from(categories.entries()).map(([name,scores])=>({name,average:avg(scores)}));
    return heading(tr('Reports','التقارير'),'',button(tr('Export CSV','تصدير CSV'),'export-report','download','primary')+button(tr('Print','طباعة'),'print','printer',''))+
    `<div class="filter-row"><div class="inline wrap"><select id="report-program" class="select-small" aria-label="${tr('Report program','برنامج التقرير')}">${programOptions(ui.reportProgram)}</select><select id="report-student" class="select-small" aria-label="${tr('Report resident','المقيم في التقرير')}"><option value="all">${tr('All residents','جميع المقيمين')}</option>${db.students.filter(s=>ui.reportProgram==='all'||(latest(s.id,ui.reportPeriod)?.programId||s.programId)===ui.reportProgram).map(s=>`<option value="${s.id}" ${ui.reportStudent===s.id?'selected':''}>${esc(label(s.name))}</option>`).join('')}</select><select id="report-period" class="select-small" aria-label="${tr('Report period','فترة التقرير')}">${Array.from(new Set([PERIOD,PREVIOUS,...db.evaluations.map(e=>e.period)])).sort().reverse().map(p=>`<option value="${p}" ${ui.reportPeriod===p?'selected':''}>${periodLabel(p)}</option>`).join('')}</select></div></div>
    <div class="card report-paper" id="print-report"><div class="report-header"><div><div class="eyebrow muted" style="margin-bottom:9px">${tr('RESIDENCY PROGRAM REPORT','تقرير برنامج الإقامة')}</div><h2>${ui.reportProgram==='all'?tr('Program performance overview','نظرة على أداء البرامج'):esc(programName(ui.reportProgram))}</h2><p>${periodLabel(ui.reportPeriod)} · ${tr('Prepared for Dr. Khaled Abdelazim','إعداد لد. خالد عبد العظيم')}</p></div>${brand()}</div><div class="report-metrics"><div><strong>${data.length}</strong><span>${tr('Residents in report','مقيمون في التقرير')}</span></div><div><strong>${evaluated.length}<small style="font-size:12px;font-weight:400;color:#9caea3"> / ${data.length}</small></strong><span>${tr('With published evaluations','لديهم تقييم منشور')}</span></div><div><strong>${fmt(average)}<small style="font-size:12px;font-weight:400;color:#9caea3"> / 10</small></strong><span>${tr('Average published rating','متوسط التقييمات المنشورة')}</span></div></div><h3 style="font-size:12px;margin-bottom:18px">${tr('Average by evaluation category','المتوسط حسب فئة التقييم')}</h3><div class="report-bars">${categoryScores.map(q=>`<div class="report-bar"><span>${esc(q.name)}</span><div class="progress-track"><span style="width:${q.average*10}%;background:#88b49a"></span></div><strong>${fmt(q.average)}</strong></div>`).join('')||`<p class="subtle">${tr('No published ratings match these filters.','لا توجد تقييمات منشورة مطابقة لهذه التصفية.')}</p>`}</div><div class="table-wrap report-table mt20"><table><thead><tr><th>${tr('Resident','المقيم')}</th><th>${tr('Program','البرنامج')}</th><th>${tr('Rating','التقييم')}</th><th>${tr('Files this period','ملفات هذه الفترة')}</th><th>${tr('Status','الحالة')}</th></tr></thead><tbody>${data.map(r=>`<tr><td>${esc(label(r.student.name))}</td><td>${esc(programName(r.programId))}</td><td>${fmt(rating(r.evaluation))}${r.evaluation?' / 10':''}</td><td>${r.files.length}</td><td>${r.evaluation?tr('Published','منشور'):tr('Not evaluated','لم يُقيَّم')}</td></tr>`).join('')}</tbody></table></div><p class="report-disclaimer">${LIVE?tr('Published ratings · Equal weights · No private notes in exports','تقييمات منشورة · أوزان متساوية · التصدير دون ملاحظات خاصة'):tr('Sample data · Published ratings · Equal weights · No private notes','بيانات وهمية · تقييمات منشورة · أوزان متساوية · دون ملاحظات خاصة')}</p></div>`;
  }
  function invitationList(){const invitations=db.invitations.filter(i=>i.status==='pending');return invitations.length?invitations.map(i=>`<div class="file-item"><span class="file-icon">${icon('mail',15)}</span><div class="file-info"><strong>${esc(label(i.name))}</strong><small><bdi>${esc(i.email)}</bdi> · ${LIVE?roleName(i.role):tr('Demo invitation','دعوة تجريبية')}</small></div>${button(LIVE&&!invitationUrls.has(i.id)?tr('Reissue link','إعادة إصدار الرابط'):tr('View link','عرض الرابط'),LIVE&&!invitationUrls.has(i.id)?'reissue-invite':'view-invite','link','small','data-id="'+i.id+'"')}<button class="icon-btn" data-action="revoke-invite" data-id="${i.id}" aria-label="${tr('Revoke invitation','إلغاء الدعوة')}">${icon('close',13)}</button></div>`).join(''):empty(tr('No pending invitations','لا توجد دعوات معلقة'),'');}
  function settingsPage(){
    const cards=[['doctors','stethoscope',tr('Doctors','الأطباء'),tr('Invite and manage','الدعوة والإدارة')],['questions','clipboard',tr('Assessment categories','بنود التقييم'),tr('Edit English and Arabic labels','تعديل البنود باللغتين')],['access','mail',tr('Invitations','الدعوات'),tr('Copy, renew or revoke','نسخ أو تجديد أو إلغاء')]];
    return heading(tr('Settings','الإعدادات'),'')+`<div class="settings-grid">${cards.map(c=>`<button class="settings-link card" data-action="nav" data-page="${c[0]}"><span class="settings-icon">${icon(c[1],23)}</span><span><strong>${c[2]}</strong><small>${c[3]}</small></span>${icon('chevron',16)}</button>`).join('')}</div><details class="secondary-details card mt20"><summary>${icon('shield',15)}${tr('Role permissions','صلاحيات الأدوار')}</summary><div class="details-content"><div class="table-wrap"><table class="permissions-table"><thead><tr><th>${tr('Role','الدور')}</th><th>${tr('Access','الصلاحيات')}</th></tr></thead><tbody><tr><td>${tr('Admin','المسؤول')}</td><td>${tr('Accounts, assessments, categories and reports','الحسابات والتقييمات والبنود والتقارير')}</td></tr><tr><td>${tr('Doctor','الطبيب')}</td><td>${tr('Assigned residents, assessments and files','المقيمون المعيّنون وتقييماتهم وملفاتهم')}</td></tr><tr><td>${tr('Student','الطالب')}</td><td>${tr('Own overall rating and file log','تقييمه الإجمالي وسجل ملفاته فقط')}</td></tr></tbody></table></div></div></details>`;
  }
  function accessPage(){return heading(tr('Invitations','الدعوات'),'',button(tr('Invite doctor','دعوة طبيب'),'invite','plus','primary'))+`<section class="card"><div class="card-pad">${invitationList()}</div></section>`;}

  function studentPage(){
    const s=byId('students',ui.studentId);if(!s)return empty(tr('Loading your profile','جارٍ تحميل ملفك'),'');const e=LIVE?studentRating:latest(s.id);const score=LIVE?(studentRating?.score??null):rating(e);const files=db.files.filter(f=>f.studentId===s.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const fileRow=f=>`<div class="student-file-row"><div class="inline">${icon('file',16)}<strong class="ltr">${esc(f.number)}</strong></div><span>${dateLabel(f.date,true)}</span>${button(tr('Correct number','تصحيح الرقم'),'correct-file','edit','small','data-id="'+esc(f.id)+'"')}</div>`;
    return `<div class="student-page compact-student">${heading(tr('My workspace','مساحتي'),'')}<div class="student-layout"><section class="student-rating-card"><h2>${tr('Your rating','تقييمك')}</h2><div class="student-score-value"><strong>${fmt(score)}</strong><small>/ 10</small></div><p>${e?periodLabel(e.period):tr('No rating yet','لا يوجد تقييم بعد')}</p></section><section class="card student-log-card"><h2>${tr('Add file number','تسجيل رقم ملف')}</h2><form data-form="file"><div class="form-field"><label for="file-number">${tr('File number','رقم الملف')}</label><input id="file-number" name="number" dir="ltr" placeholder="${LIVE?'FILE-10495':'DEMO-10495'}" maxlength="40" autocomplete="off" required><small>${LIVE?tr('File references only. No patient details.','أرقام الملفات فقط، دون تفاصيل المرضى.'):tr('Use a fictional file number.','استخدم رقم ملف وهمياً.')}</small></div><div class="form-field" style="margin-top:17px"><label for="file-date">${tr('Date worked','تاريخ العمل')}</label><input id="file-date" type="date" name="date" value="${DEMO_DATE}" min="2020-01-01" max="${LIVE?DEMO_DATE:new Date().toISOString().slice(0,10)}" required></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon('plus',16)}${tr('Add file','إضافة الملف')}</button></form></section></div><section class="card student-files"><div class="card-header"><h2>${tr('Recent files','آخر الملفات')}</h2>${pill(String(files.length),'gray')}</div><div class="file-list">${files.slice(0,5).map(fileRow).join('')||`<p class="subtle">${tr('No files yet','لا توجد ملفات بعد')}</p>`}${files.length>5?`<details class="secondary-details"><summary>${tr('Earlier files','الملفات السابقة')} (${files.length-5})</summary><div class="details-content">${files.slice(5).map(fileRow).join('')}</div></details>`:''}</div></section></div>`;
  }
  let previousFocus=null;
  function modal(title,subtitle,body,footer='',wide=false){
    previousFocus=document.activeElement;ui.modal=true;
    document.getElementById('overlay-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="icon-btn" data-action="close" aria-label="${tr('Close dialog','إغلاق النافذة')}">${icon('close',17)}</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>document.querySelector('.modal input:not([type=hidden]),.modal select,.modal button')?.focus());
  }
  function closeModal(){ui.modal=null;document.getElementById('overlay-root').innerHTML='';document.body.style.overflow='';if(previousFocus?.isConnected)previousFocus.focus();}
  let toastTimer;
  function toast(message){clearTimeout(toastTimer);document.getElementById('toast-root').innerHTML=`<div class="toast">${icon('checkCircle',17)}<span>${esc(message)}</span></div>`;toastTimer=setTimeout(()=>{document.getElementById('toast-root').innerHTML='';},4500);}
  function error(form,message){const target=typeof form==='string'?document.getElementById(form):form.querySelector('.form-error');if(target){target.textContent=message;target.scrollIntoView({block:'nearest',behavior:'smooth'});}}
  function showResident(id){
    if(!canInspect(id))return;
    const s=byId('students',id);if(!s)return;
    const e=latest(id);const files=db.files.filter(f=>f.studentId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const evaluator=e?.doctorId==='admin'?tr('Dr. Khaled Abdelazim','د. خالد عبد العظيم'):personName('doctors',e?.doctorId);
    modal(esc(label(s.name)),`${esc(programName(s.programId))} · ${tr('Year','السنة')} ${s.year}`,`<div class="spread mb20"><div class="inline">${avatar(s,'large')}<div><div class="subtle ltr">${esc(s.email)}</div><div class="subtle" style="margin-top:5px">${tr('Supervisor','المشرف')}: ${esc(personName('doctors',s.doctorId))}</div></div></div><div class="text-end"><div class="detail-score">${fmt(rating(e))}<small> / 10</small></div><div class="subtle">${e?periodLabel(e.period):tr('Not rated yet','لم يُقيَّم بعد')}</div></div></div><div class="detail-grid"><section><h3 style="margin-bottom:12px">${tr('Latest published evaluation','آخر تقييم منشور')}</h3>${e?e.questions.map((q,i)=>`<div class="category-detail"><span>${esc(label(q))}</span><strong>${e.scores[i]} / 10</strong></div>`).join(''):`<p class="subtle">${tr('No published evaluation is available.','لا يوجد تقييم منشور.')}</p>`}${e?`<p class="subtle" style="margin-top:11px">${tr('Evaluated by','تم التقييم بواسطة')} ${esc(evaluator)}</p>`:''}</section><section><h3 style="margin-bottom:12px">${tr('Submitted files','الملفات المسجلة')} <small class="muted">(${files.length})</small></h3><div class="file-list" style="max-height:280px;overflow:auto">${files.map(fileItem).join('')||`<p class="subtle">${tr('No files submitted yet.','لا توجد ملفات مسجلة.')}</p>`}</div>${e&&label(e.note)?`<div class="private-note mt20"><strong>${icon('lock',13)}${tr('Private supervisor notes','ملاحظات خاصة بالمشرف')}</strong>${esc(label(e.note))}</div>`:''}</section></div>${scheduleNote(s)}${teachingPanel(id)}`,(ui.role==='admin'?button(tr('Edit resident','تعديل المقيم'),'edit-student','edit','','data-id="'+id+'"'):'')+(s.active?button(tr('Evaluate resident','تقييم المقيم'),'evaluate','clipboard','primary','data-id="'+id+'"'):''),true);
  }
  function studentForm(id=null){
    if(ui.role!=='admin')return;
    const s=id?byId('students',id):null;const p=s?.programId||db.programs[0].id;
    modal(s?tr('Edit resident','تعديل المقيم'):tr('Add resident','إضافة مقيم'),'',`<form data-form="student" data-id="${s?.id||''}" id="student-form"><div class="form-grid"><div class="form-field"><label for="student-name-en">${tr('Full name · English','الاسم الكامل · الإنجليزية')}</label><input id="student-name-en" name="nameEn" value="${esc(s?.name.en||'')}" placeholder="Sara Mahmoud" minlength="2" maxlength="70" required dir="ltr"></div><div class="form-field"><label for="student-name-ar">${tr('Full name · Arabic','الاسم الكامل · العربية')}</label><input id="student-name-ar" name="nameAr" value="${esc(s?.name.ar||'')}" placeholder="سارة محمود" maxlength="70" dir="rtl"></div><div class="form-field full"><label for="student-email">${tr('Email address','البريد الإلكتروني')}</label><input id="student-email" name="email" type="email" value="${esc(s?.email||'')}" placeholder="resident@example.com" maxlength="150" required dir="ltr"></div><div class="form-field"><label for="student-program">${tr('Residency program','برنامج الإقامة')}</label><select id="student-program" name="programId">${programOptions(p,false)}</select></div><div class="form-field"><label for="student-year">${tr('Training year','سنة التدريب')}</label><select id="student-year" name="year">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${s?.year===n?'selected':''}>${tr('Year','السنة')} ${n}</option>`).join('')}</select></div><div class="form-field full review-schedule"><label for="student-review-weeks">${tr('Review every','تكرار المراجعة')}</label><select id="student-review-weeks" name="reviewIntervalWeeks">${Array.from({length:52},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===(s?.reviewIntervalWeeks||4)?'selected':''}>${esc(weeksLabel(n))}</option>`).join('')}</select><small>${tr('Returns to the review queue after the last published rating.','يعود إلى قائمة المراجعة بعد آخر تقييم منشور.')}</small></div><div class="form-field full"><label for="student-doctor">${tr('Supervising doctor','الطبيب المشرف')}</label><select id="student-doctor" name="doctorId" required>${doctorOptions(p,s?.doctorId)}</select></div></div><div class="info-box mt20">${icon('info',15)}<span>${LIVE?tr('A new resident receives an activation link for you to share. Choose an accepted, active supervisor for their program.','ستحصل على رابط تفعيل للمقيم الجديد لمشاركته معه. اختر مشرفاً نشطاً قَبِل دعوته ومخوّلاً لهذا البرنامج.'):tr('This adds a fictional record to this browser. The live deployment uses individual accounts.','يضيف هذا سجلاً تجريبياً إلى المتصفح. يستخدم النظام الفعلي حسابات فردية.')}</span></div><div class="form-error" role="alert"></div></form>`,(s?button(s.active?tr('Deactivate','إلغاء التفعيل'):tr('Reactivate','إعادة التفعيل'),'toggle-student',s.active?'trash':'refresh',s.active?'danger':'soft','data-id="'+s.id+'"'):'')+button(tr('Cancel','إلغاء'),'close')+`<button type="submit" form="student-form" class="btn primary">${icon('check',15)}${s?tr('Save changes','حفظ التغييرات'):tr('Add resident','إضافة المقيم')}</button>`);
  }
  function doctorOptions(program,selected){return db.doctors.filter(d=>d.role!=='admin'&&d.active&&!d.pending&&d.programs.includes(program)).map(d=>`<option value="${d.id}" ${selected===d.id?'selected':''}>${esc(label(d.name))}</option>`).join('');}
  function doctorForm(id){
    if(ui.role!=='admin')return;const d=byId('doctors',id);if(!d||d.role==='admin')return;
    modal(tr('Manage supervising doctor','إدارة الطبيب المشرف'),tr('Update the doctor’s details and program access.','حدّث بيانات الطبيب وصلاحيات البرامج.'),`<form data-form="doctor" data-id="${id}" id="doctor-form"><div class="form-grid"><div class="form-field"><label for="doctor-name-en">${tr('Name · English','الاسم · الإنجليزية')}</label><input id="doctor-name-en" name="nameEn" value="${esc(d.name.en)}" minlength="2" maxlength="70" required dir="ltr"></div><div class="form-field"><label for="doctor-name-ar">${tr('Name · Arabic','الاسم · العربية')}</label><input id="doctor-name-ar" name="nameAr" value="${esc(d.name.ar)}" maxlength="70" dir="rtl"></div><div class="form-field full"><label for="doctor-email">${tr('Email address','البريد الإلكتروني')}</label><input id="doctor-email" name="email" type="email" value="${esc(d.email)}" maxlength="150" required dir="ltr"></div><div class="form-field full"><label>${tr('Residency programs','برامج الإقامة')}</label>${db.programs.map(p=>`<label class="inline" style="font-size:12px;font-weight:400"><input type="checkbox" name="programs" value="${p.id}" ${d.programs.includes(p.id)?'checked':''} style="width:16px;min-height:16px;accent-color:#155f53">${esc(label(p.name))}</label>`).join('')}</div></div><div class="form-error" role="alert"></div><div class="info-box mt20">${icon('users',16)}<span>${tr('Before deactivating a doctor, reassign their active residents through the resident directory. Their evaluation history is retained.','قبل إلغاء تفعيل الطبيب، أعد تعيين المقيمين النشطين من دليل المقيمين. يُحتفظ بسجل تقييماته.')}</span></div></form>`,button(d.active?tr('Deactivate','إلغاء التفعيل'):tr('Reactivate','إعادة التفعيل'),'toggle-doctor',d.active?'trash':'refresh',d.active?'danger':'soft','data-id="'+id+'"')+`<button type="submit" form="doctor-form" class="btn primary">${icon('check',15)}${tr('Save changes','حفظ التغييرات')}</button>`);
  }
  function invitationForm(){
    if(ui.role!=='admin')return;
    modal(tr('Invite a supervising doctor','دعوة طبيب مشرف'),LIVE?tr('Create a personal activation link for a supervising psychiatrist.','أنشئ رابط تفعيل شخصياً لطبيب نفسي مشرف.'):tr('Create a demo invitation for the manager role.','أنشئ دعوة تجريبية لدور الطبيب المشرف.'),`<form data-form="invite" id="invite-form"><div class="form-grid"><div class="form-field"><label for="invite-name-en">${tr('Name · English','الاسم · الإنجليزية')}</label><input id="invite-name-en" name="nameEn" placeholder="Dr. Youssef Adel" minlength="2" maxlength="70" required dir="ltr"></div><div class="form-field"><label for="invite-name-ar">${tr('Name · Arabic','الاسم · العربية')}</label><input id="invite-name-ar" name="nameAr" placeholder="د. يوسف عادل" maxlength="70" dir="rtl"></div><div class="form-field full"><label for="invite-email">${tr('Email address','البريد الإلكتروني')}</label><input id="invite-email" type="email" name="email" placeholder="doctor@example.com" maxlength="150" required dir="ltr"></div><div class="form-field full"><label for="invite-program">${tr('Residency program','برنامج الإقامة')}</label><select id="invite-program" name="programId">${programOptions('adult',false)}</select></div></div><div class="info-box mt20">${icon('link',16)}<span>${LIVE?tr('Create a seven-day invitation, then copy the private link and share it with the named doctor. The account becomes active after acceptance.','أنشئ دعوة صالحة لسبعة أيام، ثم انسخ الرابط الخاص وشاركه مع الطبيب المحدد. يُفعّل الحساب بعد قبول الدعوة.'):tr('The demo creates a seven-day invitation link. You can copy it and preview acceptance in this browser. No email is sent or real account created.','ينشئ العرض رابط دعوة لمدة سبعة أيام. يمكنك نسخه ومعاينة القبول في هذا المتصفح. لا تُرسل رسالة بريدية ولا يُنشأ حساب فعلي.')}</span></div><div class="form-error" role="alert"></div></form>`,button(tr('Cancel','إلغاء'),'close')+`<button type="submit" form="invite-form" class="btn primary">${icon('link',15)}${LIVE?tr('Create invitation link','إنشاء رابط دعوة'):tr('Create demo invitation','إنشاء دعوة تجريبية')}</button>`);
  }
  function inviteUrl(invitation){if(LIVE)return invitationUrls.get(invitation.id)||'';return location.href.split('?')[0].split('#')[0]+'?invite='+encodeURIComponent(invitation.token);}
  function showInvite(id){
    if(LIVE){showLiveInvite(id);return;}
    if(ui.role!=='admin')return;const invite=byId('invitations',id);if(!invite)return;
    modal(tr('Your demo invitation is ready','دعوتك التجريبية جاهزة'),tr('Preview how a supervising doctor joins the program.','عاين كيف ينضم الطبيب المشرف إلى البرنامج.'),`<div class="info-box">${icon('mail',18)}<span><strong>${esc(label(invite.name))}</strong><br><bdi>${esc(invite.email)}</bdi><br>${esc(programName(invite.programId))} · ${tr('Supervising doctor','طبيب مشرف')}</span></div><div class="form-field mt20"><label for="invitation-url">${tr('Demo invitation link','رابط الدعوة التجريبية')}</label><div class="invitation-link"><input id="invitation-url" value="${esc(inviteUrl(invite))}" readonly dir="ltr">${button(tr('Copy','نسخ'),'copy-invite','copy','small','data-id="'+id+'"')}</div><small>${tr('Expires','تنتهي في')} ${dateLabel(invite.expiresAt)}.</small></div><div class="info-box amber mt20">${icon('info',16)}<span>${tr('This invitation belongs to this browser’s demo data. It will not create a shared account or work in another browser until a backend is connected.','هذه الدعوة مرتبطة بالبيانات التجريبية في هذا المتصفح. لن تنشئ حساباً مشتركاً أو تعمل في متصفح آخر قبل ربط النظام الخلفي.')}</span></div>`,button(tr('Done','تم'),'close')+button(tr('Preview acceptance','معاينة قبول الدعوة'),'preview-invite','arrow','primary','data-id="'+id+'"'));
  }
  function previewInvite(id){
    const invite=byId('invitations',id);if(!invite||invite.status!=='pending'||new Date(invite.expiresAt)<new Date()){toast(tr('This demo invitation is expired or no longer available.','هذه الدعوة التجريبية منتهية أو لم تعد متاحة.'));return;}
    modal(tr('You’re invited to Taqyeem','أنت مدعو للانضمام إلى تقييم'),tr('Dr. Khaled Abdelazim has invited a supervising doctor.','دعا د. خالد عبد العظيم طبيباً مشرفاً للانضمام.'),`<div style="text-align:center;padding:12px 0 22px"><div class="brand-symbol" style="margin:auto;width:58px;height:58px;border-radius:18px">${icon('stethoscope',29)}</div><h3 style="margin:19px 0 7px">${esc(label(invite.name))}</h3><p class="subtle">${esc(programName(invite.programId))}</p></div><div class="info-box">${icon('info',16)}<span>${tr('Accepting simulates joining the team and opens the doctor view. No password, email, or real account is created.','يُحاكي القبول الانضمام إلى الفريق ويفتح واجهة الطبيب. لا تُنشأ كلمة مرور أو رسالة بريدية أو حساب فعلي.')}</span></div>`,button(tr('Cancel','إلغاء'),'close')+button(tr('Accept demo invitation','قبول الدعوة التجريبية'),'accept-invite','check','primary','data-id="'+id+'"'));
  }
  function chooseEvaluation(){
    const students=currentStudents();
    modal(tr('Choose a resident','اختر مقيماً'),tr('Select the resident you would like to evaluate.','اختر المقيم الذي تريد تقييمه.'),`<div class="file-list">${students.map(s=>`<button class="file-item" data-action="evaluate" data-id="${s.id}" style="width:100%;text-align:start">${avatar(s)}<span class="file-info"><strong>${esc(label(s.name))}</strong><small>${esc(programName(s.programId))} · ${tr('Year','السنة')} ${s.year}</small></span>${reviewDue(s)?pill(tr('Due for review','مستحق للمراجعة'),'amber'):pill(tr('Scheduled','مجدول'))}${icon('chevron',14)}</button>`).join('')||`<p class="subtle">${tr('No active residents are assigned to this account yet.','لا يوجد مقيمون نشطون تحت إشراف هذا الحساب بعد.')}</p>`}</div>`);
  }
  function showTour(){
    modal(tr('A quick look around Taqyeem','جولة سريعة في تقييم'),tr('Three clear roles. One connected learning journey.','ثلاثة أدوار واضحة. ورحلة تدريب مترابطة.'),[
      [tr('Start as Dr. Khaled','ابدأ بدور د. خالد'),tr('Review the program overview, add a resident, invite a doctor, and tailor the evaluation questions.','راجع البرامج وأضف مقيماً وادعُ طبيباً وخصّص أسئلة التقييم.')],
      [tr('Try the doctor view','جرّب واجهة الطبيب'),tr('Open Sara Mahmoud, review her submitted files, and rate all ten categories. Save a draft or publish the overall score.','افتح ملف سارة محمود، وراجع أرقام ملفاتها، وقيّم الفئات العشر. احفظ مسودة أو انشر التقييم الإجمالي.')],
      [tr('Switch to Student','انتقل إلى واجهة الطالب'),tr('See Sara’s published number and log a fictional file. Switch back to Doctor to see the new submission.','شاهد درجة سارة المنشورة وسجّل ملفاً وهمياً. عُد إلى الطبيب لمشاهدة الإضافة الجديدة.')],
      [tr('Make it your own','خصّص تجربتك'),tr('Switch to Arabic, filter a report, or edit a program’s questions. Your changes stay in this browser; Reset demo starts fresh.','انتقل للعربية أو صفِّ تقريراً أو عدّل أسئلة البرنامج. تبقى التغييرات في هذا المتصفح، ويمكن إعادة ضبط العرض.')]
    ].map((step,i)=>`<div class="tour-step"><span class="tour-number">${i+1}</span><div><h3>${step[0]}</h3><p>${step[1]}</p></div></div>`).join('')+`<div class="info-box mt20">${icon('info',16)}<span>${tr('Fictional demo records only. Real sign-in, protected permissions, and shared storage are the next backend stage.','بيانات تجريبية فقط. تسجيل الدخول الفعلي وحماية الصلاحيات والتخزين المشترك هي مرحلة النظام الخلفي القادمة.')}</span></div>`,button(tr('Let’s explore','لنبدأ الجولة'),'close','arrow','primary'));
  }
  function showActivity(){
    if(ui.role==='student')return;
    const entries=ui.role==='admin'?db.activity.slice(0,10):db.evaluations.filter(e=>e.doctorId===ui.doctorId&&assignedStudents().some(s=>s.id===e.studentId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,8).map(e=>({type:'evaluation',text:{en:`${e.status==='published'?'Published evaluation':'Saved draft'} · ${byId('students',e.studentId)?.name.en}`,ar:`${e.status==='published'?'تقييم منشور':'مسودة محفوظة'} · ${byId('students',e.studentId)?.name.ar}`},at:e.createdAt}));
    modal(tr('Recent activity','النشاط الأخير'),LIVE?tr('The latest changes in your workspace.','آخر التغييرات في مساحة العمل.'):tr('The latest changes in your demonstration workspace.','آخر التغييرات في مساحة العرض التجريبية.'),`<div class="activity-list" style="padding:0">${entries.map(a=>`<div class="activity"><span class="activity-icon">${icon(a.type==='evaluation'?'clipboard':a.type==='file'?'file':a.type==='invite'?'mail':'users',15)}</span><div><p>${esc(label(a.text))}</p><time>${dateLabel(a.at,true)}</time></div></div>`).join('')||`<p class="subtle">${tr('No activity yet.','لا يوجد نشاط بعد.')}</p>`}</div>`);
  }
  function evaluationPayload(draft){return {studentId:draft.studentId,period:draft.period,templateVersionId:draft.templateVersionId,scores:draft.scores.slice(),note:{...draft.note},expectedVersion:draft.expectedVersion,expectedResidentVersion:draft.expectedResidentVersion,basePublishedId:draft.basePublishedId};}
  function demoReferralCurrent(request){
    const draft=byId('evaluations',request.evaluationId);const student=byId('students',request.studentId);const author=request.fromDoctorId==='admin'?{active:true}:byId('doctors',request.fromDoctorId);const recipient=faculty().find(d=>d.id===request.toDoctorId);
    return !!draft&&draft.status==='draft'&&draft.version===request.evaluationVersion&&!!student?.active&&!student.pending&&!!author?.active&&!!recipient&&(request.fromDoctorId==='admin'||student.doctorId===request.fromDoctorId)&&(request.expectedResidentVersion==null||request.expectedResidentVersion===(student.recordVersion||1))&&(!request.templateVersionId||request.templateVersionId===byId('programs',student.programId)?.templateVersionId)&&(request.basePublishedId??null)===(latest(student.id,draft.period)?.id??null)&&draft.programId===student.programId&&draft.trainingYear===student.year;
  }
  function demoSaveEvaluation(draft,publish=false){
    if(!draft||!canInspect(draft.studentId))throw new Error(tr('This resident is not available to your account.','هذا المقيم غير متاح لحسابك.'));
    const student=byId('students',draft.studentId);if(!student?.active||student.pending||draft.templateVersionId!==byId('programs',student.programId)?.templateVersionId)throw new Error(tr('The resident or assessment categories changed. Reopen the evaluation.','تغيّرت بيانات المقيم أو بنود التقييم. أعد فتح التقييم.'));const old=db.evaluations.find(e=>e.id===draft.evaluationId&&e.status==='draft');const head=latest(draft.studentId,draft.period);
    if((student.recordVersion||1)!==(draft.expectedResidentVersion||1)||(old?.version||0)!==(draft.expectedVersion||0)||(head?.id??null)!==(draft.basePublishedId??null))throw new Error(tr('This evaluation changed. Reopen it before saving.','تغيّر هذا التقييم. أعد فتحه قبل الحفظ.'));
    const latestRequest=newestReview(old?.id);const request=latestRequest?.status==='cancelled'?null:latestRequest;
    const required=!!old?.reviewRequired||!!draft.reviewRequired;
    if(publish){
      if(!draft.scores.length||draft.scores.some(n=>!Number.isInteger(n)||n<1||n>10))throw new Error(tr('Complete every score before publishing.','أكمل كل الدرجات قبل النشر.'));
      if(required&&(!request||request.status!=='approved'||!demoReferralCurrent(request)||JSON.stringify(draft.scores)!==JSON.stringify(request.snapshot.evaluation.scores)||JSON.stringify(draft.note)!==JSON.stringify(request.snapshot.evaluation.note)))throw new Error(tr('This saved version needs approval. Send it for review or withdraw the request.','تحتاج هذه النسخة المحفوظة إلى اعتماد. أرسلها للمراجعة أو اسحب الطلب.'));
    }
    const time=now();const entry=JSON.parse(JSON.stringify(draft));entry.id=old?.id||uid('e');entry.status=publish?'published':'draft';entry.version=publish?(head?.version||0)+1:(old?.version||0)+1;entry.createdAt=time;entry.reviewRequired=required;
    delete entry.evaluationId;delete entry.expectedVersion;delete entry.expectedResidentVersion;delete entry.templateChanged;
    if(publish){entry.publishedAt=time;if(head)head.superseded=true;if(request)request.publishedAt=time;}
    else for(const review of db.reviewRequests.filter(r=>r.evaluationId===entry.id&&['pending','approved','changes_requested'].includes(r.status)))review.status='superseded';
    db.evaluations=db.evaluations.filter(e=>e.id!==old?.id);db.evaluations.push(entry);
    Object.assign(draft,{evaluationId:entry.id,expectedVersion:entry.version,reviewRequired:entry.reviewRequired});
    activity('evaluation',`${publish?'Published evaluation':'Saved evaluation draft'} for ${student.name.en}`,`${publish?'نُشر تقييم':'حُفظت مسودة تقييم'} للمقيم ${student.name.ar}`);save();return entry;
  }
  async function prepareReview(target){
    if(!ui.evalDraft||!canInspect(ui.evalDraft.studentId)||draftFrozen())return;
    const draft=ui.evalDraft;
    if(LIVE){await runLive(async()=>{const result=await api('/api/evaluations/draft',{method:'POST',body:evaluationPayload(draft)});if(!await refreshWorkspace())return;startEvaluation(draft.studentId);if(!ui.evalDraft?.evaluationId)ui.evalDraft.evaluationId=result.evaluationId;sendReviewForm();},target);}
    else {try{demoSaveEvaluation(draft,false);render();sendReviewForm();}catch(err){error('evaluation-error',err.message);}}
  }
  async function workflowSubmit(form,data,type){
    if(!['observation','goal','file-correction','send-review','review-response'].includes(type))return false;
    if(ui.locked||LIVE&&!session?.authenticated)return true;
    const work=async()=>{
      if(type==='observation'||type==='goal'){
        const studentId=form.dataset.id;if(!canInspect(studentId)||!byId('students',studentId)?.active||byId('students',studentId)?.pending)return;const value=String(data.get('text')||'').trim();if(!value||value.length>1500){error(form,tr('Enter a short note, up to 1,500 characters.','أدخل ملاحظة قصيرة لا تتجاوز ١٥٠٠ حرف.'));return;}
        const text={en:'',ar:''};text[ui.lang]=value;
        if(LIVE)await api(type==='goal'?'/api/goals':'/api/observations',{method:'POST',body:{studentId,text}});
        else {if(type==='goal'&&db.goals.some(g=>g.studentId===studentId&&!g.reviewedAt)){error(form,tr('Review the current goal before adding another.','راجع الهدف الحالي قبل إضافة آخر.'));return;}db[type==='goal'?'goals':'observations'].push({id:uid(type==='goal'?'goal':'observation'),studentId,doctorId:actorId(),text,createdAt:now(),...(type==='goal'?{reviewedAt:null}:{})});save();}
        if(LIVE&&!await refreshWorkspace())return;closeModal();render();toast(type==='goal'?tr('Teaching goal saved.','حُفظ الهدف التدريبي.'):tr('Observation saved.','حُفظت الملاحظة.'));return;
      }
      if(type==='file-correction'){
        const file=byId('files',form.dataset.id);if(ui.role!=='student'||file?.studentId!==ui.studentId)return;
        const number=normalFileNumber(String(data.get('number')||''));if(!/^[A-Z0-9_/-]{1,40}$/.test(number)){error(form,tr('Use letters, numbers, slash, hyphen or underscore.','استخدم حروفاً أو أرقاماً أو شرطات أو شرطات مائلة.'));return;}
        const expectedVersion=Number(form.dataset.version);if(number===file.number){closeModal();return;}
        if(LIVE)await api('/api/files/'+encodeURIComponent(file.id),{method:'PATCH',body:{number,expectedVersion}});
        else {
          if(file.version!==expectedVersion){error(form,tr('This entry changed. Reopen it before correcting.','تغيّر هذا السجل. أعد فتحه قبل التصحيح.'));return;}
          if(db.files.some(f=>f.id!==file.id&&f.studentId===ui.studentId&&normalFileNumber(f.number)===number)){error(form,tr('You have already submitted this file number.','لقد سجلت هذا الرقم مسبقاً.'));return;}
          file.corrections.push({id:uid('correction'),previousNumber:file.number,number,createdAt:now(),changedBy:actorId(),version:expectedVersion+1,wasReviewed:!!file.reviewed});file.needsRecheck=!!file.reviewed||!!file.needsRecheck;file.reviewed=false;file.reviewedAt=null;file.reviewedBy=null;file.number=number;file.version++;save();
        }
        if(LIVE&&!await refreshWorkspace())return;closeModal();render();toast(tr('File number corrected.','تم تصحيح رقم الملف.'));return;
      }
      if(type==='send-review'){
        const draft=ui.evalDraft;const reviewerId=String(data.get('reviewerId')||'');if(!draft?.evaluationId||!canInspect(draft.studentId)||reviewerId===actorId()||!faculty().some(d=>d.id===reviewerId)){error(form,tr('Choose an active doctor or administrator.','اختر طبيباً أو مسؤولاً نشطاً.'));return;}
        if(LIVE)await api('/api/evaluation-reviews',{method:'POST',body:{evaluationId:draft.evaluationId,reviewerId,expectedVersion:draft.expectedVersion}});
        else {
          const saved=byId('evaluations',draft.evaluationId);const student=byId('students',draft.studentId);if(!saved||saved.status!=='draft'||saved.doctorId!==actorId()||saved.version!==draft.expectedVersion){error(form,tr('Save this draft again before sending.','احفظ المسودة مجدداً قبل الإرسال.'));return;}
          for(const previous of db.reviewRequests.filter(r=>r.evaluationId===saved.id&&['pending','approved','changes_requested'].includes(r.status)))previous.status='superseded';
          saved.reviewRequired=true;draft.reviewRequired=true;db.reviewRequests.push({id:uid('review'),evaluationId:saved.id,studentId:student.id,fromDoctorId:actorId(),toDoctorId:reviewerId,evaluationVersion:saved.version,expectedResidentVersion:student.recordVersion||1,templateVersionId:saved.templateVersionId,basePublishedId:latest(student.id,saved.period)?.id||null,status:'pending',comment:{en:'',ar:''},createdAt:now(),reviewedAt:null,snapshot:{student:{id:student.id,name:JSON.parse(JSON.stringify(student.name)),programName:JSON.parse(JSON.stringify(byId('programs',student.programId).name)),year:student.year},evaluation:{scores:saved.scores.slice(),questions:JSON.parse(JSON.stringify(saved.questions)),note:{...saved.note},period:saved.period,overall:avg(saved.scores)}}});save();
        }
        if(LIVE&&!await refreshWorkspace())return;closeModal();startEvaluation(draft.studentId);toast(tr('Sent for review. The resident’s published rating is unchanged.','أُرسل للمراجعة. لم يتغير التقييم المنشور للمقيم.'));return;
      }
      if(type==='review-response'){
        const request=visibleReviews().find(r=>r.id===form.dataset.id);if(!request||request.toDoctorId!==actorId()||request.status!=='pending')return;
        const decision=String(data.get('decision'));const value=String(data.get('comment')||'').trim();if(!['approved','changes_requested'].includes(decision))return;if(decision==='changes_requested'&&!value){error(form,tr('Describe the changes you are requesting.','وضّح التعديلات المطلوبة.'));return;}
        const comment={en:'',ar:''};comment[ui.lang]=value;
        if(LIVE)await api('/api/evaluation-reviews/'+encodeURIComponent(request.id)+'/respond',{method:'POST',body:{decision,comment}});
        else {if(!demoReferralCurrent(request)){request.status='superseded';save();error(form,tr('This saved evaluation changed. Ask the author to send the updated version.','تغير هذا التقييم. اطلب من صاحبه إرسال النسخة المحدّثة.'));return;}if(decision==='approved'&&request.snapshot.evaluation.scores.some(n=>!Number.isInteger(n)||n<1||n>10)){error(form,tr('Every category needs a score before approval.','تحتاج كل فئة إلى درجة قبل الاعتماد.'));return;}request.status=decision;request.comment=comment;request.reviewedAt=now();save();}
        if(LIVE&&!await refreshWorkspace())return;closeModal();render();toast(tr('Feedback sent to the author.','أُرسلت الملاحظات لصاحب التقييم.'));return;
      }
    };
    if(LIVE)await runLive(work,form);else try{await work();}catch(err){error(form,err.message);}return true;
  }
  async function cancelReview(id,target){
    const request=visibleReviews().find(r=>r.id===id);if(!request||(request.fromDoctorId!==actorId()&&ui.role!=='admin')||request.publishedAt)return;
    const studentId=ui.evalDraft?.studentId;
    const work=async()=>{
      if(LIVE){await api('/api/evaluation-reviews/'+encodeURIComponent(id)+'/cancel',{method:'POST',body:{}});if(!await refreshWorkspace())return;}
      else {const draft=byId('evaluations',request.evaluationId);if(!draft||draft.status!=='draft'||newestReview(draft.id)?.id!==request.id){toast(tr('Open the latest review request for this draft.','افتح أحدث طلب مراجعة لهذه المسودة.'));return;}request.status='cancelled';draft.reviewRequired=false;if(ui.evalDraft?.evaluationId===request.evaluationId)ui.evalDraft.reviewRequired=false;save();}
      closeModal();if(studentId&&canInspect(studentId))startEvaluation(studentId);else render();toast(tr('Request withdrawn. The author can edit the draft.','سُحب الطلب. يمكن لصاحب التقييم تعديل المسودة.'));
    };
    if(LIVE)await runLive(work,target);else await work();
  }
  async function reviewGoal(id,target){
    const goal=byId('goals',id);if(!goal||!canInspect(goal.studentId)||!byId('students',goal.studentId)?.active||goal.reviewedAt)return;
    const work=async()=>{if(LIVE){await api('/api/goals/'+encodeURIComponent(id)+'/review',{method:'POST',body:{}});if(!await refreshWorkspace())return;}else {goal.reviewedAt=now();save();}closeModal();render();toast(tr('Teaching goal marked as reviewed.','تمت مراجعة الهدف التدريبي.'));};
    if(LIVE)await runLive(work,target);else await work();
  }

  function validateScores(){const d=ui.evalDraft;return !!d&&d.scores.length===d.questions.length&&d.scores.every(v=>Number.isInteger(v)&&v>=1&&v<=10);}
  async function persistEvaluation(publish){
    if(LIVE){await persistLiveEvaluation(publish);return;}
    const draft=ui.evalDraft;if(!draft)return;
    try{demoSaveEvaluation(draft,publish);closeModal();if(publish){ui.page='evaluations';ui.evalDraft=null;render();window.scrollTo({top:0,behavior:'auto'});toast(tr('Rating published.','نُشر التقييم.'));}else{render();toast(tr('Draft saved.','حُفظت المسودة.'));}}
    catch(err){closeModal();error('evaluation-error',err.message);}
  }
  async function exportReport(){
    if(LIVE){await exportLiveReport();return;}
    if(ui.role!=='admin')return;
    const data=reportData();const categoryNames=Array.from(new Set(data.flatMap(r=>r.evaluation?.questions.map(label)||[])));
    const columns=[tr('Resident','المقيم'),tr('Email','البريد الإلكتروني'),tr('Program','البرنامج'),tr('Training year','سنة التدريب'),tr('Supervisor','المشرف'),tr('Period','الفترة'),tr('Overall rating / 10','التقييم الإجمالي من ١٠'),tr('File count','عدد الملفات'),tr('Evaluation status','حالة التقييم'),tr('Account status','حالة الحساب'),...categoryNames];
    const rows=data.map(r=>[label(r.student.name),r.student.email,programName(r.programId),r.year,r.supervisorId==='admin'?tr('Dr. Khaled Abdelazim','د. خالد عبد العظيم'):personName('doctors',r.supervisorId),ui.reportPeriod,r.evaluation?fmt(rating(r.evaluation)):'',r.files.length,r.evaluation?tr('Published','منشور'):tr('Not evaluated','لم يُقيَّم'),r.student.active?tr('Active','نشط'):tr('Inactive','غير نشط'),...categoryNames.map(name=>{const idx=r.evaluation?.questions.findIndex(q=>label(q)===name);return idx>=0?r.evaluation.scores[idx]:'';})]);
    const cell=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const csv='\uFEFF'+[columns,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`Taqyeem-Report-${ui.reportPeriod}-${ui.lang}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(tr('The filtered report was downloaded.','تم تنزيل التقرير حسب التصفية المحددة.'));
  }
  let workspaceGeneration=0;
  let lockChannel=null;
  let pendingLockCsrf=null;
  try{lockChannel=new BroadcastChannel('taqyeem-workspace-lock');lockChannel.onmessage=event=>{if(event.data?.type==='lock'&&LIVE&&!ui.locked&&session?.authenticated)lockWorkspace({broadcast:false,revoke:false});};}catch(_){}
  function setLockFlag(value){try{if(value)sessionStorage.setItem(LOCK_KEY,'1');else sessionStorage.removeItem(LOCK_KEY);}catch(_){} }
  function renderLock(){
    document.documentElement.lang=ui.lang;document.documentElement.dir=ui.lang==='ar'?'rtl':'ltr';document.body.classList.add('auth-mode');document.body.classList.toggle('live-mode',LIVE);document.title=tr('Taqyeem — Screen locked','تقييم — الشاشة مقفلة');
    document.getElementById('overlay-root').innerHTML='';document.getElementById('toast-root').innerHTML='';document.body.style.overflow='';
    document.getElementById('app').innerHTML=`<main class="lock-screen"><div class="lock-card">${brand()}<div class="auth-confirm-icon">${icon('lock',30)}</div><h1>${tr('Screen locked','الشاشة مقفلة')}</h1><p>${LIVE?tr('Sign in again to open your workspace.','سجّل الدخول مجدداً لفتح مساحة العمل.'):tr('Demo lock preview. The live app requires you to sign in again.','معاينة القفل التجريبي. يتطلب التطبيق الفعلي تسجيل الدخول مجدداً.')}</p>${ui.lockStatus?`<p class="lock-status" role="status">${esc(ui.lockStatus)}</p>`:''}<div class="stack mt20">${LIVE?button(ui.lockPending?tr('Securing session…','جارٍ إنهاء الجلسة…'):tr('Sign in again','تسجيل الدخول مجدداً'),'lock-signin','arrow','primary w100',ui.lockPending?'disabled':''):button(tr('Unlock demo','فتح العرض التجريبي'),'unlock-demo','lock','primary w100',ui.lockPending?'disabled':'')}<button class="language-switch" data-action="language">${icon('globe',14)}${tr('العربية','English')}</button></div><small>${tr('Automatically locks after 15 minutes of inactivity.','تُقفل تلقائياً بعد ١٥ دقيقة من عدم النشاط.')}</small></div></main>`;
  }
  async function revokeLockedSession(originalCsrf){
    // Never resolve a fresh session here: a different tab may have signed in since this screen locked.
    if(!originalCsrf)return false;
    let response;try{response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':originalCsrf},body:'{}',signal:AbortSignal.timeout(15000)});}catch(_){throw new Error(tr('This screen is hidden. Reconnect to finish signing out.','تم إخفاء هذه الشاشة. أعد الاتصال لإكمال تسجيل الخروج.'));}
    if(response.status===401||response.status===403)return false;
    if(!response.ok)throw new Error(tr('This screen is hidden. Try signing in again when connected.','تم إخفاء هذه الشاشة. حاول تسجيل الدخول مجدداً عند الاتصال.'));
    return true;
  }
  async function lockWorkspace({broadcast=true,revoke=true}={}){
    if(lockInFlight||ui.locked)return;
    const draft=ui.evalDraft?JSON.parse(JSON.stringify(ui.evalDraft)):null;const frozen=draftFrozen();const originalCsrf=LIVE?session?.csrfToken:null;
    lockInFlight=true;workspaceGeneration++;ui.locked=true;ui.lockPending=true;ui.lockStatus='';setLockFlag(true);closeModal();renderLock();
    if(LIVE&&broadcast)try{lockChannel?.postMessage({type:'lock'});}catch(_){}
    let saved=true;
    try{
      if(draft&&!frozen&&revoke){try{if(LIVE)await api('/api/evaluations/draft',{method:'POST',body:evaluationPayload(draft)});else demoSaveEvaluation(draft,false);}catch(_){saved=false;}}
      if(LIVE){resetLiveSession();if(revoke&&originalCsrf){pendingLockCsrf=originalCsrf;await revokeLockedSession(originalCsrf);pendingLockCsrf=null;}}
      else ui.evalDraft=null;
      ui.lockStatus=saved?(LIVE?tr('Your screen is locked. Saved drafts are available after sign-in.','الشاشة مقفلة. تتوفر المسودات المحفوظة بعد تسجيل الدخول.'):tr('Your demo workspace is saved in this browser.','حُفظ العرض التجريبي في هذا المتصفح.')):tr('The screen is locked. Your latest unsaved edits could not be saved.','الشاشة مقفلة. تعذّر حفظ آخر التعديلات غير المحفوظة.');
    }catch(_){ui.lockStatus=tr('This screen is hidden. Reconnect to finish signing out.','تم إخفاء هذه الشاشة. أعد الاتصال لإكمال تسجيل الخروج.');}
    finally{if(LIVE)resetLiveSession();ui.lockPending=false;lockInFlight=false;renderLock();}
  }
  async function resumeFromLock(){
    if(!ui.locked||ui.lockPending)return;
    if(!LIVE){ui.locked=false;ui.lockStatus='';setLockFlag(false);lastInteraction=Date.now();render();return;}
    const generation=workspaceGeneration;const csrf=pendingLockCsrf;ui.lockPending=true;renderLock();
    try{
      if(csrf)await revokeLockedSession(csrf);
      if(generation!==workspaceGeneration||!ui.locked)return;
      if(pendingLockCsrf===csrf)pendingLockCsrf=null;ui.lockPending=false;resetLiveSession();ui.locked=false;auth.state='signin';auth.token=null;auth.email='';auth.error='';auth.developmentUrl=null;renderAuth();
    }catch(_){if(generation!==workspaceGeneration||!ui.locked)return;ui.lockStatus=tr('Reconnect, then try again. Your workspace stays hidden.','أعد الاتصال ثم حاول مجدداً. تبقى مساحة العمل مخفية.');ui.lockPending=false;renderLock();}
  }
  window.addEventListener('online',async()=>{
    if(!LIVE||!ui.locked||!pendingLockCsrf||lockInFlight)return;
    const generation=workspaceGeneration;const csrf=pendingLockCsrf;
    try{await revokeLockedSession(csrf);if(generation!==workspaceGeneration||!ui.locked||pendingLockCsrf!==csrf)return;pendingLockCsrf=null;ui.lockStatus=tr('Your workspace is hidden. Sign in again when you are ready.','مساحة العمل مخفية. سجّل الدخول مجدداً عندما تكون مستعداً.');renderLock();}catch(_){}
  });
  function checkIdleLock(){if(!ui.locked&&(!LIVE||session?.authenticated)&&Date.now()-lastInteraction>=15*60*1000)lockWorkspace();}
  ['pointerdown','keydown','scroll','touchstart'].forEach(type=>document.addEventListener(type,()=>{checkIdleLock();if(!ui.locked)lastInteraction=Date.now();},{passive:true}));
  window.addEventListener('focus',checkIdleLock);window.addEventListener('pageshow',checkIdleLock);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIdleLock();});setInterval(checkIdleLock,10000);

  // Live mode uses only authenticated server responses. Demo-only state never enters this path.
  async function api(path,{method='GET',body,raw=false}={}){
    const generation=workspaceGeneration;const assertCurrent=()=>{if(generation!==workspaceGeneration){const stale=new Error('Workspace changed');stale.staleWorkspace=true;throw stale;}};
    const headers={Accept:raw?'text/csv':'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(method!=='GET'&&session?.authenticated)headers['X-CSRF-Token']=session.csrfToken;
    let response;
    try{response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch(_){assertCurrent();throw new Error(tr('Connection unavailable. Your changes have not been confirmed. Please try again.','تعذر الاتصال. لم يتم تأكيد حفظ التغييرات. يرجى المحاولة مجدداً.'));}
    assertCurrent();
    if(!response.ok){let payload;try{payload=await response.json();}catch(_){}assertCurrent();const failure=new Error(payload?.error?.message||tr('This request could not be completed. Please try again.','تعذر إكمال الطلب. يرجى المحاولة مجدداً.'));failure.status=response.status;failure.code=payload?.error?.code;throw failure;}
    const result=raw?await response.blob():response.status===204?{}:await response.json();assertCurrent();return result;
  }
  function applyServerDate(period,today){
    if(/^\d{4}-\d{2}$/.test(period||'')){const changed=PERIOD!==period;PERIOD=period;const d=new Date(period+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);PREVIOUS=d.toISOString().slice(0,7);if(changed)ui.reportPeriod=PERIOD;}
    if(/^\d{4}-\d{2}-\d{2}$/.test(today||''))DEMO_DATE=today;
  }
  function rememberInvitation(result){if(result?.invitation?.url)invitationUrls.set(result.invitation.id,result.invitation.url);}
  async function refreshWorkspace(){
    const generation=workspaceGeneration;const userId=session?.user?.id;const result=await api('/api/workspace');
    if(generation!==workspaceGeneration||ui.locked||!session?.authenticated||session.user.id!==userId)return false;
    const next=emptyWorkspace();
    for(const collection of ['students','doctors','programs','evaluations','files','invitations','activity','observations','goals','reviewers','reviewRequests'])next[collection]=Array.isArray(result.data?.[collection])?result.data[collection]:[];
    // A student receives only their own profile, file references, and scalar rating from the server.
    if(ui.role==='student'){for(const collection of ['doctors','programs','evaluations','invitations','activity','observations','goals','reviewers','reviewRequests'])next[collection]=[];}
    db=next;studentRating=result.studentRating||null;applyServerDate(result.period,result.today);
    if(db.programs.length&&!byId('programs',ui.questionProgram))ui.questionProgram=db.programs[0].id;return true;
  }
  function resetLiveSession(){
    workspaceGeneration++;session=null;db=emptyWorkspace();studentRating=null;invitationUrls.clear();ui.evalDraft=null;ui.questionDraft=null;ui.mobileOpen=false;closeModal();
  }
  async function establishSession(){
    session=await api('/api/session');
    if(!session.authenticated){session=null;auth.state='signin';return;}
    if(!['admin','doctor','student'].includes(session.user?.role))throw new Error(tr('This account does not have a valid workspace role.','لا يملك هذا الحساب دوراً صالحاً في مساحة العمل.'));
    ui.locked=false;ui.lockPending=false;ui.lockStatus='';pendingLockCsrf=null;setLockFlag(false);lastInteraction=Date.now();
    db=emptyWorkspace();studentRating=null;invitationUrls.clear();ui.evalDraft=null;ui.questionDraft=null;
    ui.role=session.user.role;ui.overviewFilter=ui.role==='admin'?'all':'pending';ui.dashboardProgram='all';ui.doctorId=session.user.id;ui.studentId=session.user.id;ui.page=ui.role==='student'?'student':'overview';
    applyServerDate(session.period,session.today);await refreshWorkspace();auth.state='ready';
  }
  async function bootLive(){
    document.body.classList.add('live-mode');if(ui.locked&&!auth.token)renderLock();else renderAuth();
    try{
      // Session resolution never consumes a login or invitation token.
      session=await api('/api/session');
      if(auth.token){
        ui.locked=false;
        if(auth.kind==='invite'){auth.invitation=await api('/api/auth/invitation',{method:'POST',body:{token:auth.token}});auth.state='invite';}
        else auth.state='login';
        renderAuth();return;
      }
      if(ui.locked){resetLiveSession();ui.lockStatus=tr('Your workspace stays hidden until you sign in again.','تبقى مساحة العمل مخفية حتى تسجيل الدخول مجدداً.');renderLock();return;}
      if(session.authenticated){
        lastInteraction=Date.now();ui.role=session.user.role;ui.overviewFilter=ui.role==='admin'?'all':'pending';ui.dashboardProgram='all';ui.doctorId=session.user.id;ui.studentId=session.user.id;ui.page=ui.role==='student'?'student':'overview';applyServerDate(session.period,session.today);await refreshWorkspace();auth.state='ready';
      }else{session=null;auth.state='signin';}
      render();
    }catch(err){if(ui.locked){resetLiveSession();ui.lockStatus=tr('This screen is hidden. Reconnect to sign in again.','تم إخفاء الشاشة. أعد الاتصال لتسجيل الدخول مجدداً.');renderLock();return;}auth.state='error';auth.error=err.message;renderAuth();}
  }
  function renderAuth(){
    document.body.classList.add('live-mode','auth-mode');document.documentElement.lang=ui.lang;document.documentElement.dir=ui.lang==='ar'?'rtl':'ltr';document.title=tr('Taqyeem — Psychiatry, progressing','تقييم — نرتقي بالطب النفسي');
    const pending=auth.state==='loading';const invitation=auth.invitation;
    let title=tr('Sign in','تسجيل الدخول');
    let intro=tr('Enter your hospital email.','أدخل بريدك الإلكتروني بالمستشفى.');
    let body='';
    if(pending){title=tr('Welcome to Taqyeem.','أهلاً بك في تقييم.');intro=tr('Opening your workspace…','جارٍ فتح مساحة العمل…');body='<div class="auth-loading" role="status"><span class="auth-spinner"></span></div>';}
    else if(auth.state==='login'){
      title=tr('Welcome back','أهلاً بعودتك');intro=tr('Continue to your workspace.','تابع إلى مساحة عملك.');
      body=`<div class="auth-confirm-icon">${icon('lock',27)}</div>${button(tr('Continue','متابعة'),'auth-consume','arrow','primary w100')}<button class="auth-text-button" data-action="auth-reset">${tr('Use a different email','استخدام بريد آخر')}</button>`;
    }else if(auth.state==='invite'){
      title=tr('You’re invited to Taqyeem.','أنت مدعو للانضمام إلى تقييم.');intro=tr('Accept your invitation to get started.','اقبل دعوتك للبدء.');
      body=`<div class="auth-invitation"><span class="auth-confirm-icon">${icon(invitation?.role==='admin'?'shield':'stethoscope',27)}</span><h2>${esc(label(invitation?.name))}</h2><p>${roleName(invitation?.role)}</p>${invitation?.expiresAt?`<small>${tr('Invitation expires','تنتهي الدعوة في')} ${dateLabel(invitation.expiresAt)}</small>`:''}</div>${button(tr('Accept invitation & continue','قبول الدعوة والمتابعة'),'auth-accept','check','primary w100')}`;
    }else if(auth.state==='sent'){
      title=tr('Check your inbox.','تحقّق من بريدك.');intro=tr('Open your sign-in link.','افتح رابط الدخول.');
      body=`<div class="auth-confirm-icon">${icon('mail',28)}</div><p class="auth-detail">${tr('If this email belongs to an active Taqyeem account, a sign-in link will arrive shortly.','إذا كان هذا البريد مرتبطاً بحساب نشط في تقييم، فسيصل إليه رابط الدخول قريباً.')}</p><p class="auth-email ltr">${esc(auth.email)}</p>${auth.developmentUrl?`<div class="info-box amber"><span>${tr('Local development only','للتطوير المحلي فقط')}<br><a class="auth-dev-link" href="${esc(auth.developmentUrl)}">${tr('Open local sign-in link','فتح رابط الدخول المحلي')}</a></span></div>`:''}<button class="auth-text-button" data-action="auth-reset">${tr('Try another email','تجربة بريد آخر')}</button>`;
    }else if(auth.state==='error'){
      title=tr('Unable to sign in','تعذر تسجيل الدخول');intro=tr('We could not open this session.','تعذر فتح الجلسة.');
      body=`<div class="form-error" role="alert">${esc(auth.error)}</div><div class="auth-error-actions">${button(tr('Try again','المحاولة مجدداً'),'auth-retry','refresh','primary w100')}${button(tr('Request a new sign-in link','طلب رابط دخول جديد'),'auth-reset','','w100')}</div>`;
    }else{
      body=`<form data-form="signin" class="auth-form"><div class="form-field"><label for="signin-email">${tr('Email','البريد الإلكتروني')}</label><input id="signin-email" name="email" type="email" autocomplete="email" inputmode="email" dir="ltr" placeholder="you@hospital.org" value="${esc(auth.email)}" required maxlength="150"></div><div class="form-error" role="alert"></div><button type="submit" class="btn primary w100">${tr('Send sign-in link','إرسال رابط الدخول')}${icon('arrow',16)}</button></form><p class="auth-small">${tr('Need access? Ask Dr. Khaled Abdelazim.','تحتاج إلى حساب؟ تواصل مع د. خالد عبد العظيم.')}</p>`;
    }
    document.getElementById('app').innerHTML=`<div class="auth-shell"><section class="auth-story">${brand()}<div class="auth-story-content"><h1>${tr('Psychiatry<br>residency.','التدريب في<br>الطب النفسي.')}</h1><div class="auth-owner"><span class="auth-owner-mark">KA</span><div><strong>${tr('Dr. Khaled Abdelazim','د. خالد عبد العظيم')}</strong><small>${tr('Program administrator','مسؤول البرنامج')}</small></div></div></div><div class="auth-orbits" aria-hidden="true"><span></span><span></span><span></span><i></i></div></section><section class="auth-panel"><div class="auth-panel-top"><span></span><button class="language-switch" data-action="language">${icon('globe',14)}${tr('العربية','English')}</button></div><div class="auth-card"><div class="auth-mini-brand">${brand()}</div><h1>${title}</h1><p class="auth-intro">${intro}</p>${body}</div></section></div>`;
    document.getElementById('overlay-root').innerHTML='';document.body.style.overflow='';
  }
  function liveFailure(err,form){
    if(err.staleWorkspace)return;
    if(ui.locked){renderLock();return;}
    if(err.status===401){resetLiveSession();auth.token=null;auth.state='signin';auth.error='';renderAuth();toast(tr('Your session has ended. Please sign in again.','انتهت جلستك. يرجى تسجيل الدخول مجدداً.'));return;}
    if(auth.token && !form){auth.state='error';auth.error=err.message;renderAuth();return;}
    const message=err.status===409?tr('This record changed while you were editing. Reload the latest version before saving again. ','تغير هذا السجل أثناء التعديل. حمّل أحدث نسخة قبل الحفظ مجدداً. ')+err.message:err.message;
    if(form?.isConnected){error(form,message);return;}
    if(ui.page==='evaluate'&&ui.evalDraft){closeModal();error('evaluation-error',message);if(err.status===409){const area=document.getElementById('evaluation-error');if(area)area.innerHTML=`${esc(message)}<div class="mt20">${button(tr('Reload current assessment','تحميل التقييم الحالي'),'reload-evaluation','refresh','small')}</div>`;}return;}
    toast(message);
  }
  async function runLive(work,element=null){
    if(liveBusy)return;liveBusy=true;document.body.classList.add('request-pending');const form=element?.tagName==='FORM'?element:element?.closest?.('form');
    const controls=Array.from(document.querySelectorAll('button[type="submit"],[data-action="save-draft"],[data-action="publish-evaluation"],[data-action="auth-consume"],[data-action="auth-accept"]')).filter(el=>!el.disabled);controls.forEach(el=>el.disabled=true);
    try{await work();}catch(err){liveFailure(err,form);}finally{liveBusy=false;document.body.classList.remove('request-pending');controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
  }
  async function commitLive(path,method,body,{message='',showInvitation=false}={}){
    const result=await api(path,{method,body});rememberInvitation(result);if(!await refreshWorkspace())return result;closeModal();render();
    if(showInvitation&&result.invitation?.id)showLiveInvite(result.invitation.id);else if(message)toast(message);
    return result;
  }
  function showLiveInvite(id){
    if(ui.role!=='admin')return;const invite=byId('invitations',id);if(!invite)return;const url=invitationUrls.get(id);
    modal(url?tr('Your invitation link is ready','رابط دعوتك جاهز'):tr('Manage invitation','إدارة الدعوة'),tr('Share this private link with the person named below.','شارك هذا الرابط الخاص مع الشخص الموضح أدناه.'),`<div class="info-box">${icon('mail',18)}<span><strong>${esc(label(invite.name))}</strong><br><bdi>${esc(invite.email)}</bdi><br>${roleName(invite.role)}${invite.programId?' · '+esc(programName(invite.programId)):''}</span></div>${url?`<div class="form-field mt20"><label for="invitation-url">${tr('Personal invitation link','رابط الدعوة الشخصي')}</label><div class="invitation-link"><input id="invitation-url" value="${esc(url)}" readonly dir="ltr">${button(tr('Copy','نسخ'),'copy-invite','copy','small','data-id="'+id+'"')}</div><small>${tr('Expires','تنتهي في')} ${dateLabel(invite.expiresAt)}.</small></div><div class="info-box mt20">${icon('info',16)}<span>${tr('The link is shown only when created or reissued. Copy it now to share with the recipient. An email has not been sent.','يظهر الرابط عند إنشائه أو إعادة إصداره فقط. انسخه الآن لمشاركته مع المدعو. لم تُرسل رسالة بريدية.')}</span></div>`:`<div class="info-box mt20">${icon('lock',16)}<span>${tr('For privacy, saved invitation lists do not contain activation links. Reissue a link to share a new one; the earlier link will stop working.','حفاظاً على الخصوصية، لا تحتوي قائمة الدعوات المحفوظة على روابط التفعيل. أعد إصدار رابط جديد لمشاركته؛ وسيتوقف الرابط السابق عن العمل.')}</span></div>`}`,button(tr('Done','تم'),'close')+(!url?button(tr('Reissue link','إعادة إصدار الرابط'),'reissue-invite','refresh','primary','data-id="'+id+'"'):''));
  }
  async function liveAction(action,target){
    const id=target.dataset.id;
    if(liveBusy&&action!=='close')return true;
    if(['role','reset','confirm-reset','tour','preview-invite','accept-invite'].includes(action))return true;
    if(action==='language'){
      closeModal();ui.lang=ui.lang==='en'?'ar':'en';try{localStorage.setItem('taqyeem-language',ui.lang);}catch(_){}render();return true;
    }
    if(action==='auth-reset'){resetLiveSession();auth.token=null;auth.kind=null;auth.invitation=null;auth.error='';auth.developmentUrl=null;auth.state='signin';renderAuth();return true;}
    if(action==='auth-retry'){auth.state='loading';auth.error='';await bootLive();return true;}
    if(action==='auth-consume'||action==='auth-accept'){
      if(!auth.token)return true;
      await runLive(async()=>{await api(action==='auth-accept'?'/api/auth/accept-invitation':'/api/auth/consume',{method:'POST',body:{token:auth.token}});auth.token=null;auth.kind=null;auth.invitation=null;auth.error='';await establishSession();render();},target);return true;
    }
    if(!session?.authenticated)return true;
    if(action==='logout'){
      await runLive(async()=>{await api('/api/auth/logout',{method:'POST',body:{}});resetLiveSession();auth.token=null;auth.state='signin';auth.email='';auth.developmentUrl=null;renderAuth();},target);return true;
    }
    if(action==='reload-evaluation'){
      const studentId=ui.evalDraft?.studentId;if(studentId)await runLive(async()=>{if(!await refreshWorkspace())return;startEvaluation(studentId);},target);return true;
    }
    if(['view-invite','copy-invite','reissue-invite','revoke-invite','confirm-revoke-invite','toggle-student','confirm-deactivate-student','toggle-doctor','confirm-deactivate-doctor'].includes(action)&&ui.role!=='admin')return true;
    if(action==='view-invite'){showLiveInvite(id);return true;}
    if(action==='copy-invite'){
      const url=invitationUrls.get(id);if(!url){showLiveInvite(id);return true;}
      try{await navigator.clipboard.writeText(url);toast(tr('Invitation link copied.','تم نسخ رابط الدعوة.'));}catch(_){const field=document.getElementById('invitation-url');field?.focus();field?.select();toast(tr('Select and copy the invitation link.','حدّد رابط الدعوة وانسخه.'));}return true;
    }
    if(action==='reissue-invite'){
      await runLive(async()=>{await commitLive('/api/admin/invitations/'+encodeURIComponent(id)+'/reissue','POST',{}, {showInvitation:true});},target);return true;
    }
    if(action==='revoke-invite'){
      const invitation=byId('invitations',id);if(!invitation)return true;
      modal(tr('Revoke this invitation?','إلغاء هذه الدعوة؟'),tr('The activation link will stop working.','سيتوقف رابط التفعيل عن العمل.'),`<p class="subtle">${esc(label(invitation.name))} · <bdi>${esc(invitation.email)}</bdi></p>`,button(tr('Keep invitation','الإبقاء على الدعوة'),'close')+button(tr('Revoke invitation','إلغاء الدعوة'),'confirm-revoke-invite','close','danger','data-id="'+id+'"'));return true;
    }
    if(action==='confirm-revoke-invite'){
      await runLive(async()=>{await commitLive('/api/admin/invitations/'+encodeURIComponent(id),'DELETE',{},{message:tr('Invitation revoked.','تم إلغاء الدعوة.')});invitationUrls.delete(id);},target);return true;
    }
    if(action==='toggle-student'&&!byId('students',id)?.active){await runLive(()=>commitLive('/api/admin/students/'+encodeURIComponent(id),'PATCH',{active:true},{message:tr('Resident reactivated.','تمت إعادة تفعيل المقيم.')}),target);return true;}
    if(action==='confirm-deactivate-student'){await runLive(()=>commitLive('/api/admin/students/'+encodeURIComponent(id),'PATCH',{active:false},{message:tr('Resident deactivated. Their history is preserved.','أُلغي تفعيل المقيم مع الاحتفاظ بسجله.')}),target);return true;}
    if(action==='toggle-doctor'&&!byId('doctors',id)?.active){await runLive(()=>commitLive('/api/admin/doctors/'+encodeURIComponent(id),'PATCH',{active:true},{message:tr('Doctor reactivated.','تمت إعادة تفعيل الطبيب.')}),target);return true;}
    if(action==='confirm-deactivate-doctor'){await runLive(()=>commitLive('/api/admin/doctors/'+encodeURIComponent(id),'PATCH',{active:false},{message:tr('Doctor deactivated. Evaluation history is preserved.','أُلغي تفعيل الطبيب مع الاحتفاظ بسجل التقييمات.')}),target);return true;}
    if(action==='review-file'){
      if(ui.role==='student')return true;await runLive(()=>commitLive('/api/files/'+encodeURIComponent(id)+'/review','POST',{reviewed:true,expectedVersion:byId('files',id)?.version||1},{message:tr('File marked as reviewed.','تم تأكيد مراجعة الملف.')}),target);return true;
    }
    return false;
  }
  async function submitLive(form,data,type){
    if(type==='signin'){
      const email=String(data.get('email')||'').trim().toLowerCase();if(!email)return;
      await runLive(async()=>{const result=await api('/api/auth/request-link',{method:'POST',body:{email,lang:ui.lang}});auth.email=email;auth.developmentUrl=result.developmentLoginUrl||null;auth.state='sent';renderAuth();},form);return;
    }
    if(!session?.authenticated)return;
    if(['student','doctor','invite','questions'].includes(type)&&ui.role!=='admin')return;
    await runLive(async()=>{
      if(type==='file'){
        if(ui.role!=='student')return;
        const number=normalFileNumber(String(data.get('number')||''));const date=String(data.get('date')||'');
        if(!/^[A-Z0-9_\/-]{1,40}$/.test(number)){error(form,tr('Enter a file number using letters, numbers, hyphens, slashes, or underscores only.','أدخل رقم ملف باستخدام الحروف والأرقام والشرطات والشرطات المائلة فقط.'));return;}
        await commitLive('/api/files','POST',{number,date},{message:tr('File added.','أُضيف الملف.')});return;
      }
      if(type==='student'||type==='doctor'||type==='invite'){
        const nameEn=String(data.get('nameEn')||'').trim();const nameAr=String(data.get('nameAr')||'').trim()||nameEn;const email=String(data.get('email')||'').trim().toLowerCase();
        let payload={nameEn,nameAr,email};let path;let method='POST';
        if(type==='student'){
          payload={...payload,programId:String(data.get('programId')||''),year:Number(data.get('year')),doctorId:String(data.get('doctorId')||''),reviewIntervalWeeks:Number(data.get('reviewIntervalWeeks'))};path='/api/admin/students';if(form.dataset.id){path+='/'+encodeURIComponent(form.dataset.id);method='PATCH';}
          if(!payload.doctorId){error(form,tr('Invite an eligible supervisor and have them accept before adding this resident.','ادعُ مشرفاً لهذا البرنامج وانتظر قبوله للدعوة قبل إضافة المقيم.'));return;}
        }else if(type==='doctor'){payload.programs=data.getAll('programs').map(String);path='/api/admin/doctors/'+encodeURIComponent(form.dataset.id);method='PATCH';}
        else {payload={...payload,programId:String(data.get('programId')||''),role:'doctor'};path='/api/admin/invitations';}
        await commitLive(path,method,payload,{showInvitation:true,message:type==='student'?tr('Resident details saved.','تم حفظ بيانات المقيم.'):tr('Doctor details saved.','تم حفظ بيانات الطبيب.')});return;
      }
      if(type==='questions'){
        const draft=ui.questionDraft;if(!draft)return;
        if(!draft.questions.length||draft.questions.some(q=>!q.en.trim()||!q.ar.trim())){error(form,tr('Enter an English and Arabic label for every category.','أدخل عنواناً بالإنجليزية والعربية لكل فئة.'));return;}
        const result=await api('/api/admin/programs/'+encodeURIComponent(draft.programId)+'/questions',{method:'PUT',body:{expectedVersion:draft.expectedVersion,questions:draft.questions.map(q=>({id:q.id,en:q.en.trim(),ar:q.ar.trim()}))}});
        if(!await refreshWorkspace())return;ui.questionDraft=null;render();toast(tr('Questions saved as a new version. Earlier assessments are preserved.','حُفظت الأسئلة في نسخة جديدة مع الاحتفاظ بالتقييمات السابقة.'));return result;
      }
    },form);
  }
  async function persistLiveEvaluation(publish){
    const draft=ui.evalDraft;if(!draft||!canInspect(draft.studentId))return;
    if(publish&&!validateScores()){error('evaluation-error',tr('Please select a score from 1 to 10 for every category before publishing.','يرجى اختيار درجة من ١ إلى ١٠ لكل فئة قبل النشر.'));return;}
    await runLive(async()=>{
      const payload={studentId:draft.studentId,period:draft.period,templateVersionId:draft.templateVersionId,scores:draft.scores.slice(),note:{...draft.note},expectedVersion:draft.expectedVersion,expectedResidentVersion:draft.expectedResidentVersion,basePublishedId:draft.basePublishedId};
      await api('/api/evaluations/'+(publish?'publish':'draft'),{method:'POST',body:payload});if(!await refreshWorkspace())return;closeModal();
      if(publish){ui.evalDraft=null;ui.page='evaluations';render();toast(tr('Rating published. The resident can see their overall score.','تم نشر التقييم. يمكن للمقيم رؤية درجته الإجمالية.'));}
      else {startEvaluation(draft.studentId);toast(tr('Draft saved. The resident’s published rating has not changed.','حُفظت المسودة. لم يتغير التقييم المنشور للمقيم.'));}
    });
  }
  async function exportLiveReport(){
    if(ui.role!=='admin')return;
    await runLive(async()=>{const params=new URLSearchParams({programId:ui.reportProgram,studentId:ui.reportStudent,period:ui.reportPeriod,lang:ui.lang,format:'csv'});const blob=await api('/api/reports?'+params,{raw:true});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Taqyeem-Psychiatry-Report-${ui.reportPeriod}-${ui.lang}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(tr('The published assessment report was downloaded.','تم تنزيل تقرير التقييمات المنشورة.'));});
  }

  const adminActions=new Set(['add-student','edit-student','toggle-student','confirm-deactivate-student','edit-doctor','toggle-doctor','confirm-deactivate-doctor','invite','view-invite','copy-invite','revoke-invite','confirm-revoke-invite','add-question','remove-question','export-report','print']);
  const supervisorActions=new Set(['add-observation','add-goal','review-goal','prepare-review','review-request','cancel-review','resident','evaluate','choose-evaluation','score','save-draft','confirm-publish','publish-evaluation','review-file','file-history','activity','file-filter','overview-filter','pending-evaluations']);
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-action]');
    if(!target){if(event.target.classList.contains('modal-backdrop'))closeModal();return;}
    const action=target.dataset.action;
    if(action==='lock-screen'){await lockWorkspace();return;}
    if(action==='unlock-demo'||action==='lock-signin'){await resumeFromLock();return;}
    if(ui.locked){if(action==='language'){ui.lang=ui.lang==='en'?'ar':'en';try{localStorage.setItem('taqyeem-language',ui.lang);}catch(_){}renderLock();}return;}
    if(LIVE && await liveAction(action,target))return;
    if(adminActions.has(action)&&ui.role!=='admin')return;
    if(supervisorActions.has(action)&&ui.role==='student')return;
    const id=target.dataset.id;
    switch(action){
      case 'add-observation':teachingForm('observation',id);break;
      case 'add-goal':teachingForm('goal',id);break;
      case 'review-goal':await reviewGoal(id,target);break;
      case 'correct-file':correctionForm(id);break;
      case 'file-history':fileHistory(id);break;
      case 'prepare-review':await prepareReview(target);break;
      case 'review-request':showReview(id);break;
      case 'cancel-review':await cancelReview(id,target);break;
      case 'role':
        if(!['admin','doctor','student'].includes(target.dataset.role))return;
        closeModal();ui.role=target.dataset.role;ui.page=ui.role==='student'?'student':'overview';ui.mobileOpen=false;ui.search='';ui.program='all';ui.status='active';ui.evalDraft=null;ui.questionDraft=null;ui.filesFilter='all';ui.overviewFilter=ui.role==='admin'?'all':'pending';ui.dashboardProgram='all';render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'dashboard-pending':
        if(ui.role!=='admin')return;ui.overviewFilter='pending';render();document.getElementById('admin-residents')?.scrollIntoView({behavior:'auto',block:'start'});break;
      case 'dashboard-residents':
        if(ui.role!=='admin')return;ui.page='students';ui.program='all';ui.search='';ui.status='active';render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'dashboard-reports':
        if(ui.role!=='admin')return;ui.page='reports';ui.reportProgram='all';ui.reportStudent='all';ui.reportPeriod=PERIOD;render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'dashboard-program':
        if(ui.role!=='admin'||!byId('programs',target.dataset.program))return;ui.page='students';ui.program=target.dataset.program;ui.search='';ui.status='active';render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'dashboard-files':
        if(ui.role!=='admin')return;ui.page='files';ui.filesFilter=target.dataset.filter==='pending'?'pending':'all';render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'nav':
        if(!allowedPages().includes(target.dataset.page))return;
        closeModal();ui.page=target.dataset.page;ui.mobileOpen=false;render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'language':
        closeModal();ui.lang=ui.lang==='en'?'ar':'en';try{localStorage.setItem('taqyeem-language',ui.lang);}catch(_){}render();break;
      case 'menu':ui.mobileOpen=!ui.mobileOpen;document.querySelector('.sidebar').classList.toggle('open',ui.mobileOpen);document.querySelector('.mobile-scrim').classList.toggle('open',ui.mobileOpen);break;
      case 'close':closeModal();break;
      case 'tour':showTour();break;
      case 'activity':showActivity();break;
      case 'resident':showResident(id);break;
      case 'evaluate':startEvaluation(id);break;
      case 'choose-evaluation':chooseEvaluation();break;
      case 'pending-evaluations':closeModal();ui.page='evaluations';render();window.scrollTo({top:0,behavior:'auto'});break;
      case 'add-student':studentForm();break;
      case 'edit-student':studentForm(id);break;
      case 'edit-doctor':doctorForm(id);break;
      case 'invite':invitationForm();break;
      case 'view-invite':showInvite(id);break;
      case 'copy-invite':{
        const invite=byId('invitations',id);if(!invite)return;
        try{await navigator.clipboard.writeText(inviteUrl(invite));toast(tr('Demo invitation link copied.','تم نسخ رابط الدعوة التجريبية.'));}catch(_){const field=document.getElementById('invitation-url');field?.focus();field?.select();toast(tr('Select and copy the invitation link above.','حدّد رابط الدعوة أعلاه وانسخه.'));}break;
      }
      case 'preview-invite':if(ui.role==='admin')previewInvite(id);break;
      case 'accept-invite':{
        const invite=byId('invitations',id);if(!invite||invite.status!=='pending'||new Date(invite.expiresAt)<new Date())return;
        if(db.students.some(s=>s.email.toLowerCase()===invite.email.toLowerCase())){toast(tr('This email now belongs to a resident. Create a new invitation with a different email.','هذا البريد مستخدم الآن لحساب مقيم. أنشئ دعوة جديدة ببريد مختلف.'));return;}
        let doctor=db.doctors.find(d=>d.email.toLowerCase()===invite.email.toLowerCase());
        if(!doctor){doctor={id:uid('d'),name:invite.name,email:invite.email,programs:[invite.programId],active:true,initials:initials(invite.name.en),color:'#547e92'};db.doctors.push(doctor);}
        if(!doctor.active){toast(tr('An administrator must reactivate this doctor first.','يجب على المسؤول إعادة تفعيل هذا الطبيب أولاً.'));return;}
        invite.status='accepted';invite.acceptedAt=now();activity('invite',`${invite.name.en} accepted a demo invitation.`,`قبل ${invite.name.ar} دعوة تجريبية.`);save();closeModal();ui.doctorId=doctor.id;ui.role='doctor';ui.page='overview';ui.overviewFilter='pending';ui.dashboardProgram='all';ui.evalDraft=null;render();toast(tr('Invitation accepted in the demo. An administrator can now assign residents.','قُبلت الدعوة في العرض. يمكن للمسؤول تعيين مقيمين الآن.'));break;
      }
      case 'revoke-invite':{
        const invite=byId('invitations',id);if(!invite)return;
        modal(tr('Revoke this invitation?','إلغاء هذه الدعوة؟'),tr('The demonstration link will stop working in this browser.','سيتوقف الرابط التجريبي عن العمل في هذا المتصفح.'),`<p class="subtle">${esc(label(invite.name))} · <bdi>${esc(invite.email)}</bdi></p>`,button(tr('Keep invitation','الإبقاء على الدعوة'),'close')+button(tr('Revoke invitation','إلغاء الدعوة'),'confirm-revoke-invite','close','danger','data-id="'+id+'"'));break;
      }
      case 'confirm-revoke-invite':{
        const invite=byId('invitations',id);if(invite){invite.status='revoked';save();closeModal();render();toast(tr('Demo invitation revoked.','تم إلغاء الدعوة التجريبية.'));}break;
      }
      case 'toggle-student':{
        const s=byId('students',id);if(!s)return;
        if(!s.active){const doctor=byId('doctors',s.doctorId);if(!doctor?.active||!doctor.programs.includes(s.programId)){toast(tr('Assign an active supervisor for this program before reactivating this resident.','عيّن مشرفاً نشطاً قبل إعادة تفعيل هذا المقيم.'));return;}s.active=true;activity('student',`${s.name.en} was reactivated.`,`أُعيد تفعيل ${s.name.ar}.`);save();closeModal();render();toast(tr('Resident reactivated.','تمت إعادة تفعيل المقيم.'));}
        else modal(tr('Deactivate this resident?','إلغاء تفعيل هذا المقيم؟'),esc(label(s.name)),`<div class="info-box amber">${icon('info',17)}<span>${tr('The account will become inactive. Evaluation history and submitted file numbers will remain available to the administrator. You can reactivate it later.','سيصبح الحساب غير نشط. تبقى التقييمات وأرقام الملفات محفوظة ومتاحة للمسؤول، ويمكن إعادة التفعيل لاحقاً.')}</span></div>`,button(tr('Keep active','الإبقاء نشطاً'),'close')+button(tr('Deactivate resident','إلغاء تفعيل المقيم'),'confirm-deactivate-student','trash','danger','data-id="'+id+'"'));break;
      }
      case 'confirm-deactivate-student':{
        const s=byId('students',id);if(s){s.active=false;activity('student',`${s.name.en} was deactivated.`,`أُلغي تفعيل ${s.name.ar}.`);save();closeModal();render();toast(tr('Resident deactivated. Their history is preserved.','أُلغي تفعيل المقيم مع الاحتفاظ بسجله.'));}break;
      }
      case 'toggle-doctor':{
        const d=byId('doctors',id);if(!d)return;
        if(!d.active){d.active=true;save();closeModal();render();toast(tr('Doctor reactivated.','تمت إعادة تفعيل الطبيب.'));break;}
        const assigned=activeStudents().filter(s=>s.doctorId===id);if(assigned.length){error(document.getElementById('doctor-form'),tr(`Reassign ${assigned.length} active residents before deactivating this doctor.`,`أعد تعيين ${assigned.length} من المقيمين النشطين قبل إلغاء تفعيل هذا الطبيب.`));break;}
        modal(tr('Deactivate this doctor?','إلغاء تفعيل هذا الطبيب؟'),esc(label(d.name)),`<p class="subtle">${tr('Past evaluations are preserved. The doctor can be reactivated later.','يُحتفظ بالتقييمات السابقة، ويمكن إعادة تفعيل الطبيب لاحقاً.')}</p>`,button(tr('Cancel','إلغاء'),'close')+button(tr('Deactivate doctor','إلغاء تفعيل الطبيب'),'confirm-deactivate-doctor','trash','danger','data-id="'+id+'"'));break;
      }
      case 'confirm-deactivate-doctor':{
        const d=byId('doctors',id);if(d&&!activeStudents().some(s=>s.doctorId===id)){d.active=false;activity('student',`${d.name.en} was deactivated.`,`أُلغي تفعيل ${d.name.ar}.`);save();closeModal();render();toast(tr('Doctor deactivated. Evaluation history is preserved.','أُلغي تفعيل الطبيب مع الاحتفاظ بسجل التقييمات.'));}break;
      }
      case 'overview-filter':
        ui.overviewFilter=target.dataset.filter;document.querySelectorAll('[data-action="overview-filter"]').forEach(b=>b.classList.toggle('active',b===target));updateOverviewTable();break;
      case 'file-filter':ui.filesFilter=target.dataset.filter;render();break;
      case 'review-file':{
        const f=byId('files',id);if(!f||!canInspect(f.studentId))return;f.reviewed=true;f.needsRecheck=false;f.version=(f.version||1)+1;f.reviewedAt=now();f.reviewedBy=ui.role==='admin'?'admin':ui.doctorId;save();render();toast(tr('File marked as reviewed.','تم تأكيد مراجعة الملف.'));break;
      }
      case 'score':{
        const d=ui.evalDraft;const index=Number(target.dataset.index);const score=Number(target.dataset.score);if(!d||draftFrozen()||!canInspect(d.studentId)||!Number.isInteger(index)||index<0||index>=d.questions.length||!Number.isInteger(score)||score<1||score>10)return;
        d.scores[index]=score;target.parentElement.querySelectorAll('button').forEach(b=>{const selected=Number(b.dataset.score)===score;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});const count=d.scores.filter(Number.isInteger).length;document.getElementById('evaluation-completion').textContent=count+' / '+d.questions.length;document.getElementById('evaluation-average').textContent=fmt(count===d.questions.length?avg(d.scores):null);document.getElementById('evaluation-error').textContent='';break;
      }
      case 'save-draft':await persistEvaluation(false);break;
      case 'confirm-publish':{
        if(!validateScores()){error('evaluation-error',tr('Please select a score from 1 to 10 for every category before publishing.','يرجى اختيار درجة من ١ إلى ١٠ لكل فئة قبل النشر.'));break;}
        const s=byId('students',ui.evalDraft.studentId);modal(tr('Publish this rating?','نشر هذا التقييم؟'),esc(label(s.name)),`<div class="rating-summary" style="padding-top:5px"><strong>${fmt(avg(ui.evalDraft.scores))}</strong><small> / 10</small><p>${tr('Overall score visible to the student','الدرجة الإجمالية التي ستظهر للطالب')}</p></div><div class="info-box">${icon('lock',17)}<span>${tr('The student sees only this number. Category scores and private notes remain in the doctor and administrator views.','يرى الطالب هذا الرقم فقط. تبقى درجات الفئات والملاحظات الخاصة في واجهتي الطبيب والمسؤول.')}</span></div>`,button(tr('Keep editing','متابعة التعديل'),'close')+button(tr('Publish rating','نشر التقييم'),'publish-evaluation','checkCircle','primary'));break;
      }
      case 'publish-evaluation':await persistEvaluation(true);break;
      case 'add-question':
        if(!ui.questionDraft)return;if(ui.questionDraft.questions.length>=20){toast(tr('Each program supports up to 20 categories.','يدعم كل برنامج حتى ٢٠ فئة.'));break;}ui.questionDraft.questions.push({id:uid('q'),en:'',ar:''});render();document.querySelector('.editable-question:last-child input')?.focus();break;
      case 'remove-question':
        if(ui.questionDraft?.questions.length>1){ui.questionDraft.questions.splice(Number(target.dataset.index),1);render();}break;
      case 'export-report':await exportReport();break;
      case 'print':window.print();break;
      case 'reset':
        modal(tr('Start fresh?','هل تريد البدء من جديد؟'),tr('Restore the original fictional demonstration data.','استعد البيانات التجريبية الأصلية.'),`<div class="info-box amber">${icon('refresh',17)}<span>${tr('This clears the changes you made in this browser, including draft evaluations, added users, and submitted demo file numbers.','يحذف هذا التغييرات التي أجريتها في هذا المتصفح، بما فيها المسودات والمستخدمون المضافون وأرقام الملفات التجريبية.')}</span></div>`,button(tr('Keep my changes','الاحتفاظ بالتغييرات'),'close')+button(tr('Reset demo','إعادة ضبط العرض'),'confirm-reset','refresh','primary'));break;
      case 'confirm-reset':
        db=window.makeTaqyeemSeed();normalizeDemoWorkflows();save();closeModal();Object.assign(ui,{role:'admin',page:'overview',program:'all',search:'',status:'active',doctorId:'d1',studentId:'s1',questionProgram:'adult',reportProgram:'all',reportStudent:'all',reportPeriod:PERIOD,filesFilter:'all',mobileOpen:false,evalDraft:null,questionDraft:null,overviewFilter:'all',dashboardProgram:'all'});try{history.replaceState(null,'',location.href.split('?')[0].split('#')[0]);}catch(_){}render();toast(tr('Demo restored. Ready to explore again.','تمت استعادة العرض. جاهز للتجربة من جديد.'));break;
    }
  });
  function updateOverviewTable(){const query=document.getElementById('overview-search')?.value.trim().toLowerCase()||'';const list=currentStudents().filter(s=>(!query||[s.name.en,s.name.ar].join(' ').toLowerCase().includes(query))&&(!ui.overviewFilter||ui.overviewFilter==='all'||(ui.overviewFilter==='pending'?reviewDue(s):!reviewDue(s))));const node=document.getElementById('overview-table');if(node)node.innerHTML=residentTable(list.slice(0,ui.role==='admin'?5:8));}
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='resident-search'){ui.search=el.value;document.getElementById('resident-table').innerHTML=residentTable(filteredStudents(),ui.role==='admin');}
    if(el.id==='overview-search')updateOverviewTable();
    if(el.id==='private-note'&&ui.evalDraft&&!draftFrozen())ui.evalDraft.note[ui.lang]=el.value;
    if(el.dataset.questionIndex!=null&&ui.role==='admin'&&ui.questionDraft){const q=ui.questionDraft.questions[Number(el.dataset.questionIndex)];if(q&&['en','ar'].includes(el.dataset.questionLang))q[el.dataset.questionLang]=el.value;}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.dataset.scoreIndex!=null){
      const draft=ui.evalDraft;const index=Number(el.dataset.scoreIndex);const value=el.value===''?null:Number(el.value);
      if(!draft||draftFrozen()||ui.role==='student'||!canInspect(draft.studentId)||!Number.isInteger(index)||index<0||index>=draft.questions.length||(value!==null&&(!Number.isInteger(value)||value<1||value>10)))return;
      draft.scores[index]=value;const count=draft.scores.filter(Number.isInteger).length;
      document.getElementById('evaluation-completion').textContent=count+' / '+draft.questions.length;
      document.getElementById('evaluation-average').textContent=fmt(count===draft.questions.length?avg(draft.scores):null);
      document.getElementById('evaluation-error').textContent='';return;
    }
    switch(el.id){
      case 'demo-doctor':
        if(LIVE||ui.role!=='doctor'||!db.doctors.some(d=>d.id===el.value&&d.active&&!d.pending))return;closeModal();ui.doctorId=el.value;ui.evalDraft=null;ui.page='overview';ui.overviewFilter='pending';render();break;
      case 'dashboard-chart-program':
        if(ui.role!=='admin'||(el.value!=='all'&&!byId('programs',el.value)))return;ui.dashboardProgram=el.value;document.getElementById('dashboard-chart-body').innerHTML=adminRatingBody(currentStudents());break;
      case 'resident-program':ui.program=el.value;render();break;
      case 'resident-status':ui.status=el.value;render();break;
      case 'student-program':{const select=document.getElementById('student-doctor');if(select)select.innerHTML=doctorOptions(el.value);break;}
      case 'question-program':ui.questionProgram=el.value;ui.questionDraft=null;render();break;
      case 'report-program':ui.reportProgram=el.value;ui.reportStudent='all';render();break;
      case 'report-student':ui.reportStudent=el.value;render();break;
      case 'report-period':ui.reportPeriod=el.value;render();break;
    }
  });
  const initials = name => name.replace(/\bDr\.?\s*/i,'').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  function normalFileNumber(input){return input.trim().toUpperCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));}
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(ui.locked)return;const data=new FormData(form);const type=form.dataset.form;
    if(await workflowSubmit(form,data,type))return;
    if(LIVE){await submitLive(form,data,type);return;}
    if(['student','doctor','invite','questions'].includes(type)&&ui.role!=='admin')return;
    if(type==='file'){
      const s=byId('students',ui.studentId);if(ui.role!=='student'||!s?.active)return;
      const number=normalFileNumber(String(data.get('number')||''));const date=String(data.get('date')||'');
      if(!/^[A-Z0-9_\/-]{1,40}$/.test(number)){error(form,tr('Enter a file number using letters, numbers, hyphens, slashes, or underscores only.','أدخل رقم ملف باستخدام الحروف والأرقام والشرطات والشرطات المائلة فقط.'));return;}
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date< '2020-01-01'||date>new Date().toISOString().slice(0,10)||isNaN(new Date(date).getTime())){error(form,tr('Choose a valid date that is not in the future.','اختر تاريخاً صالحاً لا يقع في المستقبل.'));return;}
      if(db.files.some(f=>f.studentId===s.id&&normalFileNumber(f.number)===number)){error(form,tr('You have already submitted this file number.','لقد سجلت رقم هذا الملف مسبقاً.'));return;}
      db.files.push({id:uid('f'),studentId:s.id,number,date,createdAt:now(),reviewed:false,version:1,needsRecheck:false,corrections:[]});activity('file',`${s.name.en} submitted file ${number}.`,`سجّل ${s.name.ar} الملف ${number}.`);save();render();toast(tr('File added.','أُضيف الملف.'));return;
    }
    if(type==='student'){
      const existing=byId('students',form.dataset.id);const nameEn=String(data.get('nameEn')||'').trim();const nameAr=String(data.get('nameAr')||'').trim()||nameEn;const email=String(data.get('email')||'').trim().toLowerCase();const programId=String(data.get('programId'));const doctorId=String(data.get('doctorId'));const year=Number(data.get('year'));
      if(nameEn.length<2||nameEn.length>70||!email.includes('@')||!byId('programs',programId)||!Number.isInteger(year)||year<1||year>6){error(form,tr('Complete the resident’s name, email, program, and training year.','أكمل اسم المقيم والبريد الإلكتروني والبرنامج وسنة التدريب.'));return;}
      if(db.students.some(s=>s.id!==existing?.id&&s.email.toLowerCase()===email)||db.doctors.some(d=>d.email.toLowerCase()===email)){error(form,tr('This email address already belongs to another account.','هذا البريد الإلكتروني مستخدم لحساب آخر.'));return;}
      const doctor=byId('doctors',doctorId);if(!doctor?.active||!doctor.programs.includes(programId)){error(form,tr('Choose an active supervising doctor for this program.','اختر طبيباً مشرفاً نشطاً لهذا البرنامج.'));return;}
      const reviewIntervalWeeks=Number(data.get('reviewIntervalWeeks'));if(!Number.isInteger(reviewIntervalWeeks)||reviewIntervalWeeks<1||reviewIntervalWeeks>52){error(form,tr('Choose a review interval from 1 to 52 weeks.','اختر فترة مراجعة من ١ إلى ٥٢ أسبوعاً.'));return;}
      const fields={name:{en:nameEn,ar:nameAr},email,programId,doctorId,year,reviewIntervalWeeks,recordVersion:(existing?.recordVersion||0)+1,initials:initials(nameEn)};
      if(existing)Object.assign(existing,fields);else db.students.push({id:uid('s'),...fields,active:true,color:'#668b7d',joined:new Date().toISOString().slice(0,10)});
      activity('student',`${existing?'Updated':'Added'} resident ${nameEn}.`,`${existing?'حُدّث':'أُضيف'} المقيم ${nameAr}.`);save();closeModal();render();toast(existing?tr('Resident details updated.','تم تحديث بيانات المقيم.'):tr('Resident added to the demonstration workspace.','أُضيف المقيم إلى مساحة العرض التجريبية.'));return;
    }
    if(type==='doctor'){
      const doctor=byId('doctors',form.dataset.id);if(!doctor)return;const nameEn=String(data.get('nameEn')||'').trim();const nameAr=String(data.get('nameAr')||'').trim()||nameEn;const email=String(data.get('email')||'').trim().toLowerCase();const programs=data.getAll('programs').map(String).filter(p=>byId('programs',p));
      if(!programs.length){error(form,tr('Select at least one residency program.','اختر برنامج إقامة واحداً على الأقل.'));return;}
      if(db.doctors.some(d=>d.id!==doctor.id&&d.email.toLowerCase()===email)||db.students.some(s=>s.email.toLowerCase()===email)){error(form,tr('This email address already belongs to another account.','هذا البريد الإلكتروني مستخدم لحساب آخر.'));return;}
      if(activeStudents().some(s=>s.doctorId===doctor.id&&!programs.includes(s.programId))){error(form,tr('Reassign residents before removing their program from this doctor.','أعد تعيين المقيمين قبل إزالة برنامجهم من صلاحيات هذا الطبيب.'));return;}
      Object.assign(doctor,{name:{en:nameEn,ar:nameAr},email,programs,initials:initials(nameEn)});save();closeModal();render();toast(tr('Doctor details updated.','تم تحديث بيانات الطبيب.'));return;
    }
    if(type==='invite'){
      const nameEn=String(data.get('nameEn')||'').trim();const nameAr=String(data.get('nameAr')||'').trim()||nameEn;const email=String(data.get('email')||'').trim().toLowerCase();const programId=String(data.get('programId'));
      if(db.doctors.some(d=>d.email.toLowerCase()===email)||db.students.some(s=>s.email.toLowerCase()===email)||db.invitations.some(i=>i.email.toLowerCase()===email&&i.status==='pending')){error(form,tr('This email already has an account or a pending invitation.','يوجد لهذا البريد حساب أو دعوة معلقة مسبقاً.'));return;}
      if(!byId('programs',programId))return;
      const invite={id:uid('inv'),name:{en:nameEn,ar:nameAr},email,role:'doctor',programId,status:'pending',createdAt:now(),expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString(),token:uid('demo')};db.invitations.push(invite);activity('invite',`Created a demo invitation for ${nameEn}.`,`أُنشئت دعوة تجريبية لـ ${nameAr}.`);save();closeModal();render();showInvite(invite.id);return;
    }
    if(type==='questions'){
      const d=ui.questionDraft;if(!d||!d.questions.length||d.questions.some(q=>!q.en.trim()||!q.ar.trim())){error(form,tr('Enter an English and Arabic label for every category.','أدخل عنواناً بالإنجليزية والعربية لكل فئة.'));return;}
      if(['en','ar'].some(lang=>new Set(d.questions.map(q=>q[lang].trim().toLowerCase())).size!==d.questions.length)){error(form,tr('Give every category a unique label in each language.','استخدم عنواناً مختلفاً لكل فئة في كل لغة.'));return;}
      const p=byId('programs',d.programId);p.templateVersion=(p.templateVersion||1)+1;p.templateVersionId='template-'+p.id+'-'+p.templateVersion;p.questions=d.questions.map(q=>({id:q.id,en:q.en.trim(),ar:q.ar.trim()}));activity('evaluation',`Updated evaluation questions for ${p.name.en}.`,`حُدّثت أسئلة تقييم ${p.name.ar}.`);save();toast(tr('Questions saved. Past evaluations keep their original wording.','حُفظت الأسئلة. تحتفظ التقييمات السابقة بصياغتها الأصلية.'));return;
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(ui.modal)closeModal();else if(ui.mobileOpen){ui.mobileOpen=false;render();}}
    if(event.key==='Tab'&&ui.modal){const nodes=Array.from(document.querySelectorAll('.modal button,.modal input,.modal select,.modal textarea,.modal a[href]')).filter(n=>!n.disabled&&n.offsetParent!==null);const first=nodes[0];const last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  if(LIVE){
    window.addEventListener('hashchange',async()=>{
      if(!captureAuthFragment())return;
      // Same-page links follow the same explicit confirmation flow as a fresh visit.
      resetLiveSession();auth.invitation=null;auth.error='';auth.developmentUrl=null;auth.state='loading';
      await bootLive();
    });
    bootLive();
  }else{
    render();
    const token=new URLSearchParams(location.search).get('invite');
    if(token){const invite=db.invitations.find(i=>i.token===token);if(invite)previewInvite(invite.id);else modal(tr('Demo invitation unavailable','الدعوة التجريبية غير متاحة'),tr('This browser does not have the matching demonstration invitation.','لا توجد الدعوة التجريبية المطابقة في هذا المتصفح.'),`<div class="info-box">${icon('info',16)}<span>${tr('Invitations in this demonstration belong to this browser. Preview the flow from Administrator → Access & invitations.','الدعوات في هذا العرض تخص هذا المتصفح. عاين الخطوات من المسؤول ← الصلاحيات والدعوات.')}</span></div>`,button(tr('Explore the demo','اكتشف العرض'),'close','arrow','primary'));}
  }
})();
