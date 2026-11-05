// Task 128 — mark the change request IMPLEMENTED with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvjm1pno000007kw04n4kbgd';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const ap = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'IMPLEMENTED + LIVE E2E (scripts/task128-postdeploy-verify.mjs 28/28 PASS): app-version 1.5.9 (26) + APK 200 (22,083,370 B, permanent key 590a456e…3749c) on marqaitechgroup.3boxeshrms.com / 3boxeshrms.com / nexus-hrms-demo.vercel.app; PM dashboard project cards navigate to /projects/[id] (detail API verified); unified create-task POST persists taskType=bug + workflowStep=testing; re_testing PATCH keeps the assignee itself (verified unchanged); production PATCH without assignee → 400 with the rule message; step-change fan-out → 3 recipients (assignee + PM + tenant admins), 3 in-app bell notifications + 3 emails, 0 errors (stepAlert diagnostics in PATCH response); terminated employee Sonali Naik now status=terminated + employeeStatus=terminated (data fix healed marqaitechgroup 1 row + demo 2 rows pre-push); /payroll/validations 200 (Task 126/127 guard intact); 71/71 source-contract checks. Commits d4820523 (feature) → c0f1bfaa (APK) → 937c473a/82316c8b/5785946d/57f65af9 (fan-out hardening: User model uses name not firstName/lastName in the admin lookup; stepAlert surfaced in the response). Deploy dpl_EvKxY5yjYVSnwuzS6w64HMpFKYBX READY.',
  }),
});
console.log('implement:', ap.status);
const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
