/**
 * Shared working-day calculation helpers for the Leave module.
 *
 * BUG FIXES (2026-09 validation round):
 *   - Weekends were never excluded from leave ranges (only a "must contain
 *     at least one working day" gate existed and Saturday was always counted
 *     as a working day).
 *   - Holidays were informational only — they never reduced the leave days.
 *   - Day counts were pure calendar-day math everywhere (client + 4 server
 *     sites), so balances were deducted for Saturdays/Sundays/holidays.
 *
 * This module centralizes the "which days actually count" logic so the
 * create-time validation, the balance deduction, the auto-approval engine
 * input, and the attendance sync all agree on one number.
 *
 * Weekend configuration:
 *   The Settings UI historically stored weekend toggles in localStorage only.
 *   The server now reads the `Setting` table (company-level override first,
 *   then tenant-wide rows) for `attendance_weekend_saturday` /
 *   `attendance_weekend_sunday`. When no rows exist the default is a
 *   5-day week (Saturday + Sunday non-working), which matches the setup
 *   wizard default (`['Saturday', 'Sunday']`).
 *
 * Holiday configuration:
 *   Only non-elective holidays count (types `public`, `company`, `national`,
 *   `country`). `optional` holidays are excluded — they are elected per
 *   employee via OptionalHolidayElection and are not automatically
 *   non-working for everyone.
 */

/** Default non-working days: Sunday (0) + Saturday (6) */
export const DEFAULT_WEEKEND_DOW = [0, 6];

/** Normalize any date-ish value to a YYYY-MM-DD string (UTC calendar day). */
export function toDayStr(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value).split('T')[0];
  return d.toISOString().split('T')[0];
}

