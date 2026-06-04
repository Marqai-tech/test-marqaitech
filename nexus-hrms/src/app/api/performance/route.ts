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
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.performanceReview.count({ where }),
    ]);

    return NextResponse.json(
      {
        reviews,
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
    console.error('Get performance reviews error:', error);
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
    const {
      employeeId,
      reviewCycle,
      reviewPeriod,
      reviewerId,
      rating,
      goalsRating,
      skillsRating,
      behaviorRating,
      overallRating,
      comments,
      strengths,
      improvements,
      status,
      reviewDate,
    } = body;

    if (!employeeId || !reviewCycle) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, reviewCycle' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const review = await prisma.performanceReview.create({
      data: {
        employeeId,
        reviewCycle,
        reviewPeriod,
        reviewerId,
        rating: rating || 0,
        goalsRating: goalsRating || 0,
        skillsRating: skillsRating || 0,
        behaviorRating: behaviorRating || 0,
        overallRating: overallRating || 0,
        comments,
        strengths,
        improvements,
        status: status || 'pending',
        reviewDate: reviewDate ? new Date(reviewDate) : null,
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PERFORMANCE_REVIEW',
        module: 'performance',
        details: `Created performance review for ${review.employee.firstName} ${review.employee.lastName} - ${reviewCycle}`,
      },
    });

    return NextResponse.json(
      { review },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create performance review error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
