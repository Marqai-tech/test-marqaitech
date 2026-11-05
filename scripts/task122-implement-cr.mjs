// Task 122 — mark CR implemented with the real LIVE deploy commits.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmviwe8mk000008k11nujmuys';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const im = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'Commits 113d85ce + b3492c0f (hotfix: platformDb declarations + schema re-applied to the LIVE ep-icy-star platform/tenant DBs pulled from Vercel env) pushed to origin main (LIVE git auto-deploy). Verified: /api/public/app-version returns 1.5.5/22 on all three hosts (marqaitechgroup.3boxeshrms.com, 3boxeshrms.com apex, nexus-hrms-demo.vercel.app); APK v1.5.5+22 = HTTP 200 (22,165,435 bytes) on tenant host; aapt2 confirms versionCode 22 / versionName 1.5.5; apksigner cert = permanent release key 590a456e…3749c. Live E2E on the marqaitechgroup tenant: governance defaults correct (customManagers off, directDelete on, admin permissions all true); admin group create 201 → rename 200 → delete-for-everyone 200 (scope everyone) → room gone from member list → Super Admin chat-archive surfaces the deactivated room with the deletedAt stamp; direct-chat self-delete round-trip green (scope self, resurfaces on new messages server-side). 82/82 flutter tests; flutter analyze 0 errors.',
  }),
});
console.log('implement:', im.status);

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
