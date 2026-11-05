import { lndAuth, companyWhere, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/skill-gaps — Training Needs Identification queue */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    // SkillGap has no companyId — scope via the employee relation
    const where: Record<string, unknown> = {};
    const { searchParams } = new URL(request.url);
    if (searchParams.get('mine') === 'true' && auth.employeeId) where.employeeId = auth.employeeId;
    else if (auth.companyId) where.employee = { companyId: auth.companyId };
    const status = searchParams.get('status');
    if (status && status !== 'all') where.status = status;
    const gaps = await auth.db.skillGap.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        suggestedCourse: { select: { id: true, title: true, category: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return json({ data: gaps });
  } catch (error) {
    console.error('[lnd/skill-gaps] GET error:', error);
    return json({ error: 'Failed to load skill gaps' }, 500);
  }
}

/**
 * POST /api/learning/skill-gaps — TNI actions:
 *   { action: 'generate' } — scan performance reviews: skillsRating below threshold,
 *                            "needs improvement" in improvements text, low goal ratings.
 *                            Auto-suggests a catalog course by matching skills.
 *   { action: 'create', employeeId, skill, currentLevel?, requiredLevel?, source?, notes? }
 */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();

    if (body.action === 'generate') {
      const threshold = Number(body.threshold) || 6; // skillsRating below 6/10 → gap
      const reviews = await auth.db.performanceReview.findMany({
        where: { ...(auth.companyId ? { employee: { companyId: auth.companyId } } : {}) },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { reviewDate: 'desc' },
        take: 300,
      });
      const courses = await auth.db.course.findMany({ where: { status: 'published', ...companyWhere(auth.companyId) }, select: { id: true, title: true, skills: true, category: true, level: true } });
      const courseSkills: { id: string; title: string; skills: string[] }[] = courses.map((c: { id: string; title: string; skills: unknown }) => ({
        id: c.id, title: c.title, skills: Array.isArray(c.skills) ? (c.skills as string[]) : [],
      }));
      let created = 0;
      const createdGaps: unknown[] = [];
      for (const review of reviews) {
        const flags: string[] = [];
        if (review.skillsRating && review.skillsRating < threshold) flags.push(...(review.improvements ? review.improvements.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean) : []));
        if (review.improvements && /needs improvement|improve|gap|weak/i.test(review.improvements)) {
          flags.push(...review.improvements.split(/[,;\n.]/).map((s: string) => s.trim()).filter((s: string) => s.length > 3 && s.length < 60));
        }
        for (const skill of flags.slice(0, 3)) {
          const exists = await auth.db.skillGap.findFirst({
            where: { employeeId: review.employeeId, skill: { equals: skill, mode: 'insensitive' }, status: { in: ['open', 'suggested', 'in_training'] } },
          });
          if (exists) continue;
          // Auto-suggest: match course whose skills list contains the gap text
          const match = courseSkills.find((c) => c.skills.some((s) => skill.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(skill.toLowerCase().split(' ')[0])));
          const gap = await auth.db.skillGap.create({
            data: {
              employeeId: review.employeeId,
              skill: skill.slice(0, 80),
              source: 'performance_review',
              reviewId: review.id,
              suggestedCourseId: match?.id || null,
              status: match ? 'suggested' : 'open',
              currentLevel: review.skillsRating ? `${review.skillsRating}/10` : null,
              requiredLevel: `${threshold + 1}/10`,
            },
          });
          created++;
          createdGaps.push(gap);
        }
      }
      return json({ data: { scanned: reviews.length, created, gaps: createdGaps } });
    }

    if (body.action === 'create') {
      if (!body.employeeId || !body.skill) return json({ error: 'employeeId and skill are required' }, 400);
      const gap = await auth.db.skillGap.create({
        data: {
          employeeId: body.employeeId,
          skill: body.skill,
          currentLevel: body.currentLevel || null,
          requiredLevel: body.requiredLevel || null,
          source: body.source || 'manager_feedback',
          suggestedCourseId: body.suggestedCourseId || null,
          status: body.suggestedCourseId ? 'suggested' : 'open',
          notes: body.notes || null,
        },
      });
      return json({ data: gap }, 201);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[lnd/skill-gaps] POST error:', error);
    return json({ error: 'Skill-gap action failed' }, 500);
  }
}

/** PATCH /api/learning/skill-gaps — { id, status?, suggestedCourseId?, enroll?: true } */
export async function PATCH(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.id) return json({ error: 'id is required' }, 400);
    const gap = await auth.db.skillGap.findUnique({ where: { id: body.id } });
    if (!gap) return json({ error: 'Skill gap not found' }, 404);

    if (body.enroll) {
      const courseId = body.courseId || gap.suggestedCourseId;
      if (!courseId) return json({ error: 'No course to enroll' }, 400);
      let enrollment = null;
      try {
        enrollment = await auth.db.courseEnrollment.create({
          data: { courseId, employeeId: gap.employeeId, source: 'manager_recommendation', status: 'assigned', companyId: auth.companyId },
        });
      } catch { skippedEnrollment(); }
      function skippedEnrollment() { /* already enrolled */ }
      const updated = await auth.db.skillGap.update({ where: { id: body.id }, data: { status: 'in_training', suggestedCourseId: courseId, resolvedEnrollmentId: enrollment?.id || null } });
      return json({ data: updated, enrollment });
    }

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if ('suggestedCourseId' in body) data.suggestedCourseId = body.suggestedCourseId || null;
    const updated = await auth.db.skillGap.update({ where: { id: body.id }, data });
    return json({ data: updated });
  } catch (error) {
    console.error('[lnd/skill-gaps] PATCH error:', error);
    return json({ error: 'Failed to update skill gap' }, 500);
  }
}
