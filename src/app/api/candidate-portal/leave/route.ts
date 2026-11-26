/**
 * Candidate Portal — Leave Module
 *
 * GET /api/candidate-portal/leave
 *   Candidate JWT (kind === 'candidate').
 *
 * BRD (E2E audit): once preboarding is INITIATED, the Leave module becomes
 * accessible in the candidate portal. Two modes:
 *  - provisional (preboarding started, employee not created yet):
 *      shows the leave types the candidate will be eligible for after joining
 *      (policy preview), upcoming holidays, and the joining date. Applying is
 *      disabled until joining.
 *  - full (Employee linked, onboardingStatus provisional_employee/active_employee):
 *      real LeaveBalance rows for the current year + the candidate's leave
 *      requests history.
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

    const year = new Date().getFullYear();
    const onboardingStatus = String(pb.onboardingStatus || 'bgv_pending');
    const isFullEmployee = Boolean(pb.employeeId) && ['provisional_employee', 'active_employee'].includes(onboardingStatus);

    // ── Holidays: next 5 upcoming ──
    let upcomingHolidays: any[] = [];
    try {
      const hRows = await db.$queryRawUnsafe(
        `SELECT id, name, date, type, "isOptional" FROM "Holiday"
          WHERE date >= CURRENT_DATE ORDER BY date ASC LIMIT 5`,
      ) as any[];
      upcomingHolidays = hRows.map(h => ({ id: h.id, name: h.name, date: h.date, type: h.type, isOptional: h.isOptional }));
    } catch { /* Holiday table may vary */ }

    if (isFullEmployee) {
      // ── Full employee mode: real balances + request history ──
      const empRows = await db.$queryRawUnsafe(`SELECT id, "employeeId", "firstName", "lastName" FROM "Employee" WHERE id = $1 LIMIT 1`, pb.employeeId).catch(() => []) as any[];
      const emp = empRows[0];
      if (emp) {
        let balances: any[] = [];
        try {
          const balRows = await db.$queryRawUnsafe(
            `SELECT lb.id, lb.total, lb.used, lb.remaining, lb."carryForward", lb.year,
                    lt.name AS "leaveTypeName", lt.code AS "leaveTypeCode", lt."isPaid"
             FROM "LeaveBalance" lb LEFT JOIN "LeaveType" lt ON lt.id = lb."leaveTypeId"
             WHERE lb."employeeId" = $1 AND lb.year = $2 ORDER BY lt.name ASC`,
            emp.id, year,
          ) as any[];
          balances = balRows.map(b => ({
            id: b.id, leaveTypeName: b.leaveTypeName || 'Leave', leaveTypeCode: b.leaveTypeCode,
            year: b.year, total: Number(b.total || 0), used: Number(b.used || 0),
            remaining: Number(b.remaining ?? (b.total || 0) - (b.used || 0)), carryForward: Number(b.carryForward || 0), isPaid: b.isPaid,
          }));
        } catch { /* balances table may not exist yet */ }

        let myLeaves: any[] = [];
        try {
          const lvRows = await db.$queryRawUnsafe(
            `SELECT lr.id, lr."startDate", lr."endDate", lr.status, lr.reason, lr."halfDay",
                    lt.name AS "leaveTypeName"
             FROM "LeaveRequest" lr LEFT JOIN "LeaveType" lt ON lt.id = lr."leaveTypeId"
             WHERE lr."employeeId" = $1 ORDER BY lr."startDate" DESC LIMIT 20`,
            emp.id,
          ) as any[];
          myLeaves = lvRows.map(l => ({
            id: l.id, leaveTypeName: l.leaveTypeName || 'Leave',
            startDate: l.startDate, endDate: l.endDate, status: l.status,
            reason: l.reason, halfDay: l.halfDay,
          }));
        } catch { /* LeaveRequest may not exist yet */ }

        return NextResponse.json({
          enabled: true, mode: 'full', onboardingStatus,
          employeeCode: emp.employeeId,
          joiningDate: pb.joiningDate || null,
          balances, myLeaves, upcomingHolidays,
        }, { headers: CORS });
      }
    }

    // ── Provisional mode: preboarding started, employee not created yet ──
    let balances: any[] = [];
    try {
      // Company-scoped when the preboarding record carries a company, so the
      // candidate only sees THEIR company's leave types (master-data hygiene).
      const ltRows = pb.companyId
        ? await db.$queryRawUnsafe(
            `SELECT id, name, code, "defaultDays", "isPaid", "probationRestricted"
             FROM "LeaveType" WHERE status = 'active' AND "companyId" = $1 ORDER BY name ASC LIMIT 20`,
            pb.companyId,
          ) as any[]
        : await db.$queryRawUnsafe(
            `SELECT id, name, code, "defaultDays", "isPaid", "probationRestricted"
             FROM "LeaveType" WHERE status = 'active' ORDER BY name ASC LIMIT 20`,
          ) as any[];
      balances = ltRows.map(t => ({
        leaveTypeId: t.id, leaveTypeName: t.name, leaveTypeCode: t.code,
        eligibleAfterJoining: true, annualQuota: Number(t.defaultDays || 0),
        isPaid: t.isPaid, probationRestricted: t.probationRestricted,
        total: 0, used: 0, remaining: 0,
      }));
    } catch { /* LeaveType may not exist on very old tenants */ }

    return NextResponse.json({
      enabled: true, mode: 'provisional', onboardingStatus,
      joiningDate: pb.joiningDate || null,
      preboardingStage: pb.preboardingStage || null,
      balances, myLeaves: [], upcomingHolidays,
      note: 'Leave balances are activated from your joining date. Until then you can preview the leave types and policies available to you.',
    }, { headers: CORS });
  } catch (error) {
    console.error('[candidate-portal/leave] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
