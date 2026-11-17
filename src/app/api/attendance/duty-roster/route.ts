/**
 * Duty Roster API — automatic + manual duty scheduling for the Attendance module.
 *
 * GET    ?month=YYYY-MM            → shifts + raw roster assignments + a fully
 *                                    resolved per-employee, per-date calendar.
 * POST   { employeeIds, pattern: {mon..sun}, startDate, endDate, name? }
 *                                  → "Automatic weekly pattern scheduler":
 *                                    ONE RotationalRoster per employee whose
 *                                    pattern is the ordered Mon..Sun shift ids,
 *                                    anchored on the Monday on-or-before
 *                                    startDate, plus an EmployeeRosterAssignment
 *                                    spanning [startDate, endDate].
 * PATCH  { employeeId, date, shiftId }
 *                                  → single-day manual override (1-day roster).
 * DELETE ?assignmentId=            → remove a roster assignment (admin only).
 *
 * Storage reuses the roster machinery the attendance engine already reads
 * (RotationalRoster + EmployeeRosterAssignment — see
 * src/lib/attendance-shift.ts loadEmployeeShiftWindows) so punch evaluation,
 * auto-present and biometric sync pick up duty-roster changes automatically:
 * latest schedule wins.
 *
 * ── ROTATION MATH (must stay compatible with loadEmployeeShiftWindows) ──
 * The resolver computes, for the evaluated date D:
 *     anchor  = dateKey(roster.startDate)
 *     elapsed = max(0, daysBetween(anchor, D))          // rotationUnit 'day'
 *     idx     = ((currentOffset + elapsed) % pattern.length + pattern.length)
 *               % pattern.length
 *     shift   = pattern[idx]
 * With pattern = [mon, tue, wed, thu, fri, sat, sun] (index 0 = Monday) and
 * anchor = Monday on-or-before startDate:
 *     daysBetween(anchor, startDate) === weekdayIndex(startDate)   // Mon = 0
 * so day-one resolves to pattern[weekdayIndex(startDate)] when
 * currentOffset = 0 — e.g. startDate Wed 2026-11-04, anchor Mon 2026-11-02:
 * elapsed = 2 → idx = 2 → pattern[2] = Wednesday. Setting currentOffset to the
 * weekday index instead would double-count it ((2 + 2) % 7 = Friday) — that is
 * exactly why currentOffset is ALWAYS 0 here and the roster itself is anchored
 * on the Monday on-or-before startDate. Later dates continue the 7-day cycle
 * correctly (next Monday → elapsed 7 → idx 0 → Monday shift).
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';

export { OPTIONS };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
// Matches the /api/employees?excludeInactive=true semantics (Task 120):
// separated employees never appear as schedulable people.
const INACTIVE_STATUSES = ['inactive', 'terminated', 'resigned'];
// 'Whole year' (+ slack) cap for one automatic schedule run.
const MAX_RANGE_DAYS = 400;
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/* ── date helpers (UTC-midnight convention used across the attendance module) ── */

function dateKeyOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function diffDays(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** 0 = Monday … 6 = Sunday (UTC calendar day of the YYYY-MM-DD key). */
function weekdayIndexMon0(dateKey: string): number {
  return (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday on-or-before the given YYYY-MM-DD key. */
function mondayOnOrBefore(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weekdayIndexMon0(dateKey));
  return d.toISOString().slice(0, 10);
}

function utcMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/* ── roster table self-heal (same as /api/shifts/assignments) ── */

let rosterTablesReady = false;

async function ensureRosterTables(db: { $executeRawUnsafe: (sql: string) => Promise<unknown> }) {
  if (rosterTablesReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS "RotationalRoster" (
       "id" TEXT PRIMARY KEY,
       "name" TEXT NOT NULL,
       "description" TEXT,
       "pattern" JSONB NOT NULL,
       "rotationUnit" TEXT NOT NULL DEFAULT 'week',
       "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "isActive" BOOLEAN NOT NULL DEFAULT true,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS "EmployeeRosterAssignment" (
       "id" TEXT PRIMARY KEY,
       "employeeId" TEXT NOT NULL,
       "rosterId" TEXT NOT NULL,
       "currentOffset" INTEGER NOT NULL DEFAULT 0,
       "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "endDate" TIMESTAMP(3),
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "EmployeeRosterAssignment_employeeId_rosterId_key" UNIQUE ("employeeId", "rosterId")
     )`,
    `CREATE INDEX IF NOT EXISTS "EmployeeRosterAssignment_employeeId_idx" ON "EmployeeRosterAssignment"("employeeId")`,
    `ALTER TABLE "EmployeeRosterAssignment" ADD CONSTRAINT "EmployeeRosterAssignment_rosterId_fkey"
       FOREIGN KEY ("rosterId") REFERENCES "RotationalRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ];
  for (const sql of statements) {
    try { await db.$executeRawUnsafe(sql); } catch { /* already exists */ }
  }
  rosterTablesReady = true;
}

/* ── shared types ── */

interface ShiftLite {
  id: string;
  name: string;
  code: string | null;
  startTime: string;
  endTime: string;
  breakDuration: number;
  status: string;
}

interface AssignmentRow {
  id: string;
  employeeId: string;
  currentOffset: number;
  startDate: string;
  endDate: string | null;
  roster: { id: string; name: string; pattern: unknown; rotationUnit: string; startDate: string; isActive: boolean } | null;
}

interface CalendarCell {
  shiftId: string | null;
  shiftName: string | null;
  shiftCode: string | null;
  source: 'roster' | 'policy-default';
}

interface CalendarRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  days: Record<string, CalendarCell>;
}

/**
 * Resolve the shift for ONE date from ONE assignment — a faithful per-date
 * replica of loadEmployeeShiftWindows (latest-startDate-wins assignment,
 * elapsed-from-roster-anchor step, modulo pattern). Returns null when the
 * resolver would produce no window (no roster / inactive roster / empty
 * pattern / pattern entry pointing at a deleted shift) → policy default.
 */
function resolveCell(
  assignment: AssignmentRow,
  dayKey: string,
  shiftsById: Map<string, ShiftLite>,
): CalendarCell {
  const roster = assignment.roster;
  if (!roster || roster.isActive === false) return { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };
  const endDateKey = dateKeyOf(assignment.endDate);
  if (endDateKey && endDateKey < dayKey) return { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };

  const pattern = Array.isArray(roster.pattern) ? (roster.pattern as unknown[]).map(String) : [];
  if (!pattern.length) return { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };

  const anchor = dateKeyOf(roster.startDate) || dayKey;
  const elapsed = Math.max(0, diffDays(anchor, dayKey));
  const step = roster.rotationUnit === 'day' ? elapsed : Math.floor(elapsed / 7);
  const idx = (((assignment.currentOffset || 0) + step) % pattern.length + pattern.length) % pattern.length;
  const shift = shiftsById.get(String(pattern[idx]));
  if (!shift) return { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };
  return { shiftId: shift.id, shiftName: shift.name, shiftCode: shift.code ?? null, source: 'roster' };
}

/* ─────────────────────────────── GET ─────────────────────────────── */

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can view the duty roster', 403);

  try {
    await ensureRosterTables(db);

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    if (!MONTH_RE.test(month)) return fail('month must be YYYY-MM', 422);
    // Optional company switcher scope (?companyId=, part of scopeQuery()) —
    // RotationalRoster itself is tenant-wide, employees carry companyId.
    const companyId = url.searchParams.get('companyId') || '';

    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of this month
    const days: string[] = [];
    for (let d = 1; d <= lastDay; d++) days.push(`${month}-${String(d).padStart(2, '0')}`);

    // Active employees (same exclusion set as ?excludeInactive=true pickers).
    const employees = (await db.employee.findMany({
      where: { status: { notIn: INACTIVE_STATUSES }, ...(companyId ? { companyId } : {}) },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })) as Array<{ id: string; firstName: string; lastName: string; employeeId: string }>;

    const shifts = (await db.shift.findMany({
      select: { id: true, name: true, code: true, startTime: true, endTime: true, breakDuration: true, status: true },
      orderBy: { name: 'asc' },
    })) as ShiftLite[];
    const shiftsById = new Map(shifts.map(s => [s.id, s]));

    const employeeIds = employees.map(e => e.id);
    const assignments = employeeIds.length
      ? (await db.employeeRosterAssignment.findMany({
          where: { employeeId: { in: employeeIds } },
          include: {
            roster: { select: { id: true, name: true, pattern: true, rotationUnit: true, startDate: true, isActive: true } },
          },
          orderBy: { startDate: 'desc' },
        })) as unknown as AssignmentRow[]
      : [];

    // Group by employee, pre-sorted latest startDate first (latest wins).
    const byEmployee = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const list = byEmployee.get(a.employeeId) || [];
      list.push(a);
      byEmployee.set(a.employeeId, list);
    }
    for (const list of byEmployee.values()) {
      list.sort((a, b) => (dateKeyOf(b.startDate) || '').localeCompare(dateKeyOf(a.startDate) || ''));
    }

    const calendar: CalendarRow[] = employees.map(emp => {
      const rows = byEmployee.get(emp.id) || [];
      const cells: Record<string, CalendarCell> = {};
      for (const dayKey of days) {
        // Latest-startDate-wins among non-expired assignments — identical to
        // the resolver's pick. NOTE: a future-dated assignment also wins for
        // earlier dates (elapsed clamps to 0) — that mirrors
        // loadEmployeeShiftWindows exactly, so the calendar always shows what
        // the engine will actually apply.
        const winner = rows.find(a => {
          const endKey = dateKeyOf(a.endDate);
          return !endKey || endKey >= dayKey;
        });
        cells[dayKey] = winner
          ? resolveCell(winner, dayKey, shiftsById)
          : { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };
      }
      return {
        employeeId: emp.id,
        employeeCode: emp.employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        days: cells,
      };
    });

    return ok({ shifts, assignments, calendar });
  } catch (e) {
    console.error('[duty-roster] GET error:', e);
    return fail('Failed to load duty roster', 500);
  }
}

