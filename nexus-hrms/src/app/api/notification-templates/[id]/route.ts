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
    const notificationTemplate = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!notificationTemplate) {
      return NextResponse.json({ error: 'Notification template not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ notificationTemplate }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get notification template error:', error);
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
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification template not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, code, type, category, subject, body: templateBody, variables, status } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (type !== undefined) updateData.type = type;
    if (category !== undefined) updateData.category = category;
    if (subject !== undefined) updateData.subject = subject;
    if (templateBody !== undefined) updateData.body = templateBody;
    if (variables !== undefined) updateData.variables = variables;
    if (status !== undefined) updateData.status = status;

    const notificationTemplate = await prisma.notificationTemplate.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_NOTIFICATION_TEMPLATE', module: 'master', details: `Updated notification template ${id}` },
    });

    return NextResponse.json({ notificationTemplate }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update notification template error:', error);
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
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification template not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.notificationTemplate.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_NOTIFICATION_TEMPLATE', module: 'master', details: `Deleted notification template ${existing.name}` },
    });

    return NextResponse.json({ message: 'Notification template deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete notification template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
