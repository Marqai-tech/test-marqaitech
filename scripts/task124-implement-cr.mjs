// Task 124 — mark the change request IMPLEMENTED with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvj77juo000107kzofl2i065';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const res = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'Deployed to LIVE via commit 44f1624b. LIVE E2E on marqaitechgroup tenant (hr@gmail.com): ' +
      'POST /api/payroll/marqai-setup 200 → PayrollSettings PF OFF / ESI OFF persisted (GET salary-settings pf.enabled=false, esi.enabled=false, mode=auto), vardhani re-solved gross ₹102,000 → ₹100,200 keeping on-hand EXACTLY ₹1,00,000 (PT ₹200 only, ₹0 TDS under 87A rebate), salary structures rebuilt WITHOUT EPF/ESI employee rows, superseded "Gross ₹1,02,000" structure auto-cleaned. ' +
      'POST /api/payroll/process {backfill, force} 200 → 49 payslips recomputed Feb→Oct 2026 (this + all past months since joining). Verification over GET /api/payroll/payslips: 49 rows, rows with PF≠0 or ESI≠0 = 0 — ZERO PF/ESI deductions on every MarqAI payslip. ' +
      'Full-month nets: ₹15,000 band net ₹15,000 (zero deductions), manoj ₹20,000 → ₹19,850 (PT ₹150), shiraj/divya ₹25,000 → ₹24,800 (PT ₹200), vardhani full month ₹1,00,000 exactly; joiner/LOP months correctly prorated by attendance (vardhani Jul DOJ 10/31d, Oct 28.5/31d). ' +
      'Web: Payroll Settings → new Statutory Deductions card (PF/ESI company toggles) + "Reprocess existing payslips (apply current settings)" force switch; payslip detail hides zero-value rows. Mobile: NO app change needed — payslip sheet already filters zero-value rows and fetches payslips from the API, so reprocessed payslips appear immediately; version unchanged at 1.5.6 (23), APK 200 on all three hosts (tenant/apex/demo), app-version 1.5.6/23 on all three hosts, /payroll/payslips 200. ' +
      '23/23 node source-contract checks pass (scripts/task124-contract-check.mjs); solver math validated (scripts/task124-math-check.mjs); tsc clean on changed files. Flutter suite not re-run this task: sandbox reset wiped the Flutter SDK and no mobile code changed (next APK build will run it).',
  }),
});
console.log('implement:', res.status, await res.text().then(t => t.slice(0, 120)));
