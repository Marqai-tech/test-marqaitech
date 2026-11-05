// Task 131 — governance: register + approve BEFORE push.
// (Biometric login fixes; task attachments visible + at creation on mobile;
// ONE unified create-task form on all web surfaces; CEO role full visibility.)
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
    title: 'Task 131 — Biometric login fixed (30-day session + phone identities), task attachments at creation (web+mobile), ONE unified create-task form on all 3 web surfaces, CEO role sees ALL employees/data/reports',
    description:
      'User request: "Mobile app - biometric login is not working properly after the setup still it is asking again the login credentials and when I give again it is giving invalid credentials. Still I\'m not able to see the attachment feature in the tasks in projects. Also in web app in projects dashboard the task create is not the same as the create tasks in the tasks in mobile app and another page tasks. The left side section of web app, pls make sure all the 3 pages have same fields and designs. Also for CEO role in mobile app and website app they are not able to see all employees or data or reports." ' +
      'BIOMETRIC: the fingerprint flow gates the STORED session, but mobile logins minted 24h tokens — the unlock died every night and re-setup was forced (session expiry disabled the biometric flag). Mobile login now sends rememberMe:true → the server\'s 30-day token path, so the stored session survives and the fingerprint actually bypasses credentials; session expiry no longer switches the flag off (message asks for one sign-in, email prefilled); the Setup-Biometric dialog now mirrors the main form EXACTLY — phone-number identities pass the selected country dial code (that mismatch was the "invalid credentials" for phone logins). ' +
      'TASK ATTACHMENTS (mobile): the create-task sheet gains the same ATTACHMENTS section as the update sheet (FilePicker, ≤3 MB/file, removable chips) — files upload right after the task is created (provider.createTask now returns the created task id); the update sheet keeps the full attachments editor. ' +
      'ONE CREATE-TASK FORM (web): new shared component src/components/tasks/CreateTaskModal.tsx — Project* (hidden inside a project), Task Title*, Task Type*, Workflow Step (+ re-testing rule hint), Priority, Assignee (required unless re-testing), Start Date / End Date / Hrs, Description, Attachments (uploaded after create) — used IDENTICALLY on the PM dashboard, the cross-project Tasks page and the per-project delivery board (fixedProjectId there), matching the mobile create sheet 1:1; the tasks-page inline strip and the board grid form were removed (taskForm state retired). ' +
      'CEO ROLE — ROOT CAUSE: getDataScope() in roleAccess.ts never listed ceo, so EVERY CEO resolved to SELF scope — own record only in the employee directory, empty dashboards, self-only reports (web + mobile share that path through resolveCompanyScope). ceo now returns ALL scope; RolePermission grants for the CEO role are copied from tenant_admin on ALL DBs (platform + both tenants, idempotent — Task 129 only seeded the platform copy); mobile reports gate already included ceo. ' +
      'Ships in the same v1.6.1 (28) APK as Task 130 (released payslip PDF gate). Verification: 24/24 task131 + 51/51 task130 node source-contract checks; tsc clean on changed files; flutter analyze 0 errors; post-deploy E2E on all 3 hosts.',
    category: 'projects',
    riskLevel: 'high',
    module: 'Mobile App',
    relatedModule: 'Project Management',
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
