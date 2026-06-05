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

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const country = searchParams.get('country');
    const year = searchParams.get('year');

    const where: Record<string, unknown> = {};
    if (country) where.country = country;
    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      where.date = { gte: startOfYear, lte: endOfYear };
    }

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // Group holidays by year and country to form "calendars"
    const grouped = holidays.reduce((acc, holiday) => {
      const holidayYear = new Date(holiday.date).getFullYear().toString();
      const holidayCountry = holiday.country || 'global';
      const key = `${holidayYear}-${holidayCountry}`;

      if (!acc[key]) {
        acc[key] = {
          id: key,
          year: holidayYear,
          country: holidayCountry,
          holidays: [],
          totalHolidays: 0,
        };
      }
      acc[key].holidays.push(holiday);
      acc[key].totalHolidays++;
      return acc;
    }, {} as Record<string, { id: string; year: string; country: string; holidays: typeof holidays; totalHolidays: number }>);

    const calendars = Object.values(grouped);
    const total = calendars.length;
    const paginatedCalendars = calendars.slice((page - 1) * limit, page * limit);

    return NextResponse.json(
      { calendars: paginatedCalendars, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get holiday calendars error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();

    // Support creating a single holiday or a batch of holidays for a calendar
    if (body.holidays && Array.isArray(body.holidays)) {
      // Batch create: body.holidays is an array of holiday objects
      const results = [];
      for (const h of body.holidays) {
        if (!h.name || !h.date) continue;
        const holiday = await prisma.holiday.create({
          data: {
            name: h.name,
            date: new Date(h.date),
            type: h.type || 'public',
            country: h.country || body.country || null,
            description: h.description || null,
          },
        });
        results.push(holiday);
      }

      await prisma.auditLog.create({
        data: { userId: decoded.userId as string, action: 'CREATE_HOLIDAY_CALENDAR', module: 'master', details: `Created holiday calendar with ${results.length} holidays` },
      });

      return NextResponse.json({ holidays: results }, { status: 201, headers: corsHeaders() });
    }

    // Single holiday create
    const { name, date, type, country, description } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: name, date' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const holiday = await prisma.holiday.create({
      data: {
        name,
        date: new Date(date),
        type: type || 'public',
        country,
        description,
      },
    });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'CREATE_HOLIDAY_CALENDAR', module: 'master', details: `Created holiday ${name}` },
    });

    return NextResponse.json({ holiday }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create holiday calendar error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
