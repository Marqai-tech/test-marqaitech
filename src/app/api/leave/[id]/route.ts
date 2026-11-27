import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { createNotification } from '@/lib/notifications';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { safeAuditLog } from '@/lib/audit-safe';
import { sanitizeMultiLineText } from '@/lib/sanitize';
import { computeWorkingDays, getHolidaysInRange, getWeekendDays, leaveDaysConsumed } from '@/lib/working-days';
import { syncAttendanceForLeave } from '@/lib/attendance-leave-sync';
import { appendLedgerEntry, ensureLeaveLedgerTable, ensureLeaveModuleSchemaColumns } from '@/lib/leave-ledger';
import type { PrismaClient } from '@/generated/prisma/client';

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

/* ─── Hold / proposal helpers (proposedHoldDatesJson + holdComments are
   runtime ALTER TABLE columns, not in schema.prisma) ─── */

async function ensureHoldColumns(db: PrismaClient) {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "proposedHoldDatesJson" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "holdComments" TEXT`);
  } catch { /* non-fatal */ }
}

interface HoldInfo {
  startDate?: string;
  endDate?: string;
  proposedBy?: string | null;
  prevStatus?: string;
  note?: string | null;
  heldAt?: string;
  counterTo?: { startDate?: string; endDate?: string } | null;
  declinedAt?: string;
}

async function readHoldJson(db: PrismaClient, id: string): Promise<HoldInfo | null> {
  await ensureHoldColumns(db);
  try {
    const rows: Array<{ proposedHoldDatesJson: string | null; holdComments: string | null }> = await db.$queryRawUnsafe(
      `SELECT "proposedHoldDatesJson", "holdComments" FROM "LeaveRequest" WHERE id = $1 LIMIT 1`, id
    );
    const raw = rows?.[0]?.proposedHoldDatesJson;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function holdCommentsOf(leave: { comments?: string | null } | null): string | null {
  return (leave?.comments as string) || null;
}

/** Employee + current approver + tier approvers + HR/admins of the tenant. */
async function collectChainRecipients(
  db: PrismaClient, tenantId: string | null, employeeUserId: string | null,
  currentApproverId: string | null, leaveRequestId?: string,
): Promise<string[]> {
  const ids: string[] = [];
  const push = (v: string | null | undefined) => {
    if (v && !ids.includes(v)) ids.push(v);
  };
  push(employeeUserId);
  push(currentApproverId);
  // Everyone who has (or will) act in the multi-tier approval chain
  if (leaveRequestId) {
    try {
      const steps: Array<{ approverUserId: string | null }> = await db.$queryRawUnsafe(
        `SELECT DISTINCT "approverUserId" FROM "LeaveApprovalStep" WHERE "leaveRequestId" = $1 AND "approverUserId" IS NOT NULL LIMIT 20`,
        leaveRequestId,
      );
      for (const s of steps) push(s.approverUserId);
    } catch { /* table/column may not exist */ }
  }
  // HR / admins of the tenant
  try {
    const hrs = await db.user.findMany({
      where: { tenantId, role: { in: ['hr_admin', 'admin', 'tenant_admin', 'super_admin'] }, status: 'active' },
      select: { id: true }, take: 10,
    });
    for (const h of hrs) push(h.id);
  } catch { /* best-effort */ }
  return ids;
}

/**
 * BUG_264 fix: policy check for cancelling a leave whose period has ALREADY
 * ended. Returns an error message when the configured policy blocks the
 * cancellation, or null when it is allowed.
 *  - allowCancelAfterLeaveEnd=false → past leaves can never be cancelled.
 *  - cancelWithinDaysAfterLeaveEnd=N → only within N days after the leave end.
 * (Exported for unit tests — scripts/test-bugfixes.ts)
 */
export function pastLeaveCancellationError(
  endDate: Date | string,
  cfg: { allowCancelAfterLeaveEnd: boolean; cancelWithinDaysAfterLeaveEnd: number | null },
): string | null {
  try {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return null;
    const now = new Date();
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (endDay.getTime() >= today.getTime()) return null; // leave period not over yet
    if (!cfg.allowCancelAfterLeaveEnd) {
      return 'This leave period has already ended. Cancelling a leave after its period is disabled by the leave workflow configuration.';
    }
    const daysPast = Math.floor((today.getTime() - endDay.getTime()) / 86400000);
    const windowDays = Number(cfg.cancelWithinDaysAfterLeaveEnd);
    if (windowDays > 0 && daysPast > windowDays) {
      return `This leave ended ${daysPast} day(s) ago. Cancellation is only allowed within ${windowDays} day(s) after the leave end date (leave workflow configuration).`;
    }
    return null;
  } catch { return null; }
}

/** Remove no-punch attendance rows created by the leave sync for a range. */
async function removeLeaveAttendanceRows(
  db: PrismaClient, employeeId: string, startDate: Date | string, endDate: Date | string, leaveRequestId: string,
) {
  try {
    const rows: Array<{ id: string; checkIn: Date | null; checkOut: Date | null }> = await db.$queryRawUnsafe(
      `SELECT id, "checkIn", "checkOut" FROM "Attendance"
       WHERE "employeeId" = $1 AND date >= $2 AND date <= $3
         AND status IN ('on_leave','half_day') AND notes LIKE $4`,
      employeeId, new Date(startDate), new Date(endDate), `%${leaveRequestId}%`,
    );
    for (const r of rows) {
      if (r.checkIn || r.checkOut) continue; // never touch real punches
      await db.$executeRawUnsafe(`DELETE FROM "Attendance" WHERE id = $1`, r.id);
    }
  } catch { /* non-fatal */ }
}

/**
 * PATCH /api/leave/[id]
 *
 * Approve / reject / hold / propose-dates / cancel a leave request.
 *
 * Statuses & actions:
 *   approved | rejected | cancelled            — classic decisions
 *   on_hold                                    — approver holds a pending OR approved leave
 *                                                (body: { proposedHoldDates?: {startDate,endDate}, comments })
 *   release_hold                               — approver releases the hold → back to previous state
 *   accept_proposed_dates                      — EMPLOYEE accepts the approver-proposed dates
 *   counter_propose_dates                      — EMPLOYEE suggests different dates (body.proposedDates)
 *   apply_counter_dates                        — approver applies the employee's suggested dates
 *   decline_counter_dates                      — approver declines the employee's suggested dates
 *   withdrawn                                  — employee withdraws a pending/on_hold request
 *   cancel_requested                           — employee requests cancellation of an APPROVED leave
 *                                                (gated by workflow config allowCancelAfterApproval)
 *   decline_cancel_request                     — approver declines the cancellation; leave stays approved
 *
 * Workflow behavior:
 *   - If the leave request has a workflowStage (multi-tier workflow is active):
 *     • 'approved' → advance to the next tier. If this was the last tier,
 *       finalize (status='approved', deduct balance, notify employee).
 *       Otherwise, set workflowStage to the next tier and notify the next approver.
 *     • 'rejected' → reject at the current tier (status='rejected', stop workflow,
 *       notify employee).
 *   - If no workflowStage (legacy single-step):
 *     • 'approved' → finalize immediately (deduct balance, notify employee).
 *     • 'rejected' → reject immediately (notify employee).
 *   - 'cancelled' → pending = no balance change · approved/cancel_requested = balance restored.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;
    // Sanitize free-text comments to strip HTML/script content before persisting.
    const comments = sanitizeMultiLineText(body.comments, 2000);

    // QA Spec Section 5: 'on_hold' is a new status. The approver puts the
    // request on hold with proposed dates (body.proposedHoldDates) and an
    // optional comment. The employee is notified and can accept or withdraw.
    // QA Spec Section 7: 'withdrawn' is used when the employee withdraws a
    // pending request (no approval needed). 'cancel_requested' starts the
    // post-approval cancellation flow (needs approver sign-off).
    //
    // NEW (2026-12): hold/propose-dates/cancel-after-approval flows.
    const VALID_STATUSES = [
      'approved', 'rejected', 'cancelled', 'on_hold', 'withdrawn', 'cancel_requested',
      'release_hold', 'accept_proposed_dates', 'counter_propose_dates',
      'apply_counter_dates', 'decline_counter_dates', 'decline_cancel_request',
    ];
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Valid status is required: ${VALID_STATUSES.join(', ')}` },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Get the token + decoded user for workflow authorization checks
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    const userRole = decoded?.role as string || 'employee';
    const userId = decoded?.userId as string || scope.userId || '';

    // FIX (root-cause Bug A): `existingLeave` MUST be fetched BEFORE the
    // workflow-config flags block below — that block referenced
    // `existingLeave.leaveTypeId` before its declaration (TDZ ReferenceError,
    // silently swallowed by the catch), so allowApproverHold /
    // allowDateProposal / allowCancelAfterApproval never actually loaded
    // and their gates were dead code.
    const existingLeave = await db.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: { firstName: true, lastName: true, userId: true, companyId: true, employeeId: true },
        },
        leaveType: true,
      },
    });

    if (!existingLeave) {
      return NextResponse.json(
        { error: 'Leave request not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // ─── Workflow configuration flags (Hold · Propose dates · Cancel) ───
    let cfgFlags = {
      allowCancelAfterApproval: true,
      allowApproverHold: true,
      allowDateProposal: true,
      allowCancelAfterLeaveEnd: true,
      cancelWithinDaysAfterLeaveEnd: null as number | null,
    };
    if (scope.tenantId) {
      try {
        const { loadWorkflowConfig } = await import('@/lib/leave-workflow');
        const { config: _cfg } = await loadWorkflowConfig(db, scope.tenantId, existingLeave.leaveTypeId);
        cfgFlags = {
          allowCancelAfterApproval: _cfg.allowCancelAfterApproval !== false,
          allowApproverHold: _cfg.allowApproverHold !== false,
          allowDateProposal: _cfg.allowDateProposal !== false,
          allowCancelAfterLeaveEnd: _cfg.allowCancelAfterLeaveEnd !== false,
          cancelWithinDaysAfterLeaveEnd: _cfg.cancelWithinDaysAfterLeaveEnd ?? null,
        };
      } catch { /* defaults stay true */ }
    }

    // ─── Company-scoped data visibility for approval/rejection ───
    const EMPLOYEE_ALLOWED_STATUSES = ['cancelled', 'withdrawn', 'cancel_requested', 'accept_proposed_dates', 'counter_propose_dates'];
    if (scope.scope === 'self') {
      // Employees can only act on their own leave requests (cancel / withdraw /
      // cancel-after-approval / respond to proposed dates)
      if (!EMPLOYEE_ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: 'Only admins can approve, reject or hold leave requests' },
          { status: 403, headers: corsHeaders() }
        );
      }
      // For cancellation, verify it's their own request
      const employee = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true },
      });
      if (!employee || employee.id !== existingLeave.employeeId) {
        return NextResponse.json(
          { error: 'You can only cancel your own leave requests' },
          { status: 403, headers: corsHeaders() }
        );
      }
    } else if (scope.companyId) {
      // Admin with specific company — leave request's employee must belong to that company
      if (existingLeave.employee.companyId !== scope.companyId) {
        return NextResponse.json(
          { error: 'Leave request does not belong to the selected company' },
          { status: 403, headers: corsHeaders() }
        );
      }
    }
    // scope === 'all' && no companyId → admin can approve/reject any leave request

    // ─── Status-transition matrix ───
    // Which target statuses are legal from which current status.
    const TRANSITIONS: Record<string, string[]> = {
      approved: ['pending'],
      rejected: ['pending'],
      cancelled: ['pending', 'approved', 'on_hold', 'cancel_requested'],
      // BUG_265 fix: 'on_hold' is now legal FROM 'on_hold' — HR can propose
      // (or update) dates directly on an already-held request without
      // releasing it first. Release stays an optional, separate action.
      on_hold: ['pending', 'approved', 'on_hold'],
      withdrawn: ['pending', 'on_hold'],
      cancel_requested: ['approved'],
      release_hold: ['on_hold'],
      accept_proposed_dates: ['on_hold'],
      counter_propose_dates: ['on_hold'],
      apply_counter_dates: ['on_hold'],
      decline_counter_dates: ['on_hold'],
      decline_cancel_request: ['cancel_requested'],
    };
    const fromStatuses = TRANSITIONS[status];
    if (!fromStatuses || !fromStatuses.includes(existingLeave.status)) {
      return NextResponse.json(
        { error: `Cannot apply "${status}" to a leave that is currently "${existingLeave.status}"` },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── On Hold (approver action) ──────────────────────────────────────
    // Approver puts a PENDING or APPROVED leave on hold. Status = 'on_hold'.
    // The hold payload (prevStatus + optional proposed dates + reason) is
    // stored in proposedHoldDatesJson. Balance stays reserved (we don't
    // release it — the employee can't over-apply while on hold). Employee +
    // everyone in the approval chain are notified. Gated by config
    // allowApproverHold (hold) and allowDateProposal (proposed dates).
    if (status === 'on_hold') {
      if (!cfgFlags.allowApproverHold) {
        return NextResponse.json({ error: 'Holding leaves is disabled by the leave workflow configuration' }, { status: 403, headers: corsHeaders() });
      }
      const proposedHoldDates = body.proposedHoldDates || null; // { startDate, endDate } or null
      if (proposedHoldDates && (!proposedHoldDates.startDate || !proposedHoldDates.endDate)) {
        return NextResponse.json({ error: 'proposedHoldDates must include startDate and endDate' }, { status: 400, headers: corsHeaders() });
      }
      if (proposedHoldDates && !cfgFlags.allowDateProposal) {
        return NextResponse.json({ error: 'Proposing new dates is disabled by the leave workflow configuration' }, { status: 403, headers: corsHeaders() });
      }
      // BUG_265 fix: when the leave is ALREADY on hold, preserve the
      // ORIGINAL prevStatus from the existing hold JSON (never overwrite it
      // with 'on_hold') so Release/Accept still restore the right state.
      const existingHoldInfo = existingLeave.status === 'on_hold' ? await readHoldJson(db, id) : null;
      const holdPrevStatus = existingHoldInfo?.prevStatus === 'approved' ? 'approved' : 'pending';

      // BUG_261 fix: proposed dates are validated against the employee's
      // AVAILABLE balance (working days, holiday-aware). A proposal longer
      // than the remaining balance is rejected with a clear message
      // (unpaid/LOP types are exempt — they have no quota by design).
      if (proposedHoldDates && (existingLeave.leaveType as any)?.isPaid !== false) {
        try {
          let holdWeekendDow: number[] | undefined;
          try { holdWeekendDow = await getWeekendDays(db, scope.tenantId, existingLeave.employee.companyId); } catch { /* default */ }
          const propHolidays = await getHolidaysInRange(db, new Date(proposedHoldDates.startDate), new Date(proposedHoldDates.endDate));
          const propWalk = computeWorkingDays(new Date(proposedHoldDates.startDate), new Date(proposedHoldDates.endDate), holdWeekendDow, new Set(propHolidays.map(h => h.date)));
          const propDays = leaveDaysConsumed(propWalk, existingLeave.halfDay);
          // Available balance for the proposed range's year. If the hold was
          // applied to an APPROVED leave, the ORIGINAL range's days are
          // already deducted and will be credited back when the dates
          // change — so they count towards what the new range may use.
          let holdAvailable: number | null = null;
          let holdTracked = false;
          const holdBalanceRow = await db.leaveBalance.findFirst({
            where: { employeeId: existingLeave.employeeId, leaveTypeId: existingLeave.leaveTypeId, year: new Date(proposedHoldDates.startDate).getUTCFullYear() },
            select: { remaining: true },
          }).catch(() => null);
          if (holdBalanceRow) { holdTracked = true; holdAvailable = holdBalanceRow.remaining; }
          else if (((existingLeave.leaveType as any)?.defaultDays ?? 0) > 0) { holdTracked = true; holdAvailable = Number((existingLeave.leaveType as any).defaultDays); }
          if (holdTracked && holdAvailable !== null) {
            if (holdPrevStatus === 'approved') {
              const oldHoldDays = existingLeave.chargeableDays ?? (existingLeave.halfDay
                ? 0.5
                : Math.ceil((new Date(existingLeave.endDate).getTime() - new Date(existingLeave.startDate).getTime()) / 86400000) + 1);
              holdAvailable = holdAvailable + Math.abs(oldHoldDays);
            }
            if (propDays > holdAvailable) {
              return NextResponse.json({
                error: `Cannot propose these dates: they need ${propDays} day(s) but the available balance for "${existingLeave.leaveType?.name || 'this leave type'}" is ${holdAvailable} day(s).`,
                code: 'INSUFFICIENT_LEAVE_BALANCE',
                availableBalance: holdAvailable,
                proposedDays: propDays,
              }, { status: 400, headers: corsHeaders() });
            }
          }
        } catch (holdBalErr) {
          console.warn('[leave hold] Proposed-dates balance validation failed (non-fatal):', holdBalErr);
        }
      }

      await ensureHoldColumns(db);
      const holdPayload = {
        ...(proposedHoldDates ? { startDate: proposedHoldDates.startDate, endDate: proposedHoldDates.endDate } : {}),
        proposedBy: proposedHoldDates ? 'approver' : null,
        prevStatus: holdPrevStatus, // ORIGINAL 'pending' | 'approved' — restored on release/accept
        note: comments || existingHoldInfo?.note || null,
        heldAt: existingHoldInfo?.heldAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = $1, "holdComments" = $2 WHERE "id" = $3`,
        JSON.stringify(holdPayload), comments || null, id
      ).catch(() => null);

      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'on_hold', comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      const proposedTxt = proposedHoldDates ? ` Proposed dates: ${String(proposedHoldDates.startDate).split('T')[0]} → ${String(proposedHoldDates.endDate).split('T')[0]}.` : '';

      // Notify employee (in-app) + employee + approval chain + HR (multi-channel)
      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): createNotification takes ONE params object
          // ({ tenantId, userId, title, message, ... }). The old (db, params)
          // form passed the Prisma client as params so tenantId/userId/title
          // were undefined — EVERY in-app leave notification silently failed.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Leave request put on hold',
            message: `Your ${leaveRequest.leaveType?.name || 'leave'} request has been put on hold.${proposedTxt}${comments ? ` Reason: ${comments}` : ''}`,
            type: 'warning',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        const chainIds = await collectChainRecipients(db, scope.tenantId, leaveRequest?.employee?.userId || null, existingLeave.currentApproverId, id);
        await dispatchLeaveEvent(
          db, scope.tenantId,
          proposedHoldDates ? 'leave.dates_proposed' : 'leave.held',
          leaveRequest, scope.userId, comments, request, chainIds,
          {
            Hold_Reason: comments || '—',
            Proposed_From: proposedHoldDates ? String(proposedHoldDates.startDate).split('T')[0] : '',
            Proposed_To: proposedHoldDates ? String(proposedHoldDates.endDate).split('T')[0] : '',
            Proposed_Dates: proposedTxt,
          },
        );
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, leaveRequest }, { headers: corsHeaders() });
    }

    // ─── Release hold (approver action) ─────────────────────────────────
    // The hold is released: the leave returns to its previous state
    // (pending → back in the approval queue; approved → re-approved with
    // attendance re-synced). Employee + chain are notified.
    if (status === 'release_hold') {
      const hold = await readHoldJson(db, id);
      const prevStatus = hold?.prevStatus === 'approved' ? 'approved' : 'pending';
      await ensureHoldColumns(db);
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = NULL WHERE "id" = $1`, id
      ).catch(() => null);

      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: prevStatus, comments: comments || existingLeave.comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true, companyId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      // If it returns to APPROVED, re-sync attendance for the (original) range.
      if (prevStatus === 'approved') {
        let weekendDow: number[] | undefined;
        try { weekendDow = await getWeekendDays(db, scope.tenantId, existingLeave.employee.companyId); } catch { /* default */ }
        await syncAttendanceForLeave(db, {
          employeeId: existingLeave.employeeId,
          startDate: existingLeave.startDate,
          endDate: existingLeave.endDate,
          halfDay: existingLeave.halfDay,
          leaveRequestId: id,
          leaveTypeName: existingLeave.leaveType?.name,
          weekendDow,
        });
      }

      // Notify employee + chain
      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Leave hold released',
            message: `The hold on your ${leaveRequest.leaveType?.name || 'leave'} request has been released. Status: ${prevStatus}.${comments ? ` Comment: ${comments}` : ''}`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        const chainIds = await collectChainRecipients(db, scope.tenantId, leaveRequest?.employee?.userId || null, existingLeave.currentApproverId, id);
        await dispatchLeaveEvent(db, scope.tenantId, 'leave.hold_released', leaveRequest, scope.userId, comments, request, chainIds);
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, leaveRequest, message: `Hold released — leave is ${prevStatus}` }, { headers: corsHeaders() });
    }

    // ─── Accept proposed dates (employee action) / Apply counter dates (approver action) ───
    // The held leave moves to the proposed date range. If it was previously
    // APPROVED, the balance is re-computed (reverse old range, charge new
    // range) and attendance is re-synced. If it was PENDING, it re-enters
    // the approval queue with the new dates.
    if (status === 'accept_proposed_dates' || status === 'apply_counter_dates') {
      if (!cfgFlags.allowDateProposal) {
        return NextResponse.json({ error: 'The date proposal flow is disabled by the leave workflow configuration' }, { status: 403, headers: corsHeaders() });
      }
      const hold = await readHoldJson(db, id);
      const proposedBy = hold?.proposedBy || 'approver'; // legacy rows (no proposedBy) are approver proposals
      const expectedBy = status === 'apply_counter_dates' ? 'employee' : 'approver';
      if (!hold?.startDate || !hold?.endDate) {
        return NextResponse.json({ error: 'No proposed dates found on this hold' }, { status: 400, headers: corsHeaders() });
      }
      if (proposedBy !== expectedBy) {
        return NextResponse.json({ error: `These dates were proposed by the ${proposedBy}. Only ${expectedBy === 'employee' ? 'the employee' : 'the approver'} can apply them.` }, { status: 400, headers: corsHeaders() });
      }

      const prevStatus = hold.prevStatus === 'approved' ? 'approved' : 'pending';
      const oldStart = existingLeave.startDate;
      const oldEnd = existingLeave.endDate;
      const datesChanged = String(oldStart).split('T')[0] !== String(hold.startDate).split('T')[0]
        || String(oldEnd).split('T')[0] !== String(hold.endDate).split('T')[0];

      // Compute working days for the NEW range (sandwich/holiday-aware)
      let newDays = existingLeave.halfDay ? 0.5 : null;
      let weekendDow: number[] | undefined;
      try { weekendDow = await getWeekendDays(db, scope.tenantId, existingLeave.employee.companyId); } catch { /* default */ }
      try {
        const holidays = await getHolidaysInRange(db, new Date(hold.startDate), new Date(hold.endDate));
        const walk = computeWorkingDays(new Date(hold.startDate), new Date(hold.endDate), weekendDow, new Set(holidays.map(h => h.date)));
        newDays = leaveDaysConsumed(walk, existingLeave.halfDay);
      } catch { /* fall back to calendar days below */ }
      if (newDays == null) {
        newDays = Math.ceil((new Date(hold.endDate).getTime() - new Date(hold.startDate).getTime()) / 86400000) + 1;
      }

      // BUG_261 fix (accept side): the NEW range is validated against the
      // employee's available balance BEFORE anything is mutated. If the hold
      // was applied to an APPROVED leave, the original range's days are
      // already deducted and will be credited back — they count towards what
      // the new range may use. Unpaid/LOP types are exempt.
      if ((existingLeave.leaveType as any)?.isPaid !== false) {
        try {
          let acceptAvailable: number | null = null;
          let acceptTracked = false;
          const acceptBalanceRow = await db.leaveBalance.findFirst({
            where: { employeeId: existingLeave.employeeId, leaveTypeId: existingLeave.leaveTypeId, year: new Date(hold.startDate).getUTCFullYear() },
            select: { remaining: true },
          }).catch(() => null);
          if (acceptBalanceRow) { acceptTracked = true; acceptAvailable = acceptBalanceRow.remaining; }
          else if (((existingLeave.leaveType as any)?.defaultDays ?? 0) > 0) { acceptTracked = true; acceptAvailable = Number((existingLeave.leaveType as any).defaultDays); }
          if (acceptTracked && acceptAvailable !== null) {
            if (prevStatus === 'approved') {
              const oldAcceptDays = existingLeave.chargeableDays ?? (existingLeave.halfDay
                ? 0.5
                : Math.ceil((new Date(oldEnd).getTime() - new Date(oldStart).getTime()) / 86400000) + 1);
              acceptAvailable = acceptAvailable + Math.abs(oldAcceptDays);
            }
            if (newDays > acceptAvailable) {
              return NextResponse.json({
                error: `Cannot apply these dates: they need ${newDays} day(s) but the available balance for "${existingLeave.leaveType?.name || 'this leave type'}" is ${acceptAvailable} day(s).`,
                code: 'INSUFFICIENT_LEAVE_BALANCE',
                availableBalance: acceptAvailable,
                requestedDays: newDays,
              }, { status: 400, headers: corsHeaders() });
            }
          }
        } catch (acceptBalErr) {
          console.warn('[leave accept] Balance validation failed (non-fatal):', acceptBalErr);
        }
      }

      await ensureHoldColumns(db);
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = NULL WHERE "id" = $1`, id
      ).catch(() => null);

      // BUG_262 fix: ACCEPTING proposed dates must NOT bypass the approval
      // workflow. If the held leave was previously APPROVED and the dates
      // changed, the request re-enters the configured approval workflow as
      // 'pending' (workflow stage reset so it re-initializes from tier 1 on
      // the next approval). A leave that was PENDING before the hold stays
      // pending at its current tier — an explicit product-owner rule would
      // be needed to let an HR proposal count as approval.
      const rerouteToWorkflow = prevStatus === 'approved' && datesChanged;
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: {
          startDate: new Date(hold.startDate),
          endDate: new Date(hold.endDate),
          status: rerouteToWorkflow ? 'pending' : prevStatus,
          ...(prevStatus === 'approved' && !rerouteToWorkflow ? { chargeableDays: newDays } : {}),
          comments: comments || existingLeave.comments,
        },
        include: { employee: { select: { firstName: true, lastName: true, userId: true, companyId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      // Reset the workflow stage so the next approval re-initializes the
      // configured tier chain (raw SQL — runtime columns).
      if (rerouteToWorkflow) {
        try {
          await db.$executeRawUnsafe(
            `UPDATE "LeaveRequest" SET "workflowStage" = NULL, "currentApproverId" = NULL WHERE "id" = $1`, id
          );
        } catch { /* column may not exist on legacy DBs */ }
      }

      if (rerouteToWorkflow) {
        // Balance: credit the OLD range back. The NEW range is charged when
        // the re-entered approval workflow finalizes (BUG_262 — the request
        // goes back through the approval chain instead of being self-approved).
        try {
          let oldDays = existingLeave.chargeableDays ?? (existingLeave.halfDay
            ? 0.5
            : Math.ceil((new Date(oldEnd).getTime() - new Date(oldStart).getTime()) / 86400000) + 1);
          try {
            const holidaysOld = await getHolidaysInRange(db, new Date(oldStart), new Date(oldEnd));
            const walkOld = computeWorkingDays(new Date(oldStart), new Date(oldEnd), weekendDow, new Set(holidaysOld.map(h => h.date)));
            oldDays = leaveDaysConsumed(walkOld, existingLeave.halfDay);
          } catch { /* keep fallback oldDays */ }
          await appendLedgerEntry(db, {
            employeeId: existingLeave.employeeId, leaveTypeId: existingLeave.leaveTypeId,
            year: new Date(oldStart).getFullYear(), transactionType: 'reverse', days: Math.abs(oldDays),
            sourceType: 'leave_request', sourceId: id,
            reason: `Hold resolved — original range credited back (${oldDays} day(s))`,
            createdBy: scope.userId, leaveRequestId: id,
          });
        } catch (balErr) {
          console.warn('[leave] Balance re-computation on date change failed (non-fatal):', balErr);
        }
        // Attendance: clean the old range — the new range is synced again on
        // final approval (never before sign-off).
        await removeLeaveAttendanceRows(db, existingLeave.employeeId, oldStart, oldEnd, id);
      }

      // Notify employee + approver chain — everyone in the flow
      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Leave dates confirmed',
            message: rerouteToWorkflow
              ? `Your ${leaveRequest.leaveType?.name || 'leave'} has been moved to ${String(hold.startDate).split('T')[0]} → ${String(hold.endDate).split('T')[0]}. The request has re-entered the approval workflow.`
              : `Your ${leaveRequest.leaveType?.name || 'leave'} has been moved to ${String(hold.startDate).split('T')[0]} → ${String(hold.endDate).split('T')[0]}. Status: ${prevStatus}.`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        const chainIds = await collectChainRecipients(db, scope.tenantId, leaveRequest?.employee?.userId || null, existingLeave.currentApproverId, id);
        await dispatchLeaveEvent(db, scope.tenantId, 'leave.dates_accepted', leaveRequest, scope.userId, comments, request, chainIds, {
          Proposed_From: String(hold.startDate).split('T')[0],
          Proposed_To: String(hold.endDate).split('T')[0],
        });
        // BUG_262 fix: make the request ACTIONABLE again — after acceptance
        // the request follows the configured approval workflow, so the
        // current approver receives an approval request (not just an
        // informational note).
        if (rerouteToWorkflow && existingLeave.currentApproverId) {
          await dispatchLeaveEvent(db, scope.tenantId, 'leave.applied', leaveRequest, existingLeave.currentApproverId, comments, request, [existingLeave.currentApproverId]).catch(() => null);
        }
      } catch { /* non-fatal */ }
      return NextResponse.json({
        success: true, leaveRequest,
        message: rerouteToWorkflow
          ? `Dates updated — the request has re-entered the approval workflow (${status === 'accept_proposed_dates' ? 'accepted by employee' : 'applied by approver'})`
          : `Dates updated — leave is ${prevStatus}${status === 'accept_proposed_dates' ? ' (accepted by employee)' : ' (applied by approver)'}`,
      }, { headers: corsHeaders() });
    }

    // ─── Counter-propose dates (employee action) ────────────────────────
    // The employee suggests different dates while the leave is on hold.
    // The suggestion is stored (proposedBy: 'employee') and the approver
    // chain is notified to apply or decline it.
    if (status === 'counter_propose_dates') {
      if (!cfgFlags.allowDateProposal) {
        return NextResponse.json({ error: 'The date proposal flow is disabled by the leave workflow configuration' }, { status: 403, headers: corsHeaders() });
      }
      const proposedDates = body.proposedDates || null; // { startDate, endDate }
      if (!proposedDates?.startDate || !proposedDates?.endDate) {
        return NextResponse.json({ error: 'proposedDates { startDate, endDate } are required' }, { status: 400, headers: corsHeaders() });
      }
      const hold = await readHoldJson(db, id);
      const payload = {
        startDate: proposedDates.startDate,
        endDate: proposedDates.endDate,
        proposedBy: 'employee',
        prevStatus: hold?.prevStatus || 'pending',
        note: comments || null,
        counterTo: hold?.startDate ? { startDate: hold.startDate, endDate: hold.endDate } : null,
        updatedAt: new Date().toISOString(),
      };
      await ensureHoldColumns(db);
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = $1, "holdComments" = $2 WHERE "id" = $3`,
        JSON.stringify(payload), comments || holdCommentsOf(existingLeave) || null, id
      ).catch(() => null);

      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { comments: comments || undefined },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      // Notify the approver chain (action needed) + confirm to the employee
      const empName3 = `${leaveRequest?.employee?.firstName || ''} ${leaveRequest?.employee?.lastName || ''}`.trim() || 'An employee';
      const approverIds = await collectChainRecipients(db, scope.tenantId, null, existingLeave.currentApproverId, id);
      for (const uid of approverIds) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: uid,
            title: 'Employee suggested different dates',
            message: `${empName3} suggested ${String(proposedDates.startDate).split('T')[0]} → ${String(proposedDates.endDate).split('T')[0]} for their held ${leaveRequest.leaveType?.name || 'leave'}.${comments ? ` Note: ${comments}` : ''}`,
            type: 'warning',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Date suggestion sent',
            message: `Your suggested dates were sent to the approver for review.`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        await dispatchLeaveEvent(db, scope.tenantId, 'leave.dates_counter_proposed', leaveRequest, scope.userId, comments, request, approverIds, {
          Proposed_From: String(proposedDates.startDate).split('T')[0],
          Proposed_To: String(proposedDates.endDate).split('T')[0],
        });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, leaveRequest, message: 'Suggested dates sent to the approver' }, { headers: corsHeaders() });
    }

    // ─── Decline counter-proposed dates (approver action) ───────────────
    // The approver declines the employee's suggestion. The leave STAYS on
    // hold (the approver can propose other dates or release the hold).
    if (status === 'decline_counter_dates') {
      const hold = await readHoldJson(db, id);
      await ensureHoldColumns(db);
      // Keep the hold state (prevStatus) but clear the employee's suggestion
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = $1 WHERE "id" = $2`,
        JSON.stringify({ prevStatus: hold?.prevStatus || 'pending', declinedAt: new Date().toISOString() }), id
      ).catch(() => null);

      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { comments: comments || existingLeave.comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Date suggestion declined',
            message: `The approver declined your suggested dates. Your ${leaveRequest.leaveType?.name || 'leave'} is still on hold.${comments ? ` Comment: ${comments}` : ''}`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
        try {
          const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
          await dispatchLeaveEvent(db, scope.tenantId, 'leave.dates_counter_declined', leaveRequest, scope.userId, comments, request, [leaveRequest.employee.userId]);
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ success: true, leaveRequest, message: 'Suggested dates declined — leave remains on hold' }, { headers: corsHeaders() });
    }

    // ─── Withdraw (employee self-service) ───────────────────────────────
    // Employee withdraws a pending/on_hold request. No approval needed.
    // Balance is released. The approval chain is notified.
    if (status === 'withdrawn') {
      // BUG_263 fix: an ON_HOLD leave whose original state was APPROVED has
      // its balance ALREADY deducted — withdrawing must restore the balance
      // and release the held attendance rows. The final status is stored as
      // 'withdrawn' (previously mapped to 'cancelled'), and stale hold data
      // is cleared so the request disappears from the HR Team actions list.
      const withdrawHoldJson = existingLeave.status === 'on_hold' ? await readHoldJson(db, id) : null;
      const wasApprovedBefore = existingLeave.status === 'approved'
        || (existingLeave.status === 'on_hold' && withdrawHoldJson?.prevStatus === 'approved');

      // NOTE: LeaveRequest has NO `cancelledAt` column in the Prisma schema —
      // writing it here caused PrismaClientValidationError ("Unknown arg
      // cancelledAt"), which the .catch() swallowed, so the request's status
      // silently NEVER changed to 'withdrawn' (the HR Team actions list kept
      // showing it and balances were not released). We keep `cancellationReason`
      // + `comments`; if a DB has a legacy `cancelledAt` column we also stamp
      // it via raw SQL below.
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'withdrawn', cancellationReason: comments, comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch((wdErr: unknown) => {
        console.error('[leave withdraw] status update failed:', wdErr instanceof Error ? wdErr.message : wdErr);
        return null;
      });
      if (!leaveRequest) {
        return NextResponse.json(
          { error: 'Failed to withdraw the leave request — please try again or contact support.' },
          { status: 500, headers: corsHeaders() }
        );
      }
      // Legacy tenant DBs may carry a `cancelledAt` column — stamp it best-effort.
      try {
        await db.$executeRawUnsafe(`UPDATE "LeaveRequest" SET "cancelledAt" = NOW() WHERE "id" = $1`, id);
      } catch { /* column not present — fine */ }

      // Restore the deducted balance + attendance rows when the held/approved leave had its balance taken
      if (wasApprovedBefore) {
        try {
          const wdChargeableDays = existingLeave.chargeableDays ?? (existingLeave.halfDay
            ? 0.5
            : Math.ceil((new Date(existingLeave.endDate).getTime() - new Date(existingLeave.startDate).getTime()) / 86400000) + 1);
          await appendLedgerEntry(db, {
            employeeId: existingLeave.employeeId, leaveTypeId: existingLeave.leaveTypeId,
            year: new Date(existingLeave.startDate).getFullYear(), transactionType: 'reverse',
            days: Math.abs(wdChargeableDays), sourceType: 'leave_request', sourceId: id,
            reason: `Leave withdrawn — balance restored (${wdChargeableDays} day(s))`,
            createdBy: scope.userId, leaveRequestId: id,
          });
          console.log(`[leave] Balance restored for withdrawn leave ${id}: +${wdChargeableDays} day(s)`);
        } catch (wdRevErr) {
          console.warn(`[leave] Balance restoration failed for withdrawn leave ${id} (non-fatal):`, wdRevErr);
        }
        await removeLeaveAttendanceRows(db, existingLeave.employeeId, existingLeave.startDate, existingLeave.endDate, id);
      }

      // Clear stale hold data so the request disappears from Team actions
      if (existingLeave.status === 'on_hold') {
        await ensureHoldColumns(db);
        await db.$executeRawUnsafe(
          `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = NULL, "holdComments" = NULL WHERE "id" = $1`, id
        ).catch(() => null);
      }

      // Notify the approval chain that the request was withdrawn
      const empName4 = `${leaveRequest?.employee?.firstName || ''} ${leaveRequest?.employee?.lastName || ''}`.trim() || 'An employee';
      const chainIds4 = await collectChainRecipients(db, scope.tenantId, null, existingLeave.currentApproverId, id);
      for (const uid of chainIds4) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: uid,
            title: 'Leave request withdrawn',
            message: `${empName4} withdrew their ${leaveRequest.leaveType?.name || 'leave'} request (${String(existingLeave.startDate).split('T')[0]} → ${String(existingLeave.endDate).split('T')[0]}).`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        await dispatchLeaveEvent(db, scope.tenantId, 'leave.cancelled', leaveRequest, scope.userId, comments, request, chainIds4, {
          Cancelled_By: 'Employee (withdrawn)',
        });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, leaveRequest, message: 'Leave withdrawn — approver notified' }, { headers: corsHeaders() });
    }

    // ─── Cancel request after approval (employee action, gated) ────────
    // Employee raises a cancellation request on an APPROVED leave. The
    // status becomes 'cancel_requested' and goes to the approval chain
    // (current approver + HR) for sign-off. Until approved, the leave stays
    // 'approved'. On approval, status='cancelled' + balance restored.
    // Gated by workflow config allowCancelAfterApproval.
    if (status === 'cancel_requested') {
      if (!cfgFlags.allowCancelAfterApproval) {
        return NextResponse.json({ error: 'Cancelling an approved leave is disabled by the leave workflow configuration' }, { status: 403, headers: corsHeaders() });
      }
      // BUG_264 fix: cancellation AFTER the leave period follows the
      // configured policy — the workflow config can disable cancelling a
      // past leave entirely (allowCancelAfterLeaveEnd=false) or restrict it
      // to N days after the leave end date.
      const pastCancelErr = pastLeaveCancellationError(existingLeave.endDate, cfgFlags);
      if (pastCancelErr) {
        return NextResponse.json({ error: pastCancelErr, code: 'CANCEL_AFTER_LEAVE_END_BLOCKED' }, { status: 403, headers: corsHeaders() });
      }
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'cancel_requested', cancellationReason: comments, comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      // FIX (previously notified the employee only): the APPROVER + HR must
      // act on this request — notify them, and confirm to the employee.
      const empName5 = `${leaveRequest?.employee?.firstName || ''} ${leaveRequest?.employee?.lastName || ''}`.trim() || 'An employee';
      const approverIds5 = await collectChainRecipients(db, scope.tenantId, null, existingLeave.currentApproverId, id);
      for (const uid of approverIds5) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: uid,
            title: 'Cancellation request — action needed',
            message: `${empName5} requested cancellation of the APPROVED ${leaveRequest.leaveType?.name || 'leave'} (${String(existingLeave.startDate).split('T')[0]} → ${String(existingLeave.endDate).split('T')[0]}).${comments ? ` Reason: ${comments}` : ''}`,
            type: 'warning',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Cancellation request submitted',
            message: `Your cancellation request for the ${leaveRequest.leaveType?.name || 'leave'} has been submitted and is pending approval. The leave stays approved until the cancellation is approved.`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
      }
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        await dispatchLeaveEvent(db, scope.tenantId, 'leave.cancel_requested', leaveRequest, scope.userId, comments, request, approverIds5);
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, leaveRequest, message: 'Cancellation request submitted — awaiting approval' }, { headers: corsHeaders() });
    }

    // ─── Decline cancellation request (approver action) ─────────────────
    // The approver declines the employee's cancellation — the approved
    // leave stays as originally planned.
    if (status === 'decline_cancel_request') {
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'approved', comments: comments || existingLeave.comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      if (leaveRequest?.employee?.userId) {
        try {
          // FIX (root-cause Bug B): single params-object signature.
          await createNotification({
            tenantId: scope.tenantId || '',
            userId: leaveRequest.employee.userId,
            title: 'Cancellation request declined',
            message: `Your cancellation request for the ${leaveRequest.leaveType?.name || 'leave'} was declined. The leave remains approved (${String(existingLeave.startDate).split('T')[0]} → ${String(existingLeave.endDate).split('T')[0]}).${comments ? ` Comment: ${comments}` : ''}`,
            type: 'info',
            category: 'leave',
            link: '/leave',
          });
        } catch { /* non-fatal */ }
        try {
          const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
          await dispatchLeaveEvent(db, scope.tenantId, 'leave.cancel_request_declined', leaveRequest, scope.userId, comments, request, [leaveRequest.employee.userId]);
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ success: true, leaveRequest, message: 'Cancellation declined — leave stays approved' }, { headers: corsHeaders() });
    }

    // ─── Handle cancellation (no workflow involved) ───
    if (status === 'cancelled') {
      // BUG_264 fix: a DIRECT cancellation of a leave whose period has
      // already ended follows the configured policy. Cancellations that are
      // the sign-off step of an employee's 'cancel_requested' (current
      // status 'cancel_requested') are NOT re-checked — the policy was
      // already enforced when the request was raised.
      if (existingLeave.status !== 'cancel_requested') {
        const directPastErr = pastLeaveCancellationError(existingLeave.endDate, cfgFlags);
        if (directPastErr) {
          return NextResponse.json({ error: directPastErr, code: 'CANCEL_AFTER_LEAVE_END_BLOCKED' }, { status: 403, headers: corsHeaders() });
        }
      }

      // Fetch the existing leave request to check if it was already approved
      // (if so, we need to reverse the balance deduction)
      const existingRequest = await db.leaveRequest.findUnique({
        where: { id },
        select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, halfDay: true, status: true, chargeableDays: true },
      }).catch(() => null);

      // A leave has its balance DEDUCTED while: 'approved' (deducted at
      // approval), 'cancel_requested' (still approved until sign-off) and
      // 'on_hold' when the hold was applied to an APPROVED leave. All three
      // must restore the balance on cancellation.
      const holdJson = existingRequest?.status === 'on_hold' ? await readHoldJson(db, id) : null;
      const wasApproved = existingRequest?.status === 'approved'
        || existingRequest?.status === 'cancel_requested'
        || (existingRequest?.status === 'on_hold' && holdJson?.prevStatus === 'approved');

      await ensureLeaveModuleSchemaColumns(db);
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: {
          status: 'cancelled',
          approvedBy: scope.userId,
          approvedAt: new Date(),
          comments,
          reversedAt: wasApproved ? new Date() : undefined,
          cancellationReason: comments || undefined,
        },
        include: {
          employee: {
            select: { firstName: true, lastName: true, userId: true },
          },
          leaveType: true,
        },
      });

      // ─── Balance restoration: if the cancelled leave was already approved,
      // the balance was deducted at approval time. We need to reverse it now.
      // This appends a 'reverse' entry to the LeaveLedger and restores the
      // LeaveBalance running totals. (§7 spec: "reversals")
      if (wasApproved && existingRequest) {
        try {
          const chargeableDays = existingRequest.chargeableDays !== null && existingRequest.chargeableDays !== undefined
            ? existingRequest.chargeableDays
            : (existingRequest.halfDay ? 0.5 : Math.ceil((new Date(existingRequest.endDate).getTime() - new Date(existingRequest.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
          const year = new Date(existingRequest.startDate).getFullYear();
          await appendLedgerEntry(db, {
            employeeId: existingRequest.employeeId,
            leaveTypeId: existingRequest.leaveTypeId,
            year,
            transactionType: 'reverse',
            days: Math.abs(chargeableDays), // positive = credit (restoring)
            sourceType: 'leave_request',
            sourceId: existingRequest.id,
            reason: `Leave cancelled — balance restored (${chargeableDays} day(s))`,
            createdBy: scope.userId,
            leaveRequestId: existingRequest.id,
          });
          console.log(`[leave] Balance restored for cancelled leave ${id}: +${chargeableDays} days`);
        } catch (reverseErr) {
          console.warn(`[leave] Balance restoration failed for cancelled leave ${id} (non-fatal):`, reverseErr);
        }

        // Remove the on_leave/half_day attendance rows the approval sync
        // created for the (original) range — real punches are never touched.
        await removeLeaveAttendanceRows(db, existingRequest.employeeId, existingRequest.startDate, existingRequest.endDate, id);
      }

      await safeAuditLog(db, {
        userId: scope.userId,
        action: 'CANCELLED_LEAVE_REQUEST',
        module: 'leave',
        details: `Cancelled leave request ${id}${wasApproved ? ' (balance restored)' : ''}`,
      });

      // Clear stale hold data when cancelling a held request so the row no
      // longer shows proposal chips in Team actions.
      if (existingLeave.status === 'on_hold') {
        await ensureHoldColumns(db);
        await db.$executeRawUnsafe(
          `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = NULL, "holdComments" = NULL WHERE "id" = $1`, id
        ).catch(() => null);
      }

      // ─── BUG_066 fix: Email 5 — Leave Cancellation Confirmation ───
      // Per the Leave Module Notification Workflow spec, both the employee
      // AND the approver/HR must receive a cancellation confirmation email.
      // Previously the cancellation branch returned without dispatching any
      // notification — silent cancellation.
      try {
        const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
        // Resolve the canceller's name for the Cancelled_By placeholder
        let cancellerName = 'HR/Admin';
        try {
          const canceller = await db.user.findUnique({
            where: { id: scope.userId },
            select: { name: true, email: true },
          });
          if (canceller?.name) cancellerName = canceller.name;
          else if (canceller?.email) cancellerName = canceller.email;
        } catch { /* best-effort */ }

        // Build the recipient list: employee (if they have a userId) + all
        // active admins/HR in the tenant. The dispatchLeaveEvent helper
        // accepts recipientUserIds as an explicit list.
        const recipientIds: string[] = [];
        if (leaveRequest.employee?.userId) {
          recipientIds.push(leaveRequest.employee.userId);
        }
        try {
          const admins = await db.user.findMany({
            where: {
              tenantId: scope.tenantId,
              role: { in: ['hr_admin', 'admin', 'tenant_admin', 'super_admin'] },
              status: 'active',
            },
            select: { id: true },
            take: 20,
          });
          for (const a of admins) {
            if (!recipientIds.includes(a.id)) recipientIds.push(a.id);
          }
        } catch { /* best-effort */ }

        if (recipientIds.length > 0) {
          await dispatchLeaveEvent(
            db,
            scope.tenantId,
            'leave.cancelled',
            leaveRequest,
            scope.userId,
            comments,
            request,
            recipientIds,
            {
              Cancelled_By: cancellerName,
              Cancellation_Status: 'Approved',
              Comments: comments || '—',
              Request_Id: leaveRequest.id,
            },
          );
        }
      } catch (e) {
        console.warn('[leave PATCH] Cancellation notification failed (non-fatal):', e);
      }

      return NextResponse.json({ leaveRequest }, { headers: corsHeaders() });
    }

    // ─── Check if a multi-tier workflow is active ───
    // We check the workflowStage column (set by initializeLeaveWorkflow on POST)
    let workflowStage: string | null = null;
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT "workflowStage" FROM "LeaveRequest" WHERE "id" = $1 LIMIT 1`,
        id,
      ) as any[];
      workflowStage = rows?.[0]?.workflowstage || rows?.[0]?.workflowStage || null;
    } catch {
      // Column might not exist (tenant DB not synced) — fall back to legacy
      workflowStage = null;
    }

    // BUG FIX (HRMS_BUG_251): If workflowStage is null (workflow init failed
    // on POST, or the request was created before workflow support), try to
    // re-initialize the workflow NOW before falling through to the legacy
    // single-step path. This prevents the legacy path from being used as a
    // bypass to skip tiers when a workflow config IS configured.
    if (!workflowStage && (status === 'approved' || status === 'rejected') && scope.tenantId) {
      try {
        const { loadWorkflowConfig, initializeLeaveWorkflow } = await import('@/lib/leave-workflow');
        const { config: wfConfig, configId: wfConfigId } = await loadWorkflowConfig(
          db, scope.tenantId, existingLeave.leaveTypeId,
        );
        if (wfConfig?.tiers?.length > 0) {
          // Re-initialize the workflow on the fly
          await initializeLeaveWorkflow(
            db, id, existingLeave.employeeId, scope.tenantId,
            wfConfig, wfConfigId, existingLeave.leaveType?.name,
          );
          // Re-read workflowStage after initialization
          const reRows = await db.$queryRawUnsafe(
            `SELECT "workflowStage" FROM "LeaveRequest" WHERE "id" = $1 LIMIT 1`,
            id,
          ) as any[];
          workflowStage = reRows?.[0]?.workflowstage || reRows?.[0]?.workflowStage || null;
        }
      } catch (wfErr) {
        // If re-init fails, fall through to legacy path (existing behavior)
        console.warn('[leave PATCH] workflow re-init failed, using legacy path:', wfErr);
      }
    }

    // ─── Multi-tier workflow path ───
    if (workflowStage && workflowStage !== 'final_approval' && workflowStage !== 'rejected') {
      // Verify the user is authorized to approve the current tier
      const { canUserApproveCurrentTier } = await import('@/lib/leave-workflow');
      const canApprove = await canUserApproveCurrentTier(db, id, userId, userRole, scope.tenantId);
      if (!canApprove) {
        return NextResponse.json(
          { error: 'You are not authorized to approve this tier. Only the assigned approver or an admin can approve.' },
          { status: 403, headers: corsHeaders() }
        );
      }

      if (status === 'approved') {
        // Advance to the next tier (or finalize if last tier)
        const { advanceLeaveWorkflow } = await import('@/lib/leave-workflow');
        let result = await advanceLeaveWorkflow(
          db,
          id,
          existingLeave.employeeId,
          scope.tenantId,
          scope.userId || userId,
          comments || '',
          existingLeave.leaveType?.name,
        );

        // BUG_258 fix: SINGLE-CLICK approval. Previously one click only
        // advanced one tier, so HR (authorized to approve every tier) had to
        // click the tick button twice before the leave was approved. While
        // the workflow advanced to a next tier AND the acting user is
        // authorized to approve that tier too, keep advancing so ONE click
        // finalizes the leave. The loop stops at the first tier that needs a
        // DIFFERENT approver (e.g. a manager approving tier 1 of a chain
        // whose tier 2 is HR).
        let autoAdvances = 0;
        while (!result.finalized && result.nextTier && autoAdvances < 10) {
          const canAlsoApproveNext = await canUserApproveCurrentTier(db, id, userId, userRole, scope.tenantId);
          if (!canAlsoApproveNext) break;
          result = await advanceLeaveWorkflow(
            db,
            id,
            existingLeave.employeeId,
            scope.tenantId,
            scope.userId || userId,
            comments || '',
            existingLeave.leaveType?.name,
          );
          autoAdvances++;
        }

        if (result.finalized) {
          // ─── Balance deduction is now handled centrally inside
          // advanceLeaveWorkflow() in lib/leave-workflow.ts ───
          // Previously this route deducted here, but that caused either
          // (a) double-deduction when the workflow engine also deducted,
          // or (b) missed deduction when the workflow engine didn't.
          // Now the workflow engine ALWAYS deducts on finalize, so we
          // only need to notify the employee here.

          // Notify the employee of final approval — multi-channel (Task 36)
          if (existingLeave.employee.userId) {
            const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
            await dispatchLeaveEvent(db, scope.tenantId, 'leave.approved', existingLeave, scope.userId, comments, request).catch(() => null);
          }

          // Notify all HR admins (for record-keeping)
          try {
            const hrAdmins = await db.user.findMany({
              where: {
                tenantId: scope.tenantId,
                role: { in: ['tenant_admin', 'ceo', 'admin'] },
                status: 'active',
              },
              select: { id: true },
            });
            for (const admin of hrAdmins) {
              await createNotification({
                tenantId: scope.tenantId,
                userId: admin.id,
                title: 'Leave Request Fully Approved',
                message: `${existingLeave.employee.firstName} ${existingLeave.employee.lastName}'s ${existingLeave.leaveType.name} leave (${existingLeave.startDate.toLocaleDateString()} → ${existingLeave.endDate.toLocaleDateString()}) has been fully approved through all workflow tiers.`,
                type: 'info',
                category: 'leave',
                link: `/leave`,
              }).catch(() => null);
            }
          } catch { /* non-critical */ }

          await safeAuditLog(db, {
            userId: scope.userId,
            action: 'APPROVE_LEAVE_REQUEST_FINAL',
            module: 'leave',
            details: `Final approval for leave request ${id} (all tiers passed) for ${existingLeave.employee.firstName} ${existingLeave.employee.lastName}`,
          });

          const updatedLeave = await db.leaveRequest.findUnique({
            where: { id },
            include: {
              employee: { select: { firstName: true, lastName: true, userId: true } },
              leaveType: true,
            },
          });

          return NextResponse.json({
            leaveRequest: updatedLeave,
            workflowFinalized: true,
            message: 'Leave request fully approved through all workflow tiers. Leave balance has been updated.',
          }, { headers: corsHeaders() });
        } else {
          // ─── Advanced to next tier: notify the next approver — multi-channel + actionable (Task 36) ───
          // (falls back to HR/admin role recipients when no specific approver resolves)
          {
            const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
            await dispatchLeaveEvent(db, scope.tenantId, 'leave.applied', existingLeave, scope.userId, comments, request, result.nextApproverId ? [result.nextApproverId] : null).catch(() => null);
          }

          // ─── Bug fix: email the EMPLOYEE that tier N was approved + who the next approver is ───
          // Previously: only an in-app Notification was created (no email). The user complained
          // that after Approver 1 approved via the email link, the employee received no email
          // and didn't know who Approver 2 was. We now dispatch the new `leave.tier_advanced`
          // event to the employee with both Approver_Name (tier N, who just approved) and
          // Next_Approver_Name (tier N+1, who is currently reviewing).
          if (existingLeave.employee.userId) {
            // Resolve next approver's display name (best-effort)
            let nextApproverName = 'the next approver';
            if (result.nextApproverId) {
              try {
                const nextUser = await db.user.findUnique({
                  where: { id: result.nextApproverId },
                  select: { name: true, email: true },
                });
                if (nextUser?.name) nextApproverName = nextUser.name;
                else if (nextUser?.email) nextApproverName = nextUser.email;
              } catch { /* best-effort */ }
            }
            const approvedTierNum = (result.nextTier || 1) - 1;
            const nextTierNum = result.nextTier || 1;

            const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
            await dispatchLeaveEvent(
              db,
              scope.tenantId,
              'leave.tier_advanced',
              existingLeave,
              scope.userId,        // → resolves Approver_Name (the user who just approved)
              comments,
              request,
              [existingLeave.employee.userId],  // recipient = the requesting employee
              {
                Next_Approver_Name: nextApproverName,
                Approved_Tier: String(approvedTierNum),
                Next_Tier: String(nextTierNum),
              },
            ).catch(() => null);

            // Keep the in-app Notification (in addition to the email) for users
            // who never look at email but log in to the app regularly.
            let justApproverName = 'your approver';
            try {
              const u = await db.user.findUnique({ where: { id: scope.userId }, select: { name: true, email: true } });
              if (u?.name) justApproverName = u.name;
              else if (u?.email) justApproverName = u.email;
            } catch { /* best-effort */ }
            await createNotification({
              tenantId: scope.tenantId,
              userId: existingLeave.employee.userId,
              title: `Leave Request — Tier ${approvedTierNum} Approved`,
              message: `Your ${existingLeave.leaveType?.name || 'leave'} request was approved at Tier ${approvedTierNum} by ${justApproverName}. It is now waiting for approval at Tier ${nextTierNum} from ${nextApproverName}.`,
              type: 'info',
              category: 'leave',
              link: '/leave',
            }).catch(() => null);
          }

          await safeAuditLog(db, {
            userId: scope.userId,
            action: `APPROVE_LEAVE_TIER_${result.nextTier! - 1}`,
            module: 'leave',
            details: `Approved tier ${result.nextTier! - 1} for leave request ${id}. Advanced to tier ${result.nextTier}.`,
          });

          const updatedLeave = await db.leaveRequest.findUnique({
            where: { id },
            include: {
              employee: { select: { firstName: true, lastName: true, userId: true } },
              leaveType: true,
            },
          });

          return NextResponse.json({
            leaveRequest: updatedLeave,
            workflowAdvanced: true,
            nextTier: result.nextTier,
            nextApproverId: result.nextApproverId,
            message: `Tier ${result.nextTier! - 1} approved. Advanced to tier ${result.nextTier}.`,
          }, { headers: corsHeaders() });
        }
      } else {
        // ─── Reject at current tier ───
        const { rejectLeaveWorkflow } = await import('@/lib/leave-workflow');
        await rejectLeaveWorkflow(db, id, scope.userId || userId, comments || '');

        // Notify the employee of rejection — multi-channel (Task 36)
        if (existingLeave.employee.userId) {
          const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
          await dispatchLeaveEvent(db, scope.tenantId, 'leave.rejected', existingLeave, scope.userId, comments, request).catch(() => null);
        }

        await safeAuditLog(db, {
          userId: scope.userId,
          action: 'REJECT_LEAVE_REQUEST',
          module: 'leave',
          details: `Rejected leave request ${id} for ${existingLeave.employee.firstName} ${existingLeave.employee.lastName}`,
        });

        const updatedLeave = await db.leaveRequest.findUnique({
          where: { id },
          include: {
            employee: { select: { firstName: true, lastName: true, userId: true } },
            leaveType: true,
          },
        });

        return NextResponse.json({
          leaveRequest: updatedLeave,
          message: 'Leave request rejected.',
        }, { headers: corsHeaders() });
      }
    }

    // ─── Legacy single-step path (no workflow) ───
    const leaveRequest = await db.leaveRequest.update({
      where: { id },
      data: {
        status,
        approvedBy: scope.userId,
        approvedAt: new Date(),
        comments,
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, userId: true },
        },
        leaveType: true,
      },
    });

    // Update leave balance if approved
    if (status === 'approved') {
      // BUG FIX: deduct VALIDATED working days only (weekends + configured
      // holidays excluded) and reflect the approved leave in Attendance.
      let daysToDeduct = leaveRequest.halfDay ? 0.5 : Math.ceil(
        (new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      let weekendDow: number[] | undefined;
      try {
        weekendDow = await getWeekendDays(db, scope.tenantId, existingLeave.employee.companyId);
        const holidays = await getHolidaysInRange(db, new Date(leaveRequest.startDate), new Date(leaveRequest.endDate));
        const walk = computeWorkingDays(
          new Date(leaveRequest.startDate),
          new Date(leaveRequest.endDate),
          weekendDow,
          new Set(holidays.map(h => h.date)),
        );
        daysToDeduct = leaveDaysConsumed(walk, leaveRequest.halfDay);
      } catch (wdErr) {
        console.warn('[leave] Working-day computation failed (fallback to calendar days):', wdErr);
      }

      const currentYear = new Date().getFullYear();

      // BUG FIX (2026-11-23): Ensure a LeaveBalance row exists before
      // deducting. Previously, updateMany silently updated 0 rows when no
      // balance record existed (common for new employees), so approved leaves
      // never reflected in the balance — the dashboard showed "0 days
      // available" / "No leave balances configured" even after approval.
      try {
        const balCheck: any[] = await db.$queryRawUnsafe(
          `SELECT id FROM "LeaveBalance" WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND "year" = $3`,
          leaveRequest.employeeId, leaveRequest.leaveTypeId, currentYear,
        );
        if (balCheck.length === 0) {
          // Resolve entitled days from LeaveType.defaultDays
          let entitledDays = 0;
          try {
            const ltRows: any[] = await db.$queryRawUnsafe(
              `SELECT "defaultDays" FROM "LeaveType" WHERE id = $1 LIMIT 1`,
              leaveRequest.leaveTypeId,
            );
            if (ltRows.length > 0) entitledDays = Number(ltRows[0].defaultDays) || 0;
          } catch {}
          const newBalId = `lb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          await db.$executeRawUnsafe(
            `INSERT INTO "LeaveBalance" ("id", "employeeId", "leaveTypeId", "year", "total", "used", "remaining", "carryForward", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 0, $5, 0, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            newBalId, leaveRequest.employeeId, leaveRequest.leaveTypeId, currentYear, entitledDays,
          ).catch(() => {});
        }
      } catch (e) {
        console.warn('[leave approve] ensureLeaveBalanceRow failed (non-fatal):', e);
      }

      await db.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: currentYear,
        },
        data: {
          used: { increment: daysToDeduct },
          remaining: { decrement: daysToDeduct },
        },
      }).catch(() => null);

      // ─── Bug fix: reflect approved leave in Attendance ───
      // The corresponding dates now get status on_leave (or half_day) so
      // the attendance register shows the approved leave.
      await syncAttendanceForLeave(db, {
        employeeId: leaveRequest.employeeId,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        halfDay: leaveRequest.halfDay,
        leaveRequestId: leaveRequest.id,
        leaveTypeName: leaveRequest.leaveType?.name,
        weekendDow,
      });
    }

    // Notify the employee about the leave decision — multi-channel (Task 36)
    if (leaveRequest.employee.userId) {
      const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
      await dispatchLeaveEvent(db, scope.tenantId, status === 'approved' ? 'leave.approved' : 'leave.rejected', leaveRequest, scope.userId, comments, request).catch(() => null);
    }

    await safeAuditLog(db, {
      userId: scope.userId,
      action: `${status.toUpperCase()}_LEAVE_REQUEST`,
      module: 'leave',
      details: `${status} leave request ${id} for employee ${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
    });

    return NextResponse.json(
      { leaveRequest },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Update leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
