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
    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ holiday }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get holiday error:', error);
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
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, date, type, country, description } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (date !== undefined) updateData.date = new Date(date);
    if (type !== undefined) updateData.type = type;
    if (country !== undefined) updateData.country = country;
    if (description !== undefined) updateData.description = description;

    const holiday = await prisma.holiday.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_HOLIDAY', module: 'master', details: `Updated holiday ${id}` },
    });

    return NextResponse.json({ holiday }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update holiday error:', error);
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
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.holiday.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_HOLIDAY', module: 'master', details: `Deleted holiday ${existing.name}` },
    });

    return NextResponse.json({ message: 'Holiday deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete holiday error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
