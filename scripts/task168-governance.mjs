// Task 168 — governance: register + approve BEFORE push.
// Batch: half-day/LOP visibility + payroll-attendance reconciliation +
// payroll attendance corrections (upload/punch/audit/email) + notice period
// tracker + dynamic duty roster.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.log('LOGIN FAILED', login.status); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 168 — LOP/half-day visibility + payroll-attendance reconciliation + payroll attendance corrections (upload/punch/audit/email) + notice period tracker + dynamic duty roster',
    description:
      'User request: "attendance showed 1 LOP for Syed but payroll showed 2 LOP because of 2 half days marked because of production hours less — these details are not shown in the HR/admin login; build payroll and attendance reconciliation in both modules; give manual attendance excel upload / punch attendance in the payroll module with email notification to admin/HR and logs in the payroll module for audit; give notice period tracker in the employee module; build a dynamic automatic/manual duty roster in attendance schedulable for year/month/week/day." ' +
      'ROOT CAUSE (proven on prod): Syed MARQ015 Sep payroll LOP 2.0 = absent 2026-09-17 (1.0) + half-days Sep 1 (7.75h) and Sep 16 (7.87h) at 0.5 each, marked automatically by the under-8-hours production rule — but their Attendance.notes only say "Team Office biometric sync (Task 126 backfill)", the regularize month-view cells showed just an "H" with punch times, the records table had no note column and the payslip showed only "LOP Days: 2" with no per-day breakdown, so HR could never see WHY the half-days existed. ' +
      'FIX (5 features, web-only, no schema change): (1) VISIBILITY — RegularizeMonthView cells now show work-hours + notes + "Production Less Hours (worked Xh of 8h)" tooltip + ½h marker on short half-days; attendance records table renders truncated notes under the status badge (title tooltip, both tables); payslip detail gains a LOP Breakdown panel listing every contributing day (Date | Status | weight 1.0/0.5 | work hours | note) with total vs payslip LOP. (2) RECONCILIATION — new GET /api/payroll/attendance-reconciliation?month=YYYY-MM compares each employee\'s frozen Payroll.lopDays/attendanceJson with LIVE attendance rows (lop = absent + 0.5×half_day, monthWindow convention from payroll-engine), mismatches first; new page /payroll/attendance-reconciliation (month picker, StatCards, match chips, fix-it callout pointing to Regularize month view + payroll reprocess) with nav entries in BOTH payroll and attendance sections. (3) PAYROLL ATTENDANCE CORRECTIONS — new POST /api/payroll/attendance-corrections accepts multipart xlsx (Employee Code/Date/Check In/Check Out/Status/Note, xlsx lib) or JSON single punch; resolves employee by code; locates the existing row via the IST dual-convention day lookup (never duplicates); upserts with buildIstTimestamp wall times, workHours recompute, punchMethod manual, notes append; writes AttendanceAuditLog action payroll_correction with before/after; fans out ONE dispatchToRoles email+in-app (new event payroll.attendance_corrected, roles hr_admin/admin/tenant_admin/ceo); GET returns the audit trail; new page /payroll/attendance-corrections with Manual Punch form, Excel Upload (per-row results) and Audit Trail panel with before/after diff viewer. (4) NOTICE PERIOD TRACKER — new page /employees/notice-period over the raw-SQL Resignation table (approved + LWD >= today = under notice): StatCards (Under Notice / Relieving This Week / Notice Waived / Applied Pending), table with days remaining + progress bars + status chips, GET /api/employees/resignation extended with status/employeeId filters; new shared lib src/lib/notice-period.ts; 5th KPI StatCard Under Notice Period on the employees dashboard (hidden on 403) and a Notice Period SectionCard in the employee detail Employment tab (only when a record exists). (5) DUTY ROSTER — new GET/POST/PATCH/DELETE /api/attendance/duty-roster: weekly Mon..Sun shift pattern per employee (rotationUnit day, Monday-anchored roster, currentOffset=0 so day-one resolves to pattern[weekdayIndex(startDate)]), effective ranges day/week/month/year (cap 400d), latest-startDate-wins keeps history; PATCH = single-day manual override (1-day roster expiring same day), DELETE removes an assignment; audit action shift_change; new page /attendance/duty-roster with month employees×days calendar grid (per-shift colored chips, weekend tint), Auto-Schedule panel (multi-employee + weekday mapping + range presets) and click-to-override manual mode. ' +
      'Verification: tsc 1843 total with ZERO errors in all touched files (below the 1868 recorded baseline); eslint counts identical to pristine baseline on every modified file and 0 errors on all 10 new files; runtime E2E on production after deploy (reconciliation API on Sep 2026 must flag Syed MARQ015 payrollLop 2.0 vs live 2.0, corrections POST must apply+audit+notify, duty-roster GET must resolve his Sep pattern, notice tracker must list any approved resignations).',
    category: 'feature',
    riskLevel: 'medium',
    module: 'Attendance',
    relatedModule: 'Payroll, Employees',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || JSON.stringify(d).slice(0, 200));

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status, JSON.stringify(await ap.json().catch(() => ({}))).slice(0, 120));
}
