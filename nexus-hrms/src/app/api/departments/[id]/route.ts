import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        branch: true,
        company: true,
        parentDepartment: true,
        childDepartments: true,
        designations: true,
        employees: true,
      },
    });

    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ department }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get department error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.code !== undefined) data.code = body.code || null;
    if (body.companyId !== undefined) data.companyId = body.companyId;
    if (body.branchId !== undefined) data.branchId = body.branchId || null;
    if (body.headId !== undefined) data.headId = body.headId || null;
    if (body.parentDepartmentId !== undefined) data.parentDepartmentId = body.parentDepartmentId || null;
    if (body.costCenterId !== undefined) data.costCenterId = body.costCenterId || null;
    if (body.businessUnitId !== undefined) data.businessUnitId = body.businessUnitId || null;
    if (body.status !== undefined) data.status = body.status;

    const department = await prisma.department.update({ where: { id }, data });
    return NextResponse.json({ department }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update department error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    await prisma.department.delete({ where: { id } });
    return NextResponse.json({ message: 'Department deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete department error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
