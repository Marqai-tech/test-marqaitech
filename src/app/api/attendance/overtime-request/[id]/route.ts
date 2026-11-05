/**
 * Approve / reject an OT request. When approved with payoutPreference=comp_off,
 * credit a CompOffLeave record (REQ-OT-03).
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { dispatchOvertimeEvent } from '@/lib/overtime-notify';
import { overtimeAttendanceDayBounds, validateOvertimeRequest } from '@/lib/overtime-request-validation';
import { resolveTimezone } from '@/lib/timezone-utils';
import type { PrismaClient } from '@/generated/prisma/client';

export { OPTIONS };

function payloadObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function findLinkedApprovalRequest(db: PrismaClient, employeeId: string, overtimeRequestId: string) {
  const candidates = await db.attendanceRequest.findMany({
    where: { employeeId, requestType: 'HOURLY_PERMISSION', status: 'pending' },
    select: { id: true, payload: true },
  }).catch(() => []);
  return candidates.find((candidate: { payload: unknown }) =>
    payloadObject(candidate.payload).legacyOvertimeId === overtimeRequestId,
  ) || null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');

  const { id } = await params;
  const status = body.status as string;
  if (body.status !== undefined && !['approved', 'rejected', 'cancelled'].includes(status)) return fail('Invalid status');
  if (isAdminRole(user.role) && body.status === undefined) return fail('Status is required for an approval action');

  try {
    const existing = await db.overtimeRequest.findUnique({
      where: { id },
      include: { employee: { select: { id: true, companyId: true, timezone: true, userId: true, firstName: true, lastName: true, email: true, reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } } } },
    });
    if (!existing) return fail('Not found', 404);

    const isOwner = !!existing.employee?.email && existing.employee.email.toLowerCase() === String(user.email || '').toLowerCase();

    // Employees may edit or cancel only their own request while it is pending.
    if (!isAdminRole(user.role) && (body.status === 'cancelled' || body.status === undefined)) {
      if (!isOwner) return fail('You can only update your own overtime requests', 403);
      if (existing.status !== 'pending') return fail(`Only pending overtime requests can be changed; this request is ${existing.status}`, 409);

      if (body.status === 'cancelled') {
        const linked = await findLinkedApprovalRequest(db, existing.employeeId, existing.id);
        const cancelled = await db.overtimeRequest.update({
          where: { id },
          data: { status: 'cancelled', comments: 'Cancelled by employee' },
        });
        if (linked) {
          await db.attendanceRequestApproval.updateMany({
            where: { requestId: linked.id, status: 'pending' },
            data: { status: 'skipped', comments: 'Request cancelled by employee', actedAt: new Date() },
          }).catch(() => null);
          await db.attendanceRequest.update({
            where: { id: linked.id },
            data: { status: 'cancelled', currentLevel: 0 },
          }).catch(() => null);
        }
        return ok({ overtimeRequest: cancelled });
      }

      const validation = await validateOvertimeRequest(db, {
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        reason: body.reason,
        employee: existing.employee,
        excludeRequestId: existing.id,
      });
      if ('error' in validation) return fail(validation.error, validation.status);
      const { date, startTime, endTime, estimatedHours } = validation.value;
      const payoutPreference = body.payoutPreference === 'comp_off' ? 'comp_off' : 'payout';
      const updatedRequest = await db.overtimeRequest.update({
        where: { id },
        data: { date, startTime, endTime, estimatedHours, reason: validation.value.reason, payoutPreference },
      });

      const linked = await findLinkedApprovalRequest(db, existing.employeeId, existing.id);
      if (linked) {
        const oldPayload = payloadObject(linked.payload);
        await db.attendanceRequest.update({
          where: { id: linked.id },
          data: {
            startDate: date,
            endDate: date,
            reason: validation.value.reason,
            payload: { ...oldPayload, startTime: startTime.toISOString(), endTime: endTime.toISOString(), hours: estimatedHours, legacyOvertimeId: existing.id },
          },
        });
      }

      const manager = existing.employee.reportingManager;
      const employeeName = `${existing.employee.firstName || ''} ${existing.employee.lastName || ''}`.trim() || 'Employee';
      await dispatchOvertimeEvent(
        db,
        user.tenantId || '',
        'attendance.overtime.submitted',
        { ...updatedRequest, employee: existing.employee, managerUserId: manager?.userId, managerEmail: manager?.email, managerName: `${manager?.firstName || ''} ${manager?.lastName || ''}`.trim() },
        employeeName,
        '',
        '',
        request.headers.get('origin') || undefined,
      );
      return ok({ overtimeRequest: updatedRequest });
    }

    if (!isAdminRole(user.role)) return fail('Only the requester can edit or cancel a pending overtime request', 403);
    if (existing.status !== 'pending') return fail(`This overtime request is already ${existing.status}`, 409);

    let compOffCreditedId: string | null = null;
    let compOffCreditedAt: Date | null = null;

    if (status === 'approved' && existing.payoutPreference === 'comp_off') {
      // Credit a CompOffLeave — expires after 90 days (typical policy)
      const expiry = new Date(existing.date);
      expiry.setDate(expiry.getDate() + 90);
      const compOff = await db.compOffLeave.create({
        data: {
          employeeId: existing.employeeId,
          earnedDate: existing.date,
          hours: existing.estimatedHours,
          source: 'overtime',
          sourceOvertimeRequestId: existing.id,
          expiryDate: expiry,
          status: 'active',
        },
      });
      compOffCreditedId = compOff.id;
      compOffCreditedAt = new Date();
    }

    const updated = await db.overtimeRequest.update({
      where: { id },
      data: {
        status,
        approvedBy: user.id || user.email || 'system',
        approvedAt: new Date(),
        comments: (body.comments as string) || null,
        compOffCreditedId,
        compOffCreditedAt,
      },
    });

    // Keep the shared approval inbox in sync when an admin acts from this page.
    const linkedApproval = await findLinkedApprovalRequest(db, existing.employeeId, existing.id);
    if (linkedApproval) {
      const linkedRow = await db.attendanceRequest.findUnique({
        where: { id: linkedApproval.id },
        select: { currentLevel: true },
      }).catch(() => null);
      if (status === 'cancelled') {
        await db.attendanceRequestApproval.updateMany({
          where: { requestId: linkedApproval.id, status: 'pending' },
          data: { status: 'skipped', comments: 'Overtime request cancelled by administrator', actedAt: new Date() },
        }).catch(() => null);
      } else {
        const currentLevel = linkedRow?.currentLevel || 1;
        await db.attendanceRequestApproval.updateMany({
          where: { requestId: linkedApproval.id, level: currentLevel, status: 'pending' },
          data: { status, actorUserId: user.id || null, comments: (body.comments as string) || null, actedAt: new Date() },
        }).catch(() => null);
        await db.attendanceRequestApproval.updateMany({
          where: { requestId: linkedApproval.id, level: { gt: currentLevel }, status: 'pending' },
          data: { status: 'skipped', comments: `Closed by administrator: ${status}`, actedAt: new Date() },
        }).catch(() => null);
      }
      await db.attendanceRequest.update({
        where: { id: linkedApproval.id },
        data: { status, currentLevel: 0 },
      }).catch(() => null);
    }

    // Keep the daily attendance summary in sync with the approved OT request.
    // The request is already restricted to an attended day at submission time.
    if (status === 'approved') {
      const company = existing.employee.companyId
        ? await db.company.findUnique({ where: { id: existing.employee.companyId }, select: { timezone: true } }).catch(() => null)
        : null;
      const timezone = resolveTimezone([existing.employee, company]);
      const attendanceDay = overtimeAttendanceDayBounds(existing.date, timezone);
      const attendance = await db.attendance.findFirst({
        where: { employeeId: existing.employeeId, date: { gte: attendanceDay.start, lt: attendanceDay.end } },
        select: { id: true, overtime: true },
      }).catch(() => null);
      if (attendance) {
        await db.attendance.update({
          where: { id: attendance.id },
          data: { overtime: Math.round(Math.max(Number(attendance.overtime || 0), existing.estimatedHours) * 100) / 100 },
        }).catch(() => null);
      }
    }

    const approverName = user.name || user.email || 'Approver';
    await dispatchOvertimeEvent(
      db,
      user.tenantId || '',
      'attendance.overtime.result',
      { ...updated, employee: existing.employee },
      existing.employee ? `${existing.employee.firstName} ${existing.employee.lastName}`.trim() : 'Employee',
      approverName,
      (body.comments as string) || '',
      request.headers.get('origin') || undefined,
    );

    // If approved as payout, also create an OvertimeRecord for payroll processing
    if (status === 'approved' && existing.payoutPreference === 'payout') {
      await db.overtimeRecord.upsert({
        where: { employeeId_date: { employeeId: existing.employeeId, date: existing.date } },
        update: {
          hours: existing.estimatedHours,
          reason: existing.reason,
          status: 'approved',
          approvedBy: user.id || user.email || 'system',
          approvedAt: new Date(),
        },
        create: {
          employeeId: existing.employeeId,
          date: existing.date,
          hours: existing.estimatedHours,
          rateType: 'HOURLY_RATE',
          rate: 0,
          amount: 0,
          reason: existing.reason,
          project: (existing.projectId as string | null) || null,
          status: 'approved',
          approvedBy: user.id || user.email || 'system',
          approvedAt: new Date(),
        },
      });
    }

    return ok({ overtimeRequest: updated });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update', 500);
  }
}
