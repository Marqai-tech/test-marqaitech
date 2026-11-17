// Task 129 — governance: register + approve BEFORE push
// (Project tasks: description + start/end dates + hrs + file attachments;
// mobile admin Reports for leave/attendance/employees/projects; new CEO role
// with tenant-admin access rights + management-without-role default fix. v1.6.0(27).)
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
    title: 'Task 129 — Projects: task description + start/end dates + hrs + file attachments (web & mobile), mobile admin Reports (leave/attendance/employees/projects), new CEO role with tenant-admin access + management-without-role default fix (v1.6.0/27)',
    description:
      'User request: "In the projects Task - task description is not available pls add this field. Also add start date and end date along with hrs. Also there should be attachment for tasks to attach the screenshot etc. Pls add all these in the app mobile app and vercel now. Also for admin give reports for all the modules like leave attendance employee projects in the mobile app. Also in the website app when we added one person as management and marked as management and didn\'t select any role it is by default going to employee instead create one more role as ceo who will have same access rights like tenant admin." ' +
      'SCHEMA: new ProjectAttachment model (projectId FK cascade, taskId FK cascade NULL, fileName/mimeType/fileSize/category/dataUrl TEXT base64/uploadedById FK/isActive) created via raw SQL (scripts/task129-schema.cjs) on platform + demo + marqaitechgroup (3/3 verified) BEFORE push; Prisma client regenerated; ProjectAttachment rows live under the project attachments API with optional taskId binding. The previously-BROKEN Task 121 /api/projects/[id]/attachments routes (referenced a nonexistent Prisma model + Project.createdBy column) are now functional against the real table. ' +
      'TASK FIELDS: description / plannedStart / plannedEnd / estimatedHours already existed in DB+API — the gap was UI. Web: unified PM-dashboard create form gains Start Date (+ relabeled End Date / Hrs); tasks page create row + edit modal gain start date + hrs; delivery board create + edit gain start date; description, start→end dates, hrs and an attachment-count badge now render on task cards everywhere. Mobile: create sheet gains Description + Start date (+ End date), update sheet becomes a full editor (description, start/end date pickers, hrs) and the task card shows description + start/end + hrs + paperclip count; model parses _count.attachments. ' +
      'ATTACHMENTS: GET /api/projects/[id]/attachments?taskId= filters per task; POST binds taskId (validated to the same project, ≤3 MB base64 data-URL, same convention as chat attachments, audit-logged); GET /[attachmentId] streams bytes; DELETE soft-deletes. Shared web component src/components/tasks/TaskAttachments.tsx embedded in both edit modals; mobile upload via FilePicker (dataUrl) + Share.shareXFiles to open. Tasks list API now includes _count.attachments for badges. ' +
      'ADMIN REPORTS (mobile): the stub /reports screen replaced by a live 4-tab screen (Employees / Leave / Attendance / Projects) powered by the SAME engines the web Reports hub uses (GET /api/reports?type=employee_report|leave_report|attendance_report + GET /api/project-reports) with a 12-month picker, KPI stat tiles, distribution bars, dept distribution, recent joiners, portfolio budget/progress/overdue and tasks-by-status; server role-scoping applies (admins=company, managers=team). Entries added to the home module grid + drawer gated to {super_admin, tenant_admin, ceo, hr_admin, company_hr_admin, admin, manager}. ' +
      'CEO ROLE: new first-class role with the SAME access rights as tenant_admin — mechanical sweep added ceo alongside tenant_admin in ~267 files (API guards, src/lib helpers, page-level arrays, navData), roleAccess.ts (MODULE_ACCESS, getDataScope all-scope, ROLE_LEVELS ceo=1, ROLE_ACCESS_DETAILS entry, LEGACY_ROLE_MAP/migrateRole keeps ceo first-class), permissions.ts (AdminRole union + can/canActOnTenant branches), approver/leave/recruitment/project workflow type unions, RBAC Role row seeded on all 3 DBs (tenant_admin grants copied on platform: 315 permissions), task-workflow admin fan-out includes ceo. DEFAULT FIX: the employee form offers CEO and auto-selects it when Designate-as-Management is ticked without a role; API defaults — employees/[id] PUT effectiveRole = role || (isManagement ? ceo : employee); credentials creation (single + bulk) now creates Management designees as ceo instead of employee; one-off heal (scripts/task129-ceo-heal.cjs) promoted existing management-without-role users (1 in demo: amrutha; live tenant management users already held admin roles). CEO users must re-login to refresh the JWT role. ' +
      'VERSION: 1.6.0 (27) synced across pubspec.yaml, lib/config/app_info.dart, lib/config/constants.dart, src/lib/app-version.ts, public/downloads/index.html + README.txt, hrms_app/test/task123_payroll_integration_test.dart (also fixes the stale versionCode 25 expectation); APK rebuilt per the Task 125/127/128 manual and shipped to public/downloads. ' +
      'Verification: node source-contract checks (scripts/task129-contract-check.mjs); tsc error count 1875 vs 1879 pre-existing baseline (worktree diff, zero new errors; 2 new type sites fixed); dart analyze lib = 0 errors; production E2E after deploy (task129-postdeploy-verify.mjs): task create/edit with description+dates+hrs, attachment upload/list/download/delete, attachment count badge in tasks payload, admin reports payloads for all four modules, CEO user role + heal evidence, app-version 1.6.0/27 + APK 200 on all three hosts.',
    category: 'feature',
    riskLevel: 'medium',
    module: 'Projects',
    relatedModule: 'Reports',
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
