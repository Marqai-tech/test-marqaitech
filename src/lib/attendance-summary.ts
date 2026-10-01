/**
 * Attendance Rate — single source of truth for the Employee Home / ESS
 * Dashboard "Attendance Rate" card.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The old card called `/api/attendance?limit=30`, which returns the employee's
 * last 30 records — those records can span multiple months, ignore absent
 * (never-punched) days, and inflate the rate to 100% whenever every row that
 * exists is `present`/`late`. The denominator was "number of attendance rows"
 * instead of "number of working days in the month".
 *
 * WHAT THIS DOES
 * ──────────────
 * `computeMyAttendanceSummary()` walks the calendar from the 1st of the
 * requested month up to and including TODAY (in the tenant/employee timezone)
 * and classifies every calendar day:
 *
 *   - Weekly off (per Setting table, default Sat+Sun)        → not a working day
 *   - Company holiday (Holiday table, non-elective types)     → not a working day
 *   - Attendance row with status `holiday` or `weekend`      → not a working day
 *   - Attendance row with status `on_leave` (approved leave)  → not a working day
 *   - Otherwise                                                → working day
 *       · Attendance `present` or `late`   → attended +1.0
 *       · Attendance `half_day`            → attended +0.5
 *       · Attendance `absent` or no row    → attended +0   (still in denominator)
 *
 *   Attendance Rate = attended / workingDays × 100, rounded to 1 decimal.
 *   If workingDays === 0, `attendanceRate` is `null` (caller shows "—").
 *
 * DATA SOURCES
 * ────────────
 *   - Timezone: Employee.timezone → Company.timezone → Tenant.timezone
 *                → fallback "Asia/Kolkata".
 *   - Weekly offs: Setting table keys `attendance_weekend_saturday`,
 *                  `attendance_weekend_sunday`, `attendance_weekendDays`.
 *                  Company-level overrides tenant-wide. Default Saturday + Sunday.
 *                  Shift / Roster weekly-off config does NOT exist as a
 *                  per-employee field in the Prisma schema.
 *   - Holidays: Holiday rows for the employee's companyId (Holiday.companyId
 *                is non-nullable in schema.prisma), with type IN ('public',
 *                'company','national','country'). Optional/elective holidays
 *                are excluded.
 *   - Approved leave: Attendance rows with status `on_leave` (written by
 *                `syncAttendanceForLeave()` in attendance-leave-sync.ts when
 *                a LeaveRequest is approved). Live source — updates
 *                immediately after a regularization.
 *
 * STORAGE TOLERANCE
 * ──────────────────
 *   Attendance.date / Holiday.date are stored as UTC DateTime but may represent
 *   either UTC midnight (`2026-10-07T00:00:00.000Z`) or local-tz midnight
 *   (e.g. for Asia/Kolkata: `2026-09-30T18:30:00.000Z`). Each stored Date is
 *   converted to its LOCAL calendar day via Intl.DateTimeFormat, so both
 *   conventions map to the correct local day. Month boundaries are respected:
 *   a Sep 30 record never counts in October.
 */

import { resolveTimezone } from '@/lib/timezone-utils';
import { getWeekendDays } from '@/lib/working-days';
import { withSchemaSync } from '@/lib/schema-sync';

/** Status strings used by the Attendance model. */
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
  | 'holiday'
  | 'weekend'
  | 'on_leave'
  | string;

export interface AttendanceSummaryInput {
  /** Prisma client routed to the correct tenant DB (from getDb(request)). */
  db: any;
  /** The logged-in employee's row id (NOT a user-supplied param). */
  employeeId: string;
  /** The employee's companyId, used to scope Holiday rows. May be null. */
  companyId: string | null;
  /** Optional tenantId for the Setting lookup. */
  tenantId?: string | null;
  /**
   * Month to compute, in `YYYY-MM` form. Defaults to the current month in the
   * resolved timezone. Future months return zero working days.
   */
  month?: string | null;
  /**
   * Timezone override (IANA). If absent, the helper resolves it from
   * Employee → Company → Tenant → "Asia/Kolkata".
   */
  timezone?: string | null;
}

