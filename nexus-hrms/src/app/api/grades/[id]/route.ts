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

    const grade = await prisma.grade.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!grade) {
      return NextResponse.json({ error: 'Grade not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ grade }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get grade error:', error);
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
    if (body.level !== undefined) data.level = body.level;
    if (body.minSalary !== undefined) data.minSalary = body.minSalary || null;
    if (body.maxSalary !== undefined) data.maxSalary = body.maxSalary || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.status !== undefined) data.status = body.status;

    const grade = await prisma.grade.update({ where: { id }, data });
    return NextResponse.json({ grade }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update grade error:', error);
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

    await prisma.grade.delete({ where: { id } });
    return NextResponse.json({ message: 'Grade deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete grade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
