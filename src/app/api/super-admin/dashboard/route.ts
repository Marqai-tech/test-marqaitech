import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getServerHiddenSlugs, PLATFORM_PLACEHOLDER_NAME } from '@/lib/tenant-filter';

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

let liteDashboardCache: { at: number; host: string; body: Record<string, unknown> } | null = null;
let fullDashboardCache: { at: number; host: string; body: Record<string, unknown> } | null = null;
const DASHBOARD_CACHE_MS = 45_000;
const DASHBOARD_FULL_CACHE_MS = 120_000;

export async function GET(request: Request) {
  const t0 = Date.now();
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

    const wantFull = new URL(request.url).searchParams.get('full') === '1';
    const host = request.headers.get('host') || 'default';
    if (wantFull && fullDashboardCache && fullDashboardCache.host === host && Date.now() - fullDashboardCache.at < DASHBOARD_FULL_CACHE_MS) {
      return NextResponse.json(fullDashboardCache.body, {
        headers: { ...corsHeaders(), 'Server-Timing': 'cache;desc="full-hit"' },
      });
    }
    if (!wantFull && liteDashboardCache && liteDashboardCache.host === host && Date.now() - liteDashboardCache.at < DASHBOARD_CACHE_MS) {
      return NextResponse.json(liteDashboardCache.body, {
        headers: { ...corsHeaders(), 'Server-Timing': 'cache;desc="lite-hit"' },
      });
    }
    const liteHit =
      liteDashboardCache &&
      liteDashboardCache.host === host &&
      Date.now() - liteDashboardCache.at < DASHBOARD_CACHE_MS
        ? liteDashboardCache.body
        : null;

    const platformDb = getPlatformDb();
    const hiddenSlugs = getServerHiddenSlugs(request);

    // ALWAYS exclude hidden tenants (Marq AI Tech Pvt Ltd placeholder + demo)
    // regardless of mode detection — foolproof via tenant-filter.ts.
    // Also exclude by NAME — catches any stray tenant (e.g., '3boxes-corp')
    // that was created with the placeholder name but a different slug.
    const tenantFilter = {
      slug: { notIn: hiddenSlugs },
      NOT: { name: { contains: PLATFORM_PLACEHOLDER_NAME } },
    };

    const tDb = Date.now();
    let payload: Record<string, unknown>;

    if (wantFull && liteHit) {
      let totalGroupCompanies = 0;
      let totalCompanies = 0;
      let totalEmployees = 0;
      const tenants = await platformDb.tenant.findMany({
        where: tenantFilter,
        select: { slug: true },
      });
      const dedicatedDbs = await platformDb.tenantDatabase.findMany({
        where: { isActive: true, tenant: { slug: { in: tenants.map((t) => t.slug).filter(Boolean) as string[] } } },
        select: { tenant: { select: { slug: true } } },
      });
      const dedicatedSlugs = [...new Set(dedicatedDbs.map((r) => r.tenant?.slug).filter(Boolean) as string[])];
      const tenantTotals = await Promise.all(
        dedicatedSlugs.map(async (slug) => {
          try {
            const tenantDb = await getDbForTenant(slug);
            const [groupCount, companyCount, employeeCount] = await Promise.all([
              tenantDb.companyGroup.count(),
              tenantDb.company.count(),
              tenantDb.employee.count({ where: { status: 'active' } }),
            ]);
            return { groupCount, companyCount, employeeCount };
          } catch (e) {
            console.error(`[SuperAdmin Dashboard] Failed to count data for tenant "${slug}":`, e);
            return { groupCount: 0, companyCount: 0, employeeCount: 0 };
          }
        }),
      );
      for (const t of tenantTotals) {
        totalGroupCompanies += t.groupCount;
        totalCompanies += t.companyCount;
        totalEmployees += t.employeeCount;
      }
      payload = { ...liteHit, totalGroupCompanies, totalCompanies, totalEmployees };
    } else {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthWindows = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      return {
        monthLabel: monthDate.toLocaleString('en', { month: 'short' }),
        monthDate,
        nextMonth,
      };
    });
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const visibleTenantWhere = tenantFilter;

    // One Neon round-trip batch. Sequential counts + 6 monthly counts + 6
    // monthly subscription reads was ~4.7s on tester (iad1 → Neon).
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      inactiveTenants,
      tenantsCreated,
      activeSubscriptions,
      allPlans,
      recentSubs,
      recentTrials,
      expiringSubs,
      recentActivity,
    ] = await Promise.all([
      platformDb.tenant.count({ where: tenantFilter }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'active' } }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'suspended' } }),
      platformDb.tenant.count({ where: { ...tenantFilter, status: 'inactive' } }),
      platformDb.tenant.findMany({
        where: { ...tenantFilter, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      platformDb.subscription.findMany({
        where: { status: 'active', tenant: visibleTenantWhere },
        select: { amount: true, currency: true, createdAt: true },
      }),
      platformDb.subscriptionPlan.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          name: true,
          planType: true,
          _count: { select: { subscriptions: { where: { status: 'active' } } } },
        },
        orderBy: { name: 'asc' },
      }).catch((e) => {
        console.error('[SuperAdmin Dashboard] Top plans query failed:', e);
        return [] as { id: string; name: string; planType: string; _count: { subscriptions: number } }[];
      }),
      platformDb.subscription.findMany({
        where: { tenant: visibleTenantWhere },
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentStatus: true,
          createdAt: true,
          tenant: { select: { name: true } },
        },
      }).catch((e) => {
        console.error('[SuperAdmin Dashboard] Recent transactions query failed:', e);
        return [] as { id: string; amount: number | null; currency: string | null; paymentStatus: string | null; createdAt: Date | null; tenant: { name: string } | null }[];
      }),
      platformDb.trialRegistration.findMany({
        where: { tenant: visibleTenantWhere },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, companyName: true, status: true, createdAt: true },
      }).catch((e) => {
        console.error('[SuperAdmin Dashboard] Recently registered query failed:', e);
        return [] as { id: string; companyName: string; status: string; createdAt: Date | null }[];
      }),
      platformDb.subscription.findMany({
        where: {
          status: { in: ['active', 'expired'] },
          endDate: { lte: thirtyDaysFromNow },
          tenant: visibleTenantWhere,
        },
        take: 5,
        orderBy: { endDate: 'asc' },
        select: {
          id: true,
          endDate: true,
          tenantId: true,
          plan: { select: { name: true } },
          tenant: { select: { name: true, id: true, users: { take: 1, where: { role: 'tenant_admin' }, select: { email: true } } } },
        },
      }).catch((e) => {
        console.error('[SuperAdmin Dashboard] Expiring subscriptions query failed:', e);
        return [] as { id: string; endDate: Date | null; tenantId: string; plan: { name: string } | null; tenant: { name: string; id: string; users: { email: string }[] } | null }[];
      }),
      platformDb.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const companiesByMonth = monthWindows.map(({ monthLabel, monthDate, nextMonth }) => ({
      month: monthLabel,
      companies: tenantsCreated.filter((t) => t.createdAt >= monthDate && t.createdAt < nextMonth).length,
    }));
    const revenueByMonth = monthWindows.map(({ monthLabel, monthDate, nextMonth }) => ({
      month: monthLabel,
      revenue: activeSubscriptions
        .filter((s) => s.createdAt && s.createdAt >= monthDate && s.createdAt < nextMonth)
        .reduce((sum, s) => sum + (s.amount || 0), 0),
    }));
    const totalRevenue = activeSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);
    const maxPlanCount = Math.max(...allPlans.map((p) => p._count.subscriptions), 1);
    const topPlans = allPlans.map((p) => ({
      name: p.name,
      planType: p.planType,
      count: p._count.subscriptions,
      total: maxPlanCount,
    }));
    const recentTransactions = recentSubs.map((s) => ({
      id: s.id,
      company: s.tenant?.name || 'Unknown',
      amount: String(s.amount || 0),
      status: s.paymentStatus || 'pending',
      date: s.createdAt ? new Date(s.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
      currency: s.currency || 'INR',
    }));
    const recentlyRegistered = recentTrials.map((t) => ({
      id: t.id,
      name: t.companyName,
      plan: t.status === 'approved' ? 'Active' : t.status === 'pending' ? 'Pending' : t.status,
      date: t.createdAt ? new Date(t.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
    }));
    const expiringSubscriptions = expiringSubs.map((s) => ({
      id: s.id,
      company: s.tenant?.name || 'Unknown',
      plan: s.plan?.name || 'Unknown',
      expiredDate: s.endDate ? new Date(s.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      email: s.tenant?.users?.[0]?.email || '',
      tenantId: s.tenantId,
    }));

    let totalGroupCompanies = 0;
    let totalCompanies = 0;
    let totalEmployees = 0;

    if (wantFull) {
      const tenants = await platformDb.tenant.findMany({
        where: tenantFilter,
        select: { id: true, slug: true, status: true },
      });
      const dedicatedDbs = await platformDb.tenantDatabase.findMany({
        where: { isActive: true, tenant: { slug: { in: tenants.map((t) => t.slug).filter(Boolean) as string[] } } },
        select: { tenant: { select: { slug: true } } },
      });
      const dedicatedSlugs = [...new Set(dedicatedDbs.map((r) => r.tenant?.slug).filter(Boolean) as string[])];
      const tenantTotals = await Promise.all(
        dedicatedSlugs.map(async (slug) => {
          try {
            const tenantDb = await getDbForTenant(slug);
            const [groupCount, companyCount, employeeCount] = await Promise.all([
              tenantDb.companyGroup.count(),
              tenantDb.company.count(),
              tenantDb.employee.count({ where: { status: 'active' } }),
            ]);
            return { groupCount, companyCount, employeeCount };
          } catch (e) {
            console.error(`[SuperAdmin Dashboard] Failed to count data for tenant "${slug}":`, e);
            return { groupCount: 0, companyCount: 0, employeeCount: 0 };
          }
        }),
      );
      for (const t of tenantTotals) {
        totalGroupCompanies += t.groupCount;
        totalCompanies += t.companyCount;
        totalEmployees += t.employeeCount;
      }
    }

    const payloadInner = {
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
      companiesByMonth,
      revenueByMonth,
      topPlans,
      recentTransactions,
      recentlyRegistered,
      expiringSubscriptions,
      currencySymbol: '₹',
      currencyCode: 'INR',
    };
    payload = payloadInner;
    liteDashboardCache = { at: Date.now(), host, body: payloadInner };
    }

    const dbMs = Date.now() - tDb;

    if (wantFull) {
      fullDashboardCache = { at: Date.now(), host, body: payload };
    } else {
      liteDashboardCache = { at: Date.now(), host, body: payload };
    }
    return NextResponse.json(payload, {
      headers: {
        ...corsHeaders(),
        'Server-Timing': `db;dur=${dbMs},total;dur=${Date.now() - t0}`,
      },
    });
  } catch (error) {
    console.error('Super admin dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