export interface AttendanceSummaryResult {
  /** `YYYY-MM` of the month this summary covers. */
  month: string;
  /** IANA timezone used to compute "today" and the day boundaries. */
  timezone: string;
  /** Inclusive start (YYYY-MM-DD). */
  periodStart: string;
  /** Inclusive end (YYYY-MM-DD). */
  periodEnd: string;
  /** Calendar working days in the period (weekends/holidays/on_leave excluded). */
  workingDays: number;
  /** # of attendance rows with status `present`. */
  present: number;
  /** # of attendance rows with status `late`. */
  late: number;
  /** # of attendance rows with status `half_day`. */
  halfDay: number;
  /** # of working days with status `absent` OR no attendance row. */
  absent: number;
  /** # of attendance rows with status `on_leave` (approved leave). */
  onLeave: number;
  /** # of attendance rows with status `holiday`. */
  holidays: number;
  /** # of attendance rows with status `weekend`. */
  weekend: number;
  /** present + late + 0.5 × halfDay (within working days). */
  attendedDays: number;
  /** Rate = attendedDays / workingDays × 100, rounded to 1 dp. `null` if workingDays === 0. */
  attendanceRate: number | null;
  /** Source of the timezone resolution, for debugging / audit. */
  timezoneSource: 'employee' | 'company' | 'tenant' | 'fallback';
  /** Weekly-off days of week actually used (0=Sun … 6=Sat). */
  weekendDowUsed: number[];
}

/** Returns true for a status that means "approved leave" (excluded from working days). */
function isOnLeave(status: string | null | undefined): boolean {
  return status === 'on_leave';
}

/** Validate and parse a `YYYY-MM` string into { year, month (1-indexed) }. */
function parseMonthParam(month: string | null | undefined): { year: number; month: number } | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (m < 1 || m > 12) return null;
  return { year, month: m };
}

/** Returns the day-of-month of the last calendar day of (year, month). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Format a Date as YYYY-MM-DD in the given IANA timezone (local calendar day). */
function toLocalDayStr(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
}

/** Day-of-week (0=Sun … 6=Sat) of `d` in the given IANA timezone. */
function localDow(d: Date, tz: string): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
  } catch {
    return d.getUTCDay();
  }
}

/**
 * Walk calendar days [start, end] (inclusive, YYYY-MM-DD) in the given tz and
 * classify each as working / weekend / holiday. Local-tz-aware replacement for
 * `computeWorkingDays()` from working-days.ts (that helper uses getUTCDay()
 * which is wrong for any non-UTC tz).
 */
function walkLocalWorkingDays(
  startDayStr: string,
  endDayStr: string,
  weekendDow: number[],
  holidaySet: Set<string>,
  tz: string,
): { workingDates: string[]; weekendDates: string[]; holidayDates: string[] } {
  const weekendSet = new Set(weekendDow);
  const workingDates: string[] = [];
  const weekendDates: string[] = [];
  const holidayDates: string[] = [];
  const [sy, sm, sd] = startDayStr.split('-').map(Number);
  const [ey, em, ed] = endDayStr.split('-').map(Number);
  // Noon UTC lands on the same calendar day for every offset from UTC-11 to UTC+11.
  const cursor = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  if (isNaN(cursor.getTime()) || isNaN(end.getTime())) {
    return { workingDates, weekendDates, holidayDates };
  }
  let guard = 0;
  while (cursor <= end && guard < 4000) {
    guard++;
    const dateStr = toLocalDayStr(cursor, tz);
    const dow = localDow(cursor, tz);
    if (weekendSet.has(dow)) {
      weekendDates.push(dateStr);
    } else if (holidaySet.has(dateStr)) {
      holidayDates.push(dateStr);
    } else {
      workingDates.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { workingDates, weekendDates, holidayDates };
}

/**
 * Resolve the timezone to use, in priority order:
 *   1. Caller-provided override
 *   2. Employee.timezone
 *   3. Company.timezone
 *   4. Tenant.timezone
 *   5. "Asia/Kolkata" fallback (MarqAI's default)
 */
async function resolveTz(
  db: any,
  employeeId: string,
  companyId: string | null,
  tenantId: string | null,
  override?: string | null,
): Promise<{ tz: string; source: 'employee' | 'company' | 'tenant' | 'fallback' }> {
  const FALLBACK = 'Asia/Kolkata';
  if (override && override.trim()) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: override, year: 'numeric' });
      return { tz: override, source: 'employee' };
    } catch {
      // fall through
    }
  }
  try {
    let empTimezone: string | null | undefined = undefined;
    try {
      const emp: any = await withSchemaSync(() => db.employee.findUnique({
        where: { id: employeeId },
        select: { timezone: true, companyId: true },
      }));
      empTimezone = emp?.timezone;
      if (emp?.companyId && !companyId) companyId = emp.companyId;
    } catch {
      empTimezone = null;
    }
    if (typeof empTimezone === 'string' && empTimezone.trim()) {
      const resolved = resolveTimezone([{ timezone: empTimezone }]);
      if (resolved && resolved !== 'UTC') {
        return { tz: resolved, source: 'employee' };
      }
    }
    const cid = companyId;
    if (cid) {
      const company = await db.company.findUnique({
        where: { id: cid },
        select: { timezone: true, tenantId: true },
      });
      const cResolved = resolveTimezone([company]);
      if (cResolved && cResolved !== 'UTC' && company?.timezone) {
        return { tz: cResolved, source: 'company' };
      }
      const tid = tenantId || company?.tenantId || null;
      if (tid) {
        const tenant = await db.tenant.findUnique({
          where: { id: tid },
          select: { timezone: true },
        });
        const tResolved = resolveTimezone([tenant]);
        if (tResolved && tResolved !== 'UTC' && tenant?.timezone) {
          return { tz: tResolved, source: 'tenant' };
        }
      }
    }
  } catch {
    // fall through to fallback
  }
  return { tz: FALLBACK, source: 'fallback' };
}

