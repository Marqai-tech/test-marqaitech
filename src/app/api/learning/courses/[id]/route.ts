import { lndAuth, json, CORS, ADMIN_ROLES } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/courses/[id] — course detail with modules + enrollments */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { id } = await params;
    const course = await auth.db.course.findUnique({
      where: { id },
      include: {
        modules: { orderBy: { order: 'asc' } },
        enrollments: {
          include: { employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        },
        pathCourses: { include: { path: { select: { id: true, name: true } } } },
      },
    });
    if (!course) return json({ error: 'Course not found' }, 404);
    return json({ data: course });
  } catch (error) {
    console.error('[lnd/courses/id] GET error:', error);
    return json({ error: 'Failed to load course' }, 500);
  }
}

/** PUT /api/learning/courses/[id] — update course (+replace modules when provided) */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role) && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    const fields = ['code', 'title', 'description', 'category', 'mode', 'provider', 'contentUrl', 'documentUrl', 'externalUrl', 'level', 'objectives', 'complianceCategory', 'status'];
    for (const f of fields) if (f in body) data[f] = body[f] === '' ? null : body[f];
    if ('durationHours' in body) data.durationHours = Number(body.durationHours) || 1;
    if ('passingScore' in body) data.passingScore = Number(body.passingScore) || 60;
    if ('cost' in body) data.cost = Number(body.cost) || 0;
    if ('isCompliance' in body) data.isCompliance = Boolean(body.isCompliance);
    if ('isPromotionGate' in body) data.isPromotionGate = Boolean(body.isPromotionGate);
    if ('skills' in body) data.skills = Array.isArray(body.skills) ? body.skills : body.skills ? [body.skills] : null;

    const course = await auth.db.course.update({ where: { id }, data, include: { modules: { orderBy: { order: 'asc' } } } });

    if (Array.isArray(body.modules)) {
      await auth.db.courseModule.deleteMany({ where: { courseId: id } });
      if (body.modules.length) {
        await auth.db.courseModule.createMany({
          data: body.modules.map((m: Record<string, unknown>, i: number) => ({
            courseId: id,
            title: String(m.title || `Module ${i + 1}`),
            type: String(m.type || 'video'),
            contentUrl: (m.contentUrl as string) || null,
            durationMins: Number(m.durationMins) || 15,
            order: Number(m.order) || i + 1,
            isAssessment: Boolean(m.isAssessment),
          })),
        });
      }
    }
    return json({ data: course });
  } catch (error) {
    console.error('[lnd/courses/id] PUT error:', error);
    return json({ error: 'Failed to update course' }, 500);
  }
}

/** DELETE /api/learning/courses/[id] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role)) return json({ error: 'Forbidden' }, 403);
  try {
    const { id } = await params;
    await auth.db.course.delete({ where: { id } });
    return json({ data: { ok: true } });
  } catch (error) {
    console.error('[lnd/courses/id] DELETE error:', error);
    return json({ error: 'Failed to delete course' }, 500);
  }
}
