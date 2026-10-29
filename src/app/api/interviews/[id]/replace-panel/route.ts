/**
 * POST /api/interviews/[id]/replace-panel
 *
 * Pt 9: Decline and replacement process
 * - HR receives a notification when someone declines
 * - System suggests eligible and available replacements
 * - HR selects a replacement
 * - Old member's candidate access is removed
 * - Replacement receives a confirmation request
 * - Change is recorded in audit history
 *
 * Body:
 *   { action: 'suggest' }                                    — get replacement suggestions
 *   { action: 'replace', oldUserId, newUserId, reason }      — replace a panel member
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded.role as string) || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can manage panel replacements' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    // Get interview details
    const interviewRows = await db.$queryRawUnsafe(
      `SELECT i."id", i."date", i."time", i."duration", i."type",
              i."jobApplicationId", ja."candidateName",
              jp."title" AS "jobTitle", jp."departmentId"
       FROM "Interview" i
       LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
       LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
       WHERE i."id" = $1 LIMIT 1`,
      id,
    ) as any[];

    if (!interviewRows[0]) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404, headers: corsHeaders() });
    }

    const interview = interviewRows[0];

    if (action === 'suggest') {
      // ─── Suggest eligible + available replacements ───────────────
      // Get existing panel member user IDs to exclude them
      const existingMembers = await db.$queryRawUnsafe(
        `SELECT "userId" FROM "InterviewPanelMember" WHERE "interviewId" = $1`,
        id,
      ) as any[];
      const excludeIds = existingMembers.map(m => m.userId).filter(Boolean);

      // Find employees in the same department who are active and not already on the panel
      let eligibleEmployees: any[] = [];
      try {
        const deptId = interview.departmentId;
        if (deptId) {
          // FIX #9: Correct the placeholder numbering — $1 is deptId, excluded IDs start at $2
          const placeholders = excludeIds.length > 0
            ? excludeIds.map((_: string, i: number) => `$${i + 2}`).join(',')
            : 'NULL';
          eligibleEmployees = await db.$queryRawUnsafe(
            `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                    e."designationId", d."name" AS "deptName",
                    des."title" AS "desgTitle", u."role"
             FROM "Employee" e
             LEFT JOIN "Department" d ON d."id" = e."departmentId"
             LEFT JOIN "Designation" des ON des."id" = e."designationId"
             LEFT JOIN "User" u ON u."id" = e."userId"
             WHERE e."departmentId" = $1 AND e."status" = 'active'
               AND e."userId" IS NOT NULL
               AND e."userId" NOT IN (${placeholders})
             ORDER BY e."firstName" ASC LIMIT 20`,
            deptId, ...excludeIds,
          ) as any[];
        }
      } catch {}

      // For HR interview type, also include HR employees
      if (interview.type === 'hr' || interview.type === 'offline_panel') {
        try {
          const hrEmployees = await db.$queryRawUnsafe(
            `SELECT e."id", e."firstName", e."lastName", e."email", e."userId",
                    e."designationId", d."name" AS "deptName",
                    des."title" AS "desgTitle", u."role"
             FROM "Employee" e
             LEFT JOIN "Department" d ON d."id" = e."departmentId"
             LEFT JOIN "Designation" des ON des."id" = e."designationId"
             LEFT JOIN "User" u ON u."id" = e."userId"
             WHERE e."status" = 'active' AND e."userId" IS NOT NULL
               AND u."role" IN ('tenant_admin', 'admin', 'hr_admin', 'company_hr_admin', 'ceo')
             ORDER BY e."firstName" ASC LIMIT 10`,
          ) as any[];
          // Merge, dedup
          const existingEmpIds = new Set(eligibleEmployees.map(e => e.id));
          for (const hr of hrEmployees) {
            if (!existingEmpIds.has(hr.id) && !excludeIds.includes(hr.userId)) {
              eligibleEmployees.push(hr);
            }
          }
        } catch {}
      }

      // Check availability for each eligible employee
      const interviewDate = new Date(interview.date).toISOString().slice(0, 10);
      const interviewStart = interview.time ? new Date(`${interviewDate}T${interview.time}:00`) : null;
      const interviewEnd = interviewStart ? new Date(interviewStart.getTime() + (interview.duration || 60) * 60000) : null;

      const suggestions = await Promise.all(eligibleEmployees.map(async (emp) => {
        let availability = 'Available';
        let reason = 'No conflicts';

        // Check leave
        try {
          const leaveRows = await db.$queryRawUnsafe(
            `SELECT "startDate", "endDate" FROM "LeaveRequest"
             WHERE "employeeId" = $1 AND "status" = 'approved'
               AND $2::date >= "startDate" AND $2::date <= "endDate"`,
            emp.id, interviewDate,
          ) as any[];
          if (leaveRows.length > 0) {
            availability = 'On Leave';
            reason = `On leave from ${new Date(leaveRows[0].startDate).toLocaleDateString()} to ${new Date(leaveRows[0].endDate).toLocaleDateString()}`;
          }
        } catch {}

        // Check interview conflicts (exact time overlap)
        if (availability === 'Available' && interviewStart && interviewEnd) {
          try {
            const conflictRows = await db.$queryRawUnsafe(
              `SELECT i."time", i."duration", ja."candidateName"
               FROM "Interview" i
               JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
               WHERE i."interviewer" LIKE $1 AND i."status" = 'scheduled'
                 AND i."date"::date = $2::date AND i."time" IS NOT NULL`,
              `%${emp.userId || ''}%`, interviewDate,
            ) as any[];

            for (const c of conflictRows) {
              const cStart = new Date(`${interviewDate}T${c.time}:00`);
              const cEnd = new Date(cStart.getTime() + (c.duration || 60) * 60000);
              if (interviewStart < cEnd && interviewEnd > cStart) {
                availability = 'Busy';
                reason = `Interview with ${c.candidateName} at ${c.time}`;
                break;
              }
            }
          } catch {}
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
        };
      }));

      return NextResponse.json({ suggestions }, { headers: corsHeaders() });
    }

    if (action === 'replace') {
      // ─── Replace a panel member ───────────────────────────────────
      const { oldUserId, newUserId, reason } = body;
      if (!oldUserId || !newUserId) {
        return NextResponse.json({ error: 'oldUserId and newUserId are required' }, { status: 400, headers: corsHeaders() });
      }

      // Remove old member (set status to 'replaced')
      try {
        await db.$executeRawUnsafe(
          `UPDATE "InterviewPanelMember" SET "status" = 'replaced', "updatedAt" = NOW() WHERE "interviewId" = $1 AND "userId" = $2`,
          id, oldUserId,
        );
      } catch {}

      // Add new member with status 'pending'
      const newPmId = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "InterviewPanelMember" ("id", "interviewId", "userId", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'pending', NOW(), NOW())`,
          newPmId, id, newUserId,
        );
      } catch {}

      // Update the Interview.interviewer field (replace old userId with new userId)
      try {
        const interviewRow = await db.$queryRawUnsafe(
          `SELECT "interviewer" FROM "Interview" WHERE "id" = $1 LIMIT 1`, id,
        ) as any[];
        let interviewerStr = interviewRow[0]?.interviewer || '';
        const memberIds = interviewerStr.split(',').filter((s: string) => s && s !== oldUserId);
        memberIds.push(newUserId);
        await db.$executeRawUnsafe(
          `UPDATE "Interview" SET "interviewer" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
          memberIds.join(','), id,
        );
      } catch {}

      // Notify the new panel member
      if (decoded.tenantId) {
        try {
          const dateStr = new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const typeLabels: Record<string, string> = {
            ai: 'AI Interview', technical: 'Technical Interview', hr: 'HR Interview', offline_panel: 'Panel Interview',
          };
          const typeLabel = typeLabels[interview.type] || 'Interview';
          await createNotification({
            tenantId: decoded.tenantId as string, userId: newUserId,
            title: `Interview Assigned: ${typeLabel} (Replacement)`,
            message: `You have been assigned as a replacement panel member for a ${typeLabel} for ${interview.candidateName || 'a candidate'} (${interview.jobTitle || 'position'}) on ${dateStr} at ${interview.time || 'TBD'}.`,
            type: 'workflow', category: 'recruitment', link: '/my-interviews',
          });
        } catch {}
      }

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_PANEL_REPLACED', module: 'recruitment',
          details: `Panel member ${oldUserId} replaced with ${newUserId} on interview ${id}. Reason: ${reason || 'N/A'}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: 'Panel member replaced — new member notified' }, { headers: corsHeaders() });
    }

    return NextResponse.json({ error: 'Unknown action. Use action=suggest or action=replace' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('[ReplacePanel] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
