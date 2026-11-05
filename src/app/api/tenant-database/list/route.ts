import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getHiddenSlugsForRequest } from '@/lib/tenant-filter';

/**
 * GET /api/tenant-database/list
 *
 * Lists all tenant databases. Only super_admin can access.
 * Shows which tenants have dedicated databases and which use shared DB.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
    if (payload.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can list tenant databases' }, { status: 403 });
    }

    // Get all tenants with their database status.
    // GOLDEN RULE: hidden tenants (demo/live per host) are excluded so this
    // surface stays consistent with /api/tenants on every domain.
    const hiddenSlugs = getHiddenSlugsForRequest(request);
    const tenants = await getPlatformDb().tenant.findMany({
      where: { slug: { notIn: hiddenSlugs } },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        status: true,
        plan: true,
        tenantDatabase: {
          select: {
            id: true,
            databaseName: true,
            isActive: true,
            provisionedAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      domain: t.domain,
      status: t.status,
      plan: t.plan,
      isIsolated: !!t.tenantDatabase && t.tenantDatabase.isActive,
      database: t.tenantDatabase ? {
        id: t.tenantDatabase.id,
        name: t.tenantDatabase.databaseName,
        active: t.tenantDatabase.isActive,
        provisionedAt: t.tenantDatabase.provisionedAt,
      } : null,
    }));

    return NextResponse.json({ tenants: result });
  } catch (error) {
    console.error('Tenant database list error:', error);
    return NextResponse.json({ error: 'Failed to list tenant databases' }, { status: 500 });
  }
}
