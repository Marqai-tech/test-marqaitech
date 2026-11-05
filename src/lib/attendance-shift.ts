/**
 * Task 133 — per-employee shift windows for attendance evaluation.
 *
 * Company-wide attendance rules (late cutoff, finalize/checkout threshold,
 * full-day hours) previously hardcoded a 10:00 late cutoff and the tenant's
 * AttendancePolicyConfig.shiftEndDefault (18:30). Employees on a DIFFERENT
 * shift (e.g. MARQ004 Shardh amma on 11:00–17:00) were wrongly marked late
 * / half-day / never finalized.
 *
 * The shift assignment reuses the EXISTING roster machinery —
 * RotationalRoster (pattern = ordered shift ids, rotationUnit 'day') +
 * EmployeeRosterAssignment — so the auto-present engine, this resolver and
 * the Shifts admin UI all agree on one source of truth. A roster whose
 * pattern holds a single shift acts as a plain fixed-shift assignment.
 *
 * Resolution for a date: assignment → pattern index (elapsed days from the
 * roster anchor, same math as attendance-auto-present.resolveShiftWindow)
 * → Shift.startTime/endTime/graceTime/breakDuration.
 */
import { dateKeyOf } from '@/lib/attendance-auto-present';

export interface EmployeeShiftWindow {
  startMinutes: number; // minutes from local midnight (e.g. 660 = 11:00)
  endMinutes: number;   // may exceed 1440 for cross-midnight shifts
  breakMinutes: number;
  graceMinutes: number; // late-in grace from the Shift row (default 15)
  name: string;
  rosterId: string;
  shiftId: string;
}

function parseHm(value: unknown, fallback: number): number {
  const s = String(value ?? '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return fallback;
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
}

function diffDays(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Resolve the shift window for each employee FOR TODAY (the day the caller
 * is evaluating — punches / checkout / status rules always run "now").
 * Returns a map with an entry ONLY for employees who have an active
 * assignment; callers fall back to the tenant-wide policy when absent.
 */
export async function loadEmployeeShiftWindows(
  db: any,
  employeeIds: string[],
  opts: { todayKey?: string } = {},
): Promise<Map<string, EmployeeShiftWindow>> {
  const out = new Map<string, EmployeeShiftWindow>();
  const ids = (employeeIds || []).filter(Boolean);
  if (!ids.length) return out;

  const todayKey = opts.todayKey || new Date().toISOString().slice(0, 10);

  try {
    const assignments = (await db.employeeRosterAssignment.findMany({
      where: { employeeId: { in: ids } },
      include: { roster: true },
    })) as Array<{
      employeeId: string;
      currentOffset: number;
      startDate: Date | string;
      endDate?: Date | string | null;
      roster: { id: string; isActive: boolean; pattern: unknown; rotationUnit: string; startDate: Date | string } | null;
    }>;

    // Latest-starting active assignment wins if several exist.
    const byEmployee = new Map<string, { assignment: (typeof assignments)[number]; startDateKey: string }>();
    for (const a of assignments) {
      if (!a.roster || a.roster.isActive === false) continue;
      if (a.endDate && dateKeyOf(a.endDate) && dateKeyOf(a.endDate)! < todayKey) continue;
      const startDateKey = dateKeyOf(a.startDate) || todayKey;
      const prev = byEmployee.get(a.employeeId);
      if (!prev || startDateKey > prev.startDateKey) byEmployee.set(a.employeeId, { assignment: a, startDateKey });
    }
    if (!byEmployee.size) return out;

    const shiftIds = new Set<string>();
    for (const { assignment } of byEmployee.values()) {
      const pattern = Array.isArray(assignment.roster?.pattern) ? (assignment.roster!.pattern as string[]) : [];
      for (const id of pattern) shiftIds.add(String(id));
    }
    if (!shiftIds.size) return out;

    const shifts = (await db.shift.findMany({
      where: { id: { in: [...shiftIds] } },
      select: { id: true, name: true, startTime: true, endTime: true, breakDuration: true, graceTime: true },
    })) as Array<{ id: string; name: string; startTime: string; endTime: string; breakDuration: number; graceTime: number }>;
    const shiftsById = new Map(shifts.map(s => [s.id, s]));

    for (const [employeeId, { assignment }] of byEmployee) {
      const pattern = Array.isArray(assignment.roster?.pattern) ? (assignment.roster!.pattern as string[]) : [];
      if (!pattern.length) continue;
      const unit = assignment.roster!.rotationUnit === 'day' ? 'day' : 'week';
      const anchor = dateKeyOf(assignment.roster!.startDate) || todayKey;
      const elapsed = Math.max(0, diffDays(anchor, todayKey));
      const step = unit === 'day' ? elapsed : Math.floor(elapsed / 7);
      const idx = (((assignment.currentOffset || 0) + step) % pattern.length + pattern.length) % pattern.length;
      const shift = shiftsById.get(String(pattern[idx]));
      if (!shift) continue;
      const startMinutes = parseHm(shift.startTime, 9 * 60);
      let endMinutes = parseHm(shift.endTime, 17 * 60 + 30);
      if (endMinutes <= startMinutes) endMinutes += 24 * 60; // cross-midnight
      out.set(employeeId, {
        startMinutes,
        endMinutes,
        breakMinutes: Number.isFinite(shift.breakDuration) ? Number(shift.breakDuration) : 60,
        graceMinutes: Number.isFinite(shift.graceTime) ? Number(shift.graceTime) : 15,
        name: shift.name,
        rosterId: assignment.roster!.id,
        shiftId: shift.id,
      });
    }
  } catch (e) {
    console.error('[attendance-shift] loadEmployeeShiftWindows failed:', e);
  }
  return out;
}

/** Full-day net production hours for a shift window (end − start − break), with a 15-min grace floor. */
export function shiftFullDayHours(win: EmployeeShiftWindow): number {
  return Math.max(0, (win.endMinutes - win.startMinutes - win.breakMinutes) / 60 - 0.25);
}
