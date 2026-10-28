import { localMinutesSinceMidnight, resolveTimezone } from '@/lib/timezone-utils';
import { todayInTimezone } from '@/lib/working-days';
import type { PrismaClient } from '@/generated/prisma/client';

type Db = PrismaClient;

export interface OvertimeValidationInput {
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  reason: unknown;
  employee: { id: string; companyId?: string | null; timezone?: string | null };
  excludeRequestId?: string;
}

export interface ValidatedOvertimeInput {
  date: Date;
  startTime: Date;
  endTime: Date;
  estimatedHours: number;
  dayStart: Date;
  dayEnd: Date;
  timezone: string;
  reason: string;
}

function dateString(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]
    ? null
    : match[1];
}

function calendarDateAfter(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function zonedParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Convert a tenant-local calendar date/time to an instant without relying on the server timezone. */
function localDateTimeToUtc(date: string, time: string, timezone: string): Date | null {
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch) return null;
  const [year, month, day] = date.split('-').map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;

  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetWallTime;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const local = zonedParts(new Date(guess), timezone);
      const representedWallTime = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, 0);
      const correction = targetWallTime - representedWallTime;
      if (correction === 0) return new Date(guess);
      guess += correction;
    }
    const final = zonedParts(new Date(guess), timezone);
    if (final.year !== year || final.month !== month || final.day !== day || final.hour !== hour || final.minute !== minute) return null;
    return new Date(guess);
  } catch {
    return null;
  }
}

/** Start of a local calendar date as a UTC instant (works across timezone offsets and DST). */
function localDayStart(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  let guess = targetWallTime;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const local = zonedParts(new Date(guess), timezone);
      const representedWallTime = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, 0);
      const correction = targetWallTime - representedWallTime;
      if (correction === 0) return new Date(guess);
      guess += correction;
    }
    return new Date(guess);
  } catch {
    return new Date(targetWallTime);
  }
}

export function overtimeAttendanceDayBounds(date: Date, timezone: string) {
  const dateText = date.toISOString().slice(0, 10);
  return {
    start: localDayStart(dateText, timezone),
    end: localDayStart(calendarDateAfter(dateText), timezone),
  };
}

