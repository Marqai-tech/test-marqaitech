import { NextResponse } from 'next/server';
import { getPlatformDb, disconnectTenantDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * POST /api/tenant-database/flush-cache
 *
 * Drops the in-memory Prisma handle for a tenant's dedicated database so the
 * next request re-reads the TenantDatabase row and opens a fresh connection.
 * Useful after re-provisioning / rotating credentials, or when a connection
 * has gone stale. Super admin only.
 *
 * Body: { slug: string }  — or { all: true } to flush every cached handle.
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
      return NextResponse.json({ error: 'Only super admins can flush the tenant DB cache' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body?.all === true) {
      const tenants = await getPlatformDb().tenant.findMany({
        select: { slug: true },
      });
      for (const t of tenants) {
        if (t.slug) disconnectTenantDb(t.slug);
      }
      return NextResponse.json({
        ok: true,
        flushed: tenants.map((t) => t.slug).filter(Boolean),
        message: `Flushed cached DB handles for ${tenants.length} tenant(s).`,
      });
    }

    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    if (!slug) {
      return NextResponse.json({ error: 'slug is required (or pass all: true)' }, { status: 400 });
    }

    const tenant = await getPlatformDb().tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: `Tenant "${slug}" not found` }, { status: 404 });
    }

    disconnectTenantDb(slug);

    return NextResponse.json({
      ok: true,
      flushed: [slug],
      message: `Cached database handle for "${tenant.name}" dropped. Next request opens a fresh connection.`,
    });
  } catch (error) {
    console.error('Tenant database flush-cache error:', error);
    return NextResponse.json(
      { error: 'Failed to flush tenant DB cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
