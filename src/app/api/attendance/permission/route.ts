/**
 * Hourly Permission / Short-Leave API — REQ-PERM-01, REQ-PERM-02, REQ-AI-ATT-04
 *
 *  GET  /api/attendance/permission          — list (own or team)
 *  POST /api/attendance/permission          — submit a new hourly permission request
 *  PATCH /api/attendance/permission/[id]    — approve/reject (managers) OR auto-approve
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { loadWorkflowConfig, buildRequestContext, checkRules, initializeWorkflow } from '@/lib/attendance-workflow';
import { sanitizeMultiLineText } from '@/lib/sanitize';

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
      if (!emp) return ok({ permissions: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;
    if (q.date) where.date = new Date(q.date);

    const items = await db.hourlyPermission.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    });
    return ok({ permissions: items });
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
    // employee via body.employeeId. Everyone else is always themselves —
    // body.employeeId used to be silently IGNORED, so HR submissions were
    // recorded under the HR's own employee record.
    let emp: { id: string; companyId: string | null; firstName: string; lastName: string } | null = null;
    const onBehalfId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (onBehalfId && isAdminRole(user.role)) {
      emp = await db.employee.findUnique({
        where: { id: onBehalfId },
        select: { id: true, companyId: true, firstName: true, lastName: true },
      });
      if (!emp) return fail('Selected employee not found', 404);
    } else {
      if (onBehalfId && !isAdminRole(user.role)) {
        return fail('You can only submit permission requests for yourself', 403);
      }
      emp = await findEmployeeByEmail(user.email, db);
    }
    if (!emp) return fail('Employee record not found. Please ensure your user account is linked to an employee record.', 404);

    const date = new Date(body.date as string);
    const startTime = new Date(body.startTime as string);
    const endTime = new Date(body.endTime as string);
    const reason = sanitizeMultiLineText(body.reason, 2000);

    // ─── Validate inputs ───
    if (isNaN(date.getTime())) return fail('Invalid date format');
    if (isNaN(startTime.getTime())) return fail('Invalid start time format');
    if (isNaN(endTime.getTime())) return fail('Invalid end time format');
    if (!reason) return fail('Reason is required');
    if (startTime >= endTime) return fail('End time must be after start time');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return fail('Permission date cannot be in the past');

    // Calculate hours in increments of 15 min (REQ-PERM-01)
    const ms = endTime.getTime() - startTime.getTime();
    const rawHours = ms / (1000 * 60 * 60);
    const hours = Math.max(0.25, Math.round(rawHours * 4) / 4); // round to nearest 15 min
    if (hours > 8) return fail('Permission cannot exceed 8 hours — use a half-day leave instead');

    // A permission cannot be raised on an approved leave day, and requests for
    // the same employee/date may not duplicate or overlap in time.
    const dayStart = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const dayEnd = new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
    const approvedLeave = await db.leaveRequest.findFirst({
      where: { employeeId: emp.id, status: 'approved', startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
      select: { id: true },
    });
    if (approvedLeave) return fail('Permission cannot be requested on a date with approved leave.', 409);

    const conflicting = await db.hourlyPermission.findFirst({
      where: {
        employeeId: emp.id,
        date: { gte: dayStart, lte: dayEnd },
        status: { in: ['pending', 'approved'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true, startTime: true, endTime: true },
    });
    if (conflicting) return fail('A permission request already exists or overlaps this time range for the selected date.', 409);

    // ─── Unified Rule Engine enforcement ─────────────────────────────
    // Honor the unified AttendanceWorkflowConfig rules (monthly cap on
    // hourly permissions, geofencing/IP, auto-deduction threshold) even
    // when the legacy endpoint writes to its own HourlyPermission table.
    try {
      const { config } = await loadWorkflowConfig(db, emp.companyId || null, 'HOURLY_PERMISSION');
      const ctx = await buildRequestContext(db, {
        employeeId: emp.id, requestType: 'HOURLY_PERMISSION',
        startDate: date, endDate: date, gatePassType: '', hours,
      });
      const ruleCheck = checkRules(config.rules, ctx, { startDate: date, requestType: 'HOURLY_PERMISSION' });
      if (!ruleCheck.ok) return fail(ruleCheck.error!, 422);
    } catch (ruleErr) {
      console.warn('[permission] rule engine check failed (non-fatal):', ruleErr);
    }

    // REQ-PERM-02: compute adjusted check-out time (target hours = 8; permission extends required check-out)
    // The required check-out shifts by `hours` later in the day.
    const adjustedCheckOut = new Date(startTime);
    adjustedCheckOut.setHours(adjustedCheckOut.getHours() + 8 + Math.floor(hours));
    adjustedCheckOut.setMinutes(adjustedCheckOut.getMinutes() + Math.round((hours % 1) * 60));

    // REQ-AI-ATT-04: auto-approve if employee has >90% attendance AND permission ≤ threshold
    const config = await db.attendancePolicyConfig.findFirst();
    const autoMinutes = config?.autoApprovePermissionMinutes || 0;
    const minAttendancePct = config?.autoApproveMinAttendancePct || 90;

    let autoApproved = false;
    let status: 'pending' | 'approved' = 'pending';
    let approvedBy: string | null = null;
    let approvedAt: Date | null = null;

    if (autoMinutes > 0 && hours * 60 <= autoMinutes) {
      // Check last 30 days attendance percentage
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const records = await db.attendance.findMany({
        where: { employeeId: emp.id, date: { gte: since } },
        select: { status: true },
      });
      const present = records.filter(r => ['present', 'late'].includes(r.status)).length;
      const pct = records.length > 0 ? (present / records.length) * 100 : 0;
      if (pct >= minAttendancePct) {
        autoApproved = true;
        status = 'approved';
        approvedBy = 'ai_auto';
        approvedAt = new Date();
      }
    }

    const record = await db.hourlyPermission.create({
      data: {
        employeeId: emp.id,
        date,
        startTime,
        endTime,
        hours,
        reason,
        adjustedCheckOut,
        status,
        approvedBy,
        approvedAt,
        autoApproved,
      },
    });

    let workflowRequestId: string | null = null;

    // Bridge the legacy permission row into the unified Attendance Requests
    // workflow so the assigned manager/HR approver sees it in Approval Inbox.
    try {
      const { config, configId } = await loadWorkflowConfig(db, emp.companyId || null, 'HOURLY_PERMISSION', {
        employmentType: 'all', branchId: null, departmentId: null, employeeStatus: 'active',
      });
      const workflowRequest = await db.attendanceRequest.create({
        data: {
          companyId: emp.companyId || null,
          employeeId: emp.id,
          requestType: 'HOURLY_PERMISSION',
          subtype: null,
          startDate: date,
          endDate: date,
          payload: { startTime: startTime.toISOString(), endTime: endTime.toISOString(), hours, legacyPermissionId: record.id },
          reason,
          status: status === 'approved' ? 'approved' : 'pending',
          currentLevel: status === 'approved' ? 0 : 1,
          monthlyKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          configSnapshot: JSON.stringify({ levels: config.levels, rules: config.rules, configId }),
        },
      });
      workflowRequestId = workflowRequest.id;
      if (status !== 'approved') {
        await initializeWorkflow(db, workflowRequest.id, emp.id, user.tenantId || null, config, {
          employeeId: emp.id,
          requestType: 'HOURLY_PERMISSION',
          startDate: date,
          endDate: date,
          gatePassType: '',
          hours,
        });
      }
    } catch (workflowError) {
      console.warn('[permission] unified workflow bridge failed:', workflowError);
    }

    try {
      const scope = await (await import('@/lib/companyScope')).resolveCompanyScope(request);
      const employee = await db.employee.findUnique({ where: { id: emp.id }, select: { reportingManager: { select: { userId: true, email: true, firstName: true, lastName: true } } } });
      const manager = (employee as unknown as { reportingManager?: { userId?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null } | null })?.reportingManager;
      const managerUserId = manager?.userId || (manager?.email ? (await db.user.findFirst({ where: { email: { equals: manager.email, mode: 'insensitive' } }, select: { id: true } }))?.id : null);
      const recipient = managerUserId ? { userId: managerUserId } : manager?.email ? { name: `${manager.firstName} ${manager.lastName}`.trim(), email: manager.email } : null;
      if (scope?.tenantId && recipient) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        await dispatchNotification({
          tenantId: scope.tenantId,
          module: 'attendance',
          eventKey: 'attendance.request.submitted',
          recipients: [recipient],
          vars: { Employee_Name: `${emp.firstName} ${emp.lastName}`, Request_Type: 'Hourly Permission', Request_Date: date.toLocaleDateString('en-IN'), Reason: reason },
          entity: workflowRequestId
            ? { type: 'attendance_request', id: workflowRequestId, link: '/attendance/requests?scope=inbox' }
            : { type: 'hourly_permission', id: record.id, link: '/attendance/permission' },
        });
      }
    } catch (notificationError) { console.warn('[permission] manager notification failed:', notificationError); }
    return ok({ permission: record }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
