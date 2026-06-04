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

    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer error:', error);
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
    const { status, responseNotes } = body;

    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    const validStatuses = ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'withdrawn'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400, headers: corsHeaders() }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (responseNotes) updateData.responseNotes = responseNotes;

    // Handle status-specific timestamps
    if (status === 'pending_approval') {
      // Offer submitted for approval
    }
    if (status === 'approved') {
      updateData.approvedBy = decoded.userId as string;
      updateData.approvedAt = new Date();
    }
    if (status === 'sent') {
      updateData.sentAt = new Date();
    }
    if (status === 'accepted' || status === 'rejected') {
      updateData.respondedAt = new Date();
    }

    const offer = await prisma.offer.update({
      where: { id },
      data: updateData,
    });

    // Notify relevant users on status changes
    if (status && status !== existing.status) {
      const notificationMap: Record<string, { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }> = {
        pending_approval: {
          title: 'Offer Pending Approval',
          message: `Offer for ${existing.candidateName} is pending your approval.`,
          type: 'info',
        },
        approved: {
          title: 'Offer Approved',
          message: `Offer for ${existing.candidateName} has been approved.`,
          type: 'success',
        },
        sent: {
          title: 'Offer Sent',
          message: `Offer for ${existing.candidateName} has been sent.`,
          type: 'success',
        },
        accepted: {
          title: 'Offer Accepted',
          message: `${existing.candidateName} has accepted the offer for ${existing.position}.`,
          type: 'success',
        },
        rejected: {
          title: 'Offer Rejected',
          message: `${existing.candidateName} has rejected the offer for ${existing.position}.`,
          type: 'warning',
        },
        withdrawn: {
          title: 'Offer Withdrawn',
          message: `Offer for ${existing.candidateName} has been withdrawn.`,
          type: 'error',
        },
      };

      const notificationInfo = notificationMap[status];
      if (notificationInfo) {
        // Notify the HR admin / approvers
        const hrAdmins = await prisma.user.findMany({
          where: { tenantId: decoded.tenantId as string, role: { in: ['hr_admin', 'tenant_admin'] } },
        });

        for (const admin of hrAdmins) {
          await createNotification({
            tenantId: decoded.tenantId as string,
            userId: admin.id,
            title: notificationInfo.title,
            message: notificationInfo.message,
            type: notificationInfo.type,
            category: 'recruitment',
            link: `/offers/${id}`,
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_OFFER_STATUS',
        module: 'offers',
        details: `Updated offer ${id} status to ${status || existing.status}`,
      },
    });

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