/** Midnight-UTC Date for a calendar day, safe for range walking. */
function dayStartUtc(value: Date | string): Date {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Read the weekend configuration from the Setting table.
 * Company-level rows override tenant-wide rows. Falls back to
 * Saturday + Sunday when the table/rows are missing or on any error.
 */
export async function getWeekendDays(
  db: any,
  tenantId?: string | null,
  companyId?: string | null,
): Promise<number[]> {
  const fallback = [...DEFAULT_WEEKEND_DOW];
  try {
    if (!db?.setting) return fallback;
    const rows = await db.setting.findMany({
      where: {
        key: { in: ['attendance_weekend_saturday', 'attendance_weekend_sunday', 'attendance_weekendDays', 'attendance_weekend_days'] },
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      select: { key: true, value: true, companyId: true },
    });
    if (!rows || rows.length === 0) return fallback;

    const parseBool = (raw: unknown, fb: boolean): boolean => {
      if (raw === undefined || raw === null || raw === '') return fb;
      try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (typeof v === 'boolean') return v;
      } catch { /* plain string */ }
      return String(raw).toLowerCase() === 'true';
    };

    // Named-day list setting (from the setup wizard, e.g. "Saturday,Sunday")
    const listRow = rows
      .filter((r: any) => r.key === 'attendance_weekendDays' || r.key === 'attendance_weekend_days')
      .sort((a: any, b: any) => (a.companyId === companyId ? -1 : 1) - (b.companyId === companyId ? -1 : 1))[0];
    if (listRow?.value) {
      const raw = String(listRow.value).replace(/^\[|\]$/g, '').replace(/"/g, '');
      const names = raw.split(',').map((s: string) => s.trim().toLowerCase());
      const days: number[] = [];
      if (names.includes('sunday')) days.push(0);
      if (names.includes('saturday')) days.push(6);
      if (days.length > 0) return days;
      // Empty list means "no weekends configured" — fall through to toggles
    }

    // Toggle settings — company row wins over tenant-wide row
    const pick = (key: string, fb: boolean): boolean => {
      const companyRow = companyId ? rows.find((r: any) => r.key === key && r.companyId === companyId) : undefined;
      const tenantRow = rows.find((r: any) => r.key === key && !r.companyId);
      const row = companyRow || tenantRow;
      return parseBool(row?.value, fb);
    };
    const saturday = pick('attendance_weekend_saturday', true);
    const sunday = pick('attendance_weekend_sunday', true);
    const days: number[] = [];
    if (sunday) days.push(0);
    if (saturday) days.push(6);
    return days;
  } catch {
    return fallback;
  }
}

/**
 * Fetch non-elective holidays overlapping [start, end] (inclusive).
 * Returns { date: 'YYYY-MM-DD', name }[] — never throws.
 */
export async function getHolidaysInRange(
  db: any,
  start: Date | string,
  end: Date | string,
): Promise<Array<{ date: string; name: string }>> {
  try {
    if (!db?.holiday) return [];
    const rows = await db.holiday.findMany({
      where: {
        date: { gte: dayStartUtc(start), lte: dayStartUtc(end) },
        // Task 127: include 'festival' — Dussehra/Ganesh Chaturthi etc. are
        // seeded as type "festival" in production, and excluding them made the
        // auto-present engine mark management employees PRESENT on holidays.
        type: { in: ['public', 'company', 'national', 'country', 'festival'] },
      },
      select: { date: true, name: true },
    });
    return (rows || []).map((h: any) => ({ date: toDayStr(h.date), name: h.name || 'Holiday' }));
  } catch {
    return [];
  }
}

export interface WorkingDayWalk {
  /** Number of working days in the range (weekends + holidays excluded) */
  workingDays: number;
  /** YYYY-MM-DD strings of the days that count as leave */
  workingDates: string[];
  /** YYYY-MM-DD strings excluded as weekend */
  weekendDates: string[];
  /** YYYY-MM-DD strings excluded as holiday */
  holidayDates: string[];
}

/**
 * Walk the date range [start, end] (inclusive, calendar days in UTC) and
 * classify each day as working / weekend / holiday.
 *
 * SANDWICH RULE (§2.4 spec): when `sandwichRuleEnabled` is true, weekends
 * and holidays that fall BETWEEN two working leave days are counted as
 * leave (included in workingDates). Weekends/holidays at the start or end
 * of the range are still excluded.
 *
 * Example: Fri leave + Mon leave with a weekend in between:
 *   - sandwichRuleEnabled=false → 2 chargeable days (Fri + Mon)
 *   - sandwichRuleEnabled=true  → 4 chargeable days (Fri + Sat + Sun + Mon)
 */
export function computeWorkingDays(
  start: Date | string,
  end: Date | string,
  weekendDow: number[] = DEFAULT_WEEKEND_DOW,
  holidayDaySet: Set<string> = new Set(),
  sandwichRuleEnabled: boolean = false,
): WorkingDayWalk {
  const weekendSet = new Set(weekendDow);
  const cursor = dayStartUtc(start);
  const endDay = dayStartUtc(end);
  const allDates: string[] = [];
  const weekendDates: string[] = [];
  const holidayDates: string[] = [];
  const workingDates: string[] = [];
  // Hard cap (10 years) to protect against malformed ranges
  let guard = 0;
  while (cursor <= endDay && guard < 4000) {
    guard++;
    const dateStr = cursor.toISOString().split('T')[0];
    allDates.push(dateStr);
    if (weekendSet.has(cursor.getUTCDay())) {
      weekendDates.push(dateStr);
    } else if (holidayDaySet.has(dateStr)) {
      holidayDates.push(dateStr);
    } else {
      workingDates.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // If sandwich rule is enabled, include weekends/holidays that fall BETWEEN
  // two working leave days. We only include a weekend/holiday if there's at
  // least one working day BEFORE it AND at least one working day AFTER it
  // in the range.
  if (sandwichRuleEnabled && workingDates.length > 0) {
    const firstWorking = workingDates[0];
    const lastWorking = workingDates[workingDates.length - 1];
    const sandwichDates: string[] = [];
    for (const dateStr of allDates) {
      // Skip if it's already a working day
      if (workingDates.includes(dateStr)) continue;
      // Only include if it's between the first and last working day
      if (dateStr > firstWorking && dateStr < lastWorking) {
        sandwichDates.push(dateStr);
      }
    }
    // Add sandwich dates to the working dates list (they count as leave)
    workingDates.push(...sandwichDates);
    workingDates.sort();
    // Remove sandwich dates from weekend/holiday lists (they're now leave days)
    const sandwichSet = new Set(sandwichDates);
    const filteredWeekend = weekendDates.filter(d => !sandwichSet.has(d));
    const filteredHoliday = holidayDates.filter(d => !sandwichSet.has(d));
    weekendDates.length = 0;
    weekendDates.push(...filteredWeekend);
    holidayDates.length = 0;
    holidayDates.push(...filteredHoliday);
  }

  return { workingDays: workingDates.length, workingDates, weekendDates, holidayDates };
}

/**
 * The number of leave days a request consumes:
 * a half-day request is always 0.5; otherwise the working-day count.
 */
export function leaveDaysConsumed(walk: WorkingDayWalk, halfDay?: boolean | null): number {
  return halfDay ? 0.5 : walk.workingDays;
}

/**
 * Compute "today" as YYYY-MM-DD in the given IANA timezone (falls back to UTC).
 */
export function todayInTimezone(tz?: string | null): string {
  try {
    const zone = tz && tz.trim() ? tz.trim() : 'UTC';
    // Validate the zone — throws for unknown identifiers
    Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}
