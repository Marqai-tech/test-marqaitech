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

    // If the id looks like a year-country composite key (e.g., "2025-US"), return the calendar group
    if (id.includes('-')) {
      const parts = id.split('-');
      const year = parts[0];
      const country = parts.slice(1).join('-');

      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

      const where: Record<string, unknown> = {
        date: { gte: startOfYear, lte: endOfYear },
      };
      if (country !== 'global') where.country = country;

      const holidays = await prisma.holiday.findMany({
        where,
        orderBy: { date: 'asc' },
      });

      return NextResponse.json(
        { calendar: { id, year, country, holidays, totalHolidays: holidays.length } },
        { headers: corsHeaders() }
      );
    }

    // Otherwise treat as a single holiday ID
    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ holiday }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get holiday calendar error:', error);
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

    // PUT operates on individual holidays by their ID
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.type !== undefined) data.type = body.type;
    if (body.country !== undefined) data.country = body.country;
    if (body.description !== undefined) data.description = body.description;

    const holiday = await prisma.holiday.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_HOLIDAY_CALENDAR', module: 'master', details: `Updated holiday ${id}` },
    });

    return NextResponse.json({ holiday }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update holiday calendar error:', error);
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

    // DELETE operates on individual holidays by their ID
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.holiday.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_HOLIDAY_CALENDAR', module: 'master', details: `Deleted holiday ${existing.name}` },
    });

    return NextResponse.json({ message: 'Holiday deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete holiday calendar error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
