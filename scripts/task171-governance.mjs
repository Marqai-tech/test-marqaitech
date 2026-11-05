// Task 171 — governance: register + approve BEFORE push.
// (Projects module: Create Task becomes an EMBEDDED form in the page itself —
// no popup — on all 4 surfaces, carrying the Task 169/170 delivery-breakdown +
// software-link fields inline.)
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
    title: 'Task 171 — Projects: Create Task embedded in the page (no popup) on all 4 surfaces — PM dashboard, Tasks board, project delivery board, Clients Raise Issue',
    description:
      'User request: "create task instead of pop up let it imbibe in the form itself and show in the software. pls update it now in the vercel." ' +
      'IMPLEMENTATION: the shared create-task form is no longer a modal overlay — new src/components/tasks/CreateTaskForm.tsx renders as an INLINE PANEL embedded in the page, replacing the deleted CreateTaskModal on all four surfaces: (1) /project-management — form expands above the active tab content, all three New Task buttons (header action row, Quick Actions, Tasks tab) toggle to Close Form while open; (2) /project-management/tasks — form expands between the header and the kanban columns; (3) /projects/[id] delivery board — form expands above the board columns; (4) /project-management/clients — Raise Issue renders the form embedded above the client grid with header "Raise Issue — <client>", External source + client pre-locked (showIssueModal/issueModalReady state removed). Same single source of truth as before: Project* / Task Source (Internal/External + Client) / Task Title / Task Type / Workflow Step (re-testing rule hint) / Priority / Assignee / Start-End-Hrs / Description / Delivery Breakdown (Module › Sub-module › Sub-section) / Software Link (URL-validated) / Attachments ≤3 MB uploaded after create; identical submit body to the old modal (trim, empty breakdown fields omitted so they stay NULL, taskAlert diagnostics toast, assignee+PM+admin fan-out handled server-side). The panel scroll-mt-28 + smooth scrollIntoView on mount so it is never hidden under the sticky tab bar; X/Cancel collapse it; successful create collapses it and refreshes the surface data. Mobile create sheet untouched (native APK out of scope; APIs unchanged). Web-only, no schema change, no version bump. Tests: tsc --noEmit 1844 == pristine stash baseline (0 new; the single project-management/page.tsx TS18048 percent-undefined error pre-exists from Task 156); eslint == pristine baseline on all 4 modified pages (12/3/20/101) and 0 problems on the new component; duplicate-import scan clean on all 5 touched files (the Turbopack failure mode from f041bd5a); dev-mode compile of all 4 pages 200 OK with zero compile errors; local next build impossible in the 4GB sandbox (known limit, Tasks 158/169 precedent) — Vercel build is the compile gate with postdeploy E2E to follow.',
    category: 'project_management',
    riskLevel: 'low',
    module: 'Project Management',
    relatedModule: 'Project Management',
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
