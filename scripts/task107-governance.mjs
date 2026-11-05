// Task 107 — governance: register + approve + implement the robust
// web-integration fixes (dashboard API, my-summary, mobile payload hardening).
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
    title: 'Task 107 — Mobile/web robustness: /api/dashboard fix (tenant DB + correct models), my-summary resolves linked admins, LIVE payload hardening, APK v1.0.5 (versionCode 6)',
    description:
      'After the tenant admin could log in, ALL post-login screens errored on the LIVE tenant. Root causes: (1) /api/dashboard imported the platform DB client directly instead of the request-scoped tenant DB AND referenced nonexistent Prisma model names (leave -> leaveRequest, job -> jobPosting) plus a wrong field (joiningDate -> dateOfJoining), so it ALWAYS threw and returned zeroed stats with dataScope self — fixed with getDb(req), correct models, and per-metric Promise.allSettled fault tolerance; verified on LIVE: totalEmployees 9 + dataScope all (was 0/self) and demo: 59 employees/35 pending (was 0). (2) /api/attendance/my-summary 404ed for admin roles even when an Employee row is linked — now does a best-effort self lookup for scope-all admins; verified on LIVE: 200 with Vardhani Reddy (MARQ001) + October summary (was 404). (3) Mobile models crashed on LIVE payload shapes (branch/reportingManager/user returned as nested objects, not strings) — EmployeeModel/AttendanceModel/LeaveModel now coerce maps to friendly text, providers skip malformed rows, home stats load per-metric, attendance/leave use a shared resolveOwnEmployeeId fallback. (4) Avatars now render from data-URI (LIVE), relative /api paths and absolute URLs with initials fallback — admin photo + name show on Home and Profile. APK v1.0.5+6 (20.8MB arm64, native builds restricted to arm64) live on all three hosts.',
    category: 'mobile-app',
    riskLevel: 'medium',
    module: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id || d?.data?.id || d?.id;
console.log('change-request created:', id || d);
if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ action: 'implement', implementationNotes: 'Commit d3b5fe0e pushed (LIVE git auto-deploy) + demo CLI deploy Ready. LIVE verified: /api/dashboard {totalEmployees:9,dataScope:all}, /api/attendance/my-summary 200 (Vardhani Reddy, month 2026-10). APK v1.0.5+6 = 200 content-length 20758981 on 3boxeshrms.com, marqaitechgroup.3boxeshrms.com, nexus-hrms-demo.vercel.app.' }),
  });
  console.log('implement:', im.status);
}
const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const rows = ld?.data?.requests || ld?.data || ld?.requests || [];
const open = Array.isArray(rows) ? rows.filter(r => r.status !== 'implemented' && r.status !== 'approved').length : '?';
console.log('trail:', Array.isArray(rows) ? rows.length : '?', 'requests, open:', open);
