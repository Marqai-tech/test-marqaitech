import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { loadEmployeeSetting } from '@/lib/employee-config';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers }); }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request); const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const decoded = await verifyToken(token); if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers });
  const config: any = await loadEmployeeSetting(db, request, 'employee_rejoin_config', { allowedRoles: ['super_admin', 'tenant_admin', 'admin'], finalStatus: 'active', reactivateAccount: true });
  if (!(config.allowedRoles || ['super_admin', 'tenant_admin', 'admin']).includes(decoded.role as string)) return NextResponse.json({ error: 'You are not authorized to decide rejoin requests' }, { status: 403, headers });
  const id = (await params).id, body = await request.json(), action = body.action;
  const rows = await db.$queryRawUnsafe(`SELECT r.*, e."userId" AS "employeeUserId" FROM "Rejoin" r JOIN "Employee" e ON e."id"=r."employeeId" WHERE r."id"=$1 LIMIT 1`, id) as any[];
  const row = rows[0]; if (!row) return NextResponse.json({ error: 'Rejoin request not found' }, { status: 404, headers });
  const userId = decoded.userId as string, now = new Date();
  if (action === 'reject') {
    const { sanitizeMultiLineText } = await import('@/lib/sanitize'); const reason = sanitizeMultiLineText(body.rejectionReason, 2000);
    if (!reason) return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400, headers });
    await db.$executeRawUnsafe(`UPDATE "Rejoin" SET "status"='rejected',"rejectionReason"=$1,"approvedById"=$2,"decisionDate"=NOW(),"updatedAt"=NOW(),"approvalHistory"=COALESCE("approvalHistory",'[]'::jsonb)||$3::jsonb WHERE "id"=$4 AND "status"='pending'`, reason, userId, JSON.stringify([{ action: 'rejected', userId, at: now.toISOString(), reason }]), id);
    try { await db.auditLog.create({ data: { userId, action: 'REJECT_REJOIN_REQUEST', module: 'employees', details: `Rejected rejoin ${id}: ${reason}` } }); } catch {}
    if ((decoded as any).tenantId && row.employeeUserId) await createNotification({ tenantId: (decoded as any).tenantId, userId: row.employeeUserId, title: 'Rejoin Request Rejected', message: `Your rejoin request was rejected. Reason: ${reason}`, type: 'info', category: 'employee_lifecycle', link: '/employees/rejoin' }).catch(() => {});
    return NextResponse.json({ success: true, status: 'rejected' }, { headers });
  }
  if (action !== 'approve') return NextResponse.json({ error: 'Action must be approve or reject' }, { status: 400, headers });
  if (row.status !== 'pending') return NextResponse.json({ error: `This request is already ${row.status}.` }, { status: 409, headers });
  const effective = new Date(row.rejoinDate) <= now, nextStatus = effective ? 'completed' : 'approved';
  await db.$executeRawUnsafe(`UPDATE "Rejoin" SET "status"=$1,"approvedById"=$2,"approvedAt"=NOW(),"decisionDate"=NOW(),"updatedAt"=NOW(),"approvalHistory"=COALESCE("approvalHistory",'[]'::jsonb)||$3::jsonb WHERE "id"=$4`, nextStatus, userId, JSON.stringify([{ action: 'approved', userId, at: now.toISOString(), effective }]), id);
  if (effective) {
    const sets = ['"status"=$1', '"updatedAt"=NOW()']; const values: any[] = [config.finalStatus || 'active'];
    if (row.newDepartmentId) { values.push(row.newDepartmentId); sets.push(`"departmentId"=$${values.length}`); }
    if (row.newDesignationId) { values.push(row.newDesignationId); sets.push(`"designationId"=$${values.length}`); }
    if (row.newEmployeeCode) { values.push(row.newEmployeeCode); sets.push(`"employeeId"=$${values.length}`); }
    let managerId = row.reportingManagerId || null;
    if (!managerId && row.reportingManager) { const manager = await db.$queryRawUnsafe(`SELECT "id" FROM "Employee" WHERE CONCAT("firstName",' ',"lastName")=$1 AND "status"='active' LIMIT 1`, row.reportingManager) as any[]; managerId = manager[0]?.id || null; }
    if (managerId) { values.push(managerId); sets.push(`"reportingManagerId"=$${values.length}`); }
    values.push(row.employeeId); await db.$executeRawUnsafe(`UPDATE "Employee" SET ${sets.join(',')} WHERE "id"=$${values.length}`, ...values);
    if (row.employeeUserId && config.reactivateAccount) await db.$executeRawUnsafe(`UPDATE "User" SET "status"='active',"updatedAt"=NOW() WHERE "id"=$1`, row.employeeUserId);
  }
  try { await db.auditLog.create({ data: { userId, action: 'APPROVE_REJOIN_REQUEST', module: 'employees', details: `Approved rejoin ${id}; status ${nextStatus}` } }); } catch {}
  if ((decoded as any).tenantId && row.employeeUserId) await createNotification({ tenantId: (decoded as any).tenantId, userId: row.employeeUserId, title: 'Rejoin Request Approved', message: `Your rejoin request is approved effective ${new Date(row.rejoinDate).toLocaleDateString()}.`, type: 'success', category: 'employee_lifecycle', link: '/employees/rejoin' }).catch(() => {});
  return NextResponse.json({ success: true, status: nextStatus, effective }, { headers });
}
