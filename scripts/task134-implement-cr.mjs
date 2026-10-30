// Task 134 — mark the CR implemented with the deployed commit after live E2E.
const CR_ID = process.env.CR_ID || 'cmvlvcbv8000107jv2zh61x12';
const COMMIT = process.env.DEPLOY_COMMIT || 'SET_ME';
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const res = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: COMMIT,
    implementationNotes:
      'Deployed to Vercel (both hosts) via git push → auto-deploy. Post-deploy E2E: scripts/task134-postdeploy-verify.mjs — change+restore cycles for hr@gmail.com (by-EMAIL mirror path) and amrutha@marqaitech.com (by-ID mirror path), validation probes (401 unauthenticated, 400 wrong-current/short/same), old-password rejection + new-password acceptance on BOTH tenant host and apex (mirror rotation proven), mobile ladder regression demo→apex→tenant with the restored password, superadmin apex login unchanged.',
  }),
});
console.log('implement:', res.status, await res.text().then((t) => t.slice(0, 200)));
