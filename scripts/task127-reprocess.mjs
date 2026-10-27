// Task 127 — production reprocess on the MarqAI tenant after the attendance
// date-normalization + dedupe fix:
//   1. POST process {month: 9 (Sep = last COMPLETE month), backfill, force}
//      → recompute Apr..Sep payslips from the deduped attendance rows WITHOUT
//      creating premature October payslips (Oct finalizes on Nov 1 cron).
//   2. Verify: full-month gross EXACTLY 15000/20000/25000/100200, deductions
//      ONLY PT + LOP, net = gross − totalDeductions, and September LOP days
//      match the deduped attendance derivation.
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

// ── 1. force reprocess Apr..Sep (target = September, the last complete month)
const run = await fetch(`${TENANT}/api/payroll/process?${SQ}`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ month: 9, year: 2026, backfill: true, force: true }),
});
const rd = await run.json();
console.log('force reprocess:', run.status, rd?.message || rd?.error);
if (run.status !== 200) { console.error(rd); process.exit(1); }
console.log('months covered:', (rd.data?.monthsCovered || []).join(', '));

// ── 2. verification ──
const ps = await (await fetch(`${TENANT}/api/payroll/payslips?${SQ}limit=200`, { headers: H })).json();
const rows = ps.data || [];
let badGross = 0, badDed = 0, checked = 0;
for (const r of rows) {
  const total = Number(r.totalDays) || 0;
  const pf = Number(r.pf), esi = Number(r.esi), tax = Number(r.tax);
  const pt = Number(r.professionalTax), lopD = Number(r.lopDeduction ?? 0);
  const dim = new Date(Date.UTC(r.year, r.month, 0)).getUTCDate();
  if (Math.abs(total - dim) > 0.01) continue; // skip DOJ-month prorations
  checked += 1;
  const gross = Number(r.grossSalary);
  const band = [15000, 20000, 25000, 100200].find((b) => Math.abs(gross - b) < 0.01);
  if (!band) { badGross += 1; if (badGross <= 8) console.error('  BAD GROSS:', r.employee?.firstName, r.month, r.year, gross); }
  if (pf !== 0 || esi !== 0 || tax !== 0) { badDed += 1; if (badDed <= 8) console.error('  BAD DEDUCTION:', r.employee?.firstName, r.month, r.year, 'pf', pf, 'esi', esi, 'tax', tax); }
  if (Math.abs(Number(r.totalDeductions) - (pt + lopD)) > 0.01) { badDed += 1; console.error('  TOTAL MISMATCH:', r.employee?.firstName, r.month, r.year); }
  if (Math.abs(Number(r.netSalary) - (gross - Number(r.totalDeductions))) > 0.01) { badDed += 1; console.error('  NET MISMATCH:', r.employee?.firstName, r.month, r.year); }
}
console.log(`\nfull-month payslips checked: ${checked} | wrong gross: ${badGross} | wrong deductions: ${badDed}`);

// September per-employee LOP summary (must match the deduped attendance audit:
// vardhani 0.5 · divya 6 · mallesh 11 · madhuri 9.5 · manoj 0 · siraj 2.5 ·
// amrutha 1 · bharath 0 · syed 2 · sonali 0.5)
const EXPECT_LOP = {
  'Vardhani Reddy': 0.5, 'Divya Rani M': 6, 'Mallesh  Rao N': 11, 'Madhuri N': 9.5,
  'Manoj  Thummala': 0, 'Shaik Siraj': 2.5, 'Amrutha S': 1, 'Bharath  V M': 0,
  'Syed Shazeb     Ahamed': 2,
};
let lopBad = 0;
const byEmp = {};
for (const r of rows) {
  if (r.year === 2026 && r.month === 9) {
    const name = `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim();
    byEmp[name] = `gross ${r.grossSalary} | PT ${r.professionalTax} | LOP ${r.lopDeduction ?? 0} (${r.lopDays}d) | net ${r.netSalary}`;
    const want = EXPECT_LOP[name];
    if (want !== undefined && Math.abs(Number(r.lopDays) - want) > 0.01) {
      lopBad += 1;
      console.error(`  LOP MISMATCH: ${name} got ${r.lopDays}, expected ${want}`);
    }
  }
}
console.log(`\nSeptember 2026 — FIXED GROSS + deduped LOP (mismatches: ${lopBad}):`);
for (const [name, s] of Object.entries(byEmp).sort()) console.log('  ', name.padEnd(24), s);

const ok = badGross === 0 && badDed === 0 && checked > 0 && lopBad === 0;
console.log(ok ? '\nTASK 127 REPROCESS: PASS' : '\nTASK 127 REPROCESS: FAIL');
process.exit(ok ? 0 : 1);
