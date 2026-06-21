/**
 * Gatepass API — REQ-GATE-01, REQ-GATE-02
 *
 * Two-tier approval: Manager (time loss) + Security (physical gate opening).
 * Visitor/contractor gatepasses have no employeeId but log visitorName/Company.
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import prisma from '@/lib/prisma';

export { OPTIONS };

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const where: Record<string, unknown> = {};
    if (!isAdminRole(user.role)) {
      const emp = await findEmployeeByEmail(user.email);
      if (!emp) return ok({ gatepasses: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;

    const items = await prisma.gatepass.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    return ok({ gatepasses: items });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load', 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    const type = body.type as string;
    if (!['early_departure', 'late_arrival', 'visitor', 'contractor'].includes(type)) {
      return fail('Invalid gatepass type');
    }
    const reason = (body.reason as string) || '';
    if (!reason) return fail('Reason is required');
    const requestedAt = new Date(body.requestedAt as string);

    let employeeId: string | null = null;
    if (type === 'early_departure' || type === 'late_arrival') {
      const emp = await findEmployeeByEmail(user.email);
      if (!emp) return fail('Employee record not found', 404);
      employeeId = emp.id;
    }

    const record = await prisma.gatepass.create({
      data: {
        employeeId,
        visitorName: (body.visitorName as string) || null,
        visitorCompany: (body.visitorCompany as string) || null,
        visitorPhone: (body.visitorPhone as string) || null,
        projectId: (body.projectId as string) || null,
        type,
        requestedAt,
        reason,
        status: 'pending',
      },
    });
    return ok({ gatepass: record }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
