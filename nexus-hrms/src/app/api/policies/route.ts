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
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.policy.count({ where }),
    ]);

    return NextResponse.json(
      { policies, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get policies error:', error);
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
    const { title, category, description, content, version, status, effectiveDate, expiryDate } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400, headers: corsHeaders() });
    }

    const policy = await prisma.policy.create({
      data: {
        title,
        category,
        description,
        content: content || null,
        version: version || '1.0',
        status: status || 'active',
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return NextResponse.json({ policy }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create policy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