/* ─────────────────────────────── POST ────────────────────────────── */
// Automatic weekly pattern scheduler.

interface PostBody {
  employeeIds?: unknown;
  pattern?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  name?: unknown;
}

export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can schedule the duty roster', 403);

  const body = (await parseBody(request)) as PostBody | null;
  if (!body) return fail('Invalid JSON');

  try {
    await ensureRosterTables(db);

    const employeeIds = Array.isArray(body.employeeIds)
      ? Array.from(new Set(body.employeeIds.map(v => String(v || '').trim()).filter(Boolean)))
      : [];
    if (!employeeIds.length) return fail('Select at least one employee', 422);

    // pattern must be exactly { mon..sun } with 7 valid shift ids.
    const patternInput = (body.pattern || {}) as Record<string, unknown>;
    const dayKeys = Object.keys(patternInput);
    if (dayKeys.length !== 7 || !WEEKDAY_KEYS.every(k => dayKeys.includes(k))) {
      return fail('pattern must contain exactly the 7 weekday keys mon..sun', 422);
    }
    const pattern = WEEKDAY_KEYS.map(k => String(patternInput[k] || '').trim());
    if (pattern.some(id => !id)) return fail('Every weekday (mon..sun) needs a shift', 422);

    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return fail('startDate and endDate must be YYYY-MM-DD', 422);
    if (startDate > endDate) return fail('startDate must be on or before endDate', 422);
    if (diffDays(startDate, endDate) > MAX_RANGE_DAYS) {
      return fail(`Date range too long — maximum ${MAX_RANGE_DAYS} days per schedule`, 422);
    }

    const uniqueShiftIds = Array.from(new Set(pattern));
    const shifts = (await db.shift.findMany({
      where: { id: { in: uniqueShiftIds } },
      select: { id: true },
    })) as Array<{ id: string }>;
    if (shifts.length !== uniqueShiftIds.length) return fail('One or more shifts do not exist', 422);

    // Employees must exist and be active; skipped ones become warnings.
    const employees = (await db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, employeeId: true, status: true },
    })) as Array<{ id: string; firstName: string; lastName: string; employeeId: string; status: string }>;
    const employeesById = new Map(employees.map(e => [e.id, e]));
    const warnings: string[] = [];
    for (const id of employeeIds) {
      const emp = employeesById.get(id);
      if (!emp) warnings.push(`Employee ${id} not found — skipped`);
      else if (INACTIVE_STATUSES.includes(emp.status || '')) warnings.push(`${emp.firstName} ${emp.lastName} is inactive — skipped`);
    }
    const targets = employeeIds.filter(id => {
      const emp = employeesById.get(id);
      return emp && !INACTIVE_STATUSES.includes(emp.status || '');
    });
    if (!targets.length) return fail(warnings[0] || 'No active employees to schedule', 422);

    // Anchor on the Monday on-or-before startDate and keep currentOffset = 0 —
    // see the rotation-math note at the top of this file.
    const anchor = mondayOnOrBefore(startDate);
    const anchorDate = utcMidnight(anchor);
    const endDateDate = utcMidnight(endDate);
    const changedBy = user.email || user.id || 'system';

    const rosters: Array<{ employeeId: string; rosterId: string }> = [];

    for (const employeeId of targets) {
      const emp = employeesById.get(employeeId)!;
      const empCode = emp.employeeId || employeeId;
      const rosterName = (typeof body.name === 'string' && body.name.trim()
        ? `${body.name.trim()} — ${empCode}`
        : `Duty ${startDate}..${endDate} — ${empCode}`
      ).slice(0, 160);

      const previousAssignmentIds = (
        (await db.employeeRosterAssignment.findMany({
          where: { employeeId },
          select: { id: true },
        })) as Array<{ id: string }>
      ).map(a => a.id);

      // One roster per (employee, roster name): reuse the roster this employee
      // is already assigned to under this name, else create a fresh one. Never
      // reuse another employee's roster via a bare name lookup.
      let roster = (await db.rotationalRoster.findFirst({
        where: { name: rosterName, assignments: { some: { employeeId } } },
        select: { id: true },
      })) as { id: string } | null;

      if (roster) {
        await db.rotationalRoster.update({
          where: { id: roster.id },
          data: { pattern, rotationUnit: 'day', startDate: anchorDate, isActive: true },
        });
      } else {
        roster = (await db.rotationalRoster.create({
          data: {
            name: rosterName,
            description: `Duty roster ${startDate}..${endDate} scheduled from the Duty Roster page`,
            pattern,
            rotationUnit: 'day',
            startDate: anchorDate,
            isActive: true,
          },
          select: { id: true },
        })) as { id: string };
      }

      // Upsert by the (employeeId, rosterId) unique pair. The new assignment's
      // latest startDate automatically supersedes older assignments inside the
      // window — history is kept (old assignments are NOT deleted).
      const existing = (await db.employeeRosterAssignment.findFirst({
        where: { employeeId, rosterId: roster.id },
        select: { id: true },
      })) as { id: string } | null;

      const assignmentData = {
        startDate: anchorDate,
        endDate: endDateDate,
        currentOffset: 0,
      };
      if (existing) {
        await db.employeeRosterAssignment.update({ where: { id: existing.id }, data: assignmentData });
      } else {
        await db.employeeRosterAssignment.create({ data: { employeeId, rosterId: roster.id, ...assignmentData } });
      }

      await db.attendanceAuditLog.create({
        data: {
          employeeId,
          action: 'shift_change',
          beforeData: { previousAssignmentIds },
          afterData: { rosterId: roster.id, pattern, startDate, endDate },
          changedBy,
          reason: `Duty roster ${startDate}..${endDate}`,
        },
      });

      rosters.push({ employeeId, rosterId: roster.id });
    }

    return ok({ created: rosters.length, rosters, warnings: warnings.length ? warnings : undefined });
  } catch (e) {
    console.error('[duty-roster] POST error:', e);
    return fail('Failed to schedule duty roster', 500);
  }
}

