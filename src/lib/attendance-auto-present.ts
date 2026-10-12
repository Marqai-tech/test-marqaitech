/**
 * Auto-Present for Management Employees (Task 82)
 *
 * When the admin enables `autoPresentManagementEnabled` on the Attendance
 * Policy Config, management employees are automatically marked PRESENT for
 * each working day with in/out punches taken from their roster/shift
 * assignment (or the policy default shift) — even if they never punch.
 *
 * Management definition — identical to the Management List page
 * (/employees/management) so the two features stay in sync:
 *   0. Employee.isManagement === true (explicit designation), OR
 *   1. Linked user role ∈ { manager, admin, tenant_admin, hr_admin,
 *      super_admin }, OR
 *   2. The employee is the reporting manager of ≥1 ACTIVE employee.
 *
 * Safety rules:
 *   - REAL PUNCHES ALWAYS WIN. Rows that already have both a check-in and a
 *     check-out are never touched. Only a missing check-in (full auto row)
 *     or a missing check-out (forgot to punch out) is filled.
 *   - Approved leave wins: a day covered by an approved LeaveRequest is
 *     skipped (leave status is derived downstream, and rows already marked
 *     on_leave are not overwritten).
 *   - Weekends (configured via the Setting table) and non-elective holidays
 *     are skipped.
 *   - Future dates are never processed. Days before the employee's
 *     date-of-joining are skipped.
 *   - Rows created by this engine are stamped `punchMethod='auto'` and
 *     `notes='Auto-present (management rule)'` so reports/audits can tell
 *     them apart from real punches.
 */

const DEFAULT_TZ_OFFSET_MINUTES = -330; // IST — matches the app's India-centric default
const MGMT_ROLES = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'];

// ─── Self-healing DDL (Task 82) ────────────────────────────────────────────
// Vercel's runtime DATABASE_URL can point at a different Neon stack than the
// one this repo's patch scripts hardcode, so a fresh column can be missing on
// the DB the app ACTUALLY uses. Instead of guessing stacks, every route that
// touches the flag runs this idempotent ALTER (once per process) against ITS
// OWN db handle — guaranteeing the column exists wherever the app runs.
let autoPresentColumnEnsured = false;

const ATTENDANCE_POLICY_CONFIG_DDL = [
  // Full table (fresh copies) — matches prisma/schema.prisma exactly.
  `CREATE TABLE IF NOT EXISTS "AttendancePolicyConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "roundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "roundMinutes" INTEGER NOT NULL DEFAULT 15,
    "roundDirection" TEXT NOT NULL DEFAULT 'nearest',
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "earlyGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "autoOvertimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 480,
    "autoApprovePermissionMinutes" INTEGER NOT NULL DEFAULT 0,
    "autoApproveMinAttendancePct" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "autoApproveLeaveSingleDay" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveLeaveTypes" TEXT NOT NULL DEFAULT '[]',
    "autoApproveOvertimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoApproveGatepassMinutes" INTEGER NOT NULL DEFAULT 0,
    "wfhActivityMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "wfhInactivityThresholdHours" INTEGER NOT NULL DEFAULT 4,
    "lateMarkAllowancePerMonth" INTEGER NOT NULL DEFAULT 4,
    "lateMarkHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 21,
    "lateMarkNotApplicableOnTour" BOOLEAN NOT NULL DEFAULT true,
    "shiftStartDefault" TEXT NOT NULL DEFAULT '09:00',
    "shiftEndDefault" TEXT NOT NULL DEFAULT '17:30',
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "autoPresentManagementEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gatePassMaxPerMonth" INTEGER NOT NULL DEFAULT 1,
    "gatePassHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "gatePassHalfDayNextDay" BOOLEAN NOT NULL DEFAULT true,
    "gatePassEarlyHours" INTEGER NOT NULL DEFAULT 1,
    "canteenEnabled" BOOLEAN NOT NULL DEFAULT true,
    "canteenFreeForGeneralShift" BOOLEAN NOT NULL DEFAULT true,
    "canteenFreeForNightShift" BOOLEAN NOT NULL DEFAULT true,
    "canteenOtfreeThresholdHours" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendancePolicyConfig_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AttendancePolicyConfig_companyId_idx" ON "AttendancePolicyConfig"("companyId")`,
  // Older copies of the table may pre-date the new flag.
  `ALTER TABLE "AttendancePolicyConfig" ADD COLUMN IF NOT EXISTS "autoPresentManagementEnabled" BOOLEAN NOT NULL DEFAULT false`,
];

