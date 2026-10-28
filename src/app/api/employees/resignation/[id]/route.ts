import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { sanitizeMultiLineText } from '@/lib/sanitize';
import { createNotification } from '@/lib/notifications';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action || '').toLowerCase();
    const comments = sanitizeMultiLineText(body.comments || body.rejectionReason, 2000);
    if (!['approve', 'reject'].includes(action)) return NextResponse.json({ error: 'Action must be approve or reject.' }, { status: 400 });
    if (action === 'reject' && !comments) return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "Resignation" WHERE "id"=$1 LIMIT 1`, id) as any[];
    const resignation = rows[0];
    if (!resignation) return NextResponse.json({ error: 'Resignation request not found.' }, { status: 404 });
    if (!['pending','pending_approval'].includes(resignation.status)) return NextResponse.json({ error: `Resignation request is already ${resignation.status}.` }, { status: 409 });
    const actorId = String((decoded as any).userId);
    const decisionDate = new Date();
    const history = Array.isArray(resignation.approvalHistory) ? resignation.approvalHistory : [];
    history.push({ action, actorId, comments: comments || null, decisionDate: decisionDate.toISOString() });
    const status = action === 'approve' ? 'approved' : 'rejected';
    await db.$executeRawUnsafe(`UPDATE "Resignation" SET "status"=$1,"approvedById"=$2,"approvedAt"=$3,"decisionDate"=$3,"rejectionReason"=$4,"approvalHistory"=$5::jsonb,"updatedAt"=NOW() WHERE "id"=$6`, status, actorId, decisionDate, action === 'reject' ? comments : null, JSON.stringify(history), id);
    if (action === 'approve') {
      // Approval records the decision immediately, but employment ends only on
      // the approved last-working date. Future-dated resignations must not
      // remove the employee's active access before that effective date.
      const lastWorkingDate = resignation.lastWorkingDate ? new Date(resignation.lastWorkingDate) : null;
      if (lastWorkingDate && lastWorkingDate <= new Date()) {
        await db.$executeRawUnsafe(`UPDATE "Employee" SET "status"='resigned' WHERE "id"=$1`, resignation.employeeId).catch(() => {});
      }
    }
    const empRows = await db.$queryRawUnsafe(`SELECT "userId","email" FROM "Employee" WHERE "id"=$1 LIMIT 1`, resignation.employeeId) as any[];
    const recipient = empRows[0];
    let notification: any = null;
    if (recipient) notification = await createNotification({ tenantId: String((decoded as any).tenantId || ''), userId: recipient.userId, title: action === 'approve' ? 'Resignation Approved' : 'Resignation Rejected', message: action === 'approve' ? `Your resignation was approved. Last working date: ${resignation.lastWorkingDate || 'TBD'}.` : `Your resignation was rejected. Reason: ${comments}`, type: 'info', category: 'employee_lifecycle', link: '/employees/resignation' }).catch(() => null);
    await db.auditLog.create({ data: { userId: actorId, action: action === 'approve' ? 'APPROVE_RESIGNATION_REQUEST' : 'REJECT_RESIGNATION_REQUEST', module: 'employees', details: JSON.stringify({ resignationId: id, employeeId: resignation.employeeId, comments, decisionDate }) } }).catch(() => null);
    return NextResponse.json({ success: true, status, decisionDate, rejectionReason: action === 'reject' ? comments : null, notification });
  } catch (error) {
    console.error('Resignation decision error:', error);
    return NextResponse.json({ error: 'Failed to process resignation decision' }, { status: 500 });
  }
}
