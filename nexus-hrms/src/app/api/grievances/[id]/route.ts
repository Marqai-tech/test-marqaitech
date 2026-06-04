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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.assignedTo) data.assignedTo = body.assignedTo;
    if (body.resolution) { data.resolution = body.resolution; data.resolvedDate = new Date(); }

    const grievance = await prisma.grievance.update({
      where: { id },
      data,
      include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ grievance }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update grievance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
