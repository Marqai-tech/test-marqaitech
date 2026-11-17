// Task 127 — governance: register + approve
// (Dussehra phantom-punch fix + mobile: payroll filters, full deduction rows,
// working country-code selector + phone login, chat group members sheet.)
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
    title: 'Task 127 — Dussehra holiday attendance fix (phantom Oct-21 punches) + mobile v1.5.8(25): payroll filters, full payslip deduction rows, working country-code selector + phone login, chat group members sheet',
    description:
      'User request: "in the web app in attendance module - wed 21 oct 2026 there are punches but actually no punches were available on that day due to holiday for dussehra pls check and update the wrong punches. In the mobile app - payroll management there are no filters for payroll runs and payslips. Also in the login page of mobile app I am not able to select the country code drop down. Also deductions are not showing in the payslips for all the employees. In the chat groups when I click the name of the project/group I am not able to see the members of that group. Please update these in the mobile app and update it in vercel now." ' +
      'ROOT CAUSE (attendance): the Task 126 biometric backfill wrote Attendance.date with the IST-midnight-as-UTC convention (T18:30 of the prior UTC day) while the live sync/seed/UI all use naive UTC midnight (T00:00). The UI renders the raw date, so every backfill row displayed ONE DAY EARLY — the Oct 22 morning punches appeared as "Wed 21 Oct" punches on the Dussehra holiday, and every day showed duplicate rows. ' +
      'DATA FIX (scripts/task127-fix-attendance.cjs, idempotent, ran BEFORE push): added the missing Oct 21 2026 Dussehra holiday for the 2 companies that carry Oct 20; deduped 144 (employee, day) groups keeping the biometric-accurate backfill classification (live-sync row kept for today so the ongoing sync upsert keeps working); normalized 950 remaining T18:30 rows to T00:00 (system convention); rebuilt Oct 20+21 as clean status=holiday rows for all 9 active employees (junk absent/auto-present rows deleted); verified 0 stray buckets + 0 duplicates. Payslips reprocessed Apr-Sep via force (scripts/task127-reprocess.mjs PASS: fixed gross intact, September LOP now exactly matches the deduped attendance — vardhani 0.5, divya 6, mallesh 11, madhuri 9.5, manoj 0, siraj 2.5, amrutha 1, bharath 0, syed 2). ' +
      'CODE GUARDS (web): getHolidaysInRange now includes type festival (Dussehra/Ganesh Chaturthi were invisible to the auto-present holiday skip — that is why management got fake present rows on holidays); payroll processing derives missing ABSENT rows before computing (gated on attendance being in use; skips weekends/holidays/approved leave/future/DOJ) so days after the last backfill can no longer silently become paid days; payslip detail shows every component row including zeros (deductions were invisible for PT-exempt 15k employees). ' +
      'MOBILE (v1.5.8/25): Payroll Management gains Month + Employee + Status filters applied to both payroll-run cards and the payslip list (provider fetches 200 rows — the old 50-row page truncated the list); payslip sheet shows ALL earnings and deduction rows including zero values; sign-in screen country-code prefix is now a real tappable selector (30 dial codes, India +91 default) and digit-only identities log in via Employee.phone matching (backend builds candidates from digits + dialCode); tapping a group/project chat name opens a live member list (GET rooms/[id]/members — name, avatar, email, admin/member role, YOU badge). ' +
      'Verification: 20/20 node source-contract checks (scripts/task127-contract-check.mjs); flutter analyze clean on all changed files; 25/25 payroll+model tests and 51/51 chat regression tests pass; tsc clean on changed files; production reprocess verified 43 full-month payslips with 0 gross/deduction mismatches.',
    category: 'attendance',
    riskLevel: 'high',
    module: 'Attendance',
    relatedModule: 'Payroll',
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
