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

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: { company: true, departments: true, employees: true },
    });

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ branch }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get branch error:', error);
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
    if (body.country !== undefined) data.country = body.country || null;
    if (body.state !== undefined) data.state = body.state || null;
    if (body.city !== undefined) data.city = body.city || null;
    if (body.address !== undefined) data.address = body.address || null;
    if (body.zipCode !== undefined) data.zipCode = body.zipCode || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.email !== undefined) data.email = body.email || null;
    if (body.latitude !== undefined) data.latitude = body.latitude || null;
    if (body.longitude !== undefined) data.longitude = body.longitude || null;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.branchManager !== undefined) data.branchManager = body.branchManager || null;
    if (body.holidayCalendar !== undefined) data.holidayCalendar = body.holidayCalendar || null;
    if (body.attendancePolicy !== undefined) data.attendancePolicy = body.attendancePolicy || null;
    if (body.status !== undefined) data.status = body.status;

    const branch = await prisma.branch.update({ where: { id }, data });
    return NextResponse.json({ branch }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update branch error:', error);
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

    await prisma.branch.delete({ where: { id } });
    return NextResponse.json({ message: 'Branch deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete branch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