export async function ensureAutoPresentColumn(db: any): Promise<void> {
  if (autoPresentColumnEnsured) return;
  autoPresentColumnEnsured = true; // set up-front: a broken DB should not turn every request into a DDL storm
  for (const stmt of ATTENDANCE_POLICY_CONFIG_DDL) {
    try {
      await db.$executeRawUnsafe(stmt);
    } catch (e: unknown) {
      console.warn('[attendance-auto-present] ensure column failed (non-fatal):', e instanceof Error ? e.message.slice(0, 140) : e);
    }
  }
}

export interface AutoPresentOptions {
  companyId: string | null;
  /** YYYY-MM-DD local calendar days to process. Future days are skipped. */
  dateKeys: string[];
  /** Client-local today key (YYYY-MM-DD) — the future cutoff. */
  todayKey: string;
  /** new Date().getTimezoneOffset() from the caller's browser (IST = -330). */
  tzOffsetMinutes?: number;
  /** Restrict processing to a single employee id. */
  employeeId?: string;
}

export interface AutoPresentDetail {
  employeeId: string;      // Employee.id (cuid)
  code: string;            // Employee.employeeId (e.g. MARQ001)
  name: string;
  date: string;            // YYYY-MM-DD
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
  checkIn?: string;        // ISO instant written to the row
  checkOut?: string;
}

export interface AutoPresentResult {
  enabled: boolean;
  created: number;
  updated: number;
  skippedPunched: number;
  skippedLeave: number;
  skippedNonWorking: number;
  skippedFuture: number;
  skippedBeforeJoining: number;
  managementCount: number;
  details: AutoPresentDetail[];
}

interface ShiftWindow {
  startMinutes: number;    // minutes from local midnight
  endMinutes: number;      // may exceed 24h for cross-midnight shifts
  breakMinutes: number;
  source: string;          // 'roster:<name>' | 'policy-default'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseHm(value: string | null | undefined, fallbackMinutes: number): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(String(value).trim())) return fallbackMinutes;
  const [h, m] = String(value).trim().split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMinutes;
  return h * 60 + m;
}

/** UTC instant of a local wall-clock time on a local calendar day. */
function localInstant(dateKey: string, minutesFromMidnight: number, tzOffsetMinutes: number): Date {
  const total = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const dayShift = Math.floor(minutesFromMidnight / 1440);
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  const utcMs = base.getTime() + total * 60000 + tzOffsetMinutes * 60000 + dayShift * 86400000;
  return new Date(utcMs);
}

