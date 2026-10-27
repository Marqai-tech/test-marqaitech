/**
 * Task 162 — Attendance day-key unification (IST).
 *
 * Production ended up with TWO day-key conventions inside the Attendance
 * table's unique (employeeId, date) space:
 *   • IST midnight   — biometric sync + device webhook (localDayStartFor)
 *     → stored as the previous day 18:30 UTC.
 *   • UTC midnight   — manual web punch, regularize, auto-present and the
 *     pre-162 webhook → stored as "YYYY-MM-DDT00:00:00.000Z".
 *
 * Because the unique key is the raw instant, the same business day could
 * exist as TWO rows. The dashboard kept only the first row per employee
 * (the UTC-midnight one, ordered higher), which SHADOWED the biometric row
 * carrying the real check-in/check-out — punches synced but never showed
 * on the attendance dashboard.
 *
 * This module gives every reader/writer one vocabulary:
 *   • attendanceDayWindow(dateKey) — the exact 24h UTC window that contains
 *     a business day under EITHER convention (and nothing else).
 *   • findAttendanceForLocalDay()  — the best existing row for a business
 *     day (rows with real punches win over empty shell rows).
 *   • canonicalAttendanceDate(dateKey) — the IST-midnight instant used by
 *     all writers from now on.
 */
import { dayKeyToIstStart, attendanceDayKeyOf } from '@/lib/timezone-utils';

export type AttendanceDayRow = {
  id: string;
  date: Date;
  checkIn?: Date | null;
  checkOut?: Date | null;
};

/** Exact UTC window covering one business day in both storage conventions. */
export function attendanceDayWindow(dateKey: string): { gte: Date; lt: Date } {
  const istStart = dayKeyToIstStart(dateKey);
  return { gte: istStart, lt: new Date(istStart.getTime() + 24 * 60 * 60 * 1000) };
}

/** Writers: the canonical (IST-midnight) Attendance.date for a day key. */
export function canonicalAttendanceDate(dateKey: string): Date {
  return dayKeyToIstStart(dateKey);
}

/**
 * Pick the row that should survive when several rows exist for the same
 * business day: a row with a real check-in beats an empty shell row; later
 * check-ins beat earlier ones; ties break on updatedAt-ish recency (id).
 */
export function pickBestAttendanceRow<T extends AttendanceDayRow>(rows: T[]): T | null {
  if (!rows.length) return null;
  return rows.reduce((best, row) => {
    const bestScore = (best.checkIn ? 2 : 0) + (best.checkOut ? 1 : 0);
    const rowScore = (row.checkIn ? 2 : 0) + (row.checkOut ? 1 : 0);
    if (rowScore !== bestScore) return rowScore > bestScore ? row : best;
    if (best.checkIn && row.checkIn) return row.checkIn > best.checkIn ? row : best;
    return row.date > best.date ? row : best;
  });
}

/**
 * The best existing Attendance row for a business day, either convention.
 * `db` is typed structurally with `unknown` args so every Prisma handle
 * (PrismaClient, transaction client, test doubles) satisfies it without
 * resorting to `any`.
 */
type FindManyFn = (args: {
  where: { employeeId: string; date: { gte: Date; lt: Date } };
}) => Promise<unknown[]>;

export async function findAttendanceForLocalDay<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped access ergonomics for callers that use the raw row
  T = Record<string, any>,
>(
  db: { attendance: { findMany: FindManyFn } },
  employeeId: string,
  dateKey: string,
): Promise<T | null> {
  const rows = await db.attendance.findMany({
    where: { employeeId, date: attendanceDayWindow(dateKey) },
  });
  return (pickBestAttendanceRow(rows as AttendanceDayRow[]) as T) || null;
}

/** Group rows by (employeeId, business-day key) keeping the best row of each. */
export function dedupeAttendanceRowsByDay<T extends AttendanceDayRow & { employeeId: string }>(rows: T[]): { kept: T[]; dropped: number } {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.employeeId}|${attendanceDayKeyOf(row.date)}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, row);
      continue;
    }
    const winner = pickBestAttendanceRow([current, row]);
    byKey.set(key, (winner === row ? row : current) as T);
  }
  return { kept: rows.filter((row) => byKey.get(`${row.employeeId}|${attendanceDayKeyOf(row.date)}`) === row), dropped: rows.length - byKey.size };
}
