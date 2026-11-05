// Task 124 — governance: register + approve
// (PF & ESI exemption for MarqAI Tech Group — payslips reprocessed without
// PF/ESI deductions; vardhani re-solved to keep on-hand at exactly ₹1,00,000).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 124 — PF & ESI exemption for MarqAI Tech Group: statutory toggles honored in payslips, vardhani re-solved (on-hand ₹1L), web PF/ESI settings + reprocess control',
    description:
      'User request: "in the payslips of all the employees pf and esi are deducted but it should not be deducted for marq ai employees — update the same and generate the payslips in the app and web and update it in vercel now." ' +
      'Implementation — SETUP (src/app/api/payroll/marqai-setup/route.ts): company PayrollSettings now defaults pfEnabled=false / esiEnabled=false (body overridable), settings re-read after upsert so the on-hand solver runs under the effective statutory config (vardhani re-solved gross ₹102,000 → ₹100,200 keeping on-hand EXACTLY ₹1,00,000 with PT ₹200 as the only deduction; ₹0 TDS under 87A rebate), salary structures no longer embed EPF/ESI employee rows when disabled, superseded MarqAI structures with no attached employee are cleaned up, preview net now respects the toggles. ENGINE (src/lib/payroll-engine.ts) already gated EPF (12% ≤ ₹15,000 ceiling) and ESI (0.75% ≤ ₹21,000) behind the company toggles — no engine change needed. WEB: Payroll Settings gains a Statutory Deductions card (PF/ESI company-level toggles persisted via PUT /api/payroll/salary-settings) and a "Reprocess existing payslips (apply current settings)" switch that forwards force=true to POST /api/payroll/process; payslip detail page now hides zero-value earning/deduction rows (matches mobile behaviour — no "PF ₹0.00" clutter). MOBILE: no app change required — the payslip sheet already filters zero-value rows and fetches payslips from the API, so reprocessed data appears immediately; version stays 1.5.6 (23), no APK rebuild. ' +
      'Verification: 23/23 node source-contract checks pass (scripts/task124-contract-check.mjs; flutter suite not runnable — sandbox reset wiped the Flutter SDK, no mobile code changed so the APK is unaffected); solver math validated (scripts/task124-math-check.mjs): 15k band net ₹15,000 (zero deductions), 20k net ₹19,850 (PT ₹150), 25k net ₹24,800 (PT ₹200), vardhani net ₹1,00,000; tsc clean on all changed files.',
    category: 'payroll',
    riskLevel: 'high',
    module: 'Payroll',
    relatedModule: 'Attendance',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
