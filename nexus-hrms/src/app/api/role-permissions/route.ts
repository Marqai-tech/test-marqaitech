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
    const roleId = searchParams.get('roleId');
    const permissionId = searchParams.get('permissionId');

    const where: Record<string, unknown> = {};
    if (roleId) where.roleId = roleId;
    if (permissionId) where.permissionId = permissionId;

    const [items, total] = await Promise.all([
      prisma.rolePermission.findMany({
        where,
        include: { role: true, permission: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.rolePermission.count({ where }),
    ]);

    return NextResponse.json(
      { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get role-permissions error:', error);
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
    const { roleId, permissionId, accessLevel } = body;

    if (!roleId || !permissionId) {
      return NextResponse.json(
        { error: 'Missing required fields: roleId, permissionId' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const existingMapping = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
    if (existingMapping) {
      return NextResponse.json({ error: 'Role-permission mapping already exists' }, { status: 409, headers: corsHeaders() });
    }

    const rolePermission = await prisma.rolePermission.create({
      data: {
        roleId,
        permissionId,
        accessLevel: accessLevel || 'self',
      },
      include: { role: true, permission: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_ROLE_PERMISSION',
        module: 'rbac',
        details: `Assigned permission ${permissionId} to role ${roleId}`,
      },
    });

    return NextResponse.json({ rolePermission }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create role-permission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
