import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant, disconnectTenantDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * POST /api/tenant-database/test
 *
 * Connectivity + health probe for a tenant's database resolution path.
 * Super admin only.
 *
 * Body: { slug: string }
 *
 * Behaviour:
 *  - Tenant without an active TenantDatabase row → mode 'shared' (the tenant
 *    resolves to the platform DB — no dedicated provisioning yet).
 *  - Tenant WITH a dedicated DB → flushes the in-memory handle cache first
 *    (so we validate a FRESH connection, not a warm one), opens a new client
 *    via getDbForTenant(), runs SELECT 1, and reports latency + databaseName.
 *
 * Always answers 200 with { ok: true/false, ... } so the UI can render the
 * failure reason instead of a generic 500.
 */
export async function POST(request: Request) {
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
      return NextResponse.json({ error: 'Only super admins can test tenant databases' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const platformDb = getPlatformDb();
    const tenant = await platformDb.tenant.findUnique({
      where: { slug },
      select: {
        id: true, name: true, slug: true,
        tenantDatabase: {
          select: {
            databaseName: true, isActive: true, provisionedAt: true,
            neonProjectId: true, neonBranchId: true,
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: `Tenant "${slug}" not found` }, { status: 404 });
    }

    if (!tenant.tenantDatabase || !tenant.tenantDatabase.isActive) {
      return NextResponse.json({
        ok: true,
        mode: 'shared',
        slug: tenant.slug,
        name: tenant.name,
        message: 'No dedicated database registered — this tenant currently resolves to the shared platform database.',
      });
    }

    // Force a fresh connection so the test validates the stored credentials.
    disconnectTenantDb(slug);

    const startedAt = Date.now();
    try {
      const tenantDb = await getDbForTenant(slug);
      await tenantDb.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - startedAt;

      return NextResponse.json({
        ok: true,
        mode: 'dedicated',
        slug: tenant.slug,
        name: tenant.name,
        databaseName: tenant.tenantDatabase.databaseName,
        isActive: tenant.tenantDatabase.isActive,
        provisionedAt: tenant.tenantDatabase.provisionedAt,
        neonProjectId: tenant.tenantDatabase.neonProjectId || null,
        neonBranchId: tenant.tenantDatabase.neonBranchId || null,
        latencyMs,
        message: `Connected to ${tenant.tenantDatabase.databaseName} in ${latencyMs}ms.`,
      });
    } catch (connErr) {
      const message = connErr instanceof Error ? connErr.message : String(connErr);
      return NextResponse.json({
        ok: false,
        mode: 'dedicated',
        slug: tenant.slug,
        name: tenant.name,
        databaseName: tenant.tenantDatabase.databaseName,
        error: message.slice(0, 500),
        message: `Connectivity test FAILED for ${tenant.tenantDatabase.databaseName}.`,
      });
    }
  } catch (error) {
    console.error('Tenant database test error:', error);
    return NextResponse.json(
      { error: 'Failed to run tenant database test', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
