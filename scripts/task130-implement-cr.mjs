// Task 130 + 131 — governance: implement both CRs with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const EVIDENCE =
  'LIVE E2E 23/23 PASS (scripts/task130-postdeploy-verify.cjs): app-version 1.6.1/28 + APK 200 on all 3 hosts; ' +
  'payslip list 50 rows all released (backfill verified); admin PDF download 24,910 B valid %PDF (Content-Disposition Payslip-October-2026-MARQ003.pdf, released MARQAI format with logo + rupee glyphs); ' +
  'release API revoke → 9 Sep-2026 rows stamped null → release → restored (gate + restore proven); ' +
  'employee (amrutha, employee role) mobile list = 5 rows ALL released and downloaded OWN released payslip PDF 24,650 B; ' +
  'CEO (mahesh@marqaitech.com, role ceo) sees ALL 11 employees, employee_report scope=all headcount=10, leave_report scope=all, payslip list 50 rows (Task 131 getDataScope fix + RolePermission grants live); ' +
  'rememberMe login path live for the biometric 30-day session; projects/tasks APIs 200. ' +
  'Contract checks: 51/51 (task130) + 24/24 (task131); flutter analyze 0 errors; APK v1.6.1 (28) versionCode 28 versionName 1.6.1 signed with permanent key 590a456e…3749c.';

for (const id of ['cmvkcljq3000008kzov5pfu5c', 'cmvkeoq2l000208jwax10rzkq']) {
  const res = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'implement', notes: EVIDENCE }),
  });
  console.log('implement', id, '→', res.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
