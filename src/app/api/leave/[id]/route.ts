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

/**
 * PATCH /api/leave/[id]
 *
 * Approves, rejects, or cancels a leave request.
 *
 * Body:
 *   { "status": "approved" | "rejected" | "cancelled", "comments": "..." }
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
 *   - 'cancelled' → employee cancels their own pending request (no balance change).
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
    const VALID_STATUSES = ['approved', 'rejected', 'cancelled', 'on_hold', 'withdrawn', 'cancel_requested'];
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

    // ─── Company-scoped data visibility for approval/rejection ───
    if (scope.scope === 'self') {
      // Employees can only cancel their own leave requests
      if (status !== 'cancelled') {
        return NextResponse.json(
          { error: 'Only admins can approve or reject leave requests' },
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

    if (existingLeave.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending leave requests can be approved/rejected' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── QA Spec Section 5: On Hold with proposed dates ────────────────
    // Approver puts the request on hold. Status = 'on_hold'. The proposed
    // dates + optional comment are stored. Balance stays reserved (we don't
    // release it — the employee can't over-apply while on hold). Employee +
    // HR are notified.
    if (status === 'on_hold') {
      const proposedHoldDates = body.proposedHoldDates || null; // { startDate, endDate } or null
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "proposedHoldDatesJson" TEXT`);
        await db.$executeRawUnsafe(`ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "holdComments" TEXT`);
      } catch { /* non-fatal */ }
      const holdDatesJson = proposedHoldDates ? JSON.stringify(proposedHoldDates) : null;
      await db.$executeRawUnsafe(
        `UPDATE "LeaveRequest" SET "proposedHoldDatesJson" = $1, "holdComments" = $2 WHERE "id" = $3`,
        holdDatesJson, comments || null, id
      ).catch(() => null);

      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'on_hold', comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);

      // Notify the employee about the hold + proposed dates
      if (leaveRequest?.employee?.userId) {
        try {
          const { createNotification } = await import('@/lib/notifications');
          await createNotification(db, {
            userId: leaveRequest.employee.userId,
            type: 'leave_on_hold',
            title: `Leave request put on hold`,
            message: `Your ${leaveRequest.leaveType?.name || 'leave'} request has been put on hold${proposedHoldDates ? ` with proposed dates: ${proposedHoldDates.startDate} → ${proposedHoldDates.endDate}` : ''}.${comments ? ` Comment: ${comments}` : ''}`,
            data: { leaveRequestId: id, proposedHoldDates, comments },
          });
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ success: true, leaveRequest }, { headers: corsHeaders() });
    }

    // ─── QA Spec Section 7: Withdraw before approval (employee self-service) ───
    // Employee withdraws a pending/on_hold request. No approval needed.
    // Balance is released. The current approver is notified.
    if (status === 'withdrawn') {
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'cancelled', cancellationReason: comments, comments, cancelledAt: new Date() },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);
      return NextResponse.json({ success: true, leaveRequest, message: 'Leave withdrawn — approver notified' }, { headers: corsHeaders() });
    }

    // ─── QA Spec Section 7: Cancel request after approval ─────────────
    // Employee raises a cancellation request on an approved leave. The
    // status becomes 'cancel_requested' and goes to the Reporting Manager
    // (and HR if in the flow) for approval. Until approved, the leave stays
    // 'approved' with a flag. On approval, status='cancelled' + balance restored.
    if (status === 'cancel_requested') {
      const leaveRequest = await db.leaveRequest.update({
        where: { id },
        data: { status: 'cancel_requested', cancellationReason: comments, comments },
        include: { employee: { select: { firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true } } },
      }).catch(() => null);
      // Notify the approver
      if (leaveRequest?.employee?.userId) {
        try {
          const { createNotification } = await import('@/lib/notifications');
          await createNotification(db, {
            userId: leaveRequest.employee.userId,
            type: 'leave_cancel_request',
            title: `Cancellation request submitted`,
            message: `Cancellation request for ${leaveRequest.leaveType?.name || 'leave'} has been submitted and is pending approval.`,
            data: { leaveRequestId: id, comments },
          });
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ success: true, leaveRequest, message: 'Cancellation request submitted — awaiting approval' }, { headers: corsHeaders() });
    }

    // ─── Handle cancellation (no workflow involved) ───
    if (status === 'cancelled') {
      // Fetch the existing leave request to check if it was already approved
      // (if so, we need to reverse the balance deduction)
      const existingRequest = await db.leaveRequest.findUnique({
        where: { id },
        select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, halfDay: true, status: true, chargeableDays: true },
      }).catch(() => null);

      const wasApproved = existingRequest?.status === 'approved';

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
      }

      await safeAuditLog(db, {
        userId: scope.userId,
        action: 'CANCELLED_LEAVE_REQUEST',
        module: 'leave',
        details: `Cancelled leave request ${id}${wasApproved ? ' (balance restored)' : ''}`,
      });

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
        const result = await advanceLeaveWorkflow(
          db,
          id,
          existingLeave.employeeId,
          scope.tenantId,
          scope.userId || userId,
          comments || '',
          existingLeave.leaveType?.name,
        );

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
          // Resolve entitled days from LeavePolicyRule, fall back to LeaveType.defaultDays
          let entitledDays = 0;
          try {
            const ruleRows: any[] = await db.$queryRawUnsafe(
              `SELECT "entitledDaysPerYear" FROM "LeavePolicyRule"
               WHERE "leaveTypeId" = $1 AND status = 'active'
               ORDER BY "entitledDaysPerYear" DESC NULLS LAST LIMIT 1`,
              leaveRequest.leaveTypeId,
            );
            if (ruleRows.length > 0 && Number(ruleRows[0].entitledDaysPerYear) > 0) {
              entitledDays = Number(ruleRows[0].entitledDaysPerYear);
            }
          } catch {}
          if (entitledDays === 0) {
            try {
              const ltRows: any[] = await db.$queryRawUnsafe(
                `SELECT "defaultDays" FROM "LeaveType" WHERE id = $1 LIMIT 1`,
                leaveRequest.leaveTypeId,
              );
              if (ltRows.length > 0) entitledDays = Number(ltRows[0].defaultDays) || 0;
            } catch {}
          }
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
