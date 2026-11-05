// Task 168 close-out — implement CR cmvt59695000008l2a1goebez with E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.log('LOGIN FAILED', login.status); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

const id = 'cmvt59695000008l2a1goebez';
const evidence = [
  'DEPLOY: commit f0c0a2cc (Task 168, rebased over parallel Task 167b commits db2f890c/e12a323e) pushed and LIVE on marqaitechgroup.3boxeshrms.com at 2026-10-29 06:23 UTC — new routes flip from edge-404/405 to the 401 JSON contract.',
  'E2E 20/20 PASS on production (scripts/task168-e2e.cjs):',
  '(1) VISIBILITY+RECONCILIATION — GET /api/payroll/attendance-reconciliation?month=2026-09 returned 9 employee rows; MARQ015 Syed Shazeb Ahamed: payrollLopDays=2, liveLopDays=2 (absent=1, halfDay=2), paidDays=28, match=true — the exact invisible breakdown the user reported (2 production-hours half-days Sep 1 7.75h + Sep 16 7.87h + absent Sep 17) is now computed, displayed and reconciled; payslip detail renders the LOP Breakdown panel; month-view cells show hours/notes/reason; records table shows notes.',
  '(2) DUTY ROSTER — GET /api/attendance/duty-roster?month=2026-10 resolved a 12-employee x 31-day calendar from 3 tenant shifts (policy-default rows for unassigned); PATCH single-day override applied (assignment cmvt5ruk7000308l59iubooox) and DELETE cleaned it up; POST/PATCH/DELETE audited as shift_change.',
  '(3) CORRECTIONS — POST /api/payroll/attendance-corrections JSON apply for MARQ015 2026-09-02 (same values, verification note): {applied:1, failed:0, notified:true}; audit trail GET lists the payroll_correction entry (reason "Task 168 E2E verification"); NotificationDelivery fanned out email 3/3 sent + in_app 3/3 sent to HR/Admin (no circuit-breaker this time).',
  '(4) NOTICE PERIOD — GET /api/employees/resignation?status=approved 200 (0 approved resignations in tenant — tracker shows its empty state); /employees/notice-period page live (auth page 200, 41.9KB shell, no redirect).',
  '(5) PAGES LIVE — /payroll/attendance-corrections, /payroll/attendance-reconciliation, /attendance/duty-roster all 200 with real app shells under authenticated cookie fetch; unauthenticated anon GET on all three new APIs = 401.',
  'VALIDATION: tsc 1843 total, zero errors in all touched files (below the 1868 recorded baseline); eslint identical to pristine baseline on modified files, 0 errors on the 10 new files; nav entries added in attendance+payroll+employees sections; 4 employee-denied roleAccess prefixes.',
].join(' ');

const r = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ action: 'implement', deployCommit: 'f0c0a2cc', evidence }),
});
const j = await r.json().catch(() => ({}));
console.log('implement:', r.status, JSON.stringify(j).slice(0, 160));
