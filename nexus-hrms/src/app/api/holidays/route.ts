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
    const country = searchParams.get('country');
    const type = searchParams.get('type');
    const year = searchParams.get('year');

    const where: Record<string, unknown> = {};
    if (country) where.country = country;
    if (type) where.type = type;
    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      where.date = { gte: startOfYear, lte: endOfYear };
    }

    const [items, total] = await Promise.all([
      prisma.holiday.findMany({ where, orderBy: { date: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.holiday.count({ where }),
    ]);

    return NextResponse.json(
      { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get holidays error:', error);
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
      data: { userId: decoded.userId as string, action: 'CREATE_HOLIDAY', module: 'master', details: `Created holiday ${name}` },
    });

    return NextResponse.json({ holiday }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create holiday error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
