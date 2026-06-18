import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/company-groups
 *
 * List company groups (a.k.a. "group companies") with their employee-strength
 * barriers and live counts.
 *
 *  - super_admin: pass ?tenantId=<id> to scope; otherwise returns groups across
 *    ALL tenants (with the parent tenant name attached).
 *  - tenant_admin / hr_admin / manager: scoped to caller's tenant only.
 *  - Other roles: scoped to caller's tenant (read-only).
 *
 * Response shape:
 *   { groups: [{
 *       id, name, tenantId, tenantName, employeeLimitMode, maxEmployees, maxCompanies,
 *       notes, createdAt, updatedAt,
 *       _count: { companies, employees },
 *       companies: [{ id, name, code, _count: { employees } }]
 *   }] }
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

    const role = (decoded.role as string) || 'employee';
    const callerTenantId = decoded.tenantId as string;

    const { searchParams } = new URL(request.url);
    const requestedTenantId = searchParams.get('tenantId');

    // Super admins can see group companies across ALL tenants (so groups they
    // create for any tenant show up in their view list). Tenant admins are
    // scoped to their own tenant only. The optional `tenantId` query param
    // lets a super admin filter to a single tenant if they want to.
    const where: Record<string, unknown> = {};
    if (role === 'super_admin') {
      if (requestedTenantId) {
        where.tenantId = requestedTenantId;
      }
      // No filter = return groups across ALL tenants
    } else {
      // tenant_admin / others: scoped to their own tenant
      if (callerTenantId) {
        where.tenantId = callerTenantId;
      } else {
        // No tenant on the caller — return nothing rather than leaking all tenants
        where.tenantId = '__none__';
      }
    }

    const groups = await prisma.companyGroup.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        companies: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            maxEmployees: true,
            plannedEmployeeCount: true,
            _count: { select: { employees: true } },
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { companies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute aggregate employee count per group (sum of employees across all companies)
    const enriched = groups.map((g) => {
      const employeesInGroup = g.companies.reduce((s, c) => s + (c._count?.employees || 0), 0);
      return {
        id: g.id,
        name: g.name,
        tenantId: g.tenantId,
        tenantName: g.tenant?.name || null,
        tenantSlug: g.tenant?.slug || null,
        employeeLimitMode: g.employeeLimitMode,
        maxEmployees: g.maxEmployees,
        maxCompanies: g.maxCompanies,
        notes: g.notes,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        _count: {
          companies: g._count?.companies || 0,
          employees: employeesInGroup,
        },
        companies: g.companies,
      };
    });

    return NextResponse.json({ groups: enriched }, { headers: corsHeaders() });
  } catch (error) {
    console.error('GET /api/company-groups error:', error);
    // Return 200 with an empty array (instead of 500) so the frontend doesn't
    // show a "Failed to load group companies" toast for transient DB errors.
    // The user sees an empty list with the standard empty-state UI instead.
    return NextResponse.json(
      { groups: [], error: 'Failed to load group companies — please try refreshing' },
      { status: 200, headers: corsHeaders() }
    );
  }
}

/**
 * POST /api/company-groups
 *
 * ─── PERMISSION RULE ───
 * Only SUPER ADMIN can create group companies. Tenant admins CANNOT create
 * group companies — they can only create COMPANIES under an existing group
 * company via /api/companies. This enforces the multi-tenancy hierarchy:
 *   Super admin → creates Tenant (= Group Company parent)
 *   Super admin → creates Group Companies under a tenant
 *   Tenant admin → creates Companies under a group company
 *
 * Body:
 *  - tenantId: string (required — which tenant this group is being created under)
 *  - name: string (required)
 *  - employeeLimitMode: 'per_company' | 'group_total' (default 'group_total')
 *  - maxEmployees: number | null  (null = unlimited)
 *  - maxCompanies: number | null  (null = unlimited)
 *  - notes: string | null
 */
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const role = (decoded.role as string) || 'employee';
    const callerTenantId = decoded.tenantId as string;

    // ─── PERMISSION RULE ───
    // Only SUPER ADMIN can create group companies / tenant companies.
    // Tenant admins can only create COMPANIES under an existing group company
    // (via /api/companies). This keeps the multi-tenancy hierarchy clean:
    //   Super admin → creates Tenant (= Group Company parent)
    //   Super admin → creates Group Companies under a tenant
    //   Tenant admin → creates Companies under a group company
    if (role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can create group companies. Tenant admins can create companies under an existing group company via the Companies page.' },
        { status: 403, headers: corsHeaders() }
      );
    }

    const body = await request.json();
    const {
      tenantId: bodyTenantId,
      name,
      employeeLimitMode,
      maxEmployees,
      maxCompanies,
      notes,
    } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Group company name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve target tenant — super admin must specify which tenant this group
    // is being created under. Fall back to callerTenantId if they didn't.
    const targetTenantId = bodyTenantId || callerTenantId;
    if (!targetTenantId) {
      return NextResponse.json({ error: 'Could not resolve target tenant' }, { status: 400, headers: corsHeaders() });
    }

    // Verify the tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
    if (!tenant) {
      return NextResponse.json({ error: 'Target tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    // Validate employeeLimitMode
    const mode = employeeLimitMode === 'per_company' ? 'per_company' : 'group_total';

    // Coerce numeric fields
    const maxEmp = typeof maxEmployees === 'number' && maxEmployees >= 0 ? maxEmployees : null;
    const maxComp = typeof maxCompanies === 'number' && maxCompanies >= 0 ? maxCompanies : null;

    // Check for duplicate name within the same tenant
    const existing = await prisma.companyGroup.findFirst({
      where: { tenantId: targetTenantId, name: { equals: String(name).trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A group company named "${name}" already exists under this tenant` },
        { status: 409, headers: corsHeaders() }
      );
    }

    const group = await prisma.companyGroup.create({
      data: {
        name: String(name).trim(),
        tenantId: targetTenantId,
        employeeLimitMode: mode,
        maxEmployees: maxEmp,
        maxCompanies: maxComp,
        notes: notes ? String(notes) : null,
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { companies: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_COMPANY_GROUP',
        module: 'company-groups',
        details: `Created group company "${group.name}" under tenant ${tenant.name} (mode=${mode}, maxEmployees=${maxEmp ?? 'unlimited'}, maxCompanies=${maxComp ?? 'unlimited'})`,
      },
    });

    return NextResponse.json({ group }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('POST /api/company-groups error:', error);
    return NextResponse.json({ error: 'Failed to create group company' }, { status: 500, headers: corsHeaders() });
  }
}
