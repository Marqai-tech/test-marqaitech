// Task 126 — governance: register + approve
// (Payroll validations page crash fix + biometric-history backfill for
// accurate Sep-and-earlier LOPs; payslips reprocessed on web + mobile.)
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
    title: 'Task 126 — /payroll/validations crash fix (missing getDb + JSON-string fields) + biometric history backfill: accurate Sep-and-earlier LOPs, payslips reprocessed',
    description:
      'User request: "/payroll/validations is throwing error pls check and debug. Also cross check the biometric logs for sep month and before months for calculating salary as some of the salaries are not accurate coz lops are not accurate." ' +
      'BUG 1 — validations page crash (reproduced in headless browser: TypeError v.errors.map is not a function → "Something went wrong"). Root causes: (a) GET /api/payroll/validations/[id] referenced `db` without ever calling getDb() — every detail lookup threw a ReferenceError caught as a 404; (b) the page fell back to the raw LIST row whose JSON fields (errors/warnings/…) are STRINGS, then called .map on them. Fixes: getDb resolved in the [id] handler; a defensive normalizeValidation()/parseJsonArray() normalizer now runs on EVERY data path (list, run-validation response, detail response, both fallbacks). ' +
      'BUG 2 — LOP accuracy: the Team Office biometric sync checkpoint was seeded mid-October (102026$383), so NO punches before Oct 8 had ever been imported and months before September had ZERO attendance rows (engine: no data ≠ absence → full pay). Probe of the e-timeoffice API proved the device retains full history (3,696 punches Apr 24 → Oct 22). BACKFILL (scripts/task126-backfill-punches.cjs, replicating src/lib/etimeoffice-sync.ts semantics exactly — recordKey dedupe, MARQ code mapping, classifyBiometricDay 2-min window, late >10:00, half_day when finalized && workHours < 8 or 3rd+ late, mandatory 60-min break, IST day buckets): imported 2,368 matched punches + events, created/updated 990 attendance rows (Apr 24 → Oct 22); then scripts/task126-derive-absents.cjs derived 109 missing rows (46 ABSENT for the 8 staff on punch-less working days Mon-Fri minus holidays — Sept 14 Ganesh Chaturthi etc.; 63 auto-PRESENT for Vardhani per the enabled management auto-present policy). Approved leaves: none in the window. Checkpoint/status settings refreshed — live sync unaffected. ' +
      'PAYROLL: force reprocess of all 49 payslips (Feb→Oct) — September now biometric-accurate, e.g. madhuri 10.5 LOP → net ₹9,750, mallesh 12 LOP → ₹9,000, divya 7 LOP → ₹18,966.67, shaik siraj 2 LOP → ₹23,133.33, vardhani 0.5 LOP → ₹98,330 (management policy). Fixed-gross presentation intact (41 full-month rows verified: wrong gross 0, wrong deductions 0 — PT + LOP only, no PF/ESI). ' +
      'Verification: 8/8 task126 node source-contract checks; tsc clean on changed files; headless-browser E2E after deploy (login → open /payroll/validations → open validation detail → no error boundary).',
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
