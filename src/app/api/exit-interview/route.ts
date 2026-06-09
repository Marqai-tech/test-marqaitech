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
    const separationId = searchParams.get('separationId');

    const where: Record<string, unknown> = {};
    if (separationId) where.separationId = separationId;

    const interviews = await prisma.exitInterview.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ interviews }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get exit interviews error:', error);
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
    const { separationId, employeeId, interviewDate, interviewer, reason, feedback, rating, wouldRehire, suggestions } = body;

    if (!separationId || !employeeId) {
      return NextResponse.json({ error: 'separationId and employeeId are required' }, { status: 400, headers: corsHeaders() });
    }

    const interview = await prisma.exitInterview.create({
      data: {
        separationId,
        employeeId,
        interviewDate: interviewDate ? new Date(interviewDate) : new Date(),
        interviewer: interviewer || null,
        reason: reason || null,
        feedback: feedback || null,
        rating: rating ? parseInt(rating) : null,
        wouldRehire: wouldRehire !== undefined ? Boolean(wouldRehire) : null,
        suggestions: suggestions || null,
        status: 'completed',
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    });

    return NextResponse.json({ interview }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create exit interview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
