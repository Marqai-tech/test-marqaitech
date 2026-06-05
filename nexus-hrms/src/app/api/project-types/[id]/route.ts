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
    const projectType = await prisma.projectType.findUnique({ where: { id } });
    if (!projectType) {
      return NextResponse.json({ error: 'Project type not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ projectType }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get project type error:', error);
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
    const existing = await prisma.projectType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project type not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, code, description, status } = body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const projectType = await prisma.projectType.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_PROJECT_TYPE', module: 'master', details: `Updated project type ${id}` },
    });

    return NextResponse.json({ projectType }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update project type error:', error);
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
    const existing = await prisma.projectType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project type not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.projectType.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_PROJECT_TYPE', module: 'master', details: `Deleted project type ${existing.name}` },
    });

    return NextResponse.json({ message: 'Project type deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete project type error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
