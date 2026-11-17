// Task 123 — force reprocess all payslips with the fixed proration engine,
// then print the corrected per-employee results.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const emps = await (await fetch(`${TENANT}/api/employees?limit=5`, { headers: H })).json();
const companyId = (emps.employees || emps.data || [])[0]?.companyId;
const SQ = `companyId=${companyId}&`;
console.log('companyId:', companyId);

const now = new Date();
const res = await fetch(`${TENANT}/api/payroll/process?${SQ}`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), backfill: true, force: true }),
});
const body = await res.json();
console.log('force reprocess:', res.status, body?.message || body?.error);
if (res.status !== 200) { console.error(body); process.exit(1); }

const byEmp = {};
for (const d of body.data.details) {
  if (d.status === 'created') byEmp[d.employeeName] = `${byEmp[d.employeeName] || ''}${d.month}/${String(d.year).slice(2)}:net${d.net} `;
}
for (const [name, s] of Object.entries(byEmp)) console.log('  ', name, '→', s.trim());

// vardhani check: July joiner month prorated, Aug/Sep/Oct full gross 102000
const ps = await (await fetch(`${TENANT}/api/payroll/payslips?${SQ}limit=100`, { headers: H })).json();
const rows = ps.data || [];
console.log('payslips visible (processed/paid):', rows.length);
const v = rows.filter((r) => /vardhani/i.test(r.employee?.firstName || '')).sort((a, b) => a.month - b.month);
for (const r of v) {
  console.log(`   vardhani ${r.month}/${r.year}: gross ${r.grossSalary} net ${r.netSalary} days ${r.paidDays}/${r.totalDays} lop ${r.lopDays}`);
}
