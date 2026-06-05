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
    const userId = searchParams.get('userId');
    const roleId = searchParams.get('roleId');

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (roleId) where.roleId = roleId;

    const [items, total] = await Promise.all([
      prisma.userRole.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } }, role: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userRole.count({ where }),
    ]);

    return NextResponse.json(
      { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get user-roles error:', error);
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
    const { userId, roleId, scopeId } = body;

    if (!userId || !roleId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, roleId' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const existingMapping = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (existingMapping) {
      return NextResponse.json({ error: 'User-role mapping already exists' }, { status: 409, headers: corsHeaders() });
    }

    const userRole = await prisma.userRole.create({
      data: { userId, roleId, scopeId },
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_USER_ROLE',
        module: 'rbac',
        details: `Assigned role ${roleId} to user ${userId}`,
      },
    });

    return NextResponse.json({ userRole }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create user-role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
