import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/candidate-portal/onboarding — candidate's onboarding data (incl. attendance + leave when Employee exists) */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate')
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    const candidateEmail = (decoded as any).email as string;

    const pbRows = await db.$queryRawUnsafe(
      `SELECT * FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 1`, candidateEmail.toLowerCase(),
    ).catch(() => []) as any[];
    if (pbRows.length === 0)
      return NextResponse.json({ error: 'Not in onboarding pipeline', code: 'NOT_IN_ONBOARDING' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    const docs = await db.$queryRawUnsafe(
      `SELECT * FROM "OnboardingDocument" WHERE "preboardingCandidateId" = $1 ORDER BY "createdAt" ASC`, pb.id,
    ).catch(() => []) as any[];

    // Resolve department + designation names
    let departmentName = null, designationName = null;
    if (pb.departmentId) { try { const r = await db.$queryRawUnsafe(`SELECT name FROM "Department" WHERE id=$1 LIMIT 1`, pb.departmentId) as any[]; departmentName = r[0]?.name||null; } catch {} }
    if (pb.designationId) { try { const r = await db.$queryRawUnsafe(`SELECT title FROM "Designation" WHERE id=$1 LIMIT 1`, pb.designationId) as any[]; designationName = r[0]?.title||null; } catch {} }

    let employeeCode = null;
    let attendanceSummary: any = null;
    let leaveBalances: any = null;
    let recentAttendance: any[] = [];

    // ─── If linked Employee exists, fetch attendance + leave ───
    if (pb.employeeId) {
      try {
        const empRows = await db.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "id"=$1 LIMIT 1`, pb.employeeId) as any[];
        const emp = empRows[0];
        if (emp) {
          employeeCode = emp.employeeId;

          // Only show attendance + leave if Employee has a non-PROV employeeId OR is in provisional_employee state
          // (so before mark-joined, the candidate sees no attendance/leave yet)
          const isProvisionalOrActive = pb.onboardingStatus === 'provisional_employee' || pb.onboardingStatus === 'active_employee';
          if (isProvisionalOrActive) {
            // Last 30 days attendance summary
            try {
              const attSummary = await db.$queryRawUnsafe(
                `SELECT
                   status,
                   COUNT(*)::int AS count
                 FROM "Attendance"
                 WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days'
                 GROUP BY status`,
                emp.id,
              ) as any[];
              const totalRow = await db.$queryRawUnsafe(
                `SELECT COUNT(*)::int AS total FROM "Attendance" WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days'`,
                emp.id,
              ) as any[];
              attendanceSummary = {
                last30Days: attSummary.reduce((acc: Record<string, number>, row: any) => {
                  acc[row.status] = row.count; return acc;
                }, {}),
                totalRecords: totalRow[0]?.total || 0,
              };
            } catch {}

            // Recent attendance records (last 10)
            try {
              recentAttendance = await db.$queryRawUnsafe(
                `SELECT "date", status, "checkInTime", "checkOutTime", "workHours", "lateMinutes"
                 FROM "Attendance"
                 WHERE "employeeId" = $1
                 ORDER BY "date" DESC
                 LIMIT 10`,
                emp.id,
              ) as any[];
            } catch {}

            // Leave balances for current year
            try {
              const year = new Date().getFullYear();
              const leaveRows = await db.$queryRawUnsafe(
                `SELECT lb.id, lb.total, lb.used, lb."carryForward", lb.year,
                        lt.id AS "leaveTypeId", lt.name AS "leaveTypeName", lt.code AS "leaveTypeCode"
                 FROM "LeaveBalance" lb
                 LEFT JOIN "LeaveType" lt ON lt.id = lb."leaveTypeId"
                 WHERE lb."employeeId" = $1 AND lb.year = $2
                 ORDER BY lt.name ASC`,
                emp.id, year,
              ) as any[];
              leaveBalances = leaveRows.map((r: any) => ({
                id: r.id, leaveTypeName: r.leaveTypeName || 'Leave',
                leaveTypeCode: r.leaveTypeCode, year: r.year,
                total: r.total || 0, used: r.used || 0,
                remaining: (r.total || 0) - (r.used || 0),
                carryForward: r.carryForward || 0,
              }));
            } catch {}
          }
        }
      } catch {}
    }

    return NextResponse.json({
      preboardingCandidateId: pb.id,
      candidateName: pb.candidateName,
      candidateEmail: pb.candidateEmail,
      jobTitle: pb.jobTitle || null,
      department: departmentName,
      designation: designationName,
      employmentType: pb.employmentType || 'full-time',
      ctc: pb.ctc || pb.offeredSalary || null,
      workLocation: pb.workLocation || null,
      joiningDate: pb.joiningDate || null,
      companyEmail: pb.companyEmail || null,
      onboardingStatus: pb.onboardingStatus || 'pending',
      bgvStatus: pb.backgroundCheckStatus || 'pending',
      bgvNotes: pb.bgvNotes || null,
      employeeId: employeeCode,
      activatedAt: pb.activatedAt || null,
      documents: docs.map((d:any) => ({
        id: d.id, documentType: d.documentType, documentLabel: d.documentLabel,
        fileUrl: d.fileUrl, fileName: d.fileName, fileSize: d.fileSize, mimeType: d.mimeType,
        status: d.status, reviewedAt: d.reviewedAt, reviewNotes: d.reviewNotes, uploadedAt: d.uploadedAt,
      })),
      attendanceSummary,
      recentAttendance,
      leaveBalances,
    }, { headers: CORS });
  } catch (error) {
    console.error('Candidate onboarding GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
