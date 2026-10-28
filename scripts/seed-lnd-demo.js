/**
 * Task 38 — Seed L&D sample data into the DEMO tenant DB ONLY
 * (tenant_3boxes-hrms-demo). Idempotent: deletes previous seed rows by marker.
 *
 * Creates: courses (+modules), learning paths, assignments & enrollments with
 * realistic progress/scores/feedback (Kirkpatrick-ready), certificates with
 * validity, compliance requirements + policy sign-offs with signatures,
 * skill gaps linked to performance reviews.
 *
 * Usage: node scripts/seed-lnd-demo.js
 */
const { neon } = require('@neondatabase/serverless');

const DEMO_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require';
const MARKER = 'seed:lnd-demo';
const sql = neon(DEMO_CS);
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;
const log = (...a) => console.log('[lnd-seed]', ...a);
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();

async function main() {
  // Resolve employees & admin (scope: TNS + ISY for coherent demo)
  const emps = (await sql`
    SELECT e."id", e."employeeId", e."firstName", e."lastName", e."companyId", e."departmentId",
           c."code" AS "companyCode"
    FROM "Employee" e JOIN "Company" c ON c."id" = e."companyId"
    WHERE c."code" IN ('TNS','ISY','GDC') AND e."status" = 'active'
    ORDER BY e."employeeId" LIMIT 30`);
  if (emps.length < 10) throw new Error('Not enough demo employees found');
  const byCode = (code) => emps.filter((e) => e.companyCode === code);
  log(`Found ${emps.length} demo employees (TNS:${byCode('TNS').length} ISY:${byCode('ISY').length} GDC:${byCode('GDC').length})`);

  // ── Clean previous seed run ─────────────────────────────────────────────
  await sql`DELETE FROM "PolicySignOffAck" WHERE "signOffId" IN (SELECT "id" FROM "PolicySignOff" WHERE "companyId" IS NULL AND "createdById" = ${MARKER})`;
  await sql`DELETE FROM "PolicySignOff" WHERE "createdById" = ${MARKER}`;
  await sql`DELETE FROM "ComplianceRequirement" WHERE "id" IN (SELECT "id" FROM "ComplianceRequirement" WHERE "companyId" IS NULL) AND "name" IN ('POSH Act Annual Training','Cybersecurity Awareness','Workplace Safety Induction')`;
  await sql`DELETE FROM "Certificate" WHERE "employeeId" IN (SELECT "id" FROM "Employee" WHERE "employeeId" LIKE 'EMP-%') AND "certificateNo" LIKE 'CERT-FY%' AND "id" IN (SELECT "id" FROM "Certificate" WHERE "title" LIKE '%Certificate of Completion' OR "skillAwarded" IS NOT NULL) AND "createdAt" > NOW() - INTERVAL '2 hours'`;
  const oldCourseIds = (await sql`SELECT "id" FROM "Course" WHERE "createdById" = ${MARKER}`).map((r) => r.id);
  if (oldCourseIds.length) {
    const ph = oldCourseIds.map((_, i) => `$${i + 1}`).join(',');
    await sql.query(`DELETE FROM "CourseEnrollment" WHERE "courseId" IN (${ph})`, oldCourseIds);
    await sql.query(`DELETE FROM "LearningPathCourse" WHERE "courseId" IN (${ph})`, oldCourseIds);
    await sql.query(`DELETE FROM "CourseModule" WHERE "courseId" IN (${ph})`, oldCourseIds);
    await sql.query(`DELETE FROM "SkillGap" WHERE "suggestedCourseId" IN (${ph})`, oldCourseIds);
    await sql.query(`DELETE FROM "Course" WHERE "id" IN (${ph})`, oldCourseIds);
  }
  await sql`DELETE FROM "LearningPath" WHERE "createdById" = ${MARKER}`;
  await sql`DELETE FROM "TrainingRequest" WHERE "status" = 'pending' AND "reason" LIKE ${'%[seed]%'}`;
  await sql`DELETE FROM "SkillGap" WHERE "notes" = ${MARKER}`;
  log('Previous seed rows cleaned');

  // ── Courses ─────────────────────────────────────────────────────────────
  const mkCourse = async (c) => {
    const cid = id('course');
    await sql.query(
      `INSERT INTO "Course" ("id","code","title","description","category","mode","provider","externalUrl","durationHours","level","skills","objectives","isCompliance","complianceCategory","isPromotionGate","passingScore","cost","currency","status","companyId","createdById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'INR','published',NULL,$18,NOW(),NOW())`,
      [cid, c.code, c.title, c.description, c.category, c.mode, c.provider, c.externalUrl || null, c.durationHours, c.level,
       JSON.stringify(c.skills), c.objectives, c.isCompliance, c.complianceCategory || null, c.isPromotionGate, c.passingScore, c.cost, MARKER]);
    for (let i = 0; i < c.modules.length; i++) {
      const m = c.modules[i];
      await sql.query(
        `INSERT INTO "CourseModule" ("id","courseId","title","type","durationMins","order","isAssessment","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
        [id('mod'), cid, m.title, m.type, m.durationMins, i + 1, !!m.isAssessment]);
    }
    return cid;
  };

  const courseDefs = [
    { code: 'TECH-101', title: 'React & TypeScript Foundations', description: 'Modern frontend engineering with React 18, hooks and strict TypeScript patterns.', category: 'technical', mode: 'e_learning', provider: 'Internal Academy', durationHours: 8, level: 'intermediate', skills: ['React', 'TypeScript', 'Frontend'], objectives: 'Build production React apps; master typing patterns.', isCompliance: false, isPromotionGate: false, passingScore: 65, cost: 0, modules: [{ title: 'Component Thinking', type: 'video', durationMins: 35 }, { title: 'Hooks in Depth', type: 'video', durationMins: 45 }, { title: 'TypeScript Patterns', type: 'document', durationMins: 30 }, { title: 'Knowledge Check', type: 'quiz', durationMins: 20, isAssessment: true }] },
    { code: 'TECH-201', title: 'Advanced API Security', description: 'OWASP top 10, JWT hardening, rate limiting and secrets management for production APIs.', category: 'technical', mode: 'e_learning', provider: 'Internal Academy', durationHours: 6, level: 'advanced', skills: ['API Security', 'OWASP', 'Backend'], objectives: 'Harden APIs against common attack vectors.', isCompliance: false, isPromotionGate: true, passingScore: 70, cost: 0, modules: [{ title: 'OWASP Overview', type: 'video', durationMins: 40 }, { title: 'Hands-on: JWT Hardening', type: 'document', durationMins: 50 }, { title: 'Security Assessment', type: 'quiz', durationMins: 25, isAssessment: true }] },
    { code: 'SOFT-110', title: 'Stakeholder Communication', description: 'Communicate with clarity across engineering, product and customers — written and verbal.', category: 'soft_skills', mode: 'instructor_led', provider: 'LeadUp Workshops', durationHours: 4, level: 'beginner', skills: ['Communication', 'Stakeholder Management'], objectives: 'Run effective updates; manage difficult conversations.', isCompliance: false, isPromotionGate: false, passingScore: 60, cost: 12000, modules: [{ title: 'Live Workshop', type: 'live_session', durationMins: 120 }, { title: 'Practice Scenarios', type: 'on_job', durationMins: 60 }, { title: 'Reflection Quiz', type: 'quiz', durationMins: 15, isAssessment: true }] },
    { code: 'LEAD-301', title: 'Leading High-Performance Teams', description: 'Team formation, coaching conversations and delivery accountability for new managers.', category: 'leadership', mode: 'blended', provider: 'LeadUp Workshops', durationHours: 12, level: 'advanced', skills: ['Leadership', 'Coaching', 'Team Management'], objectives: 'Lead teams through growth and change.', isCompliance: false, isPromotionGate: true, passingScore: 70, cost: 25000, modules: [{ title: 'Manager Fundamentals', type: 'video', durationMins: 60 }, { title: 'Coaching Lab', type: 'live_session', durationMins: 90 }, { title: 'Leadership Assessment', type: 'quiz', durationMins: 30, isAssessment: true }] },
    { code: 'POSH-101', title: 'POSH Act — Prevention of Sexual Harassment', description: 'Statutory POSH awareness training as per the Sexual Harassment Act, 2013. Annual mandatory certification.', category: 'compliance', mode: 'e_learning', provider: 'ComplianceFirst', durationHours: 2, level: 'beginner', skills: ['POSH'], objectives: 'Recognise, prevent and report workplace harassment.', isCompliance: true, complianceCategory: 'POSH', isPromotionGate: false, passingScore: 80, cost: 0, modules: [{ title: 'The POSH Act & ICC', type: 'video', durationMins: 45 }, { title: 'Reporting & Redressal', type: 'document', durationMins: 30 }, { title: 'Mandatory Certification Quiz', type: 'quiz', durationMins: 20, isAssessment: true }] },
    { code: 'CYB-100', title: 'Cybersecurity Awareness', description: 'Phishing, password hygiene, data handling and incident reporting for all employees.', category: 'compliance', mode: 'e_learning', provider: 'ComplianceFirst', durationHours: 1.5, level: 'beginner', skills: ['Cybersecurity'], objectives: 'Identify and avoid common cyber threats.', isCompliance: true, complianceCategory: 'CYBERSECURITY', isPromotionGate: false, passingScore: 80, cost: 0, modules: [{ title: 'Phishing & Social Engineering', type: 'video', durationMins: 30 }, { title: 'Data Handling Policy', type: 'document', durationMins: 20 }, { title: 'Security Quiz', type: 'quiz', durationMins: 15, isAssessment: true }] },
    { code: 'SAFE-100', title: 'Workplace Safety Induction', description: 'Fire safety, evacuation procedures and first-aid basics for office locations.', category: 'compliance', mode: 'document', provider: 'Internal — Admin', durationHours: 1, level: 'beginner', skills: ['Safety'], objectives: 'Know emergency procedures for your location.', isCompliance: true, complianceCategory: 'SAFETY', isPromotionGate: false, passingScore: 75, cost: 0, modules: [{ title: 'Evacuation Maps & Wardens', type: 'document', durationMins: 20 }, { title: 'Safety Acknowledgement Quiz', type: 'quiz', durationMins: 10, isAssessment: true }] },
    { code: 'ONB-001', title: 'New Joiner Essentials', description: 'Everything a new employee needs in the first 30 days — tools, policies and culture.', category: 'onboarding', mode: 'e_learning', provider: 'Internal — HR', durationHours: 3, level: 'beginner', skills: ['Company Culture', 'Tools'], objectives: 'Get productive from day one.', isCompliance: false, isPromotionGate: false, passingScore: 60, cost: 0, modules: [{ title: 'Welcome to 3Boxes', type: 'video', durationMins: 20 }, { title: 'Policies That Matter', type: 'document', durationMins: 30 }, { title: 'Tooling Setup', type: 'link', durationMins: 40 }, { title: 'First-Month Quiz', type: 'quiz', durationMins: 15, isAssessment: true }] },
    { code: 'DOM-210', title: 'Healthcare Data Privacy (HIPAA Basics)', description: 'Patient-data handling for healthcare engagements — de-identification and minimum necessary.', category: 'domain', mode: 'e_learning', provider: 'ComplianceFirst', durationHours: 3, level: 'intermediate', skills: ['Data Privacy', 'Healthcare'], objectives: 'Handle PHI safely in analytics engagements.', isCompliance: true, complianceCategory: 'DATA_PRIVACY', isPromotionGate: false, passingScore: 80, cost: 8000, modules: [{ title: 'PHI & De-identification', type: 'video', durationMins: 45 }, { title: 'Case Studies', type: 'document', durationMins: 30 }, { title: 'Privacy Quiz', type: 'quiz', durationMins: 20, isAssessment: true }] },
    { title: 'Cloud Cost Optimization (AWS)', description: 'FinOps practices: right-sizing, savings plans and observability for cloud spend.', category: 'technical', mode: 'external_link', provider: 'Coursera', externalUrl: 'https://www.coursera.org/learn/cloud-cost-optimization', durationHours: 5, level: 'intermediate', skills: ['AWS', 'FinOps', 'Cloud'], objectives: 'Reduce cloud spend without hurting reliability.', isCompliance: false, isPromotionGate: false, passingScore: 60, cost: 5500, code: 'TECH-150', modules: [{ title: 'External course link', type: 'link', durationMins: 300 }] },
  ];
  const C = {};
  for (const def of courseDefs) C[def.code] = await mkCourse(def);
  log(`Courses: ${courseDefs.length} created with modules`);

  // ── Learning paths ──────────────────────────────────────────────────────
  const mkPath = async (p) => {
    const pid = id('lp');
    await sql.query(
      `INSERT INTO "LearningPath" ("id","name","code","description","category","targetRole","durationWeeks","isPromotionTrack","status","companyId","createdById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NULL,$9,NOW(),NOW())`,
      [pid, p.name, p.code || null, p.description, p.category, p.targetRole || null, p.durationWeeks || null, p.isPromotionTrack, MARKER]);
    for (let i = 0; i < p.courseIds.length; i++) {
      await sql.query(
        `INSERT INTO "LearningPathCourse" ("id","pathId","courseId","order","isRequired","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
        [id('lpc'), pid, p.courseIds[i], i + 1, p.requiredIds ? p.requiredIds.includes(p.courseIds[i]) : true]);
    }
    return pid;
  };
  const PATH_ONB = await mkPath({ name: 'New Joiner Onboarding Track', code: 'LP-ONB', description: 'Mandatory 30-day onboarding: company essentials + security + safety.', category: 'onboarding', durationWeeks: 4, isPromotionTrack: false, courseIds: [C['ONB-001'], C['CYB-100'], C['SAFE-100']] });
  const PATH_TL = await mkPath({ name: 'Team Lead → Manager Track', code: 'LP-MGR', description: 'Promotion readiness track for Team Leads moving into Manager roles.', category: 'promotion', targetRole: 'Manager', durationWeeks: 10, isPromotionTrack: true, courseIds: [C['LEAD-301'], C['SOFT-110'], C['TECH-201']], requiredIds: [C['LEAD-301'], C['SOFT-110']] });
  const PATH_SEC = await mkPath({ name: 'Security & Compliance Essentials', code: 'LP-SEC', description: 'Annual compliance bundle: POSH + cybersecurity + data privacy.', category: 'compliance', durationWeeks: 2, isPromotionTrack: false, courseIds: [C['POSH-101'], C['CYB-100'], C['DOM-210']] });
  log('Learning paths: 3 created (onboarding, promotion track, compliance bundle)');

  // ── Enrollments with realistic spread ───────────────────────────────────
  const tns = byCode('TNS'); const isy = byCode('ISY'); const gdc = byCode('GDC');
  let enrollCount = 0, certCount = 0;
  // statuses: completed (with scores+feedback+certs), in_progress, assigned (incl. some overdue)
  const mkEnroll = async (emp, courseId, opts = {}) => {
    const dup = await sql.query(`SELECT 1 FROM "CourseEnrollment" WHERE "courseId" = $1 AND "employeeId" = $2 LIMIT 1`, [courseId, emp.id]);
    if (dup.length) return null; // skip duplicates
    const eid = id('ce');
    const st = opts.status || 'assigned';
    const progress = st === 'completed' ? 100 : st === 'in_progress' ? opts.progress || 40 : 0;
    const completedAt = st === 'completed' ? daysFromNow(-(opts.daysAgo || 45)) : null;
    await sql.query(
      `INSERT INTO "CourseEnrollment" ("id","courseId","pathId","employeeId","source","status","progress","dueDate","startedAt","completedAt","score","preTestScore","postTestScore","attempts","hoursSpent","feedbackRating","feedbackInstructor","feedbackContent","feedbackComments","goalId","companyId","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NULL,$20,NOW(),NOW())`,
      [eid, courseId, opts.pathId || null, emp.id, opts.source || 'assigned', st, progress,
       opts.dueDate || (st === 'completed' ? null : daysFromNow(opts.overdue ? -7 : 21)),
       st === 'assigned' ? null : daysFromNow(-(opts.startedAgo || 30)), completedAt,
       st === 'completed' ? opts.score : null,
       st === 'completed' && opts.pre ? opts.pre : null,
       st === 'completed' && opts.post ? opts.post : null,
       st === 'completed' ? 1 : 0,
       st === 'completed' ? (opts.hours || 6) : st === 'in_progress' ? 2 : 0,
       st === 'completed' && opts.rating ? opts.rating : null,
       st === 'completed' && opts.instructor ? opts.instructor : null,
       st === 'completed' && opts.content ? opts.content : null,
       st === 'completed' && opts.comment ? opts.comment : null,
       opts.companyId || emp.companyId]);
    enrollCount++;
    if (st === 'completed' && (opts.score || 0) >= 60) {
      const seq = String(certCount + 1).padStart(4, '0');
      const renewal = opts.compliance ? 12 : null;
      await sql.query(
        `INSERT INTO "Certificate" ("id","enrollmentId","courseId","employeeId","certificateNo","title","score","skillAwarded","issuedAt","validFrom","validUntil","renewalMonths","status","remindersSent","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,NOW(),NOW())`,
        [id('cert'), eid, courseId, emp.id, `CERT-FY2627-${seq}`, `${opts.courseTitle} — Certificate of Completion`, opts.score, opts.skill || null,
         completedAt, completedAt, renewal ? daysFromNow(opts.expiresInDays ?? (renewal * 365)) : null, renewal,
         JSON.stringify(opts.expiresInDays ? { '15': daysFromNow(-(opts.expiresInDays - 15)) } : {})]);
      certCount++;
    }
    return eid;
  };

  // POSH annual compliance: TNS+ISY mostly complete, GDC pending/overdue
  for (const [i, e] of tns.entries()) {
    await mkEnroll(e, C['POSH-101'], { status: 'completed', score: 85 + (i % 3) * 5, pre: 45, post: 88, rating: 4.2 + (i % 3) * 0.3, instructor: 4.5, content: 4.1, comment: i % 2 ? 'Clear scenarios, good pacing.' : 'Useful refresher with real case studies.', courseTitle: 'POSH Act — Prevention of Sexual Harassment', compliance: true, skill: 'POSH', daysAgo: 40 + i, expiresInDays: 340 });
  }
  for (const [i, e] of isy.entries()) {
    await mkEnroll(e, C['POSH-101'], { status: 'completed', score: 80 + (i % 4) * 4, pre: 42, post: 84, rating: 4.0 + (i % 2) * 0.5, instructor: 4.3, content: 4.4, comment: 'Well structured.', courseTitle: 'POSH Act — Prevention of Sexual Harassment', compliance: true, skill: 'POSH', daysAgo: 330 + i, expiresInDays: 25 + i * 4 });
  }
  for (const [i, e] of gdc.entries()) {
    if (i < 3) await mkEnroll(e, C['POSH-101'], { status: 'completed', score: 82 + i, pre: 40, post: 85, rating: 4.1, instructor: 4.0, content: 4.2, courseTitle: 'POSH Act — Prevention of Sexual Harassment', compliance: true, skill: 'POSH', daysAgo: 350 + i, expiresInDays: 8 + i * 3 });
    else await mkEnroll(e, C['POSH-101'], { status: i % 2 ? 'assigned' : 'in_progress', overdue: true, progress: 30, source: 'compliance_auto' });
  }
  // Cybersecurity: mixed
  for (const [i, e] of tns.entries()) {
    if (i % 3 !== 2) await mkEnroll(e, C['CYB-100'], { status: 'completed', score: 88 + (i % 3), pre: 55, post: 90, rating: 4.4, instructor: 4.2, content: 4.5, comment: 'Practical phishing examples.', courseTitle: 'Cybersecurity Awareness', compliance: true, skill: 'Cybersecurity', daysAgo: 20 + i, expiresInDays: 345 });
    else await mkEnroll(e, C['CYB-100'], { status: 'in_progress', progress: 55 });
  }
  for (const [i, e] of isy.entries()) {
    if (i < 4) await mkEnroll(e, C['CYB-100'], { status: 'completed', score: 86, pre: 50, post: 89, rating: 4.3, instructor: 4.1, content: 4.4, courseTitle: 'Cybersecurity Awareness', compliance: true, skill: 'Cybersecurity', daysAgo: 18 + i, expiresInDays: 347 });
    else await mkEnroll(e, C['CYB-100'], { status: 'assigned', dueDate: daysFromNow(30) });
  }
  // Technical + leadership spread on TNS/ISY
  await mkEnroll(tns[0], C['TECH-201'], { status: 'completed', score: 78, pre: 50, post: 82, rating: 4.6, instructor: 4.7, content: 4.5, comment: 'Best security course so far.', courseTitle: 'Advanced API Security', daysAgo: 25, skill: 'API Security' });
  await mkEnroll(tns[1], C['TECH-101'], { status: 'completed', score: 91, pre: 60, post: 92, rating: 4.8, instructor: 4.8, content: 4.9, comment: 'Loved the hooks deep-dive.', courseTitle: 'React & TypeScript Foundations', daysAgo: 60, skill: 'React' });
  await mkEnroll(tns[2], C['TECH-101'], { status: 'in_progress', progress: 65 });
  await mkEnroll(tns[3], C['LEAD-301'], { status: 'in_progress', progress: 40 });
  await mkEnroll(isy[0], C['LEAD-301'], { status: 'completed', score: 74, pre: 48, post: 80, rating: 4.4, instructor: 4.6, content: 4.2, comment: 'Coaching lab was excellent.', courseTitle: 'Leading High-Performance Teams', daysAgo: 100, skill: 'Leadership' });
  await mkEnroll(isy[1], C['SOFT-110'], { status: 'completed', score: 70, pre: 45, post: 75, rating: 4.0, instructor: 4.4, content: 3.9, courseTitle: 'Stakeholder Communication', daysAgo: 75, skill: 'Communication' });
  await mkEnroll(isy[2], C['TECH-201'], { status: 'assigned', dueDate: daysFromNow(14) });
  await mkEnroll(gdc[0], C['DOM-210'], { status: 'completed', score: 83, pre: 52, post: 86, rating: 4.3, instructor: 4.5, content: 4.1, comment: 'Relevant for our healthcare client.', courseTitle: 'Healthcare Data Privacy (HIPAA Basics)', daysAgo: 50, skill: 'Data Privacy' });
  await mkEnroll(gdc[1], C['TECH-150'], { status: 'in_progress', progress: 25 });
  // Onboarding path for newest joiners
  const newest = emps.slice(-4);
  for (const e of newest) {
    await mkEnroll(e, C['ONB-001'], { status: e === newest[0] ? 'completed' : 'in_progress', score: 95, pre: 0, post: 95, rating: 4.7, instructor: 4.5, content: 4.8, comment: 'Great first-week experience.', courseTitle: 'New Joiner Essentials', pathId: PATH_ONB, daysAgo: 12, progress: 50 });
  }
  // Promotion track enrollments (TL → Manager)
  for (const e of tns.slice(2, 5)) {
    await mkEnroll(e, C['LEAD-301'], { status: 'in_progress', progress: 45, pathId: PATH_TL, source: 'manager_recommendation' });
    await mkEnroll(e, C['SOFT-110'], { status: 'assigned', pathId: PATH_TL, source: 'manager_recommendation', dueDate: daysFromNow(28) });
  }
  log(`Enrollments: ${enrollCount} created · Certificates: ${certCount} issued`);

  // ── Assignments (rollup records) ────────────────────────────────────────
  await sql.query(
    `INSERT INTO "CourseAssignment" ("id","courseId","assigneeType","targetCount","dueDate","isMandatory","reason","status","assignedById","createdAt","updatedAt")
     VALUES ($1,$2,'company',$3,$4,true,'[seed] Annual statutory compliance push — all companies','active','seed',$5,$5)`,
    [id('ca'), C['POSH-101'], enrollCount, daysFromNow(21), new Date().toISOString()]);
  log('Assignment rollups created');

  // ── Compliance requirements ─────────────────────────────────────────────
  for (const [name, cat, courseId] of [['POSH Act Annual Training', 'POSH', C['POSH-101']], ['Cybersecurity Awareness', 'CYBERSECURITY', C['CYB-100']], ['Workplace Safety Induction', 'SAFETY', C['SAFE-100']]]) {
    await sql.query(
      `INSERT INTO "ComplianceRequirement" ("id","name","category","description","courseId","frequency","appliesToDepartments","graceDays","isActive","lastAssignedAt","companyId","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'annual',$6,7,true,$7,NULL,NOW(),NOW())`,
      [id('cr'), name, cat, `Mandatory annual ${name} certification for all employees.`, courseId, JSON.stringify(['all']), daysFromNow(-15)]);
  }
  log('Compliance requirements: 3 (POSH / Cybersecurity / Safety)');

  // ── Policy sign-offs ────────────────────────────────────────────────────
  const so1 = id('pso');
  await sql.query(
    `INSERT INTO "PolicySignOff" ("id","title","policyVersion","description","requiresSignature","dueDate","status","companyId","createdById","createdAt","updatedAt")
     VALUES ($1,'Hybrid Work Policy','v3.1','Updated eligibility norms, core-collaboration hours and attendance expectations for hybrid work. Effective next month.',true,$2,'published',NULL,$3,NOW(),NOW())`,
    [so1, daysFromNow(14), MARKER]);
  const so2 = id('pso');
  await sql.query(
    `INSERT INTO "PolicySignOff" ("id","title","policyVersion","description","requiresSignature","dueDate","status","companyId","createdById","createdAt","updatedAt")
     VALUES ($1,'Information Security Policy','v7.0','Annual ISMS acknowledgement: acceptable use, data classification and incident reporting.',true,$2,'published',NULL,$3,NOW(),NOW())`,
    [so2, daysFromNow(7), MARKER]);
  for (const [i, e] of emps.entries()) {
    const signed = i < emps.length * 0.6; // ~60% signed
    await sql.query(
      `INSERT INTO "PolicySignOffAck" ("id","signOffId","employeeId","status","signedAt","signatureName","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [id('ack'), so1, e.id, signed ? 'signed' : 'pending', signed ? daysFromNow(-(i % 9) - 1) : null, signed ? `${e.firstName} ${e.lastName}` : null]);
    await sql.query(
      `INSERT INTO "PolicySignOffAck" ("id","signOffId","employeeId","status","signedAt","signatureName","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [id('ack'), so2, e.id, i < 3 ? 'signed' : 'pending', i < 3 ? daysFromNow(-2 - i) : null, i < 3 ? `${e.firstName} ${e.lastName}` : null]);
  }
  log(`Policy sign-offs: 2 campaigns, ${emps.length * 2} acknowledgements (~60% signed)`);

  // ── Skill gaps from performance reviews (TNI) ───────────────────────────
  const reviews = (await sql`
    SELECT pr."id", pr."employeeId", pr."skillsRating", pr."improvements", pr."reviewDate"
    FROM "PerformanceReview" pr JOIN "Employee" e ON e."id" = pr."employeeId"
    WHERE e."companyId" IN (SELECT "companyId" FROM "Employee" WHERE "employeeId" LIKE 'EMP-TNS%' OR "employeeId" LIKE 'EMP-ISY%')
    ORDER BY pr."reviewDate" DESC LIMIT 20`).length ? await sql`
    SELECT pr."id", pr."employeeId", pr."skillsRating", pr."improvements", pr."reviewDate"
    FROM "PerformanceReview" pr JOIN "Employee" e ON e."id" = pr."employeeId"
    JOIN "Company" c ON c."id" = e."companyId"
    WHERE c."code" IN ('TNS','ISY','GDC') ORDER BY pr."reviewDate" DESC LIMIT 20` : [];
  if (reviews.length) {
    const suggestMap = { Communication: C['SOFT-110'], Leadership: C['LEAD-301'], 'API Security': C['TECH-201'], React: C['TECH-101'], Cybersecurity: C['CYB-100'], 'Data Privacy': C['DOM-210'] };
    let gaps = 0;
    for (const r of reviews) {
      const skillKeys = Object.keys(suggestMap);
      const pick = skillKeys[r.skillsRating % skillKeys.length];
      const low = r.skillsRating && r.skillsRating <= 6;
      if (!low && gaps >= 6) continue;
      await sql.query(
        `INSERT INTO "SkillGap" ("id","employeeId","skill","currentLevel","requiredLevel","source","reviewId","suggestedCourseId","status","notes","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'8/10','performance_review',$5,$6,$7,$8,NOW(),NOW())`,
        [id('sg'), r.employeeId, pick, `${r.skillsRating || 5}/10`, r.id, suggestMap[pick], gaps % 3 === 0 ? 'in_training' : 'suggested', MARKER]);
      gaps++;
      if (gaps >= 8) break;
    }
    log(`Skill gaps: ${Math.min(gaps, 8)} generated from performance reviews (auto-suggested courses)`);
  } else {
    log('No performance reviews found — skipping skill gaps');
  }

  // ── Training requests ───────────────────────────────────────────────────
  if (tns[4] && isy[3]) {
    await sql.query(
      `INSERT INTO "TrainingRequest" ("id","employeeId","courseId","requestType","reason","expectedCost","status","companyId","createdAt","updatedAt")
       VALUES ($1,$2,$3,'self','[seed] Need this for the Q4 platform migration — API hardening is a blocker.',0,'pending',$4,NOW(),NOW())`,
      [id('tr'), tns[4].id, C['TECH-201'], tns[4].companyId]);
    await sql.query(
      `INSERT INTO "TrainingRequest" ("id","employeeId","courseId","requestType","reason","expectedCost","status","companyId","createdAt","updatedAt")
       VALUES ($1,$2,$3,'self','[seed] Preparing for team-lead promotion track.',25000,'pending',$4,NOW(),NOW())`,
      [id('tr'), isy[3].id, C['LEAD-301'], isy[3].companyId]);
    log('Training requests: 2 pending (for approval demo)');
  }

  log('DONE — L&D sample data seeded in DEMO tenant only');
}

main().catch((e) => { console.error('[lnd-seed] FAILED:', e.message); process.exit(1); });
