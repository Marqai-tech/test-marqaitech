import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}
export async function OPTIONS() { return NextResponse.json({}, { headers: corsHeaders() }); }

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const okrs = await prisma.oKR.findMany({
      include: { owner: { select: { id: true, firstName: true, lastName: true, employeeId: true } }, keyResults: true, childOkrs: { include: { owner: { select: { firstName: true, lastName: true } }, keyResults: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ okrs }, { headers: corsHeaders() });
  } catch (error) {
    console.error('OKRs GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { objective, ownerId, quarter, year, category, parentOkrId, keyResults } = body;
    if (!objective || !ownerId) return NextResponse.json({ error: 'Objective and owner are required' }, { status: 400, headers: corsHeaders() });

    const okr = await prisma.oKR.create({
      data: {
        objective,
        ownerId,
        quarter: quarter || 'Q1 2026',
        year: year || 2026,
        category: category || 'individual',
        parentOkrId: parentOkrId || null,
        keyResults: keyResults ? { create: keyResults.map((kr: { title: string; targetValue?: number }) => ({ title: kr.title, targetValue: kr.targetValue || 100 })) } : undefined,
      },
      include: { keyResults: true, owner: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json({ okr }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('OKRs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
