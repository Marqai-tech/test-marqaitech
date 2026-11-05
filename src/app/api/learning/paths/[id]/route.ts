import { lndAuth, json, CORS, ADMIN_ROLES } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/paths/[id] */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { id } = await params;
    const path = await auth.db.learningPath.findUnique({
      where: { id },
      include: {
        pathCourses: {
          include: {
            course: {
              include: { _count: { select: { enrollments: true } } },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!path) return json({ error: 'Learning path not found' }, 404);
    return json({ data: path });
  } catch (error) {
    console.error('[lnd/paths/id] GET error:', error);
    return json({ error: 'Failed to load learning path' }, 500);
  }
}

/** PUT /api/learning/paths/[id] — update + resequence courses */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role) && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    for (const f of ['name', 'code', 'description', 'category', 'targetRole', 'status']) if (f in body) data[f] = body[f] === '' ? null : body[f];
    if ('durationWeeks' in body) data.durationWeeks = body.durationWeeks ? Number(body.durationWeeks) : null;
    if ('isPromotionTrack' in body) data.isPromotionTrack = Boolean(body.isPromotionTrack);
    const path = await auth.db.learningPath.update({ where: { id }, data });

    if (Array.isArray(body.courseIds)) {
      await auth.db.learningPathCourse.deleteMany({ where: { pathId: id } });
      if (body.courseIds.length) {
        await auth.db.learningPathCourse.createMany({
          data: (body.courseIds as string[]).map((courseId, i) => ({
            pathId: id, courseId, order: i + 1,
            isRequired: body.requiredIds ? (body.requiredIds as string[]).includes(courseId) : true,
          })),
        });
      }
    }
    return json({ data: path });
  } catch (error) {
    console.error('[lnd/paths/id] PUT error:', error);
    return json({ error: 'Failed to update learning path' }, 500);
  }
}

/** DELETE /api/learning/paths/[id] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_ROLES.includes(auth.role)) return json({ error: 'Forbidden' }, 403);
  try {
    const { id } = await params;
    await auth.db.learningPath.delete({ where: { id } });
    return json({ data: { ok: true } });
  } catch (error) {
    console.error('[lnd/paths/id] DELETE error:', error);
    return json({ error: 'Failed to delete learning path' }, 500);
  }
}
