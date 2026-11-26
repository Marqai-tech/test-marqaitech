/**
 * Candidate Portal — Attendance Module
 *
 * GET /api/candidate-portal/attendance
 *   Candidate JWT (kind === 'candidate').
 *
 * BRD (E2E audit): once preboarding is INITIATED, the Attendance module becomes
 * accessible in the candidate portal. Two modes:
 *  - provisional (preboarding started, employee not created yet):
 *      joining details, shift/reporting time, upcoming holidays. Punching /
 *      records start from the joining date.
 *  - full (Employee linked, onboardingStatus provisional_employee/active_employee):
 *      last-30-days attendance summary, recent records, today's status.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate')
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    const candidateEmail = String((decoded as any).email || '').toLowerCase();

    const pbRows = await db.$queryRawUnsafe(
      `SELECT * FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 1`, candidateEmail,
    ).catch(() => []) as any[];
    const pb = pbRows[0];
    if (!pb)
      return NextResponse.json({ error: 'Not in onboarding pipeline', code: 'NOT_IN_ONBOARDING' }, { status: 404, headers: CORS });

    const onboardingStatus = String(pb.onboardingStatus || 'bgv_pending');
    const isFullEmployee = Boolean(pb.employeeId) && ['provisional_employee', 'active_employee'].includes(onboardingStatus);

    let upcomingHolidays: any[] = [];
    try {
      const hRows = await db.$queryRawUnsafe(
        `SELECT id, name, date, type FROM "Holiday" WHERE date >= CURRENT_DATE ORDER BY date ASC LIMIT 5`,
      ) as any[];
      upcomingHolidays = hRows.map(h => ({ id: h.id, name: h.name, date: h.date, type: h.type }));
    } catch { /* ignore */ }

    if (isFullEmployee) {
      const empRows = await db.$queryRawUnsafe(`SELECT id, "employeeId" FROM "Employee" WHERE id = $1 LIMIT 1`, pb.employeeId).catch(() => []) as any[];
      const emp = empRows[0];
      if (emp) {
        let last30Days: Record<string, number> = {};
        let totalRecords = 0;
        try {
          const attSummary = await db.$queryRawUnsafe(
            `SELECT status, COUNT(*)::int AS count FROM "Attendance"
             WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days' GROUP BY status`, emp.id,
          ) as any[];
          last30Days = attSummary.reduce((acc: Record<string, number>, row: any) => { acc[row.status] = row.count; return acc; }, {});
          const totalRow = await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS total FROM "Attendance" WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days'`, emp.id,
          ) as any[];
          totalRecords = totalRow[0]?.total || 0;
        } catch { /* Attendance may not exist yet */ }

        let recent: any[] = [];
        try {
          const rows = await db.$queryRawUnsafe(
            `SELECT "date", status, "checkInTime", "checkOutTime", "workHours", "lateMinutes"
             FROM "Attendance" WHERE "employeeId" = $1 ORDER BY "date" DESC LIMIT 10`, emp.id,
          ) as any[];
          recent = rows;
        } catch { /* ignore */ }

        return NextResponse.json({
          enabled: true, mode: 'full', onboardingStatus,
          employeeCode: emp.employeeId,
          joiningDate: pb.joiningDate || null,
          summary: last30Days, totalRecords, recentAttendance: recent,
          upcomingHolidays,
        }, { headers: CORS });
      }
    }

    // ── Provisional mode ──
    return NextResponse.json({
      enabled: true, mode: 'provisional', onboardingStatus,
      joiningDate: pb.joiningDate || null,
      preboardingStage: pb.preboardingStage || null,
      workLocation: pb.workLocation || null,
      workMode: pb.workMode || null,
      employmentType: pb.employmentType || null,
      summary: {}, totalRecords: 0, recentAttendance: [],
      upcomingHolidays,
      note: 'Attendance tracking activates from your joining date. Your schedule and work location details are shown below.',
    }, { headers: CORS });
  } catch (error) {
    console.error('[candidate-portal/attendance] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
