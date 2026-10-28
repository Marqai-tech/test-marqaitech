import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/admin/tenant-users
 *
 * Admin-only diagnostic: lists the User rows that drive notification/approver
 * resolution (role + status filters) from BOTH the tenant DB and the platform
 * auth DB, plus the most recent email deliveries for routing verification.
 *
 * Query:
 *   ?deliveries=15   — include the N most recent NotificationDelivery rows
 *
 * PATCH /api/admin/tenant-users
 *
 * Admin-only data fix for alert mis-routing:
 *   body: { userId, status: 'active' | 'inactive' }
 * Applies the status change wherever the user row is found (tenant DB and/or
 * platform DB) and writes an audit log entry. super_admin / tenant_admin only.
 */

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-slug',
  };
}

export function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'hr_admin', 'admin', 'company_hr_admin'];

async function authorize(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  if (!token) return { error: 'Unauthorized' as const, status: 401 as const };
  const decoded = await verifyToken(token);
  if (!decoded) return { error: 'Invalid token' as const, status: 401 as const };
  if (!ADMIN_ROLES.includes(String(decoded.role))) {
    return { error: 'Forbidden — admin role required' as const, status: 403 as const };
  }
  return { decoded };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const db = await getDb(request);

    // Resolve tenant id (header slug first, then JWT claim)
    const tenantSlug = request.headers.get('x-tenant-slug');
    let tenantId: string | null = null;
    if (tenantSlug) {
      const tenant = await platformDb.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } });
      if (tenant) tenantId = tenant.id;
    }
    if (!tenantId && auth.decoded?.tenantId) tenantId = String(auth.decoded.tenantId);

    const userSelect = { id: true, email: true, name: true, role: true, status: true, tenantId: true };

    // Tenant DB users — these rows drive resolveRoleRecipients / tier approvers
    let tenantUsers: unknown[] = [];
    try {
      tenantUsers = await (db as any).user.findMany({
        where: tenantId ? { tenantId } : undefined,
        select: userSelect,
        orderBy: { email: 'asc' },
        take: 300,
      });
    } catch (e) {
      tenantUsers = [{ error: `tenant DB user query failed: ${(e as Error).message}` }];
    }

    // Platform auth DB users for the same tenant (login accounts)
    let platformUsers: unknown[] = [];
    try {
      platformUsers = tenantId
        ? await platformDb.user.findMany({ where: { tenantId }, select: userSelect, orderBy: { email: 'asc' }, take: 300 })
        : [];
    } catch (e) {
      platformUsers = [{ error: `platform DB user query failed: ${(e as Error).message}` }];
    }

    // Recent notification deliveries — shows where alert emails actually went
    let deliveries: unknown[] = [];
    const want = parseInt(request.nextUrl.searchParams.get('deliveries') || '0', 10);
    if (want > 0) {
      try {
        deliveries = await (db as any).notificationDelivery.findMany({
          orderBy: { createdAt: 'desc' },
          take: Math.min(want, 50),
          select: { eventKey: true, channel: true, status: true, recipientName: true, recipientAddress: true, subject: true, error: true, createdAt: true },
        });
      } catch (e) {
        deliveries = [{ error: `delivery query failed: ${(e as Error).message}` }];
      }
    }

    return NextResponse.json({ tenantId, tenantUsers, platformUsers, deliveries }, { headers: corsHeaders() });
  } catch (error) {
    console.error('GET tenant-users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: corsHeaders() });
    }
    // Data writes are restricted to super_admin / tenant_admin
    if (!['super_admin', 'tenant_admin'].includes(String(auth.decoded?.role))) {
      return NextResponse.json({ error: 'Forbidden — super_admin / tenant_admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { userId, status } = body || {};
    if (!userId || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'userId and status (active|inactive) are required' }, { status: 400, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const db = await getDb(request);
    const results: Array<{ db: string; updated: boolean; email?: string }> = [];

    // Tenant DB
    try {
      const existing = await (db as any).user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
      if (existing) {
        await (db as any).user.update({ where: { id: userId }, data: { status } });
        results.push({ db: 'tenant', updated: true, email: existing.email });
      }
    } catch { /* tenant DB may not hold this user */ }

    // Platform auth DB
    try {
      const existing = await platformDb.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
      if (existing) {
        await platformDb.user.update({ where: { id: userId }, data: { status } });
        results.push({ db: 'platform', updated: true, email: existing.email });
      }
    } catch { /* platform DB may not hold this user */ }

    if (!results.length) {
      return NextResponse.json({ error: 'User not found in tenant or platform DB' }, { status: 404, headers: corsHeaders() });
    }

    // Audit trail
    try {
      await (db as any).auditLog.create({
        data: {
          userId: String(auth.decoded?.userId || 'system'),
          action: 'USER_STATUS_UPDATE',
          module: 'admin',
          details: `User ${userId} status set to ${status} via /api/admin/tenant-users by ${String(auth.decoded?.email || 'unknown')}`,
          ip: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });
    } catch { /* audit is best-effort */ }

    return NextResponse.json({ ok: true, results }, { headers: corsHeaders() });
  } catch (error) {
    console.error('PATCH tenant-users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
