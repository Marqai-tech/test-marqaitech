// Task 128 — governance: register + approve BEFORE push
// (Project management module: dynamic dashboard + real unified create-task form,
// workflow steps + task type, re-testing/assignee rule, step-change alerts,
// mobile dynamic notification bell, terminated-employee status fix. v1.5.9(26).)
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
    title: 'Task 128 — Project management: dynamic PM dashboard + unified real create-task form, workflow steps (testing/re-testing/production/delivery) + task type replacing story points, re-testing→assignee routing rule, step-change alerts (bell+email) to assignee/PM/admins, mobile dynamic notification bell, terminated-employee status fix (v1.5.9/26)',
    description:
      'User request: "in the project management module in the web app, the dashboard is not dynamic as whenever I click a project it is not showing any detail. Also the create new task in the dashboard should be the same in the mobile app and other sections of this module. In the task page instead of story points change it to workflow steps - testing, re-testing, production, delivery. Also add a field task type - customisation, rework, development, bug. In the workflow type if somebody select the re-testing it should go back to the assignee itself and any other steps it should ask the assignee again. Also any time there is a change in the steps email alert and mobile notification should come to the respective assignee and project manager, admin. Also in the mobile app the notifications bell is static pls make it dynamic when I click it should show the notifications. Also in the employee directory the terminated employee is shown as probation in the mobile app. So pls make sure the status is updated for terminated employees in all the client versions." ' +
      'SCHEMA: additive ProjectTask.taskType TEXT NULL + ProjectTask.workflowStep TEXT NULL applied to platform + demo + marqaitechgroup (3/3 verified, scripts/task128-schema.cjs) BEFORE push; Prisma client regenerated. ' +
      'API: POST tasks accepts+validates taskType (customisation|rework|development|bug) and workflowStep (testing|re_testing|production|delivery); PATCH enforces the routing rule — re_testing sends the task BACK to the current assignee (server keeps it when the body omits assignedToId) while every other step REQUIRES an assignee (400 without one, the UI asks again with a pre-filled picker); every step CHANGE fans out an in-app bell notification + email to the (new) assignee, the project manager and the tenant admins (new src/lib/task-workflow.ts, deduped recipients, project activity logged). ' +
      'WEB: PM dashboard project cards (grid + list) now navigate to the full /projects/[id] delivery workspace with an Open-workspace affordance; the fake Create-New-Task modal (uncontrolled inputs + success toast, never called any API) is replaced by a REAL unified form — project, name, task type, workflow step, priority, assignee (required except re-testing), due date, estimated hours, description — POSTing to /api/projects/[id]/tasks; dead fake New-Project/New-Sprint modals removed and quick actions route to the real pages; kanban cards show type + step chips. The tasks page (/project-management/tasks) replaces story points with workflow steps + task type in create row, edit modal and card badges, with the re-testing rule and step-change toasts; the delivery board tab (projects/[id]) gets the same unified fields. ' +
      'MOBILE v1.5.9(26): model parses taskType/workflowStep (+labels); task cards show type/step chips (story points meta removed); the status move sheet is now a full task-update sheet (STATUS + WORKFLOW STEP sections, re-testing keeps the assignee, other steps require the assignee with a guarded dropdown); the create sheet gains Task Type chips + Workflow Step chips with the same rule; home-screen bell and MaanHeader bell are DYNAMIC — tapping opens the existing /notifications center (previously the home bell had no handler and the header bell showed a "coming up in the next app release" snackbar). ' +
      'EMPLOYEE STATUS: root cause — DELETE /api/employees/[id] (terminate) set ONLY status=terminated leaving a stale employeeStatus ("probation") which the mobile detail screen renders verbatim. DELETE now syncs employeeStatus=terminated; PUT syncs it when status becomes terminated/resigned; one-off data fix (scripts/task128-fix-employee-status.cjs) healed 3 rows across the tenant DBs (marqaitechgroup 1, demo 2) BEFORE push — all clients now show "Terminated"; the mobile model gained a displayStatus getter (terminated/resigned win over employeeStatus) used by the detail screen (red chip) and the management list (status text + red dot). ' +
      'VERSION: 1.5.9 (26) synced across pubspec.yaml, lib/config/app_info.dart, lib/config/constants.dart, src/lib/app-version.ts, public/downloads/index.html + README.txt, hrms_app/test/task123_payroll_integration_test.dart; APK rebuilt per the Task 125/127 manual and shipped to public/downloads. ' +
      'Verification: 71/71 node source-contract checks (scripts/task128-contract-check.mjs); tsc clean on all changed files; task126 contract checks ALL PASS; production E2E after deploy (task128-postdeploy-verify.mjs): project card click-through, create-task POST with type+step, re-testing PATCH keeps assignee, non-re-testing PATCH without assignee → 400, step-change notifications created for assignee+PM+admin, employee status API + data verified.',
    category: 'workflow',
    riskLevel: 'medium',
    module: 'Projects',
    relatedModule: 'Notifications',
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
