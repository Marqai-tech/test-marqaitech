/**
 * POST /api/admin/detach-user-tenant
 *
 * Super-admin-only endpoint to detach a user from any tenant by setting
 * their tenantId to NULL in the platform DB. This makes the user
 * platform-level (like the production super admin) so they land on the
 * platform super-admin portal after login instead of being scoped to a
 * specific tenant.
 *
 * Body:
 *   { email: string }   — OR —
 *   { userId: string }
 *
 * Returns:
 *   { ok: true, user: { id, email, tenantId: null }, before: { tenantId } }
 *
 * Auth: super_admin only. Audit logged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { safeAuditLog } from '@/lib/audit-safe';

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
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Super-admin only
    if (decoded.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden — super_admin only' },
        { status: 403, headers: corsHeaders() },
      );
    }

    const body = await request.json();
    const { email, userId } = body || {};
    if (!email && !userId) {
      return NextResponse.json(
        { error: 'Provide email or userId' },
        { status: 400, headers: corsHeaders() },
      );
    }

    const platformDb = getPlatformDb();

    // Find the user by email or id
    const where = email ? { email: String(email).toLowerCase() } : { id: String(userId) };
    const existing = await platformDb.user.findUnique({
      where,
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'User not found in platform DB', where },
        { status: 404, headers: corsHeaders() },
      );
    }

    const beforeTenantId = existing.tenantId;
    if (beforeTenantId === null) {
      return NextResponse.json({
        ok: true,
        message: 'User is already platform-level (tenantId is null)',
        user: existing,
      }, { headers: corsHeaders() });
    }

    // Detach: set tenantId to null
    const updated = await platformDb.user.update({
      where: { id: existing.id },
      data: { tenantId: null },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    // Audit log — use safeAuditLog against the platform DB
    try {
      await safeAuditLog(platformDb, {
        userId: decoded.userId,
        action: 'SUPER_ADMIN_DETACH_USER_TENANT',
        module: 'admin',
        details: `Detached user ${existing.email} (${existing.id}) from tenant ${beforeTenantId}. Now platform-level.`,
      });
    } catch (auditErr) {
      console.warn('[detach-user-tenant] audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json({
      ok: true,
      message: `User ${existing.email} detached from tenant. They are now platform-level.`,
      before: { tenantId: beforeTenantId },
      after: updated,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[detach-user-tenant] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
