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
    const config = await prisma.aIConfig.findUnique({ where: { id } });

    if (!config) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ config }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get ai-admin by id error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
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
    const { name, type, category, content, model, temperature, maxTokens, isActive, version, description } = body;

    const existing = await prisma.aIConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (category !== undefined) updateData.category = category;
    if (content !== undefined) updateData.content = content;
    if (model !== undefined) updateData.model = model;
    if (temperature !== undefined) updateData.temperature = parseFloat(temperature);
    if (maxTokens !== undefined) updateData.maxTokens = parseInt(maxTokens);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (version !== undefined) updateData.version = version;
    if (description !== undefined) updateData.description = description;

    const config = await prisma.aIConfig.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_AI_CONFIG',
        module: 'ai-admin',
        details: `Updated AI config: ${config.name} (${config.type}/${config.category})`,
      },
    });

    return NextResponse.json({ config }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update ai-admin error:', error);
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
    const existing = await prisma.aIConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.aIConfig.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_AI_CONFIG',
        module: 'ai-admin',
        details: `Deleted AI config: ${existing.name} (${existing.type}/${existing.category})`,
      },
    });

    return NextResponse.json({ message: 'AI config deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete ai-admin error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