/* ─────────────────────────────── PATCH ───────────────────────────── */
// Single-day manual override.

export async function PATCH(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can override the duty roster', 403);

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');

  try {
    await ensureRosterTables(db);

    const employeeId = String(body.employeeId || '').trim();
    const dateKey = String(body.date || '').trim();
    const shiftId = String(body.shiftId || '').trim();
    if (!employeeId || !DATE_RE.test(dateKey) || !shiftId) {
      return fail('employeeId, date (YYYY-MM-DD) and shiftId are required', 422);
    }

    const employee = (await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeId: true, firstName: true, lastName: true, status: true },
    })) as { id: string; employeeId: string; firstName: string; lastName: string; status: string } | null;
    if (!employee) return fail('Employee not found', 404);
    if (INACTIVE_STATUSES.includes(employee.status || '')) return fail('Employee is inactive', 422);

    const shift = (await db.shift.findUnique({ where: { id: shiftId }, select: { id: true } })) as { id: string } | null;
    if (!shift) return fail('Shift not found', 404);

    const changedBy = user.email || user.id || 'system';
    const empCode = employee.employeeId || employeeId;
    const rosterName = `Duty override ${dateKey} — ${empCode}`.slice(0, 160);
    const dayDate = utcMidnight(dateKey);

    const previousAssignmentIds = (
      (await db.employeeRosterAssignment.findMany({
        where: { employeeId },
        select: { id: true },
      })) as Array<{ id: string }>
    ).map(a => a.id);

    // 1-day roster: pattern [shiftId], anchored ON the override date so
    // elapsed = 0 → idx 0 on that date. endDate = startDate makes the
    // assignment expire for every other day (resolver skips endDate < date).
    let roster = (await db.rotationalRoster.findFirst({
      where: { name: rosterName, assignments: { some: { employeeId } } },
      select: { id: true },
    })) as { id: string } | null;

    if (roster) {
      await db.rotationalRoster.update({
        where: { id: roster.id },
        data: { pattern: [shiftId], rotationUnit: 'day', startDate: dayDate, isActive: true },
      });
    } else {
      roster = (await db.rotationalRoster.create({
        data: {
          name: rosterName,
          description: `Manual single-day override from the Duty Roster page`,
          pattern: [shiftId],
          rotationUnit: 'day',
          startDate: dayDate,
          isActive: true,
        },
        select: { id: true },
      })) as { id: string };
    }

    const existing = (await db.employeeRosterAssignment.findFirst({
      where: { employeeId, rosterId: roster.id },
      select: { id: true },
    })) as { id: string } | null;

    const assignmentData = { startDate: dayDate, endDate: dayDate, currentOffset: 0 };
    const assignment = existing
      ? await db.employeeRosterAssignment.update({ where: { id: existing.id }, data: assignmentData })
      : await db.employeeRosterAssignment.create({ data: { employeeId, rosterId: roster.id, ...assignmentData } });

    await db.attendanceAuditLog.create({
      data: {
        employeeId,
        action: 'shift_change',
        beforeData: { previousAssignmentIds },
        afterData: { rosterId: roster.id, pattern: [shiftId], startDate: dateKey, endDate: dateKey },
        changedBy,
        reason: `Manual override ${dateKey}`,
      },
    });

    return ok({ ok: true, assignment });
  } catch (e) {
    console.error('[duty-roster] PATCH error:', e);
    return fail('Failed to override duty roster', 500);
  }
}

