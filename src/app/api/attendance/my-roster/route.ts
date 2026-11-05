/**
 * My Duty Roster API — self-service view of the duty roster for EMPLOYEES and
 * MANAGERS (read-only; HR/Admin keep the full scheduler at
 * /attendance/duty-roster + /api/attendance/duty-roster).
 *
 * GET ?month=YYYY-MM[&employeeId=…][&companyId=…]
 *   → { viewer, people, shifts, calendar, days }
 *
 * Scope rules:
 *   - admin/HR roles  : any one employee (employeeId=…) or the whole active
 *                       workforce (no employeeId) — mirrors the admin GET.
 *   - manager / other : the caller's OWN roster plus their reportees
 *                       (solid line via Employee.reportingManagerId + dotted
 *                       line via DottedLineManager — exactly resolveManagerScope).
 *                       An explicit employeeId outside that scope → 403.
 *   - employee        : own roster only.
 *
 * The per-date resolution is a faithful replica of the rotation math both the
 * admin duty-roster route and src/lib/attendance-shift.ts
 * loadEmployeeShiftWindows use (latest-startDate-wins assignment, elapsed-days
 * from the roster anchor, index into the Mon..Sun pattern) — so employees see
 * exactly the shift the punch-evaluation engine will apply.
 */
import { requireUser, isAdminRole, ok, fail } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';

const MONTH_RE = /^\d{4}-\d{2}$/;
const INACTIVE_STATUSES = ['inactive', 'terminated', 'resigned'];

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

/* ── roster table self-heal — same statements as /api/attendance/duty-roster
      (kept in sync; Next.js route files cannot export shared helpers) ── */

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

interface PersonRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  relationship: 'self' | 'reportee';
}

interface EmployeeLite {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
}

