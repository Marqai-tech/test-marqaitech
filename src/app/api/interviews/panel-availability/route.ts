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

// Task 167: roles that can schedule interviews
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

/**
 * GET /api/interviews/panel-availability
 *
 * Query params:
 *   - departmentId: the department ID (CUID) OR the department NAME
 *   - date:        the interview date (YYYY-MM-DD) — OPTIONAL
 *   - time:        the interview start time (HH:MM) — optional
 *   - duration:    interview duration in minutes (default 60)
 *   - interviewType: technical | hr | ai | offline_panel (default technical)
 *
 * Returns employees from the department with availability:
 *   Available | Busy (with conflict time) | On Leave | Tentative | No Date Set
 *
 * Behavior:
 *   - If `date` is provided: leave + interview-time-overlap conflicts are checked.
 *   - If `date` is omitted (or empty string): the employee list is still returned,
 *     with `availability = 'No Date Set'`. The frontend uses this so the user can
 *     see who is in the department before picking a date — picking a date then
 *     refetches and updates the availability badges.
 *   - `departmentId` is resolved ID-first, NAME-second (case-insensitive name match).
 *     The previous brittle `startsWith('cm')` heuristic was dropped — both paths
 *     are now always tried, ID first.
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const url = new URL(req.url);
    const departmentId = (url.searchParams.get('departmentId') || '').trim();
    const dateRaw = (url.searchParams.get('date') || '').trim();
    const time = url.searchParams.get('time') || '';
    const duration = parseInt(url.searchParams.get('duration') || '60');
    const interviewType = url.searchParams.get('interviewType') || 'technical';

    // Date is now optional — only `departmentId` is required.
    if (!departmentId) {
      return NextResponse.json({ error: 'departmentId is required' }, { status: 400, headers: corsHeaders() });
    }

    const hasDate = Boolean(dateRaw);

    // Validate the date only when it's provided
    let interviewDate: Date | null = null;
    if (hasDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      interviewDate = new Date(dateRaw + 'T00:00:00');
      if (interviewDate < today) {
        return NextResponse.json({ employees: [], warning: 'Cannot schedule interviews in the past' }, { headers: corsHeaders() });
      }
    }

    // Calculate the time range for overlap checking (only when date+time both present)
    const interviewStart = (hasDate && time) ? new Date(`${dateRaw}T${time}:00`) : null;
    const interviewEnd = interviewStart ? new Date(interviewStart.getTime() + duration * 60000) : null;

    // 1. Resolve the actual Department ID. Try exact ID first, then name.
    let resolvedDeptId: string | null = null;
    try {
      // Try exact ID match first (this is the common path — the UI now sends the ID).
      const byId = await db.$queryRawUnsafe(
        `SELECT "id" FROM "Department" WHERE "id" = $1 LIMIT 1`,
        departmentId,
      ) as any[];
      if (byId[0]?.id) {
        resolvedDeptId = byId[0].id;
      } else {
        // Fall back to a case-insensitive name match — kept for back-compat with
        // any older caller still passing the department NAME instead of the ID.
        const byName = await db.$queryRawUnsafe(
          `SELECT "id" FROM "Department" WHERE LOWER("name") = LOWER($1) LIMIT 1`,
          departmentId,
        ) as any[];
        if (byName[0]?.id) resolvedDeptId = byName[0].id;
      }
    } catch (err) {
      console.error('[PanelAvailability] Failed to resolve departmentId:', err);
      return NextResponse.json({ employees: [], error: 'Failed to resolve department' }, { headers: corsHeaders() });
    }

    if (!resolvedDeptId) {
      // Department not found — return empty so the UI can show "No employees".
      return NextResponse.json({ employees: [], warning: 'Department not found' }, { headers: corsHeaders() });
    }

    // 2. Get all active employees in the resolved department
    let deptEmployees: any[] = [];
    try {
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
        resolvedDeptId,
      ) as any[];
    } catch (err) {
      console.error('[PanelAvailability] Failed to fetch employees:', err);
      return NextResponse.json({ employees: [] }, { headers: corsHeaders() });
    }

    // 3. For HR interview type, also include HR/admin employees from any department
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

    // 4. For each employee, check availability with TIME OVERLAP (only when a date is set).
    //    When no date is set, return the employees with availability = 'No Date Set'.
    const dayOfWeek = interviewDate ? interviewDate.getDay() : -1;
    const results = await Promise.all(deptEmployees.map(async (emp) => {
      let availability = 'Available';
      let reason = 'No conflicts';
      let conflictTime = '';

      if (!hasDate) {
        // No date picked yet — list the employee so the user can see who's in the dept.
        // The actual availability check runs once a date is chosen.
        return {
          id: emp.id,
          userId: emp.userId,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          email: emp.email,
          designation: emp.desgTitle || '—',
          department: emp.deptName || '—',
          role: emp.role || 'employee',
          availability: 'No Date Set',
          reason: 'Pick a date to check availability',
          conflictTime: '',
        };
      }

      // Check 1: Approved leave on this date
      try {
        const leaveRows = await db.$queryRawUnsafe(
          `SELECT "startDate", "endDate" FROM "LeaveRequest"
           WHERE "employeeId" = $1 AND "status" = 'approved'
             AND $2::date >= "startDate" AND $2::date <= "endDate"`,
          emp.id, dateRaw,
        ) as any[];
        if (leaveRows.length > 0) {
          availability = 'On Leave';
          reason = `On leave from ${new Date(leaveRows[0].startDate).toLocaleDateString()} to ${new Date(leaveRows[0].endDate).toLocaleDateString()}`;
        }
      } catch {}

      // Check 2: Existing interviews with TIME OVERLAP (only if time is set)
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
            `%${emp.userId || ''}%`, dateRaw,
          ) as any[];

          for (const conflict of conflictRows) {
            const cStart = new Date(`${dateRaw}T${conflict.time}:00`);
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
