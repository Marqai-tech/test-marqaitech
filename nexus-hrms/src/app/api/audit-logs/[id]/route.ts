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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const auditLog = await prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!auditLog) {
      return NextResponse.json({ error: 'Audit log not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ auditLog }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get audit log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await prisma.auditLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Audit log not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.userId !== undefined) data.userId = body.userId || null;
    if (body.action !== undefined) data.action = body.action;
    if (body.module !== undefined) data.module = body.module;
    if (body.details !== undefined) data.details = body.details || null;
    if (body.ip !== undefined) data.ip = body.ip || null;
    if (body.userAgent !== undefined) data.userAgent = body.userAgent || null;

    const auditLog = await prisma.auditLog.update({ where: { id }, data });
    return NextResponse.json({ auditLog }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update audit log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await prisma.auditLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Audit log not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.auditLog.delete({ where: { id } });
    return NextResponse.json({ message: 'Audit log deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete audit log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
