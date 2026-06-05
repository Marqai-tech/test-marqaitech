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
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        include: { company: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.branch.count({ where }),
    ]);

    return NextResponse.json(
      { branches, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get branches error:', error);
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
    const {
      name, code, companyId, country, state, city, address,
      zipCode, phone, email, latitude, longitude, timezone,
      branchManager, holidayCalendar, attendancePolicy, status,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code: code || null,
        companyId,
        country: country || null,
        state: state || null,
        city: city || null,
        address: address || null,
        zipCode: zipCode || null,
        phone: phone || null,
        email: email || null,
        latitude: latitude || null,
        longitude: longitude || null,
        timezone: timezone || 'UTC',
        branchManager: branchManager || null,
        holidayCalendar: holidayCalendar || null,
        attendancePolicy: attendancePolicy || null,
        status: status || 'active',
      },
    });

    return NextResponse.json({ branch }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create branch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
