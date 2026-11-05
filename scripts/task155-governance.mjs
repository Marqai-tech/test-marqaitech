// Task 155 — governance: register + approve BEFORE push.
// (Employees module dashboard /employees/dashboard restyled to the Employee
// Dashboard UI view: shared SmartHR widgets + royal/violet/orange palette;
// page heading renamed "Module Dashboard" -> "Dashboard".)
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
    title: 'Task 155 — Employees module dashboard (/employees/dashboard) restyled to the Employee Dashboard UI view + heading renamed "Module Dashboard" -> "Dashboard"',
    description:
      'User request: "https://marqaitechgroup.3boxeshrms.com/employees/dashboard - change the style to employee dashboard ui view similar type and update it and rename it to dashboard instead of module dashboard in the right side pane also. pls update it now in vercel" ' +
      'IMPLEMENTATION (web only — pure UI/class-level changes in ONE file, src/app/(dashboard)/employees/dashboard/page.tsx; zero API, auth or logic changes): ' +
      '(1) STYLE UNIFIED WITH EMPLOYEE DASHBOARD — the page now renders with the same shared SmartHR building blocks as /dashboard (components/dashboard/smarthr-widgets): the old flat white custom header is replaced by the PageBreadcrumbs royal→violet gradient banner (same from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6] band with orange/blue/emerald glows) titled "Dashboard" with breadcrumb trail Employee / Dashboard, a DateChip, a white refresh chip and the Add Employee button recoloured to the template orange gradient; the KPI row swaps the old full-gradient local cards for the shared StatCard (white card, colourful top accent bar, round pastel icon — royal/emerald/amber/rose); Quick Actions now uses the shared Panel + QuickLinkGrid pastel tiles (Add New Employee, View Employee List, Org Chart, Probation Tracking, Transfer Management, Resignation Portal — same role gating as before); Department Distribution, Employee Lifecycle (shared MiniStatTile with View All), Recent Employee Updates, and the whole Analytics tab (Headcount Trend with royal→violet bars, Gender Distribution, Key Metrics, Tenure Overview) are wrapped in the shared Panel with template icon badges; the Updates tab list card, search input (royal focus ring) and rows were recoloured to the template slate palette; loading state now uses the shared StatSkeleton + SkeletonBlock pattern; all remaining green-600 accents moved to the template palette. Role-based content (admin analytics, manager lifecycle, employee self view), tabs (Overview / Social Feeds / Analytics / Updates), company-scope banner, SocialFeedsSection and every data fetch are untouched. ' +
      '(2) RENAME — the right side pane heading "Module Dashboard" is now "Dashboard", matching the sidebar label (navData already says "Dashboard" since Task 138; the page heading was the last "Module Dashboard" string in the UI). ' +
      'TESTS: tsc --noEmit error count identical to the git-stash baseline (1850 == 1850, zero new errors); JSX verified balanced by tsc; no new imports beyond the already-bundled smarthr-widgets module shared with /dashboard and /home; no version bump / no APK rebuild (web-only change).',
    category: 'ui_improvement',
    riskLevel: 'low',
    module: 'Employees',
    relatedModule: 'Dashboard',
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