/** Local date key of an instant, using the caller's tz offset. */
function instantDateKey(instant: Date, tzOffsetMinutes: number): string {
  return new Date(instant.getTime() - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

/**
 * Replicates the attendance page's recordDateKey(): rows written by manual
 * punches are UTC midnight of the employee's LOCAL day; older/other writers
 * may store true instants (e.g. IST midnight = previous 18:30 UTC).
 */
function attendanceRowDateKey(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function diffDays(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const b = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function dayOfWeek(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** Resolve the shift window for an employee on a date: roster → policy default. */
function resolveShiftWindow(
  dateKey: string,
  assignment: {
    roster: { pattern: unknown; rotationUnit: string; startDate: Date | string } | null;
    currentOffset: number;
    startDate: Date | string;
  } | null,
  shiftsById: Map<string, { name: string; startTime: string; endTime: string; breakDuration: number }>,
  policy: { shiftStartDefault: string; shiftEndDefault: string; breakDurationMinutes: number },
): ShiftWindow {
  if (assignment?.roster) {
    const pattern = Array.isArray(assignment.roster.pattern) ? (assignment.roster.pattern as string[]) : [];
    if (pattern.length > 0) {
      const unit = assignment.roster.rotationUnit === 'day' ? 'day' : 'week';
      const anchor = dateKeyOf(assignment.roster.startDate);
      if (anchor) {
        // Rotation advances from the ROSTER's anchor date to the target date;
        // currentOffset stays as the assignment's base index (0 in practice).
        const elapsed = Math.max(0, diffDays(anchor, dateKey));
        const step = unit === 'day' ? elapsed : Math.floor(elapsed / 7);
        const idx = (((assignment.currentOffset || 0) + step) % pattern.length + pattern.length) % pattern.length;
        const shift = shiftsById.get(String(pattern[idx]));
        if (shift) {
          const startMinutes = parseHm(shift.startTime, 9 * 60);
          let endMinutes = parseHm(shift.endTime, 17 * 60 + 30);
          if (endMinutes <= startMinutes) endMinutes += 24 * 60; // cross-midnight
          return {
            startMinutes,
            endMinutes,
            breakMinutes: Number.isFinite(shift.breakDuration) ? shift.breakDuration : policy.breakDurationMinutes,
            source: `roster:${shift.name}`,
          };
        }
      }
    }
  }
  const startMinutes = parseHm(policy.shiftStartDefault, 9 * 60 + 30);
  let endMinutes = parseHm(policy.shiftEndDefault, 18 * 60 + 30);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return { startMinutes, endMinutes, breakMinutes: policy.breakDurationMinutes, source: 'policy-default' };
}

function dateKeyOf(value: Date | string | unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : (isNaN(new Date(s).getTime()) ? null : new Date(s).toISOString().slice(0, 10));
}

/**
 * Run the auto-present engine. Never throws for per-tenant data problems —
 * callers surface a summary; individual failures are reported in details.
 */
export async function runManagementAutoPresent(
  db: any, // PrismaClient (tenant-scoped). `any` on purpose — Prisma's find* arg
           // types are structurally too strict for a minimal engine contract.
  opts: AutoPresentOptions,
): Promise<AutoPresentResult> {
  const tzOffset = typeof opts.tzOffsetMinutes === 'number' && Number.isFinite(opts.tzOffsetMinutes)
    ? Math.round(opts.tzOffsetMinutes)
    : DEFAULT_TZ_OFFSET_MINUTES;
  const result: AutoPresentResult = {
    enabled: false, created: 0, updated: 0,
    skippedPunched: 0, skippedLeave: 0, skippedNonWorking: 0,
    skippedFuture: 0, skippedBeforeJoining: 0, managementCount: 0, details: [],
  };

  // ── 1. Policy config: toggle + default shift ──
  let policy: { shiftStartDefault: string; shiftEndDefault: string; breakDurationMinutes: number } = {
    shiftStartDefault: '09:30',
    shiftEndDefault: '18:30',
    breakDurationMinutes: 30,
  };
  let enabled = false;
  try {
    const cfg = await db.attendancePolicyConfig.findFirst({
      where: opts.companyId ? { companyId: opts.companyId } : {},
      orderBy: { createdAt: 'desc' },
    });
    if (cfg) {
      enabled = cfg.autoPresentManagementEnabled === true;
      if (cfg.shiftStartDefault) policy.shiftStartDefault = String(cfg.shiftStartDefault);
      if (cfg.shiftEndDefault) policy.shiftEndDefault = String(cfg.shiftEndDefault);
      if (Number.isFinite(cfg.breakDurationMinutes as number)) policy.breakDurationMinutes = Number(cfg.breakDurationMinutes);
    }
  } catch {
    return result; // config table missing — engine inert
  }
  result.enabled = enabled;
  if (!enabled) return result;

  // ── 2. Date sanitisation: never process future days ──
  const processKeys = opts.dateKeys.filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const futureKeys = processKeys.filter(k => k > opts.todayKey);
  result.skippedFuture = futureKeys.length;
  const workKeys = processKeys.filter(k => k <= opts.todayKey).sort();
  if (workKeys.length === 0) return result;

  // ── 3. Management employees (Management List criteria) ──
  const emps = await db.employee.findMany({
    where: {
      status: 'active',
      ...(opts.companyId ? { companyId: opts.companyId } : {}),
      ...(opts.employeeId ? { id: opts.employeeId } : {}),
    },
    select: {
      id: true, firstName: true, lastName: true, employeeId: true,
      dateOfJoining: true, isManagement: true, reportingManagerId: true,
      user: { select: { role: true } },
    },
  });
  const reportingIds = new Set<string>();
  for (const e of emps) {
    if (e.reportingManagerId) reportingIds.add(String(e.reportingManagerId));
  }
  const mgmt = emps.filter((e: any) =>
    e.isManagement === true ||
    (e.user?.role && MGMT_ROLES.includes(String(e.user.role))) ||
    reportingIds.has(String(e.id)),
  );
  result.managementCount = mgmt.length;
  if (mgmt.length === 0) return result;
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffset * 60_000);
  const todayLocalMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const mgmtIds = mgmt.map((e: any) => String(e.id));
  const nameOf = (e: any) => `${e.firstName || ''} ${e.lastName || ''}`.trim() || String(e.employeeId || e.id);

  // ── 4. Weekends + holidays for the range ──
  const rangeStartKey = workKeys[0];
  const rangeEndKey = workKeys[workKeys.length - 1];
  const weekendDow = await getWeekendDaysSafe(db, opts.companyId);
  let holidaySet = new Set<string>();
  try {
    const { getHolidaysInRange } = await import('@/lib/working-days');
    const holidays = await getHolidaysInRange(
      db,
      new Date(`${rangeStartKey}T00:00:00.000Z`),
      new Date(`${rangeEndKey}T00:00:00.000Z`),
    );
    holidaySet = new Set((holidays || []).map(h => h.date));
  } catch { /* holidays optional */ }

  // ── 5. Approved leaves overlapping the range ──
  const leaveByEmp = new Map<string, Array<{ start: string; end: string }>>();
  try {
    const leaves = db.leaveRequest
      ? await db.leaveRequest.findMany({
          where: {
            employeeId: { in: mgmtIds },
            status: 'approved',
            startDate: { lte: new Date(`${rangeEndKey}T23:59:59.999Z`) },
            endDate: { gte: new Date(`${rangeStartKey}T00:00:00.000Z`) },
          },
          select: { employeeId: true, startDate: true, endDate: true },
        })
      : [];
    for (const l of leaves) {
      const list = leaveByEmp.get(String(l.employeeId)) || [];
      list.push({ start: attendanceRowDateKey(l.startDate) || '', end: attendanceRowDateKey(l.endDate) || '' });
      leaveByEmp.set(String(l.employeeId), list);
    }
  } catch { /* leave table problems → treat as no leave */ }

  // ── 6. Roster assignments + shifts ──
  let assignmentsByEmp = new Map<string, any>();
  const shiftsById = new Map<string, { name: string; startTime: string; endTime: string; breakDuration: number }>();
  try {
    if (db.employeeRosterAssignment) {
      const assignments = await db.employeeRosterAssignment.findMany({
        where: { employeeId: { in: mgmtIds } },
        include: { roster: { select: { pattern: true, rotationUnit: true, startDate: true } } },
      });
      // Latest-started still-current assignment per employee
      const nowMs = Date.now();
      for (const a of assignments) {
        const startOk = a.startDate ? new Date(a.startDate).getTime() <= nowMs : true;
        const endOk = a.endDate ? new Date(a.endDate).getTime() >= nowMs : true;
        if (!startOk || !endOk) continue;
        const prev = assignmentsByEmp.get(String(a.employeeId));
        if (!prev || new Date(a.startDate).getTime() > new Date(prev.startDate).getTime()) {
          assignmentsByEmp.set(String(a.employeeId), a);
        }
      }
      const patternIds = new Set<string>();
      for (const a of assignmentsByEmp.values()) {
        const pattern = Array.isArray(a.roster?.pattern) ? a.roster.pattern as string[] : [];
        pattern.forEach(id => patternIds.add(String(id)));
      }
      if (patternIds.size > 0 && db.shift) {
        const shifts = await db.shift.findMany({ where: { id: { in: [...patternIds] } } });
        for (const s of shifts) {
          shiftsById.set(String(s.id), {
            name: String(s.name || 'Shift'),
            startTime: String(s.startTime || '09:30'),
            endTime: String(s.endTime || '18:30'),
            breakDuration: Number.isFinite(s.breakDuration) ? Number(s.breakDuration) : policy.breakDurationMinutes,
          });
        }
      }
    }
  } catch { /* roster optional → policy defaults */ }

  // ── 7. Existing attendance rows in the range (±1 day guard) ──
  const readStart = new Date(new Date(`${rangeStartKey}T00:00:00.000Z`).getTime() - 36 * 3600000);
  const readEnd = new Date(new Date(`${rangeEndKey}T00:00:00.000Z`).getTime() + 36 * 3600000);
  const existingRows = await db.attendance.findMany({
    where: { employeeId: { in: mgmtIds }, date: { gte: readStart, lte: readEnd } },
    select: { id: true, employeeId: true, date: true, checkIn: true, checkOut: true, status: true },
  });
  // (employeeId, dateKey) → row
  const rowByKey = new Map<string, Record<string, any>>();
  for (const row of existingRows) {
    const key = attendanceRowDateKey(row.date);
    if (!key) continue;
    rowByKey.set(`${String(row.employeeId)}|${key}`, row);
  }

  // ── 8. Per date × per management employee ──
  for (const dateKey of workKeys) {
    const dow = dayOfWeek(dateKey);
    for (const emp of mgmt) {
      const empIdStr = String(emp.id);
      const base = {
        employeeId: empIdStr,
        code: String(emp.employeeId || ''),
        name: nameOf(emp),
        date: dateKey,
      };

      // Future guard per employee is the global one; joining guard:
      const dojKey = dateKeyOf(emp.dateOfJoining);
      if (dojKey && dateKey < dojKey) {
        result.skippedBeforeJoining += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'before date of joining' });
        continue;
      }
      if (weekendDow.includes(dow)) {
        result.skippedNonWorking += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'weekend' });
        continue;
      }
      if (holidaySet.has(dateKey)) {
        result.skippedNonWorking += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'holiday' });
        continue;
      }
      const leave = (leaveByEmp.get(empIdStr) || []).some(l => l.start <= dateKey && dateKey <= l.end);
      if (leave) {
        result.skippedLeave += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'on approved leave' });
        continue;
      }

      // Management has its own fixed attendance schedule. Company policy or
      // employee shift assignments must not change these scheduled punches.
      const window = {
        startMinutes: 9 * 60 + 30,
        endMinutes: 18 * 60 + 30,
        breakMinutes: 60,
        source: 'management standard 09:30-18:30',
      };
      const autoCheckIn = localInstant(dateKey, window.startMinutes, tzOffset);
      const autoCheckOut = localInstant(dateKey, window.endMinutes, tzOffset);
      const row = rowByKey.get(`${empIdStr}|${dateKey}`);
      const isToday = dateKey === opts.todayKey;
      const due = (minutes: number) => !isToday || todayLocalMinutes >= minutes;
      const dueCheckIn = due(9 * 60 + 30);
      const dueBreakIn = due(13 * 60 + 30);
      const dueBreakOut = due(14 * 60 + 30);
      const dueCheckOut = due(18 * 60 + 30);

      // Do not create future management punches. Today progresses one scheduled
      // field at a time; past dates are fully auto-presented for reporting.
      if (isToday && !dueCheckIn) {
        result.skippedFuture += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'before 09:30 management check-in time' });
        continue;
      }

      if (!row) {
        const checkIn = dueCheckIn ? autoCheckIn : null;
        const breakIn = dueBreakIn ? localInstant(dateKey, 13 * 60 + 30, tzOffset) : null;
        const breakOut = dueBreakOut ? localInstant(dateKey, 14 * 60 + 30, tzOffset) : null;
        const checkOut = dueCheckOut ? autoCheckOut : null;
        const breakMinutes = breakIn && breakOut ? 60 : 0;
        const workHours = checkIn && checkOut ? Math.max(0, ((checkOut.getTime() - checkIn.getTime()) / 60000 - Math.max(60, breakMinutes)) / 60) : null;
        try {
          await db.attendance.create({
            data: {
              employeeId: empIdStr,
              date: new Date(`${dateKey}T00:00:00.000Z`),
              checkIn,
              checkOut,
              breakIn,
              breakOut,
              breakMinutes,
              status: 'present',
              workHours: workHours == null ? null : Math.round(workHours * 100) / 100,
              notes: `Auto-present (management rule · ${window.source})`,
              punchMethod: 'auto',
            },
          });
        } catch (rowErr: unknown) {
          // Unique-constraint race (employee punched while the engine ran):
          // leave the winner untouched and report the skip.
          result.skippedPunched += 1;
          result.details.push({ ...base, action: 'skipped', reason: `row appeared during run (${rowErr instanceof Error ? rowErr.message.slice(0, 80) : 'conflict'})` });
          continue;
        }
        result.created += 1;
        result.details.push({
          ...base, action: 'created', checkIn: checkIn?.toISOString() || null, breakIn: breakIn?.toISOString() || null,
          breakOut: breakOut?.toISOString() || null, checkOut: checkOut?.toISOString() || null,
        });
        continue;
      }

      // For today, fill only scheduled fields whose clock time has arrived.
      if (isToday) {
        const patch: Record<string, unknown> = {};
        if (!row.checkIn && dueCheckIn) patch.checkIn = autoCheckIn;
        if (!row.breakIn && dueBreakIn) patch.breakIn = localInstant(dateKey, 13 * 60 + 30, tzOffset);
        if (!row.breakOut && dueBreakOut) patch.breakOut = localInstant(dateKey, 14 * 60 + 30, tzOffset);
        if (!row.checkOut && dueCheckOut) patch.checkOut = autoCheckOut;
        if (Object.keys(patch).length) {
          if (patch.breakIn && patch.breakOut) patch.breakMinutes = 60;
          if (patch.checkIn && patch.checkOut) {
            const start = new Date((patch.checkIn || row.checkIn) as Date).getTime();
            const end = new Date((patch.checkOut || row.checkOut) as Date).getTime();
            patch.workHours = Math.round(Math.max(0, ((end - start) / 60000 - 60) / 60) * 100) / 100;
          }
          await db.attendance.update({ where: { id: String(row.id) }, data: patch });
          result.updated += 1;
        }
        continue;
      }

      const status = String(row.status || '');
      const hasIn = !!row.checkIn;
      const hasOut = !!row.checkOut;

      if (status === 'on_leave' || status === 'holiday' || status === 'weekend') {
        result.skippedLeave += 1;
        result.details.push({ ...base, action: 'skipped', reason: `row status ${status}` });
        continue;
      }
      if (hasIn && hasOut) {
        result.skippedPunched += 1;
        result.details.push({ ...base, action: 'skipped', reason: 'already punched in and out' });
        continue;
      }
      if (!hasIn && !hasOut) {
        // Explicit absent/blank row — flip to present with auto punches.
        const workHours = Math.max(0, ((window.endMinutes - window.startMinutes) - window.breakMinutes) / 60);
        try {
          await db.attendance.update({
            where: { id: String(row.id) },
            data: {
              checkIn: autoCheckIn,
              checkOut: autoCheckOut,
              status: 'present',
              workHours: Math.round(workHours * 100) / 100,
              notes: `Auto-present (management rule · ${window.source})`,
              punchMethod: 'auto',
            },
          });
        } catch {
          result.skippedPunched += 1;
          result.details.push({ ...base, action: 'skipped', reason: 'update conflict — row changed during run' });
          continue;
        }
        result.updated += 1;
        result.details.push({
          ...base, action: 'updated', reason: 'no punches recorded',
          checkIn: autoCheckIn.toISOString(), checkOut: autoCheckOut.toISOString(),
        });
        continue;
      }
      // hasIn && !hasOut → forgot to punch out: fill only the check-out half.
      if (hasIn && !hasOut) {
        const checkInAt = new Date(row.checkIn);
        const outAt = autoCheckOut.getTime() > checkInAt.getTime() ? autoCheckOut : new Date(checkInAt.getTime() + 9 * 3600000);
        const workHours = (outAt.getTime() - checkInAt.getTime()) / 3600000;
        try {
          await db.attendance.update({
            where: { id: String(row.id) },
            data: {
              checkOut: outAt,
              workHours: Math.round(Math.max(0, workHours) * 100) / 100,
              notes: 'Auto check-out (management rule)',
            },
          });
        } catch {
          result.skippedPunched += 1;
          result.details.push({ ...base, action: 'skipped', reason: 'update conflict — row changed during run' });
          continue;
        }
        result.updated += 1;
        result.details.push({ ...base, action: 'updated', reason: 'check-out missing — filled from shift end', checkOut: outAt.toISOString() });
        continue;
      }
      // checkOut without checkIn — leave untouched (unusual, needs regularization).
      result.skippedPunched += 1;
      result.details.push({ ...base, action: 'skipped', reason: 'check-out without check-in — needs regularization' });
    }
  }

  return result;
}

/** Weekend DOW list — direct import kept out of the hot path signature. */
async function getWeekendDaysSafe(db: unknown, companyId: string | null): Promise<number[]> {
  try {
    const { getWeekendDays } = await import('@/lib/working-days');
    return await getWeekendDays(db, null, companyId);
  } catch {
    return [0, 6];
  }
}

export { instantDateKey };
