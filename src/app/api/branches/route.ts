import { NextRequest, NextResponse } from 'next/server';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
import prisma from '@/lib/prisma';

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
  try {
    // ─── Company-scoped data visibility ───
    // Use getCompanyFilter to enforce that non-admins only see their own company's branches.
    // Admins with a specific company selected in the CompanySwitcher see that company's branches.
    // Admins with no company selected see all branches.
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const search = url.searchParams.get('search');

    const where: Record<string, unknown> = { status: 'active', ...companyFilter };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const branches = await prisma.branch.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        company: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
    });

    const total = await prisma.branch.count({ where });

    return NextResponse.json({
      data: branches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches GET error:', error);
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    // ─── Auth + company scoping for mutations ───
    const authInfo = await getAuthInfo(req);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    // Only admins can create branches
    if (!['super_admin', 'tenant_admin', 'admin'].includes(authInfo.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const { name, code, companyId, country, state, city, address, zipCode, phone, email, status } = body;

    if (!name || !companyId) {
      return NextResponse.json({ error: 'Name and companyId are required' }, { status: 400, headers: corsHeaders() });
    }

    // Verify the company exists and belongs to the admin's tenant (for non-super_admin)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, companyGroup: { select: { tenantId: true } } },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders() });
    }
    if (authInfo.role !== 'super_admin' && company.companyGroup.tenantId !== authInfo.tenantId) {
      return NextResponse.json({ error: 'Company does not belong to your tenant' }, { status: 403, headers: corsHeaders() });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code: code || name.substring(0, 3).toUpperCase(),
        companyId,
        country: country || 'India',
        state,
        city,
        address,
        zipCode,
        phone,
        email,
        status: status || 'active',
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ branch }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Branches POST error:', error);
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authInfo = await getAuthInfo(req);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    // Only admins can update branches
    if (!['super_admin', 'tenant_admin', 'admin'].includes(authInfo.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await prisma.branch.findUnique({
      where: { id },
      include: { company: { select: { id: true, companyGroup: { select: { tenantId: true } } } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404, headers: corsHeaders() });
    }

    // Verify ownership for non-super_admin
    if (authInfo.role !== 'super_admin' && existing.company?.companyGroup?.tenantId !== authInfo.tenantId) {
      return NextResponse.json({ error: 'Branch does not belong to your tenant' }, { status: 403, headers: corsHeaders() });
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ branch }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches PUT error:', error);
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authInfo = await getAuthInfo(req);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    // Only admins can delete branches
    if (!['super_admin', 'tenant_admin', 'admin'].includes(authInfo.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403, headers: corsHeaders() });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await prisma.branch.findUnique({
      where: { id },
      include: { company: { select: { id: true, companyGroup: { select: { tenantId: true } } } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404, headers: corsHeaders() });
    }

    // Verify ownership for non-super_admin
    if (authInfo.role !== 'super_admin' && existing.company?.companyGroup?.tenantId !== authInfo.tenantId) {
      return NextResponse.json({ error: 'Branch does not belong to your tenant' }, { status: 403, headers: corsHeaders() });
    }

    await prisma.branch.delete({ where: { id } });
    return NextResponse.json({ message: 'Branch deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500, headers: corsHeaders() });
  }
}
