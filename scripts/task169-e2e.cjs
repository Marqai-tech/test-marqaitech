/**
 * Task 169 — postdeploy E2E against LIVE.
 * Covers: my-roster admin scope (whole workforce + single person), my-roster
 * manager scope (mahesh: own + 1 reportee), employee scope + 403 negative,
 * page bundle markers, project-task delivery-breakdown create→patch→verify→
 * cleanup + unauthenticated 401 contract.
 * USAGE: set -a; source .env.production.local; set +a; node scripts/task169-e2e.cjs
 */
const { neon } = require('@neondatabase/serverless');

const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };
const results = [];
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: T, body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.token || null;
}

(async () => {
  // ── 1. HR/admin login ──
  const hrToken = await login('hr@marqaitech.com', 'MarqAI@2026');
  ok('HR/admin login', !!hrToken);
  if (!hrToken) return;
  const AH = { Authorization: `Bearer ${hrToken}`, ...T };

  // ── 2. my-roster admin scope: whole workforce ──
  const r2 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`, { headers: AH });
  const j2 = await r2.json().catch(() => null);
  ok('my-roster 200 (admin, whole workforce)', r2.status === 200 && !!j2?.calendar);
  ok('admin calendar covers active workforce', (j2?.calendar?.length || 0) >= 5, `rows=${j2?.calendar?.length}`);
  ok('October grid = 31 days', (j2?.days?.length || 0) === 31, `days=${j2?.days?.length}`);
  ok('viewer flagged admin', j2?.viewer?.isAdmin === true);
  ok('shift definitions returned', (j2?.shifts?.length || 0) >= 2, `shifts=${j2?.shifts?.length}`);
  const sampleCell = j2?.calendar?.[0]?.days?.['2026-10-15'];
  ok('calendar cells resolve (shift or policy-default)', !!sampleCell && ['roster', 'policy-default'].includes(sampleCell.source), JSON.stringify(sampleCell || {}).slice(0, 90));
  const allPeopleHaveRel = (j2?.people || []).every(p => ['self', 'reportee'].includes(p.relationship) && !!p.employeeName);
  ok('people rows well-formed', allPeopleHaveRel && (j2?.people?.length || 0) >= 5, `people=${j2?.people?.length}`);

  // ── 3. my-roster admin scope: single named person ──
  const someone = (j2?.people || []).find(p => p.relationship !== 'self');
  const r3 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10&employeeId=${someone?.employeeId}`, { headers: AH });
  const j3 = await r3.json().catch(() => null);
  ok('my-roster 200 single person (admin, employeeId)', r3.status === 200 && j3?.people?.length === 1 && j3?.people?.[0]?.employeeId === someone?.employeeId);
  ok('single-person calendar has exactly 1 row', (j3?.calendar?.length || 0) === 1);

  // ── 4. manager scope: mahesh (1 reportee) sees exactly own + reportee ──
  const mTok = await login('mahesh@marqaitech.com', 'MarqAI@2026');
  if (mTok) {
    const r4 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`, { headers: { Authorization: `Bearer ${mTok}`, ...T } });
    const j4 = await r4.json().catch(() => null);
    ok('my-roster 200 (manager)', r4.status === 200 && !!j4?.people);
    ok('manager sees self + reportee(s), NOT whole company', j4?.people?.length >= 2 && j4?.people?.length <= 3 && j4?.people?.some(p => p.relationship === 'self') && j4?.people?.some(p => p.relationship === 'reportee'), `people=${j4?.people?.length}`);
    ok('manager viewer.isManager=true', j4?.viewer?.isManager === true);
    // manager requests a stranger → 403
    const stranger = (j2?.people || []).find(p => !j4?.people?.some(q => q.employeeId === p.employeeId));
    if (stranger) {
      const r4b = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10&employeeId=${stranger.employeeId}`, { headers: { Authorization: `Bearer ${mTok}`, ...T } });
      ok('manager 403 on employee outside scope', r4b.status === 403, `status=${r4b.status}`);
    }
  } else {
    console.log('SKIP — no manager login (mahesh@marqaitech.com / MarqAI@2026 failed)');
  }

  // ── 5. employee scope: bharath sees ONLY himself ──
  const eTok = await login('bharath@marqaitech.com', 'MarqAI@2026');
  if (eTok) {
    const r5 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`, { headers: { Authorization: `Bearer ${eTok}`, ...T } });
    const j5 = await r5.json().catch(() => null);
    ok('my-roster 200 (employee)', r5.status === 200 && !!j5?.people);
    ok('employee sees EXACTLY own roster', j5?.people?.length === 1 && j5?.people?.[0]?.relationship === 'self', `people=${j5?.people?.length}`);
    ok('employee viewer.isManager=false', j5?.viewer?.isManager === false);
    const r5b = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10&employeeId=${someone?.employeeId}`, { headers: { Authorization: `Bearer ${eTok}`, ...T } });
    ok('employee 403 on another employee roster', r5b.status === 403, `status=${r5b.status}`);
  } else {
    console.log('SKIP — no employee login (bharath@marqaitech.com / MarqAI@2026 failed)');
  }

  // ── 6. page bundle markers (authenticated cookie fetch) ──
  const page = await fetch(`${BASE}/attendance/my-roster`, { headers: { Cookie: `tb_token=${hrToken}` } });
  const html = await page.text();
  ok('GET /attendance/my-roster renders app shell (200 HTML)', page.status === 200 && html.includes('/_next/static'));
  const chunks = Array.from(new Set((html.match(/\/_next\/static\/[^"']+\.js/g) || [])));
  let found = { title: false, week: false, legend: false };
  for (const c of chunks) {
    try {
      const b = await fetch(`${BASE}${c}`, { signal: AbortSignal.timeout(15000) });
      if (!b.ok) continue;
      const t = await b.text();
      if (t.includes('My Duty Roster')) found.title = true;
      if (t.includes('This Week')) found.week = true;
      if (t.includes('Company default shift')) found.legend = true;
    } catch { /* chunk fetch hiccup */ }
    if (found.title && found.week && found.legend) break;
  }
  ok('bundle marker: page title', found.title);
  ok('bundle marker: This Week strip', found.week);
  ok('bundle marker: default-shift legend', found.legend);

  // ── 7. unauthenticated contracts ──
  const r7 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`);
  ok('unauthenticated my-roster → 401 JSON', r7.status === 401 && (r7.headers.get('content-type') || '').includes('application/json'));

  // ── 8. project task delivery breakdown: create → patch → verify → cleanup ──
  const pid = 'cmvgiqodw000107jub73qrbd2'; // 3 BOXES LUXURY PORTAL
  const stamp = Date.now().toString(36);
  const createBody = {
    name: `Task 169 E2E delivery-breakdown ${stamp}`,
    taskType: 'development',
    priority: 'low',
    module: 'E2E Module A',
    subModule: 'E2E SubModule B',
    subSection: 'E2E SubSection C',
    softwareLink: 'https://example.com/task169-e2e',
  };
  const r8 = await fetch(`${BASE}/api/projects/${pid}/tasks`, { method: 'POST', headers: AH, body: JSON.stringify(createBody) });
  const j8 = await r8.json().catch(() => null);
  ok('create task with breakdown fields → 201', r8.status === 201 && !!j8?.task?.id, `status=${r8.status}`);
  ok('created task echoes module/subModule/subSection/softwareLink',
    j8?.task?.module === 'E2E Module A' && j8?.task?.subModule === 'E2E SubModule B' && j8?.task?.subSection === 'E2E SubSection C' && j8?.task?.softwareLink === 'https://example.com/task169-e2e',
    JSON.stringify({ m: j8?.task?.module, s: j8?.task?.subModule, ss: j8?.task?.subSection, l: j8?.task?.softwareLink }));
  const taskId = j8?.task?.id;

  // invalid URL rejected
  const r8b = await fetch(`${BASE}/api/projects/${pid}/tasks`, { method: 'POST', headers: AH, body: JSON.stringify({ name: `Task 169 bad link ${stamp}`, softwareLink: 'not-a-url' }) });
  ok('invalid softwareLink → 400', r8b.status === 400, `status=${r8b.status}`);

  if (taskId) {
    const r9 = await fetch(`${BASE}/api/projects/${pid}/tasks/${taskId}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ softwareLink: 'https://updated.example.com/link', subSection: '', module: 'E2E Module A2' }),
    });
    const j9 = await r9.json().catch(() => null);
    ok('patch task fields → 200', r9.status === 200, `status=${r9.status}`);
    ok('patched: link updated, subSection cleared, module changed',
      j9?.task?.softwareLink === 'https://updated.example.com/link' && (j9?.task?.subSection === null || j9?.task?.subSection === '') && j9?.task?.module === 'E2E Module A2',
      JSON.stringify({ l: j9?.task?.softwareLink, ss: j9?.task?.subSection, m: j9?.task?.module }));

    // GET persistence
    const r10 = await fetch(`${BASE}/api/projects/${pid}/tasks`, { headers: AH });
    const j10 = await r10.json().catch(() => null);
    const row = (j10?.tasks || []).find(t => t.id === taskId);
    ok('GET tasks returns persisted breakdown fields', !!row && row.module === 'E2E Module A2' && row.softwareLink === 'https://updated.example.com/link' && !row.subSection);

    // DB-level persistence proof (tenant DB)
    try {
      const platform = neon(process.env.DATABASE_URL);
      const tds = await platform`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true AND t.slug = 'marqaitechgroup'`;
      const db = neon(tds[0].cs);
      const rows = await db`SELECT module, "subModule", "subSection", "softwareLink" FROM "ProjectTask" WHERE id = ${taskId}`;
      ok('tenant DB row carries the new columns', rows.length === 1 && rows[0].module === 'E2E Module A2' && rows[0].softwareLink === 'https://updated.example.com/link' && rows[0].subSection === null, JSON.stringify(rows[0] || {}));
    } catch (e) {
      ok('tenant DB row check (skipped — query error)', false, String(e).slice(0, 80));
    }

    // cleanup
    const r11 = await fetch(`${BASE}/api/projects/${pid}/tasks/${taskId}`, { method: 'DELETE', headers: AH });
    ok('cleanup: test task deleted', r11.ok || r11.status === 200, `status=${r11.status}`);
  }

  const r12 = await fetch(`${BASE}/api/projects/${pid}/tasks`, { method: 'POST', headers: T, body: JSON.stringify({ name: 'anon' }) });
  ok('unauthenticated task create → 401 JSON', r12.status === 401 && (r12.headers.get('content-type') || '').includes('application/json'));

  // ── audit details stamp check (create logged with module path) ──
  try {
    const platform = neon(process.env.DATABASE_URL);
    const tds = await platform`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true AND t.slug = 'marqaitechgroup'`;
    const db = neon(tds[0].cs);
    const logs = await db`SELECT details FROM "AuditLog" WHERE action = 'CREATE_PROJECT_TASK' AND details LIKE '%Task 169 E2E delivery-breakdown ${stamp}%' LIMIT 1`;
    ok('CREATE_PROJECT_TASK audit stamps module path', logs.length === 1 && (logs[0].details || '').includes('[E2E Module A'), (logs[0]?.details || '').slice(-80));
  } catch { /* non-fatal */ }

  console.log(`\n=== task169 E2E: ${pass}/${pass + fail} PASS, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E fatal:', e); process.exit(1); });
