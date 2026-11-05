import { lndAuth, companyWhere, json, CORS, ADMIN_ROLES } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/paths — structured learning paths */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const paths = await auth.db.learningPath.findMany({
      where: { ...companyWhere(auth.companyId) },
      include: {
        pathCourses: {
          include: { course: { select: { id: true, title: true, category: true, durationHours: true, isPromotionGate: true } } },
          orderBy: { order: 'asc' },
        },
        _count: { select: { pathCourses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // enrollment rollup per path
    const pathIds = paths.map((p: { id: string }) => p.id);
    const roll = pathIds.length ? await auth.db.courseEnrollment.groupBy({
      by: ['pathId', 'status'],
      where: { pathId: { in: pathIds } },
      _count: { _all: true },
    }) : [];
    const map: Record<string, { total: number; completed: number }> = {};
    for (const r of roll) {
      const e = map[r.pathId] || { total: 0, completed: 0 };
      e.total += r._count._all;
      if (r.status === 'completed') e.completed += r._count._all;
      map[r.pathId] = e;
    }
    return json({
      data: paths.map((p: Record<string, unknown> & { id: string }) => ({
        ...p,
        enrollmentCount: map[p.id]?.total ?? 0,
        completionRate: map[p.id]?.total ? Math.round((map[p.id].completed / map[p.id].total) * 100) : null,
      })),
    });
  } catch (error) {
    console.error('[lnd/paths] GET error:', error);
    return json({ error: 'Failed to load learning paths' }, 500);
  }
}

/** POST /api/learning/paths — create a path with an ordered course sequence */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role) && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.name) return json({ error: 'name is required' }, 400);
    const courseIds: string[] = Array.isArray(body.courseIds) ? body.courseIds : [];
    const path = await auth.db.learningPath.create({
      data: {
        name: body.name,
        code: body.code || null,
        description: body.description || null,
        category: body.category || 'skill_upskilling',
        targetRole: body.targetRole || null,
        durationWeeks: body.durationWeeks ? Number(body.durationWeeks) : null,
        isPromotionTrack: Boolean(body.isPromotionTrack),
        status: body.status || 'active',
        companyId: body.companyId || auth.companyId,
        createdById: auth.userId,
        pathCourses: {
          create: courseIds.map((courseId, i) => ({
            courseId,
            order: i + 1,
            isRequired: body.requiredIds ? (body.requiredIds as string[]).includes(courseId) : true,
          })),
        },
      },
      include: { pathCourses: { include: { course: { select: { id: true, title: true } } }, orderBy: { order: 'asc' } } },
    });
    return json({ data: path }, 201);
  } catch (error) {
    console.error('[lnd/paths] POST error:', error);
    return json({ error: 'Failed to create learning path' }, 500);
  }
}
