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

    const [grades, total] = await Promise.all([
      prisma.grade.findMany({
        where,
        include: { company: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.grade.count({ where }),
    ]);

    return NextResponse.json(
      { grades, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get grades error:', error);
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
    const { name, code, companyId, level, minSalary, maxSalary, description, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const grade = await prisma.grade.create({
      data: {
        name,
        code: code || null,
        companyId,
        level: level || 1,
        minSalary: minSalary || null,
        maxSalary: maxSalary || null,
        description: description || null,
        status: status || 'active',
      },
    });

    return NextResponse.json({ grade }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create grade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
