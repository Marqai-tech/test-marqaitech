// Task 169 — governance: register + approve BEFORE push.
// (Projects module: Module / Sub-module / Sub-section / Software Link fields on
// task create + edit + board cards; My Duty Roster self-service page — employees
// see their own roster, managers also their reportees'. DDL applied 3/3 DBs.)
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
    title: 'Task 169 — Projects: Module/Sub-module/Sub-section/Software Link fields on tasks (create+edit+cards); Attendance: My Duty Roster self-service (employees own roster, managers + reportees)',
    description:
      'User request: "in the projects module - create task - add modules , sub moduels , sub sections, software link , fields and update it. Same way add duty roaster to employees where they can see their own roster only and managers can see their reportees roster also." ' +
      'IMPLEMENTATION: (1) PROJECT TASK DELIVERY BREAKDOWN — ProjectTask gains module / subModule / subSection / softwareLink (all nullable TEXT; DDL applied additively + idempotently to platform + 3boxes-hrms-demo + marqaitechgroup = 3/3 VERIFIED pre-push via scripts/task169-schema.cjs; prisma client regenerated). POST /api/projects/[id]/tasks accepts the 4 fields (trim, empty→null, softwareLink validated as http(s) URL) and stamps the [Module › Sub-module › Sub-section] path into the CREATE_PROJECT_TASK audit details; PATCH /api/projects/[id]/tasks/[taskId] accepts them the same way (\'\' clears). The SHARED CreateTaskModal (project board + PM dashboard + Tasks page + Clients raise-issue) gains a Delivery Breakdown section: Module / Sub-module / Sub-section free-text inputs with <datalist> autocomplete pools built from the project\u2019s existing tasks (fetched once per project per session) and a Software Link URL input with link icon; client-side URL validation mirrors the server. The project board edit modal and the cross-project Tasks page edit modal both gain the same 4 inputs (project-page uses a typed breakdownSuggestions() helper over the any-typed task list) and send them on save; board cards + tasks-page cards render the sky Module › Sub-module › Sub-section path and a teal clickable 🔗 software link (host truncated to 28 chars, full URL in tooltip). Mobile create sheet is untouched (native APK rebuild out of scope for this web release; server accepts the fields so mobile-created tasks keep working). (2) MY DUTY ROSTER (self-service, READ-ONLY) — new GET /api/attendance/my-roster?month=YYYY-MM[&employeeId=]: admin/HR roles may view any one employee or the whole active workforce; every other role resolves the caller\u2019s own employee + reportees via the SAME team scope the rest of the app uses (Employee.reportingManagerId solid line + active DottedLineManager rows, replica of src/lib/managerScope.ts) and gets 403 on any employeeId outside it; employees with no employee profile get an empty-but-200 payload. Per-date shift resolution is a faithful replica of the admin duty-roster route / loadEmployeeShiftWindows rotation math (latest-startDate-wins assignment → elapsed days from roster anchor → pattern index; expired/absent assignment → policy-default), so employees see exactly the shift punch evaluation will apply; includes the same CREATE-TABLE-IF-NOT-EXISTS roster self-heal. New /attendance/my-roster page (SmartHR shell: PageBreadcrumbs banner + StatCards + Panels): read-only month calendar for the selected person with per-day shift chips (same stable pastel palette as the admin grid — same shift = same colour), weekend tint + today ring, This Week strip (Mon..Sun with today highlighted), shift legend with times, person selector — employees just see themselves (★ My Roster); managers see themselves + reportees as chips (search box when >8); banner text adapts (own-only vs reportees). No mutation UI — a pointer to HR/Admin\u2019s Duty Roster page instead. Nav: \u2018My Duty Roster\u2019 entry right under Attendance Dashboard for all roles; /attendance is already in the self-service allowed prefixes and my-roster is NOT in the denied list (the admin /attendance/duty-roster stays denied), so no roleAccess change needed. Web-only, no version bump. Tests: tsc --noEmit 1843 == Task 168 baseline (0 errors in touched/new files); eslint == pristine baseline on all 4 modified files (10/88/7/0) and 0 problems on all 4 new files; DDL 3/3 DBs verified; local next build impossible in the 4GB sandbox (OS OOM at every heap size — app outgrew it), so Vercel\u2019s build is the compile gate with postdeploy E2E to follow.',
    category: 'project_management',
    riskLevel: 'medium',
    module: 'Project Management',
    relatedModule: 'Attendance',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || JSON.stringify(d).slice(0, 300));

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}
