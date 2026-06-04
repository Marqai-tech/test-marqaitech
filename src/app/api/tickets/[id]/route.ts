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

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        category: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ ticket }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get ticket error:', error);
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
    const { status, assignedAgentId, assignedAgentName, resolutionNotes } = body;

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (assignedAgentId !== undefined) updateData.assignedAgentId = assignedAgentId;
    if (assignedAgentName !== undefined) updateData.assignedAgentName = assignedAgentName;
    if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;

    // Handle status-specific timestamps
    if (status === 'resolved') {
      updateData.resolvedAt = new Date();
      if (!resolutionNotes) updateData.resolutionNotes = resolutionNotes;
    }
    if (status === 'closed') {
      updateData.closedAt = new Date();
      if (!existing.resolvedAt) updateData.resolvedAt = new Date();
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    // Notify requester on status change
    if (status && status !== existing.status) {
      const requesterUser = await prisma.user.findFirst({
        where: {
          employee: { id: existing.requesterId },
        },
      });

      if (requesterUser) {
        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: requesterUser.id,
          title: 'Ticket Status Updated',
          message: `Ticket ${existing.ticketId} status changed to ${status}.`,
          type: status === 'resolved' || status === 'closed' ? 'success' : 'info',
          category: 'alert',
          link: `/tickets/${id}`,
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_TICKET',
        module: 'tickets',
        details: `Updated ticket ${existing.ticketId}: ${JSON.stringify(updateData)}`,
      },
    });

    return NextResponse.json({ ticket }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch ticket error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
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

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    const fields = ['subject', 'description', 'priority', 'categoryId', 'attachments', 'tags'];
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_TICKET',
        module: 'tickets',
        details: `Updated ticket ${existing.ticketId}`,
      },
    });

    return NextResponse.json({ ticket }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update ticket error:', error);
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

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: corsHeaders() });
    }

    // Delete comments first, then the ticket
    await prisma.ticketComment.deleteMany({ where: { ticketId: id } });
    await prisma.ticket.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_TICKET',
        module: 'tickets',
        details: `Deleted ticket ${existing.ticketId}`,
      },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete ticket error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
