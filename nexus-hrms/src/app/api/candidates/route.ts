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
    const source = searchParams.get('source');
    const jobPostingId = searchParams.get('jobPostingId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (jobPostingId) where.jobPostingId = jobPostingId;

    const [candidates, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: {
          jobPosting: {
            select: { id: true, title: true, department: { select: { id: true, name: true } } },
          },
          interviews: {
            select: { id: true, round: true, type: true, status: true, score: true, date: true },
            orderBy: { round: 'asc' },
          },
          offers: {
            select: { id: true, offerNumber: true, status: true, approvalStatus: true, candidateResponse: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { appliedDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return NextResponse.json({ candidates, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get candidates error:', error);
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

    if (!body.jobPostingId || !body.candidateName || !body.candidateEmail) {
      return NextResponse.json({ error: 'Missing required fields: jobPostingId, candidateName, candidateEmail' }, { status: 400, headers: corsHeaders() });
    }

    // Verify job posting exists
    const jobExists = await prisma.jobPosting.findUnique({ where: { id: body.jobPostingId } });
    if (!jobExists) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404, headers: corsHeaders() });
    }

    const candidate = await prisma.jobApplication.create({
      data: {
        jobPostingId: body.jobPostingId,
        candidateId: body.candidateId || null,
        candidateName: body.candidateName,
        candidateEmail: body.candidateEmail,
        candidatePhone: body.candidatePhone || null,
        resume: body.resume || null,
        coverLetter: body.coverLetter || null,
        source: body.source || 'website',
        vendorId: body.vendorId || null,
        subVendorId: body.subVendorId || null,
        skills: body.skills || null,
        experience: body.experience || null,
        currentCtc: body.currentCtc || null,
        expectedCtc: body.expectedCtc || null,
        noticePeriod: body.noticePeriod || null,
        currentLocation: body.currentLocation || null,
        aiResumeScore: body.aiResumeScore ? parseFloat(body.aiResumeScore) : null,
        aiInterviewScore: body.aiInterviewScore ? parseFloat(body.aiInterviewScore) : null,
        aiScreeningResult: body.aiScreeningResult || null,
        status: body.status || 'applied',
        rating: body.rating ? parseInt(body.rating) : null,
        notes: body.notes || null,
        expectedSalary: body.expectedSalary || null,
        recruiterStatus: body.recruiterStatus || 'new',
        clientStatus: body.clientStatus || null,
        offerStatus: body.offerStatus || null,
      },
      include: {
        jobPosting: { select: { id: true, title: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_CANDIDATE',
        module: 'recruitment',
        details: `Added candidate ${body.candidateName} for job: ${jobExists.title}`,
      },
    });

    return NextResponse.json({ candidate }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create candidate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
