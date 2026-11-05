// Task 137 — mark the CR implemented with the deployed commit after live E2E.
const CR_ID = process.env.CR_ID || 'cmvm4pj4a000007lesf9nfp34';
const COMMIT = process.env.DEPLOY_COMMIT || 'd5471e49786f597867137aa78b0d15cd54fd2655';
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
      'Deployed to Vercel (both projects: 3-boxes-hrms + nexus-hrms-demo) via git push → auto-deploy, GitHub commit statuses success. Schema additions (Employee.interests + Experience.companyLogo/companyCategory/companyLevel) applied to platform + demo + marqaitechgroup (scripts/task137-schema.cjs, 3/3 VERIFIED pre-push). LIVE E2E scripts/task137-postdeploy-verify.cjs 25/25 PASS: dynamic experience row persisted with auto logo + listed/MNC tags; EmployeeSkill + Dependent (family) rows + interests saved via admin PUT then cleaned up; policies grid API 200 on both tenants; remember-me mints 30.00d JWT vs 1.00d without; employee-role self-service — phone low-risk change applied directly with First Name + Date of Birth LOCKED (skipped with "contact HR/Admin"), NotificationDelivery shows BOTH email:sent AND in_app:sent core_hr.profile.self_updated rows for HR/Admin; EXP (experienceYears) present on every employees-list row on demo AND marqaitechgroup; both hosts UP on 1.6.4 (31) — no APK rebuild required (mobile profile only edits avatar/phone).',
  }),
});
console.log('implement:', res.status, await res.text().then((t) => t.slice(0, 200)));
