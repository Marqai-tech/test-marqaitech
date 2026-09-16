/**
 * Attendance Regularization API — REQ-REG-01, REQ-REG-02, REQ-REG-03
 *
 *  GET  /api/attendance/regularize          — list (employee's own or all for admins)
 *  POST /api/attendance/regularize          — submit a missed-punch regularization
 *  PATCH /api/attendance/regularize/[id]    — approve / reject (manager or HR)
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { loadWorkflowConfig, buildRequestContext, checkRules } from '@/lib/attendance-workflow';
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
      const emp = await findEmployeeByEmail(user.email);
      if (!emp) return ok({ regularizations: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;

    const items = await db.attendanceRegularization.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok({ regularizations: items });
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
    // previously body.employeeId was silently IGNORED, so HR submissions
    // were recorded under the HR's own employee record.
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
        return fail('You can only submit regularization requests for yourself', 403);
      }
      emp = await findEmployeeByEmail(user.email, db);
    }
    if (!emp) return fail('Employee record not found. Please ensure your user account is linked to an employee record.', 404);

    const date = new Date(body.date as string);
    const punchType = body.punchType as string;
    const requestedTime = new Date(body.requestedTime as string);
    // ─── Whitespace-only reason guard (user report) ───
    // Validate the RAW input before sanitization: sanitize trims, but callers
    // that prefix the reason (e.g. "[HR] <reason>") would otherwise turn a
    // whitespace-only reason into a non-empty string.
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!rawReason || /^\s+$/.test(String(body.reason ?? ''))) {
      return fail('Reason is required and cannot be empty or whitespace-only', 422);
    }
    const reason = sanitizeMultiLineText(body.reason, 2000);
    if (!punchType || !['check_in', 'check_out'].includes(punchType)) return fail('Invalid punchType');
    if (!reason) return fail('Reason is required');

    // ─── Validate dates ───
    if (isNaN(date.getTime())) return fail('Invalid date format');
    if (isNaN(requestedTime.getTime())) return fail('Invalid requested time format');
    // Future-date guard: the server's UTC "today" lags behind the employee's
    // local day in timezones ahead of UTC (e.g. IST 00:00–05:30). The client
    // therefore sends its local date (clientToday) and either may vouch.
    const serverToday = new Date();
    serverToday.setUTCHours(0, 0, 0, 0);
    const clientTodayKey = typeof body.clientToday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.clientToday)
      ? body.clientToday
      : null;
    const dateKey = date.toISOString().slice(0, 10);
    const isFuture = date > serverToday && (!clientTodayKey || dateKey > clientTodayKey);
    if (isFuture) return fail('Cannot regularize a future date');
    if (requestedTime > new Date()) return fail('Requested time cannot be in the future');

    // ─── Duplicate request guard (user report) ───
    // Reject a second PENDING or APPROVED regularization for the same
    // employee + date + punch type. Rejected requests do NOT block resubmission.
    {
      const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const duplicate = await db.attendanceRegularization.findFirst({
        where: {
          employeeId: emp.id,
          punchType,
          status: { in: ['pending', 'approved'] },
          date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, status: true, punchType: true },
      });
      if (duplicate) {
        return fail(
          `A ${duplicate.status} regularization request for this date (${punchType === 'check_in' ? 'Check-In' : 'Check-Out'}) already exists. Duplicate requests are not allowed.`,
          409,
        );
      }
    }

    // REQ-REG-03: detect weekend/holiday
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;
    const holiday = await db.holiday.findFirst({
      where: { date, type: { in: ['public', 'company'] } },
    });
    const isHoliday = !!holiday;

    // ─── Unified Rule Engine enforcement ─────────────────────────────
    // Even though the legacy regularize endpoint writes to its own table
    // (AttendanceRegularization), it must honor the same submission-window
    // and monthly-cap rules configured in the unified AttendanceWorkflowConfig.
    // Rejecting here prevents data that would bypass policy from being created.
    try {
      const { config } = await loadWorkflowConfig(db, emp.companyId || null, 'REGULARIZATION');
      const ctx = await buildRequestContext(db, {
        employeeId: emp.id, requestType: 'REGULARIZATION',
        startDate: date, endDate: date, gatePassType: '', hours: 0,
      });
      const ruleCheck = checkRules(config.rules, ctx, { startDate: date, requestType: 'REGULARIZATION' });
      if (!ruleCheck.ok) return fail(ruleCheck.error!, 422);
    } catch (ruleErr) {
      console.warn('[regularize] rule engine check failed (non-fatal):', ruleErr);
      // Non-fatal — fall through to legacy creation if the rule engine itself errors.
    }

    // REQ-REG-02: AI suggestion based on historical data — find median check-in time
    let aiSuggestedTime: Date | null = null;
    let aiConfidence = 0;
    const historical = await db.attendance.findMany({
      where: { employeeId: emp.id, status: { in: ['present', 'late'] }, checkIn: { not: null } },
      orderBy: { date: 'desc' },
      take: 30,
      select: { checkIn: true },
    });
    if (punchType === 'check_in' && historical.length >= 3) {
      const hours = historical
        .map(h => h.checkIn ? new Date(h.checkIn).getHours() * 60 + new Date(h.checkIn).getMinutes() : null)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      const median = hours[Math.floor(hours.length / 2)];
      const suggested = new Date(requestedTime);
      suggested.setHours(Math.floor(median / 60), median % 60, 0, 0);
      aiSuggestedTime = suggested;
      aiConfidence = Math.min(1, historical.length / 30);
    }

    const record = await db.attendanceRegularization.create({
      data: {
        employeeId: emp.id,
        date,
        punchType,
        requestedTime,
        reason,
        aiSuggestedTime,
        aiConfidence,
        isWeekend,
        isHoliday,
        status: 'pending',
      },
    });
    return ok({ regularization: record }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
