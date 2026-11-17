/**
 * POST /api/admin/delete-user
 *
 * Super-admin-only endpoint to permanently DELETE a User from both the
 * platform DB and the tenant DB. Used for cleanup of stale/test users
 * that shouldn't exist (e.g. hr@marqaitech.com that was created during
 * earlier testing but has no employee record and no business purpose).
 *
 * Body: { "userId": "cmtp9..." }  OR  { "email": "hr@marqaitech.com" }
 *
 * Safety:
 *   - Super_admin only (tenant_admin cannot delete users)
 *   - Refuses to delete super_admin users (can't lock yourself out)
 *   - Refuses to delete users with linked Employee records (would orphan
 *     payroll/leave/attendance data) — deactivate those instead
 *   - Writes an audit log before deleting
 *   - Deletes from tenant DB first, then platform DB
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

export async function POST(request: NextRequest) {
  try {
    // Auth — super_admin only
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    }
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin only — cannot delete users' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { userId, email } = body || {};
    if (!userId && !email) {
      return NextResponse.json({ error: 'Provide userId or email' }, { status: 400, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const tenantDb = await getDb(request);
    const results: Array<{ db: string; action: string; email?: string; id?: string }> = [];

    // Helper: find user by id or email
    const findUser = async (db: any, lookupId?: string, lookupEmail?: string) => {
      if (lookupId) {
        return await db.user.findUnique({
          where: { id: lookupId },
          select: { id: true, email: true, role: true, name: true, status: true },
        }).catch(() => null);
      }
      if (lookupEmail) {
        return await db.user.findUnique({
          where: { email: lookupEmail },
          select: { id: true, email: true, role: true, name: true, status: true },
        }).catch(() => null);
      }
      return null;
    };

    // ── 1. Find the user in BOTH databases ──
    let platformUser = await findUser(platformDb, userId, email);
    let tenantUser = await findUser(tenantDb, userId || platformUser?.id, email);

    if (!platformUser && !tenantUser) {
      return NextResponse.json({ error: 'User not found in platform or tenant DB' }, { status: 404, headers: corsHeaders() });
    }

    // Use whichever we found — prefer platformUser for the canonical id
    const targetUser = platformUser || tenantUser;
    const targetId = targetUser.id;
    const targetEmail = targetUser.email;

    // ── 2. Safety: refuse to delete super_admin ──
    if (targetUser.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot delete super_admin user' }, { status: 403, headers: corsHeaders() });
    }

    // ── 3. Safety: refuse to delete if Employee record exists ──
    // (would orphan payroll/leave/attendance data — deactivate instead)
    try {
      const emp = await tenantDb.employee.findFirst({
        where: { userId: targetId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (emp) {
        return NextResponse.json({
          error: `User has an Employee record (${emp.firstName} ${emp.lastName}). Cannot delete — deactivate the user instead via PATCH /api/admin/tenant-users.`,
          employeeId: emp.id,
        }, { status: 409, headers: corsHeaders() });
      }
    } catch { /* Employee table may not exist in platform DB — OK */ }

    // ── 4. Audit log BEFORE deletion (so we have a trail even if delete fails) ──
    try {
      await tenantDb.auditLog.create({
        data: {
          userId: String(decoded.userId || 'system'),
          action: 'USER_DELETE',
          module: 'admin',
          details: `User ${targetEmail} (id: ${targetId}, role: ${targetUser.role}) deleted by ${decoded.email}. User had no employee record.`,
          ip: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });
    } catch { /* audit is best-effort */ }

    // ── 5. Delete from tenant DB ──
    if (tenantUser) {
      try {
        // Clean up FK references first (best-effort)
        for (const model of ['notification', 'auditLog', 'loginActivity']) {
          try {
            await (tenantDb as any)[model].deleteMany({ where: { userId: targetId } });
          } catch { /* table may not exist */ }
        }
        await tenantDb.user.delete({ where: { id: targetId } });
        results.push({ db: 'tenant', action: 'deleted', email: targetEmail, id: targetId });
      } catch (e) {
        results.push({ db: 'tenant', action: 'delete_failed', email: targetEmail, id: targetId });
      }
    }

    // ── 6. Delete from platform DB ──
    if (platformUser) {
      try {
        // Clean up FK references first (best-effort)
        for (const model of ['notification', 'auditLog', 'loginActivity']) {
          try {
            await (platformDb as any)[model].deleteMany({ where: { userId: targetId } });
          } catch { /* table may not exist */ }
        }
        await platformDb.user.delete({ where: { id: targetId } });
        results.push({ db: 'platform', action: 'deleted', email: targetEmail, id: targetId });
      } catch (e) {
        // Try by email if id-based delete failed (different id in platform DB)
        try {
          await platformDb.user.delete({ where: { email: targetEmail } });
          results.push({ db: 'platform', action: 'deleted_by_email', email: targetEmail });
        } catch (e2) {
          results.push({ db: 'platform', action: 'delete_failed', email: targetEmail, id: targetId });
        }
      }
    }

    const allDeleted = results.every(r => r.action.startsWith('deleted'));
    return NextResponse.json({
      ok: allDeleted,
      message: allDeleted
        ? `User ${targetEmail} permanently deleted from all databases.`
        : `User deletion partially completed — check results.`,
      results,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('DELETE user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
