// Task 120 — governance: register + approve
// (add members to existing group chats + hide separated employees from
// Leave/Attendance/Projects/Chat pickers; v1.5.3+20).
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
    title: 'Task 120 — Mobile app: add members to EXISTING group chats + hide terminated/resigned employees from Leave/Attendance/Projects/Chat (v1.5.3, versionCode 20)',
    description:
      'User report 1: "In the chat in mobile app once I create a group chat and started the chat if I want to add one more person after the group is created not available." Fix: new POST /api/collaboration/chat/rooms/[id]/members endpoint (member-or-admin gate, direct rooms rejected — create a group instead, separated employees rejected, already-members skipped idempotently, audit-logged) + person-add button inside every group thread on mobile opening the same role-scoped employee picker used at creation, with per-employee skipped-reason feedback. User report 2: "make sure that the terminated employee should not be visible in the leave attendance projects and chat modules." Fix: GET /api/employees?excludeInactive=true (server-side status notIn [inactive,terminated,resigned], Employees module deliberately unaffected so HR still manages separated staff); mobile Leave apply picker, Projects member picker + team roster, and Chat directory/new-chat/add-members all pass the flag plus client-side status guards; server add-members re-rejects separated ids (defense in depth). Web chat page gained the same add-members sheet. flutter analyze 0 errors; 60/60 tests pass incl. new Task 120 suite (members model/parsing, inactive filtering, addMembers contract); aapt2-verified inside APK: versionCode 20, versionName 1.5.3, permanent release key 590a456e…3749c.',
    category: 'mobile-app',
    riskLevel: 'medium',
    module: 'Mobile App',
    relatedModule: 'Collaboration',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
