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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const leaveType = await prisma.leaveType.findUnique({ where: { id } });
    if (!leaveType) {
      return NextResponse.json({ error: 'Leave type not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ leaveType }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get leave type error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Leave type not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward, status } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (defaultDays !== undefined) updateData.defaultDays = defaultDays;
    if (isPaid !== undefined) updateData.isPaid = isPaid;
    if (carryForward !== undefined) updateData.carryForward = carryForward;
    if (maxCarryForward !== undefined) updateData.maxCarryForward = maxCarryForward;
    if (status !== undefined) updateData.status = status;

    const leaveType = await prisma.leaveType.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_LEAVE_TYPE', module: 'master', details: `Updated leave type ${id}` },
    });

    return NextResponse.json({ leaveType }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update leave type error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Leave type not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.leaveType.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_LEAVE_TYPE', module: 'master', details: `Deleted leave type ${existing.name}` },
    });

    return NextResponse.json({ message: 'Leave type deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete leave type error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