/** Resolve ONE date from ONE assignment — replica of the admin route's resolveCell. */
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

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;

  try {
    await ensureRosterTables(db);

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    if (!MONTH_RE.test(month)) return fail('month must be YYYY-MM', 422);
    const requestedEmployeeId = (url.searchParams.get('employeeId') || '').trim();

    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days: string[] = [];
    for (let d = 1; d <= lastDay; d++) days.push(`${month}-${String(d).padStart(2, '0')}`);

    const admin = isAdminRole(user.role);

    // ── resolve the caller's own employee record ──
    // JWT payload is { userId, email, role, tenantId } — userId is the User id.
    const jwtUserId = (user as Record<string, unknown>).userId || user.id;
    const ownEmployee = jwtUserId
      ? (await db.employee.findFirst({
          where: { userId: jwtUserId },
          select: { id: true, firstName: true, lastName: true, employeeId: true, status: true },
        })) as { id: string; firstName: string; lastName: string; employeeId: string; status: string } | null
      : null;

    // ── determine the visible employee set ──
    let scopedEmployeeIds: string[] = [];
    let people: PersonRow[] = [];
    const viewer: { employeeId: string | null; employeeName: string; isManager: boolean; isAdmin: boolean } = {
      employeeId: ownEmployee?.id || null,
      employeeName: ownEmployee ? `${ownEmployee.firstName} ${ownEmployee.lastName}`.trim() : (user.email || 'User'),
      isManager: false,
      isAdmin: admin,
    };

    if (admin) {
      if (requestedEmployeeId) {
        const one = (await db.employee.findUnique({
          where: { id: requestedEmployeeId },
          select: { id: true, firstName: true, lastName: true, employeeId: true, status: true },
        })) as EmployeeLite | null;
        if (!one) return fail('Employee not found', 404);
        scopedEmployeeIds = [one.id];
        people = [{ employeeId: one.id, employeeCode: one.employeeId, employeeName: `${one.firstName} ${one.lastName}`.trim(), relationship: ownEmployee?.id === one.id ? 'self' : 'reportee' }];
      } else {
        // No employeeId → the whole active workforce (same as the admin GET).
        const all = (await db.employee.findMany({
          where: { status: { notIn: INACTIVE_STATUSES } },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        })) as EmployeeLite[];
        scopedEmployeeIds = all.map(e => e.id);
        people = all.map(e => ({
          employeeId: e.id,
          employeeCode: e.employeeId,
          employeeName: `${e.firstName} ${e.lastName}`.trim(),
          relationship: (ownEmployee?.id === e.id ? 'self' : 'reportee') as 'self' | 'reportee',
        }));
      }
    } else {
      if (!ownEmployee) {
        // No employee profile linked to this account → nothing to show.
        return ok({ viewer, people: [], shifts: [], calendar: [], days });
      }

      // Solid + dotted reportees — the same resolution the 'team' data scope
      // uses everywhere else (src/lib/managerScope.ts).
      const directReportees = (await db.employee.findMany({
        where: { reportingManagerId: ownEmployee.id, status: 'active' },
        select: { id: true, firstName: true, lastName: true, employeeId: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })) as EmployeeLite[];

      let dottedReportees: EmployeeLite[] = [];
      try {
        // DottedLineManager may be absent in some tenant DBs — optional-chained,
        // typed as a minimal finder to avoid blanket `any`.
        const dottedModel = (db as unknown as {
          dottedLineManager?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ employeeId: string }>> };
        }).dottedLineManager;
        const dottedRows = dottedModel ? await dottedModel.findMany({
          where: {
            managerId: ownEmployee.id,
            OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
          },
          select: { employeeId: true },
        }) : [];
        const dottedIds: string[] = (dottedRows || []).map((r) => r.employeeId);
        if (dottedIds.length) {
          dottedReportees = (await db.employee.findMany({
            where: { id: { in: dottedIds }, status: 'active' },
            select: { id: true, firstName: true, lastName: true, employeeId: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          })) as EmployeeLite[];
        }
      } catch {
        dottedReportees = []; // DottedLineManager table might not exist in some tenant DBs
      }

      viewer.isManager = directReportees.length > 0 || dottedReportees.length > 0;

      const visible = new Map<string, PersonRow>();
      visible.set(ownEmployee.id, {
        employeeId: ownEmployee.id,
        employeeCode: ownEmployee.employeeId,
        employeeName: `${ownEmployee.firstName} ${ownEmployee.lastName}`.trim(),
        relationship: 'self',
      });
      for (const r of directReportees) {
        if (!visible.has(r.id)) visible.set(r.id, { employeeId: r.id, employeeCode: r.employeeId, employeeName: `${r.firstName} ${r.lastName}`.trim(), relationship: 'reportee' });
      }
      for (const r of dottedReportees) {
        if (!visible.has(r.id)) visible.set(r.id, { employeeId: r.id, employeeCode: r.employeeId, employeeName: `${r.firstName} ${r.lastName}`.trim(), relationship: 'reportee' });
      }

      if (requestedEmployeeId) {
        const target = visible.get(requestedEmployeeId);
        if (!target) return fail('You can only view the duty roster of yourself and your reportees', 403);
        people = [target];
        scopedEmployeeIds = [target.employeeId];
      } else {
        people = Array.from(visible.values()).sort((a, b) =>
          a.relationship === b.relationship
            ? a.employeeName.localeCompare(b.employeeName)
            : a.relationship === 'self' ? -1 : 1,
        );
        scopedEmployeeIds = people.map(p => p.employeeId);
      }
    }

    // ── shifts + assignments + resolved calendar (same math as the admin GET) ──
    const shifts = (await db.shift.findMany({
      select: { id: true, name: true, code: true, startTime: true, endTime: true, breakDuration: true, status: true },
      orderBy: { name: 'asc' },
    })) as ShiftLite[];
    const shiftsById = new Map(shifts.map(s => [s.id, s]));

    const assignments = scopedEmployeeIds.length
      ? (await db.employeeRosterAssignment.findMany({
          where: { employeeId: { in: scopedEmployeeIds } },
          include: {
            roster: { select: { id: true, name: true, pattern: true, rotationUnit: true, startDate: true, isActive: true } },
          },
          orderBy: { startDate: 'desc' },
        })) as unknown as AssignmentRow[]
      : [];

    const byEmployee = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const list = byEmployee.get(a.employeeId) || [];
      list.push(a);
      byEmployee.set(a.employeeId, list);
    }
    for (const list of byEmployee.values()) {
      list.sort((a, b) => (dateKeyOf(b.startDate) || '').localeCompare(dateKeyOf(a.startDate) || ''));
    }

    const employeeRows = scopedEmployeeIds.length
      ? (await db.employee.findMany({
          where: { id: { in: scopedEmployeeIds } },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })) as EmployeeLite[]
      : [];
    const nameById = new Map(employeeRows.map(e => [e.id, e]));

    const calendar = scopedEmployeeIds.map(employeeId => {
      const emp = nameById.get(employeeId);
      const person = people.find(p => p.employeeId === employeeId);
      const rows = byEmployee.get(employeeId) || [];
      const cells: Record<string, CalendarCell> = {};
      for (const dayKey of days) {
        // Latest-startDate-wins among non-expired assignments — identical to
        // loadEmployeeShiftWindows / the admin duty-roster route.
        const winner = rows.find(a => {
          const endKey = dateKeyOf(a.endDate);
          return !endKey || endKey >= dayKey;
        });
        cells[dayKey] = winner
          ? resolveCell(winner, dayKey, shiftsById)
          : { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' };
      }
      return {
        employeeId,
        employeeCode: person?.employeeCode || emp?.employeeId || '',
        employeeName: person?.employeeName || (emp ? `${emp.firstName} ${emp.lastName}`.trim() : employeeId),
        relationship: person?.relationship || ('reportee' as const),
        days: cells,
      };
    });

    return ok({ viewer, people, shifts, calendar, days });
  } catch (e) {
    console.error('[my-roster] GET error:', e);
    return fail('Failed to load your duty roster', 500);
  }
}
