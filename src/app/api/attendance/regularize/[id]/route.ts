/**
 * Approve / reject a regularization request (REQ-REG-03).
 * PATCH /api/attendance/regularize/[id]
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

export { OPTIONS };

/** Edit a pending request. Only the owning employee may edit it. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  const { id } = await params;

  try {
    const employee = await db.employee.findFirst({ where: { email: user.email }, select: { id: true } });
    const existing = await db.attendanceRegularization.findUnique({ where: { id } });
    if (!existing) return fail('Not found', 404);
    if (!employee || existing.employeeId !== employee.id) return fail('You can only edit your own request', 403);
    if (existing.status !== 'pending') return fail('Only pending requests can be edited', 409);

    const date = new Date(String(body.date || existing.date));
    const requestedTime = new Date(String(body.requestedTime || existing.requestedTime));
    const punchType = String(body.punchType || existing.punchType);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : existing.reason;
    if (Number.isNaN(date.getTime()) || Number.isNaN(requestedTime.getTime())) return fail('Invalid date or requested time', 422);
    if (!['check_in', 'check_out'].includes(punchType)) return fail('Invalid punch type', 422);
    if (!reason) return fail('Reason is required', 422);

    const duplicate = await db.attendanceRegularization.findFirst({
      where: { employeeId: existing.employeeId, id: { not: id }, punchType, status: { in: ['pending', 'approved'] }, date: { gte: new Date(date.toISOString().slice(0, 10) + 'T00:00:00.000Z'), lt: new Date(date.toISOString().slice(0, 10) + 'T23:59:59.999Z') } },
      select: { id: true },
    });
    if (duplicate) return fail('Another pending or approved request already exists for this date and punch type', 409);

    const updated = await db.attendanceRegularization.update({ where: { id }, data: { date, requestedTime, punchType, reason } });
    return ok({ regularization: updated });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to edit request', 500);
  }
}

/** Cancel a pending request. Cancellation is a hard delete; approved/rejected requests are immutable. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const { id } = await params;
  try {
    const employee = await db.employee.findFirst({ where: { email: user.email }, select: { id: true } });
    const existing = await db.attendanceRegularization.findUnique({ where: { id } });
    if (!existing) return fail('Not found', 404);
    if (!employee || existing.employeeId !== employee.id) return fail('You can only cancel your own request', 403);
    if (existing.status !== 'pending') return fail('Only pending requests can be cancelled', 409);
    await db.attendanceRegularization.delete({ where: { id } });
    return ok({ cancelled: true, id });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to cancel request', 500);
  }
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
    const existing = await db.attendanceRegularization.findUnique({ where: { id } });
    if (!existing) return fail('Not found', 404);

    const updated = await db.attendanceRegularization.update({
      where: { id },
      data: {
        status,
        approvedBy: user.id || user.email || 'system',
        approvedAt: new Date(),
        comments: (body.comments as string) || null,
      },
    });

    // If approved, apply the punch to the attendance record + write audit log
    if (status === 'approved') {
      const date = existing.date;
      let attendance = await db.attendance.findFirst({ where: { employeeId: existing.employeeId, date } });
      const beforeData = attendance ? {
        checkIn: attendance.checkIn, checkOut: attendance.checkOut, status: attendance.status,
      } : null;

      if (existing.punchType === 'check_in') {
        if (attendance) {
          attendance = await db.attendance.update({
            where: { id: attendance.id },
            data: { checkIn: existing.requestedTime, status: 'present' },
          });
        } else {
          attendance = await db.attendance.create({
            data: {
              employeeId: existing.employeeId,
              date,
              checkIn: existing.requestedTime,
              status: 'present',
            },
          });
        }
      } else {
        // check_out
        if (attendance) {
          attendance = await db.attendance.update({
            where: { id: attendance.id },
            data: { checkOut: existing.requestedTime },
          });
          // Recompute work hours
          if (attendance.checkIn && attendance.checkOut) {
            const hours = (attendance.checkOut.getTime() - attendance.checkIn.getTime()) / (1000 * 60 * 60);
            await db.attendance.update({ where: { id: attendance.id }, data: { workHours: Math.round(hours * 100) / 100 } });
          }
        } else {
          attendance = await db.attendance.create({
            data: { employeeId: existing.employeeId, date, checkOut: existing.requestedTime, status: 'present' },
          });
        }
      }

      // REQ-SEC-ATT-04: audit log
      await db.attendanceAuditLog.create({
        data: {
          employeeId: existing.employeeId,
          attendanceId: attendance?.id || null,
          action: 'regularization_approved',
          beforeData: beforeData as object,
          afterData: {
            checkIn: attendance?.checkIn, checkOut: attendance?.checkOut, status: attendance?.status,
          },
          changedBy: user.id || user.email || 'system',
          reason: `Regularization: ${existing.reason}`,
        },
      });
    }

    // Notify the employee of the final decision through in-app + email channels.
    try {
      const employee = await db.employee.findUnique({ where: { id: existing.employeeId }, select: { userId: true, firstName: true, lastName: true } });
      const tenantId = (user as any).tenantId || (await resolveCompanyScope(request))?.tenantId;
      if (tenantId && employee?.userId) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        await dispatchNotification({
          tenantId,
          module: 'attendance',
          eventKey: 'attendance.request.result',
          recipients: [{ userId: employee.userId }],
          vars: {
            Employee_Name: `${employee.firstName} ${employee.lastName}`,
            Request_Type: 'Attendance Regularization',
            Request_Date: new Date(existing.date).toLocaleDateString('en-IN'),
            Status: status,
            Approver_Name: user.name || user.email,
            Comment: (body.comments as string) || '—',
          },
          entity: { type: 'attendance_regularization', id, link: '/attendance/regularize' },
        });
      }
    } catch (notificationError) {
      console.warn('[regularize] result notification failed:', notificationError);
    }

    return ok({ regularization: updated });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update', 500);
  }
}
