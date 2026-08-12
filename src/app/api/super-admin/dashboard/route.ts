import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isLiveMode, isDemoTenant } from '@/lib/site-mode';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const userRole = decoded.role as string;
    if (userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can view platform dashboard' }, { status: 403, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const liveMode = isLiveMode(request);

    // On LIVE mode, exclude the demo tenant from counts and lists
    const tenantFilter = liveMode ? { slug: { not: '3boxes-hrms-demo' } } : {};

    // Tenant counts by status (from platform DB)
    const [totalTenants, activeTenants, suspendedTenants, inactiveTenants] = await Promise.all([
      platformDb.tenant.count({ where: tenantFilter }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'active' } }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'suspended' } }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'inactive' } }),
    ]);

    // ─── Aggregate counts across ALL tenant databases ───
    const tenants = await platformDb.tenant.findMany({
      where: tenantFilter,
      select: { id: true, slug: true, status: true },
    });

    let totalGroupCompanies = 0;
    let totalCompanies = 0;
    let totalEmployees = 0;

    // Also count from platform DB (for tenants without a dedicated DB)
    try {
      totalGroupCompanies += await platformDb.companyGroup.count();
      totalCompanies += await platformDb.company.count();
      totalEmployees += await platformDb.employee.count({ where: { status: 'active' } });
    } catch (e) {
      console.error('[SuperAdmin Dashboard] Platform DB count failed:', e);
    }

    // Then add counts from each tenant's dedicated DB
    for (const tenant of tenants) {
      if (!tenant.slug) continue;
      try {
        const tenantDb = await getDbForTenant(tenant.slug);
        // If getDbForTenant returns the platform DB (no dedicated DB exists),
        // we've already counted those records above, so skip to avoid double-counting
        const tenantDbRecord = await platformDb.tenantDatabase.findFirst({
          where: {
            tenant: { slug: tenant.slug },
            isActive: true,
          },
          select: { id: true },
        });
        if (!tenantDbRecord) continue; // No dedicated DB — already counted above

        const [groupCount, companyCount, employeeCount] = await Promise.all([
          tenantDb.companyGroup.count(),
          tenantDb.company.count(),
          tenantDb.employee.count({ where: { status: 'active' } }),
        ]);

        totalGroupCompanies += groupCount;
        totalCompanies += companyCount;
        totalEmployees += employeeCount;
      } catch (e) {
        console.error(`[SuperAdmin Dashboard] Failed to count data for tenant "${tenant.slug}":`, e);
        // Continue with other tenants — don't let one failure block the dashboard
      }
    }

    // Total revenue from active subscriptions (platform DB)
    const activeSubscriptions = await platformDb.subscription.findMany({
      where: { status: 'active' },
      select: { amount: true },
    });
    const totalRevenue = activeSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);

    // Recent activity from platform DB audit logs (super admin's own actions)
    const recentActivity = await platformDb.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      totalTenants,
      activeTenants,
      suspendedTenants,
      inactiveTenants,
      totalGroupCompanies,
      totalCompanies,
      totalEmployees,
      totalRevenue,
      platformHealth: totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0,
      recentActivity,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Super admin dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
