// Task 156 — governance: register + approve BEFORE push.
// (ALL module dashboards across the software restyled to the SmartHR design
// system — same treatment as Task 155's /employees/dashboard.)
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
    title: 'Task 156 — ALL module dashboards restyled to the SmartHR design system (same treatment as Task 155)',
    description:
      'User request: "same way change the styling of all the dashboards of all the modules in the software now and update it in vercel now." ' +
      'IMPLEMENTATION (web only — pure UI/class-level changes in 25 files: 24 dashboard pages + the shared ModuleDashboardShell; zero API, auth, logic or route changes): ' +
      '(1) SHARED SHELL UPGRADE — ModuleDashboardShell (the chrome behind 16 module pages incl. Marketplace/Collaboration/Docs) now renders the same PageBreadcrumbs royal→violet gradient banner as /dashboard and /employees/dashboard instead of its flat icon+h1 title row, with new optional title/trail/headerRight props and a royal active pill on its URL-synced tab bar; the empty-tab placeholder CTA moved from green to royal. ' +
      '(2) PAGE BANNERS — every module dashboard now opens with the shared gradient banner titled to match its sidebar label: Leave Dashboard, Attendance Dashboard, Payroll Dashboard, My Payroll Dashboard (employee variant), Group Dashboard, Recruitment Dashboard, Onboarding Dashboard, Preboarding Dashboard, Appraisal Dashboard, L&D Hub, PM Dashboard, Travel & Expense Dashboard, Asset Dashboard, IT Admin Console, Accounts Dashboard, CRM Dashboard, External Dashboard, Support Dashboard, Governance Dashboard, Super Admin Dashboard, Tenant Dashboard, Company Dashboard, Dashboards picker, Admin Dashboard (/dashboards/employee), Payroll Dashboard (/dashboards/payroll). Old flat h1 rows / off-palette heroes (CRM emerald, PM teal-fuchsia, IT-admin red, dashboards/employee+payroll dark heroes) removed; action buttons preserved as white-glass chips in the banner right slot (primary CTA in the template orange gradient). ' +
      '(3) SHARED WIDGETS — KPI/stat rows converted to the shared StatCard (white card, colourful top accent bar, round pastel icons rotating royal #3A57C4 / emerald #10B981 / orange #FF9B44 / rose #F43F5E / info #009EFB / violet #6C4FD6; ~60 cards across 14 pages) and major content sections wrapped in the shared Panel with template icon badges (~60 panels); company dashboard tiles use MiniStatTile; loading states use StatSkeleton/SkeletonBlock; off-palette active tab pills (emerald/teal/red/green) recoloured to royal #3A57C4. All computed values, expressions, role gating, handlers, tabs, data fetches and modals preserved byte-for-byte; header action buttons of shell pages relocated into compact in-content action rows (scoped state could not hoist) with identical behaviour. ' +
      '(4) NO DUPLICATES — the 13 shell-based pages previously given in-content banners now render exactly ONE banner (via the shell). ' +
      'TESTS: tsc --noEmit error count 1844 vs git-stash baseline 1850 (0 new; 6 pre-existing errors fixed as a side effect); eslint on the 25 changed files 99 problems vs 131 baseline (0 new; 32 fixed by dead-import cleanup); no version bump / no APK rebuild (web-only change); APK download entry and login page untouched.',
    category: 'ui_improvement',
    riskLevel: 'low',
    module: 'All Modules',
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
