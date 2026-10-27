// Task 139 — mark the CR implemented with the deployed commit after live E2E.
const CR_ID = process.env.CR_ID || 'cmvmcd94j000008js28zhpijm';
const COMMIT = process.env.DEPLOY_COMMIT || 'd814adf6';
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
      'Deployed to Vercel (both projects: 3-boxes-hrms + nexus-hrms-demo) via git push → auto-deploy, GitHub commit statuses success. Schema (Employee.avatarPending/avatarPendingAt) applied to platform + demo + marqaitechgroup pre-push (scripts/task139-schema.cjs, 3/3 VERIFIED). LIVE E2E scripts/task139-postdeploy-verify.cjs 25/25 PASS: app-version serves APK v1.6.5 (32); profile GET parity (originalBirthday + experiences/skills/achievements/dependents/interests keys — fixes the silent Original-Birthday wipe on every My Profile save); org-stats API returns tenant-wide totals (63/60 demo, 13 marqai) IDENTICAL for employee and admin logins; full photo-approval cycle verified (employee submit → avatarPending stored + public avatar unchanged + HR queue lists it → approve publishes → reject keeps public photo + clears pending → employee gets 403 on self-approve → cleanup restored); update-request for another employee 403s; feed post with attachment round-trips (persisted + returned as parsed array); demo sample birthdays seeded (4 celebrants TODAY incl. duplicates by seed design, 8 this month, 7 upcoming). Management-page CEO label fixed client-side (ROLE_LABEL.ceo) + isManagement now in the employees list API.',
  }),
});
console.log('implement:', res.status, (await res.text()).slice(0, 200));
