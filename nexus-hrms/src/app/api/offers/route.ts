import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

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
    const approvalStatus = searchParams.get('approvalStatus');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          jobApplication: {
            select: {
              id: true,
              candidateName: true,
              candidateEmail: true,
              candidatePhone: true,
              jobPosting: { select: { id: true, title: true, department: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.offer.count({ where }),
    ]);

    return NextResponse.json({ offers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offers error:', error);
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

    if (!body.jobApplicationId || !body.candidateName || !body.candidateEmail) {
      return NextResponse.json({ error: 'Missing required fields: jobApplicationId, candidateName, candidateEmail' }, { status: 400, headers: corsHeaders() });
    }

    // Verify job application exists
    const application = await prisma.jobApplication.findUnique({
      where: { id: body.jobApplicationId },
      include: { jobPosting: { select: { title: true } } },
    });
    if (!application) {
      return NextResponse.json({ error: 'Job application not found' }, { status: 404, headers: corsHeaders() });
    }

    // Auto-generate offerNumber: OFR-YYYY-NNNN
    const year = new Date().getFullYear();
    const lastOffer = await prisma.offer.findFirst({
      where: { offerNumber: { startsWith: `OFR-${year}-` } },
      orderBy: { offerNumber: 'desc' },
    });
    const nextNum = lastOffer ? parseInt(lastOffer.offerNumber.split('-')[2]) + 1 : 1;
    const offerNumber = `OFR-${year}-${String(nextNum).padStart(4, '0')}`;

    const offer = await prisma.offer.create({
      data: {
        offerNumber,
        jobApplicationId: body.jobApplicationId,
        candidateName: body.candidateName,
        candidateEmail: body.candidateEmail,
        jobTitle: body.jobTitle || application.jobPosting?.title || null,
        departmentId: body.departmentId || null,
        offeredSalary: body.offeredSalary ? parseFloat(body.offeredSalary) : null,
        currency: body.currency || 'USD',
        salaryBreakup: body.salaryBreakup || null,
        joiningBonus: body.joiningBonus ? parseFloat(body.joiningBonus) : null,
        retentionBonus: body.retentionBonus ? parseFloat(body.retentionBonus) : null,
        variablePay: body.variablePay ? parseFloat(body.variablePay) : null,
        offerDate: body.offerDate ? new Date(body.offerDate) : new Date(),
        joiningDate: body.joiningDate ? new Date(body.joiningDate) : null,
        offerExpiryDate: body.offerExpiryDate ? new Date(body.offerExpiryDate) : null,
        approvalStatus: body.approvalStatus || 'draft',
        candidateResponse: body.candidateResponse || null,
        responseDate: body.responseDate ? new Date(body.responseDate) : null,
        negotiationNotes: body.negotiationNotes || null,
        status: body.status || 'draft',
        notes: body.notes || null,
      },
      include: {
        jobApplication: {
          select: { candidateName: true, candidateEmail: true, jobPosting: { select: { title: true } } },
        },
      },
    });

    // Update job application status
    await prisma.jobApplication.update({
      where: { id: body.jobApplicationId },
      data: { offerStatus: 'draft', status: 'offered' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_OFFER',
        module: 'recruitment',
        details: `Created offer ${offerNumber} for ${body.candidateName}`,
      },
    });

    return NextResponse.json({ offer }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
