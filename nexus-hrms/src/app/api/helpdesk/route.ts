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
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const [tickets, total] = await Promise.all([
      prisma.helpDeskTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.helpDeskTicket.count({ where }),
    ]);

    return NextResponse.json({ tickets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get helpdesk tickets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { subject, category, priority, description, status, raisedById, assignedToId, resolution } = body;

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400, headers: corsHeaders() });
    }

    const ticket = await prisma.helpDeskTicket.create({
      data: {
        subject,
        category: category || 'other',
        priority: priority || 'medium',
        description: description || null,
        status: status || 'open',
        raisedById: raisedById || null,
        assignedToId: assignedToId || null,
        resolution: resolution || null,
      },
    });

    return NextResponse.json({ ticket }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create helpdesk ticket error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
