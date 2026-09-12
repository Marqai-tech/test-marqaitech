/**
 * Leave → Attendance synchronization.
 *
 * BUG FIX (2026-09 validation round): approved leave requests never showed
 * up in Attendance — nothing ever wrote the `on_leave` / `half_day` status
 * that the Attendance model already supported.
 *
 * This helper is called from every approval finalize path:
 *   - POST /api/leave        (AI auto-approve + short-leave auto-approve)
 *   - PATCH /api/leave/[id]  (legacy single-step approval)
 *   - advanceLeaveWorkflow() (multi-tier workflow final approval)
 *
 * Behavior:
 *   - Only WORKING days in the leave range get an attendance row (weekends
 *     and configured holidays are skipped — they are already non-working).
 *   - Days that already have a punch (checkIn/checkOut) are NEVER
 *     overwritten — an actual worked day wins over the leave mark.
 *   - Existing rows without a punch (e.g. `absent`) are updated to the
 *     leave status.
 */
import { computeWorkingDays, getHolidaysInRange, getWeekendDays, DEFAULT_WEEKEND_DOW } from './working-days';

export interface LeaveAttendanceSyncResult {
  created: number;
  updated: number;
  skippedWithPunch: number;
  dates: string[];
}

function dayStartUtc(value: Date | string): Date {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function syncAttendanceForLeave(
  db: any,
  params: {
    employeeId: string;
    startDate: Date | string;
    endDate: Date | string;
    halfDay?: boolean | null;
    leaveRequestId?: string;
    leaveTypeName?: string | null;
    weekendDow?: number[];
  },
): Promise<LeaveAttendanceSyncResult> {
  const empty: LeaveAttendanceSyncResult = { created: 0, updated: 0, skippedWithPunch: 0, dates: [] };
  const { employeeId, startDate, endDate, halfDay, leaveRequestId, leaveTypeName } = params;
  if (!employeeId || !startDate || !endDate) return empty;

  try {
    if (!db?.attendance) return empty;

    const weekendDow = params.weekendDow || DEFAULT_WEEKEND_DOW;
    const holidays = await getHolidaysInRange(db, startDate, endDate);
    const holidaySet = new Set(holidays.map(h => h.date));
    const walk = computeWorkingDays(startDate, endDate, weekendDow, holidaySet);
    if (walk.workingDates.length === 0) return empty;

    const rangeStart = dayStartUtc(walk.workingDates[0]);
    const rangeEnd = dayStartUtc(walk.workingDates[walk.workingDates.length - 1]);

    const existingRows = await db.attendance.findMany({
      where: { employeeId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true, date: true, checkIn: true, checkOut: true, status: true },
    });
    const existingByDay = new Map<string, { id: string; checkIn: Date | null; checkOut: Date | null; status: string }>();
    for (const row of existingRows || []) {
      existingByDay.set(new Date(row.date).toISOString().split('T')[0], row);
    }

    const desiredStatus = halfDay ? 'half_day' : 'on_leave';
    const leaveLabel = leaveTypeName ? `Leave (${leaveTypeName})` : 'Leave';
    const note = `${leaveLabel} approved${leaveRequestId ? ` — request ${leaveRequestId}` : ''}`;

    const result: LeaveAttendanceSyncResult = { created: 0, updated: 0, skippedWithPunch: 0, dates: [] };

    for (const dateStr of walk.workingDates) {
      const dayUtc = dayStartUtc(dateStr);
      const existing = existingByDay.get(dateStr);
      if (existing) {
        // Never clobber a real punch — the worked day wins.
        if (existing.checkIn || existing.checkOut) {
          result.skippedWithPunch++;
          continue;
        }
        if (existing.status === desiredStatus) {
          result.dates.push(dateStr);
          continue;
        }
        await db.attendance.update({
          where: { id: existing.id },
          data: { status: desiredStatus, notes: note },
        });
        result.updated++;
      } else {
        await db.attendance.create({
          data: {
            employeeId,
            date: dayUtc,
            status: desiredStatus,
            notes: note,
          },
        });
        result.created++;
      }
      result.dates.push(dateStr);
    }

    return result;
  } catch (err) {
    // Attendance sync must never break the approval operation.
    console.warn('[attendance-leave-sync] Failed (non-fatal):', err);
    return empty;
  }
}
