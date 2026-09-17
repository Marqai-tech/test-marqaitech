/**
 * Task 51 E2E — Attendance module reports page data verification (demo tenant).
 * Verifies /api/reports?type=attendance_report returns data + export endpoints work.
 * READ-ONLY: GET queries + export generation only.
 */
const DEMO = 'https://nexus-hrms-mu.vercel.app';
const ADMIN = { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' };

async function main() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  // 1. Login
  const loginRes = await fetch(`${DEMO}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  ok('login', loginRes.ok);
  const { token } = await loginRes.json();
  const H = { Authorization: `Bearer ${token}`, 'x-tenant-slug': '3boxes-hrms-demo' };

  // 2. attendance_report current month (Sep 2026)
  const now = new Date();
  const month = now.getUTCMonth() + 1, year = now.getUTCFullYear();
  let r = await fetch(`${DEMO}/api/reports?type=attendance_report&month=${month}&year=${year}`, { headers: H });
  ok('attendance_report HTTP 200', r.status === 200);
  const d = await r.json();
  ok('attendance_report has records', Array.isArray(d.records) && d.records.length > 0, `${d.total || 0} records`);
  ok('byDate populated', d.byDate && Object.keys(d.byDate).length > 0, `${Object.keys(d.byDate || {}).length} days`);
  ok('byDepartment populated', d.byDepartment && Object.keys(d.byDepartment).length > 0, `${Object.keys(d.byDepartment || {}).length} depts`);
  ok('attendanceRate present', typeof d.attendanceRate === 'number', `${d.attendanceRate}%`);
  ok('records have fields', d.records?.[0]?.name && d.records?.[0]?.date && d.records?.[0]?.status !== undefined,
    `sample: ${d.records?.[0]?.name} ${d.records?.[0]?.date} ${d.records?.[0]?.status}`);

  // 3. historical month
  r = await fetch(`${DEMO}/api/reports?type=attendance_report&month=8&year=${year}`, { headers: H });
  const dh = await r.json();
  ok('historical month query', r.status === 200 && typeof dh.attendanceRate === 'number', `Aug: ${dh.total || 0} records`);

  // 4. department filter
  const depts = await fetch(`${DEMO}/api/departments?limit=100`, { headers: H }).then(x => x.json()).catch(() => ({}));
  const deptList = depts.departments || depts.data || [];
  ok('departments list for filter', Array.isArray(deptList) && deptList.length > 0, `${deptList.length}`);
  if (deptList.length) {
    r = await fetch(`${DEMO}/api/reports?type=attendance_report&month=${month}&year=${year}&departmentId=${deptList[0].id}`, { headers: H });
    const df = await r.json();
    const filteredDepts = new Set((df.records || []).map(x => x.department));
    ok('department filter narrows data', r.status === 200 && (df.total || 0) <= (d.total || 0), `${df.total} records, dept set: ${[...filteredDepts].join(', ')}`);
  }

  // 5. export endpoints (pdf / excel / csv)
  const payload = {
    reportType: 'custom', format: 'pdf',
    title: `Daily Attendance Summary — ${month}/${year}`,
    summary: { 'Total Records': d.total, 'Attendance Rate': `${d.attendanceRate}%` },
    filename: `daily_attendance_summary_${year}_${month}`,
    data: Object.entries(d.byDate || {}).slice(0, 10).map(([date, b]) => ({ Date: date, ...b })),
  };
  for (const [fmt, ctype] of [['pdf', 'application/pdf'], ['excel', 'spreadsheet'], ['csv', 'text/csv']]) {
    const er = await fetch(`${DEMO}/api/reports/export`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, format: fmt }),
    });
    const buf = await er.arrayBuffer();
    ok(`export ${fmt.toUpperCase()}`, er.status === 200 && buf.byteLength > 500,
      `${buf.byteLength} bytes, ${(er.headers.get('content-type') || '').includes(ctype) ? 'content-type OK' : er.headers.get('content-type')}`);
  }

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('E2E error:', e); process.exit(1); });
