// Task 129 — mark the approved CR implemented with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = process.argv[2] || 'cmvjt9e4f000007iijciaqr82';

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
    note:
      'IMPLEMENTED + LIVE-VERIFIED (scripts/task129-postdeploy-verify.cjs — 25/25 PASS): ' +
      'app-version 1.6.0(27) + APK 200 on tenant/apex/demo; task created with description+plannedStart+plannedEnd+estimatedHours=6 persisted end-to-end; ' +
      'tasks payload carries _count.attachments; attachment upload(201)→list(?taskId=)→download(bytes)→delete OK on the live tenant; ' +
      'PATCH description+hrs OK; admin reports employee/leave/attendance 200 + project-reports summaryStats 200 (tenant-user fallback fix shipped); ' +
      'RBAC lists the CEO role; /payroll/validations 200 (Task 126 guard intact). ' +
      'DB: ProjectAttachment on 3/3 DBs; CEO Role row on 3/3 (315 grants copied on platform); management-without-role heal promoted amrutha (demo); ' +
      'live-tenant management users already held admin roles (hr@=tenant_admin, mahesh@=hr_admin). ' +
      'APK v1.6.0(27) 22,148,394 B, aapt2 versionCode 27 / versionName 1.6.0, permanent key SHA-256 590a456e…3749c — over-installable. ' +
      'Commits abe93b89 (feature) + eb0408d9 (project-reports tenant fallback). Contract checks 78/78; tsc 1875 errors vs 1879 baseline (zero new); dart analyze lib 0 errors.',
  }),
});
console.log('implement:', r.status);
const j = await r.json().catch(() => ({}));
console.log(JSON.stringify(j).slice(0, 300));

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((x) => x.status === 'pending').length} pending` : ld);
