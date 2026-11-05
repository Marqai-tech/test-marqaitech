/**
 * Notification Center — Action Handlers (Task 36)
 *
 * Executes the underlying approval when a user clicks Approve/Reject in an
 * email, Slack or Teams message. The action token on the NotificationDelivery
 * row is validated by the API route, then routed to the matching handler
 * here. Handlers mirror the exact logic of the corresponding UI endpoints so
 * acting from email is equivalent to acting inside the HRMS.
 */
import { getPlatformDb } from '@/lib/tenant-db';

type PrismaClient = ReturnType<typeof getPlatformDb>;

export interface ActionResult {
  ok: boolean;
  message: string;
  finalized?: boolean;
}

interface HandlerArgs {
  db: PrismaClient;
  entityId: string;
  action: 'approve' | 'reject';
  comment?: string;
  /** user id of the actor (token owner) — recorded as the approver */
  actorUserId: string;
}

type Handler = (args: HandlerArgs) => Promise<ActionResult>;

// ─── Leave request ───────────────────────────────────────────────────

const leaveRequestHandler: Handler = async ({ db, entityId, action, comment, actorUserId }) => {
  const request = await (db as any).leaveRequest.findUnique({ where: { id: entityId } });
  if (!request) return { ok: false, message: 'Leave request not found' };
  if (['approved', 'rejected', 'cancelled'].includes(request.status)) {
    return { ok: false, message: `This leave request was already ${request.status}` };
  }

  if (action === 'reject') {
    const { rejectLeaveWorkflow } = await import('@/lib/leave-workflow');
    await rejectLeaveWorkflow(db, entityId, actorUserId, comment || 'Rejected via email/chat action');
    return { ok: true, message: 'Leave request rejected', finalized: true };
  }

  const { advanceLeaveWorkflow } = await import('@/lib/leave-workflow');
  const employee = await (db as any).employee.findUnique({ where: { id: request.employeeId }, select: { id: true } });
  let leaveTypeName: string | undefined;
  try {
    const lt = await (db as any).leaveType.findUnique({ where: { id: request.leaveTypeId }, select: { name: true } });
    leaveTypeName = lt?.name;
  } catch { /* optional */ }
  const result = await advanceLeaveWorkflow(
    db, entityId, employee?.id || request.employeeId, request.tenantId, actorUserId,
    comment || 'Approved via email/chat action',
    leaveTypeName,
  );
  return {
    ok: true,
    message: result.finalized ? 'Leave request approved' : 'Tier approved — sent to the next approver',
    finalized: result.finalized,
  };
};

// ─── Attendance request ──────────────────────────────────────────────

const attendanceRequestHandler: Handler = async ({ db, entityId, action, comment, actorUserId }) => {
  const request = await (db as any).attendanceRequest.findUnique({ where: { id: entityId } });
  if (!request) return { ok: false, message: 'Attendance request not found' };
  if (['approved', 'rejected', 'cancelled'].includes(request.status)) {
    return { ok: false, message: `This request was already ${request.status}` };
  }
  const { advanceWorkflow } = await import('@/lib/attendance-workflow');
  const result = await advanceWorkflow(db, entityId, action === 'approve' ? 'approved' : 'rejected', actorUserId, comment);
  return { ok: true, message: result.finalized ? `Request ${result.status}` : `Level ${result.currentLevel} approved — sent to the next level`, finalized: result.finalized };
};

// ─── Employee profile update request ─────────────────────────────────

