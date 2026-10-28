import { lndAuth, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/learning/enrollments — tracking & analytics feed.
 * Scope: admins see all (companyId filter), managers see team, employees see own.
 */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const courseId = searchParams.get('courseId');
    const pathId = searchParams.get('pathId');
    const mine = searchParams.get('mine') === 'true';

    const where: Record<string, unknown> = {};
    if (mine && auth.employeeId) where.employeeId = auth.employeeId;
    else if (!auth.isAdmin) {
      // manager → own + direct reports; employee → own
      if (auth.role === 'manager' && auth.employeeId) {
        const reports = await auth.db.employee.findMany({ where: { reportingManagerId: auth.employeeId }, select: { id: true } });
        where.employeeId = { in: [auth.employeeId, ...reports.map((r: { id: string }) => r.id)] };
      } else if (auth.employeeId) where.employeeId = auth.employeeId;
    }
    if (auth.companyId) where.OR = [{ companyId: auth.companyId }, { companyId: null }];
    if (status && status !== 'all') where.status = status;
    if (courseId) where.courseId = courseId;
    if (pathId) where.pathId = pathId;

    const enrollments = await auth.db.courseEnrollment.findMany({
      where,
      include: {
        course: { select: { id: true, title: true, category: true, mode: true, level: true, passingScore: true, durationHours: true, isCompliance: true, isPromotionGate: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true, department: { select: { name: true } } } },
        certificates: { select: { id: true, certificateNo: true, validUntil: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 400,
    });

    // Aggregate stats for the tracking dashboard
    const byStatus: Record<string, number> = {};
    for (const e of enrollments) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    const overdue = enrollments.filter((e: { dueDate: Date | null; status: string }) =>
      e.dueDate && new Date(e.dueDate) < new Date() && e.status !== 'completed').length;

    return json({
      data: enrollments,
      stats: { total: enrollments.length, byStatus, overdue },
    });
  } catch (error) {
    console.error('[lnd/enrollments] GET error:', error);
    return json({ error: 'Failed to load enrollments' }, 500);
  }
}
