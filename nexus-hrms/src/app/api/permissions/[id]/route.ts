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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const permission = await prisma.permission.findUnique({
      where: { id },
      include: { rolePermissions: true },
    });

    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ permission }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get permission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();

    const existingPermission = await prisma.permission.findUnique({ where: { id } });
    if (!existingPermission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404, headers: corsHeaders() });
    }

    const { name, key, module, action, description } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (key !== undefined) updateData.key = key;
    if (module !== undefined) updateData.module = module;
    if (action !== undefined) updateData.action = action;
    if (description !== undefined) updateData.description = description;

    const permission = await prisma.permission.update({
      where: { id },
      data: updateData,
      include: { rolePermissions: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_PERMISSION',
        module: 'rbac',
        details: `Updated permission ${permission.name} (${permission.key})`,
      },
    });

    return NextResponse.json({ permission }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update permission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const existingPermission = await prisma.permission.findUnique({ where: { id } });
    if (!existingPermission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.permission.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_PERMISSION',
        module: 'rbac',
        details: `Deleted permission ${existingPermission.name} (${existingPermission.key})`,
      },
    });

    return NextResponse.json({ message: 'Permission deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete permission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
