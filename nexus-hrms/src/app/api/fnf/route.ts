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

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [settlements, total] = await Promise.all([
      prisma.fNFSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fNFSettlement.count({ where }),
    ]);

    return NextResponse.json({ settlements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get FNF settlements error:', error);
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
    const { employeeId, basicSalary, pendingSalary, leaveEncashment, gratuity, bonus, deductions, status, paymentDate, notes } = body;

    const bs = parseFloat(basicSalary) || 0;
    const ps = parseFloat(pendingSalary) || 0;
    const le = parseFloat(leaveEncashment) || 0;
    const gr = parseFloat(gratuity) || 0;
    const bn = parseFloat(bonus) || 0;
    const ded = parseFloat(deductions) || 0;
    const totalAmount = bs + ps + le + gr + bn - ded;

    const settlement = await prisma.fNFSettlement.create({
      data: {
        employeeId: employeeId || null,
        basicSalary: bs,
        pendingSalary: ps,
        leaveEncashment: le,
        gratuity: gr,
        bonus: bn,
        deductions: ded,
        totalAmount,
        status: status || 'pending',
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ settlement }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create FNF settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
