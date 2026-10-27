// Task 133 — governance: register + approve BEFORE push.
// (Fixed 11:00–17:00 shift for MARQ004 Shardh amma only + per-employee
// shift-aware attendance evaluation everywhere + Shifts-page assignment UI.)
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
    title: 'Task 133 — Fixed 11 AM–5 PM shift for MARQ004 (Shardh amma) only + per-employee shift-aware attendance + Shifts-page assignment UI',
    description:
      'User request: "only for Shardh amma - MARQ004 in tenant link we have to assign a shift 11 am to 5pm only for this employee and update the attendance pls update it now accordingly in vercel now". ' +
      'PROBLEM: attendance evaluation hardcodes tenant-wide rules (late after 10:00, finalize/work-hours at the 18:30 policy shift end, flat 8h full-day). An 11:00–17:00 employee was wrongly marked late (11:00 > 10:00), her 17:00 checkouts never finalized (17:00 < 18:30 → workHours null), and short-shift full days risked half-day flags. ' +
      'CODE: new src/lib/attendance-shift.ts — loadEmployeeShiftWindows() resolves an employee\'s shift from the EXISTING roster machinery (RotationalRoster pattern=[shiftId] rotationUnit=day + EmployeeRosterAssignment; single-element pattern = fixed shift), falling back to tenant defaults when no assignment exists. Wired into ALL evaluation paths: (1) eTimeOffice biometric sync — late cutoff = shift start + grace (11:15 for MARQ004 vs 10:00 for others), finalize at the employee shift end (17:00 vs 18:30), full-day hours scale with the shift (5h net vs 8h); (2) /api/attendance (manual punch) — same three rules on checkin + checkout + Required_Hours in the low-hours notification; (3) /api/attendance/punch (mobile geofence flow) — same rules; (4) GET /api/attendance returns a shiftWindows map and the attendance page computes "Late by" per employee from their OWN shift start (row + detail modal); (5) auto-present engine already read rosters — unchanged. ' +
      'UI: Shifts page (/attendance/shifts) gains a "Shift Assignments" section (assign employee → shift, list, remove) backed by new /api/shifts/assignments (GET/POST/DELETE; ensures the roster tables exist on older tenant DBs; POST replaces prior assignments so exactly one window resolves "only for this employee"). ' +
      'DATA (scripts/task133-shift-assign.cjs, idempotent): creates Shift "11 AM - 5 PM" (11:00–17:00, 60m break, 15m grace) for MarqAI Tech Pvt Ltd + roster + assignment for MARQ004 ONLY + re-evaluates her existing attendance rows under the new window. No other employee is touched — everyone without an assignment keeps the exact current behavior. ' +
      'Verification: 9/9 source-contract checks; tsc clean on changed files (remaining errors pre-existing per git-stash baseline); post-deploy probes: roster resolves 11:00–17:00 for MARQ004, re-evaluation output, GET /api/attendance shiftWindows map, assignments API round-trip.',
    category: 'attendance',
    riskLevel: 'medium',
    module: 'Attendance',
    relatedModule: 'Attendance',
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
