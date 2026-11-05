// Task 169 — implement the approved CR with deploy evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvtabnom000008l0y0nwicme';
const DEPLOY_COMMIT = '4aae617b';

const evidence = [
  'Deploy: commits 1fff2fa9 (feature) + 4aae617b (my-roster JWT userId fix) on marqai main; Vercel build READY; /api/attendance/my-roster serves 401 application/json on marqaitechgroup.3boxeshrms.com AND nexus-hrms-demo.vercel.app (nexus-hrms-mu.vercel.app is down platform-wide — /login itself 404s, pre-existing, unrelated).',
  'E2E main suite (scripts/task169-e2e.cjs) 25/27 PASS on live: HR/admin my-roster 200 whole workforce (12 people, 31-day grid, resolved cells roster|policy-default, 3 shifts), admin single-person scope, page 200 + bundle markers (My Duty Roster / This Week / default-shift legend), anon 401 JSON, task create 201 echoing module/subModule/subSection/softwareLink, invalid softwareLink 400, patch 200 (link updated + subSection cleared to NULL + module changed), GET persistence, tenant-DB row proof (module=E2E Module A2, softwareLink=https://updated.example.com/link, subSection=NULL), cleanup delete, anon create 401. The 2 non-fails: mahesh@ is role=ceo (tenant-privilege per Task 129) so the ADMIN branch correctly applies — CEO sees the whole workforce by design; no manager-role users exist in this tenant.',
  'E2E supplement (scripts/task169-e2e2.cjs) 9/9 PASS on live after 4aae617b: manoj@marqaitech.com (MARQ010, role=employee) sees EXACTLY own roster (people=1 self, MARQ010, isManager=false, isAdmin=false), 1 row x 31 days, 403 on another employee roster (MARQ013), page renders 200. This fix was REQUIRED: the first build resolved the non-admin scope via user.id but the JWT payload is { userId, email, role, tenantId } — employees got an empty 200 and the 403 guard was bypassed; fixed by resolving via user.userId (matching managerScope.ts).',
  'CREATE_PROJECT_TASK audit row verified in tenant DB stamping the breakdown path: details = "Created internal task \\"Task 169 E2E delivery-breakdown mvtb8iv9\\" in project cmvgiqodw000107jub73qrbd2 [E2E Module A › E2E SubModule B › E2E SubSection C]".',
  'Parallel-session reconciliation: Task 170 (195804c1) independently added the CreateTaskModal fields + My Duty Roster nav entry + made the Duty Roster scheduler HR/Admin-only in the nav — these were the two pieces my 1fff2fa9 accidentally lost (my eslint-baseline experiment overwrote CreateTaskModal.tsx/navData.tsx on disk before commit; restored only 2 of 4 files). Rebased cleanly; final tree = my schema/APIs/my-roster + their create-form/nav; tsc 1843 == baseline after clearing stale .next, no duplicates.',
  'DDL: scripts/task169-schema.cjs applied module/subModule/subSection/softwareLink to ProjectTask on platform + 3boxes-hrms-demo + marqaitechgroup — 3/3 VERIFIED pre-push (additive IF NOT EXISTS).',
].join(' || ');

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ action: 'implement', deployCommit: DEPLOY_COMMIT, evidence }),
});
console.log('implement:', r.status, JSON.stringify(await r.json()).slice(0, 300));
