/**
 * Pre-OT Approval API — REQ-OT-02, REQ-OT-03 (with Comp-Off conversion)
 * + REQ-AI-ATT-04: AI auto-approval engine integration
 *
 *  GET  /api/attendance/overtime-request
 *  POST /api/attendance/overtime-request
 *  PATCH /api/attendance/overtime-request/[id]   — approve/reject + optionally convert to comp-off
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { buildContext, evaluateOvertimeAutoApproval } from '@/lib/auto-approval-engine';
import { dispatchOvertimeEvent } from '@/lib/overtime-notify';
import { loadWorkflowConfig, initializeWorkflow } from '@/lib/attendance-workflow';

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const where: Record<string, unknown> = {};
    if (!isAdminRole(user.role)) {
      const emp = await findEmployeeByEmail(user.email, db);
      if (!emp) return ok({ overtimeRequests: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;

    const items = await db.overtimeRequest.findMany({
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
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    // ─── Resolve the target employee ───
    // Admins (Apply Attendance by HR) may submit on behalf of a selected
    // employee via body.employeeId. Everyone else is always themselves.
    // NOTE: findEmployeeByEmail MUST receive the tenant `db` — the legacy
    // no-db fallback resolved the employee against the platform database,
    // producing an id that violated OvertimeRequest_employeeId_fkey on create.
    let emp: any = null;
    const onBehalfId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (onBehalfId && isAdminRole(user.role)) {
      emp = await db.employee.findUnique({
        where: { id: onBehalfId },
        select: { id: true, companyId: true, firstName: true, lastName: true, userId: true, reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } },
      });
      if (!emp) return fail('Selected employee not found', 404);
    } else {
      if (onBehalfId && !isAdminRole(user.role)) {
        return fail('You can only submit overtime requests for yourself', 403);
      }
      emp = await db.employee.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' } },
        select: { id: true, companyId: true, firstName: true, lastName: true, userId: true, reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } },
      });
    }
    if (!emp) return fail('Employee record not found', 404);

    const date = new Date(body.date as string);
    const startTime = new Date(body.startTime as string);
    const endTime = new Date(body.endTime as string);
    const reason = (body.reason as string) || '';
    // Explicit guards — an Invalid Date is truthy, so the previous
    // `!startTime || !endTime` check let invalid values through to Prisma
    // (which surfaced as "Invalid Date" invocation errors and NaN hours).
    if (isNaN(date.getTime())) return fail('Invalid date format');
    if (isNaN(startTime.getTime())) return fail('Invalid start time format — select the start time again');
    if (isNaN(endTime.getTime())) return fail('Invalid end time format — select the end time again');
    if (endTime <= startTime) return fail('End time must be after start time');
    if (!reason.trim()) return fail('Reason is required');

    const ms = endTime.getTime() - startTime.getTime();
    const estimatedHours = Math.max(0.25, Math.round((ms / (1000 * 60 * 60)) * 100) / 100);

    const dayStart = new Date(date); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const activeStatuses = { in: ['pending', 'approved', 'auto_approved'] };

    // Check approved leave first. Leave dates commonly have no attendance row;
    // the user must receive the specific leave-conflict message, not the more
    // generic absent/no-attendance message.
    const approvedLeave = await db.leaveRequest.findFirst({
      where: { employeeId: emp.id, status: 'approved', startDate: { lt: dayEnd }, endDate: { gte: dayStart } },
      select: { id: true },
    });
    if (approvedLeave) return fail('Overtime cannot be requested on a date with approved leave', 422);

    // An OT request is valid only for a day with an attendance record. This
    // prevents HR from creating OT for an absent day or a date with no punch.
    const attendance = await db.attendance.findFirst({
      where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd } },
      select: { status: true, checkIn: true, checkOut: true },
    });
    if (!attendance || ['absent', 'on_leave', 'holiday', 'weekend'].includes(String(attendance?.status || '').toLowerCase())) {
      return fail('Overtime cannot be requested because the employee is absent or has no attendance record for the selected date', 422);
    }

    // Respect the configured company shift. OT may only be outside the normal
    // working window; this makes 6–8 PM valid for a 9–6 shift but rejects 2–4 PM.
    const policy = await db.attendancePolicyConfig.findFirst({
      where: { OR: [{ companyId: emp.companyId || null }, { companyId: null }] },
      orderBy: { updatedAt: 'desc' },
      select: { shiftStartDefault: true, shiftEndDefault: true },
    }).catch(() => null);
    const toMinutes = (value: string | null | undefined, fallback: number) => {
      const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value || '');
      return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
    };
    const configuredShiftStart = policy?.shiftStartDefault === '09:00' ? '09:30' : (policy?.shiftStartDefault || '09:30');
    const configuredShiftEnd = policy?.shiftEndDefault === '17:30' ? '18:30' : (policy?.shiftEndDefault || '18:30');
    const shiftStartMinutes = toMinutes(configuredShiftStart, 9 * 60 + 30);
    const shiftEndMinutes = toMinutes(configuredShiftEnd, 18 * 60 + 30);
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    if (startMinutes < shiftEndMinutes && endMinutes > shiftStartMinutes) {
      return fail(`Overtime must be outside scheduled working hours (${configuredShiftStart}–${configuredShiftEnd})`, 422);
    }

    const duplicateOrOverlap = await db.overtimeRequest.findFirst({
      where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd }, status: activeStatuses, startTime: { lt: endTime }, endTime: { gt: startTime } },
      select: { id: true },
    });
    if (duplicateOrOverlap) return fail('An overtime request already exists or overlaps this time range for the selected date', 409);

    const permissionOverlap = await db.hourlyPermission.findFirst({
      where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd }, status: { in: ['pending', 'approved', 'auto_approved'] }, startTime: { lt: endTime }, endTime: { gt: startTime } },
      select: { id: true },
    }).catch(() => null);
    if (permissionOverlap) return fail('Overtime cannot overlap an existing permission request for the selected date and time', 409);

    const attendanceRequestOverlap = await db.attendanceRequest.findMany({
      where: { employeeId: emp.id, requestType: 'HOURLY_PERMISSION', status: { notIn: ['rejected', 'cancelled'] }, startDate: { gte: dayStart, lt: dayEnd } },
      select: { payload: true },
    }).catch(() => []);
    const overlapsPayload = attendanceRequestOverlap.some((row: any) => {
      try {
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const pStart = new Date(payload?.startTime || 0); const pEnd = new Date(payload?.endTime || 0);
        return !isNaN(pStart.getTime()) && !isNaN(pEnd.getTime()) && pStart < endTime && pEnd > startTime;
      } catch { return false; }
    });
    if (overlapsPayload) return fail('Overtime cannot overlap an existing permission request for the selected date and time', 409);

    if (attendance.checkIn && attendance.checkOut && startTime < attendance.checkOut && endTime > attendance.checkIn) {
      return fail('Overtime cannot overlap the employee attendance time for the selected date', 409);
    }

    const payoutPreference = body.payoutPreference === 'comp_off' ? 'comp_off' : 'payout';

    // REQ-AI-ATT-04: run the auto-approval engine
    // Weekend OT always requires human review; weekday OT below threshold
    // may be auto-approved based on employee trust score + anti-abuse checks.
    const day = new Date(date);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6; // 0=Sun, 6=Sat
    const ctx = await buildContext(emp.id);
    const decision = await evaluateOvertimeAutoApproval(ctx, {
      estimatedHours,
      payoutPreference,
      isWeekend,
    });

    const status = decision.autoApproved ? 'approved' : 'pending';
    const approvedBy = decision.autoApproved ? 'ai_auto' : null;
    const approvedAt = decision.autoApproved ? new Date() : null;
    const comments = decision.autoApproved
      ? `AI auto-approved: ${decision.reason} (confidence ${(decision.confidence * 100).toFixed(0)}%)`
      : `AI deferred to human: ${decision.reason}`;

    const record = await db.overtimeRequest.create({
      data: {
        employeeId: emp.id,
        date,
        startTime,
        endTime,
        estimatedHours,
        reason,
        projectId: (body.projectId as string) || null,
        payoutPreference,
        status,
        approvedBy,
        approvedAt,
        comments,
      },
    });

    // Bridge human-review OT requests into the shared Attendance approval
    // inbox. The OT table remains the source record; the unified row carries
    // the approval chain and points back to it for finalization.
    let workflowRequestId: string | null = null;
    if (status !== 'approved') {
      try {
        const { config, configId } = await loadWorkflowConfig(db, emp.companyId || null, 'HOURLY_PERMISSION', {
          employmentType: 'all', branchId: null, departmentId: null, employeeStatus: 'active',
        });
        const workflowRequest = await db.attendanceRequest.create({
          data: {
            companyId: emp.companyId || null,
            employeeId: emp.id,
            requestType: 'HOURLY_PERMISSION',
            subtype: 'OVERTIME',
            startDate: date,
            endDate: date,
            payload: { startTime: startTime.toISOString(), endTime: endTime.toISOString(), hours: estimatedHours, legacyOvertimeId: record.id },
            reason,
            status: 'pending',
            currentLevel: 1,
            monthlyKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            configSnapshot: JSON.stringify({ levels: config.levels, rules: config.rules, configId }),
          },
        });
        workflowRequestId = workflowRequest.id;
        await initializeWorkflow(db, workflowRequest.id, emp.id, user.tenantId || null, config, {
          employeeId: emp.id,
          requestType: 'HOURLY_PERMISSION',
          startDate: date,
          endDate: date,
          gatePassType: '',
          hours: estimatedHours,
        });
      } catch (workflowError) {
        console.warn('[overtime-request] unified workflow bridge failed:', workflowError);
      }
    }

    if (status === 'approved') {
      await db.overtimeRecord.upsert({
        where: { employeeId_date: { employeeId: emp.id, date } },
        update: { hours: estimatedHours, reason, status: 'approved', approvedBy: 'ai_auto', approvedAt: new Date() },
        create: { employeeId: emp.id, date, hours: estimatedHours, rateType: 'HOURLY_RATE', rate: 0, amount: 0, reason, status: 'approved', approvedBy: 'ai_auto', approvedAt: new Date() },
      }).catch(() => null);
      const attendanceForOt = await db.attendance.findFirst({ where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd } }, select: { id: true, overtime: true } }).catch(() => null);
      if (attendanceForOt) await db.attendance.update({ where: { id: attendanceForOt.id }, data: { overtime: Math.round(Math.max(Number(attendanceForOt.overtime || 0), estimatedHours) * 100) / 100 } }).catch(() => null);
    }

    const manager = (emp as any).reportingManager;
    const managerName = manager ? `${manager.firstName || ''} ${manager.lastName || ''}`.trim() : '';
    const requestForNotification = {
      ...record,
      employee: { ...emp },
      source: onBehalfId && isAdminRole(user.role) ? 'hr_proxy' : 'employee',
      managerUserId: manager?.userId || null,
      managerEmail: manager?.email || null,
      managerName,
    };
    const submittedByName = `${user.name || ''}`.trim() || user.email;
    const origin = request.headers.get('origin') || undefined;
    if (status === 'approved') {
      await dispatchOvertimeEvent(db, user.tenantId || '', 'attendance.overtime.result', requestForNotification, submittedByName, 'AI auto-approval', comments, origin);
    } else if (requestForNotification.source === 'hr_proxy') {
      await dispatchOvertimeEvent(db, user.tenantId || '', 'attendance.overtime.submitted', requestForNotification, submittedByName, '', '', origin);
      await dispatchOvertimeEvent(db, user.tenantId || '', 'attendance.overtime.submission_confirmation', requestForNotification, submittedByName, '', '', origin);
    } else {
      await dispatchOvertimeEvent(db, user.tenantId || '', 'attendance.overtime.submission_confirmation', requestForNotification, submittedByName, '', '', origin);
      await dispatchOvertimeEvent(db, user.tenantId || '', 'attendance.overtime.submitted', requestForNotification, submittedByName, '', '', origin);
    }

    // If auto-approved AND payout preference is comp_off, auto-credit the comp-off
    if (decision.autoApproved && payoutPreference === 'comp_off') {
      try {
        const compOff = await db.compOffLeave.create({
          data: {
            employeeId: emp.id,
            earnedDate: date,
            hours: estimatedHours,
            source: 'overtime',
            sourceOvertimeRequestId: record.id,
            expiryDate: new Date(date.getTime() + 90 * 24 * 60 * 60 * 1000), // 90-day expiry
            status: 'active',
          },
        });
        await db.overtimeRequest.update({
          where: { id: record.id },
          data: { compOffCreditedId: compOff.id, compOffCreditedAt: new Date() },
        });
      } catch (e) {
        // Non-fatal — the OT is approved, comp-off crediting can be retried
        console.warn('[overtime-request] Comp-off crediting failed (non-fatal):', e);
      }
    }

    return ok({ overtimeRequest: record, autoApprovalDecision: decision }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
