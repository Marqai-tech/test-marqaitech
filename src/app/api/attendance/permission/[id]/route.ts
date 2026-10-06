import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';

export { OPTIONS };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  const { id } = await params;
  try {
    const emp = await db.employee.findFirst({ where: { email: user.email }, select: { id: true } });
    const existing = await db.hourlyPermission.findUnique({ where: { id } });
    if (!existing) return fail('Permission request not found', 404);
    if (!emp || existing.employeeId !== emp.id) return fail('You can only edit your own request', 403);
    if (existing.status !== 'pending') return fail('Only pending requests can be edited', 409);
    const date = new Date(String(body.date || existing.date));
    const startTime = new Date(String(body.startTime || existing.startTime));
    const endTime = new Date(String(body.endTime || existing.endTime));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : existing.reason;
    if ([date, startTime, endTime].some(d => Number.isNaN(d.getTime())) || !reason) return fail('Valid date, times and reason are required', 422);
    if (startTime >= endTime) return fail('End time must be after start time', 422);
    const hours = Math.max(0.25, Math.round(((endTime.getTime() - startTime.getTime()) / 3600000) * 4) / 4);
    if (hours > 8) return fail('Permission cannot exceed 8 hours', 422);
    const dayStart = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const dayEnd = new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
    const leave = await db.leaveRequest.findFirst({ where: { employeeId: emp.id, status: 'approved', startDate: { lte: dayEnd }, endDate: { gte: dayStart } }, select: { id: true } });
    if (leave) return fail('Permission cannot be requested on a date with approved leave.', 409);
    const conflict = await db.hourlyPermission.findFirst({ where: { employeeId: emp.id, id: { not: id }, date: { gte: dayStart, lte: dayEnd }, status: { in: ['pending', 'approved'] }, startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
    if (conflict) return fail('Another permission request overlaps this time range.', 409);
    const updated = await db.hourlyPermission.update({ where: { id }, data: { date, startTime, endTime, hours, reason } });
    return ok({ permission: updated });
  } catch (e: unknown) { return fail(e instanceof Error ? e.message : 'Failed to edit request', 500); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const { id } = await params;
  try {
    const emp = await db.employee.findFirst({ where: { email: user.email }, select: { id: true } });
    const existing = await db.hourlyPermission.findUnique({ where: { id } });
    if (!existing) return fail('Permission request not found', 404);
    if (!emp || existing.employeeId !== emp.id) return fail('You can only cancel your own request', 403);
    if (existing.status !== 'pending') return fail('Only pending requests can be cancelled', 409);
    await db.hourlyPermission.delete({ where: { id } });
    return ok({ cancelled: true, id });
  } catch (e: unknown) { return fail(e instanceof Error ? e.message : 'Failed to cancel request', 500); }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only managers/HR can approve', 403);
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');

  const { id } = await params;
  const status = body.status as string;
  if (!['approved', 'rejected'].includes(status)) return fail('Invalid status');

  try {
    const updated = await db.hourlyPermission.update({
      where: { id },
      data: {
        status,
        approvedBy: user.id || user.email || 'system',
        approvedAt: new Date(),
      },
    });
    return ok({ permission: updated });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update', 500);
  }
}
