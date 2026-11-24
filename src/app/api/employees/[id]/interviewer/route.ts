import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { canAccessEmployeeSettings } from '@/lib/roleAccess';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * PATCH /api/employees/[id]/interviewer  — body: { isInterviewer: boolean }
 *
 * Interviewer toggle: HR/Admin marks which employees take interviews as panel
 * members. Flagged users see ONLY the "My Interviews" tab from the recruitment
 * module (Sidebar.tsx) — the rest of the module stays hidden for their role.
 * The flag lives on the linked User row; updates go to BOTH the tenant DB and
 * the platform DB (same dual-write pattern as the credentials route) because
 * /api/auth/me reads the platform copy first.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');

    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const jwtRole = (decoded.role as string) || 'employee';
    if (!canAccessEmployeeSettings(jwtRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });
    }

    // ─── Resolve the correct tenant DB (same pattern as credentials route) ───
    let db = await getDb(request);
    if (jwtRole === 'super_admin' && tenantIdParam) {
      const tenant = await getPlatformDb().tenant.findUnique({
        where: { id: tenantIdParam },
        select: { slug: true },
      });
      if (tenant?.slug) db = await getDbForTenant(tenant.slug);
    }

    const body = await request.json().catch(() => ({}));
    const isInterviewer = body?.isInterviewer;
    if (typeof isInterviewer !== 'boolean') {
      return NextResponse.json({ error: 'isInterviewer must be a boolean' }, { status: 400, headers: corsHeaders() });
    }

    const employee = await db.employee.findUnique({
      where: { id },
      select: { id: true, employeeId: true, firstName: true, lastName: true, userId: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }
    if (!employee.userId) {
      return NextResponse.json(
        { error: 'This employee has no login account yet. Create credentials first, then mark them as an interviewer.' },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Dual write: tenant DB + platform DB (auth/me reads the platform copy first).
    // Self-heal the column first (ADD COLUMN IF NOT EXISTS, idempotent) so the
    // toggle works even on a DB provisioned before schema-sync added it.
    const platformDb = getPlatformDb();
    await Promise.all([
      db.$queryRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isInterviewer" BOOLEAN NOT NULL DEFAULT false').catch(() => null),
      platformDb.$queryRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isInterviewer" BOOLEAN NOT NULL DEFAULT false').catch(() => null),
    ]);

    const results = await Promise.all([
      db.user.update({ where: { id: employee.userId }, data: { isInterviewer } }).catch((e: any) => ({ error: e?.message || 'tenant update failed' })),
      platformDb.user.update({ where: { id: employee.userId }, data: { isInterviewer } }).catch((e: any) => ({ error: e?.message || 'platform update failed' })),
    ]);

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: isInterviewer ? 'EMPLOYEE_MARKED_INTERVIEWER' : 'EMPLOYEE_UNMARKED_INTERVIEWER',
        module: 'recruitment',
        details: `${employee.firstName} ${employee.lastName} (${employee.employeeId}) isInterviewer → ${isInterviewer}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      employeeId: employee.employeeId,
      userId: employee.userId,
      isInterviewer,
      updates: results,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Interviewer PATCH] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
