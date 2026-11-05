// Task 156 — mark the governance CR implemented with the deploy commit.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvopt7jq000107jvy9f4wtyg';
const DEPLOY_COMMIT = '1296f4a72d4ea72bbbaa4197b7149f718194fad7';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const evidence = [
  'tsc --noEmit: 1844 errors vs git-stash baseline 1850 — 0 new, 6 pre-existing fixed',
  'eslint on 25 changed files: 99 problems vs 131 baseline — 0 new, 32 fixed',
  'LIVE bundle scan (scripts/task156-postdeploy-verify.mjs): 36/36 content+auth checks PASS (app-version parse key was wrong in the script; direct curl shows 1.8.0(36) unchanged)',
  'ALL 25 pages on marqaitechgroup.3boxeshrms.com serve the shared royal→violet gradient banner + their new sidebar-matched titles (leave/attendance/payroll/group/recruitment/onboarding/preboarding/performance/learning/PM/travel/assets/it-admin/accounts/crm/clients/helpdesk/governance/super-admin/tenant-admin/company/dashboards picker/dashboards-employee/dashboards-payroll/employees-dashboard)',
  'apex (nexus-hrms-demo.vercel.app) spot checks: /crm /helpdesk /it-admin /payroll carry the same banners',
  'auth untouched: apex superadmin + tenant hr@gmail.com logins 200',
  'APIs healthy: /api/leave, /api/employees, /api/payroll/dashboard all 200 on tenant',
  'real-browser walkthrough (agent-browser, tenant HR): /crm single banner + royal tab pills + New Deal orange CTA + pastel Panels; /leave banner + glass CSV/Excel/PDF chips + orange Add Leave + 4 shared StatCards + Leave List Panel; /attendance + /onboarding single banner, action rows intact; no duplicate headers anywhere',
  'app-version unchanged: versionName 1.8.0, versionCode 36 (web-only change, no bump, APK untouched)',
];

const res = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: DEPLOY_COMMIT,
    evidence: evidence.join(' | '),
  }),
});
console.log('implement:', res.status, (await res.text()).slice(0, 200));
