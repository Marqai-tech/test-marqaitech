import { lndAuth, companyWhere, json, CORS, ADMIN_ROLES } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/courses — Course Catalog & Content Hub listing */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const category = searchParams.get('category');
    const status = searchParams.get('status') || 'published';
    const compliance = searchParams.get('compliance');

    const where: Record<string, unknown> = { ...companyWhere(auth.companyId) };
    if (status !== 'all') where.status = status;
    if (category && category !== 'all') where.category = category;
    if (compliance === 'true') where.isCompliance = true;
    if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }];

    const courses = await auth.db.course.findMany({
      where,
      include: {
        modules: { orderBy: { order: 'asc' } },
        _count: { select: { enrollments: true, pathCourses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Progress rollup per course
    const ids = courses.map((c: { id: string }) => c.id);
    const enrollRows = ids.length ? await auth.db.courseEnrollment.groupBy({
      by: ['courseId', 'status'],
      where: { courseId: { in: ids } },
      _count: { _all: true },
    }) : [];
    const rollup: Record<string, { total: number; completed: number; inProgress: number }> = {};
    for (const r of enrollRows) {
      const e = rollup[r.courseId] || { total: 0, completed: 0, inProgress: 0 };
      e.total += r._count._all;
      if (r.status === 'completed') e.completed += r._count._all;
      if (r.status === 'in_progress' || r.status === 'assigned') e.inProgress += r._count._all;
      rollup[r.courseId] = e;
    }

    return json({
      data: courses.map((c: Record<string, unknown> & { id: string; _count: { enrollments: number } }) => ({
        ...c,
        enrollmentCount: c._count?.enrollments ?? rollup[c.id]?.total ?? 0,
        completionRate: rollup[c.id]?.total ? Math.round(((rollup[c.id].completed) / rollup[c.id].total) * 100) : null,
      })),
    });
  } catch (error) {
    console.error('[lnd/courses] GET error:', error);
    return json({ error: 'Failed to load courses' }, 500);
  }
}

/** POST /api/learning/courses — create a course (with optional modules) */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role) && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.title) return json({ error: 'title is required' }, 400);
    const modules = Array.isArray(body.modules)
      ? body.modules.map((m: Record<string, unknown>, i: number) => ({
          title: String(m.title || `Module ${i + 1}`),
          type: String(m.type || 'video'),
          contentUrl: (m.contentUrl as string) || null,
          durationMins: Number(m.durationMins) || 15,
          order: Number(m.order) || i + 1,
          isAssessment: Boolean(m.isAssessment),
        }))
      : [];
    const course = await auth.db.course.create({
      data: {
        code: body.code || null,
        title: body.title,
        description: body.description || null,
        category: body.category || 'technical',
        mode: body.mode || 'e_learning',
        provider: body.provider || null,
        contentUrl: body.contentUrl || null,
        documentUrl: body.documentUrl || null,
        externalUrl: body.externalUrl || null,
        durationHours: Number(body.durationHours) || 1,
        level: body.level || 'beginner',
        skills: Array.isArray(body.skills) ? body.skills : body.skills ? [body.skills] : null,
        objectives: body.objectives || null,
        isCompliance: Boolean(body.isCompliance),
        complianceCategory: body.complianceCategory || null,
        isPromotionGate: Boolean(body.isPromotionGate),
        passingScore: Number(body.passingScore) || 60,
        cost: Number(body.cost) || 0,
        currency: 'INR',
        status: body.status || 'published',
        companyId: body.companyId || auth.companyId,
        createdById: auth.userId,
        modules: { create: modules },
      },
      include: { modules: { orderBy: { order: 'asc' } } },
    });
    await auth.db.auditLog.create({
      data: { userId: auth.userId, action: 'CREATE_LND_COURSE', module: 'learning', entityId: course.id, details: `Created course ${course.title}` },
    }).catch(() => {});
    return json({ data: course }, 201);
  } catch (error) {
    console.error('[lnd/courses] POST error:', error);
    return json({ error: 'Failed to create course' }, 500);
  }
}
