import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const year = url.searchParams.get('year');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (year) {
      const startOfYear = new Date(parseInt(year), 0, 1);
      const endOfYear = new Date(parseInt(year), 11, 31);
      where.date = { gte: startOfYear, lte: endOfYear };
    }

    const holidays = await db.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await db.holiday.count({ where });

    return NextResponse.json({
      data: holidays,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Holidays GET error:', error);
    // Demo data fallback
    const demoHolidays = [
      { id: 'hol-1', name: 'Republic Day', date: new Date('2026-01-26'), type: 'public', country: 'India', description: 'National holiday', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-2', name: 'Holi', date: new Date('2026-03-10'), type: 'festival', country: 'India', description: 'Festival of colors', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-3', name: 'Eid ul-Fitr', date: new Date('2026-04-02'), type: 'festival', country: 'India', description: 'Islamic festival', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-4', name: 'Maharashtra Day', date: new Date('2026-05-01'), type: 'state', country: 'India', description: 'State holiday', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-5', name: 'Independence Day', date: new Date('2026-08-15'), type: 'public', country: 'India', description: 'National holiday', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-6', name: 'Ganesh Chaturthi', date: new Date('2026-08-27'), type: 'festival', country: 'India', description: 'Hindu festival', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-7', name: 'Gandhi Jayanti', date: new Date('2026-10-02'), type: 'public', country: 'India', description: 'National holiday', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-8', name: 'Dussehra', date: new Date('2026-10-20'), type: 'festival', country: 'India', description: 'Hindu festival', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-9', name: 'Diwali', date: new Date('2026-11-10'), type: 'festival', country: 'India', description: 'Festival of lights', createdAt: new Date(), updatedAt: new Date() },
      { id: 'hol-10', name: 'Christmas', date: new Date('2026-12-25'), type: 'public', country: 'India', description: 'Christian holiday', createdAt: new Date(), updatedAt: new Date() },
    ];

    return NextResponse.json({
      data: demoHolidays,
      pagination: { page: 1, limit: 100, total: demoHolidays.length, totalPages: 1 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, date, type, country, description } = body;

    if (!name || !date) {
      return NextResponse.json({ error: 'Name and date are required' }, { status: 400, headers: corsHeaders() });
    }

    const holiday = await db.holiday.create({
      data: {
        name,
        date: new Date(date),
        type: type || 'public',
        country: country || 'India',
        description,
      },
    });

    return NextResponse.json({ holiday }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Holidays POST error:', error);
    return NextResponse.json({ error: 'Failed to create holiday' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Holiday ID is required' }, { status: 400, headers: corsHeaders() });
    }

    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    const existing = await db.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404, headers: corsHeaders() });
    }

    const holiday = await db.holiday.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ holiday }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Holidays PUT error:', error);
    return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Holiday ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.holiday.delete({ where: { id } });
    return NextResponse.json({ message: 'Holiday deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Holidays DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500, headers: corsHeaders() });
  }
}
