import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getDesignationCompanyFilter, getAuthInfo, getCompanyFilter } from '@/lib/companyScope';
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
    const designationFilter = await getDesignationCompanyFilter(req);
    if (designationFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const departmentId = url.searchParams.get('departmentId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // getDesignationCompanyFilter() already reads ?companyId= from the URL for admins
    // (via resolveCompanyScope), so no manual queryCompanyId handling needed.
    const where: Record<string, unknown> = { status: 'active' };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    // Apply company scoping via Department relation
    if (Object.keys(designationFilter).length > 0) {
      where.department = { ...designationFilter };
    }

    const designations = await db.designation.findMany({
      where,
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        department: { select: { id: true, name: true, companyId: true } },
        _count: { select: { employees: true } },
      },
    });

    const total = await db.designation.count({ where });

    return NextResponse.json({
      data: designations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations GET error:', error);
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
    const { title, departmentId, level, minSalary, maxSalary, status } = body;

    if (!title || !departmentId) {
      return NextResponse.json({ error: 'Title and departmentId are required' }, { status: 400, headers: corsHeaders() });
    }

    // Verify the department belongs to the user's/company-switcher's company
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter && 'companyId' in companyFilter) {
      const department = await db.department.findFirst({
        where: { id: departmentId, companyId: companyFilter.companyId as string },
      });
      if (!department) {
        return NextResponse.json({ error: 'Department not found in the selected company. Please select a valid department for this company.' }, { status: 403, headers: corsHeaders() });
      }
    } else {
      // No company filter (admin without company selected) — just verify the department exists
      const department = await db.department.findFirst({
        where: { id: departmentId },
      });
      if (!department) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404, headers: corsHeaders() });
      }
    }

    const designation = await db.designation.create({
      data: {
        title,
        departmentId,
        level: level || 1,
        minSalary: minSalary || null,
        maxSalary: maxSalary || null,
        status: status || 'active',
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ designation }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Designations POST error:', error);
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500, headers: corsHeaders() });
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
      return NextResponse.json({ error: 'Designation ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.designation.findUnique({
      where: { id },
      include: { department: { select: { companyId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Designation not found' }, { status: 404, headers: corsHeaders() });
    }

    // Non-admin users can only update designations in their own company
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter && 'companyId' in companyFilter && existing.department.companyId !== companyFilter.companyId) {
      return NextResponse.json({ error: 'Forbidden: cannot modify designation outside your company' }, { status: 403, headers: corsHeaders() });
    }

    const designation = await db.designation.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ designation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations PUT error:', error);
    return NextResponse.json({ error: 'Failed to update designation' }, { status: 500, headers: corsHeaders() });
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
      return NextResponse.json({ error: 'Designation ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.designation.findUnique({
      where: { id },
      include: { department: { select: { companyId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Designation not found' }, { status: 404, headers: corsHeaders() });
    }

    // Non-admin users can only delete designations in their own company
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter && 'companyId' in companyFilter && existing.department.companyId !== companyFilter.companyId) {
      return NextResponse.json({ error: 'Forbidden: cannot delete designation outside your company' }, { status: 403, headers: corsHeaders() });
    }

    await db.designation.delete({ where: { id } });
    return NextResponse.json({ message: 'Designation deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete designation' }, { status: 500, headers: corsHeaders() });
  }
}
