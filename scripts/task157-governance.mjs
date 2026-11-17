// Task 157 — governance: register + approve BEFORE push.
// (Attendance Regularize month view + one-shot bulk update/regularize,
// Production Less Hours type, Company Policies & Handbook nav + module
// mapping, feed broadcast email + notification to all users.)
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
    title: 'Task 157 — Attendance Regularize month view + one-shot bulk actions, Production Less Hours type, Company Policies & Handbook wiring + module mapping, feed broadcast (email + notification to all users)',
    description:
      'User request: "attendance/regularize - no filters in this page. there is no option for the hr to check in the attendance module month view and update / regularize at one shot for single or multiple employees for payroll purpose. Also add the production less hours in the regularize apply. In company module there is not policies and handbook page to update the policies which is coming to the employee dashboard. also whatever we upload or update it here should come in that respective module... whenever i update or put any feed it should go as a email to all the employees and mobile notification should come for all the users." ' +
      'SHIPPED: (1) REGULARIZE PAGE (src/app/(dashboard)/attendance/regularize/page.tsx + NEW src/components/attendance/RegularizeMonthView.tsx): admin-only Month View grid (employees × days, muster-roll-style status cells P/A/L/H/Hd/W/Lv with punch times) with month navigation, department + status + employee-search filters; one-shot bulk actions on selected cells (click cells / row header selects whole employee / date header selects that day for everyone): "Direct Attendance Update" (HR override for payroll — writes Attendance, recomputes workHours, audit-logs each change via NEW POST /api/attendance/bulk-update, admin-only, UTC+IST-midnight matching, ≤400 cells) or "Raise Regularization Requests" (one regularize request per cell with concurrency 3, duplicates auto-skipped, live progress + per-item errors); requests table gains month/status/search filters. (2) PRODUCTION LESS HOURS: employee apply form relabelled to "Production Less Hours (worked under 8 hours)", option ADDED to the HR apply-by-hr regularize form (no time required, API already validates workHours<8), punch-type display labels humanised; FIXED a real approval bug — approving a production_shortfall request previously fell into the check_out branch and overwrote checkOut with the date midnight; now it only flips absent/half_day to present (no LOP) without fabricating punches. (3) COMPANY POLICIES & HANDBOOK: the existing /company/policies admin CRUD (full upload/version-history/ack-tracker) was unreachable — wired into sidebar nav (navData company section, moduleKey company), company sub-nav, and the Company Dashboard card; page retitled "Policies & Handbook" with a Module Mapping panel (category → module destinations: leave/attendance/travel/payroll/recruitment link to their module policy pages; hr/it/finance/work/safety/code_of_conduct → employee handbook) and an "Appears In" column; category select extended with travel/payroll/recruitment so every module can be fed from this single source of truth. (4) FEED BROADCAST: NEW src/lib/feed-broadcast.ts — every feed created or edited by a feed admin (HR/CEO/tenant-admin family) fans out to ALL active tenant users via the existing core_hr.announcement.published template (in-app notification = mobile app notifications sync + email via the tenant configured+verified SMTP), logged in NotificationDelivery; employee-created feeds do NOT broadcast (governance unchanged). ' +
      'Web-only — no schema migration, no APK rebuild (v1.8.0 (36) untouched). Tests pre-push: tsc --noEmit 1844 == git-stash baseline 1844 (0 new/0 gone); eslint on the 11 touched files 0 new problems (4 pre-existing baseline errors in legacy files, all 3 NEW files fully clean); all changed pages + API routes compile on the dev server; API suite (auth/regularize/employees/attendance) + real-browser walkthrough run post-deploy.',
    category: 'attendance',
    riskLevel: 'medium',
    module: 'Attendance',
    relatedModule: 'Company',
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
