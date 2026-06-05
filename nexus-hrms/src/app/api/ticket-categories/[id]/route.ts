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
    const ticketCategory = await prisma.ticketCategory.findUnique({ where: { id } });
    if (!ticketCategory) {
      return NextResponse.json({ error: 'Ticket category not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ ticketCategory }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get ticket category error:', error);
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
    const existing = await prisma.ticketCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket category not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, code, description, priority, slaHours, status } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (slaHours !== undefined) updateData.slaHours = slaHours;
    if (status !== undefined) updateData.status = status;

    const ticketCategory = await prisma.ticketCategory.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_TICKET_CATEGORY', module: 'master', details: `Updated ticket category ${id}` },
    });

    return NextResponse.json({ ticketCategory }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update ticket category error:', error);
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
    const existing = await prisma.ticketCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Ticket category not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.ticketCategory.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_TICKET_CATEGORY', module: 'master', details: `Deleted ticket category ${existing.name}` },
    });

    return NextResponse.json({ message: 'Ticket category deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete ticket category error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
