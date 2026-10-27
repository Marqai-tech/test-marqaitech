// Task 154 — mark CR implemented (after deploy + live verification).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvo3si96000008l57i72sewy';
const DEPLOY_COMMIT = '0c89dc4a';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: DEPLOY_COMMIT,
    implementationNotes:
      'DEPLOYED (commit 0c89dc4a, both Vercel projects success — nexus-hrms-demo + 3-boxes-hrms) + LIVE VERIFIED: task154-postdeploy-verify.cjs 17/17 PASS (both hosts up v1.7.1(35), all 4 touched routes /home /dashboard /employees /org-chart serve 200 on demo AND marqai tenants, leave balance + leave list + employees APIs 200, marqai admin + demo admin logins OK, CR approved) plus a real-browser walkthrough on marqaitechgroup.3boxeshrms.com (agent-browser, admin session): /home shows the royal-violet gradient heading banner with white Dashboard title + breadcrumb + white date/collapse chips; /dashboard shows the same colourful banner and the rebalanced equal-thirds row — profile hero (MARQ009 details) | Leave Details | Leave Summary with the NEW 2x2 stat grid (Total Allocation, Days Used, Remaining, Pending Requests) + Upcoming Approved Leave row + Apply Leave; /employees shows the straight one-row filter bar (Search | All Departments | Designation | Select Status) with Management-hidden + Export right-aligned below — no zigzag; /org-chart shows the new gradient Full View button, clicking it opens the fullscreen popup (gradient header with Expand all / Collapse all / Close, scrollable full tree rendering all 13 employees, footer hint) and Esc closes it back to the inline chart. ' +
      'Shipped: (1) PageBreadcrumbs (shared by /home + /dashboard) restyled from flat white to a rounded royal→violet gradient banner with orange/blue/emerald colour glows, white title + trail, soft shadow. (2) /employees filter bar: zigzag flex-wrap replaced by a responsive grid (grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 — search spans 4, each of the three always-visible selects spans 2), Management toggle + Export moved to their own right-aligned row. (3) /org-chart Full View: fixed inset-0 z-[100] fullscreen dialog with gradient header, shared expand/collapse/search/selection state with the inline tree, body scroll lock + Esc-to-close, loading/empty states mirrored. (4) /dashboard hero row rebalanced hero(4)+LeaveDetails(4)+LeaveSummary(4); Leave Summary enriched with Pending Requests chip and Upcoming Approved Leave context row (real /api/leave data) so its height lines up with the hero card; Leave Details pie resized for the narrower column. Web-only UI change — zero API/auth/route changes, login page and APK download entry untouched. Tests pre-push: tsc --noEmit 0 errors on all touched files (repo fully clean post-rebase), eslint on the 4 touched files identical to baseline (51 pre-existing problems, 0 new).',
  }),
});
console.log('implement:', r.status, await r.text().then((t) => t.slice(0, 160)));

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
const mine = Array.isArray(reqs) ? reqs.find((x) => x.id === CR_ID) : null;
console.log('CR status:', mine ? `${mine.status} (deployCommit=${mine.deployCommit || '-'})` : 'not found');
