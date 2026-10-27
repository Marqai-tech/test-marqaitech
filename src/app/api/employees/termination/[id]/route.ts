import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { loadEmployeeSetting } from '@/lib/employee-config';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request); const token = getTokenFromHeaders(request); if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers }); const decoded = await verifyToken(token); if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers });
  const lifecycle: any = await loadEmployeeSetting(db, request, 'employee_termination_config', { allowedRoles: ['super_admin', 'tenant_admin', 'ceo', 'admin'], finalStatus: 'terminated', deactivateAccount: true }); const role = decoded.role as string; if (!(lifecycle.allowedRoles || ['super_admin','tenant_admin', 'ceo','admin']).includes(role)) return NextResponse.json({ error: 'You are not authorized to decide termination requests' }, { status: 403, headers });
  const id = (await params).id; const body = await request.json(); const action = body.action; if (!['approve','reject','settlement'].includes(action)) return NextResponse.json({ error: 'Action must be approve, reject, or settlement' }, { status: 400, headers });
  const row = (await db.$queryRawUnsafe(`SELECT t.*,e."userId" AS "employeeUserId",u."email" AS "employeeEmail" FROM "Termination" t JOIN "Employee" e ON e."id"=t."employeeId" LEFT JOIN "User" u ON u."id"=e."userId" WHERE t."id"=$1 LIMIT 1`, id) as any[])[0]; if (!row) return NextResponse.json({ error: 'Termination request not found' }, { status: 404, headers });
  const userId = decoded.userId as string; const now = new Date(); const { sanitizeMultiLineText } = await import('@/lib/sanitize');
  const notifyDecision = async (title: string, message: string, type: 'info' | 'warning') => {
    const tenantId = (decoded as any).tenantId;
    if (!tenantId) return;
    const roleUsers = await db.user.findMany({ where: { tenantId, role: { in: lifecycle.notificationRoles || ['super_admin', 'tenant_admin', 'admin'] }, status: 'active' }, select: { id: true, email: true } }).catch(() => [] as { id: string; email: string | null }[]);
    const recipientIds = new Set<string>([row.employeeUserId, row.submittedById, ...roleUsers.map((u: { id: string }) => u.id)].filter(Boolean) as string[]);
    const recipientEmails = new Set<string>([row.employeeEmail, ...roleUsers.map((u: { email: string | null }) => u.email)].filter(Boolean) as string[]);
    // Task 161: create in-app + send email via sendNotificationEmail so
    // isEmailSent is tracked. Build a map of userId → email for pairing.
    const emailMap = new Map<string, string>();
    for (const u of roleUsers) { if (u.id && u.email) emailMap.set(u.id, u.email); }
    if (row.employeeUserId && row.employeeEmail) emailMap.set(row.employeeUserId, row.employeeEmail);
    await Promise.all(
      [...recipientIds].map(async (recipientId) => {
        const notif = await createNotification({ tenantId, userId: recipientId, title, message, type, category: 'employee_lifecycle', link: '/employees/termination' }).catch(() => null);
        const email = emailMap.get(recipientId);
        if (notif?.id && email) {
          try {
            const html = await buildBrandedEmailForTenant(tenantId, { title, bodyText: message });
            await sendNotificationEmail(db, tenantId, notif, email, title, html);
          } catch { /* non-fatal */ }
        }
      }),
    );
  };
  if (action === 'reject') { const reason = sanitizeMultiLineText(body.rejectionReason, 2000); if (!reason) return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400, headers }); await db.$executeRawUnsafe(`UPDATE "Termination" SET "status"='rejected',"rejectionReason"=$1,"approvedById"=$2,"decisionDate"=NOW(),"updatedAt"=NOW(),"approvalHistory"=COALESCE("approvalHistory",'[]'::jsonb)||$3::jsonb WHERE "id"=$4 AND "status" IN ('pending','approved')`, reason, userId, JSON.stringify([{ action:'rejected', userId, at: now.toISOString(), reason }]), id); try { await db.auditLog.create({ data: { userId, action:'REJECT_TERMINATION_REQUEST', module:'employees', details:`Rejected termination ${id}: ${reason}` } }); } catch {} await notifyDecision('Termination Request Rejected', `Termination request ${id} was rejected. Reason: ${reason}`, 'info'); return NextResponse.json({ success:true, status:'rejected' }, { headers }); }
  if (action === 'settlement') { const settlementStatus = String(body.settlementStatus || ''); const allowed = ['pending_payroll_review','pending_approval','approved','processing','processed','returned_for_correction']; if (!allowed.includes(settlementStatus)) return NextResponse.json({ error: 'Invalid settlement status' }, { status: 400, headers }); await db.$executeRawUnsafe(`UPDATE "Termination" SET "settlementStatus"=$1,"settlementAmount"=$2,"settlementDeductions"=$3,"updatedAt"=NOW(),"approvalHistory"=COALESCE("approvalHistory",'[]'::jsonb)||$4::jsonb WHERE "id"=$5`, settlementStatus, body.settlementAmount ?? null, body.settlementDeductions ?? null, JSON.stringify([{ action:'settlement_'+settlementStatus, userId, at:now.toISOString() }]), id); try { await db.auditLog.create({ data:{ userId, action:'UPDATE_TERMINATION_SETTLEMENT', module:'employees', details:`Termination ${id} settlement moved to ${settlementStatus}` } }); } catch {} return NextResponse.json({ success:true, settlementStatus }, { headers }); }
  if (row.status !== 'pending') return NextResponse.json({ error: `This request is already ${row.status}.` }, { status: 409, headers }); const effective = row.terminationDate && new Date(row.terminationDate) <= now; const nextStatus = effective ? 'completed' : 'approved'; await db.$executeRawUnsafe(`UPDATE "Termination" SET "status"=$1,"approvedById"=$2,"approvedAt"=NOW(),"decisionDate"=NOW(),"updatedAt"=NOW(),"approvalHistory"=COALESCE("approvalHistory",'[]'::jsonb)||$3::jsonb WHERE "id"=$4`, nextStatus, userId, JSON.stringify([{ action:'approved', userId, at:now.toISOString(), effective }]), id); if (effective) { await db.$executeRawUnsafe(`UPDATE "Employee" SET "status"=$1,"updatedAt"=NOW() WHERE "id"=$2`, lifecycle.finalStatus || 'terminated', row.employeeId); if (row.employeeUserId && lifecycle.deactivateAccount) await db.$executeRawUnsafe(`UPDATE "User" SET "status"='inactive',"updatedAt"=NOW() WHERE "id"=$1`, row.employeeUserId); } try { await db.auditLog.create({ data:{ userId, action:'APPROVE_TERMINATION_REQUEST', module:'employees', details:`Approved termination ${id}; status ${nextStatus}` } }); } catch {} await notifyDecision('Termination Request Approved', `Termination request ${id} was approved effective ${new Date(row.terminationDate).toLocaleDateString()}.`, 'warning'); return NextResponse.json({ success:true, status:nextStatus, effective }, { headers });
}
