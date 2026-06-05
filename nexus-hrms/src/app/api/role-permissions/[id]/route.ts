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

    const existing = await prisma.rolePermission.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role-permission mapping not found' }, { status: 404, headers: corsHeaders() });
    }

    const { roleId, permissionId, accessLevel } = body;
    const updateData: Record<string, unknown> = {};
    if (roleId !== undefined) updateData.roleId = roleId;
    if (permissionId !== undefined) updateData.permissionId = permissionId;
    if (accessLevel !== undefined) updateData.accessLevel = accessLevel;

    const rolePermission = await prisma.rolePermission.update({
      where: { id },
      data: updateData,
      include: { role: true, permission: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_ROLE_PERMISSION',
        module: 'rbac',
        details: `Updated role-permission mapping ${id}`,
      },
    });

    return NextResponse.json({ rolePermission }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update role-permission error:', error);
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
    const existing = await prisma.rolePermission.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role-permission mapping not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.rolePermission.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_ROLE_PERMISSION',
        module: 'rbac',
        details: `Deleted role-permission mapping ${id}`,
      },
    });

    return NextResponse.json({ message: 'Role-permission mapping deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete role-permission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
