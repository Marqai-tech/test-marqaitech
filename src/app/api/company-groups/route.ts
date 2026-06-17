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

    let effectiveTenantId: string | null = null;
    if (role === 'super_admin') {
      effectiveTenantId = requestedTenantId || callerTenantId || null;
    } else {
      effectiveTenantId = callerTenantId;
    }

    const where: Record<string, unknown> = {};
    if (effectiveTenantId) {
      where.tenantId = effectiveTenantId;
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
    return NextResponse.json({ error: 'Internal server error', groups: [] }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * POST /api/company-groups
 *
 * Super admin (or tenant admin for their own tenant) creates a new group company
 * with employee-strength barriers.
 *
 * Body:
 *  - tenantId: string (required for super_admin; ignored for tenant_admin — uses their own)
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

    if (!['super_admin', 'tenant_admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Only super admins or tenant admins can create group companies' },
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

    // Resolve target tenant
    const targetTenantId = role === 'super_admin' ? (bodyTenantId || callerTenantId) : callerTenantId;
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
