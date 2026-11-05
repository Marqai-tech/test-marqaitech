/**
 * Task 133 — per-employee shift assignments (tenant admin UI).
 *
 * GET    /api/shifts/assignments            → all assignments for the company
 *                                             (shift + employee joined).
 * POST   { employeeId, shiftId }            → assign ONE employee to a shift.
 *                                             Replaces any previous assignment
 *                                             for that employee (a fixed
 *                                             single-shift roster is created
 *                                             per employee, so the attendance
 *                                             engine resolves exactly one
 *                                             window).
 * DELETE ?assignmentId=                     → remove an assignment.
 *
 * Storage reuses the roster machinery the attendance engine already reads
 * (RotationalRoster pattern=[shiftId] rotationUnit='day' +
 * EmployeeRosterAssignment), so auto-present, biometric sync, manual punches
 * and the shifts page all agree on one source of truth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getCompanyFilter } from '@/lib/companyScope';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

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

export async function GET(req: NextRequest) {
  try {
    const db = await getDb(req);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    await ensureRosterTables(db as any);

    // Company scope: assignments of employees in the selected company.
    const companyMatch = typeof companyFilter === 'object' && companyFilter !== null && 'companyId' in companyFilter
      ? String((companyFilter as { companyId?: string }).companyId || '')
      : '';
    const rows = (await (db as any).$queryRawUnsafe(`
      SELECT a.id, a."employeeId", a."rosterId", a."currentOffset", a."startDate",
             r.name AS "rosterName", r.pattern AS "rosterPattern",
             s.id AS "shiftId", s.name AS "shiftName", s."startTime", s."endTime",
             e."employeeId" AS "empCode", e."firstName", e."lastName",
             c.id AS "companyId", c.name AS "companyName"
      FROM "EmployeeRosterAssignment" a
      JOIN "RotationalRoster" r ON r.id = a."rosterId"
      LEFT JOIN "Shift" s ON s.id = (CASE WHEN jsonb_typeof(r.pattern) = 'array' AND jsonb_array_length(r.pattern) > 0 THEN r.pattern->>0 ELSE NULL END)
      JOIN "Employee" e ON e.id = a."employeeId"
      LEFT JOIN "Company" c ON c.id = e."companyId"
      ORDER BY e."firstName", e."lastName"`)) as Array<Record<string, unknown>>;

    const filtered = companyMatch ? rows.filter(r => r.companyId === companyMatch) : rows;
    return NextResponse.json({ assignments: filtered }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[shift-assignments] GET error:', error);
    return NextResponse.json({ error: 'Failed to load shift assignments' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb(req);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    await ensureRosterTables(db as any);

    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employeeId || '');
    const shiftId = String(body.shiftId || '');
    if (!employeeId || !shiftId) {
      return NextResponse.json({ error: 'employeeId and shiftId are required' }, { status: 400, headers: corsHeaders() });
    }

    const employee = await (db as any).employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }
    const shift = await (db as any).shift.findUnique({
      where: { id: shiftId },
      select: { id: true, name: true, startTime: true, endTime: true },
    });
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404, headers: corsHeaders() });
    }

    // One fixed-shift roster per (employee, shift); reuse when it exists.
    const rosterName = `Fixed ${shift.name} — ${employee.firstName} ${employee.lastName}`.slice(0, 120);
    let roster = await (db as any).rotationalRoster.findFirst({
      where: { name: rosterName },
      select: { id: true, pattern: true },
    });
    if (roster && JSON.stringify(roster.pattern) !== JSON.stringify([shiftId])) {
      // Stale pattern under the same name — normalize it to this shift.
      await (db as any).rotationalRoster.update({ where: { id: roster.id }, data: { pattern: [shiftId] } });
    }
    if (!roster) {
      roster = await (db as any).rotationalRoster.create({
        data: {
          name: rosterName,
          description: `Fixed ${shift.startTime}–${shift.endTime} shift assigned via the Shifts page`,
          pattern: [shiftId],
          rotationUnit: 'day',
          startDate: new Date(),
          isActive: true,
        },
        select: { id: true },
      });
    }

    // Replace any previous assignment(s) for this employee so exactly ONE
    // active window resolves ("only for this employee").
    await (db as any).employeeRosterAssignment.deleteMany({ where: { employeeId } });
    const assignment = await (db as any).employeeRosterAssignment.create({
      data: {
        employeeId,
        rosterId: roster.id,
        currentOffset: 0,
        startDate: new Date(),
      },
    });

    return NextResponse.json({ assignment, message: `${employee.firstName} assigned to ${shift.name} (${shift.startTime}–${shift.endTime})` }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('[shift-assignments] POST error:', error);
    return NextResponse.json({ error: 'Failed to assign shift' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = await getDb(req);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get('assignmentId');
    if (!assignmentId) {
      return NextResponse.json({ error: 'assignmentId is required' }, { status: 400, headers: corsHeaders() });
    }
    await (db as any).employeeRosterAssignment.delete({ where: { id: assignmentId } }).catch(() => null);
    return NextResponse.json({ message: 'Shift assignment removed' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[shift-assignments] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove shift assignment' }, { status: 500, headers: corsHeaders() });
  }
}
