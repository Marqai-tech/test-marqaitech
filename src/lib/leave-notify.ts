/**
 * Leave notification helper (Task 36)
 *
 * Compact bridge between the leave routes and the Notification Center.
 * Builds the render vars from a LeaveRequest row (employee + type + dates)
 * and dispatches through the multi-channel engine.
 */
import { getPlatformDb } from '@/lib/tenant-db';
import { dispatchNotification } from '@/lib/notification-center';
import type { NotificationRecipient } from '@/lib/notification-center';

type PrismaClient = ReturnType<typeof getPlatformDb>;

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function dispatchLeaveEvent(
  db: PrismaClient,
  tenantId: string,
  eventKey: string,
  leaveRequest: any,
  approverUserId?: string | null,
  comments?: string | null,
  request?: Request | null,
  recipientUserIds?: (string | null | undefined)[] | null,
  extraVars?: Record<string, string | number | null | undefined>,
): Promise<void> {
  try {
    const employee = leaveRequest.employee || {};
    const empName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'An employee';
    const days = leaveRequest.startDate && leaveRequest.endDate
      ? Math.max(1, Math.round((new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / 86400000) + 1)
      : null;

    // Resolve the approver's name for the Approver_Name variable (best-effort)
    let approverName = 'Your approver';
    if (approverUserId) {
      try {
        const approver = await (db as any).user.findUnique({ where: { id: approverUserId }, select: { name: true, email: true } });
        if (approver?.name) approverName = approver.name;
        else if (approver?.email) approverName = approver.email;
      } catch { /* best-effort */ }
    }

    // Recipients: explicit ids → employee (result events) → role fallback.
    // The role fallback keeps approvals moving even when the workflow engine
    // cannot resolve a specific approver user (e.g. manager without a login).
    let recipients: NotificationRecipient[] = [];
    const explicit = (recipientUserIds || []).filter((x): x is string => !!x);
    if (explicit.length) {
      recipients = explicit.map((id) => ({ userId: id }));
    } else if (eventKey !== 'leave.applied' && employee.userId) {
      recipients = [{ userId: employee.userId, name: empName }];
    } else {
      try {
        const roleUsers = await db.user.findMany({
          where: { role: { in: ['hr_admin', 'admin', 'tenant_admin', 'company_hr_admin'] }, status: 'active' },
          select: { id: true },
          take: 10,
        });
        recipients = roleUsers.map((u: { id: string }) => ({ userId: u.id }));
      } catch { /* best-effort */ }
    }
    if (!recipients.length) return;

    const origin = request?.headers?.get?.('origin') || undefined;
    await dispatchNotification({
      tenantId,
      module: 'leave',
      eventKey,
      recipients,
      vars: {
        Employee_Name: empName,
        Leave_Type: leaveRequest.leaveType?.name || 'Leave',
        From_Date: fmtDate(leaveRequest.startDate),
        To_Date: fmtDate(leaveRequest.endDate),
        Days: days ? String(days) : '',
        Reason: leaveRequest.reason || '—',
        Approver_Name: approverName,
        Comment: comments ? `Approver comments: ${comments}` : '',
        ...extraVars,
      },
      entity: { type: 'leave_request', id: leaveRequest.id, link: '/leave' },
      origin,
    });
  } catch (e) {
    console.warn('[leave-notify] dispatch failed (non-fatal):', (e as Error).message);
  }
}
