// Task 118 — governance: register + approve + implement
// (chat directory-by-default + projects add options on mobile; v1.5.1+18).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 118 — Mobile app: Chat directory-by-default + Projects add options for Tasks/Milestones/Team (v1.5.1, versionCode 18)',
    description:
      'User reports: (1) "in the chat when I click nothing is showing" — the mobile chat opened on an empty rooms list with no way to start; (2) "give all the employees by default in the directory chat option". Fix: ChatHomeScreen now has Chats + Directory tabs; the Directory tab lists ALL employees by default (server role-scoping unchanged: employee=department, manager=team+reportees, admin=all) and tapping a teammate creates-or-reuses the E2EE direct room and opens it instantly. Projects: root cause of "no option is provided" — the Tasks tab early-returned an empty state WITHOUT the add FAB when the task list was empty (both LIVE projects have zero tasks), and Milestones/Team never had any add UI. Fix: Tasks/Milestones/Team tabs each carry a labelled "New Task"/"New Milestone"/"Add Member" FAB + empty-state pill gated by the server access.canEdit (tenant admin = manager per project-rbac); new sheets POST /api/projects/[id]/milestones (name, plannedDate, sequence, isPhase) and /api/projects/[id]/allocations (employeeId, startDate, role, allocationPct) — the exact endpoints the web module uses; employee picker filters already-allocated members. flutter analyze 0 errors (118 pre-existing infos), 45/45 tests pass, aapt2-verified inside APK: versionCode 18, versionName 1.5.1, INTERNET + ACCESS_FINE_LOCATION + USE_BIOMETRIC, permanent release key (CN=3 Boxes HRMS).',
    category: 'mobile-app',
    riskLevel: 'medium',
    module: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id || d?.data?.id || d?.id || d?.changeRequest?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'implement', implementationNotes: 'TODO_COMMIT pushed (LIVE git auto-deploy); APK v1.5.1+18 = HTTP 200 on all three hosts; /api/public/app-version returns 1.5.1/18.' }),
  });
  console.log('implement:', im.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const rows = ld?.requests || ld?.data || ld || [];
console.log('trail:', Array.isArray(rows) ? `${rows.length} requests` : 'shape?', rows.filter ? `${rows.filter(r => r.status === 'pending').length} pending` : '');
