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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.employeeId) data.employeeId = body.employeeId;
    if (body.date) data.date = new Date(body.date);
    if (body.project !== undefined) data.project = body.project;
    if (body.task !== undefined) data.task = body.task;
    if (body.hours !== undefined) data.hours = parseFloat(body.hours);
    if (body.description !== undefined) data.description = body.description;
    if (body.status) data.status = body.status;

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data,
      include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ timesheet }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update timesheet error:', error);
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
    if (body.status) {
      data.status = body.status;
      if (body.status === 'approved') data.approvedBy = decoded.userId as string;
      if (body.status === 'approved') data.approvedAt = new Date();
    }

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data,
      include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ timesheet }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update timesheet error:', error);
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

    await prisma.timesheet.delete({ where: { id } });

    return NextResponse.json({ message: 'Timesheet deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete timesheet error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
