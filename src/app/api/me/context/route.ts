import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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
  const db = await getDb(request);
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

    // Resolve the caller's own company from their Employee record (if any).
    // Wrap in safe() — super_admin and tenant_admin typically have NO Employee
    // record, and if the Employee table has a schema mismatch this would
    // otherwise crash the whole endpoint.
    const employee = await safe(
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
    if (!ownCompanyId && !['super_admin', 'tenant_admin'].includes(role)) {
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
    if (!resolvedEmployeeId && !['super_admin', 'tenant_admin'].includes(role) && decoded.email) {
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
      availableTenants = await safe(
        'tenant.findMany(all)',
        () => getPlatformDb().tenant.findMany({
          select: { id: true, name: true, slug: true, plan: true, status: true, maxCompaniesAllowed: true },
          orderBy: { name: 'asc' },
        }),
        [],
      );

      // Companies scoped to the requested tenant (or first tenant if none)
      const effectiveTenantId = requestedTenantId || callerTenantId || availableTenants[0]?.id;
      if (effectiveTenantId) {
        availableCompanyGroups = await safe(
          'companyGroup.findMany(super_admin)',
          () => db.companyGroup.findMany({
            where: { tenantId: effectiveTenantId },
            select: {
              id: true, name: true, tenantId: true,
              employeeLimitMode: true, maxEmployees: true, maxCompanies: true, notes: true,
            },
            orderBy: { name: 'asc' },
          }),
          [],
        );
        const groupIds = availableCompanyGroups.map((g) => g.id);
        if (groupIds.length > 0) {
          availableCompanies = await safe(
            'company.findMany(super_admin)',
            () => db.company.findMany({
              where: { companyGroupId: { in: groupIds } },
              select: {
                id: true, name: true, code: true, companyGroupId: true,
                companyGroup: { select: { id: true, name: true } },
                // Company has no `employees` Prisma relation — count branches only
                _count: { select: { branches: true, departments: true } },
              },
              orderBy: { name: 'asc' },
            }),
            [],
          );
        }
      }
    } else if (role === 'tenant_admin') {
      // Tenant admin: scope to own tenant only
      if (callerTenantId) {
        availableCompanyGroups = await safe(
          'companyGroup.findMany(tenant_admin)',
          () => db.companyGroup.findMany({
            where: { tenantId: callerTenantId },
            select: {
              id: true, name: true, tenantId: true,
              employeeLimitMode: true, maxEmployees: true, maxCompanies: true, notes: true,
            },
            orderBy: { name: 'asc' },
          }),
          [],
        );
        const groupIds = availableCompanyGroups.map((g) => g.id);
        if (groupIds.length > 0) {
          availableCompanies = await safe(
            'company.findMany(tenant_admin)',
            () => db.company.findMany({
              where: { companyGroupId: { in: groupIds } },
              select: {
                id: true, name: true, code: true, companyGroupId: true,
                companyGroup: { select: { id: true, name: true } },
                // Company has no `employees` Prisma relation — count branches only
                _count: { select: { branches: true, departments: true } },
              },
              orderBy: { name: 'asc' },
            }),
            [],
          );
        }
      }
    }
    // For all other roles, look up EmployeeCompanyMapping records so employees
    // who are mapped to multiple companies can switch between them.
    if (!['super_admin', 'tenant_admin'].includes(role) && resolvedEmployeeId) {
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

    // Compute tenant-level company quota usage for tenant_admin
    let tenantQuota: {
      maxCompanies: number;
      used: number;
      remaining: number | null;
    } | null = null;
    if (callerTenant && (role === 'tenant_admin' || role === 'super_admin')) {
      const groupsForQuota = await safe(
        'companyGroup.findMany(quota)',
        () => db.companyGroup.findMany({
          where: { tenantId: callerTenant.id },
          select: { id: true },
        }),
        [],
      );
      const groupIdsForQuota = groupsForQuota.map((g) => g.id);
      const usedCompanies = groupIdsForQuota.length
        ? await safe(
            'company.count(quota)',
            () => db.company.count({ where: { companyGroupId: { in: groupIdsForQuota } } }),
            0,
          )
        : 0;
      tenantQuota = {
        maxCompanies: callerTenant.maxCompaniesAllowed,
        used: usedCompanies,
        remaining: callerTenant.maxCompaniesAllowed > 0 ? Math.max(0, callerTenant.maxCompaniesAllowed - usedCompanies) : null,
      };
    }

    return NextResponse.json({
      role,
      tenantId: callerTenantId,
      tenant: callerTenant,
      tenantQuota,
      ownCompanyId,
      ownCompany,
      availableTenants,
      availableCompanyGroups,
      availableCompanies,
      mappedCompanies,
    }, { headers: corsHeaders() });
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
