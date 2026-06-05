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

    const designation = await prisma.designation.findUnique({
      where: { id },
      include: { company: true, department: true, employees: true },
    });

    if (!designation) {
      return NextResponse.json({ error: 'Designation not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ designation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get designation error:', error);
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
    if (body.title !== undefined) data.title = body.title;
    if (body.code !== undefined) data.code = body.code || null;
    if (body.companyId !== undefined) data.companyId = body.companyId;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.level !== undefined) data.level = body.level;
    if (body.gradeId !== undefined) data.gradeId = body.gradeId || null;
    if (body.minSalary !== undefined) data.minSalary = body.minSalary || null;
    if (body.maxSalary !== undefined) data.maxSalary = body.maxSalary || null;
    if (body.status !== undefined) data.status = body.status;

    const designation = await prisma.designation.update({ where: { id }, data });
    return NextResponse.json({ designation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update designation error:', error);
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

    await prisma.designation.delete({ where: { id } });
    return NextResponse.json({ message: 'Designation deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete designation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
