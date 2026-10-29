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

// Task 167: roles that can schedule interviews
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

/**
 * GET /api/interviews/panel-availability
 *
 * Query params:
 *   - departmentId: the department ID (CUID)
 *   - date: the interview date (YYYY-MM-DD)
 *   - time: the interview start time (HH:MM)
 *   - duration: interview duration in minutes
 *   - interviewType: technical | hr | ai | offline_panel
 *
 * Returns employees from the department with availability:
 *   Available | Busy (with conflict time) | On Leave | Tentative
 *
 * Checks:
 *   1. Approved leave overlapping the date
 *   2. Existing interviews with TIME OVERLAP (not just same date)
 *   3. Employee status (must be active)
 *   4. Past date validation
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

    // Task 167: past date validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const interviewDate = new Date(date + 'T00:00:00');
    if (interviewDate < today) {
      return NextResponse.json({ employees: [], warning: 'Cannot schedule interviews in the past' }, { headers: corsHeaders() });
    }

    // Calculate the time range for overlap checking
    const interviewStart = time ? new Date(`${date}T${time}:00`) : null;
    const interviewEnd = interviewStart ? new Date(interviewStart.getTime() + duration * 60000) : null;

    // 1. Get all employees in the department — use EXACT department ID
    let deptEmployees: any[] = [];
    try {
      if (departmentId.startsWith('cm')) {
        // Exact ID match
        deptEmployees = await db.$queryRawUnsafe(
          `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                  e."designationId", d."name" AS "deptName", des."title" AS "desgTitle",
                  u."role"
           FROM "Employee" e
           LEFT JOIN "Department" d ON d."id" = e."departmentId"
           LEFT JOIN "Designation" des ON des."id" = e."designationId"
           LEFT JOIN "User" u ON u."id" = e."userId"
           WHERE e."departmentId" = $1 AND e."status" = 'active'
           ORDER BY e."firstName" ASC`,
          departmentId,
        ) as any[];
      } else {
        // Name match — resolve to ID first, then query by ID
        const deptRows = await db.$queryRawUnsafe(
          `SELECT "id" FROM "Department" WHERE LOWER("name") = LOWER($1) LIMIT 1`,
          departmentId,
        ) as any[];
        if (deptRows[0]?.id) {
          deptEmployees = await db.$queryRawUnsafe(
            `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                    e."designationId", d."name" AS "deptName", des."title" AS "desgTitle",
                    u."role"
             FROM "Employee" e
             LEFT JOIN "Department" d ON d."id" = e."departmentId"
             LEFT JOIN "Designation" des ON des."id" = e."designationId"
             LEFT JOIN "User" u ON u."id" = e."userId"
             WHERE e."departmentId" = $1 AND e."status" = 'active'
             ORDER BY e."firstName" ASC`,
            deptRows[0].id,
          ) as any[];
        }
      }
    } catch (err) {
      console.error('[PanelAvailability] Failed to fetch employees:', err);
      return NextResponse.json({ employees: [] }, { headers: corsHeaders() });
    }

    // 2. For HR interview type, also include HR/admin employees from any department
    if (interviewType === 'hr') {
      try {
        const existingIds = deptEmployees.map(e => e.id);
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
             ${existingIds.length > 0 ? `AND e."id" NOT IN (${existingIds.map((_, i) => `$${i + 2}`).join(',')})` : ''}
           ORDER BY e."firstName" ASC`,
          ...existingIds,
        ) as any[];
        deptEmployees = [...deptEmployees, ...hrEmployees];
      } catch {}
    }

    // 3. For each employee, check availability with TIME OVERLAP
    const dayOfWeek = interviewDate.getDay();
    const results = await Promise.all(deptEmployees.map(async (emp) => {
      let availability = 'Available';
      let reason = 'No conflicts';
      let conflictTime = '';

      // Check 1: Approved leave on this date
      try {
        const leaveRows = await db.$queryRawUnsafe(
          `SELECT "startDate", "endDate" FROM "LeaveRequest"
           WHERE "employeeId" = $1 AND "status" = 'approved'
             AND $2::date >= "startDate" AND $2::date <= "endDate"`,
          emp.id, date,
        ) as any[];
        if (leaveRows.length > 0) {
          availability = 'On Leave';
          reason = `On leave from ${new Date(leaveRows[0].startDate).toLocaleDateString()} to ${new Date(leaveRows[0].endDate).toLocaleDateString()}`;
        }
      } catch {}

      // Check 2: Existing interviews with TIME OVERLAP
      if (availability === 'Available' && interviewStart && interviewEnd) {
        try {
          // Find interviews where this employee is a panelist (interviewer field contains userId)
          // AND the interview is on the same date AND time overlaps
          const conflictRows = await db.$queryRawUnsafe(
            `SELECT i."date", i."time", i."duration", i."type", i."status",
                    ja."candidateName"
             FROM "Interview" i
             JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             WHERE i."interviewer" LIKE $1
               AND i."status" = 'scheduled'
               AND i."date"::date = $2::date
               AND i."time" IS NOT NULL`,
            `%${emp.userId || ''}%`, date,
          ) as any[];

          for (const conflict of conflictRows) {
            const cStart = new Date(`${date}T${conflict.time}:00`);
            const cEnd = new Date(cStart.getTime() + (conflict.duration || 60) * 60000);
            // Check overlap: interviewStart < cEnd AND interviewEnd > cStart
            if (interviewStart < cEnd && interviewEnd > cStart) {
              availability = 'Busy';
              const sTime = conflict.time;
              const eTime = new Date(cEnd.getTime()).toTimeString().substring(0, 5);
              conflictTime = `${sTime}–${eTime}`;
              reason = `Interview with ${conflict.candidateName} from ${sTime} to ${eTime}`;
              break;
            }
          }
        } catch {}
      }

      // Check 3: Weekend (tentative)
      if (availability === 'Available' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        availability = 'Tentative';
        reason = 'Weekend — confirmation needed';
      }

      return {
        id: emp.id,
        userId: emp.userId,
        name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        email: emp.email,
        designation: emp.desgTitle || '—',
        department: emp.deptName || '—',
        role: emp.role || 'employee',
        availability,
        reason,
        conflictTime,
      };
    }));

    return NextResponse.json({ employees: results }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[PanelAvailability] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
