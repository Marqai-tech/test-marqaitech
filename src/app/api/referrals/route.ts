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

    const referrals = await prisma.referral.findMany({
      include: {
        jobPosting: { select: { id: true, title: true } },
        referrerEmployee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ referrals }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Referrals GET error:', error);
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
    const { jobPostingId, referrerEmployeeId, candidateName, candidateEmail, candidatePhone, candidateResume, notes, bonusAmount } = body;
    if (!jobPostingId || !referrerEmployeeId || !candidateName || !candidateEmail) return NextResponse.json({ error: 'Required fields missing' }, { status: 400, headers: corsHeaders() });

    const referral = await prisma.referral.create({
      data: { jobPostingId, referrerEmployeeId, candidateName, candidateEmail, candidatePhone, candidateResume, notes, bonusAmount },
      include: { jobPosting: { select: { title: true } }, referrerEmployee: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json({ referral }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Referrals POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
