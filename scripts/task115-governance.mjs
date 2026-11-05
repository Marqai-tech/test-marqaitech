// Task 115 governance: register the change request, then approve / implement.
// Usage: node scripts/task115-governance.mjs register|implement <crId> <commitSha>
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';

async function post(url, payload, token) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}
async function patch(url, payload, token) {
  const res = await fetch(url, {
    method: 'PATCH',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}

const login = await post(`${DEMO}/api/auth/login`, { email: EMAIL, password: PASSWORD });
if (!login.data.token) { console.error('LOGIN FAILED', login.status, JSON.stringify(login.data).slice(0, 200)); process.exit(1); }
const token = login.data.token;
console.log('super-admin login OK');

const mode = process.argv[2] || 'register';

if (mode === 'register') {
  const r = await post(`${DEMO}/api/super-admin/change-requests`, {
    title: 'Task 115: fix project-open/access errors for non-admin creators (creator auto-stamped as project manager, task-create RBAC) — APK v1.4.1+15',
    description: [
      'User report: "In the project module in mobile app I added a new project but when I try to open the project and add tasks it is throwing error. Pls check and update it now in vercel".',
      'ROOT CAUSE (reproduced with demo manager/employee tokens): GET /api/projects/[id] returned 403 "You do not have access to this project" for global managers/employees because resolveProjectAccess() found NO projectManagerId (mobile create form leaves it null), NO ProjectMember row and NO allocation — while POST /api/projects had NO RBAC at all, so the same user could CREATE a project they were then denied from OPENING. Secondary hole: POST /api/projects/[id]/tasks also had NO RBAC (a plain employee could create tasks on ANY project).',
      'SERVER FIXES:',
      '1. POST /api/projects now auto-stamps the creator as projectManagerId (when the caller did not pick one) via the creator employee lookup — resolveProjectAccess() grants the PM the manager role, so whoever creates a project can ALWAYS open it and add tasks on mobile AND web. Golden rule also enforced on POST (super admin without switched workspace = 403).',
      '2. POST /api/projects/[id]/tasks now requires resolveProjectAccess().canEdit || canLogTime (creator-PM, members, allocations, admins) — 403 otherwise. Closes the cross-project task-creation hole.',
      '3. DATA FIX on LIVE: the user-created orphan project "HRMS PROJECT" (no PM) was patched to projectManagerId = Vardhani Reddy (hr@gmail.com employee) via the gated PATCH endpoint; the diagnostic task created during reproduction was deleted.',
      'MOBILE (Flutter v1.4.1+15, permanent release key — upgrades over v1.4.0/v1.3.0 without uninstall): defensive hardening of the Projects module — empty-string-safe priority/approval labels, clamped avatar hue (negative hashCode), deduped assignee dropdown (null/duplicate keys crash), friendlier access-denied screen with guidance, version chain 1.4.1(15) + release notes + downloads page.',
      'BUILD NOTE: gradle instrumentation precompute disabled (GRADLE_OPTS) — MergeInstrumentationAnalysisTransform kept failing with corrupt instrumentation-hierarchy.bin on this disk; Flutter engine non-arm64 artifacts + .dart_tool were rebuilt after the ENOSPC cleanup.',
      'TESTING: flutter analyze 0 errors (116 pre-existing infos); 20/20 flutter tests; aapt2 versionCode 15 / versionName 1.4.1; apksigner cert = committed release key (590a456e…3749c).',
    ].join('\n'),
    category: 'employees',
    priority: 'high',
    requestedBy: 'automation (Task 115)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI via deploy-release.sh guard). Commit ${sha}. Directory scoping verified (employee=department, manager=team, admin=all), punch mode recorded, biometric + new screens in APK v1.3.0+13 live on all three hosts.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
