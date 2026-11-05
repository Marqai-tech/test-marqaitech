import { NextResponse, after } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getServerHiddenSlugs, PLATFORM_PLACEHOLDER_NAME } from '@/lib/tenant-filter';
import { getTenantDashboardCounts } from '@/lib/tenant-aggregates';

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
    // GOLDEN RULE (Task 95): the super admin dashboard FOLLOWS the company
    // switcher. When ?tenantId= is present, every metric/list on this dashboard
    // is scoped to THAT tenant only. When absent, the view is platform-wide
    // (hidden tenants are always excluded).
    const scopeTenantIdParam = (new URL(request.url).searchParams.get('tenantId') || '').trim();
    const host = request.headers.get('host') || 'default';
    const cacheKey = `${host}|${scopeTenantIdParam}`;
    if (wantFull && fullDashboardCache && fullDashboardCache.host === cacheKey && Date.now() - fullDashboardCache.at < DASHBOARD_FULL_CACHE_MS) {
      return NextResponse.json(fullDashboardCache.body, {
        headers: { ...corsHeaders(), 'Server-Timing': 'cache;desc="full-hit"' },
      });
    }
    if (!wantFull && liteDashboardCache && liteDashboardCache.host === cacheKey && Date.now() - liteDashboardCache.at < DASHBOARD_CACHE_MS) {
      return NextResponse.json(liteDashboardCache.body, {
        headers: { ...corsHeaders(), 'Server-Timing': 'cache;desc="lite-hit"' },
      });
    }
    const liteHit =
      liteDashboardCache &&
      liteDashboardCache.host === cacheKey &&
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

    // Resolve the requested scope tenant (must be visible per the filter above
    // — a hidden/unknown tenantId silently falls back to platform-wide).
    let scopeTenant: { id: string; name: string; slug: string } | null = null;
    if (scopeTenantIdParam) {
      const t = await platformDb.tenant.findFirst({
        where: { ...tenantFilter, id: scopeTenantIdParam },
        select: { id: true, name: true, slug: true },
      });
      if (t) scopeTenant = t;
    }
    const scopeWhere = scopeTenant
      ? { ...tenantFilter, id: scopeTenant.id }
      : tenantFilter;

    const tDb = Date.now();
    let payload: Record<string, unknown>;

    if (wantFull && liteHit) {
      const counts = await getTenantDashboardCounts(platformDb, scopeWhere, { allowRefresh: true });
      payload = {
        ...liteHit,
        totalGroupCompanies: counts.groups,
        totalCompanies: counts.companies,
        totalEmployees: counts.employees,
        _agg: { tenantDbs: counts.tenantDbs, source: counts.source },
      };
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
    const visibleTenantWhere = scopeWhere;
    // Audit activity scope: when a tenant is selected, only show activity from
    // users of THAT tenant (GOLDEN RULE — no cross-tenant noise).
    const auditWhere = scopeTenant ? { user: { tenantId: scopeTenant.id } } : {};

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
      platformDb.tenant.count({ where: scopeWhere }),
      platformDb.tenant.count({ where: { ...scopeWhere, status: 'active' } }),
      platformDb.tenant.count({ where: { ...scopeWhere, status: 'suspended' } }),
      platformDb.tenant.count({ where: { ...scopeWhere, status: 'inactive' } }),
      platformDb.tenant.findMany({
        where: { ...scopeWhere, createdAt: { gte: sixMonthsAgo } },
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
        where: auditWhere,
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
      const counts = await getTenantDashboardCounts(platformDb, scopeWhere, { allowRefresh: true });
      totalGroupCompanies = counts.groups;
      totalCompanies = counts.companies;
      totalEmployees = counts.employees;
    } else {
      after(() => {
        getTenantDashboardCounts(platformDb, scopeWhere, { allowRefresh: true }).catch((e) => {
          console.error('[SuperAdmin Dashboard] Background tenant aggregate refresh failed:', e);
        });
      });
    }

    const payloadInner = {
      scopeTenant,
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
    liteDashboardCache = { at: Date.now(), host: cacheKey, body: payloadInner };
    }

    const dbMs = Date.now() - tDb;

    if (wantFull) {
      fullDashboardCache = { at: Date.now(), host: cacheKey, body: payload };
    } else {
      liteDashboardCache = { at: Date.now(), host: cacheKey, body: payload };
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