/** Today's date as YYYY-MM-DD in the given tz. */
function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Fetch non-elective holidays for [start, end] (inclusive) filtered to the
 * employee's companyId. Returns a Set of YYYY-MM-DD strings (LOCAL calendar day).
 */
async function fetchCompanyHolidays(
  db: any,
  startDayStr: string,
  endDayStr: string,
  companyId: string | null,
  tz: string,
): Promise<{ set: Set<string>; count: number }> {
  const empty = { set: new Set<string>(), count: 0 };
  if (!companyId) return empty;
  try {
    if (!db?.holiday) return empty;
    // Widen the query range by ±1 day to absorb any tz offset (max ±14h).
    const utcStart = new Date(`${startDayStr}T00:00:00.000Z`);
    const utcEndExclusive = new Date(`${endDayStr}T00:00:00.000Z`);
    utcEndExclusive.setUTCDate(utcEndExclusive.getUTCDate() + 1);
    const rangeStart = new Date(utcStart.getTime() - 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(utcEndExclusive.getTime() + 24 * 60 * 60 * 1000);
    const rows = await withSchemaSync(() => db.holiday.findMany({
      where: {
        companyId,
        date: { gte: rangeStart, lt: rangeEnd },
        type: { in: ['public', 'company', 'national', 'country'] },
        isOptional: false,
      },
      select: { date: true, name: true },
    }));
    const set = new Set<string>();
    const rowList: any[] = Array.isArray(rows) ? rows : [];
    for (const r of rowList) {
      // Convert each holiday's stored UTC instant to its LOCAL calendar day.
      // For UTC-midnight storage (2026-10-07T00:00:00Z) in IST → '2026-10-07'.
      // For IST-midnight storage (2026-10-06T18:30:00Z) in IST → '2026-10-07'.
      const d = r.date instanceof Date ? r.date : new Date(r.date);
      if (isNaN(d.getTime())) continue;
      set.add(toLocalDayStr(d, tz));
    }
    return { set, count: set.size };
  } catch {
    return empty;
  }
}

/**
 * Compute the attendance summary for one employee in one month.
 *
 * @see AttendanceSummaryResult for the shape of the response.
 */
export async function computeMyAttendanceSummary(
  input: AttendanceSummaryInput,
): Promise<AttendanceSummaryResult> {
  const { db, employeeId, companyId, tenantId } = input;

  // 1. Resolve timezone
  const { tz, source } = await resolveTz(db, employeeId, companyId, tenantId ?? null, input.timezone);

  // 2. Resolve month → { year, month (1-indexed) } and the inclusive end day
  const parsed = parseMonthParam(input.month);
  const todayStr = todayInTz(tz);
  const todayParsed = parseMonthParam(todayStr.slice(0, 7));
  const now = new Date();
  const todayDay = todayParsed ? Number(todayStr.slice(8, 10)) : lastDayOfMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);

  let year: number;
  let month: number;
  let endDay: number;
  if (parsed) {
    year = parsed.year;
    month = parsed.month;
    // Cap the period at TODAY if the month is the current month
    if (todayParsed && todayParsed.year === year && todayParsed.month === month) {
      endDay = todayDay;
    } else {
      // future or past month — use the whole month
      endDay = lastDayOfMonth(year, month);
    }
  } else {
    // No month param — use current month in tz, capped at today
    year = todayParsed ? todayParsed.year : now.getUTCFullYear();
    month = todayParsed ? todayParsed.month : now.getUTCMonth() + 1;
    endDay = todayDay;
  }

  // 3. Build inclusive start/end as YYYY-MM-DD strings
  const startDayStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const endDayStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  // 4. Resolve weekly-offs from Setting table (company override > tenant-wide > default Sat+Sun)
  const weekendDow = await getWeekendDays(db, tenantId || undefined, companyId || undefined);

  // 5. Fetch company holidays for the period (local-tz-aware)
  const { set: holidaySet } = await fetchCompanyHolidays(db, startDayStr, endDayStr, companyId, tz);

  // 6. Walk working days in the local tz (weekends + holidays excluded).
  const walk = walkLocalWorkingDays(startDayStr, endDayStr, weekendDow, holidaySet, tz);
  const workingDateSet = new Set(walk.workingDates);

  // 7. Fetch all attendance rows in the period (tolerant of UTC vs IST storage).
  //    Widen the query range by ±1 day to absorb any tz offset.
  const utcStart = new Date(`${startDayStr}T00:00:00.000Z`);
  const utcEndExclusive = new Date(`${endDayStr}T00:00:00.000Z`);
  utcEndExclusive.setUTCDate(utcEndExclusive.getUTCDate() + 1);
  const rangeStart = new Date(utcStart.getTime() - 24 * 60 * 60 * 1000);
  const rangeEndExclusive = new Date(utcEndExclusive.getTime() + 24 * 60 * 60 * 1000);

  let attendanceRows: Array<{ date: Date; status: string }> = [];
  try {
    attendanceRows = await withSchemaSync(() => db.attendance.findMany({
      where: {
        employeeId,
        date: { gte: rangeStart, lt: rangeEndExclusive },
      },
      select: { date: true, status: true },
    })) || [];
  } catch {
    attendanceRows = [];
  }

  // 8. Build a map of LOCAL YYYY-MM-DD → status. Each stored Date is
  //    converted to its local calendar day using `toLocalDayStr(d, tz)`,
  //    which correctly handles BOTH storage conventions.
  const statusByDay = new Map<string, string>();
  for (const row of attendanceRows) {
    const d = row.date instanceof Date ? row.date : new Date(row.date);
    if (isNaN(d.getTime())) continue;
    const localDay = toLocalDayStr(d, tz);
    if (workingDateSet.has(localDay) || holidaySet.has(localDay)) {
      statusByDay.set(localDay, row.status);
    }
  }

  // 9. Tally the result by walking the working-day list
  let present = 0;
  let late = 0;
  let halfDay = 0;
  let absent = 0;
  let onLeave = 0;
  let holidays = 0;
  let weekend = 0;

  for (const dayStr of walk.workingDates) {
    const status = statusByDay.get(dayStr) || null;
    if (isOnLeave(status)) {
      onLeave += 1;
      continue;
    }
    if (status === 'holiday') {
      holidays += 1;
      continue;
    }
    if (status === 'weekend') {
      weekend += 1;
      continue;
    }
    // Now this is a real working day (in the denominator).
    if (status === 'present') {
      present += 1;
    } else if (status === 'late') {
      late += 1;
    } else if (status === 'half_day') {
      halfDay += 1;
    } else {
      // status === 'absent' OR no row at all
      absent += 1;
    }
  }

  const attendedDays = present + late + 0.5 * halfDay;
  // workingDays here is the calendar working-day count from the walk. But
  // we need to ALSO exclude days the Attendance row itself marked as
  // holiday/weekend/on_leave (those reduce the denominator).
  const excludedByAttendanceRow = holidays + weekend + onLeave;
  const workingDays = Math.max(0, walk.workingDates.length - excludedByAttendanceRow);

  const attendanceRate = workingDays === 0
    ? null
    : Math.round((attendedDays / workingDays) * 1000) / 10;

  return {
    month: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
    timezone: tz,
    periodStart: startDayStr,
    periodEnd: endDayStr,
    workingDays,
    present,
    late,
    halfDay,
    absent,
    onLeave,
    holidays,
    weekend,
    attendedDays,
    attendanceRate,
    timezoneSource: source,
    weekendDowUsed: weekendDow,
  };
}
