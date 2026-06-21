/**
 * Pre-OT Approval API — REQ-OT-02, REQ-OT-03 (with Comp-Off conversion)
 *
 *  GET  /api/attendance/overtime-request
 *  POST /api/attendance/overtime-request
 *  PATCH /api/attendance/overtime-request/[id]   — approve/reject + optionally convert to comp-off
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
      if (!emp) return ok({ overtimeRequests: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;

    const items = await prisma.overtimeRequest.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    });
    return ok({ overtimeRequests: items });
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
    const emp = await findEmployeeByEmail(user.email);
    if (!emp) return fail('Employee record not found', 404);

    const date = new Date(body.date as string);
    const startTime = new Date(body.startTime as string);
    const endTime = new Date(body.endTime as string);
    const reason = (body.reason as string) || '';
    if (!startTime || !endTime || !reason) return fail('Missing required fields');

    const ms = endTime.getTime() - startTime.getTime();
    const estimatedHours = Math.max(0.25, Math.round((ms / (1000 * 60 * 60)) * 100) / 100);

    const payoutPreference = body.payoutPreference === 'comp_off' ? 'comp_off' : 'payout';

    const record = await prisma.overtimeRequest.create({
      data: {
        employeeId: emp.id,
        date,
        startTime,
        endTime,
        estimatedHours,
        reason,
        projectId: (body.projectId as string) || null,
        payoutPreference,
        status: 'pending',
      },
    });
    return ok({ overtimeRequest: record }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
