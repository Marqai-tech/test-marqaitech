import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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
 */
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

    const userId = decoded.userId as string;
    const role = (decoded.role as string) || 'employee';
    const callerTenantId = decoded.tenantId as string;

    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId');

    // Resolve the caller's own company from their Employee record (if any)
    const employee = await prisma.employee.findFirst({
      where: { userId },
      select: {
        id: true,
        companyId: true,
        branch: { select: { id: true, name: true, companyId: true, company: { select: { id: true, name: true, code: true } } } },
      },
    });

    let ownCompanyId: string | null = employee?.companyId || employee?.branch?.companyId || null;
    let ownCompany: { id: string; name: string; code: string | null } | null = null;

    if (ownCompanyId) {
      ownCompany = await prisma.company.findUnique({
        where: { id: ownCompanyId },
        select: { id: true, name: true, code: true },
      });
    } else {
      // Fall back: if the user has no Employee record but is a non-admin, try
      // to derive from the first employee in their tenant (best-effort for
      // demo accounts). Admins typically don't have an employee record.
      if (!['super_admin', 'tenant_admin'].includes(role)) {
        const fallback = await prisma.employee.findFirst({
          where: { user: { tenantId: callerTenantId } },
          select: {
            id: true,
            companyId: true,
            branch: { select: { company: { select: { id: true, name: true, code: true } } } },
          },
        });
        if (fallback) {
          ownCompanyId = fallback.companyId || fallback.branch?.company?.id || null;
          ownCompany = fallback.branch?.company || null;
        }
      }
    }

    // Build the switcher lists based on role
    let availableTenants: { id: string; name: string; slug: string; plan: string; status: string }[] = [];
    let availableCompanyGroups: { id: string; name: string; tenantId: string }[] = [];
    let availableCompanies: {
      id: string;
      name: string;
      code: string | null;
      companyGroupId: string;
      companyGroup: { id: string; name: string };
      _count?: { branches: number };
    }[] = [];

    if (role === 'super_admin') {
      // Super admin: list ALL tenants (not just 'active' ones) so the super
      // admin can see and manage suspended/pending tenants too. Previously
      // filtering by status='active' meant newly-created tenants (which used
      // to default to 'pending_approval') were invisible in the header
      // dropdown.
      availableTenants = await prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, plan: true, status: true, maxCompaniesAllowed: true },
        orderBy: { name: 'asc' },
      });

      // Companies scoped to the requested tenant (or first tenant if none)
      const effectiveTenantId = requestedTenantId || callerTenantId || availableTenants[0]?.id;
      if (effectiveTenantId) {
        availableCompanyGroups = await prisma.companyGroup.findMany({
          where: { tenantId: effectiveTenantId },
          select: {
            id: true,
            name: true,
            tenantId: true,
            employeeLimitMode: true,
            maxEmployees: true,
            maxCompanies: true,
            notes: true,
          },
          orderBy: { name: 'asc' },
        });
        const groupIds = availableCompanyGroups.map((g) => g.id);
        if (groupIds.length > 0) {
          availableCompanies = await prisma.company.findMany({
            where: { companyGroupId: { in: groupIds } },
            select: {
              id: true,
              name: true,
              code: true,
              companyGroupId: true,
              companyGroup: { select: { id: true, name: true } },
              _count: { select: { branches: true, employees: true } },
            },
            orderBy: { name: 'asc' },
          });
        }
      }
    } else if (role === 'tenant_admin') {
      // Tenant admin: scope to own tenant only
      availableCompanyGroups = await prisma.companyGroup.findMany({
        where: { tenantId: callerTenantId },
        select: {
          id: true,
          name: true,
          tenantId: true,
          employeeLimitMode: true,
          maxEmployees: true,
          maxCompanies: true,
          notes: true,
        },
        orderBy: { name: 'asc' },
      });
      const groupIds = availableCompanyGroups.map((g) => g.id);
      if (groupIds.length > 0) {
        availableCompanies = await prisma.company.findMany({
          where: { companyGroupId: { in: groupIds } },
          select: {
            id: true,
            name: true,
            code: true,
            companyGroupId: true,
            companyGroup: { select: { id: true, name: true } },
            _count: { select: { branches: true, employees: true } },
          },
          orderBy: { name: 'asc' },
        });
      }
    }
    // For all other roles, availableCompanies stays empty (no switching allowed)

    // Resolve caller's tenant info (for header display + quota info)
    const callerTenant = callerTenantId
      ? await prisma.tenant.findUnique({
          where: { id: callerTenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            maxCompaniesAllowed: true,
            country: true,
            currency: true,
            timezone: true,
          },
        })
      : null;

    // Compute tenant-level company quota usage for tenant_admin
    let tenantQuota: {
      maxCompanies: number;
      used: number;
      remaining: number | null;
    } | null = null;
    if (callerTenant && (role === 'tenant_admin' || role === 'super_admin')) {
      const groupsForQuota = await prisma.companyGroup.findMany({
        where: { tenantId: callerTenant.id },
        select: { id: true },
      });
      const groupIdsForQuota = groupsForQuota.map((g) => g.id);
      const usedCompanies = groupIdsForQuota.length
        ? await prisma.company.count({ where: { companyGroupId: { in: groupIdsForQuota } } })
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
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('GET /api/me/context error:', error);
    return NextResponse.json({ error: 'Failed to fetch user context' }, { status: 500, headers: corsHeaders() });
  }
}
