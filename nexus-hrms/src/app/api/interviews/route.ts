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
    const type = searchParams.get('type');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.date = dateFilter;
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        include: {
          jobApplication: {
            select: {
              id: true,
              candidateName: true,
              candidateEmail: true,
              jobPosting: { select: { id: true, title: true, department: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.interview.count({ where }),
    ]);

    return NextResponse.json({ interviews, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get interviews error:', error);
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

    if (!body.jobApplicationId || !body.date) {
      return NextResponse.json({ error: 'Missing required fields: jobApplicationId, date' }, { status: 400, headers: corsHeaders() });
    }

    // Verify job application exists
    const application = await prisma.jobApplication.findUnique({
      where: { id: body.jobApplicationId },
      include: { jobPosting: { select: { title: true } } },
    });
    if (!application) {
      return NextResponse.json({ error: 'Job application not found' }, { status: 404, headers: corsHeaders() });
    }

    const interview = await prisma.interview.create({
      data: {
        jobApplicationId: body.jobApplicationId,
        round: parseInt(body.round) || 1,
        type: body.type || 'technical',
        title: body.title || null,
        date: new Date(body.date),
        time: body.time || null,
        duration: body.duration ? parseInt(body.duration) : null,
        location: body.location || null,
        meetingUrl: body.meetingUrl || null,
        interviewerIds: body.interviewerIds || null,
        interviewerNames: body.interviewerNames || null,
        status: 'scheduled',
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
      data: {
        status: 'interview',
        interviewDate: new Date(body.date),
        recruiterStatus: 'interview_scheduled',
      },
    });

    await createNotification({
      tenantId: decoded.tenantId as string,
      userId: decoded.userId as string,
      title: 'Interview Scheduled',
      message: `Interview scheduled for ${application.candidateName} - Round ${interview.round} (${interview.type})`,
      type: 'info',
      category: 'recruitment',
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'SCHEDULE_INTERVIEW',
        module: 'recruitment',
        details: `Scheduled interview for ${application.candidateName}, Round ${interview.round}`,
      },
    });

    return NextResponse.json({ interview }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create interview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