function parseRequestTime(value: unknown, date: string, timezone: string): Date | null {
  const raw = String(value ?? '').trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return localDateTimeToUtc(date, raw, timezone);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function validateOvertimeRequest(
  db: Db,
  input: OvertimeValidationInput,
): Promise<{ error: string; status: number } | { value: ValidatedOvertimeInput }> {
  const dateText = dateString(input.date);
  if (!dateText) return { error: 'Invalid date format', status: 400 };

  const company = input.employee.companyId
    ? await db.company.findUnique({ where: { id: input.employee.companyId }, select: { timezone: true } }).catch(() => null)
    : null;
  const timezone = resolveTimezone([input.employee, company]);
  if (dateText > todayInTimezone(timezone)) {
    return { error: 'Overtime cannot be requested for a future date.', status: 422 };
  }

  const startTime = parseRequestTime(input.startTime, dateText, timezone);
  const endTime = parseRequestTime(input.endTime, dateText, timezone);
  if (!startTime) return { error: 'Invalid start time format — select the start time again', status: 400 };
  if (!endTime) return { error: 'Invalid end time format — select the end time again', status: 400 };
  if (endTime <= startTime) return { error: 'End time must be after start time', status: 422 };

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) return { error: 'Reason is required', status: 400 };

  const durationHours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
  const estimatedHours = Math.round(durationHours * 100) / 100;
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
    return { error: 'Enter a valid overtime duration greater than zero.', status: 422 };
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);
  const calendarDayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const dayStart = localDayStart(dateText, timezone);
  const dayEnd = localDayStart(calendarDateAfter(dateText), timezone);
  const activeStatuses = { in: ['pending', 'approved', 'auto_approved'] };

  const approvedLeave = await db.leaveRequest.findFirst({
    where: { employeeId: input.employee.id, status: 'approved', startDate: { lt: calendarDayEnd }, endDate: { gte: date } },
    select: { id: true },
  });
  if (approvedLeave) return { error: 'Overtime cannot be requested on a date with approved leave', status: 422 };

  const attendance = await db.attendance.findFirst({
    where: { employeeId: input.employee.id, date: { gte: dayStart, lt: dayEnd } },
    select: { status: true, checkIn: true, checkOut: true },
  });
  if (!attendance || ['absent', 'on_leave', 'holiday', 'weekend'].includes(String(attendance.status || '').toLowerCase())) {
    return { error: 'Overtime cannot be requested because the employee is absent or has no attendance record for the selected date', status: 422 };
  }
  if (!attendance.checkIn || !attendance.checkOut) {
    return { error: 'OT cannot be requested without the required attendance check-in and check-out. Complete both punches for the selected date and try again.', status: 422 };
  }

  const policy = await db.attendancePolicyConfig.findFirst({
    where: { OR: [{ companyId: input.employee.companyId || null }, { companyId: null }] },
    orderBy: { updatedAt: 'desc' },
    select: { shiftStartDefault: true, shiftEndDefault: true },
  }).catch(() => null);
  const configuredShiftStart = policy?.shiftStartDefault === '09:00' ? '09:30' : (policy?.shiftStartDefault || '09:30');
  const configuredShiftEnd = policy?.shiftEndDefault === '17:30' ? '18:30' : (policy?.shiftEndDefault || '18:30');
  const toMinutes = (value: string | null | undefined, fallback: number) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value || '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const shiftStartMinutes = toMinutes(configuredShiftStart, 9 * 60 + 30);
  const shiftEndMinutes = toMinutes(configuredShiftEnd, 18 * 60 + 30);
  const startMinutes = localMinutesSinceMidnight(startTime, timezone);
  const endMinutes = localMinutesSinceMidnight(endTime, timezone);
  if (startMinutes < shiftEndMinutes && endMinutes > shiftStartMinutes) {
    return { error: `Overtime must be outside scheduled working hours (${configuredShiftStart}–${configuredShiftEnd})`, status: 422 };
  }

  const duplicateOrOverlap = await db.overtimeRequest.findFirst({
    where: {
      employeeId: input.employee.id,
      date: { gte: date, lt: calendarDayEnd },
      status: activeStatuses,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(input.excludeRequestId ? { id: { not: input.excludeRequestId } } : {}),
    },
    select: { id: true },
  });
  if (duplicateOrOverlap) {
    return { error: 'An overtime request already exists or overlaps this time range for the selected date', status: 409 };
  }

  const permissionOverlap = await db.hourlyPermission.findFirst({
    where: { employeeId: input.employee.id, date: { gte: date, lt: calendarDayEnd }, status: activeStatuses, startTime: { lt: endTime }, endTime: { gt: startTime } },
    select: { id: true },
  }).catch(() => null);
  if (permissionOverlap) {
    return { error: 'Overtime cannot overlap an existing permission request for the selected date and time', status: 409 };
  }

  const attendanceRequests = await db.attendanceRequest.findMany({
    where: {
      employeeId: input.employee.id,
      requestType: 'HOURLY_PERMISSION',
      status: { notIn: ['rejected', 'cancelled'] },
      startDate: { gte: date, lt: calendarDayEnd },
    },
    select: { payload: true },
  }).catch(() => []);
  const permissionRequestOverlap = attendanceRequests.some((row: { payload: unknown }) => {
    try {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const details = payload as Record<string, unknown> | null;
      if (details?.subtype === 'OVERTIME' || (input.excludeRequestId && details?.legacyOvertimeId === input.excludeRequestId)) return false;
      const payloadStart = new Date(String((payload as Record<string, unknown>)?.startTime || ''));
      const payloadEnd = new Date(String((payload as Record<string, unknown>)?.endTime || ''));
      return !Number.isNaN(payloadStart.getTime()) && !Number.isNaN(payloadEnd.getTime()) && payloadStart < endTime && payloadEnd > startTime;
    } catch {
      return false;
    }
  });
  if (permissionRequestOverlap) {
    return { error: 'Overtime cannot overlap an existing permission request for the selected date and time', status: 409 };
  }

  if (startTime < attendance.checkOut && endTime > attendance.checkIn) {
    return { error: 'Overtime cannot overlap the employee attendance time for the selected date', status: 409 };
  }

  return { value: { date, startTime, endTime, estimatedHours, dayStart, dayEnd, timezone, reason } };
}
