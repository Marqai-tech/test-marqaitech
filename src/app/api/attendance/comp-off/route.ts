/**
 * Comp-Off Leave API — REQ-OT-03
 * Lists comp-offs earned by the employee; supports marking as used.
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const where: Record<string, unknown> = {};
    if (!isAdminRole(user.role)) {
      const emp = await findEmployeeByEmail(user.email, db);
      if (!emp) return ok({ compOffs: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;

    const items = await db.compOffLeave.findMany({
      where,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      orderBy: { earnedDate: 'desc' },
      take: 200,
    });
    return ok({ compOffs: items });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load', 500);
  }
}

/**
 * POST /api/attendance/comp-off — grant a comp-off on behalf of an employee (admin/HR).
 * Previously this endpoint had NO POST handler, so Apply-by-HR submissions
 * returned an empty 405 response and the client failed with
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 *
 * Comp-off balances are normally earned via approved overtime; this admin
 * endpoint lets HR credit a balance directly (e.g. worked on a holiday/weekend).
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    if (!isAdminRole(user.role)) {
      return fail('Comp-offs are earned automatically via approved overtime requests. Contact HR to request a manual comp-off credit.', 403);
    }

    // Resolve the target employee (body.employeeId = HR-on-behalf selection;
    // fall back to the caller's own employee record when omitted).
    const onBehalfId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    let emp: { id: string; companyId: string | null; firstName: string; lastName: string } | null = null;
    if (onBehalfId) {
      emp = await db.employee.findUnique({
        where: { id: onBehalfId },
        select: { id: true, companyId: true, firstName: true, lastName: true },
      });
      if (!emp) return fail('Selected employee not found', 404);
    } else {
      emp = await findEmployeeByEmail(user.email, db);
    }
    if (!emp) return fail('Employee record not found', 404);

    const earnedDate = new Date(body.date as string);
    if (isNaN(earnedDate.getTime())) return fail('Invalid comp-off date');
    const hours = Math.min(12, Math.max(0.5, Number(body.hours) || 8));

    // Derive the source tag from what the earned date actually was:
    // company holiday → holiday_work, weekend → weekend_work, else overtime.
    // Holiday match compares calendar-day strings over a ±1 day window so
    // timezone storage shifts cannot hide the holiday.
    let source = 'overtime';
    const dow = earnedDate.getDay();
    if (dow === 0 || dow === 6) source = 'weekend_work';
    try {
      if (emp.companyId) {
        const winStart = new Date(earnedDate); winStart.setDate(winStart.getDate() - 1);
        winStart.setHours(0, 0, 0, 0);
        const winEnd = new Date(earnedDate); winEnd.setDate(winEnd.getDate() + 1);
        winEnd.setHours(23, 59, 59, 999);
        const holidays = await db.holiday.findMany({
          where: { companyId: emp.companyId, date: { gte: winStart, lte: winEnd } },
          select: { date: true },
        });
        const targetKey = earnedDate.toDateString();
        if (holidays.some(h => new Date(h.date).toDateString() === targetKey)) source = 'holiday_work';
      }
    } catch (sourceErr) {
      console.warn('[comp-off] source derivation failed (non-fatal):', sourceErr);
    }

    const record = await db.compOffLeave.create({
      data: {
        employeeId: emp.id,
        earnedDate,
        hours,
        source,
        expiryDate: new Date(earnedDate.getTime() + 90 * 24 * 60 * 60 * 1000), // 90-day expiry
        status: 'active',
      },
    });
    return ok({ compOff: record }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
