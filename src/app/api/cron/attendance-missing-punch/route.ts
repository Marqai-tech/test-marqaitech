/**
 * Missing Punch Weekly Alert Cron (Task 36)
 *
 *   GET /api/cron/attendance-missing-punch?secret=CRON_SECRET
 *
 * Weekly sweep (run Monday morning) of the previous week's attendance rows
 * that are neither present-with-punches, weekend, holiday nor on-leave —
 * i.e. missing clock-in/out records. Notifies the employee + their manager
 * and prompts regularization. Deduped per employee per week via the
 * NotificationDelivery log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { dispatchNotification } from '@/lib/notification-center';

const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

function lastWeekRange(now: Date): { start: Date; end: Date; label: string } {
  const day = now.getDay(); // 0 = Sun
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(now); thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);
  const start = new Date(thisMonday); start.setDate(start.getDate() - 7);
  const end = new Date(thisMonday); end.setMilliseconds(-1);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const bearer = request.headers.get('authorization');
    const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;
    if (searchParams.get('secret') !== CRON_SECRET && bearerToken !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const platformDb = getPlatformDb();
    const tenants = await platformDb.tenant.findMany({ where: { status: 'active' }, select: { id: true, name: true } });
    const { start, end, label } = lastWeekRange(new Date());

    let alertsSent = 0;
    const details: any[] = [];

    for (const tenant of tenants) {
      try {
        const db = await getDbForTenantById(tenant.id);
        alertsSent += await sweepTenant(db, tenant.id, tenant.name, start, end, label, details);
      } catch (e) {
        console.warn(`[MissingPunchCron] tenant ${tenant.id} failed: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ success: true, alertsSent, weekRange: label, details, checkedAt: new Date().toISOString() }, { headers: cors() });
  } catch (error) {
    console.error('Missing punch cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

async function sweepTenant(
  db: any, tenantId: string, tenantName: string,
  start: Date, end: Date, label: string, details: any[],
): Promise<number> {
  const rows = await db.attendance.findMany({
    where: {
      date: { gte: start, lte: end },
      status: { in: ['present', 'late', 'half_day', 'absent'] },
      OR: [{ checkIn: null }, { checkOut: null }],
    },
    select: { id: true, date: true, checkIn: true, checkOut: true, employeeId: true, employee: { select: { userId: true, firstName: true, lastName: true, managerId: true } } },
    take: 1000,
  }).catch(() => []);
  if (!rows.length) return 0;

  // Group by employee
  const byEmployee = new Map<string, { dates: string[]; emp: any }>();
  for (const r of rows) {
    const key = r.employeeId;
    if (!byEmployee.has(key)) byEmployee.set(key, { dates: [], emp: r.employee });
    byEmployee.get(key)!.dates.push(new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  }

  let sent = 0;
  for (const [employeeId, { dates, emp }] of byEmployee) {
    const weekEntityId = `${employeeId}:${start.toISOString().slice(0, 10)}`;
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'An employee';
    const vars = {
      Employee_Name: empName,
      Missed_Dates: dates.join(', '),
      Week_Range: label,
    };

    const recipients: any[] = [];
    if (emp.userId) recipients.push({ userId: emp.userId, name: empName });
    if (emp.managerId) {
      const mgr = await db.employee.findUnique({ where: { id: emp.managerId }, select: { userId: true, firstName: true, lastName: true } }).catch(() => null);
      if (mgr?.userId) recipients.push({ userId: mgr.userId, name: `${mgr.firstName || ''} ${mgr.lastName || ''}`.trim() });
    }
    if (!recipients.length) continue;

    // Dedupe per employee per week
    const already = await db.notificationDelivery.count({
      where: { eventKey: 'attendance.missing_punch', entityType: 'attendance_week', entityId: weekEntityId, createdAt: { gte: new Date(Date.now() - 6 * 24 * 3600 * 1000) } },
    }).catch(() => 1);
    if (already > 0) continue;

    const res = await dispatchNotification({
      tenantId, module: 'attendance', eventKey: 'attendance.missing_punch',
      recipients, vars,
      entity: { type: 'attendance_week', id: weekEntityId, link: '/attendance' },
    });
    sent += res.deliveries.filter((d) => d.status === 'sent').length;
    details.push({ tenant: tenantName, employee: empName, missed: dates.length });
  }
  return sent;
}
