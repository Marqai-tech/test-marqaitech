/**
 * Task 133 — source contract check (no runtime): verifies every edit point
 * of the per-employee shift feature is in place.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, file, needles) {
  const src = fs.readFileSync(path.join('/home/z/my-project', file), 'utf8');
  const missing = needles.filter(n => !src.includes(n));
  if (missing.length === 0) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} — missing: ${missing.join(' | ')}`); }
}

check('lib: shift resolver exports', 'src/lib/attendance-shift.ts', [
  'export async function loadEmployeeShiftWindows',
  'export function shiftFullDayHours',
  'rotationUnit',
  'graceMinutes: Number.isFinite(shift.graceTime)',
]);
check('lib: auto-present exports dateKeyOf', 'src/lib/attendance-auto-present.ts', [
  'export function dateKeyOf',
]);
check('sync: per-employee late cutoff + finalize + full-day', 'src/lib/etimeoffice-sync.ts', [
  "import { loadEmployeeShiftWindows, shiftFullDayHours, type EmployeeShiftWindow } from '@/lib/attendance-shift';",
  'const shiftWindows = await loadEmployeeShiftWindows(tx as any,',
  'const lateCutoff = lateCutoffFor(empShift);',
  'const canFinalize = Boolean(checkOut && localMinutesFor(checkOut, timeZone) >= (empShift ? empShift.endMinutes : breakPolicy.shiftEndMinutes));',
  'const fullDayHours = empShift ? shiftFullDayHours(empShift) : 8;',
]);
check('attendance route: GET shiftWindows + POST shift rules', 'src/app/api/attendance/route.ts', [
  "import { loadEmployeeShiftWindows, shiftFullDayHours } from '@/lib/attendance-shift';",
  'const shiftWinMap = await loadEmployeeShiftWindows(db as any, photoIds);',
  'shiftWindows,',
  'const lateCutoff = empShift ? empShift.startMinutes + empShift.graceMinutes : 10 * 60;',
  'return hour * 60 + minute > lateCutoff;',
  'const finalizeMinutes = empShift ? empShift.endMinutes : breakPolicy.shiftEndMinutes;',
  'const fullDayHours = empShift ? shiftFullDayHours(empShift) : 8;',
  'Required_Hours: fullDayHours.toFixed(2),',
]);
check('punch route: shift-aware checkin/checkout', 'src/app/api/attendance/punch/route.ts', [
  "import { loadEmployeeShiftWindows, shiftFullDayHours } from '@/lib/attendance-shift';",
  'const empShift = (await loadEmployeeShiftWindows(db as any, [employeeId])).get(employeeId);',
  'const graceCutoff = empShift ? empShift.startMinutes + empShift.graceMinutes : 10 * 60;',
  'const canFinalize = attendanceLocalMinutes(refreshed.checkOut) >= (empShift ? empShift.endMinutes : breakPolicy.shiftEndMinutes);',
  'const fullDayHours = empShift ? shiftFullDayHours(empShift) : 8;',
]);
check('assignments API exists', 'src/app/api/shifts/assignments/route.ts', [
  'export async function GET',
  'export async function POST',
  'export async function DELETE',
  'ensureRosterTables',
  'employeeRosterAssignment.deleteMany({ where: { employeeId } })',
  "pattern: [shiftId],",
  "rotationUnit: 'day',",
]);
check('shifts page: assignment UI', 'src/app/(dashboard)/attendance/shifts/page.tsx', [
  'fetchAssignments',
  "apiFetch<{ message?: string }>('/api/shifts/assignments', { method: 'POST'",
  'handleUnassign',
  'Shift Assignments',
]);
check('attendance page: per-employee Late-by', 'src/app/(dashboard)/attendance/page.tsx', [
  'setShiftWindows(data.shiftWindows || {});',
  'parseHmMinutes(shiftWindows[a?.employeeId || r.emp?.id]?.start) ?? shiftStartMinutes',
  "const dEmpId = detailRecord.employee?.id || (detailRecord as { employeeId?: string }).employeeId || '';",
  'parseHmMinutes(shiftWindows[dEmpId]?.start) ?? shiftStartMinutes',
  'function parseHmMinutes',
]);
check('calculateLateBy intact', 'src/app/(dashboard)/attendance/page.tsx', [
  'const diffMins = checkInMinutes - shiftStartMinutes;',
]);

console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
