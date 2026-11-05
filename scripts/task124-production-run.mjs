// Task 124 — production run on the MarqAI tenant:
//   1. POST marqai-setup        → PF/ESI OFF in PayrollSettings, vardhani
//                                  re-solved to gross ₹100,200, structures
//                                  rebuilt without EPF/ESI rows, stale cleanup
//   2. GET  salary-settings     → verify pf.enabled=false, esi.enabled=false
//   3. POST process (force)     → recompute ALL payslips (this + past months)
//   4. GET  payslips            → verify every row pf=0, esi=0 + nets
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.error('login failed', login.status); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

const emps = await (await fetch(`${TENANT}/api/employees?limit=5`, { headers: H })).json();
const companyId = (emps.employees || emps.data || [])[0]?.companyId;
const SQ = `companyId=${companyId}&`;
console.log('companyId:', companyId);

// ── 1. marqai-setup (PF/ESI OFF defaults) ──
const setup = await fetch(`${TENANT}/api/payroll/marqai-setup?${SQ}`, {
  method: 'POST', headers: H, body: JSON.stringify({}),
});
const sd = await setup.json();
console.log('\nmarqai-setup:', setup.status, sd?.error || '');
if (sd?.data?.log) for (const l of sd.data.log) console.log('  •', l);
if (sd?.data?.results) for (const r of sd.data.results) console.log('   ', r.label.padEnd(10), `${r.employee}`.padEnd(22), `gross ${r.gross}`, `net ${r.net}`, '|', r.action);
if (setup.status !== 200) process.exit(1);

// ── 2. settings verification ──
const st = await (await fetch(`${TENANT}/api/payroll/salary-settings?${SQ}`, { headers: H })).json();
console.log('\nsettings: pf.enabled =', st.data?.pf?.enabled, '| esi.enabled =', st.data?.esi?.enabled,
  '| mode =', st.data?.processing?.mode);
if (st.data?.pf?.enabled !== false || st.data?.esi?.enabled !== false) {
  console.error('FAIL: PF/ESI not disabled in settings'); process.exit(1);
}

// ── 3. force reprocess ALL months ──
const now = new Date();
const run = await fetch(`${TENANT}/api/payroll/process?${SQ}`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), backfill: true, force: true }),
});
const rd = await run.json();
console.log('\nforce reprocess:', run.status, rd?.message || rd?.error);
if (run.status !== 200) { console.error(rd); process.exit(1); }
console.log('months covered:', rd.data.monthsCovered.join(', '));

// ── 4. payslip verification ──
const ps = await (await fetch(`${TENANT}/api/payroll/payslips?${SQ}limit=200`, { headers: H })).json();
const rows = ps.data || [];
const bad = rows.filter((r) => Number(r.pf) !== 0 || Number(r.esi) !== 0);
console.log(`\npayslips: ${rows.length} rows | rows with PF/ESI ≠ 0: ${bad.length}`);
if (bad.length > 0) { for (const b of bad.slice(0, 10)) console.error('  STILL DEDUCTED:', b.employee?.firstName, b.month, b.year, 'pf', b.pf, 'esi', b.esi); }

// per-employee summary of latest full month (September 2026)
const byEmp = {};
for (const r of rows) {
  const name = `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim();
  if (r.year === now.getUTCFullYear() && r.month === now.getUTCMonth()) { // last full month
    byEmp[name] = `gross ${r.grossSalary} deductions ${r.totalDeductions} net ${r.netSalary}`;
  }
}
console.log(`\nlast full month (${now.getUTCMonth()}/${now.getUTCFullYear()}):`);
for (const [name, s] of Object.entries(byEmp).sort()) console.log('  ', name.padEnd(24), s);

const v = rows.filter((r) => /vardhani/i.test(r.employee?.firstName || '')).sort((a, b) => a.month - b.month);
console.log('\nvardhani all months:');
for (const r of v) console.log(`   ${r.month}/${r.year}: gross ${r.grossSalary} pf ${r.pf} esi ${r.esi} pt ${r.professionalTax} net ${r.netSalary} (${r.paidDays}/${r.totalDays}d)`);

console.log(bad.length === 0 ? '\nTASK 124 PRODUCTION RUN: PASS' : '\nTASK 124 PRODUCTION RUN: FAIL');
process.exit(bad.length === 0 ? 0 : 1);
