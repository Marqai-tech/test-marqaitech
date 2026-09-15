import { lndAuth, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/dashboard — role-aware L&D hub KPIs */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const scopeWhere = auth.companyId ? { OR: [{ companyId: auth.companyId }, { companyId: null }] } : {};
    const [courseCount, pathCount, enrollmentAgg, certCount, reqCount, pendingReqCount, gapCount, signoffCount] = await Promise.all([
      auth.db.course.count({ where: { ...scopeWhere, status: 'published' } }),
      auth.db.learningPath.count({ where: { ...scopeWhere, status: 'active' } }),
      auth.db.courseEnrollment.groupBy({ by: ['status'], where: scopeWhere, _count: { _all: true } }),
      auth.db.certificate.count({ where: scopeWhere }),
      auth.db.complianceRequirement.count({ where: { ...scopeWhere, isActive: true } }),
      auth.db.trainingRequest.count({ where: { ...scopeWhere, status: 'pending' } }),
      auth.db.skillGap.count({ where: { ...scopeWhere, status: { in: ['open', 'suggested'] } } }),
      auth.db.policySignOff.count({ where: { ...scopeWhere, status: 'published' } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of enrollmentAgg) byStatus[r.status] = r._count._all;
    const totalEnrollments = Object.values(byStatus).reduce((s, v) => s + v, 0);

    // Employee self-service: my learning + my pending sign-offs
    let myLearning: unknown[] = [];
    let myCertCount = 0;
    let myPendingSignoffs = 0;
    if (auth.employeeId) {
      myLearning = await auth.db.courseEnrollment.findMany({
        where: { employeeId: auth.employeeId, status: { in: ['assigned', 'in_progress'] } },
        include: { course: { select: { id: true, title: true, category: true, mode: true, durationHours: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });
      myCertCount = await auth.db.certificate.count({ where: { employeeId: auth.employeeId, status: 'active' } });
      myPendingSignoffs = await auth.db.policySignOffAck.count({ where: { employeeId: auth.employeeId, status: 'pending' } });
    }

    // Manager: team pending approvals
    let teamPendingRequests = 0;
    if ((auth.role === 'manager' || auth.isAdmin) && auth.employeeId) {
      const reports = await auth.db.employee.findMany({ where: { reportingManagerId: auth.employeeId }, select: { id: true } });
      teamPendingRequests = await auth.db.trainingRequest.count({
        where: { employeeId: { in: reports.map((r: { id: string }) => r.id) }, status: 'pending' },
      });
    }

    return json({
      data: {
        admin: { courseCount, pathCount, totalEnrollments, byStatus, certCount, activeCompliance: reqCount, pendingRequests: pendingReqCount, openSkillGaps: gapCount, publishedSignoffs: signoffCount },
        employee: { myLearning, myCertCount, myPendingSignoffs },
        manager: { teamPendingRequests },
        role: auth.role,
      },
    });
  } catch (error) {
    console.error('[lnd/dashboard] GET error:', error);
    return json({ error: 'Failed to load L&D dashboard' }, 500);
  }
}
