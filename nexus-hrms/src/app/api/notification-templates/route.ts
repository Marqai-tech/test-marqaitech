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
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.notificationTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.notificationTemplate.count({ where }),
    ]);

    return NextResponse.json(
      { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get notification-templates error:', error);
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
    const { name, code, type, category, subject, body: templateBody, variables, status } = body;

    if (!name || !code || !category || !templateBody) {
      return NextResponse.json(
        { error: 'Missing required fields: name, code, category, body' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const existingCode = await prisma.notificationTemplate.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: 'Notification template code already exists' }, { status: 409, headers: corsHeaders() });
    }

    const notificationTemplate = await prisma.notificationTemplate.create({
      data: {
        name,
        code,
        type: type || 'email',
        category,
        subject,
        body: templateBody,
        variables,
        status: status || 'active',
      },
    });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'CREATE_NOTIFICATION_TEMPLATE', module: 'master', details: `Created notification template ${name} (${code})` },
    });

    return NextResponse.json({ notificationTemplate }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create notification-template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
