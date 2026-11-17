import { dispatchNotification, type NotificationRecipient } from '@/lib/notification-center';

type Db = any;

function fmtDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export async function dispatchOvertimeEvent(
  db: Db,
  tenantId: string,
  eventKey: string,
  request: any,
  submittedByName: string,
  approverName = '',
  comments = '',
  origin?: string,
) {
  try {
    const employee = request.employee || {};
    const employeeName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee';
    const recipients: NotificationRecipient[] = [];

    if (eventKey === 'attendance.overtime.submitted') {
      if (request.managerUserId) recipients.push({ userId: request.managerUserId });
      if (!request.managerUserId && request.managerEmail) recipients.push({ email: request.managerEmail, name: request.managerName || 'Reporting Manager' });
    } else if (eventKey === 'attendance.overtime.submission_confirmation') {
      if (employee.userId) recipients.push({ userId: employee.userId, name: employeeName });
    } else {
      if (employee.userId) recipients.push({ userId: employee.userId, name: employeeName });
      const hrUsers = await db.user.findMany({
        where: { role: { in: ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'] }, status: 'active' },
        select: { id: true }, take: 25,
      }).catch(() => []);
      for (const hr of hrUsers) if (!recipients.some(r => r.userId === hr.id)) recipients.push({ userId: hr.id });
    }

    if (!recipients.length) return;
    await dispatchNotification({
      tenantId,
      module: 'attendance',
      eventKey,
      recipients,
      vars: {
        Employee_Name: employeeName,
        Requested_For: employeeName,
        Submitted_By: submittedByName || 'Employee',
        Request_Date: fmtDate(request.date),
        OT_Start: fmtTime(request.startTime),
        OT_End: fmtTime(request.endTime),
        Duration: `${request.estimatedHours} hour${request.estimatedHours === 1 ? '' : 's'}`,
        Reason: request.reason || '—',
        Approver_Name: approverName || 'the approver',
        Status: request.status || 'pending',
        Comment: comments || '—',
      },
      entity: { type: 'overtime_request', id: request.id, link: '/attendance/overtime' },
      origin,
    });
  } catch (error) {
    console.warn('[overtime-notify] dispatch failed (non-fatal):', error instanceof Error ? error.message : error);
  }
}
