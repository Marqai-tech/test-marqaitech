import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getHiddenSlugsForRequest, PLATFORM_PLACEHOLDER_NAME } from '@/lib/tenant-filter';

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

const contextResponseCache = new Map<string, { at: number; body: unknown }>();
const CONTEXT_CACHE_MS = 30_000;

/**
 * Safe wrapper — runs a query and returns a default value on failure instead
 * of throwing. The error is logged with a label so we can pinpoint which
 * query is failing on Vercel from the server logs.
 *
 * This is critical for /api/me/context because the endpoint powers the header
 * dropdown: if ANY single query throws, the entire 500 response makes the
 * dropdown look "broken" even though 90% of the data is fine. With this
 * wrapper, a failed query just yields an empty list/null and the dropdown
 * still renders with whatever data we managed to fetch.
 */
async function safe<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[me/context] ${label} failed:`, msg);
    if (err && typeof err === 'object' && 'stack' in err) {
      console.error((err as { stack: string }).stack);
    }
    return fallback;
  }
}

/**
 * GET /api/me/context
 *
 * Returns the caller's company-scoping context:
 *  - role
 *  - tenantId / tenant (basic info)
 *  - ownCompanyId / ownCompany (resolved from Employee.companyId if linked)
 *  - availableTenants: super_admin only — all tenants
 *  - availableCompanyGroups: tenant_admin + super_admin — groups under selected tenant
 *  - availableCompanies: tenant_admin + super_admin — companies under selected tenant
 *
 * Super admins can switch across all tenants. Tenant admins can switch only
 * within their own tenant. All other roles see only their own (fixed) company.
 *
 * Query params:
 *  - tenantId: optional, for super_admin to scope companies to a specific tenant
 *              (defaults to the caller's tenant for tenant_admin)
 *
 * RESILIENCE: Each prisma query is wrapped in safe() so a single failure
 * (e.g., a missing relation, a corrupted row) doesn't 500 the whole endpoint.
 * The endpoint only 500s if the JWT verification itself fails.
 */
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

    const userId = decoded.userId as string;
    const role = (decoded.role as string) || 'employee';
    // callerTenantId may be undefined for super_admin tokens issued before
    // tenantId was made mandatory — coerce to null to avoid Prisma errors.
    const callerTenantId = (decoded.tenantId as string) || null;

    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId');
    const host = request.headers.get('host') || '';
    const ctxCacheKey = `${role}:${requestedTenantId || callerTenantId || ''}:${host}`;
    if (role === 'super_admin' || (role === 'tenant_admin' || role === 'ceo')) {
      const hit = contextResponseCache.get(ctxCacheKey);
      if (hit && Date.now() - hit.at < CONTEXT_CACHE_MS) {
        return NextResponse.json(hit.body, {
          headers: { ...corsHeaders(), 'Server-Timing': `cache;desc="hit",total;dur=${Date.now() - t0}` },
        });
      }
    }

    // Super admin / tenant admin never use Employee rows. Opening getDb() first
    // was an extra Neon hop on every header load (measured /api/me/context TTFB 4273ms).
    const db = ['super_admin', 'tenant_admin', 'ceo'].includes(role)
      ? getPlatformDb()
      : await getDb(request);

    // Super admin / tenant admin are not employees. Skip the Employee lookup
    // on the header context call (this was ~1 extra Neon hop on every page).
    const employee = ['super_admin', 'tenant_admin', 'ceo'].includes(role)
      ? null
      : await safe(
      'employee.findFirst',
      () => db.employee.findFirst({
        where: { userId },
        select: {
          id: true,
          companyId: true,
          email: true,
          branch: { select: { id: true, name: true, companyId: true, company: { select: { id: true, name: true, code: true } } } },
        },
      }),
      null,
    );

    let ownCompanyId: string | null = employee?.companyId || employee?.branch?.companyId || null;
    let ownCompany: { id: string; name: string; code: string | null } | null = null;

    if (ownCompanyId) {
      ownCompany = await safe(
        'company.findUnique(ownCompany)',
        () => db.company.findUnique({
          where: { id: ownCompanyId as string },
          select: { id: true, name: true, code: true },
        }),
        null,
      );
    }

    // For non-admin roles, try to find ownCompanyId from EmployeeCompanyMapping
    // if it wasn't set from the Employee record directly.
    if (!ownCompanyId && !['super_admin', 'tenant_admin', 'ceo'].includes(role)) {
      // Try by userId-linked employee first
      let employeeIdForMapping = employee?.id || null;

      // If no employee found by userId, try by email match
      if (!employeeIdForMapping && decoded.email) {
        const employeeByEmail = await safe(
          'employee.findFirst(emailFallback)',
          () => db.employee.findFirst({
            where: { email: { equals: decoded.email as string, mode: 'insensitive' } },
            select: { id: true, companyId: true },
          }),
          null,
        );
        if (employeeByEmail) {
          employeeIdForMapping = employeeByEmail.id;
          if (employeeByEmail.companyId) {
            ownCompanyId = employeeByEmail.companyId;
          }
        }
      }

      // Try to get companyId from EmployeeCompanyMapping
      if (employeeIdForMapping) {
        const primaryMapping = await safe(
          'employeeCompanyMapping.findFirst(primary)',
          () => db.employeeCompanyMapping.findFirst({
            where: { employeeId: employeeIdForMapping!, isPrimary: true, status: 'active' },
            select: { companyId: true, company: { select: { id: true, name: true, code: true } } },
          }),
          null,
        );
        if (primaryMapping) {
          ownCompanyId = primaryMapping.companyId;
          ownCompany = primaryMapping.company;
        } else {
          // Try any mapping if no primary
          const anyMapping = await safe(
            'employeeCompanyMapping.findFirst(any)',
            () => db.employeeCompanyMapping.findFirst({
              where: { employeeId: employeeIdForMapping!, status: 'active' },
              select: { companyId: true, company: { select: { id: true, name: true, code: true } } },
            }),
            null,
          );
          if (anyMapping) {
            ownCompanyId = anyMapping.companyId;
            ownCompany = anyMapping.company;
          }
        }
      }

      // Still no ownCompanyId? Fall back to tenant's first employee
      if (!ownCompanyId && callerTenantId) {
        const fallback = await safe(
          'employee.findFirst(fallback)',
          () => db.employee.findFirst({
            where: { user: { tenantId: callerTenantId } },
            select: {
              id: true,
              companyId: true,
              branch: { select: { company: { select: { id: true, name: true, code: true } } } },
            },
          }),
          null,
        );
        if (fallback) {
          ownCompanyId = fallback.companyId || fallback.branch?.company?.id || null;
          ownCompany = fallback.branch?.company || null;
        }
      }
    }

    // Resolve the employee ID for company mapping lookup.
    // If employee was found by userId, use that. Otherwise try by email.
    let resolvedEmployeeId: string | null = employee?.id || null;
    if (!resolvedEmployeeId && !['super_admin', 'tenant_admin', 'ceo'].includes(role) && decoded.email) {
      const employeeByEmail = await safe(
        'employee.findFirst(emailForMapping)',
        () => db.employee.findFirst({
          where: { email: { equals: decoded.email as string, mode: 'insensitive' } },
          select: { id: true },
        }),
        null,
      );
      resolvedEmployeeId = employeeByEmail?.id || null;
    }

    // Build the switcher lists based on role
    let availableTenants: { id: string; name: string; slug: string; plan: string; status: string; maxCompaniesAllowed?: number }[] = [];
    let availableCompanyGroups: {
      id: string; name: string; tenantId: string;
      employeeLimitMode?: string; maxEmployees?: number | null; maxCompanies?: number | null; notes?: string | null;
    }[] = [];
    let availableCompanies: {
      id: string; name: string; code: string | null;
      companyGroupId: string; companyGroup: { id: string; name: string };
      _count?: { branches: number; employees?: number };
    }[] = [];

    // For non-admin users, look up their EmployeeCompanyMapping records so they
    // can switch between companies they are mapped to.
    let mappedCompanies: {
      id: string; name: string; code: string | null;
      companyGroupId: string; employeeCode: string;
    }[] = [];

    if (role === 'super_admin') {
      // Super admin: list ALL tenants (not just 'active' ones) so the super
      // admin can see and manage suspended/pending tenants too.
      //
      // BIDIRECTIONAL FILTERING (FOOLPROOF):
      //   LIVE mode (3boxeshrms.com):  Hide demo tenant + placeholder tenant
      //     - '3boxes-hrms-demo' (demo tenant, not for production)
      //     - '3boxeshrms' (Marq AI Tech Pvt Ltd — platform placeholder, not a real tenant)
      //   DEMO mode (nexus-hrms-mu.vercel.app):  Hide live tenant
      //     - 'marqaitechgroup' (MarqAI Tech Group — real/live tenant, not for demo showcase)
      //
      // FOOLPROOF: Use tenant-filter.ts as PRIMARY (direct hostname check),
      // then ALSO check isLiveMode() as SECONDARY. A slug is hidden if
      // EITHER method says so. This prevents Vercel internal routing bugs.
      const allHiddenSlugs = getHiddenSlugsForRequest(request);
      const liveTenantFilter = {
        slug: { notIn: allHiddenSlugs },
        NOT: { name: { contains: PLATFORM_PLACEHOLDER_NAME } },
      };
      availableTenants = await safe(
        'tenant.findMany(all)',
        () => getPlatformDb().tenant.findMany({
          where: liveTenantFilter,
          select: { id: true, name: true, slug: true, plan: true, status: true, maxCompaniesAllowed: true },
          orderBy: { name: 'asc' },
        }),
        [],
      );
      // Companies scoped to the requested tenant (or first tenant if none)
      // GOLDEN RULE FIX: Validate both requestedTenantId and callerTenantId
      // against the FILTERED availableTenants. On the live site, the super
      // admin's JWT tenantId points to '3boxeshrms' (hidden), and if we
      // blindly use it as effectiveTenantId, we fetch companies/groups from
      // the hidden tenant's DB, leaking "Marq AI Tech Pvt Ltd" into the
      // company switcher.
      const requestedTenantIsVisible = requestedTenantId
        ? availableTenants.some((t) => t.id === requestedTenantId)
        : false;
      const callerTenantIsVisible = callerTenantId
        ? availableTenants.some((t) => t.id === callerTenantId)
        : false;
      const effectiveTenantId =
        (requestedTenantIsVisible ? requestedTenantId : null) ||
        (callerTenantIsVisible ? callerTenantId : null) ||
        availableTenants[0]?.id;

      // Debug log: verify filtering is working (AFTER effectiveTenantId is declared)
      console.log(`[me/context] host=${request.headers.get('host')}, filteredTenants=${availableTenants.length}, slugs=[${availableTenants.map((t: { slug: string }) => t.slug).join(',')}]`);
      console.log(`[me/context] GOLDEN RULE: requestedTenantId=${requestedTenantId || 'none'}, callerTenantId=${callerTenantId || 'none'}, requestedVisible=${requestedTenantIsVisible}, callerVisible=${callerTenantIsVisible}, effectiveTenantId=${effectiveTenantId || 'none'}`);
      if (effectiveTenantId) {
        const targetDb = await getDbForTenantById(effectiveTenantId);
        const groupSelect = {
          id: true, name: true, tenantId: true,
          employeeLimitMode: true, maxEmployees: true, maxCompanies: true, notes: true,
        } as const;
        const companySelect = {
          id: true, name: true, code: true, companyGroupId: true,
          companyGroup: { select: { id: true, name: true } },
          _count: { select: { branches: true, departments: true } },
        } as const;
        const [groups, companies] = await Promise.all([
          safe(
            'companyGroup.findMany(super_admin)',
            () => targetDb.companyGroup.findMany({
              where: { tenantId: effectiveTenantId },
              select: groupSelect,
              orderBy: { name: 'asc' },
            }),
            [],
          ),
          safe(
            'company.findMany(super_admin)',
            () => targetDb.company.findMany({
              where: { companyGroup: { tenantId: effectiveTenantId } },
              select: companySelect,
              orderBy: { name: 'asc' },
            }),
            [],
          ),
        ]);
        availableCompanyGroups = groups;
        availableCompanies = companies;
      }
    } else if ((role === 'tenant_admin' || role === 'ceo')) {
      // Tenant admin: scope to own tenant only
      if (callerTenantId) {
        // AUTO-HEAL: Ensure the tenant has at least one default group company.
        // Without this, legacy tenants created before the auto-group feature would
        // show availableCompanyGroups: [] and the tenant admin would be unable to
        // add companies (the form requires selecting a group). This mirrors the
        // same auto-heal logic in GET /api/company-groups.
        // FIX: Use tenant-specific DB for the existence check, because
        // CompanyGroup lives in the tenant DB, not the platform DB. Previously
        // this used getPlatformDb() which would never find groups in the tenant
        // DB, causing auto-heal to either fail silently or create duplicates.
        // FIX: Use tenant-specific DB for tenant_admin too, in case
        // getDb(request) routed to the wrong DB (e.g., platform DB fallback).
        const tenantAdminDb = await getDbForTenantById(callerTenantId);
        const [groups, companies] = await Promise.all([
          safe(
            'companyGroup.findMany(tenant_admin)',
            () => tenantAdminDb.companyGroup.findMany({
              where: { tenantId: callerTenantId },
              select: {
                id: true, name: true, tenantId: true,
                employeeLimitMode: true, maxEmployees: true, maxCompanies: true, notes: true,
              },
              orderBy: { name: 'asc' },
            }),
            [],
          ),
          safe(
            'company.findMany(tenant_admin)',
            () => tenantAdminDb.company.findMany({
              where: { companyGroup: { tenantId: callerTenantId } },
              select: {
                id: true, name: true, code: true, companyGroupId: true,
                companyGroup: { select: { id: true, name: true } },
                _count: { select: { branches: true, departments: true } },
              },
              orderBy: { name: 'asc' },
            }),
            [],
          ),
        ]);
        availableCompanyGroups = groups;
        availableCompanies = companies;
      }
    }
    // For all other roles, look up EmployeeCompanyMapping records so employees
    // who are mapped to multiple companies can switch between them.
    if (!['super_admin', 'tenant_admin', 'ceo'].includes(role) && resolvedEmployeeId) {
      const mappings = await safe(
        'employeeCompanyMapping.findMany',
        () => db.employeeCompanyMapping.findMany({
          where: { employeeId: resolvedEmployeeId!, status: 'active' },
          select: {
            employeeCode: true,
            isPrimary: true,
            company: {
              select: {
                id: true,
                name: true,
                code: true,
                companyGroupId: true,
              },
            },
          },
          orderBy: { isPrimary: 'desc' },
        }),
        [],
      );
      if (mappings.length > 0) {
        mappedCompanies = mappings.map((m) => ({
          id: m.company.id,
          name: m.company.name,
          code: m.company.code,
          companyGroupId: m.company.companyGroupId,
          employeeCode: m.employeeCode,
        }));
        // Also populate availableCompanies so the frontend dropdown can render
        // them consistently. We don't have group info here, so we do a separate
        // fetch for the company details with group relation.
        const mappedCompanyIds = mappedCompanies.map((mc) => mc.id);
        availableCompanies = await safe(
          'company.findMany(employeeMappings)',
          () => db.company.findMany({
            where: { id: { in: mappedCompanyIds } },
            select: {
              id: true, name: true, code: true, companyGroupId: true,
              companyGroup: { select: { id: true, name: true } },
              _count: { select: { branches: true, departments: true } },
            },
            orderBy: { name: 'asc' },
          }),
          [],
        );
        // Also fetch the company groups for those mapped companies
        const mappedGroupIds = [...new Set(availableCompanies.map((c) => c.companyGroupId).filter(Boolean))];
        if (mappedGroupIds.length > 0) {
          availableCompanyGroups = await safe(
            'companyGroup.findMany(employeeMappings)',
            () => db.companyGroup.findMany({
              where: { id: { in: mappedGroupIds as string[] } },
              select: {
                id: true, name: true, tenantId: true,
                employeeLimitMode: true, maxEmployees: true, maxCompanies: true, notes: true,
              },
              orderBy: { name: 'asc' },
            }),
            [],
          );
        }
      }
    }

    // Resolve caller's tenant info (for header display + quota info)
    const callerTenant = callerTenantId
      ? await safe(
          'tenant.findUnique(caller)',
          () => getPlatformDb().tenant.findUnique({
            where: { id: callerTenantId },
            select: {
              id: true, name: true, slug: true, plan: true, status: true,
              maxCompaniesAllowed: true, country: true, currency: true, timezone: true,
            },
          }),
          null,
        )
      : null;

    // Quota from companies already loaded for the switcher — no extra DB hop.
    let tenantQuota: {
      maxCompanies: number;
      used: number;
      remaining: number | null;
    } | null = null;
    if (callerTenant && ((role === 'tenant_admin' || role === 'ceo') || role === 'super_admin')) {
      const usedCompanies = availableCompanies.length;
      tenantQuota = {
        maxCompanies: callerTenant.maxCompaniesAllowed,
        used: usedCompanies,
        remaining: callerTenant.maxCompaniesAllowed > 0 ? Math.max(0, callerTenant.maxCompaniesAllowed - usedCompanies) : null,
      };
    }

    // ─── LIVE/DEMO MODE TENANT OVERRIDE ───
    // If the caller's own tenant is filtered from availableTenants (e.g., the
    // super admin's JWT points to '3boxeshrms' which is hidden on the live site),
    // override tenantId/tenant to the first available tenant so the company
    // switcher defaults correctly instead of showing a dead reference.
    let effectiveTenantId = callerTenantId;
    let effectiveTenant = callerTenant;
    let tenantWasOverridden = false;
    if (role === 'super_admin' && callerTenantId) {
      const callerInAvailable = availableTenants.some((t) => t.id === callerTenantId);
      if (!callerInAvailable && availableTenants.length > 0) {
        effectiveTenantId = availableTenants[0].id;
        effectiveTenant = await safe(
          'tenant.findUnique(override)',
          () => getPlatformDb().tenant.findUnique({
            where: { id: effectiveTenantId as string },
            select: {
              id: true, name: true, slug: true, plan: true, status: true,
              maxCompaniesAllowed: true, country: true, currency: true, timezone: true,
            },
          }),
          null,
        );
        tenantWasOverridden = true;
      }
    }

    if (tenantWasOverridden && effectiveTenant) {
      const usedCompanies = availableCompanies.length;
      tenantQuota = {
        maxCompanies: effectiveTenant.maxCompaniesAllowed,
        used: usedCompanies,
        remaining: effectiveTenant.maxCompaniesAllowed > 0 ? Math.max(0, effectiveTenant.maxCompaniesAllowed - usedCompanies) : null,
      };
    }

    // ─── FIX: Scrub ownCompany/ownCompanyId if they belong to hidden tenant ───
    // Super admins from the hidden tenant may have ownCompany set to a company
    // in the hidden tenant's DB. This should not leak to the client.
    if (tenantWasOverridden) {
      ownCompanyId = null;
      ownCompany = null;
    }

    // ─── FIX: Ensure availableTenants includes caller's own tenant ───
    // For tenant_admin and non-admin roles, availableTenants was never populated
    // (only super_admin gets the full tenant list). This causes the safety net
    // filter (below) to build an empty visibleTenantIdSet, which wipes out ALL
    // company groups and companies — making the company switcher show nothing
    // for tenant_admins on their own tenant subdomain (e.g. marqaitechgroup.3boxeshrms.com).
    // We must add the caller's own tenant so the safety net preserves their data.
    if (callerTenantId && callerTenant && !availableTenants.some(t => t.id === callerTenantId)) {
      availableTenants.push({
        id: callerTenant.id,
        name: callerTenant.name,
        slug: callerTenant.slug,
        plan: callerTenant.plan,
        status: callerTenant.status,
        maxCompaniesAllowed: callerTenant.maxCompaniesAllowed,
      });
    }

    // ─── SERVER-SIDE SAFETY NET (GOLDEN RULE — FOOLPROOF) ───
    // Belt-and-suspenders: even if the filtering above has a bug, we scrub
    // the response data one last time before sending it. This ensures NO
    // hidden tenant data ever reaches the client.
    // FOOLPROOF: Use tenant-filter.ts (direct hostname check) as PRIMARY,
    // then ALSO check isLiveMode() as SECONDARY.
    const hiddenSlugsFinal = getHiddenSlugsForRequest(request);

    // 1. Scrub tenant/tenantId if they point to a hidden slug
    if (effectiveTenant && effectiveTenant.slug && hiddenSlugsFinal.includes(effectiveTenant.slug)) {
      console.warn(`[me/context] GOLDEN RULE: Scrubbing hidden tenant "${effectiveTenant.slug}" from response tenant field`);
      effectiveTenant = availableTenants[0]
        ? await safe(
            'tenant.findUnique(scrub)',
            () => getPlatformDb().tenant.findUnique({
              where: { id: availableTenants[0].id },
              select: {
                id: true, name: true, slug: true, plan: true, status: true,
                maxCompaniesAllowed: true, country: true, currency: true, timezone: true,
              },
            }),
            null,
          )
        : null;
      effectiveTenantId = effectiveTenant?.id || null;
    }

    // 2. Filter availableTenants one more time (should already be filtered, but just in case)
    // Also filter by NAME — catches stray tenants with the placeholder name.
    const finalAvailableTenants = availableTenants.filter(
      (t) => !hiddenSlugsFinal.includes(t.slug) && !(t.name || '').includes(PLATFORM_PLACEHOLDER_NAME)
    );

    // 3. Filter availableCompanyGroups — remove any that belong to hidden tenants
    //    AND deduplicate by name+tenantId (fixes duplicate groups from old auto-heal bug)
    const visibleTenantIdSet = new Set(finalAvailableTenants.map((t) => t.id));
    const seenGroupKeys = new Set<string>();
    const finalAvailableCompanyGroups = availableCompanyGroups.filter((g) => {
      if (!visibleTenantIdSet.has(g.tenantId)) return false;
      // Deduplicate by name+tenantId (different IDs but same name = duplicate)
      const groupKey = `${g.tenantId}:${g.name}`;
      if (seenGroupKeys.has(groupKey)) return false;
      seenGroupKeys.add(groupKey);
      return true;
    });

    // 4. Filter availableCompanies — remove any whose group was filtered out
    //    AND deduplicate by company ID
    const visibleGroupIdSet = new Set(finalAvailableCompanyGroups.map((g) => g.id));
    const seenCompanyIds = new Set<string>();
    const finalAvailableCompanies = availableCompanies.filter((c) => {
      if (!visibleGroupIdSet.has(c.companyGroupId)) return false;
      if (seenCompanyIds.has(c.id)) return false; // dedup by id
      seenCompanyIds.add(c.id);
      return true;
    });

    // 5. Scrub tenantQuota if it was computed from a hidden tenant
    let finalTenantQuota = tenantQuota;
    if (tenantQuota && effectiveTenant && effectiveTenant.slug && hiddenSlugsFinal.includes(effectiveTenant.slug)) {
      finalTenantQuota = null;
    }

    // 6. Scrub ownCompanyId/ownCompany if they might belong to a hidden tenant
    // (super_admin from hidden tenant shouldn't see their "own company")
    let finalOwnCompanyId = ownCompanyId;
    let finalOwnCompany = ownCompany;
    if (effectiveTenant && hiddenSlugsFinal.includes(effectiveTenant.slug)) {
      finalOwnCompanyId = null;
      finalOwnCompany = null;
    }

    // 7. Filter mappedCompanies — remove any whose companyGroupId was filtered out
    const finalMappedCompanies = mappedCompanies.filter(
      (mc) => visibleGroupIdSet.has(mc.companyGroupId)
    );

    console.log(`[me/context] GOLDEN RULE FINAL: hiddenSlugs=[${hiddenSlugsFinal.join(',')}], tenants=${finalAvailableTenants.length}, groups=${finalAvailableCompanyGroups.length}, companies=${finalAvailableCompanies.length}, tenantSlug=${effectiveTenant?.slug || 'null'}, envMode=${process.env.SITE_MODE || 'unset'}`);

    const body = {
      role,
      tenantId: effectiveTenantId,
      tenant: effectiveTenant,
      tenantQuota: finalTenantQuota,
      ownCompanyId: finalOwnCompanyId,
      ownCompany: finalOwnCompany,
      availableTenants: finalAvailableTenants,
      availableCompanyGroups: finalAvailableCompanyGroups,
      availableCompanies: finalAvailableCompanies,
      mappedCompanies: finalMappedCompanies,
    };
    if (role === 'super_admin' || (role === 'tenant_admin' || role === 'ceo')) {
      contextResponseCache.set(ctxCacheKey, { at: Date.now(), body });
    }
    return NextResponse.json(body, { headers: { ...corsHeaders(), 'Server-Timing': `total;dur=${Date.now() - t0}` } });
  } catch (error) {
    // Log the FULL error so we can debug from Vercel logs.
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('GET /api/me/context UNHANDLED error:', msg);
    if (stack) console.error(stack);
    return NextResponse.json(
      {
        error: 'Failed to fetch user context',
        detail: msg,
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}
