import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
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
  const db = await getDb(request);
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

    // BUG_027 fix: SECURITY + correctness — restrict performance review
    // visibility by role. Previously the API returned ALL reviews in the
    // tenant DB when no `employeeId` was supplied, which meant an employee
    // with no reviews still saw OTHER employees' reviews (the bug report
    // describes static-looking data like "Probation 3.0/5 - Pending" with
    // goals 84%/99%/49% — that was actually someone else's review).
    //
    //   - super_admin / tenant_admin / admin / hr_manager / manager: may
    //     view any employee's reviews. If `employeeId` query param is
    //     supplied we filter by it; otherwise we return all (admin-level).
    //   - employee / finance / it_admin / any other self-service role: may
    //     ONLY view their own reviews. We resolve their employeeId from the
    //     JWT's userId and force the where clause.
    const role = (decoded.role as string) || '';
    const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_manager', 'manager'];
    const isAdmin = ADMIN_ROLES.includes(role.toLowerCase());

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    if (isAdmin) {
      if (employeeId) where.employeeId = employeeId;
    } else {
      const userId = decoded.userId as string;
      const me = await db.employee.findUnique({
        where: { userId },
        select: { id: true },
      }).catch(() => null);
      if (!me) {
        return NextResponse.json({
          reviews: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        }, { headers: corsHeaders() });
      }
      where.employeeId = me.id;
    }

    const [reviews, total] = await Promise.all([
      db.performanceReview.findMany({
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
      db.performanceReview.count({ where }),
    ]);

    // Fetch reviewer info for reviews that have a reviewerId
    const reviewerIds = reviews.map(r => r.reviewerId).filter(Boolean) as string[];
    const reviewers = reviewerIds.length > 0
      ? await db.employee.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      : [];
    const reviewerMap = new Map(reviewers.map(r => [r.id, r]));

    const reviewsWithReviewer = reviews.map(r => ({
      ...r,
      reviewer: r.reviewerId ? reviewerMap.get(r.reviewerId) || null : null,
    }));

    return NextResponse.json(
      {
        reviews: reviewsWithReviewer,
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
  const db = await getDb(request);
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

    const review = await db.performanceReview.create({
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
          select: { firstName: true, lastName: true, employeeId: true, userId: true, tenantId: true },
        },
      },
    });

    // ─── Notification Center (Task 36): review shared → sign-off request ───
    try {
      if ((status === 'completed' || status === 'reviewed') && review.employee.userId && review.employee.tenantId) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        await dispatchNotification({
          tenantId: review.employee.tenantId,
          module: 'performance',
          eventKey: 'performance.review.signoff',
          recipients: [{ userId: review.employee.userId, name: `${review.employee.firstName || ''} ${review.employee.lastName || ''}`.trim() }],
          vars: {
            Cycle_Name: reviewCycle || reviewPeriod || 'Performance review',
            Manager_Name: '',
          },
          entity: { type: 'performance_review', id: review.id, link: '/performance' },
          origin: request.headers.get('origin') || undefined,
        });
      }
    } catch { /* non-fatal */ }

    await db.auditLog.create({
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
