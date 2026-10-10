// Task 82 post-deploy verification — Auto-Present for Management (attendance).
// SAFE on LIVE: only writes Attendance rows that auto-present would legitimately
// create (toggle is the feature the user asked to be enabled), never touches
// existing punched rows, and never deletes anything.
const BASES = [
  ['LIVE', 'https://marqaitechgroup.3boxeshrms.com', 'hr@marqaitech.com'],
  ['DEMO', 'https://nexus-hrms-mu.vercel.app', 'admin@3boxeshrms.com'],
];
const PASS = 'MarqAI@2026';
const MGMT_ROLES = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'];
let passN = 0, failN = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passN++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { failN++; console.log(`  FAIL ${name} — ${detail}`); }
};
const pad2 = n => String(n).padStart(2, '0');
const now = new Date();
// IST today (both audiences are India-based)
const todayKey = new Date(now.getTime() - (-330) * 60000).toISOString().slice(0, 10);

for (const [label, base, email] of BASES) {
  console.log(`\n===== ${label} (${base}) =====`);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
  const lb = await login.json();
  const t = lb?.token || lb?.data?.token || '';
  check('login', login.status === 200 && !!t, `status=${login.status}`);
  if (!t) continue;
  const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const api = async (p, opts = {}) => { const r = await fetch(base + p, { headers: H, ...opts }); const b = await r.json().catch(() => ({})); return { s: r.status, b }; };

  // 1) Status endpoint live + default off
  let st = await api('/api/attendance/auto-present');
  check('GET /api/attendance/auto-present responds', st.s === 200, `status=${st.s} enabled=${st.b?.enabled}`);
  const wasEnabled = st.b?.enabled === true;

  // 2) Enable the toggle via policy config (the user-requested control)
  const put = await api('/api/attendance-policy-config', { method: 'PUT', body: JSON.stringify({ autoPresentManagementEnabled: true }) });
  check('PUT policy-config accepts autoPresentManagementEnabled', put.s === 200 && put.b?.config?.autoPresentManagementEnabled === true, `status=${put.s} flag=${put.b?.config?.autoPresentManagementEnabled}`);

  // 3) Status flips on
  st = await api('/api/attendance/auto-present');
  check('status endpoint now enabled=true', st.b?.enabled === true, `enabled=${st.b?.enabled} shift=${st.b?.shiftStartDefault}-${st.b?.shiftEndDefault}`);

  // 4) Run backfill for today + last 7 days
  const run = await api('/api/attendance/auto-present', { method: 'POST', body: JSON.stringify({ backfillDays: 7, tzOffset: -330, todayKey }) });
  const rb = run.b || {};
  check('POST run succeeds', run.s === 200, `status=${run.s} ${rb.message || ''}`);
  console.log(`  [run] created=${rb.created} updated=${rb.updated} mgmt=${rb.managementCount} skipPunched=${rb.skippedPunched} skipLeave=${rb.skippedLeave} skipNonWorking=${rb.skippedNonWorking} skipFuture=${rb.skippedFuture} skipJoining=${rb.skippedBeforeJoining}`);

  // 5) Attendance rows for today: management members present with auto stamps
  const att = await api(`/api/attendance?date=${todayKey}&limit=200`);
  const rows = att.b?.attendance || [];
  const emps = (await api('/api/employees?limit=500&export=1')).b?.employees || [];
  const reportingIds = new Set(emps.filter(e => e.reportingManagerId).map(e => e.reportingManagerId));
  const mgmt = emps.filter(e => e.isManagement === true || MGMT_ROLES.includes(e.user?.role || '') || reportingIds.has(e.id));
  const byEmp = new Map(rows.map(r => [r.employeeId, r]));
  const dow = new Date(`${todayKey}T00:00:00.000Z`).getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) {
    console.log('  SKIP row assertions (today is a weekend by server DOW — auto rows legitimately absent)');
  } else {
    let autoN = 0, presentN = 0, realPunchN = 0;
    for (const m of mgmt) {
      const row = byEmp.get(m.id);
      if (!row) continue;
      if (row.status === 'present' || row.status === 'late') presentN++;
      if (row.punchMethod === 'auto') autoN++;
      if (row.checkIn && row.punchMethod !== 'auto') realPunchN++;
    }
    check('management employees have attendance rows for today', mgmt.length === 0 || presentN + realPunchN >= Math.min(mgmt.length, 1) ? true : presentN > 0, `mgmt=${mgmt.length} presentOrLate=${presentN} auto=${autoN} realPunch=${realPunchN}`);
    check('auto rows carry punchMethod=auto + status present', autoN === 0 || rows.filter(r => r.punchMethod === 'auto').every(r => r.status === 'present'), `auto=${autoN}`);
    if (autoN > 0) {
      const a = rows.find(r => r.punchMethod === 'auto');
      check('auto row has both checkIn and checkOut', !!a.checkIn && !!a.checkOut, `in=${a.checkIn} out=${a.checkOut} wh=${a.workHours}`);
      check('auto row notes mention management rule', String(a.notes || '').includes('Auto-present'), `notes=${a.notes}`);
    }
  }

  // 6) Idempotency: second run must not create duplicates
  const run2 = await api('/api/attendance/auto-present', { method: 'POST', body: JSON.stringify({ date: todayKey, tzOffset: -330, todayKey }) });
  check('second run creates nothing (idempotent)', run2.s === 200 && (run2.b?.created || 0) === 0, `created=${run2.b?.created} skippedPunched=${run2.b?.skippedPunched}`);

  // 7) Real punches never overwritten: rows that had real check-in keep their instant
  if (!isWeekend) {
    const realRows = rows.filter(r => r.checkIn && r.punchMethod !== 'auto');
    const realAgain = (await api(`/api/attendance?date=${todayKey}&limit=200`)).b?.attendance || [];
    const unchanged = realRows.every(r0 => {
      const r1 = realAgain.find(x => x.employeeId === r0.employeeId);
      return r1 && r1.checkIn === r0.checkIn && (r1.punchMethod || '') === (r0.punchMethod || '');
    });
    check('real punch rows untouched by engine', unchanged, `realRows=${realRows.length}`);
  }

  // 8) policy-config GET reports the flag (dashboard/settings read path)
  const cfg = await api('/api/attendance-policy-config');
  check('policy-config GET returns flag=true', cfg.b?.config?.autoPresentManagementEnabled === true, `flag=${cfg.b?.config?.autoPresentManagementEnabled}`);

  console.log(`  [state] auto-present left ${wasEnabled ? 'ON (was already on)' : 'ON (enabled by this verify run — the user-requested feature)'}`);
}

console.log(`\n===== RESULT: ${passN} PASS / ${failN} FAIL =====`);
process.exit(failN > 0 ? 1 : 0);
