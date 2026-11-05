/**
 * Task 83 post-deploy verify — LIVE + demo
 * 1. /api/attendance month-range + employeeIds (muster roll contract)
 * 2. /api/attendance/biometric/punch-log new filters (punchType, departmentId,
 *    full-day from/to, employeeId) + department in payload
 * 3. Regression: single-date + status filters still work; Task 82 toggle intact
 */
const BASES = {
  LIVE: 'https://marqaitechgroup.3boxeshrms.com',
  DEMO: 'https://nexus-hrms-mu.vercel.app',
};
const CREDS = {
  LIVE: { email: 'hr@gmail.com', password: 'MarqAI@2026' },
  DEMO: { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' },
};

let pass = 0, failCount = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function api(base, path, H) {
  const res = await fetch(`${base}${path}`, { headers: H });
  let data; try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function verifySite(name, base, creds) {
  console.log(`\n=== ${name} (${base}) ===`);
  const login = await api(base, '/api/auth/login', { 'Content-Type': 'application/json' } /* body below */);
  const lr = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const ld = await lr.json();
  check('login', lr.status === 200 && !!ld.token, `role=${ld.user?.role}`);
  const H = { Authorization: `Bearer ${ld.token}`, 'x-tenant-slug': name === 'LIVE' ? 'marqaitechgroup' : '3boxes-hrms-demo' };

  // ── employees for ids/departments ──
  const emps = await api(base, '/api/employees?limit=500', H);
  const rows = emps.data.employees || [];
  check('employees list', rows.length > 0, `${rows.length} employees`);
  const ids = rows.map(e => e.id);
  const deptIds = [...new Set(rows.map(e => e.department?.id).filter(Boolean))];

  // ── 1. month-range + employeeIds ──
  const now = new Date();
  const y = now.getUTCFullYear(); // LIVE clock is Oct 2026; use current month via IST
  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const yy = nowIst.getUTCFullYear(), mm = nowIst.getUTCMonth();
  const lastDay = new Date(yy, mm + 1, 0).getUTCDate();
  const startDate = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
  const endDate = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const mr = await api(base, `/api/attendance?employeeIds=${encodeURIComponent(ids.join(','))}&startDate=${startDate}&endDate=${endDate}&limit=10000`, H);
  const mrRows = mr.data.attendance || [];
  check('muster-roll call 200', mr.status === 200, `${mrRows.length} rows`);
  const allInMonth = mrRows.every(r => (r.date || '').slice(0, 7) === startDate.slice(0, 7));
  check('all rows within requested month', allInMonth, `month=${startDate.slice(0, 7)}`);
  const withPunches = mrRows.filter(r => r.checkIn || r.checkOut);
  check('rows carry in/out punches', mrRows.length === 0 || withPunches.length > 0,
    mrRows.length === 0 ? '0 rows this month (vacuous — no data on this site)' : `${withPunches.length}/${mrRows.length} with punches`);
  check('pagination total matches rows', (mr.data.pagination?.total ?? 0) === mrRows.length, `total=${mr.data.pagination?.total}`);

  // single-date regression (Task 69 window)
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const sd = await api(base, `/api/attendance?date=${yesterday}&limit=50`, H);
  check('single-date filter still works', sd.status === 200, `date=${yesterday} rows=${(sd.data.attendance || []).length}`);

  // ── 2. biometric punch-log filters ──
  const plAll = await api(base, '/api/attendance/biometric/punch-log?limit=200', H);
  const plRows = plAll.data.punches || [];
  check('punch-log base 200', plAll.status === 200, `${plRows.length} punches, total=${plAll.data.pagination?.total}`);
  const hasDept = plRows.filter(p => p.employee?.department?.name !== undefined).length;
  check('punch-log includes employee.department', hasDept > 0 || plRows.length === 0, `${hasDept} rows with dept field`);

  if (plRows.length > 0) {
    const tin = await api(base, '/api/attendance/biometric/punch-log?punchType=check_in&limit=200', H);
    const tRows = tin.data.punches || [];
    check('punchType=check_in server filter', tRows.length > 0 && tRows.every(p => p.punchType === 'check_in'), `${tRows.length} check_in`);

    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const win = await api(base, `/api/attendance/biometric/punch-log?from=${from}&to=${to}&limit=200`, H);
    const wRows = win.data.punches || [];
    const fromMs = new Date(`${from}T00:00:00.000+05:30`).getTime();
    const toMs = new Date(`${to}T00:00:00.000Z`).getTime() + 86400000;
    const allInWindow = wRows.every(p => { const t = new Date(p.punchTime).getTime(); return t >= fromMs && t <= toMs; });
    check('from/to full-day window', wRows.length > 0 && allInWindow, `${wRows.length} punches ${from}→${to}`);

    // Use an employee that ACTUALLY HAS punches so the filters are exercised
    // for real (first-list employees may be management members with no
    // biometric punches, which made these checks pass vacuously).
    const punched = plRows.find(p => p.employee?.id);
    if (punched) {
      const punchedDeptId = punched.employee?.department?.id;
      const ef = await api(base, `/api/attendance/biometric/punch-log?employeeId=${punched.employee.id}&limit=200`, H);
      const eRows = ef.data.punches || [];
      check('employeeId filter (real puncher)', ef.status === 200 && eRows.length > 0 && eRows.every(p => p.employee?.id === punched.employee.id), `${eRows.length} punches for ${punched.employee.employeeId}`);
      if (punchedDeptId) {
        const df = await api(base, `/api/attendance/biometric/punch-log?departmentId=${punchedDeptId}&limit=200`, H);
        const dRows = df.data.punches || [];
        check('departmentId filter (real puncher)', df.status === 200 && dRows.length > 0 && dRows.every(p => p.employee?.department?.id === punchedDeptId), `${dRows.length} punches in ${punched.employee.department?.name}`);
      }
    }
  } else {
    console.log('  (no punches on this site — filter checks skipped)');
  }

  // ── 3. Task 82 regression: auto-present status ──
  const ap = await api(base, '/api/attendance/auto-present', H);
  check('auto-present status intact', ap.status === 200, `enabled=${ap.data?.enabled}`);

  // ── 4. self-view contract (page now resolves admin employee) ──
  const me = rows.find(e => e.email === creds.email);
  if (me) {
    const self = await api(base, `/api/attendance?employeeId=${me.id}&limit=100`, H);
    check('admin self-view has logs', (self.data.attendance || []).length > 0, `${(self.data.attendance || []).length} rows for ${me.employeeId}`);
  } else {
    console.log('  (login email has no employee row — self-view check n/a)');
  }
}

(async () => {
  await verifySite('LIVE', BASES.LIVE, CREDS.LIVE);
  await verifySite('DEMO', BASES.DEMO, CREDS.DEMO);
  console.log(`\n===== RESULT: ${pass} PASS, ${failCount} FAIL =====`);
  process.exit(failCount > 0 ? 1 : 0);
})().catch(e => { console.error('VERIFY ERROR', e); process.exit(1); });
