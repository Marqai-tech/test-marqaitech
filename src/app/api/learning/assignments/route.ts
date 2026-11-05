import { lndAuth, companyWhere, json, CORS, notify } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/assignments — assignment history with rollups */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const assignments = await auth.db.courseAssignment.findMany({
      where: { ...companyWhere(auth.companyId) },
      include: {
        course: { select: { id: true, title: true, category: true } },
        path: { select: { id: true, name: true, category: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const rows = await auth.db.courseEnrollment.groupBy({
      by: ['assignmentId', 'status'],
      where: { assignmentId: { not: null } },
      _count: { _all: true },
    });
    const map: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!r.assignmentId) continue;
      map[r.assignmentId] = map[r.assignmentId] || {};
      map[r.assignmentId][r.status] = r._count._all;
    }
    return json({
      data: assignments.map((a: Record<string, unknown> & { id: string }) => ({ ...a, statusCounts: map[a.id] || {} })),
    });
  } catch (error) {
    console.error('[lnd/assignments] GET error:', error);
    return json({ error: 'Failed to load assignments' }, 500);
  }
}

/**
 * POST /api/learning/assignments — bulk assign a course or path.
 * Body: { courseId? | pathId?, assigneeType: individual|department|company,
 *         employeeIds?: string[], departmentId?: string, dueDate?, isMandatory?, reason? }
 * Creates CourseEnrollment rows for every target employee (skips duplicates)
 * and dispatches learning.training.assigned notifications.
 */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    const { courseId, pathId, assigneeType } = body;
    if (!courseId && !pathId) return json({ error: 'courseId or pathId is required' }, 400);
    if (!assigneeType) return json({ error: 'assigneeType is required' }, 400);

    // Resolve target employees
    let employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : [];
    if (assigneeType === 'department' && body.departmentId) {
      const emps = await auth.db.employee.findMany({ where: { departmentId: body.departmentId, status: 'active' }, select: { id: true } });
      employeeIds = emps.map((e: { id: string }) => e.id);
    } else if (assigneeType === 'company') {
      const where = auth.companyId ? { companyId: auth.companyId, status: 'active' } : { status: 'active' };
      const emps = await auth.db.employee.findMany({ where, select: { id: true } });
      employeeIds = emps.map((e: { id: string }) => e.id);
    }
    if (!employeeIds.length) return json({ error: 'No target employees resolved' }, 400);

    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    // For a path assignment, enroll in each path course (required + optional)
    let courseIds: { id: string; pathId: string | null }[] = [];
    if (courseId) courseIds = [{ id: courseId, pathId: null }];
    else {
      const pcs = await auth.db.learningPathCourse.findMany({ where: { pathId }, orderBy: { order: 'asc' }, select: { courseId: true } });
      courseIds = pcs.map((pc: { courseId: string }) => ({ id: pc.courseId, pathId: pathId as string }));
    }

    const assignment = await auth.db.courseAssignment.create({
      data: {
        courseId: courseId || null,
        pathId: pathId || null,
        assigneeType,
        employeeId: assigneeType === 'individual' ? employeeIds[0] : null,
        departmentId: assigneeType === 'department' ? body.departmentId : null,
        targetCount: employeeIds.length,
        dueDate,
        isMandatory: Boolean(body.isMandatory),
        reason: body.reason || null,
        companyId: auth.companyId,
        assignedById: auth.userId,
      },
    });

    let created = 0, skipped = 0;
    const recipients: { userId: string; name?: string }[] = [];
    for (const empId of employeeIds) {
      for (const c of courseIds) {
        try {
          await auth.db.courseEnrollment.create({
            data: {
              courseId: c.id,
              pathId: c.pathId,
              employeeId: empId,
              assignmentId: assignment.id,
              source: 'assigned',
              status: 'assigned',
              dueDate,
              companyId: auth.companyId,
            },
          });
          created++;
        } catch { skipped++; }
      }
    }

    // Notify unique employees (cap 60 per dispatch batch)
    const emps = await auth.db.employee.findMany({
      where: { id: { in: employeeIds.slice(0, 60) } },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    const targetName = courseId
      ? (await auth.db.course.findUnique({ where: { id: courseId }, select: { title: true } }))?.title
      : (await auth.db.learningPath.findUnique({ where: { id: pathId }, select: { name: true } }))?.name;
    for (const e of emps) {
      if (e.userId) recipients.push({ userId: e.userId, name: `${e.firstName} ${e.lastName}` });
    }
    await notify({
      tenantId: auth.tenantId,
      eventKey: 'learning.training.assigned',
      recipients,
      vars: {
        Course_Name: targetName || 'Training',
        Assigned_By: 'L&D / Manager',
        Due_Date: dueDate ? dueDate.toLocaleDateString('en-IN') : 'No deadline',
        Mandatory: body.isMandatory ? 'Yes — mandatory' : 'No — optional',
      },
      entity: { type: 'course_assignment', id: assignment.id, link: '/learning' },
      origin: request.headers.get('origin'),
    });

    return json({ data: { assignment, created, skippedDuplicates: skipped, notified: recipients.length } }, 201);
  } catch (error) {
    console.error('[lnd/assignments] POST error:', error);
    return json({ error: 'Failed to create assignment' }, 500);
  }
}

/** PATCH /api/learning/assignments — cancel an assignment (removes not-yet-started enrollments) */
export async function PATCH(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.id) return json({ error: 'id is required' }, 400);
    await auth.db.courseAssignment.update({ where: { id: body.id }, data: { status: 'cancelled' } });
    const removed = await auth.db.courseEnrollment.deleteMany({ where: { assignmentId: body.id, status: 'assigned', progress: 0 } });
    return json({ data: { ok: true, removedPending: removed.count } });
  } catch (error) {
    console.error('[lnd/assignments] PATCH error:', error);
    return json({ error: 'Failed to cancel assignment' }, 500);
  }
}
