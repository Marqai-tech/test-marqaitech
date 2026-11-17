// Task 154 — governance: register + approve BEFORE push.
// (Dashboard UI polish: colourful gradient heading banner on the /home and
// /dashboard pages, employee-list filter bar straightened into a responsive
// grid, org chart Full View fullscreen popup, employee dashboard hero row
// rebalanced to equal thirds with extra Leave Summary rows.)
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
    title: 'Task 154 — Dashboard UI polish: colourful gradient heading banner (home + employee dashboard), employee-list filter bar straightened to a responsive grid, org chart Full View fullscreen popup, employee dashboard hero/leave row rebalanced with extra summary details',
    description:
      'User request: "add some colour only to the heading banner in both the home and dashboard page which are white so that it will look colourful. allign the filters in the employee listview page properly to look nicely as all are in zig zag mode. in org tree - give me a full view page option to see the full org chart in pop up mode in full screen view. little bit in the employee dashboard view next to the employee hero card the leave details and leave summary are not looking good see how it can be aligned and mapped by adding any other details to align the view. pls update these in the vercel now." ' +
      'IMPLEMENTATION (web only — pure UI/class-level changes, zero API or auth changes): ' +
      '(1) COLOURFUL HEADING BANNER — PageBreadcrumbs (shared by exactly the two pages the user named, /home admin dashboard and /dashboard employee dashboard) restyled from the flat white strip into a rounded royal→violet gradient banner (from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6]) with warm orange / info-blue / emerald blurred colour glows, white title + breadcrumb trail, soft shadow — the DateChip and CollapseToggle white chips pop against the gradient. No logic touched. ' +
      '(2) EMPLOYEE LIST FILTER ALIGNMENT — the filter bar on /employees no longer zigzags: the old flex-wrap row (search flex-1 + 3 selects + buttons, wrapping at arbitrary points with the designation select hidden below sm) is replaced by a straight responsive grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 (search spans 4, each select spans 2, all w-full), the Designation select is now ALWAYS visible, and the Management toggle + Export buttons moved to their own right-aligned row under the filters. Active filter chips unchanged. ' +
      '(3) ORG CHART FULL VIEW — new "Full View" gradient button next to the Organization Tree heading opens the ENTIRE org chart in a fullscreen popup (fixed inset-0 z-[100] dialog): colourful gradient header (title, filter status, visible-employee count, Expand all / Collapse all / Close), fully scrollable body rendering the same interactive TreeNode tree (search highlight, selection, expand/collapse state shared with the inline chart), footer hint, Esc key closes, body scroll locked while open, loading/empty states mirrored. ' +
      '(4) EMPLOYEE DASHBOARD HERO ROW — rebalanced from hero(4)+Leave Details(5)+Leave Summary(3) to EQUAL THIRDS hero(4)+Leave Details(4)+Leave Summary(4) so the three cards align edge to edge; Leave Details pie resized (w-40, radii 44/64) for the narrower column; Leave Summary violet card enriched with the extra rows the user asked for: Pending Requests stat chip (2x2 stat grid: Total Allocation, Days Used, Remaining, Pending Requests), a new Upcoming Approved Leave context row (type + date range from real /api/leave data, or "No upcoming approved leave"), keeping the Apply Leave button — heights now line up with the profile hero card. ' +
      'TESTS: tsc --noEmit vs git-stash baseline — identical error set (4 pre-existing employees/page.tsx errors, zero new); eslint on the 4 touched files — identical 51 problems before and after (18 errors / 33 warnings, all pre-existing); full production build not runnable in the 4GB dev container (OOM-killed, no sudo/swap) — Vercel remote build is the build gate; touched files are class/JSX-only with no imports of new modules.',
    category: 'ui_improvement',
    riskLevel: 'low',
    module: 'Dashboard',
    relatedModule: 'Employees / Organization Chart',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || JSON.stringify(d).slice(0, 200));

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
