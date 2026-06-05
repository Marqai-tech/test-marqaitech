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

    const existing = await prisma.userRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User-role mapping not found' }, { status: 404, headers: corsHeaders() });
    }

    const { userId, roleId, scopeId } = body;
    const updateData: Record<string, unknown> = {};
    if (userId !== undefined) updateData.userId = userId;
    if (roleId !== undefined) updateData.roleId = roleId;
    if (scopeId !== undefined) updateData.scopeId = scopeId;

    const userRole = await prisma.userRole.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_USER_ROLE',
        module: 'rbac',
        details: `Updated user-role mapping ${id}`,
      },
    });

    return NextResponse.json({ userRole }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update user-role error:', error);
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
    const existing = await prisma.userRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User-role mapping not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.userRole.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_USER_ROLE',
        module: 'rbac',
        details: `Deleted user-role mapping ${id}`,
      },
    });

    return NextResponse.json({ message: 'User-role mapping deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete user-role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
