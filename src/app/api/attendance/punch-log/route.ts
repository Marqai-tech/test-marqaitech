import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { getDataScope } from '@/lib/roleAccess';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Ensure the Task 57 columns exist on the Attendance table before we run
 * any Prisma findMany that references them. Without this, the demo tenant
 * DB (which hasn't been migrated) throws "column (not available) does not
 * exist" the first time the route is hit. Idempotent ALTER TABLE ADD COLUMN
 * IF NOT EXISTS — runs in ~10ms after the first call.
 */
async function ensureAttendanceColumns(db: any) {
  const cols: [string, string][] = [
    ['"breakIn"', 'TIMESTAMP(3)'],
    ['"breakOut"', 'TIMESTAMP(3)'],
    ['"breakMinutes"', 'INTEGER'],
    ['"checkInGpsLat"', 'DOUBLE PRECISION'],
    ['"checkInGpsLng"', 'DOUBLE PRECISION'],
    ['"checkInGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"checkInGpsLabel"', 'TEXT'],
    ['"checkOutGpsLat"', 'DOUBLE PRECISION'],
    ['"checkOutGpsLng"', 'DOUBLE PRECISION'],
    ['"checkOutGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"checkOutGpsLabel"', 'TEXT'],
    ['"breakInGpsLat"', 'DOUBLE PRECISION'],
    ['"breakInGpsLng"', 'DOUBLE PRECISION'],
    ['"breakInGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"breakInGpsLabel"', 'TEXT'],
    ['"breakOutGpsLat"', 'DOUBLE PRECISION'],
    ['"breakOutGpsLng"', 'DOUBLE PRECISION'],
    ['"breakOutGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"breakOutGpsLabel"', 'TEXT'],
    ['"punchMethod"', 'TEXT'],
  ];
  for (const [col, type] of cols) {
    await db.$executeRawUnsafe(`ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS ${col} ${type}`).catch(() => null);
  }
}

/**
 * GET /api/attendance/punch-log?employeeId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=...
 *
 * Returns the per-employee punch activity log: one row per punch event
 * (check-in / check-out / break-in / break-out) with the GPS coordinates
 * captured at each event + the working-hours summary per day. Used by the
 * "Activity Log" report under the Attendance module (Task 57).
 *
 * Self-scope users get only their own log; team scope gets their dept;
 * admin scope gets all. The response is grouped by day for the UI, with
 * totals (workHours / breakMinutes / overtime) per day.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const scope = await resolveCompanyScope(request);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    // Idempotent schema sync — the demo tenant DB may not have the Task 57
    // columns (breakIn, breakOut, GPS, punchMethod) yet. ALTER TABLE ADD
    // COLUMN IF NOT EXISTS is safe to run on every request.
    await ensureAttendanceColumns(db);

    const { searchParams } = new URL(request.url);
    const filterEmployeeId = searchParams.get('employeeId') || '';
    const fromStr = searchParams.get('from') || '';
    const toStr = searchParams.get('to') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 2000);

    // Build employee filter
    const userRole = decoded.role as string || 'employee';
    const dataScope = getDataScope(userRole);
    let empFilter: Record<string, unknown> = { status: 'active' };
    if (dataScope === 'self') {
      empFilter = { userId: scope.userId, status: 'active' };
    } else if (dataScope === 'team') {
      const ownEmp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) empFilter = { departmentId: ownEmp.departmentId, status: 'active' };
    } else if (scope.companyId) {
      empFilter = { companyId: scope.companyId, status: 'active' };
    }

    // Fetch the active employees in scope (so we can join names)
    const employees = await db.employee.findMany({
      where: empFilter,
      select: { id: true, employeeId: true, firstName: true, lastName: true, userId: true,
        department: { select: { name: true } } },
      take: 500,
    });
    const empMap = new Map(employees.map(e => [e.id, e]));
    let empIds = employees.map(e => e.id);

    // If a specific employee is requested, narrow to that
    if (filterEmployeeId) empIds = empIds.filter(id => id === filterEmployeeId);

    if (empIds.length === 0) {
      return NextResponse.json({ events: [], days: [], summary: { totalEvents: 0, totalWorkHours: 0, totalBreakMinutes: 0 } }, { headers: corsHeaders() });
    }

    // Date range (default = last 30 days)
    const today = new Date();
    const toDate = toStr ? new Date(`${toStr}T23:59:59Z`) : today;
    const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : new Date(today.getTime() - 30 * 86400000);

    // Fetch PunchEvent rows (one per punch action — checkin/checkout/breakin/breakout)
    // Also fetch Attendance rows for the daily summary (workHours, breakMinutes, overtime)
    const [events, attRows] = await Promise.all([
      db.$queryRawUnsafe(
        `SELECT e."id", e."employeeId", e."type", e."date", e."timestamp", e."gpsLat", e."gpsLng",
                e."gpsAccuracy", e."gpsLabel", e."method", e."notes", e."deviceId", e."createdAt"
         FROM "PunchEvent" e
         WHERE e."employeeId" = ANY($1::text[])
           AND e."timestamp" >= $2
           AND e."timestamp" <= $3
         ORDER BY e."timestamp" DESC
         LIMIT $4`,
        empIds,
        fromDate,
        toDate,
        limit,
      ).catch(() => []) as any[],
      db.attendance.findMany({
        where: {
          employeeId: { in: empIds },
          date: { gte: fromDate, lte: toDate },
        },
        select: {
          employeeId: true, date: true, checkIn: true, checkOut: true,
          workHours: true, overtime: true, breakIn: true, breakOut: true,
          breakMinutes: true, status: true, location: true,
        },
      }),
    ]);

    // Build per-day summary from attendance rows
    const daysMap = new Map<string, any>();
    for (const a of attRows) {
      const ds = new Date(a.date).toISOString().split('T')[0];
      const emp = empMap.get(a.employeeId);
      if (!emp) continue;
      const key = `${a.employeeId}|${ds}`;
      daysMap.set(key, {
        employeeId: a.employeeId,
        employeeCode: emp.employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        department: emp.department?.name || '—',
        date: ds,
        checkIn: a.checkIn ? new Date(a.checkIn).toISOString() : null,
        checkOut: a.checkOut ? new Date(a.checkOut).toISOString() : null,
        breakIn: a.breakIn ? new Date(a.breakIn).toISOString() : null,
        breakOut: a.breakOut ? new Date(a.breakOut).toISOString() : null,
        breakMinutes: a.breakMinutes ?? 0,
        workHours: a.workHours ?? 0,
        overtime: a.overtime ?? 0,
        status: a.status,
        location: a.location || null,
      });
    }

    // Map events to include employee info
    const eventsOut = (events || []).map((e: any) => {
      const emp = empMap.get(e.employeeId);
      return {
        id: e.id,
        employeeId: e.employeeId,
        employeeCode: emp?.employeeId || '—',
        employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : '—',
        department: emp?.department?.name || '—',
        type: e.type,  // checkin / checkout / breakin / breakout
        date: e.date ? new Date(e.date).toISOString().split('T')[0] : null,
        timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
        gps: (e.gpsLat != null && e.gpsLng != null) ? {
          lat: e.gpsLat, lng: e.gpsLng, accuracy: e.gpsAccuracy, label: e.gpsLabel,
        } : null,
        method: e.method,
        notes: e.notes,
        deviceId: e.deviceId,
      };
    });

    // Summary totals
    const totalWorkHours = Array.from(daysMap.values()).reduce((s, d) => s + (d.workHours || 0), 0);
    const totalBreakMinutes = Array.from(daysMap.values()).reduce((s, d) => s + (d.breakMinutes || 0), 0);
    const totalOvertime = Array.from(daysMap.values()).reduce((s, d) => s + (d.overtime || 0), 0);

    return NextResponse.json({
      events: eventsOut,
      days: Array.from(daysMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
      summary: {
        totalEvents: eventsOut.length,
        totalDays: daysMap.size,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
        totalBreakMinutes,
        totalOvertime: Math.round(totalOvertime * 10) / 10,
      },
      dataScope: dataScope,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('GET /api/attendance/punch-log error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500, headers: corsHeaders() });
  }
}
