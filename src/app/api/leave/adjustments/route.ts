import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

// GET — list adjustments (filtered by status/employee/type)
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { params.push(status); where += ` AND la."status" = $${params.length}`; }
    if (employeeId) { params.push(employeeId); where += ` AND la."employeeId" = $${params.length}`; }
    // Scope: employees see only their own; managers/admins see all
    if (scope.scope === 'self') {
      params.push(scope.userId); where += ` AND la."employeeId" IN (SELECT id FROM "Employee" WHERE "userId" = $${params.length})`;
    }

    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT la.*, e."firstName", e."lastName", e."employeeId" as empCode,
             lt."name" as leaveTypeName, lt."code" as leaveTypeCode, lt."calendarColor"
      FROM "LeaveAdjustment" la
      JOIN "Employee" e ON la."employeeId" = e."id"
      JOIN "LeaveType" lt ON la."leaveTypeId" = lt."id"
      ${where}
      ORDER BY la."createdAt" DESC LIMIT 100
    `, ...params);

    return NextResponse.json({ data: rows }, { headers: cors() });
  } catch (error) {
    console.error('[adjustments GET] error:', error);
    return NextResponse.json({ data: [] }, { headers: cors() });
  }
}

// POST — create a new adjustment request
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));

    const body = await req.json();
    const { employeeId, leaveTypeId, shortfallDays, modeA, modeADays, modeB, modeBDonorTypeId, modeBDays, reason, leaveRequestId } = body;

    if (!employeeId || !leaveTypeId || !shortfallDays) {
      return NextResponse.json({ error: 'employeeId, leaveTypeId and shortfallDays are required' }, { status: 400, headers: cors() });
    }

    const id = `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "LeaveAdjustment" ("id", "employeeId", "leaveTypeId", "leaveRequestId", "shortfallDays",
        "modeA", "modeADays", "modeB", "modeBDonorTypeId", "modeBDays", "status", "reason", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, NOW(), NOW())`,
      id, employeeId, leaveTypeId, leaveRequestId || null, shortfallDays,
      modeA || false, modeADays || 0, modeB || false, modeBDonorTypeId || null, modeBDays || 0, reason || null
    );

    return NextResponse.json({ id, status: 'pending' }, { status: 201, headers: cors() });
  } catch (error) {
    console.error('[adjustments POST] error:', error);
    return NextResponse.json({ error: 'Failed to create adjustment' }, { status: 500, headers: cors() });
  }
}
