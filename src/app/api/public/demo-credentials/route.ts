import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';

/**
 * GET /api/public/demo-credentials
 *
 * Public endpoint that returns demo login credentials for the current domain.
 * - On nexus-hrms-mu.vercel.app: returns super admins + tenant admins with company details (demo site)
 * - On 3boxeshrms.com: returns super admins + tenant admins with company details (platform site)
 * - On tenant subdomains (e.g., marqaitechgroup.3boxeshrms.com): returns only tenant admin for that tenant
 *
 * Only super_admin and tenant_admin users are returned — no sample/employee users.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const host = request.headers.get('x-tenant-domain') || '';
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const hostname = host.split(':')[0];

    // Detect which site we're on
    const isDemoSite = hostname === 'nexus-hrms-mu.vercel.app';
    const isPlatformSite = hostname === '3boxeshrms.com' || hostname === 'www.3boxeshrms.com';
    const isTenantSubdomain = !!tenantSlug;

    if (isDemoSite || isPlatformSite) {
      // Demo / Platform site — show ONLY super admins and tenant admins with company details
      // Password is NOT returned in the API response — auto-fill uses it internally
      const superAdmins = await db.user.findMany({
        where: { role: 'super_admin', status: 'active' },
        select: { email: true, name: true, role: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
        orderBy: { name: 'asc' },
      });

      const tenantAdmins = await db.user.findMany({
        where: { role: 'tenant_admin', status: 'active' },
        select: { email: true, name: true, role: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
        orderBy: { tenant: { name: 'asc' } },
      });

      return NextResponse.json({
        site: isDemoSite ? 'demo' : 'platform',
        // Password NOT included in response — auto-fill still works via click handler
        superAdmins: superAdmins.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: 'Super Admin',
          tenant: u.tenant.name,
        })),
        tenantAdmins: tenantAdmins.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: 'Tenant Admin',
          tenant: u.tenant.name,
          tenantSlug: u.tenant.slug,
        })),
      });
    }

    if (isTenantSubdomain) {
      // Tenant subdomain — show only that tenant's admin
      const tenant = await getPlatformDb().tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true },
      });

      if (!tenant) {
        return NextResponse.json({ site: 'tenant', users: [] });
      }

      // Only return tenant_admin for this tenant (no sample users)
      const users = await db.user.findMany({
        where: { tenantId: tenant.id, status: 'active', role: 'tenant_admin' },
        select: { email: true, name: true, role: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({
        site: 'tenant',
        tenantName: tenant.name,
        users: users.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: 'Tenant Admin',
        })),
      });
    }

    // Default — fallback
    return NextResponse.json({
      site: 'unknown',
      superAdmins: [],
      tenantAdmins: [],
    });
  } catch (error) {
    console.error('Demo credentials error:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }
}
