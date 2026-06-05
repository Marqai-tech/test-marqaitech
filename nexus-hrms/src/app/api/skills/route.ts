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
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.skillMaster.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.skillMaster.count({ where }),
    ]);

    return NextResponse.json(
      { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get skills error:', error);
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
    const { name, category, description, status } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const existingSkill = await prisma.skillMaster.findUnique({ where: { name } });
    if (existingSkill) {
      return NextResponse.json({ error: 'Skill with this name already exists' }, { status: 409, headers: corsHeaders() });
    }

    const skill = await prisma.skillMaster.create({
      data: { name, category, description, status: status || 'active' },
    });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'CREATE_SKILL', module: 'master', details: `Created skill ${name}` },
    });

    return NextResponse.json({ skill }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create skill error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
