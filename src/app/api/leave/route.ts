import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { createNotification } from '@/lib/notifications';
import { buildContext, evaluateLeaveAutoApproval } from '@/lib/auto-approval-engine';
import { isServerLiveSite } from '@/lib/tenant-filter';
import { safeAuditLog } from '@/lib/audit-safe';
import { sanitizeMultiLineText } from '@/lib/sanitize';
import {
  computeWorkingDays,
  getHolidaysInRange,
  getWeekendDays,
  leaveDaysConsumed,
  todayInTimezone,
  toDayStr,
  WorkingDayWalk,
} from '@/lib/working-days';
import { syncAttendanceForLeave } from '@/lib/attendance-leave-sync';

/**
 * Deduct leave balance for an approved leave request.
 * Shared helper so every approval path (AI auto-approve, short-leave
 * auto-approve, manual PATCH approve) deducts the balance consistently.
 *
 * BUG FIX: the caller now passes the validated working-day count
 * (`days`) so weekends/holidays are never deducted from the balance.
 */
async function deductLeaveBalance(
  db: any,
  params: { employeeId: string; leaveTypeId: string; startDate: string | Date; endDate: string | Date; halfDay?: boolean | null; requestId?: string; days?: number },
): Promise<{ deducted: boolean; days: number; error?: string }> {
  const { employeeId, leaveTypeId, startDate, endDate, halfDay, requestId } = params;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const days = params.days !== undefined ? params.days : (halfDay ? 0.5 : daysDiff);
  const year = start.getFullYear();
  try {
    const result = await db.leaveBalance.updateMany({
      where: { employeeId, leaveTypeId, year },
      data: { used: { increment: days }, remaining: { decrement: days } },
    });
    if (result.count === 0) {
      console.warn(`[leave] No LeaveBalance row found for employee=${employeeId} leaveType=${leaveTypeId} year=${year} — balance not deducted (request ${requestId || 'n/a'})`);
      return { deducted: false, days, error: 'No LeaveBalance row found for this employee + leave type + year' };
    }
    return { deducted: true, days };
  } catch (e) {
    console.warn(`[leave] Balance deduction failed (non-fatal) for request ${requestId || 'n/a'}:`, e);
    return { deducted: false, days, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');
    const tenantId = searchParams.get('tenantId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    // When super_admin has NO company or tenant selected, getDb() returns
    // the platform DB which may contain seed/demo leave requests.
    if (scope.role === 'super_admin' && !scope.companyId && !tenantId && isServerLiveSite(request)) {
      return NextResponse.json(
        { leaveRequests: [], pagination: { page, limit, total: 0, totalPages: 0 } },
        { headers: corsHeaders() }
      );
    }

    const where: Record<string, unknown> = {};

    // ─── Task 66: view=self param overrides scope to 'self' for admins ───
    // When an admin clicks "My Leave Applications" in the sidebar, the URL
    // is /leave?view=self. The client passes view=self to the API. Here we
    // check for it and force the self-scope lookup even for admin roles,
    // so the admin sees only THEIR OWN leave applications (not all employees').
    const viewSelf = searchParams.get('view') === 'self';
    const effectiveScope = viewSelf ? 'self' : scope.scope;

    // ─── QA Dashboard fix: "Employees on Leave" metric ───
    // onLeaveToday=1 → count DISTINCT employees with an APPROVED leave record
    // covering today (startDate ≤ today ≤ endDate). The dashboard must reflect
    // Leave-module records (approved leaves count; cancelled/rejected don't),
    // and only "applicable" (currently employed) people — we count employees
    // whose status is active OR on_leave, excluding terminated/resigned/inactive.
    if (searchParams.get('onLeaveToday') === '1') {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      const todayWhere: Record<string, unknown> = {
        status: 'approved',
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
        employee: { status: { in: ['active', 'on_leave'] } },
      };
      if (effectiveScope === 'self') {
        const selfEmp = await db.employee.findFirst({ where: { userId: scope.userId }, select: { id: true } });
        todayWhere.employeeId = selfEmp?.id || 'none';
        delete todayWhere.employee;
      } else if (scope.companyId) {
        (todayWhere.employee as Record<string, unknown>).companyId = scope.companyId;
      }
      const rows = await db.leaveRequest.findMany({
        where: todayWhere,
        select: {
          employeeId: true,
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } },
        },
      });
      // De-duplicate (an employee may hold two approved records overlapping today)
      const seen = new Map<string, { id: string; firstName: string; lastName: string; employeeId: string; avatar: string | null }>();
      for (const r of rows) if (!seen.has(r.employeeId) && r.employee) seen.set(r.employeeId, r.employee);
      return NextResponse.json(
        {
          onLeaveToday: seen.size,
          employees: Array.from(seen.values()),
          pagination: { page: 1, limit: 0, total: seen.size, totalPages: 1 },
        },
        { headers: corsHeaders() }
      );
    }

    // ─── Company-scoped data visibility ───
    if (effectiveScope === 'self') {
      // Employees can only see their own leave requests
      const employee = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true },
      });
      if (employee) {
        // Bug fix: also show leave requests where THIS user is the assigned
        // workflow approver (currentApproverId = scope.userId). Previously a
        // reporting-manager-tier-1-approver (whose User.role is still 'employee')
        // could not see the leave requests pending their approval in their own
        // leave list — they only got the email, and the in-app leave module
        // page showed nothing actionable. Now we OR with currentApproverId so
        // approvers see: (their own leaves) + (leaves waiting on their approval).
        where.OR = [
          { employeeId: employee.id },
          { currentApproverId: scope.userId, status: 'pending' },
        ];
      } else {
        // No employee record — but they may still be a user-level approver
        // (e.g. tenant_admin/super_admin without an Employee row). Show only
        // leaves pending their approval as currentApproverId.
        where.currentApproverId = scope.userId;
        where.status = 'pending';
      }
    } else if (scope.companyId) {
      // Admin with a specific company selected via CompanySwitcher
      where.employee = { companyId: scope.companyId };
    }
    // scope === 'all' && no companyId → admin sees all companies

    // Apply additional filters on top of company scope
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    // Optional overlap filter for dashboards that only need leave covering a
    // selected day/month. This avoids downloading hundreds of old approvals.
    if (fromDate || toDate) {
      const isDateKey = (value: string | null): value is string => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if (!isDateKey(fromDate) || !isDateKey(toDate) || fromDate > toDate) {
        return NextResponse.json({ error: 'Invalid leave date range' }, { status: 400, headers: corsHeaders() });
      }
      const rangeStart = new Date(`${fromDate}T00:00:00.000+05:30`);
      const rangeEndExclusive = new Date(new Date(`${toDate}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
      where.startDate = { lt: rangeEndExclusive };
      where.endDate = { gte: rangeStart };
    }

    const [leaveRequests, total] = await Promise.all([
      db.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              avatar: true,
            },
          },
          leaveType: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.leaveRequest.count({ where }),
    ]);

    return NextResponse.json(
      {
        leaveRequests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get leave requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await request.json();
    const { employeeId, leaveTypeId, startDate, endDate, halfDay, halfDaySlot } = body;
    // Sanitize free-text fields to strip HTML/script content before persisting.
    const reason = sanitizeMultiLineText(body.reason, 2000);

    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, leaveTypeId, startDate, endDate' },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'Reason is required (min 3 characters). HTML/script tags are not allowed.' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── Company-scoped data visibility for POST ───
    // Verify the target employee belongs to the same company as the user
    const targetEmployee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, userId: true },
    });

    if (!targetEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Validate the leave type BEFORE the create — a stale UI id (or a
    // hardcoded fallback id from an old bundle) used to reach Prisma and die
    // as LeaveRequest_leaveTypeId_fkey → "Internal server error". Fail fast
    // with a clear message instead.
    const leaveType = await db.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { id: true, companyId: true, name: true, defaultDays: true, isPaid: true, code: true },
    });
    if (!leaveType) {
      return NextResponse.json(
        { error: 'Invalid leave type. Please refresh the page and pick a leave type again.' },
        { status: 400, headers: corsHeaders() }
      );
    }
    if (leaveType.companyId !== targetEmployee.companyId) {
      return NextResponse.json(
        { error: "The selected leave type does not belong to the employee's company." },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (scope.scope === 'self') {
      // Employees can only create leave requests for themselves
      if (targetEmployee.userId !== scope.userId) {
        return NextResponse.json(
          { error: 'You can only create leave requests for yourself' },
          { status: 403, headers: corsHeaders() }
        );
      }
    } else if (scope.companyId) {
      // Admin with specific company — employee must belong to that company
      if (targetEmployee.companyId !== scope.companyId) {
        return NextResponse.json(
          { error: 'Employee does not belong to the selected company' },
          { status: 403, headers: corsHeaders() }
        );
      }
    }
    // scope === 'all' && no companyId → admin can access any employee

    // REQ-LVE-04: AI Collaborative Leave Check — compute warning before persisting
    let aiCollaborativeWarning: string | null = null;
    try {
      const team = await db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, departmentId: true },
      });
      if (team?.departmentId) {
        const teamMembers = await db.employee.findMany({
          where: { departmentId: team.departmentId, id: { not: employeeId }, status: 'active' },
          select: { id: true },
        });
        if (teamMembers.length > 0) {
          const overlapping = await db.leaveRequest.findMany({
            where: {
              employeeId: { in: teamMembers.map(m => m.id) },
              status: { in: ['approved', 'pending'] },
              AND: [
                { startDate: { lte: new Date(endDate) } },
                { endDate: { gte: new Date(startDate) } },
              ],
            },
            include: { employee: { select: { id: true, firstName: true, lastName: true } } },
          });
          const uniqueOnLeave = new Map<string, string>();
          for (const lr of overlapping) {
            if (lr.employee) uniqueOnLeave.set(lr.employee.id, `${lr.employee.firstName} ${lr.employee.lastName}`);
          }
          const threshold = Math.max(1, Math.floor(teamMembers.length * 0.3));
          if (uniqueOnLeave.size >= threshold) {
            const names = Array.from(uniqueOnLeave.values()).slice(0, 5).join(', ');
            aiCollaborativeWarning = `Warning: ${uniqueOnLeave.size} other team member(s) are on leave during these dates (${names}${uniqueOnLeave.size > 5 ? ', ...' : ''}). Project delivery may be impacted.`;
          }
        }
      }
    } catch {
      // Non-fatal — leave request can still proceed without the AI warning
    }

    // ─── Duplicate / Weekend / Holiday validation ────────────────────
    // Bug fixes:
    //  (a) Duplicate: reject if the same employee already has a pending or
    //      approved leave request overlapping these dates.
    //  (b) Weekends: reject if ALL days in the range are weekends (likely
    //      a data-entry mistake — weekends are non-working days). If the
    //      range is a single weekend day, also reject. Multi-day ranges
    //      that include at least one working day are allowed.
    //  (c) Holidays: reject if the entire range falls on configured
    //      holidays (same logic as weekends).
    //
    // These are server-side hard blocks. The frontend also shows warnings,
    // but the server is the source of truth.

    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    if (parsedEnd < parsedStart) {
      return NextResponse.json({ error: 'End date cannot be before start date.' }, { status: 400, headers: corsHeaders() });
    }

    // ─── BUG FIX: reject leave requests for PAST dates ───────────────
    // Applies to BOTH employee self-service and HR apply-on-behalf (same
    // endpoint). "Today" is resolved in the tenant's timezone so a tenant
    // in e.g. Asia/Kolkata cannot apply for a date that has already passed
    // in their local calendar.
    //
    // BUG_061 fix: HR/admin roles (tenant_admin, admin, hr_admin,
    // super_admin) can apply for past dates when acting on behalf of an
    // employee — this supports authorized regularization and HR-assisted
    // requests per the Leave Module spec. Employees (self-service) are
    // still blocked from backdated applications.
    let tenantTz: string | null = null;
    try {
      const tenantRow = await db.tenant.findUnique({
        where: { id: scope.tenantId },
        select: { timezone: true },
      });
      tenantTz = tenantRow?.timezone || null;
    } catch { /* timezone lookup is best-effort */ }
    const todayStr = todayInTimezone(tenantTz);
    const startDayStr = toDayStr(parsedStart);
    const endDayStr = toDayStr(parsedEnd);
    const isPrivilegedRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(scope.role);
    if (!isPrivilegedRole) {
      if (startDayStr < todayStr) {
        return NextResponse.json({
          error: `Past dates are not allowed for leave applications. Please select a valid date. (Selected start: ${startDayStr}, today: ${todayStr}.)`,
          code: 'PAST_DATE_NOT_ALLOWED',
        }, { status: 400, headers: corsHeaders() });
      }
      if (endDayStr < todayStr) {
        return NextResponse.json({
          error: `Past dates are not allowed for leave applications. Please select a valid date. (Selected end: ${endDayStr}, today: ${todayStr}.)`,
          code: 'PAST_DATE_NOT_ALLOWED',
        }, { status: 400, headers: corsHeaders() });
      }
    }

    // (a) Duplicate overlap check (same employee)
    try {
      const existing = await db.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: ['pending', 'approved'] },
          AND: [
            { startDate: { lte: parsedEnd } },
            { endDate: { gte: parsedStart } },
          ],
        },
        select: { id: true, startDate: true, endDate: true, status: true },
      });
      if (existing) {
        return NextResponse.json({
          error: `Duplicate leave request: you already have a ${existing.status} leave request from ${new Date(existing.startDate).toLocaleDateString()} to ${new Date(existing.endDate).toLocaleDateString()} that overlaps with the selected dates.`,
        }, { status: 409, headers: corsHeaders() });
      }
    } catch (dupErr) {
      console.warn('[leave] Duplicate check failed (non-fatal):', dupErr);
    }

    // (b) + (c) Weekend + Holiday handling — BUG FIX:
    // Weekends (per tenant weekend configuration, default Sat+Sun) and
    // configured holidays are now EXCLUDED from the leave duration instead
    // of being counted. A range made up entirely of weekends/holidays is
    // still rejected. The computed working days drive the balance check,
    // the auto-approval engine, the balance deduction, and the attendance
    // sync below.
    const weekendDow = await getWeekendDays(db, scope.tenantId, targetEmployee.companyId);
    const holidaysInRange = await getHolidaysInRange(db, parsedStart, parsedEnd);
    const holidayDaySet = new Set(holidaysInRange.map(h => h.date));
    const walk: WorkingDayWalk = computeWorkingDays(parsedStart, parsedEnd, weekendDow, holidayDaySet);

    // Reject if there are NO working days in the range at all
    // (means the entire leave is on weekends + holidays — likely a mistake)
    if (walk.workingDays === 0) {
      const reasons: string[] = [];
      if (walk.weekendDates.length > 0) reasons.push(`${walk.weekendDates.length} weekend day(s)`);
      if (walk.holidayDates.length > 0) {
        const holidayNames = holidaysInRange
          .filter(h => walk.holidayDates.includes(h.date))
          .map(h => h.name)
          .slice(0, 3)
          .join(', ');
        reasons.push(`${walk.holidayDates.length} holiday(s)${holidayNames ? `: ${holidayNames}` : ''}`);
      }
      return NextResponse.json({
        error: `The selected date range contains only ${reasons.join(' and ')} — no working days. Weekends and holidays are excluded automatically, so leave cannot be applied for non-working days only. Please select a range that includes at least one working day.`,
      }, { status: 400, headers: corsHeaders() });
    }

    // If the range is a SINGLE day and it's a weekend or holiday, reject
    if (startDayStr === toDayStr(parsedEnd)) {
      if (walk.weekendDates.length > 0) {
        return NextResponse.json({
          error: 'The selected date is a weekend (non-working day). Leave cannot be applied for a single weekend day. Please choose a working day.',
        }, { status: 400, headers: corsHeaders() });
      }
      if (walk.holidayDates.length > 0) {
        const holidayName = holidaysInRange[0]?.name || 'a holiday';
        return NextResponse.json({
          error: `The selected date is ${holidayName} (a holiday). Leave cannot be applied for a single holiday. Please choose a working day.`,
        }, { status: 400, headers: corsHeaders() });
      }
    }

    // ─── BUG FIX: insufficient leave balance validation ─────────────
    // The requested (working) days must fit within the available balance
    // for this leave type. Unpaid / un-tracked types (no balance row AND
    // no configured quota) skip this check so LOP-style leave still works.
    //
    // BUG_062 fix (zero balance): explicit zero-balance check with a
    // distinct error message. LOP / unpaid leave types (isPaid=false on
    // the LeaveType) are exempt — they have no quota by design.
    //
    // BUG_063 fix (insufficient balance): error message now matches the
    // spec format: "Insufficient leave balance. Available balance: X days.
    // Requested leave: Y days."
    const requestedDays = leaveDaysConsumed(walk, halfDay);
    let availableDays: number | null = null;
    let balanceIsTracked = false;
    try {
      // 1. Try Prisma query for the current year's balance
      let balanceRow = await db.leaveBalance.findFirst({
        where: { employeeId, leaveTypeId, year: parsedStart.getUTCFullYear() },
        select: { remaining: true, total: true },
      }).catch((e: any) => {
        console.error('[leave] BUG_067: Prisma balance query failed:', e?.message || e);
        return null;
      });

      // 2. If Prisma failed (adapter issue), try raw SQL fallback
      if (!balanceRow) {
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT "remaining", "total" FROM "LeaveBalance"
             WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND "year" = $3
             LIMIT 1`,
            employeeId, leaveTypeId, parsedStart.getUTCFullYear(),
          );
          if (rows && rows.length > 0) {
            balanceRow = { remaining: Number(rows[0].remaining), total: Number(rows[0].total) };
            console.log('[leave] BUG_067: Raw SQL fallback succeeded — remaining:', balanceRow.remaining);
          }
        } catch (sqlErr: any) {
          console.error('[leave] BUG_067: Raw SQL balance query also failed:', sqlErr?.message);
        }
      }

      if (balanceRow) {
        balanceIsTracked = true;
        availableDays = balanceRow.remaining;
      } else if ((leaveType.defaultDays ?? 0) > 0) {
        // No balance row yet, but the type declares an annual quota —
        // mirror GET /api/leave/balance which synthesizes a balance from
        // defaultDays so the validation matches what the UI displays.
        balanceIsTracked = true;
        availableDays = leaveType.defaultDays;
      }

      // 3. BUG_067: subtract pending leave days to get EFFECTIVE balance
      // The UI shows remaining - pending = effective. If an employee has
      // 9 days remaining but 9 days of pending requests, effective = 0.
      if (balanceIsTracked && availableDays !== null && availableDays > 0) {
        try {
          const pendingRequests = await db.leaveRequest.findMany({
            where: {
              employeeId,
              leaveTypeId,
              status: 'pending',
              startDate: { gte: new Date(parsedStart.getUTCFullYear(), 0, 1) },
              endDate: { lte: new Date(parsedStart.getUTCFullYear(), 11, 31, 23, 59, 59) },
            },
            select: { startDate: true, endDate: true, halfDay: true },
          });
          let pendingDays = 0;
          for (const pr of pendingRequests) {
            const prWalk = computeWorkingDays(
              new Date(pr.startDate), new Date(pr.endDate),
              weekendDow, holidayDaySet,
            );
            pendingDays += leaveDaysConsumed(prWalk, pr.halfDay);
          }
          if (pendingDays > 0) {
            availableDays = Math.max(0, availableDays - pendingDays);
            console.log(`[leave] BUG_067: Effective balance after pending deduction: ${availableDays} (raw=${balanceRow?.remaining ?? leaveType.defaultDays}, pending=${pendingDays})`);
          }
        } catch (pendingErr: any) {
          console.warn('[leave] BUG_067: Pending deduction check failed (non-fatal):', pendingErr?.message);
        }
      }
    } catch (balErr) {
      console.error('[leave] Balance check failed (non-fatal):', balErr);
    }

    // BUG_062: determine if this is an unpaid / LOP leave type.
    // LeaveType.isPaid === false means it's Loss of Pay (unpaid) — no
    // balance quota applies, employees can apply even with zero balance.
    const isUnpaidLeaveType = (leaveType as any)?.isPaid === false;

    if (balanceIsTracked && !isUnpaidLeaveType) {
      if (availableDays === 0) {
        // Zero balance — distinct message per spec
        return NextResponse.json({
          error: `No leave balance available for the selected leave type ("${leaveType.name}"). Please choose an unpaid leave type (LOP) or contact HR to adjust your balance.`,
          code: 'ZERO_LEAVE_BALANCE',
        }, { status: 400, headers: corsHeaders() });
      }
      if (availableDays !== null && requestedDays > availableDays) {
        // Insufficient balance — exact spec message
        return NextResponse.json({
          error: `Insufficient leave balance. Available balance: ${availableDays} day(s). Requested leave: ${requestedDays} day(s).`,
          code: 'INSUFFICIENT_LEAVE_BALANCE',
          availableBalance: availableDays,
          requestedLeave: requestedDays,
          leaveTypeName: leaveType.name,
        }, { status: 400, headers: corsHeaders() });
      }
    }

    const leaveRequest = await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        halfDay: halfDay || false,
        halfDaySlot: halfDaySlot || null,
        aiCollaborativeWarning,
        status: 'pending',
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
        leaveType: true,
      },
    });

    // ─── REQ-AI-ATT-04: AI Auto-Approval for Leave ────────────────────────
    let autoApprovalApplied = false;
    let autoApprovalReason: string | null = null;
    try {
      const ctx = await buildContext(employeeId);
      // BUG FIX: use working days (weekends/holidays excluded) for the
      // auto-approval engine instead of raw calendar days.
      const decision = await evaluateLeaveAutoApproval(ctx, {
        leaveType: leaveRequest.leaveType?.code || leaveRequest.leaveType?.name || 'unknown',
        days: requestedDays,
        hasAttachment: false,
        isMedical: /sick|medical/i.test(leaveRequest.leaveType?.name || ''),
      });
      if (decision.autoApproved) {
        await db.leaveRequest.update({
          where: { id: leaveRequest.id },
          data: {
            status: 'approved',
            approvedBy: 'ai_auto',
            approvedAt: new Date(),
            comments: `AI auto-approved: ${decision.reason} (confidence ${(decision.confidence * 100).toFixed(0)}%)`,
          },
        });
        autoApprovalApplied = true;
        autoApprovalReason = decision.reason;

        // ─── Deduct leave balance on auto-approval ───
        // Bug fix: previously the balance was never deducted when the AI
        // auto-approved, so the employee's leave balance stayed unchanged
        // even though the leave was approved. Now deducts VALIDATED working
        // days only (weekends/holidays excluded).
        await deductLeaveBalance(db, {
          employeeId, leaveTypeId, startDate, endDate,
          halfDay: halfDay || false, requestId: leaveRequest.id,
          days: requestedDays,
        });

        // ─── Bug fix: reflect approved leave in Attendance ───
        await syncAttendanceForLeave(db, {
          employeeId, startDate, endDate,
          halfDay: halfDay || false,
          leaveRequestId: leaveRequest.id,
          leaveTypeName: leaveRequest.leaveType?.name,
          weekendDow,
        });

        // Audit log for the auto-approval (FK-safe: actor id may belong to
        // the platform DB while this write targets a tenant DB)
        await safeAuditLog(db, {
          userId: scope.userId,
          action: 'AI_AUTO_APPROVE_LEAVE',
          module: 'leave',
          details: `Leave request ${leaveRequest.id} auto-approved for employee ${employeeId}. Reason: ${decision.reason}. Confidence: ${decision.confidence}. Rules: ${decision.rulesEvaluated.join(', ')}`,
        });
      }
    } catch (e) {
      console.warn('[leave] Auto-approval evaluation failed (non-fatal):', e);
    }

    // ─── Dynamic Leave Approval Workflow ──────────────────────────────
    // Load the workflow config for this tenant + leave type, initialize
    // the multi-tier approval chain, and notify the first approver.
    //
    // If auto-approval was already applied (above), we skip the workflow
    // entirely — the request is already approved.
    let workflowResult: { currentApproverId: string | null; firstTier: number } | null = null;
    if (!autoApprovalApplied) {
      try {
        const { loadWorkflowConfig, initializeLeaveWorkflow } = await import('@/lib/leave-workflow');
        const { config: wfConfig, configId: wfConfigId } = await loadWorkflowConfig(
          db,
          scope.tenantId,
          leaveTypeId,
        );

        // Check if auto-approve short leave is enabled AND the leave is short enough
        // (BUG FIX: effectiveDays now uses validated working days)
        const effectiveDays = requestedDays;

        if (wfConfig.autoApproveShortLeave && effectiveDays <= (wfConfig.shortLeaveMaxDays || 1)) {
          // Auto-approve short leave (bypass workflow)
          await db.leaveRequest.update({
            where: { id: leaveRequest.id },
            data: {
              status: 'approved',
              approvedBy: 'ai_auto',
              approvedAt: new Date(),
              comments: `Auto-approved: short leave (${effectiveDays} day(s)) ≤ ${wfConfig.shortLeaveMaxDays} day threshold`,
            },
          });
          autoApprovalApplied = true;
          autoApprovalReason = `Short leave auto-approval (${effectiveDays} day(s))`;

          // ─── Deduct leave balance on short-leave auto-approval ───
          // Bug fix: same as AI auto-approval — balance was never deducted.
          await deductLeaveBalance(db, {
            employeeId, leaveTypeId, startDate, endDate,
            halfDay: halfDay || false, requestId: leaveRequest.id,
            days: requestedDays,
          });

          // ─── Bug fix: reflect approved leave in Attendance ───
          await syncAttendanceForLeave(db, {
            employeeId, startDate, endDate,
            halfDay: halfDay || false,
            leaveRequestId: leaveRequest.id,
            leaveTypeName: leaveRequest.leaveType?.name,
            weekendDow,
          });
        } else {
          // Initialize the multi-tier workflow
          workflowResult = await initializeLeaveWorkflow(
            db,
            leaveRequest.id,
            employeeId,
            scope.tenantId,
            wfConfig,
            wfConfigId,
            leaveRequest.leaveType?.name,
          );

          // Notify the first approver — multi-channel + actionable (Task 36)
          // (falls back to HR/admin role recipients when no specific approver resolves)
          {
            const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
            await dispatchLeaveEvent(db, scope.tenantId, 'leave.applied', leaveRequest, workflowResult.currentApproverId, null, request, workflowResult.currentApproverId ? [workflowResult.currentApproverId] : null).catch(() => { /* non-fatal */ });
          }
        }
      } catch (wfErr) {
        console.warn('[leave] Workflow initialization failed (non-fatal), falling back to legacy:', wfErr);
      }
    }

    // ─── REQ-ENG-04: Intelligent approval router ─────────────────────────
    // Only run the legacy router if the workflow was NOT initialized
    // (i.e., no workflow config exists, or it failed)
    let approvalRouting: { fallbackApplied: boolean; approverId: string | null; reason: string } | null = null;
    if (!autoApprovalApplied && !workflowResult) {
      try {
        const { resolveAndAuditApprover } = await import('@/lib/approval-router');
        const router = await resolveAndAuditApprover(
          employeeId,
          'leave',
          scope.userId || 'system',
          null,
          new Date(startDate),
        );
        approvalRouting = {
          fallbackApplied: router.fallbackApplied,
          approverId: router.approverId,
          reason: router.reason,
        };
        if (router.fallbackApplied && router.approverId) {
          // Notify the backup approver
          await createNotification({
            tenantId: scope.tenantId,
            userId: router.approverId,
            title: 'Leave Request — Auto-Routed to You (Backup Approver)',
            message: `Primary manager is on leave. ${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}'s ${leaveRequest.leaveType.name} leave request (${startDate} to ${endDate}) has been auto-routed to you for approval.`,
            type: 'workflow',
            category: 'leave',
            link: `/leave/${leaveRequest.id}`,
          }).catch(() => { /* non-fatal */ });
        }
      } catch (e) {
        console.warn('[leave] Approval router failed (non-fatal):', e);
      }
    }

    // Notify HR admins about the leave request (only if workflow wasn't set up
    // — if it was, the first approver was already notified above, and HR admins
    // will be notified when it's their tier's turn)
    if (!workflowResult) {
      const hrAdmins = await db.user.findMany({
        where: {
          tenantId: scope.tenantId,
          role: { in: ['super_admin', 'tenant_admin', 'admin'] },
        },
      });

      for (const admin of hrAdmins) {
        await createNotification({
          tenantId: scope.tenantId,
          userId: admin.id,
          title: 'New Leave Request',
          message: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} has submitted a ${leaveRequest.leaveType.name} leave request from ${startDate} to ${endDate}.`,
          type: 'workflow',
          category: 'leave',
          link: `/leave/${leaveRequest.id}`,
        });
      }
    }

    // FK-safe audit write — 2026-09-09: this used to be a bare auditLog.create
    // and violated AuditLog_userId_fkey when the token identity came from the
    // platform DB (e.g. demo 'demo-tenantadmin') while the write targeted the
    // tenant DB → the whole apply request 500'd AFTER the leave row was
    // created. Audit must never break the business operation.
    await safeAuditLog(db, {
      userId: scope.userId,
      action: 'CREATE_LEAVE_REQUEST',
      module: 'leave',
      details: `Created leave request for employee ${employeeId}`,
    });

    // ─── Task 65: notify the employee when HR applies leave on their behalf ───
    // If the submitter (scope.userId) is different from the employee's linked
    // user (targetEmployee.userId), this is a proxy leave application. The
    // employee must receive a notification with the leave details.
    if (targetEmployee.userId && targetEmployee.userId !== scope.userId) {
      try {
        await createNotification({
          tenantId: scope.tenantId,
          userId: targetEmployee.userId,
          title: 'Leave Applied on Your Behalf',
          message: `A ${leaveRequest.leaveType?.name || 'leave'} request has been submitted on your behalf by HR/Admin. Leave dates: ${new Date(leaveRequest.startDate).toLocaleDateString()} to ${new Date(leaveRequest.endDate).toLocaleDateString()}. Status: ${leaveRequest.status}. You can view the details in the Leave module.`,
          type: 'info',
          category: 'leave',
          link: `/leave/${leaveRequest.id}`,
        });
      } catch { /* non-critical */ }
    }

    // ─── BUG_064 fix: Email 1 — Leave Request Submitted → Employee ───
    // Per the Leave Module Notification Workflow spec, the employee must
    // receive a confirmation email with: Request ID, leave type, dates,
    // number of days, and status (Pending Approval). Previously only the
    // approver got an email — the employee got nothing.
    if (targetEmployee.userId) {
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        await dispatchLeaveEvent(
          db,
          scope.tenantId,
          'leave.submitted_confirmation',
          leaveRequest,
          null,                                  // no approver for this event
          null,                                  // no comments
          request,
          [targetEmployee.userId],               // recipient = the employee
          {
            Request_Id: leaveRequest.id,
            Status: leaveRequest.status === 'approved' ? 'Approved (auto)' : 'Pending Approval',
            Days_Requested: String(requestedDays),
          },
        );
      } catch (e) { /* non-critical — email failure must not break the request */ }
    }

    return NextResponse.json(
      {
        leaveRequest,
        days: requestedDays,
        weekendExcluded: walk.weekendDates.length,
        holidayExcluded: walk.holidayDates.length,
        autoApproval: autoApprovalApplied
          ? { applied: true, reason: autoApprovalReason }
          : { applied: false },
        approvalRouting,
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * DELETE /api/leave
 * Clears this tenant's leave applications, balances, and encashment rows.
 * Leave types and approval workflow settings stay.
 * Body: { "confirm": "clear-leave-sample" }
 */
export async function DELETE(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    if (!['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(scope.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });
    }
    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== 'clear-leave-sample') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400, headers: corsHeaders() });
    }

    const requests = await db.leaveRequest.findMany({ select: { id: true } });
    const requestIds = requests.map((r: { id: string }) => r.id);

    let approvalSteps = 0;
    let attachments = 0;
    if (requestIds.length > 0) {
      const steps = await db.leaveApprovalStep.deleteMany({ where: { leaveRequestId: { in: requestIds } } });
      approvalSteps = steps.count;
      try {
        const files = await db.leaveAttachment.deleteMany({ where: { leaveRequestId: { in: requestIds } } });
        attachments = files.count;
      } catch { /* table may be unused */ }
    }
    const leaveRequests = await db.leaveRequest.deleteMany({});
    const balances = await db.leaveBalance.deleteMany({});
    let encashment = 0;
    try {
      const enc = await db.leaveEncashmentRequest.deleteMany({});
      encashment = enc.count;
    } catch { /* table may be unused */ }

    return NextResponse.json(
      {
        cleared: true,
        leaveRequests: leaveRequests.count,
        approvalSteps,
        attachments,
        leaveBalances: balances.count,
        encashment,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Clear leave data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
