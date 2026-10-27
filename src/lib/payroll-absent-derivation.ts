import { getHolidaysInRange, getWeekendDays } from '@/lib/working-days';

/**
 * Task 127 — derive missing ABSENT attendance rows before payroll processing.
 *
 * Why: LOP is computed ONLY from explicit attendance rows
 * (summarizeAttendance counts absent rows + half_day × 0.5) — a working day
 * with NO row silently becomes a paid day. The Task 126 backfill derived
 * absents once for history, but days after the backfill (and any future
 * no-punch days) would under-count LOP when the month is finalized.
 *
 * Safety rails (multi-tenant):
 *   - Only runs when the month ALREADY has attendance rows for the company's
 *     employees (attendance actively used) — tenants that never track
 *     attendance are left untouched.
 *   - Never touches days with an existing row, approved leave, weekends,
 *     holidays, days before DOJ, or future days.
 *   - Idempotent: re-processing never duplicates (existence-checked first).
 */

export interface DeriveAbsentsResult {
  derived: number;
  skippedExisting: number;
  skippedWeekend: number;
  skippedHoliday: number;
  skippedLeave: number;
  skippedFuture: number;
  attendanceInUse: boolean;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function deriveMissingAbsents(
  db: PrismaClientLike,
  opts: { companyId: string; month: number; year: number },
): Promise<DeriveAbsentsResult> {
  const result: DeriveAbsentsResult = {
    derived: 0, skippedExisting: 0, skippedWeekend: 0,
    skippedHoliday: 0, skippedLeave: 0, skippedFuture: 0,
    attendanceInUse: false,
  };

  const start = new Date(Date.UTC(opts.year, opts.month - 1, 1));
  const monthEnd = new Date(Date.UTC(opts.year, opts.month, 0, 23, 59, 59, 999));
  const todayKey = dayKey(new Date());

  // Employees in scope (same shape the payroll engine processes)
  const employees = await db.employee.findMany({
    where: { companyId: opts.companyId, status: 'active' },
    select: { id: true, dateOfJoining: true },
  });
  if (employees.length === 0) return result;

  // Gate: attendance must already be in use this month for this company —
  // otherwise a tenant that never records attendance would get everyone
  // marked absent.
  const anyRow = await db.attendance.findFirst({
    where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lte: monthEnd } },
    select: { id: true },
  });
  result.attendanceInUse = Boolean(anyRow);
  if (!anyRow) return result;

  // Weekend + holiday calendars
  const weekendDow = await getWeekendDays(db as any, null, opts.companyId).catch(() => [0, 6]);
  const holidays = await getHolidaysInRange(db as any, start, monthEnd).catch(() => []);
  const holidayKeys = new Set((holidays || []).map((h) => h.date));

  // Approved leave windows overlapping the month
  const leaves = await db.leaveRequest.findMany({
    where: {
      status: 'approved',
      employeeId: { in: employees.map((e) => e.id) },
      startDate: { lte: monthEnd },
      endDate: { gte: start },
    },
    select: { employeeId: true, startDate: true, endDate: true },
  }).catch(() => []);
  const leaveByEmp = new Map<string, Array<[string, string]>>();
  for (const l of leaves) {
    const list = leaveByEmp.get(l.employeeId) || [];
    list.push([dayKey(new Date(l.startDate)), dayKey(new Date(l.endDate))]);
    leaveByEmp.set(l.employeeId, list);
  }

  // Existing rows (idempotency) — keys normalized to the UTC-midnight date
  // convention every writer uses in production.
  const existing = await db.attendance.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lte: monthEnd } },
    select: { employeeId: true, date: true },
  });
  const existingKeys = new Set(existing.map((r) => `${r.employeeId}|${dayKey(new Date(r.date))}`));

  // Walk each working day ≤ today
  const now = new Date();
  const toCreate: Array<{
    employeeId: string; date: Date; status: string;
    notes: string; createdAt: Date; updatedAt: Date;
  }> = [];
  for (let d = new Date(Date.UTC(opts.year, opts.month - 1, 1)); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = dayKey(d);
    if (key > todayKey) { result.skippedFuture += 1; continue; }
    if (weekendDow.includes(d.getUTCDay())) { result.skippedWeekend += 1; continue; }
    if (holidayKeys.has(key)) { result.skippedHoliday += 1; continue; }

    for (const e of employees) {
      const doj = new Date(e.dateOfJoining);
      const dojKey = dayKey(new Date(Date.UTC(doj.getFullYear(), doj.getMonth(), doj.getDate())));
      if (key < dojKey) continue;
      if (existingKeys.has(`${e.id}|${key}`)) { result.skippedExisting += 1; continue; }
      const onLeave = (leaveByEmp.get(e.id) || []).some(([s, en]) => s <= key && key <= en);
      if (onLeave) { result.skippedLeave += 1; continue; }
      toCreate.push({
        employeeId: e.id,
        date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
        status: 'absent',
        notes: 'Derived absent (no punch, no approved leave) — Task 127',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Chunked createMany (serverless-safe)
  for (let i = 0; i < toCreate.length; i += 200) {
    const chunk = toCreate.slice(i, i + 200);
    await db.attendance.createMany({ data: chunk }).catch(async () => {
      // createMany may be unavailable on old clients — fall back to per-row
      for (const row of chunk) {
        await (db.attendance as any).create({ data: row }).catch(() => undefined);
      }
    });
  }
  result.derived = toCreate.length;
  return result;
}

// Minimal structural client — the payroll engine passes the same tenant-scoped
// PrismaClient; keep the contract loose so both route and cron callers work.
interface PrismaClientLike {
  employee: { findMany(args: Record<string, unknown>): Promise<Array<Record<string, any>>> };
  attendance: {
    findFirst(args: Record<string, unknown>): Promise<Record<string, any> | null>;
    findMany(args: Record<string, unknown>): Promise<Array<Record<string, any>>>;
    createMany(args: Record<string, unknown>): Promise<unknown>;
  };
  leaveRequest: { findMany(args: Record<string, unknown>): Promise<Array<Record<string, any>>> };
}
