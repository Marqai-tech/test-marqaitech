import { lndAuth, companyWhere, json, CORS, notify } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/learning/requests — TNI nomination & approval inbox.
 * Approvers see pending items for their team (or all if admin); employees see their own.
 */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const where: Record<string, unknown> = { ...companyWhere(auth.companyId) };
    if (auth.isAdmin || auth.role === 'hr_manager') {
      // all
    } else if (auth.role === 'manager' && auth.employeeId) {
      const reports = await auth.db.employee.findMany({ where: { reportingManagerId: auth.employeeId }, select: { id: true } });
      where.OR = [{ employeeId: auth.employeeId }, { employeeId: { in: reports.map((r: { id: string }) => r.id) } }];
    } else if (auth.employeeId) {
      where.employeeId = auth.employeeId;
    }
    const requests = await auth.db.trainingRequest.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } }, reportingManagerId: true } },
        course: { select: { id: true, title: true, cost: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return json({ data: requests });
  } catch (error) {
    console.error('[lnd/requests] GET error:', error);
    return json({ error: 'Failed to load training requests' }, 500);
  }
}

/** POST /api/learning/requests — employee (or manager on behalf) nominates a course */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await request.json();
    if (!auth.employeeId && !body.employeeId) return json({ error: 'No employee context' }, 400);
    if (!body.courseId && !body.title) return json({ error: 'courseId or title is required' }, 400);
    const req = await auth.db.trainingRequest.create({
      data: {
        employeeId: body.employeeId || auth.employeeId,
        courseId: body.courseId || null,
        pathId: body.pathId || null,
        title: body.title || null,
        requestType: body.requestType || 'self',
        reason: body.reason || null,
        expectedCost: body.expectedCost ? Number(body.expectedCost) : null,
        companyId: auth.companyId,
      },
      include: { employee: { select: { firstName: true, lastName: true, reportingManagerId: true } }, course: { select: { title: true } } },
    });
    // Notify approver (manager, or HR when manager-suggested)
    if (req.employee?.reportingManagerId) {
      const mgr = await auth.db.employee.findUnique({
        where: { id: req.employee.reportingManagerId },
        select: { userId: true, firstName: true, lastName: true },
      });
      if (mgr?.userId) {
        await notify({
          tenantId: auth.tenantId,
          eventKey: 'learning.training.assigned',
          recipients: [{ userId: mgr.userId, name: `${mgr.firstName} ${mgr.lastName}` }],
          vars: {
            Course_Name: req.course?.title || req.title || 'Training request',
            Assigned_By: `${req.employee.firstName} ${req.employee.lastName}`,
            Due_Date: 'Approval needed',
            Mandatory: body.expectedCost ? `Est. cost ₹${body.expectedCost}` : 'Request',
          },
          entity: { type: 'training_request', id: req.id, link: '/learning/requests' },
          origin: request.headers.get('origin'),
        });
      }
    }
    return json({ data: req }, 201);
  } catch (error) {
    console.error('[lnd/requests] POST error:', error);
    return json({ error: 'Failed to create training request' }, 500);
  }
}

/**
 * PATCH /api/learning/requests — approve / reject.
 * Body: { id, action: 'approve'|'reject', reviewComments? }
 * On approve: creates the enrollment (auto-enrolment) and notifies the employee.
 */
export async function PATCH(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.id || !['approve', 'reject'].includes(body.action)) return json({ error: 'id and action are required' }, 400);
    const req = await auth.db.trainingRequest.findUnique({
      where: { id: body.id },
      include: { employee: { select: { userId: true, firstName: true, lastName: true } }, course: { select: { title: true } } },
    });
    if (!req) return json({ error: 'Request not found' }, 404);

    if (body.action === 'reject') {
      const updated = await auth.db.trainingRequest.update({
        where: { id: body.id },
        data: { status: 'rejected', reviewComments: body.reviewComments || null, reviewedById: auth.userId, reviewedAt: new Date() },
      });
      return json({ data: updated });
    }

    // Approve → auto-enrol
    await auth.db.trainingRequest.update({
      where: { id: body.id },
      data: { status: 'approved', reviewComments: body.reviewComments || null, reviewedById: auth.userId, reviewedAt: new Date() },
    });
    let enrollment = null;
    if (req.courseId) {
      try {
        enrollment = await auth.db.courseEnrollment.create({
          data: {
            courseId: req.courseId,
            employeeId: req.employeeId,
            source: 'request',
            status: 'assigned',
            companyId: auth.companyId,
          },
        });
      } catch { /* already enrolled */ }
    }
    if (req.employee?.userId) {
      await notify({
        tenantId: auth.tenantId,
        eventKey: 'learning.training.assigned',
        recipients: [{ userId: req.employee.userId, name: `${req.employee.firstName} ${req.employee.lastName}` }],
        vars: {
          Course_Name: req.course?.title || req.title || 'Training',
          Assigned_By: 'Training approved',
          Due_Date: 'Check My Learning',
          Mandatory: 'Approved request',
        },
        entity: { type: 'training_request', id: body.id, link: '/learning' },
        origin: request.headers.get('origin'),
      });
    }
    return json({ data: { ok: true, enrollment } });
  } catch (error) {
    console.error('[lnd/requests] PATCH error:', error);
    return json({ error: 'Failed to process training request' }, 500);
  }
}
