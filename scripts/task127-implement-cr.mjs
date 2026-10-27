// Task 127 — implement the approved CR after live E2E verification
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvjhpqc7000107jy8afkjeyp';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'DEPLOYED + VERIFIED (scripts/task127-postdeploy-verify.mjs ALL PASS): app-version 1.5.8(25) on all 3 hosts (marqaitechgroup.3boxeshrms.com / 3boxeshrms.com / nexus-hrms-demo.vercel.app); APK v1.5.8 downloadable (22,017,906 B, aapt2 versionCode 25/versionName 1.5.8, permanent key 590a456e…3749c). E2E: phone-number login 7671813161 +91 → 200 token (Employee.phone match); /payroll/validations page 200 + detail API returns array errors (Task 126 fix intact); attendance Oct 20 = 9 holiday, Oct 21 = 9 holiday (NO punches on the Dussehra holiday), Oct 22 = 5 present + 1 late + 1 half_day (single copies); pre-push reprocess verified September payslips: fixed gross 15000/20000/25000/100200, PT+LOP-only deductions, LOPs match deduped attendance (madhuri 9.5d, mallesh 11d, divya 6d, siraj 2.5d, manoj 0d, bharath 0d, amrutha 1d, syed 2d, vardhani 0.5d). Mobile: payroll Month/Employee/Status filters, full payslip component rows, tappable country-code selector + phone login, chat group members sheet.',
  }),
});
console.log('implement:', r.status, (await r.json().catch(() => ({}))).message || '');

const list = await (await fetch(BASE + '/api/super-admin/change-requests', { headers: H })).json();
const reqs = list.requests || list.data || [];
const cr = reqs.find((x) => x.id === CR_ID);
console.log('CR status now:', cr?.status);
console.log('trail:', `${reqs.length} requests, ${reqs.filter((x) => x.status === 'pending').length} pending`);
