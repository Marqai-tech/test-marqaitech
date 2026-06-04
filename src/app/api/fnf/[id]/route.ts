import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

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

    const fnfCalculation = await prisma.fNFCalculation.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeId: true,
            email: true, department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!fnfCalculation) {
      return NextResponse.json({ error: 'FNF calculation not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ fnfCalculation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get FNF detail error:', error);
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
    const body = await request.json();
    const { status, remarks } = body;

    const existing = await prisma.fNFCalculation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'FNF calculation not found' }, { status: 404, headers: corsHeaders() });
    }

    const validStatuses = ['pending', 'approved', 'paid', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400, headers: corsHeaders() }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (remarks !== undefined) updateData.remarks = remarks;

    if (status === 'approved') {
      updateData.approvedBy = decoded.userId as string;
      updateData.approvedAt = new Date();
    }
    if (status === 'paid') {
      updateData.paidAt = new Date();
      if (!existing.approvedAt) {
        updateData.approvedBy = decoded.userId as string;
        updateData.approvedAt = new Date();
      }
    }

    const fnfCalculation = await prisma.fNFCalculation.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, userId: true },
        },
      },
    });

    // Notify employee on status change
    if (status && status !== existing.status) {
      if (fnfCalculation.employee.userId) {
        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: fnfCalculation.employee.userId,
          title: 'FNF Status Updated',
          message: `Your Full & Final settlement has been ${status}. Net amount: ${fnfCalculation.netAmount} ${fnfCalculation.currency}.`,
          type: status === 'paid' ? 'success' : status === 'approved' ? 'success' : status === 'cancelled' ? 'warning' : 'info',
          category: 'payroll',
          link: `/fnf/${id}`,
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_FNF',
        module: 'fnf',
        details: `Updated FNF ${id} status to ${status || existing.status}`,
      },
    });

    return NextResponse.json({ fnfCalculation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch FNF error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
