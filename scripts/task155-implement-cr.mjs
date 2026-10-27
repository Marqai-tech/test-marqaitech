// Task 155 — mark CR implemented with the real LIVE deploy commit.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvong1nu000208jttn2c53ov';

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
      'Commit b534320b pushed to origin main (LIVE git auto-deploy, both Vercel projects success). Verified on LIVE (scripts/task155-postdeploy-verify.mjs): 17/17 PASS — /employees/dashboard HTTP 200 on tenant (marqaitechgroup.3boxeshrms.com) + apex; route bundles on BOTH hosts no longer contain the string "Module Dashboard" and DO contain the new PageBreadcrumbs breadcrumb trail ["Employee","Dashboard"], the shared SmartHR gradient signature from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6], and the restyled panels (Quick Actions + Department Distribution); auth untouched (apex superadmin login 200, tenant hr@marqaitech.com login 200, /api/employees dashboard data source 200); app-version unchanged 1.8.0 (36) — web-only UI change, no APK rebuild. tsc 1850 == 1850 git-stash baseline (0 new errors).',
  }),
});
console.log('implement:', im.status);

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
