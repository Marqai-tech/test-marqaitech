import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { getPlatformDb } from '@/lib/tenant-db';

/** Return only the attendance-policy variant for the caller's authorized tenant. */
export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const role = String(decoded.role || '').toLowerCase();
  const { searchParams } = new URL(request.url);
  const requestedTenantId = role === 'super_admin' ? searchParams.get('tenantId') : null;
  let tenantId = requestedTenantId || (decoded.tenantId ? String(decoded.tenantId) : null);

  try {
    const platformDb = getPlatformDb();
    // The signed JWT is authoritative when it contains a tenantId. Tenant
    // users may authenticate against a dedicated tenant database, while a
    // platform user row with the same ID can be stale or belong to a different
    // tenant. Only fall back to the platform user row for older tokens that
    // omitted tenantId; never accept a caller-supplied tenant for tenant users.
    if (role !== 'super_admin' && !tenantId && decoded.userId) {
      const authenticatedUser = await platformDb.user.findUnique({
        where: { id: String(decoded.userId) },
        select: { tenantId: true },
      });
      tenantId = authenticatedUser?.tenantId || null;
    }
    if (!tenantId) {
      return NextResponse.json(
        { isMarqaitechGroup: false, reason: role === 'super_admin' ? 'tenant_not_selected' : 'tenant_scope_missing' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const tenant = await platformDb.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    const normalizedSlug = tenant?.slug?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    // Production and the isolated local test tenant use different slugs.
    // Match only these exact normalized tenant slugs; do not affect other tenants.
    const isMarqaitechGroup = ['marqaitechgroup', 'testmarqaitech'].includes(normalizedSlug || '');
    return NextResponse.json(
      {
        isMarqaitechGroup,
        reason: tenant ? (isMarqaitechGroup ? 'marqaitech_group' : 'other_tenant') : 'tenant_not_found',
        tenantSlug: tenant?.slug ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[attendance-policy-rules] Tenant variant lookup failed:', error);
    return NextResponse.json({ error: 'Unable to resolve attendance policy scope' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
