import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
import { checkTenantStatusOrBlock } from '@/lib/tenant-guard';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const queryCompanyId = url.searchParams.get('companyId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = { status: 'active' };
    // If admin explicitly passes companyId query param, use it (overrides auto-scope)
    // This is needed for company mapping where admin selects a different company
    if (queryCompanyId) {
      where.companyId = queryCompanyId;
    } else if (companyFilter && Object.keys(companyFilter).length > 0) {
      // Otherwise use the auto-scoped filter from CompanySwitcher
      Object.assign(where, companyFilter);
    }

    const departments = await db.department.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { employees: true, designations: true } },
      },
    });

    const total = await db.department.count({ where });

    return NextResponse.json({
      data: departments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Departments GET error:', error);
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    // ─── Tenant status guard: block writes for suspended/inactive tenants ───
    const tenantBlock = await checkTenantStatusOrBlock(req, corsHeaders);
    if (tenantBlock) return tenantBlock;

    const auth = await getAuthInfo(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const body = await req.json();
    const { name, code, companyId, branchId, headId, parentDepartmentId, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }

    // If companyId not provided in body, resolve from user's scope
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const companyFilter = await getCompanyFilter(req);
      if (companyFilter && 'companyId' in companyFilter) {
        resolvedCompanyId = companyFilter.companyId as string;
      }
    }

    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400, headers: corsHeaders() });
    }

    const department = await db.department.create({
      data: {
        name,
        code: code || name.substring(0, 3).toUpperCase(),
        companyId: resolvedCompanyId,
        branchId: branchId || null,
        headId: headId || null,
        parentDepartmentId: parentDepartmentId || null,
        status: status || 'active',
      },
      include: {
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ department }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Departments POST error:', error);
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404, headers: corsHeaders() });
    }

    // Non-admin users can only update departments in their own company
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter && 'companyId' in companyFilter && existing.companyId !== companyFilter.companyId) {
      return NextResponse.json({ error: 'Forbidden: cannot modify department outside your company' }, { status: 403, headers: corsHeaders() });
    }

    const department = await db.department.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ department }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Departments PUT error:', error);
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404, headers: corsHeaders() });
    }

    // Non-admin users can only delete departments in their own company
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter && 'companyId' in companyFilter && existing.companyId !== companyFilter.companyId) {
      return NextResponse.json({ error: 'Forbidden: cannot delete department outside your company' }, { status: 403, headers: corsHeaders() });
    }

    await db.department.delete({ where: { id } });
    return NextResponse.json({ message: 'Department deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Departments DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete department' }, { status: 500, headers: corsHeaders() });
  }
}
