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
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const [jobPostings, total] = await Promise.all([
      prisma.jobPosting.findMany({
        where,
        include: {
          department: {
            select: { id: true, name: true },
          },
          applications: {
            select: {
              id: true,
              candidateName: true,
              candidateEmail: true,
              candidatePhone: true,
              source: true,
              status: true,
              appliedDate: true,
              rating: true,
              expectedSalary: true,
              notes: true,
              jobPostingId: true,
            },
            orderBy: { appliedDate: 'desc' },
          },
          _count: {
            select: { applications: true },
          },
        },
        orderBy: { postedDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobPosting.count({ where }),
    ]);

    return NextResponse.json(
      {
        jobPostings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get recruitment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await request.json();

    // Handle application submission
    if (body.action === 'apply') {
      const { jobPostingId, candidateName, candidateEmail, candidatePhone, source, expectedSalary } = body;

      if (!jobPostingId || !candidateName || !candidateEmail) {
        return NextResponse.json(
          { error: 'Missing required fields: jobPostingId, candidateName, candidateEmail' },
          { status: 400, headers: corsHeaders() }
        );
      }

      // Verify job posting exists
      const jobExists = await prisma.jobPosting.findUnique({ where: { id: jobPostingId } });
      if (!jobExists) {
        return NextResponse.json(
          { error: 'Job posting not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      const application = await prisma.jobApplication.create({
        data: {
          jobPostingId,
          candidateName,
          candidateEmail,
          candidatePhone,
          source: source || 'website',
          expectedSalary,
          status: 'applied',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'SUBMIT_APPLICATION',
          module: 'recruitment',
          details: `Application submitted by ${candidateName} for job: ${jobExists.title}`,
        },
      });

      return NextResponse.json(
        { application },
        { status: 201, headers: corsHeaders() }
      );
    }

    // Handle job posting creation
    const {
      title,
      departmentId,
      position,
      location,
      type,
      experience,
      salary,
      description,
      requirements,
      closingDate,
      vacancies,
    } = body;

    if (!title || !departmentId || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: title, departmentId, description' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const jobPosting = await prisma.jobPosting.create({
      data: {
        title,
        departmentId,
        position: position || title,
        location,
        type: type || 'full-time',
        experience,
        salary,
        description,
        requirements,
        closingDate: closingDate ? new Date(closingDate) : null,
        vacancies: vacancies || 1,
        status: 'open',
      },
      include: {
        department: {
          select: { name: true },
        },
      },
    });

    // Notify HR admins about the new job posting
    const hrAdmins = await prisma.user.findMany({
      where: {
        tenantId: decoded.tenantId as string,
        role: { in: ['super_admin', 'tenant_admin', 'hr_admin'] },
      },
    });

    for (const admin of hrAdmins) {
      await createNotification({
        tenantId: decoded.tenantId as string,
        userId: admin.id,
        title: 'New Job Posting Created',
        message: `A new job posting "${title}" has been created for ${jobPosting.department.name} department.`,
        type: 'info',
        category: 'recruitment',
        link: `/recruitment/${jobPosting.id}`,
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_JOB_POSTING',
        module: 'recruitment',
        details: `Created job posting: ${title}`,
      },
    });

    return NextResponse.json(
      { jobPosting },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