/* ─────────────────────────────── DELETE ──────────────────────────── */

export async function DELETE(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can remove duty roster assignments', 403);

  try {
    await ensureRosterTables(db);

    const assignmentId = new URL(request.url).searchParams.get('assignmentId');
    if (!assignmentId) return fail('assignmentId is required', 422);

    const assignment = (await db.employeeRosterAssignment.findUnique({
      where: { id: assignmentId },
      include: { roster: { select: { id: true, name: true } } },
    })) as { id: string; employeeId: string; startDate: Date; endDate: Date | null; roster: { id: string; name: string } } | null;
    if (!assignment) return fail('Assignment not found', 404);

    await db.employeeRosterAssignment.delete({ where: { id: assignmentId } });

    await db.attendanceAuditLog.create({
      data: {
        employeeId: assignment.employeeId,
        action: 'shift_change',
        beforeData: {
          assignmentId: assignment.id,
          rosterId: assignment.roster?.id,
          rosterName: assignment.roster?.name,
          startDate: dateKeyOf(assignment.startDate),
          endDate: dateKeyOf(assignment.endDate),
        },
        changedBy: user.email || user.id || 'system',
        reason: `Duty assignment removed (${assignment.roster?.name || assignment.id})`,
      },
    });

    return ok({ ok: true });
  } catch (e) {
    console.error('[duty-roster] DELETE error:', e);
    return fail('Failed to remove duty roster assignment', 500);
  }
}
