// Task 125 — governance: register + approve
// (Fixed-gross payslips: LOP presented as an explicit deduction line;
// vardhani on-hand unchanged; web + mobile + Vercel.)
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
    title: 'Task 125 — Fixed-gross payslips for MarqAI Tech Group: gross stays at structure value (15k/20k/25k/1,00,200), Loss of Pay shown as an explicit deduction line alongside PT only',
    description:
      'User request: "still gross salaries for the following employees is varying mallesh, madhuri, syed, bharath - 15k and only pt should be deducted and any lops that\'s all. same way for siraj - 25k, manoj - 20k, divya - 25k — recheck and update these in the mobile app, web app and vercel for marqai employees payroll now." ' +
      'Implementation — ENGINE (src/lib/payroll-engine.ts): earnings are now prorated ONLY by the employment window (DOJ mid-month → employedDays/daysInMonth); for every full month the payslip GROSS stays exactly at the structure gross (₹15,000/₹20,000/₹25,000/₹1,00,200). Loss of Pay is no longer subtracted from the earnings — it is computed as an explicit deduction line lopDeduction = structureGross × lopDays ÷ daysInMonth and added to totalDeductions. Net pay is mathematically IDENTICAL to the previous proration (G×(E−lop)/D ≡ G×E/D − G×lop/D — parity proven in scripts/task125-math-check.mjs across 6 scenarios incl. DOJ months and vardhani LOP). Deductions on MarqAI payslips are therefore exactly PT (+ any LOP days) and nothing else: 15k band PT nil, manoj PT ₹150, shiraj/divya/vardhani PT ₹200. ' +
      'SCHEMA: additive Payroll.lopDeduction DOUBLE PRECISION DEFAULT 0 applied to platform + demo + marqaitechgroup DBs (3/3 verified) BEFORE push via scripts/task125-schema.cjs. ' +
      'API: payslip detail JSON exposes deductions.lop; list endpoint passes the column through. CRON (payroll-auto-process): now runs with force so the target (previous, now complete) month gets its LOP finalized on the 1st and any settings/statutory changes propagate. ' +
      'WEB: payslip detail gains the "Loss of Pay" deduction row (hidden when 0, like PF/ESI/TDS). MOBILE (v1.5.7/24): PayrollModel parses lopDeduction shape-agnostically; payslip sheet gains the Loss of Pay row; APK rebuilt with permanent key and shipped to public/downloads. ' +
      'Verification: 13/13 node source-contract checks (scripts/task125-contract-check.mjs) + task 124 contracts still green; tsc clean on changed files (one pre-existing unrelated error in payslips/route.ts JWTPayload cast confirmed on stashed baseline); schema 3/3 DBs.',
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