const employeeUpdateRequestHandler: Handler = async ({ db, entityId, action, comment, actorUserId }) => {
  const updateRequest = await (db as any).employeeUpdateRequest.findUnique({ where: { id: entityId } });
  if (!updateRequest) return { ok: false, message: 'Profile update request not found' };
  if (['approved', 'rejected', 'applied', 'cancelled'].includes(updateRequest.status)) {
    return { ok: false, message: `This request was already ${updateRequest.status}` };
  }

  const currentTier = updateRequest.currentTier || 1;
  const step = await (db as any).employeeUpdateApprovalStep.findFirst({
    where: { updateRequestId: entityId, tier: currentTier, status: 'pending' },
  });
  if (!step) return { ok: false, message: 'No pending approval step found for this request' };

  await (db as any).employeeUpdateApprovalStep.update({
    where: { id: step.id },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      comments: comment || null,
      actedAt: new Date(),
      approverUserId: actorUserId,
    },
  });

  if (action === 'reject') {
    await (db as any).employeeUpdateRequest.update({
      where: { id: entityId },
      data: { status: 'rejected', approverUserId: actorUserId, approverComments: comment, approvedAt: new Date() },
    });
    return { ok: true, message: 'Profile update request rejected', finalized: true };
  }

  const nextSteps = await (db as any).employeeUpdateApprovalStep.findMany({
    where: { updateRequestId: entityId, tier: { gt: currentTier }, status: 'pending' },
    orderBy: { tier: 'asc' },
    take: 1,
  });
  const nextStep = nextSteps[0];
  if (nextStep) {
    await (db as any).employeeUpdateRequest.update({
      where: { id: entityId },
      data: { currentTier: nextStep.tier },
    });
    return { ok: true, message: `Tier ${currentTier} approved — moved to tier ${nextStep.tier}`, finalized: false };
  }

  // Finalize: apply the field change to the Employee record
  await (db as any).employeeUpdateRequest.update({
    where: { id: entityId },
    data: { status: 'approved', approverUserId: actorUserId, approverComments: comment, approvedAt: new Date() },
  });
  try {
    let parsedValue: unknown = updateRequest.newValue;
    try { parsedValue = JSON.parse(updateRequest.newValue); } catch { /* keep string */ }
    await (db as any).employee.update({
      where: { id: updateRequest.employeeId },
      data: { [updateRequest.fieldName]: parsedValue } as Record<string, unknown>,
    });
    await (db as any).employeeUpdateRequest.update({
      where: { id: entityId },
      data: { status: 'applied', appliedAt: new Date() },
    });
    return { ok: true, message: 'Profile update approved and applied', finalized: true };
  } catch {
    return { ok: true, message: 'Profile update approved — HR must apply the change manually', finalized: true };
  }
};

// ─── Job requisition ─────────────────────────────────────────────────

const requisitionHandler: Handler = async ({ db, entityId, action, comment, actorUserId }) => {
  const requisition = await (db as any).requisition.findUnique({ where: { id: entityId } }).catch(() => null);
  if (!requisition) return { ok: false, message: 'Requisition not found' };
  if (['approved', 'rejected', 'filled', 'closed'].includes(requisition.status)) {
    return { ok: false, message: `This requisition was already ${requisition.status}` };
  }
  await (db as any).requisition.update({
    where: { id: entityId },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      approvedBy: actorUserId,
      approvedAt: new Date(),
      ...(comment ? { notes: comment } : {}),
    },
  });
  return { ok: true, message: `Requisition ${action === 'approve' ? 'approved' : 'rejected'}`, finalized: true };
};

// ─── Exit clearance ──────────────────────────────────────────────────

const exitClearanceHandler: Handler = async ({ db, entityId, action, comment, actorUserId }) => {
  // entityId here is the ExitRequest id; "approve" marks department clearance.
  const exitRequest = await (db as any).exitRequest.findUnique({ where: { id: entityId } }).catch(() => null);
  if (!exitRequest) return { ok: false, message: 'Exit request not found' };
  const department = (comment || '').trim(); // not used — clearance noted on request
  void department;
  const note = `[${new Date().toISOString()}] Cleared via email/chat action by ${actorUserId}`;
  const clearanceNotes = exitRequest.clearanceNotes ? `${exitRequest.clearanceNotes}\n${note}` : note;
  await (db as any).exitRequest.update({
    where: { id: entityId },
    data: action === 'approve'
      ? { clearanceNotes }
      : { status: 'in_progress' },
  });
  return {
    ok: action === 'approve',
    message: action === 'approve' ? 'Clearance marked complete' : 'Use the HRMS to raise a clearance dispute',
    finalized: action === 'approve',
  };
};

// ─── Registry ────────────────────────────────────────────────────────

const HANDLERS: Record<string, Handler> = {
  leave_request: leaveRequestHandler,
  attendance_request: attendanceRequestHandler,
  employee_update_request: employeeUpdateRequestHandler,
  requisition: requisitionHandler,
  exit_request: exitClearanceHandler,
};

export function getActionHandler(entityType: string): Handler | undefined {
  return HANDLERS[entityType];
}

export const ACTIONABLE_ENTITY_TYPES = Object.keys(HANDLERS);
