import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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
 * GET /api/interviews/panel-availability
 *
 * Query params:
 *   - departmentId: the department name or ID (from the job posting)
 *   - date: the interview date (YYYY-MM-DD)
 *   - time: the interview start time (HH:MM)
 *   - duration: interview duration in minutes
 *   - interviewType: technical | hr | ai | offline_panel
 *
 * Returns a list of eligible employees from the department with their
 * availability status: Available | Busy | On Leave | Tentative
 *
 * Availability check combines:
 *   1. Approved leave (LeaveRequest with status='approved' overlapping the date)
 *   2. Existing interviews (Interview on the same date/time)
 *   3. Employee status (must be 'active')
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const url = new URL(req.url);
    const departmentId = url.searchParams.get('departmentId') || '';
    const date = url.searchParams.get('date') || '';
    const time = url.searchParams.get('time') || '';
    const duration = parseInt(url.searchParams.get('duration') || '60');
    const interviewType = url.searchParams.get('interviewType') || 'technical';

    if (!departmentId || !date) {
      return NextResponse.json({ error: 'departmentId and date are required' }, { status: 400, headers: corsHeaders() });
    }

    // 1. Get all employees in the department
    let deptEmployees: any[] = [];
    try {
      // If departmentId looks like a CUID, match by ID; otherwise match by name
      if (departmentId.startsWith('cm')) {
        deptEmployees = await db.$queryRawUnsafe(
          `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                  e."designationId", d."name" AS "deptName", des."title" AS "desgTitle"
           FROM "Employee" e
           LEFT JOIN "Department" d ON d."id" = e."departmentId"
           LEFT JOIN "Designation" des ON des."id" = e."designationId"
           WHERE e."departmentId" = $1 AND e."status" = 'active'
           ORDER BY e."firstName" ASC`,
          departmentId,
        ) as any[];
      } else {
        // Match by department name (case-insensitive)
        deptEmployees = await db.$queryRawUnsafe(
          `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                  e."designationId", d."name" AS "deptName", des."title" AS "desgTitle"
           FROM "Employee" e
           LEFT JOIN "Department" d ON d."id" = e."departmentId"
           LEFT JOIN "Designation" des ON des."id" = e."designationId"
           WHERE LOWER(d."name") LIKE LOWER($1) AND e."status" = 'active'
           ORDER BY e."firstName" ASC`,
          `%${departmentId}%`,
        ) as any[];
      }
    } catch (err) {
      console.error('[PanelAvailability] Failed to fetch employees:', err);
      return NextResponse.json({ employees: [] }, { headers: corsHeaders() });
    }

    // 2. For HR interview type, also include HR/admin employees from any department
    if (interviewType === 'hr') {
      try {
        const hrEmployees = await db.$queryRawUnsafe(
          `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                  e."designationId", d."name" AS "deptName", des."title" AS "desgTitle",
                  u."role"
           FROM "Employee" e
           LEFT JOIN "Department" d ON d."id" = e."departmentId"
           LEFT JOIN "Designation" des ON des."id" = e."designationId"
           LEFT JOIN "User" u ON u."id" = e."userId"
           WHERE e."status" = 'active'
             AND u."role" IN ('tenant_admin', 'admin', 'hr_admin', 'company_hr_admin', 'ceo')
             AND e."id" NOT IN (SELECT unnest($1::text[]))
           ORDER BY e."firstName" ASC`,
          deptEmployees.map(e => e.id),
        ) as any[];
        deptEmployees = [...deptEmployees, ...hrEmployees];
      } catch {}
    }

    // 3. For each employee, check availability
    const interviewDate = new Date(date);
    const dayOfWeek = interviewDate.getDay(); // 0=Sunday, 6=Saturday
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    const results = await Promise.all(deptEmployees.map(async (emp) => {
      let availability = 'Available';
      let reason = 'No conflicts';

      // Check 1: Approved leave on this date
      try {
        const leaveRows = await db.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS cnt FROM "LeaveRequest"
           WHERE "employeeId" = $1 AND "status" = 'approved'
             AND $2::date >= "startDate" AND $2::date <= "endDate"`,
          emp.id, date,
        ) as any[];
        if (leaveRows[0]?.cnt > 0) {
          availability = 'On Leave';
          reason = 'Approved leave on this date';
        }
      } catch {}

      // Check 2: Existing interview on the same date
      if (availability === 'Available') {
        try {
          const interviewRows = await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS cnt FROM "Interview" i
             JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             WHERE ja."candidateId" IS NOT NULL
               AND i."date"::date = $1::date
               AND i."interviewer" LIKE $2
               AND i."status" = 'scheduled'`,
            date, `%${emp.userId || ''}%`,
          ) as any[];
          if (interviewRows[0]?.cnt > 0) {
            availability = 'Busy';
            reason = 'Has another interview scheduled';
          }
        } catch {}
      }

      // Check 3: Weekend (tentative — need to confirm)
      if (availability === 'Available' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        availability = 'Tentative';
        reason = 'Weekend — confirmation needed';
      }

      return {
        id: emp.id,
        name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        email: emp.email,
        designation: emp.desgTitle || '—',
        department: emp.deptName || '—',
        userId: emp.userId,
        availability,
        reason,
      };
    }));

    return NextResponse.json({ employees: results }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[PanelAvailability] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
