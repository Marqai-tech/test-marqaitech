/**
 * Employee Update Request detail + actions API
 *
 *   GET   /api/employees/update-requests/[id] — full detail with approval timeline
 *   PATCH /api/employees/update-requests/[id] — approve / reject / cancel
 *     { action: 'approve', comments }  — current-tier approver (or admin)
 *     { action: 'reject', comments }   — any tier approver (or admin)
 *     { action: 'cancel' }             — request owner, while pending
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { sanitizeMultiLineText } from '@/lib/sanitize';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const request = await db.employeeUpdateRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, email: true } },
        approvalSteps: { orderBy: { tier: 'asc' } },
      },
    });
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: corsHeaders() });
    return NextResponse.json({ request }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update request GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const body = await req.json();
    const action = String(body.action || '');
    const comments = sanitizeMultiLineText(body.comments, 500);
    const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(auth.role);

    const updateRequest = await db.employeeUpdateRequest.findUnique({
      where: { id },
      include: { approvalSteps: { orderBy: { tier: 'asc' } } },
    });
    if (!updateRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: corsHeaders() });

    // ─── Cancel (owner only, while pending) ───
    if (action === 'cancel') {
      if (updateRequest.requestedById !== auth.userId && !isAdmin) {
        return NextResponse.json({ error: 'Only the requester or admin can cancel' }, { status: 403, headers: corsHeaders() });
      }
      if (updateRequest.status !== 'pending') {
        return NextResponse.json({ error: `Cannot cancel a request that is ${updateRequest.status}` }, { status: 400, headers: corsHeaders() });
      }
      await db.employeeUpdateRequest.update({
        where: { id },
        data: { status: 'cancelled', approverComments: comments },
      });
      await (db as any).employeeUpdateApprovalStep.updateMany({
        where: { updateRequestId: id, status: 'pending' },
        data: { status: 'skipped', comments: 'Request cancelled', actedAt: new Date() },
      });
      return NextResponse.json({ message: 'Request cancelled' }, { headers: corsHeaders() });
    }

    // ─── Approve / Reject ───
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders() });
    }
    // Task 88 (spec rule 4): the admin must provide a reason when rejecting.
    if (action === 'reject' && !comments) {
      return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400, headers: corsHeaders() });
    }
    if (updateRequest.status !== 'pending') {
      return NextResponse.json({ error: `This request is already ${updateRequest.status}` }, { status: 400, headers: corsHeaders() });
    }

    // Task 88: include the decision-maker's name in employee notifications.
    const actor = await db.user.findUnique({ where: { id: auth.userId }, select: { name: true, email: true } }).catch(() => null);
    const approverName = (actor as { name?: string | null; email?: string | null } | null)?.name
      || (actor as { email?: string | null } | null)?.email
      || 'Admin';

    const currentTier = updateRequest.currentTier || 1;
    const step = await (db as any).employeeUpdateApprovalStep.findFirst({
      where: { updateRequestId: id, tier: currentTier, status: 'pending' },
    });
    const isActor = step && step.approverUserId === auth.userId;
    if (!isActor && !isAdmin) {
      return NextResponse.json({ error: 'You are not the assigned approver at the current tier' }, { status: 403, headers: corsHeaders() });
    }

    // Update the current step
    await (db as any).employeeUpdateApprovalStep.update({
      where: { id: step.id },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        comments: comments || null,
        actedAt: new Date(),
        approverUserId: auth.userId,
      },
    });

    if (action === 'reject') {
      // Reject the whole request
      await db.employeeUpdateRequest.update({
        where: { id },
        data: { status: 'rejected', approverUserId: auth.userId, approverComments: comments, approvedAt: new Date() },
      });
      // Notify the requester — multi-channel (Task 36)
      try {
        if (auth.tenantId) {
          const { dispatchNotification } = await import('@/lib/notification-center');
          await dispatchNotification({
            tenantId: auth.tenantId,
            module: 'core_hr',
            eventKey: 'core_hr.profile.update_result',
            recipients: updateRequest.requestedById ? [{ userId: updateRequest.requestedById }] : [],
            vars: {
              Field_Name: updateRequest.fieldLabel || updateRequest.fieldName,
              Status: 'REJECTED',
              Approver_Name: approverName,
              Comment: comments ? `Comments: ${comments}` : '',
            },
            entity: { type: 'employee_update_request', id, link: '/employees/update-requests' },
            origin: req.headers.get('origin') || undefined,
          });
        }
      } catch { /* non-fatal */ }
      return NextResponse.json({ message: 'Request rejected', finalized: true }, { headers: corsHeaders() });
    }

    // Approve — find next pending tier
    const nextSteps = await (db as any).employeeUpdateApprovalStep.findMany({
      where: { updateRequestId: id, tier: { gt: currentTier }, status: 'pending' },
      orderBy: { tier: 'asc' },
      take: 1,
    });
    const nextStep = nextSteps[0];

    if (!nextStep) {
      // No more tiers — finalize: apply the change to the Employee record
      await db.employeeUpdateRequest.update({
        where: { id },
        data: { status: 'approved', approverUserId: auth.userId, approverComments: comments, approvedAt: new Date() },
      });

      // Apply the change
      try {
        const newValue = updateRequest.newValue;
        // Handle JSON-encoded values
        let parsedValue: unknown = newValue;
        try { parsedValue = JSON.parse(newValue); } catch { /* keep as string */ }

        await db.employee.update({
          where: { id: updateRequest.employeeId },
          data: { [updateRequest.fieldName]: parsedValue } as Record<string, unknown>,
        });
        await db.employeeUpdateRequest.update({
          where: { id },
          data: { status: 'applied', appliedAt: new Date() },
        });
        // Task 86: keep the login account's display name in sync when an
        // approved change alters the employee's first/last name.
        if (['firstName', 'lastName'].includes(updateRequest.fieldName)) {
          try {
            const empFull = await db.employee.findUnique({
              where: { id: updateRequest.employeeId },
              select: { firstName: true, lastName: true, userId: true },
            });
            const newName = empFull ? `${empFull.firstName || ''} ${empFull.lastName || ''}`.trim() : '';
            if (empFull?.userId && newName) {
              await db.user.update({ where: { id: empFull.userId }, data: { name: newName } });
            }
          } catch { /* non-fatal */ }
        }
        // Notify the requester — multi-channel (Task 36)
        try {
          if (auth.tenantId) {
            const { dispatchNotification } = await import('@/lib/notification-center');
            await dispatchNotification({
              tenantId: auth.tenantId,
              module: 'core_hr',
              eventKey: 'core_hr.profile.update_result',
              recipients: updateRequest.requestedById ? [{ userId: updateRequest.requestedById }] : [],
              vars: {
                Field_Name: updateRequest.fieldLabel || updateRequest.fieldName,
                Status: 'APPROVED & APPLIED',
                Approver_Name: approverName,
                Comment: comments ? `Comments: ${comments}` : '',
              },
              entity: { type: 'employee_update_request', id, link: '/employees/update-requests' },
              origin: req.headers.get('origin') || undefined,
            });
          }
        } catch { /* non-fatal */ }
        return NextResponse.json({ message: 'Request approved and applied to employee record', finalized: true }, { headers: corsHeaders() });
      } catch (applyErr) {
        console.error('Failed to apply update:', applyErr);
        return NextResponse.json({ message: 'Request approved but failed to apply — HR should apply manually', finalized: true, error: 'apply_failed' }, { headers: corsHeaders() });
      }
    }

    // Advance to next tier
    await db.employeeUpdateRequest.update({
      where: { id },
      data: { currentTier: nextStep.tier },
    });

    // Task 88: notify the next-tier approver (email + in-app) so tiered
    // chains never stall silently at tier 2+.
    try {
      if (auth.tenantId && nextStep.approverUserId) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        const empRow = await db.employee.findUnique({ where: { id: updateRequest.employeeId }, select: { firstName: true, lastName: true } });
        const critical = ['bank', 'account', 'salary', 'pan', 'aadhaar', 'ssn', 'tax', 'pf', 'esi'].some((k) => updateRequest.fieldName.toLowerCase().includes(k));
        await dispatchNotification({
          tenantId: auth.tenantId,
          module: 'core_hr',
          eventKey: 'core_hr.profile.update_requested',
          recipients: [{ userId: nextStep.approverUserId }],
          vars: {
            Employee_Name: empRow ? `${empRow.firstName || ''} ${empRow.lastName || ''}`.trim() : 'An employee',
            Field_Name: updateRequest.fieldLabel || updateRequest.fieldName,
            New_Value: updateRequest.newValue,
            Critical: critical ? ' This is a PAYROLL-CRITICAL change.' : '',
          },
          entity: { type: 'employee_update_request', id, link: '/employees/update-requests' },
          origin: req.headers.get('origin') || undefined,
        });
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ message: `Approved — moved to Tier ${nextStep.tier}`, finalized: false }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update request PATCH error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: corsHeaders() });
  }
}
