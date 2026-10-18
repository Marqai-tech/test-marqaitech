/**
 * Remote Check-In Permissions API — Task 108 (WFH pre-approval gating)
 *
 * Mobile-app punches (method 'mobile') and browser punches (method 'web')
 * are REMOTE channels: they work from anywhere, so they are only available
 * to employees who received an explicit work-from-home pre-approval from
 * admin/management. Office employees mark attendance on the biometric device.
 *
 *  GET   /api/attendance/remote-permissions           — list employees + their remote flags (admin)
 *  PATCH /api/attendance/remote-permissions           — update one employee's flags (admin)
 *          body: { employeeId, wfhPreApproved?, mobileCheckInEnabled?, webCheckInEnabled? }
 *
 * Every change is written to the audit log with the acting admin's id.
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { safeAuditLog } from '@/lib/audit-safe';
import { ensureEmployeeRemoteColumns } from '@/lib/employee-remote-columns';

export { OPTIONS };

const EMPLOYEE_SELECT = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  wfhPreApproved: true,
  mobileCheckInEnabled: true,
  webCheckInEnabled: true,
  department: { select: { name: true } },
  designation: { select: { title: true } },
} as const;

function shapeRow(emp: Record<string, unknown>) {
  const department = emp.department as { name?: string } | null | undefined;
  const designation = emp.designation as { title?: string } | null | undefined;
  return {
    id: emp.id,
    employeeId: emp.employeeId,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    status: emp.status,
    department: department?.name || null,
    designation: designation?.title || null,
    // Boolean-normalized: a DB without the new columns yields undefined →
    // false, so the UI shows the safe (disabled) state.
    wfhPreApproved: emp.wfhPreApproved === true,
    mobileCheckInEnabled: emp.mobileCheckInEnabled === true,
    webCheckInEnabled: emp.webCheckInEnabled === true,
  };
}

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Admin only', 403);
  try {
    // Tenant DBs are provisioned without the Task 108 columns — create them
    // on first use (idempotent, cached per client).
    await ensureEmployeeRemoteColumns(db);
    const employees = await db.employee.findMany({
      where: { status: 'active' },
      select: EMPLOYEE_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 1000,
    });
    return ok({ employees: employees.map(shapeRow) });
  } catch (e: unknown) {
    // Column-missing on a lagging DB — degrade to a plain list so the page
    // still renders (all flags shown as off) instead of erroring.
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist/i.test(msg)) {
      try {
        const employees = await db.employee.findMany({
          where: { status: 'active' },
          select: {
            id: true, employeeId: true, firstName: true, lastName: true, email: true, status: true,
            department: { select: { name: true } }, designation: { select: { title: true } },
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          take: 1000,
        });
        return ok({
          employees: employees.map((emp: Record<string, unknown>) => ({
            ...shapeRow(emp), wfhPreApproved: false, mobileCheckInEnabled: false, webCheckInEnabled: false,
          })),
          degraded: true,
        });
      } catch (e2: unknown) {
        return fail(e2 instanceof Error ? e2.message : 'Failed to load', 500);
      }
    }
    return fail(msg, 500);
  }
}

export async function PATCH(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Admin only — remote check-in pre-approval can only be changed by admin/management.', 403);
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    await ensureEmployeeRemoteColumns(db);
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) return fail('employeeId is required', 422);

    const updates: Record<string, boolean> = {};
    for (const key of ['wfhPreApproved', 'mobileCheckInEnabled', 'webCheckInEnabled'] as const) {
      if (typeof body[key] === 'boolean') updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      return fail('Nothing to update — provide wfhPreApproved / mobileCheckInEnabled / webCheckInEnabled', 422);
    }

    const existing = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, employeeId: true, firstName: true, lastName: true } });
    if (!existing) return fail('Employee not found', 404);

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: updates,
      select: EMPLOYEE_SELECT,
    });

    const changes = Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ');
    await safeAuditLog(db, {
      userId: user.id,
      action: 'REMOTE_CHECKIN_PERMISSION_UPDATED',
      module: 'attendance',
      details: `Remote check-in permissions for ${existing.firstName} ${existing.lastName} (${existing.employeeId}): ${changes}`,
    }).catch(() => null);

    return ok({ employee: shapeRow(updated as Record<string, unknown>) });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update', 500);
  }
}
