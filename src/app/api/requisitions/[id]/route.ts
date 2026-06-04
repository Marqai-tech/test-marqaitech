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

    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, title: true, level: true, minSalary: true, maxSalary: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get requisition error:', error);
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
    const { approvalStatus, rejectionReason } = body;

    const existing = await prisma.requisition.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    const validStatuses = ['pending', 'manager_approved', 'hr_approved', 'budget_approved', 'rejected'];
    if (approvalStatus && !validStatuses.includes(approvalStatus)) {
      return NextResponse.json(
        { error: `Invalid approval status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400, headers: corsHeaders() }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (approvalStatus) {
      updateData.approvalStatus = approvalStatus;
      updateData.approvedBy = decoded.userId as string;
      updateData.approvedAt = new Date();

      // Map approval status to requisition status
      if (approvalStatus === 'rejected') {
        updateData.status = 'cancelled';
        updateData.rejectionReason = rejectionReason;
      } else if (approvalStatus === 'budget_approved') {
        updateData.status = 'approved';
      }
    }
    if (rejectionReason) updateData.rejectionReason = rejectionReason;

    const requisition = await prisma.requisition.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    });

    // Notify the hiring manager or requester
    if (existing.hiringManagerId) {
      await createNotification({
        tenantId: decoded.tenantId as string,
        userId: existing.hiringManagerId,
        title: 'Requisition Status Updated',
        message: `Requisition ${existing.requisitionId} has been ${approvalStatus}.`,
        type: approvalStatus === 'rejected' ? 'warning' : 'success',
        category: 'recruitment',
        link: `/requisitions/${id}`,
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_REQUISITION',
        module: 'requisitions',
        details: `Updated requisition ${existing.requisitionId} approval status to ${approvalStatus}`,
      },
    });

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
