// Task 135 — governance: register + approve BEFORE push.
// (A) Raising a task (web OR mobile) did not notify the assignee or the
//     project manager — only a silent assignee-only bell on the shared
//     creation endpoint. Now: notifyTaskCreated fans out bell + email to
//     assignee + project manager + tenant admins with taskAlert diagnostics.
// (B) Mobile had no admin/CEO/HR team attendance view — new Team Attendance
//     screen (daily status + month team report), role-gated entries.
// (C) Admin/HR on-behalf apply flows showed no employee data — web
//     /attendance/apply-by-hr + /leave/apply-by-hr and the mobile apply sheet
//     now surface leave balances, regularization dates, recent punches and
//     pending requests before submitting.
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
    title: 'Task 135 — task-created notifications & emails (assignee + manager), mobile Team Attendance for admin/CEO/HR, employee context in admin/HR on-behalf apply flows',
    description:
      'User request: "In the projects module whenever I raise a task either from web mobile the respective assignee and the manager are not getting notifications and email alerts in both web and mobile; in the mobile app there is no option for admin/ceo/hr to view the team attendance reports and daily status; also in the leave module and attendance module whenever the admin/hr wants to apply any workflow on behalf of the employee there is no data like to check their leave balance, regularizations dates, etc". ' +
      'FIX (A) — src/lib/task-workflow.ts gains notifyTaskCreated() sharing the Task 128 step-alert machinery (recipient resolution incl. tenant admins, dedupe, createNotification bell + sendTenantEmail email, {recipients, notifications, emails, errors} diagnostics). POST /api/projects/[id]/tasks (the single creation endpoint used by BOTH the web CreateTaskModal on all 3 surfaces AND the mobile create sheet) now calls it with the assignee, project.projectManagerId and actor name, replaces the old silent assignee-only bell, and returns taskAlert diagnostics; the web toast reports the real delivery count. ' +
      'FIX (B) — new hrms_app Team Attendance screen (Daily Status tab: every active employee for a picked date with status derivation incl. weekend/holiday/absent/not-marked, check-in/out, hours, late-by vs the employee\'s own Task 133 shift windows; Team Report tab: the web /api/reports?type=attendance_report engine rendered per-employee P/L/A/HD/hours + by-day breakdown). Entries gated by ReportsScreen.canSee(role) (super_admin/tenant_admin/ceo/admin/hr_admin/company_hr_admin/manager) on the home grid, the drawer and the Reports attendance tab; server re-scopes rows by role. ' +
      'FIX (C) — /attendance/apply-by-hr: selecting an employee now loads an Employee Context panel (last-14-day punches + status, regularization dates with statuses, pending attendance requests by type, leave balance chips, shift window). /leave/apply-by-hr: new Attendance & Regularizations sidebar card (regularization dates + pending requests) beside the existing balances. Mobile leave apply sheet: dropdown now driven by the tenant\'s REAL leave types (POST sends leaveTypeId), and picking an employee shows their balances + recent requests. ' +
      'No schema changes. APK v1.6.3 (30) built (permanent key 590a456e…3749c) with the version chain synced. Tests: scripts/task135-contract-check.cjs 33/33; tsc 0 NEW errors vs git-stash baseline (1875 == 1875); flutter analyze 0 errors on all changed files.',
    category: 'feature',
    riskLevel: 'medium',
    module: 'Projects',
    relatedModule: 'Attendance & Mobile App',
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
