// Task 140 — governance: register + approve BEFORE push.
// (Employee list selected-row export fix: ticking employee checkbox(es) and
// clicking Export now downloads ONLY the selected employees — previously the
// whole filtered list was always downloaded. Web-only fix, no APK needed.)
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
    title: 'Task 140 — Employee list export: honour single/multi checkbox selection (selected rows only) instead of always exporting every employee',
    description:
      'User request: "In the employee list when i select any one single employee and export it, the download is happening for all employees instead of single employee which was selected in the excel sheet. pls update it in vercel now." ' +
      'IMPLEMENTATION: (1) CLIENT — handleExportCSV (src/app/(dashboard)/employees/page.tsx) now checks the checkbox selection first: when selectedIds is non-empty the export fetch sends ?ids=<selected ids> and SKIPS the search/department/designation/status filters (the user picked exact rows); the download is named employees-selected-<date>.csv and the success toast reports "CSV exported — N selected employee(s)". With NO selection the export keeps the existing behaviour: it honours the active list filters and downloads the filtered list as employees-<date>.csv. (2) SERVER — GET /api/employees accepts a new ?ids= comma-separated parameter (deduped, trimmed, capped at 500): when present, the where clause is exactly { id: { in: ids } } and the list filters (search/department/designation/status) are bypassed; ALL scoping still applies (JWT auth gate, company scope, super-admin tenant switcher scope, self-scope for employee role, management exclusion) so hand-crafted ids can never widen what the caller is allowed to see. Web-only fix — no mobile screen touched, no APK rebuild, version stays 1.6.5 (32). Tests: task140-contract-check 15/15; scoped tsc (tsconfig.task140.json) vs git-stash baseline = ZERO new errors (66 total before and after, 10 pre-existing in the two touched files).',
    category: 'employee_module',
    riskLevel: 'low',
    module: 'Employee Management',
    relatedModule: 'Reports & Export',
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
