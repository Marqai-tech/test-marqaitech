import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/demo-credentials
 *
 * Public endpoint that returns demo login credentials for the current domain.
 * - On nexus-hrms-mu.vercel.app: returns ALL users across ALL tenants (full demo)
 * - On 3boxeshrms.com: returns super admin + tenant admins (platform management)
 * - On tenant subdomains (e.g., marqaitechgroup.3boxeshrms.com): returns tenant-specific users only
 */
export async function GET(request: Request) {
  try {
    const host = request.headers.get('x-tenant-domain') || '';
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const hostname = host.split(':')[0];

    // Detect which site we're on
    const isDemoSite = hostname === 'nexus-hrms-mu.vercel.app';
    const isPlatformSite = hostname === '3boxeshrms.com' || hostname === 'www.3boxeshrms.com';
    const isTenantSubdomain = !!tenantSlug;

    const password = 'MarqAI@2026';

    if (isDemoSite) {
      // Full demo site — show ALL users grouped by tenant
      const users = await prisma.user.findMany({
        where: { status: 'active' },
        select: {
          email: true,
          name: true,
          role: true,
          tenantId: true,
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: [{ tenant: { name: 'asc' } }, { role: 'asc' }, { name: 'asc' }],
      });

      // Group by tenant
      const grouped = new Map<string, { tenant: { name: string; slug: string }; users: { email: string; name: string; role: string; functionalRole: string }[] }>();
      for (const u of users) {
        const key = u.tenant.slug;
        if (!grouped.has(key)) grouped.set(key, { tenant: u.tenant, users: [] });
        const functionalRole = getFunctionalRole(u.role, u.email, u.name);
        grouped.get(key)!.users.push({ email: u.email, name: u.name, role: u.role, functionalRole });
      }

      // Convert to array, putting Marq AI Tech Group first
      const tenants = Array.from(grouped.values());
      const marqFirst = tenants.find(t => t.tenant.slug === 'marqaitechgroup');
      const others = tenants.filter(t => t.tenant.slug !== 'marqaitechgroup');
      const sorted = marqFirst ? [marqFirst, ...others] : others;

      return NextResponse.json({
        site: 'demo',
        password,
        tenants: sorted,
      });
    }

    if (isPlatformSite) {
      // Platform site — show super admins and tenant admins
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', status: 'active' },
        select: { email: true, name: true, role: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
        orderBy: { name: 'asc' },
      });

      const tenantAdmins = await prisma.user.findMany({
        where: { role: 'tenant_admin', status: 'active' },
        select: { email: true, name: true, role: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
        orderBy: { tenant: { name: 'asc' } },
      });

      return NextResponse.json({
        site: 'platform',
        password,
        superAdmins: superAdmins.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: getFunctionalRole(u.role, u.email, u.name),
          tenant: u.tenant.name,
        })),
        tenantAdmins: tenantAdmins.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: getFunctionalRole(u.role, u.email, u.name),
          tenant: u.tenant.name,
          tenantSlug: u.tenant.slug,
        })),
      });
    }

    if (isTenantSubdomain) {
      // Tenant subdomain — show only that tenant's users
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true },
      });

      if (!tenant) {
        return NextResponse.json({ site: 'tenant', password, tenants: [] });
      }

      const users = await prisma.user.findMany({
        where: { tenantId: tenant.id, status: 'active' },
        select: { email: true, name: true, role: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });

      return NextResponse.json({
        site: 'tenant',
        tenantName: tenant.name,
        password,
        users: users.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          functionalRole: getFunctionalRole(u.role, u.email, u.name),
        })),
      });
    }

    // Default — fallback
    return NextResponse.json({
      site: 'unknown',
      password,
      tenants: [],
    });
  } catch (error) {
    console.error('Demo credentials error:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }
}

function getFunctionalRole(dbRole: string, email: string, name: string): string {
  if (dbRole === 'super_admin') return 'Super Admin';
  if (dbRole === 'tenant_admin') return 'Tenant Admin';

  // Map admin role to functional role based on email/name patterns
  const emailLower = email.toLowerCase();
  const nameLower = name.toLowerCase();

  if (emailLower.includes('hr') || nameLower.includes('hr')) return 'HR Admin';
  if (emailLower.includes('recruiter') || nameLower.includes('recruiter')) return 'Recruiter';
  if (emailLower.includes('finance') || nameLower.includes('finance') || nameLower.includes('emma')) return 'Finance';
  if (emailLower.includes('manager') || nameLower.includes('manager')) return 'Manager';
  if (emailLower.includes('employee') || nameLower.includes('ravi') || nameLower.includes('raj') || nameLower.includes('alice') || nameLower.includes('bob')) return 'Employee';
  if (emailLower.includes('sales') || nameLower.includes('david')) return 'Sales';
  if (emailLower.includes('ops') || nameLower.includes('frank')) return 'Operations';
  if (emailLower.includes('design') || nameLower.includes('carol')) return 'Design';
  if (emailLower.includes('product') || nameLower.includes('grace')) return 'Product';
  if (emailLower.includes('candidate') || nameLower.includes('alex')) return 'Candidate';
  if (nameLower.includes('luxury') || emailLower.includes('luxury')) return 'Company Admin';
  if (nameLower.includes('consulting') || emailLower.includes('consulting')) return 'Company Admin';
  if (nameLower.includes('technolog') || emailLower.includes('technolog')) return 'Company Admin';
  if (nameLower.includes('marqai') || emailLower.includes('marqaitech')) return 'Company Admin';

  return 'Admin';
}
