// Task 120 — mark CR implemented with the real LIVE deploy commit.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvi2x1sz000008jttthqxrmh';

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
      'Commit d634e81f pushed to origin main (LIVE git auto-deploy). Verified: /api/public/app-version returns 1.5.3/20 on all three hosts (marqaitechgroup.3boxeshrms.com, 3boxeshrms.com apex, nexus-hrms-demo.vercel.app); APK v1.5.3+20 = HTTP 200 (22,032,971 bytes) on tenant + apex hosts; aapt2 confirms versionCode 20 / versionName 1.5.3; apksigner cert = permanent release key 590a456e…3749c.',
  }),
});
console.log('implement:', im.status);

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
