// Task 166 — PATCH the CR with deployCommit + E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvrnyurb000108jrto9pmh05';
const DEPLOY_COMMIT = '0d130e05';

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
    deployCommit: DEPLOY_COMMIT,
    implementationNotes:
      'Deployed commit 0d130e05 (push 45f7a1d6..0d130e05, Vercel auto-deploy) verified on all three domains — ' +
      'marqaitechgroup.3boxeshrms.com HTTP 200, nexus-hrms-demo.vercel.app HTTP 200, 3boxeshrms.com HTTP 200. ' +
      'Live-bundle proof: /_next/static/chunks/1sf93u526ok0k.js carries the "Present / Absent only (timing not mandatory)" checkbox marker. ' +
      'Production data proven: MARQ004 presentAbsentOnly=true; 17 late/half_day attendance rows flipped to present with the Task 166 note; zero late/half_day rows remain for her; ' +
      'Task 164 flags intact (MARQ007 biometric 2 + auto-present, MARQ008 biometric 007). ' +
      'Post-deploy verify: 9 checks + bundle scan PASS (scripts/task166-postdeploy-verify.mts + task166-bundle-scan.mts).',
  }),
});
console.log('implement:', res.status);
const d = await res.json().catch(() => ({}));
console.log(JSON.stringify(d).slice(0, 300));
