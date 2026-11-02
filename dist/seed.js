/* All people, assessments, and file identifiers below are fictional demo records. */
window.makeTaqyeemSeed = function () {
  const baseQuestions = [
    { id: 'q1', en: 'Psychiatric interviewing and history', ar: 'المقابلة النفسية وأخذ التاريخ المرضي' },
    { id: 'q2', en: 'Mental status examination', ar: 'فحص الحالة العقلية' },
    { id: 'q3', en: 'Formulation and differential reasoning', ar: 'صياغة الحالة والاستدلال التشخيصي التفريقي' },
    { id: 'q4', en: 'Risk assessment and safety planning', ar: 'تقييم المخاطر ووضع خطة الأمان' },
    { id: 'q5', en: 'Management planning', ar: 'وضع الخطة العلاجية' },
    { id: 'q6', en: 'Psychopharmacology knowledge', ar: 'المعرفة بالأدوية النفسية' },
    { id: 'q7', en: 'Therapeutic communication and psychotherapy skills', ar: 'التواصل العلاجي ومهارات العلاج النفسي' },
    { id: 'q8', en: 'Professionalism and confidentiality', ar: 'المهنية والحفاظ على السرية' },
    { id: 'q9', en: 'Teamwork and handover', ar: 'العمل الجماعي وتسليم الرعاية' },
    { id: 'q10', en: 'Documentation and learning', ar: 'التوثيق والتعلم المستمر' }
  ];
  // Proposed local starter categories; each program can tailor its own version.
  const programs = [
    { id: 'adult', name: { en: 'Adult Psychiatry', ar: 'الطب النفسي للبالغين' }, color: '#407F87',
      description: { en: 'Thoughtful interviewing, shared formulation, and continuity of care.', ar: 'مقابلات متأنية وصياغة متكاملة للحالة واستمرارية الرعاية.' } },
    { id: 'child', name: { en: 'Child & Adolescent Psychiatry', ar: 'الطب النفسي للأطفال والمراهقين' }, color: '#8474B5',
      description: { en: 'Developmental understanding, family collaboration, and attentive supervision.', ar: 'فهم مراحل النمو والتعاون مع الأسرة والإشراف المتأني.' } },
    { id: 'addiction', name: { en: 'Addiction Psychiatry', ar: 'الطب النفسي للإدمان' }, color: '#B48A4D',
      description: { en: 'Respectful engagement, recovery-focused planning, and coordinated care.', ar: 'تواصل يحفظ الكرامة وخطط تدعم التعافي ورعاية متكاملة.' } }
  ].map(function (program) { return Object.assign(program, {templateVersionId: 'template-' + program.id + '-1', templateVersion: 1, questions: baseQuestions.map(function (q) {return Object.assign({}, q);})}); });
  const doctors = [
    { id: 'd1', name: { en: 'Dr. Omar Hassan', ar: 'د. عمر حسن' }, email: 'omar.hassan@example.com', programs: ['adult'], active: true, initials: 'OH', color: '#407F87' },
    { id: 'd2', name: { en: 'Dr. Layla Mansour', ar: 'د. ليلى منصور' }, email: 'layla.mansour@example.com', programs: ['child'], active: true, initials: 'LM', color: '#8474B5' },
    { id: 'd3', name: { en: 'Dr. Youssef Nabil', ar: 'د. يوسف نبيل' }, email: 'youssef.nabil@example.com', programs: ['addiction'], active: true, initials: 'YN', color: '#B48A4D' },
    { id: 'd4', name: { en: 'Dr. Mariam Adel', ar: 'د. مريم عادل' }, email: 'mariam.adel@example.com', programs: ['child', 'addiction'], active: true, initials: 'MA', color: '#69917A' }
  ];
  const students = [
    { id: 's1', name: { en: 'Sara Mahmoud', ar: 'سارة محمود' }, email: 'sara.mahmoud@example.com', programId: 'adult', year: 2, doctorId: 'd1', active: true, initials: 'SM', color: '#5E8D83', joined: '2026-07-01' },
    { id: 's2', name: { en: 'Ahmed Mostafa', ar: 'أحمد مصطفى' }, email: 'ahmed.mostafa@example.com', programId: 'adult', year: 3, doctorId: 'd1', active: true, initials: 'AM', color: '#7C88A6', joined: '2026-07-01' },
    { id: 's3', name: { en: 'Nour Ibrahim', ar: 'نور إبراهيم' }, email: 'nour.ibrahim@example.com', programId: 'adult', year: 1, doctorId: 'd1', active: true, initials: 'NI', color: '#AD8E73', joined: '2026-07-01' },
    { id: 's4', name: { en: 'Kareem Samir', ar: 'كريم سمير' }, email: 'kareem.samir@example.com', programId: 'adult', year: 4, doctorId: 'd1', active: true, initials: 'KS', color: '#8D81AE', joined: '2026-07-01' },
    { id: 's5', name: { en: 'Hana Tarek', ar: 'هنا طارق' }, email: 'hana.tarek@example.com', programId: 'adult', year: 1, doctorId: 'd1', active: true, initials: 'HT', color: '#AC7F8E', joined: '2026-10-01' },
    { id: 's6', name: { en: 'Omar Fathy', ar: 'عمر فتحي' }, email: 'omar.fathy@example.com', programId: 'child', year: 3, doctorId: 'd2', active: true, initials: 'OF', color: '#678B9D', joined: '2026-07-01' },
    { id: 's7', name: { en: 'Salma Ahmed', ar: 'سلمى أحمد' }, email: 'salma.ahmed@example.com', programId: 'child', year: 2, doctorId: 'd2', active: true, initials: 'SA', color: '#8F8C64', joined: '2026-07-01' },
    { id: 's8', name: { en: 'Ali Sherif', ar: 'علي شريف' }, email: 'ali.sherif@example.com', programId: 'child', year: 1, doctorId: 'd2', active: true, initials: 'AS', color: '#A98370', joined: '2026-07-01' },
    { id: 's9', name: { en: 'Farah Magdy', ar: 'فرح مجدي' }, email: 'farah.magdy@example.com', programId: 'child', year: 2, doctorId: 'd4', active: true, initials: 'FM', color: '#AC829F', joined: '2026-10-01' },
    { id: 's10', name: { en: 'Mona Khalil', ar: 'منى خليل' }, email: 'mona.khalil@example.com', programId: 'addiction', year: 3, doctorId: 'd3', active: true, initials: 'MK', color: '#78916D', joined: '2026-07-01' },
    { id: 's11', name: { en: 'Yassin Hamed', ar: 'ياسين حامد' }, email: 'yassin.hamed@example.com', programId: 'addiction', year: 2, doctorId: 'd3', active: true, initials: 'YH', color: '#7D89AD', joined: '2026-07-01' },
    { id: 's12', name: { en: 'Dina Wael', ar: 'دينا وائل' }, email: 'dina.wael@example.com', programId: 'addiction', year: 1, doctorId: 'd4', active: true, initials: 'DW', color: '#B08A80', joined: '2026-10-01' }
  ];
  const notes = [
    { en: 'Builds a calm therapeutic rapport and presents a clear mental status examination. Continue refining concise, structured formulations.', ar: 'تبني علاقة علاجية هادئة وتعرض فحص الحالة العقلية بوضوح. يُنصح بمواصلة تطوير صياغة الحالة بصورة مختصرة ومنظمة.' },
    { en: 'Shows steady progress and responds thoughtfully to feedback. A focused learning plan would support the next rotation.', ar: 'يُظهر تقدماً مستمراً ويتفاعل بجدية مع الملاحظات. ستساعده خطة تعلم محددة في الفترة التدريبية القادمة.' },
    { en: 'Engages actively in teaching sessions. Would benefit from more consistent preparation and better organization of written work.', ar: 'تشارك بفاعلية في الجلسات التعليمية. تحتاج إلى مزيد من الانتظام في التحضير وتنظيم العمل المكتوب.' },
    { en: 'Demonstrates dependable preparation and strong collaboration. Supports junior colleagues constructively.', ar: 'يُظهر استعداداً موثوقاً وتعاوناً قوياً، ويدعم الزملاء الأصغر خبرة بصورة بناءة.' },
    { en: 'Works thoughtfully and asks useful questions. Continue building confidence when presenting structured summaries.', ar: 'يعمل بتأنٍ ويطرح أسئلة مفيدة. يُنصح بمواصلة بناء الثقة عند تقديم ملخصات منظمة.' },
    { en: 'Communicates respectfully and follows through on agreed learning goals. Maintain this consistency in the next review.', ar: 'تتواصل باحترام وتتابع أهداف التعلم المتفق عليها. يُنصح بالحفاظ على هذا الانتظام في التقييم القادم.' },
    { en: 'Developing steadily during the first year. Set aside regular time to review feedback and prepare for teaching sessions.', ar: 'يتطور بصورة مستمرة خلال السنة الأولى. يُنصح بتخصيص وقت منتظم لمراجعة الملاحظات والتحضير للجلسات التعليمية.' },
    { en: 'A well-organized resident with clear communication and an encouraging approach to teamwork.', ar: 'طبيبة مقيمة منظمة تتمتع بتواصل واضح وروح إيجابية في العمل الجماعي.' },
    { en: 'Makes good use of feedback and shows a consistent commitment to improvement. Documentation is increasingly clear.', ar: 'يستفيد جيداً من الملاحظات ويُظهر التزاماً مستمراً بالتحسين. أصبح التوثيق أكثر وضوحاً.' }
  ];
  const currentScores = [
    ['s1', [8, 8, 9, 8, 9, 9, 9, 7, 8, 9]],
    ['s2', [9, 8, 8, 8, 8, 9, 9, 8, 8, 9]],
    ['s3', [7, 6, 7, 6, 7, 7, 7, 5, 6, 8]],
    ['s4', [10, 9, 9, 9, 9, 10, 10, 8, 9, 9]],
    ['s6', [8, 8, 8, 9, 8, 8, 9, 7, 8, 8]],
    ['s7', [8, 8, 8, 8, 9, 9, 9, 8, 8, 9]],
    ['s8', [7, 7, 8, 7, 8, 8, 8, 7, 7, 8]],
    ['s10', [9, 9, 9, 8, 10, 9, 10, 8, 9, 9]],
    ['s11', [8, 8, 8, 7, 9, 8, 9, 7, 8, 8]]
  ];
  const evaluations = currentScores.map(function (entry, index) {
    const student = students.find(function (s) { return s.id === entry[0]; });
    return {
      id: 'ev-nov-' + student.id, studentId: student.id, doctorId: student.doctorId,
      period: '2026-11', status: 'published', scores: entry[1].slice(),
      questions: programs.find(function (p) { return p.id === student.programId; }).questions.map(function (q) { return Object.assign({}, q); }),
      note: Object.assign({}, notes[index]), createdAt: '2026-11-01T' + String(8 + Math.floor(index / 3)).padStart(2, '0') + ':' + String((index % 3) * 15).padStart(2, '0') + ':00.000Z'
    };
  });
  currentScores.filter(function (entry) { return entry[0] !== 's8'; }).forEach(function (entry, index) {
    const student = students.find(function (s) { return s.id === entry[0]; });
    evaluations.push({
      id: 'ev-oct-' + student.id, studentId: student.id, doctorId: student.doctorId,
      period: '2026-10', status: 'published',
      scores: entry[1].map(function (score, scoreIndex) { return Math.max(1, score - (scoreIndex % 3 === index % 3 ? 1 : 0)); }),
      questions: programs.find(function (p) { return p.id === student.programId; }).questions.map(function (q) { return Object.assign({}, q); }),
      note: { en: 'Previous review completed. Continue the agreed learning objectives and revisit progress at the next review.', ar: 'اكتمل التقييم السابق. يُنصح بمواصلة أهداف التعلم المتفق عليها ومراجعة التقدم في التقييم القادم.' },
      createdAt: '2026-10-25T09:' + String(index * 5).padStart(2, '0') + ':00.000Z'
    });
  });
  evaluations.push({
    id: 'ev-draft-s5', studentId: 's5', doctorId: 'd1', period: '2026-11', status: 'draft',
    scores: [7, 7, 8, null, 8, null, null, null, null, null],
    questions: programs[0].questions.map(function (q) { return Object.assign({}, q); }),
    note: { en: 'Initial observations saved. Complete the remaining categories before publishing.', ar: 'حُفظت الملاحظات الأولية. يرجى استكمال الفئات المتبقية قبل النشر.' },
    createdAt: '2026-11-01T10:45:00.000Z'
  });
  const files = Array.from({ length: 28 }, function (_, index) {
    const student = students[index % students.length];
    const date = index < 12 ? '2026-11-01' : index < 24 ? '2026-10-31' : '2026-10-30';
    return {
      id: 'file-' + String(index + 1), studentId: student.id,
      number: 'DEMO-' + String(10482 + index * 17), date: date,
      createdAt: date + 'T' + String(8 + (index % 3)).padStart(2, '0') + ':' + String((index % 4) * 10).padStart(2, '0') + ':00.000Z',
      reviewed: index >= 8
    };
  });
  // Capture the original assessment context; later profile edits must not rewrite history.
  evaluations.forEach(function (evaluation) {
    const student = students.find(function (entry) { return entry.id === evaluation.studentId; });
    const program = programs.find(function (entry) { return entry.id === student.programId; });
    evaluation.programId = program.id;
    evaluation.trainingYear = student.year;
    evaluation.templateVersionId = program.templateVersionId;
  });
  return {
    version: 2,
    students: students,
    doctors: doctors,
    programs: programs,
    evaluations: evaluations,
    files: files,
    invitations: [{
      id: 'invite-1', name: { en: 'Dr. Hala Sameh', ar: 'د. هالة سامح' },
      email: 'hala.sameh@example.com', role: 'doctor', programId: 'adult', status: 'pending',
      createdAt: '2026-11-01T08:00:00.000Z', expiresAt: '2026-11-08T00:00:00.000Z', token: 'demo-token-sample'
    }],
    activity: [
      { id: 'act-1', type: 'evaluation', text: { en: 'Dr. Omar Hassan saved a draft for Hana Tarek.', ar: 'حفظ د. عمر حسن مسودة تقييم لهنا طارق.' }, at: '2026-11-01T10:45:00.000Z' },
      { id: 'act-2', type: 'evaluation', text: { en: 'Yassin Hamed’s November rating was published.', ar: 'نُشر تقييم ياسين حامد لشهر نوفمبر.' }, at: '2026-11-01T10:30:00.000Z' },
      { id: 'act-3', type: 'file', text: { en: 'Nour Ibrahim submitted a new demo file number.', ar: 'أضافت نور إبراهيم رقم ملف تجريبي جديداً.' }, at: '2026-11-01T10:20:00.000Z' },
      { id: 'act-4', type: 'evaluation', text: { en: 'Sara Mahmoud’s November rating was published.', ar: 'نُشر تقييم سارة محمود لشهر نوفمبر.' }, at: '2026-11-01T08:00:00.000Z' },
      { id: 'act-5', type: 'invite', text: { en: 'A demo invitation was created for Dr. Hala Sameh.', ar: 'أُنشئت دعوة تجريبية للدكتورة هالة سامح.' }, at: '2026-11-01T08:00:00.000Z' }
    ]
  };
};
