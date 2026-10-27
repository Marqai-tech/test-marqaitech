// Task 132 — mark CR implemented (after deploy + live E2E).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvkidjbc000208l6ru7jixkq';
const DEPLOY_COMMIT = 'ed8347f3';

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
    deployCommit: DEPLOY_COMMIT,
    implementationNotes:
      'DEPLOYED (commit ' + DEPLOY_COMMIT + ') + LIVE E2E 17/17 PASS (scripts/task132-postdeploy-verify.mjs). ' +
      'Code: apex login route sweeps ACTIVE tenant DBs when the platform DB has no row — for a verified password it answers 403+suggestedUrl (Rule-0 shape); demo tenant excluded. ' +
      'Data: scripts/task132-mirror-sync.cjs created the missing platform mirror row for mahesh@marqaitech.com (ceo, id cmvjrt0ja000008i6vmvw0hbn, tenant marqaitechgroup) — the only one of 17 tenant users without a mirror. ' +
      'E2E: full mobile ladder demo→apex→tenant now authenticates mahesh (30-day rememberMe token, role ceo, /api/auth/me OK, CEO directory scope=all count=11); regressions: wrong password → 401 (no tenant leak), unknown email → 401, hr/superadmin/demo/tenant paths unchanged.',
  }),
});
console.log('implement:', r.status, await r.text().then(t => t.slice(0, 200)));

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((x) => x.status === 'pending').length} pending` : ld);
