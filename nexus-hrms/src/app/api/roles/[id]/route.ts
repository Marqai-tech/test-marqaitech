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
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
        userRoles: true,
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ role }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get role error:', error);
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

    const existingRole = await prisma.role.findUnique({ where: { id } });
    if (!existingRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404, headers: corsHeaders() });
    }

    const { name, key, description, type, isSystem, status } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (key !== undefined) updateData.key = key;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (isSystem !== undefined) updateData.isSystem = isSystem;
    if (status !== undefined) updateData.status = status;

    const role = await prisma.role.update({
      where: { id },
      data: updateData,
      include: { rolePermissions: { include: { permission: true } }, userRoles: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_ROLE',
        module: 'rbac',
        details: `Updated role ${role.name} (${role.key})`,
      },
    });

    return NextResponse.json({ role }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update role error:', error);
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
    const existingRole = await prisma.role.findUnique({ where: { id } });
    if (!existingRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404, headers: corsHeaders() });
    }

    if (existingRole.isSystem) {
      return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 403, headers: corsHeaders() });
    }

    await prisma.role.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_ROLE',
        module: 'rbac',
        details: `Deleted role ${existingRole.name} (${existingRole.key})`,
      },
    });

    return NextResponse.json({ message: 'Role deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
