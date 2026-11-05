/**
 * Pre-OT Approval API — REQ-OT-02, REQ-OT-03 (with Comp-Off conversion)
 * + REQ-AI-ATT-04: AI auto-approval engine integration
 *
 *  GET  /api/attendance/overtime-request
 *  POST /api/attendance/overtime-request
 *  PATCH /api/attendance/overtime-request/[id]   — approve/reject + optionally convert to comp-off
 */
import { requireUser, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { buildContext, evaluateOvertimeAutoApproval } from '@/lib/auto-approval-engine';
import { dispatchOvertimeEvent } from '@/lib/overtime-notify';
import { buildRequestContext, loadWorkflowConfig, initializeWorkflow } from '@/lib/attendance-workflow';
import { validateOvertimeRequest } from '@/lib/overtime-request-validation';

type OvertimeEmployee = {
  id: string;
  companyId: string | null;
  timezone: string | null;
  firstName: string | null;
  lastName: string | null;
  userId: string | null;
  reportingManager: {
    userId: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const where: Record<string, unknown> = {};
    if (!isAdminRole(user.role)) {
      const emp = await db.employee.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' } },
        select: { id: true },
      });
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
    let emp: OvertimeEmployee | null = null;
    const onBehalfId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (onBehalfId && isAdminRole(user.role)) {
      emp = await db.employee.findUnique({
        where: { id: onBehalfId },
        select: { id: true, companyId: true, timezone: true, firstName: true, lastName: true, userId: true, reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } },
      });
      if (!emp) return fail('Selected employee not found', 404);
    } else {
      if (onBehalfId && !isAdminRole(user.role)) {
        return fail('You can only submit overtime requests for yourself', 403);
      }
      emp = await db.employee.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' } },
        select: { id: true, companyId: true, timezone: true, firstName: true, lastName: true, userId: true, reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } },
      });
    }
    if (!emp) return fail('Employee record not found', 404);

    const validation = await validateOvertimeRequest(db, {
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      reason: body.reason,
      employee: emp,
    });
    if ('error' in validation) return fail(validation.error, validation.status);
    const { date, startTime, endTime, estimatedHours, dayStart, dayEnd } = validation.value;
    const reason = validation.value.reason;

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
        const context = await buildRequestContext(db, {
          employeeId: emp.id,
          requestType: 'HOURLY_PERMISSION',
          startDate: date,
          endDate: date,
          gatePassType: '',
          hours: estimatedHours,
        });
        await initializeWorkflow(db, workflowRequest.id, emp.id, user.tenantId || null, config, context);
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

    const manager = emp.reportingManager;
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
