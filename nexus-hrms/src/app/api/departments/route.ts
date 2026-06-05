import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const companyId = searchParams.get('companyId');
    const branchId = searchParams.get('branchId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
        include: {
          branch: true,
          company: true,
          parentDepartment: true,
          designations: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.department.count({ where }),
    ]);

    return NextResponse.json(
      { departments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get departments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      name, code, companyId, branchId, headId,
      parentDepartmentId, costCenterId, businessUnitId, status,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const department = await prisma.department.create({
      data: {
        name,
        code: code || null,
        companyId,
        branchId: branchId || null,
        headId: headId || null,
        parentDepartmentId: parentDepartmentId || null,
        costCenterId: costCenterId || null,
        businessUnitId: businessUnitId || null,
        status: status || 'active',
      },
    });

    return NextResponse.json({ department }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create department error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
