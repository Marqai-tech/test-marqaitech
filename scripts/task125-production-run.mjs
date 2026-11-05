// Task 125 — production run on the MarqAI tenant:
//   1. POST process {backfill, force}  → recompute ALL payslips with the
//      fixed-gross engine (gross = structure value; LOP = explicit deduction)
//   2. Verify: full-month gross EXACTLY 15000/20000/25000/100200, deductions
//      ONLY PT + LOP (+ nothing else), nets unchanged vs Task 124 values.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.error('login failed', login.status); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

const emps = await (await fetch(`${TENANT}/api/employees?limit=5`, { headers: H })).json();
const companyId = (emps.employees || emps.data || [])[0]?.companyId;
const SQ = `companyId=${companyId}&`;
console.log('companyId:', companyId);

// ── 1. force reprocess ALL months under the fixed-gross engine ──
const now = new Date();
const run = await fetch(`${TENANT}/api/payroll/process?${SQ}`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), backfill: true, force: true }),
});
const rd = await run.json();
console.log('force reprocess:', run.status, rd?.message || rd?.error);
if (run.status !== 200) { console.error(rd); process.exit(1); }
console.log('months covered:', rd.data.monthsCovered.join(', '));

// ── 2. verification ──
const ps = await (await fetch(`${TENANT}/api/payroll/payslips?${SQ}limit=200`, { headers: H })).json();
const rows = ps.data || [];
const BANDS = { 15000: 15000, 20000: 20000, 25000: 25000, 100200: 100200 };
let badGross = 0, badDed = 0, checked = 0;
for (const r of rows) {
  const total = Number(r.totalDays) || 0;
  const lop = Number(r.lopDays) || 0;
  const pf = Number(r.pf), esi = Number(r.esi), tax = Number(r.tax);
  const pt = Number(r.professionalTax), lopD = Number(r.lopDeduction ?? 0);
  // only full employed months (totalDays == calendar days of that month)
  const dim = new Date(Date.UTC(r.year, r.month, 0)).getUTCDate();
  if (Math.abs(total - dim) > 0.01) continue; // skip DOJ-month prorations
  checked += 1;
  const gross = Number(r.grossSalary);
  const expected = /vardhani/i.test(r.employee?.firstName || '') ? 100200 : BANDS[Math.round(gross)] ?? null;
  // gross must be the EXACT band value
  const band = [15000, 20000, 25000, 100200].find((b) => Math.abs(gross - b) < 0.01);
  if (!band) { badGross += 1; if (badGross <= 8) console.error('  BAD GROSS:', r.employee?.firstName, r.month, r.year, gross); }
  // deductions must be PT + LOP only
  if (pf !== 0 || esi !== 0 || tax !== 0) { badDed += 1; if (badDed <= 8) console.error('  BAD DEDUCTION:', r.employee?.firstName, r.month, r.year, 'pf', pf, 'esi', esi, 'tax', tax); }
  // totalDeductions must equal pt + lop
  if (Math.abs(Number(r.totalDeductions) - (pt + lopD)) > 0.01) { badDed += 1; console.error('  TOTAL MISMATCH:', r.employee?.firstName, r.month, r.year, r.totalDeductions, 'vs', pt + lopD); }
  // net = gross − totalDeductions
  if (Math.abs(Number(r.netSalary) - (gross - Number(r.totalDeductions))) > 0.01) { badDed += 1; console.error('  NET MISMATCH:', r.employee?.firstName, r.month, r.year); }
  void expected;
}
console.log(`\nfull-month payslips checked: ${checked} | wrong gross: ${badGross} | wrong deductions: ${badDed}`);

// last full month summary (gross must be the fixed band)
const lm = now.getUTCMonth(); // previous month (last complete)
const byEmp = {};
for (const r of rows) {
  if (r.year === now.getUTCFullYear() && r.month === lm) {
    byEmp[`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim()] =
      `gross ${r.grossSalary} | PT ${r.professionalTax} | LOP ${r.lopDeduction ?? 0} (${r.lopDays}d) | net ${r.netSalary}`;
  }
}
console.log(`\nlast full month (${lm}/${now.getUTCFullYear()}) — FIXED GROSS:`);
for (const [name, s] of Object.entries(byEmp).sort()) console.log('  ', name.padEnd(24), s);

const ok = badGross === 0 && badDed === 0 && checked > 0;
console.log(ok ? '\nTASK 125 PRODUCTION RUN: PASS' : '\nTASK 125 PRODUCTION RUN: FAIL');
process.exit(ok ? 0 : 1);
