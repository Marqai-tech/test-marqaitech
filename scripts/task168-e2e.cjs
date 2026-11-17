// Task 168 (f0c0a2cc) post-deploy E2E on marqaitechgroup production.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); cond ? pass++ : fail++; };

const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='));
const platform = neon(envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));

(async () => {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
  const { token } = await login.json();
  if (!token) { console.log('LOGIN FAILED'); process.exit(1); }
  const H = { ...T, Authorization: `Bearer ${token}` };

  console.log('=== 1. UNAUTH CONTRACT ===');
  for (const p of ['/api/payroll/attendance-reconciliation', '/api/attendance/duty-roster', '/api/payroll/attendance-corrections']) {
    const r = await fetch(BASE + p);
    ok(`GET ${p} anon -> 401`, r.status === 401, String(r.status));
  }

  console.log('=== 2. RECONCILIATION (Sep 2026 — Syed case) ===');
  const rec = await fetch(BASE + '/api/payroll/attendance-reconciliation?month=2026-09', { headers: H });
  const recJ = await rec.json().catch(() => null);
  ok('reconciliation 200', rec.status === 200, rec.status);
  const rows = recJ?.rows || recJ?.data?.rows || [];
  ok('returns rows', Array.isArray(rows) && rows.length > 0, 'n=' + rows.length);
  const syed = rows.find(r => (r.employeeId || r.employeeCode) === 'MARQ015');
  if (syed) {
    console.log('   MARQ015:', JSON.stringify(syed).slice(0, 240));
    ok('Syed payroll LOP = 2.0 visible', Number(syed.payrollLopDays ?? syed.payrollLop) === 2, 'payrollLop=' + (syed.payrollLopDays ?? syed.payrollLop));
    ok('Syed live LOP = 2.0 (1 absent + 2 half-day)', Number(syed.liveLopDays ?? syed.liveLop) === 2, 'liveLop=' + (syed.liveLopDays ?? syed.liveLop) + ', absent=' + syed.absentDays + ', halfDay=' + syed.halfDayDays);
  } else {
    ok('Syed MARQ015 row present', false, 'not found in reconciliation rows');
  }

  console.log('=== 3. DUTY ROSTER ===');
  const dr = await fetch(BASE + '/api/attendance/duty-roster?month=2026-10', { headers: H });
  const drJ = await dr.json().catch(() => null);
  ok('duty-roster calendar 200', dr.status === 200, dr.status);
  const cal = drJ?.calendar || [];
  ok('calendar covers employees', Array.isArray(cal) && cal.length > 0, 'employees=' + cal.length + ', shifts=' + (drJ?.shifts?.length ?? '?'));
  const someDay = cal[0]?.days ? Object.entries(cal[0].days).slice(0, 3) : [];
  console.log('   sample resolved days:', JSON.stringify(someDay).slice(0, 200));

  // write path: single-day override then delete (self-cleaning)
  const shifts = drJ?.shifts || [];
  if (shifts.length && cal.length) {
    const empId = cal[0].employeeId || cal[0].employeeid;
    const ov = await fetch(BASE + '/api/attendance/duty-roster', { method: 'PATCH', headers: H, body: JSON.stringify({ employeeId: empId, date: '2026-11-15', shiftId: shifts[0].id }) });
    const ovJ = await ov.json().catch(() => null);
    ok('single-day override applied', ov.status === 200 || ov.status === 201, ov.status + ' ' + JSON.stringify(ovJ).slice(0, 120));
    const aid = ovJ?.assignment?.id || ovJ?.assignmentId;
    if (aid) {
      const del = await fetch(BASE + '/api/attendance/duty-roster?assignmentId=' + aid, { method: 'DELETE', headers: H });
      ok('override cleaned up (DELETE)', del.status === 200 || del.status === 204, String(del.status));
    }
  }

  console.log('=== 4. ATTENDANCE CORRECTIONS (apply -> audit -> email) ===');
  const corr = await fetch(BASE + '/api/payroll/attendance-corrections', {
    method: 'POST', headers: H,
    body: JSON.stringify({ employeeCode: 'MARQ015', date: '2026-09-02', checkIn: '03:58', checkOut: '09:43', status: 'present', note: 'Task 168 verification — same values re-applied deliberately (no data change)', reason: 'Task 168 E2E verification' }),
  });
  const corrJ = await corr.json().catch(() => null);
  ok('correction apply 200', corr.status === 200, corr.status + ' ' + JSON.stringify(corrJ).slice(0, 160));
  const applied = corrJ?.applied ?? 0;
  ok('row applied', applied >= 1, 'applied=' + applied + ' failed=' + (corrJ?.failed ?? '?'));

  const audit = await fetch(BASE + '/api/payroll/attendance-corrections', { headers: H });
  const auditJ = await audit.json().catch(() => null);
  const logs = auditJ?.logs || [];
  ok('audit trail lists payroll_correction entries', audit.status === 200 && logs.length > 0, 'logs=' + logs.length);
  if (logs[0]) console.log('   latest log:', logs[0].action, '|', String(logs[0].reason || '').slice(0, 60));

  // email + in-app dispatch proof from the delivery log
  await new Promise(r => setTimeout(r, 8000));
  const tenants = await platform.query('SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true');
  const db = neon(tenants.find(x => /marqai/i.test(x.slug)).cs);
  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const del = await db.query(`SELECT channel, status, COUNT(*)::int AS n FROM "NotificationDelivery" WHERE "eventKey" = 'payroll.attendance_corrected' AND "createdAt" >= $1 GROUP BY channel, status`, [since]);
  const inApp = del.filter(r => r.channel === 'in_app').reduce((a, r) => a + r.n, 0);
  const email = del.filter(r => r.channel === 'email').reduce((a, r) => a + r.n, 0);
  ok('admin/HR notification fanned out', inApp > 0 || email > 0, JSON.stringify(del));

  console.log('=== 5. NOTICE PERIOD TRACKER ===');
  const np = await fetch(BASE + '/api/employees/resignation?status=approved', { headers: H });
  const npJ = await np.json().catch(() => null);
  ok('resignation API with status filter 200', np.status === 200, np.status);
  const recs = npJ?.resignations || npJ?.requests || npJ?.data || (Array.isArray(npJ) ? npJ : []);
  console.log('   approved resignation records:', Array.isArray(recs) ? recs.length : typeof npJ);
  const page = await fetch(BASE + '/employees/notice-period', { headers: { Cookie: `tb_token=${token}` } });
  const pageHtml = await page.text();
  ok('notice-period page route live (auth page 200, not redirect)', page.status === 200 && !pageHtml.includes('Redirecting...'), page.status + ' len=' + pageHtml.length);
  for (const p of ['/payroll/attendance-corrections', '/payroll/attendance-reconciliation', '/attendance/duty-roster']) {
    const pg = await fetch(BASE + p, { headers: { Cookie: `tb_token=${token}` } });
    const html = await pg.text();
    ok(`page ${p} live`, pg.status === 200 && !html.includes('Redirecting...'), pg.status + ' len=' + html.length);
  }

  console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E ERROR:', e.message); process.exit(1); });
