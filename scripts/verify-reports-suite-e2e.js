/* E2E: verify all new + enhanced report types on demo tenant (admin + employee scopes) */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function login(email) {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
        body: JSON.stringify({ email, password: 'MarqAI@2026' }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.token;
      }
    } catch { /* retry */ }
    await sleep(20000);
  }
  throw new Error(`login ${email} failed after retries`);
}

async function get(token, url) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': '3boxes-hrms-demo' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}

let pass = 0, failCount = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failCount++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  console.log('Logging in (waiting for Vercel deploy)...');
  const admin = await login('admin@3boxeshrms.com');
  console.log('✓ admin logged in');

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const q = `month=${month}&year=${year}`;

  /* 1. attendance_report — period-aware */
  let r = await get(admin, `/api/reports?type=attendance_report&${q}`);
  check('attendance_report 200', r.status === 200, `status=${r.status}`);
  check('attendance_report has month-scoped fields', r.body.month === month && r.body.year === year, JSON.stringify({ month: r.body.month, year: r.body.year }));
  check('attendance_report byStatus populated', Object.keys(r.body.byStatus || {}).length > 0, JSON.stringify(r.body.byStatus));
  check('attendance_report byDate populated', Object.keys(r.body.byDate || {}).length > 0, `${Object.keys(r.body.byDate || {}).length} days`);
  check('attendance_report records flat rows', Array.isArray(r.body.records) && r.body.records.length > 0 && typeof r.body.records[0].employeeCode === 'string', `${r.body.records?.length} records`);
  const sep2026 = await get(admin, `/api/reports?type=attendance_report&month=9&year=2026`);
  check('attendance_report historical month (Sep 2026) works', sep2026.status === 200 && sep2026.body.month === 9, `total=${sep2026.body.total}`);

  /* 2. muster_roll */
  r = await get(admin, `/api/reports?type=muster_roll&${q}`);
  check('muster_roll 200', r.status === 200, `status=${r.status}`);
  check('muster_roll dayHeaders = days in month', Array.isArray(r.body.dayHeaders) && r.body.dayHeaders.length === r.body.daysInMonth, `${r.body.daysInMonth} days`);
  check('muster_roll roster rows with day matrix', Array.isArray(r.body.records) && r.body.records.length > 0 && Array.isArray(r.body.records[0].days) && r.body.records[0].days.length === r.body.daysInMonth, `${r.body.records?.length} employees`);
  const withPunch = (r.body.records || []).find(e => e.presentDays > 0);
  check('muster_roll at least one employee with present days', Boolean(withPunch), withPunch ? `${withPunch.name}: P=${withPunch.presentDays} A=${withPunch.absentDays} L=${withPunch.leaveDays} WO=${withPunch.weekendDays}` : '');
  check('muster_roll summary KPIs', Array.isArray(r.body.summary) && r.body.summary.length >= 5);
  const balaLeaveOk = (r.body.records || []).some(e => (e.name || '').includes('Bala') && e.leaveDays >= 1);
  check('muster_roll approved leave (25-26 Sep) shows as L days', balaLeaveOk, `Bala rows: ${(r.body.records || []).filter(e => (e.name || '').includes('Bala')).map(e => `L=${e.leaveDays}`).join(', ')}`);

  /* 3. dept-wise + designation-wise */
  r = await get(admin, `/api/reports?type=attendance_dept_wise&${q}`);
  check('attendance_dept_wise 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length > 0, `${r.body.records?.length} departments`);
  check('attendance_dept_wise has headcount + rates', r.body.records?.[0]?.headcount !== undefined && r.body.records?.[0]?.attendanceRate !== undefined);
  r = await get(admin, `/api/reports?type=attendance_designation_wise&${q}`);
  check('attendance_designation_wise 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length > 0, `${r.body.records?.length} designations`);

  /* 4. WFH report (demo has Bala pending WFH 21-25 Sep from Task 48) */
  r = await get(admin, `/api/reports?type=wfh_report&month=9&year=2026`);
  check('wfh_report 200', r.status === 200);
  check('wfh_report rows (Task 48 left pending WFH)', Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} requests`);

  /* 5. gatepass_report (Task 48 left [E2E] gatepasses for Bala on 19 Sep) */
  r = await get(admin, `/api/reports?type=gatepass_report&month=9&year=2026`);
  check('gatepass_report 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} passes`);

  /* 6. regularization_report (Tasks 47/48 left rows) */
  r = await get(admin, `/api/reports?type=regularization_report&month=9&year=2026`);
  check('regularization_report 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} requests`);

  /* 7. permission_report (Task 48 left [E2E] permissions for Bala on 19 Sep) */
  r = await get(admin, `/api/reports?type=permission_report&month=9&year=2026`);
  check('permission_report 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} permissions`);

  /* 8. compoff_report (Task 48 left 8h credit for Bala) */
  r = await get(admin, `/api/reports?type=compoff_report&month=9&year=2026`);
  check('compoff_report 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} credits`);

  /* 9. overtime_request_report (Task 48 left rows) */
  r = await get(admin, `/api/reports?type=overtime_request_report&month=9&year=2026`);
  check('overtime_request_report 200 + rows', r.status === 200 && Array.isArray(r.body.records) && r.body.records.length >= 1, `${r.body.records?.length} requests`);

  /* 10. shift_report */
  r = await get(admin, `/api/reports?type=shift_report&${q}`);
  check('shift_report 200 + records', r.status === 200 && Array.isArray(r.body.records), `${r.body.records?.length} rows`);

  /* 11. holiday_report */
  r = await get(admin, `/api/reports?type=holiday_report&year=2026`);
  check('holiday_report 200', r.status === 200);
  check('holiday_report year rows', Array.isArray(r.body.records), `${r.body.records?.length} holidays in 2026`);

  /* 12. filters: company + department narrowing */
  const deptsRes = await get(admin, '/api/departments?limit=100');
  const firstDept = (deptsRes.body.data || [])[0];
  if (firstDept) {
    r = await get(admin, `/api/reports?type=muster_roll&${q}&departmentId=${firstDept.id}`);
    check('muster_roll departmentId filter narrows roster', r.status === 200 && Array.isArray(r.body.records), `${r.body.records?.length} rows for dept ${firstDept.name}`);
  } else {
    console.log('  SKIP  department filter (no departments returned)');
  }

  /* 13. employee scope — Bala sees only own rows */
  const bala = await login('bala.mukherjee@innovatech.demo');
  r = await get(bala, `/api/reports?type=attendance_report&${q}`);
  check('employee attendance_report self-scoped 200', r.status === 200, `scope=${r.body.dataScope}`);
  check('employee attendance_report only own records', Array.isArray(r.body.records) && r.body.records.every(x => x.name === 'Bala Mukherjee'), `${r.body.records?.length} rows`);
  r = await get(bala, `/api/reports?type=muster_roll&${q}`);
  check('employee muster_roll self row only', r.status === 200 && Array.isArray(r.body.records) && r.body.records.every(e => (e.name || '').includes('Bala')), `${r.body.records?.length} row(s)`);
  r = await get(bala, `/api/reports?type=gatepass_report&month=9&year=2026`);
  check('employee gatepass_report self-scoped', r.status === 200 && Array.isArray(r.body.records) && r.body.records.every(x => x.name === 'Bala Mukherjee'), `${r.body.records?.length} rows`);

  console.log(`\n===== RESULT: ${pass} PASS / ${failCount} FAIL =====`);
  process.exit(failCount > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
