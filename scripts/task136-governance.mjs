// Task 136 — governance: register + approve BEFORE push.
// (A) Employee module gains an ORIGINAL BIRTHDAY field (the real birth date;
//     Date of Birth stays the official as-per-records value) on web add/edit/
//     view, the APIs and the mobile add form + detail.
// (B) The self-service dashboard (web + mobile) gains a Birthdays section fed
//     by originalBirthday with "Send Wishes" for EVERY login (small greetings
//     card: bell + festive email, one per sender per year).
// (C) The system greets birthday employees AUTOMATICALLY every morning via a
//     Vercel cron (one auto greeting per employee per year).
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
    title: 'Task 136 — Original Birthday field + Birthdays dashboard section with Send Wishes (all logins) + automatic daily birthday greetings cron',
    description:
      'User request: "add a field in the add/view/edit employee module - original birthday date apart from the date of birth which is already available but it is as per records. Build a screen or section in the employee self service dashboard for birthdays and show the birthdays for that day taking it from the original birthday date. Also give option to send wishes from the dashboard for that employee from all the user logins so that a greetings card small one will be sent to that employee automatically. Also the system should send automatically the greeting card to that employees whose birthday falls on that particular day". ' +
      'IMPLEMENTATION — (A) Employee.originalBirthday DateTime? (additive, applied to platform + demo + marqaitechgroup, scripts/task136-schema.cjs 3/3 VERIFIED) + BirthdayGreeting ledger (employeeId+year+source+senderUserId unique) with runtime self-healing DDL; POST /api/employees persists it, PUT /api/employees/[id] updates it (with employee-change-log label), web add/edit form gains the date input beside Date of Birth ("Real birth date for birthday wishes — Date of Birth stays as per records") with edit prefill, both employee detail views show it, mobile EmployeeModel parses it, the mobile Add Employee form gains a date picker and the detail screen a cake tile. ' +
      '(B) GET /api/birthdays (any authenticated user) returns today + next-45-days celebrants computed on IST month/day from originalBirthday with per-employee wish counts and wishedByMe; the web self-service dashboard mounts a BirthdaysCard (today list with Send Wishes + upcoming chips) and the mobile home gains the same card; POST /api/birthdays/wish {employeeId} is open to ALL logged-in users, guarded to the birthday day (IST), idempotent per sender per year (alreadyWished), and delivers a small festive greeting-card email + an in-app bell notification via shared src/lib/birthday-greetings.ts (deliverBirthdayGreeting). ' +
      '(C) GET/POST /api/cron/birthday-greetings (Vercel cron 30 2 * * * = 08:00 IST; CRON_SECRET bearer or admin-JWT single-tenant mode) sweeps every active dedicated tenant DB and sends exactly ONE automatic greeting (row source=\'auto\' dedupe + email + bell) per employee per year. ' +
      'No APK behavior change beyond the new fields/card. APK v1.6.4 (31) built (permanent key 590a456e…3749c), version chain synced. Tests: scripts/task136-contract-check.cjs 33/33; flutter analyze 0 errors on changed files; scoped tsc 51==51 vs stash baseline (0 new).',
    category: 'feature',
    riskLevel: 'low',
    module: 'Employees',
    relatedModule: 'Dashboard & Mobile App',
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
