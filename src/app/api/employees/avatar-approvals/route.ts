import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { canEditEmployeeRecords } from '@/lib/roleAccess';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Task 139 — profile-photo approval queue.
 *
 * GET    — HR/Admin: every employee with a photo pending confirmation
 *          (avatarPending + employee identity). Employees: their own pending
 *          photo state only.
 * POST   — HR/Admin only: { employeeId, action: 'approve'|'reject', comment? }
 *          approve → Employee.avatar = avatarPending, clear pending, notify
 *                    the employee (core_hr.profile.photo_result 'Approved');
 *          reject  → clear pending (public photo unchanged), notify the
 *                    employee with the reviewer's comment.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const privileged = canEditEmployeeRecords(typeof decoded.role === 'string' ? decoded.role : String((decoded as { role?: unknown }).role || ''));

    const pending = await db.$queryRawUnsafe(
      `SELECT e."id", e."employeeId", e."firstName", e."lastName", e."email", e."avatarPending",
              e."avatarPendingAt", e."avatar", d."name" AS "departmentName", des."title" AS "designationTitle"
       FROM "Employee" e
       LEFT JOIN "Department" d ON d."id" = e."departmentId"
       LEFT JOIN "Designation" des ON des."id" = e."designationId"
       WHERE e."avatarPending" IS NOT NULL AND e.status = 'active'
       ORDER BY e."avatarPendingAt" DESC NULLS LAST
       LIMIT 200`,
    ).catch(() => []) as Array<Record<string, unknown>>;

    let mine: Record<string, unknown> | null = null;
    if (!privileged && decoded.userId) {
      const own = await db.$queryRawUnsafe(
        `SELECT "id", "avatarPending", "avatarPendingAt" FROM "Employee" WHERE "userId" = $1 LIMIT 1`,
        String(decoded.userId),
      ).catch(() => []) as Array<Record<string, unknown>>;
      if (own?.[0]) mine = { employeeId: own[0].id, pending: Boolean(own[0].avatarPending), submittedAt: own[0].avatarPendingAt || null };
    }

    return NextResponse.json({
      pending: (pending || []).map((row) => ({
        employeeId: row.id,
        employeeCode: row.employeeId,
        name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
        email: row.email,
        department: row.departmentName || null,
        designation: row.designationTitle || null,
        currentAvatar: row.avatar || null,
        pendingAvatar: row.avatarPending,
        submittedAt: row.avatarPendingAt || null,
      })),
      mine,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[AvatarApprovals GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    if (!canEditEmployeeRecords(typeof decoded.role === 'string' ? decoded.role : String((decoded as { role?: unknown }).role || ''))) {
      return NextResponse.json({ error: 'Only HR / Admin can review profile photos' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const employeeId = String(body?.employeeId || '');
    const action = String(body?.action || '');
    const comment = body?.comment ? String(body.comment).slice(0, 300) : null;
    if (!employeeId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "employeeId and action ('approve' | 'reject') are required" }, { status: 400, headers: corsHeaders() });
    }

    const rows = await db.$queryRawUnsafe(
      `SELECT "id", "employeeId" AS "code", "firstName", "lastName", "email", "avatarPending", "avatar" FROM "Employee" WHERE "id" = $1 LIMIT 1`,
      employeeId,
    ).catch(() => []) as Array<Record<string, unknown>>;
    const emp = rows?.[0];
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    if (!emp.avatarPending) return NextResponse.json({ error: 'No photo pending approval for this employee' }, { status: 400, headers: corsHeaders() });

    if (action === 'approve') {
      await db.$executeRawUnsafe(
        `UPDATE "Employee" SET "avatar" = "avatarPending", "avatarPending" = NULL, "avatarPendingAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
        employeeId,
      );
    } else {
      await db.$executeRawUnsafe(
        `UPDATE "Employee" SET "avatarPending" = NULL, "avatarPendingAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
        employeeId,
      );
    }

    // Task 163: also update the EmployeeUpdateRequest record so the photo
    // approval/rejection shows up in the "All Requests" tab with the correct
    // status. Matches the pending photo request by employeeId + fieldName.
    try {
      if (action === 'approve') {
        await db.$executeRawUnsafe(
          `UPDATE "EmployeeUpdateRequest"
           SET "status" = 'applied', "approverUserId" = $1, "approverComments" = $2,
               "approvedAt" = NOW(), "appliedAt" = NOW(), "updatedAt" = NOW()
           WHERE "employeeId" = $3 AND "fieldName" = 'profilePhoto' AND "status" = 'pending'`,
          String(decoded.userId || ''), comment, employeeId,
        );
      } else {
        await db.$executeRawUnsafe(
          `UPDATE "EmployeeUpdateRequest"
           SET "status" = 'rejected', "approverUserId" = $1, "approverComments" = $2,
               "approvedAt" = NOW(), "updatedAt" = NOW()
           WHERE "employeeId" = $3 AND "fieldName" = 'profilePhoto' AND "status" = 'pending'`,
          String(decoded.userId || ''), comment, employeeId,
        );
      }
    } catch (reqUpdateErr) {
      console.warn('[AvatarApprovals POST] EmployeeUpdateRequest update failed (non-fatal):', reqUpdateErr instanceof Error ? reqUpdateErr.message : reqUpdateErr);
    }

    // Tell the employee the outcome (bell + email).
    try {
      const { dispatchNotification } = await import('@/lib/notification-center');
      const userRows = await db.$queryRawUnsafe(
        `SELECT "id" FROM "User" WHERE "id" = (SELECT "userId" FROM "Employee" WHERE "id" = $1) LIMIT 1`,
        employeeId,
      ).catch(() => []) as Array<Record<string, unknown>>;
      if (userRows?.[0]?.id) {
        await dispatchNotification({
          tenantId: String(decoded.tenantId || ''),
          module: 'core_hr',
          eventKey: 'core_hr.profile.photo_result',
          recipients: [{ userId: String(userRows[0].id) }],
          vars: {
            Employee_Name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
            Status: action === 'approve' ? 'Approved' : 'Rejected',
            Reviewer_Name: String(decoded.email || decoded.userId || 'HR/Admin'),
            Comment: comment ? `\nReviewer note: ${comment}` : '',
          },
          entity: { type: 'employee_profile', id: employeeId, link: `/employees/${employeeId}` },
          origin: request.headers.get('origin') || undefined,
        }).catch(() => null);
      }
    } catch (notifyErr) {
      console.warn('[AvatarApprovals POST] photo_result notify failed (non-fatal):', (notifyErr as Error).message);
    }

    try {
      await db.auditLog.create({
        data: {
          userId: String(decoded.userId || ''),
          action: 'PROFILE_PHOTO_REVIEW',
          module: 'employees',
          details: `${action === 'approve' ? 'Approved' : 'Rejected'} pending photo for ${emp.code || employeeId}${comment ? ` — ${comment}` : ''}`,
        },
      });
    } catch { /* audit best-effort */ }

    return NextResponse.json({ success: true, action, employeeId });
  } catch (error) {
    console.error('[AvatarApprovals POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
