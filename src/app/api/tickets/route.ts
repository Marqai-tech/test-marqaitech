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

async function generateTicketId(): Promise<string> {
  const lastTicket = await prisma.ticket.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { ticketId: true },
  });

  let nextNum = 1;
  if (lastTicket && lastTicket.ticketId) {
    const match = lastTicket.ticketId.match(/TK-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }

  return `TK-${nextNum.toString().padStart(4, '0')}`;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const categoryId = searchParams.get('categoryId');
    const requesterId = searchParams.get('requesterId');
    const assignedAgentId = searchParams.get('assignedAgentId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (requesterId) where.requesterId = requesterId;
    if (assignedAgentId) where.assignedAgentId = assignedAgentId;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, type: true, slaHours: true } },
          comments: { take: 3, orderBy: { createdAt: 'desc' } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return NextResponse.json(
      { tickets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get tickets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const body = await request.json();
    const {
      categoryId, requesterType, requesterId, requesterName,
      subject, description, priority, assignedAgentId, assignedAgentName,
      slaDeadline, attachments, tags,
    } = body;

    if (!subject || !description || !requesterId || !requesterName) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, description, requesterId, requesterName' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const ticketId = await generateTicketId();

    // Calculate SLA deadline from category if not provided
    let slaDeadlineDate: Date | null = null;
    if (slaDeadline) {
      slaDeadlineDate = new Date(slaDeadline);
    } else if (categoryId) {
      const category = await prisma.ticketCategory.findUnique({ where: { id: categoryId } });
      if (category) {
        slaDeadlineDate = new Date(Date.now() + category.slaHours * 60 * 60 * 1000);
      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketId,
        categoryId,
        requesterType: requesterType || 'employee',
        requesterId,
        requesterName,
        subject,
        description,
        priority: priority || 'medium',
        status: 'open',
        assignedAgentId,
        assignedAgentName,
        slaDeadline: slaDeadlineDate,
        attachments,
        tags,
      },
      include: {
        category: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_TICKET',
        module: 'tickets',
        details: `Created ticket ${ticketId}: ${subject}`,
      },
    });

    // Notify assigned agent if any
    if (assignedAgentId) {
      await createNotification({
        tenantId: decoded.tenantId as string,
        userId: assignedAgentId,
        title: 'New Ticket Assigned',
        message: `Ticket ${ticketId} has been assigned to you: ${subject}`,
        type: 'info',
        category: 'alert',
        link: `/tickets/${ticket.id}`,
      });
    }

    return NextResponse.json({ ticket }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create ticket error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
