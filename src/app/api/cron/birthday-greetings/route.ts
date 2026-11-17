import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  ensureBirthdayTables, birthdayMonthDay, istToday, deliverBirthdayGreeting,
} from '@/lib/birthday-greetings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUILD_STAMP = 'task136-birthday-greetings-2026-10-24';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function authorized(request: Request, searchParams: URLSearchParams) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization')?.trim();
  if (header === `Bearer ${secret}`) return true;
  if (searchParams.get('secret') === secret) return true;
  return false;
}

/**
 * Task 136 — daily AUTO birthday greetings.
 * Runs every morning (Vercel cron): sweeps every dedicated tenant DB, finds
 * ACTIVE employees whose ORIGINAL birthday (month/day, year-agnostic) is
 * TODAY in IST, and sends each exactly ONE automatic greeting per year —
 * a small greeting-card email + an in-app bell notification — recording a
 * BirthdayGreeting row (source='auto') as the dedupe key.
 *
 * Auth mode 1 — Vercel Cron: `Authorization: Bearer $CRON_SECRET` (or ?secret=).
 * Auth mode 2 — admin/HR JWT: sweeps ONLY the caller's tenant (manual
 * "run now" verification from the app).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isCronSecret = authorized(request, searchParams);

    let adminTenantId: string | null = null;
    if (!isCronSecret) {
      try {
        const decoded = (await verifyToken(getTokenFromHeaders(request) || '')) as { role?: string; tenantId?: string | null } | null;
        const role = decoded?.role || '';
        if (['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(role)) {
          adminTenantId = decoded?.tenantId || null;
        }
      } catch { /* fall through to unauthorized */ }
    }

    if (!isCronSecret && !adminTenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const platformDb = getPlatformDb();
    const dedicated = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { tenantId: true, tenant: { select: { name: true, slug: true, status: true } } },
    });
    let tenants = dedicated
      .filter((d: any) => d.tenant?.status === 'active')
      .map((d: any) => ({ id: d.tenantId, name: d.tenant?.name || d.tenant?.slug || d.tenantId }));

    const sweepAll = isCronSecret || !adminTenantId;
    if (!sweepAll) tenants = tenants.filter((t: { id: string }) => t.id === adminTenantId);

    const { year } = istToday();
    const todayMd = birthdayMonthDay(new Date(`${istToday().dateKey}T00:00:00Z`))!;
    const details: any[] = [];
    let greetingsSent = 0;
    let emails = 0;
    let notifications = 0;

    for (const tenant of tenants) {
      try {
        const db = await getDbForTenantById(tenant.id);
        const ddlErrors = await ensureBirthdayTables(db);

        // Task 138 — effective birthday = Original Birthday ?? Date of Birth,
        // so employees whose Original Birthday was never filled still get the
        // automatic annual greeting (taken from the Date of Birth).
        const employees = await db.employee.findMany({
          where: { status: 'active', OR: [{ originalBirthday: { not: null } }, { dateOfBirth: { not: null } }] },
          select: { id: true, firstName: true, lastName: true, email: true, userId: true, originalBirthday: true, dateOfBirth: true },
        });
        const birthdayPeople = employees.filter((e: any) => {
          const md = birthdayMonthDay(e.originalBirthday || e.dateOfBirth);
          return md && md.month === todayMd.month && md.day === todayMd.day;
        });

        const tenantResult: any = {
          tenant: tenant.name,
          birthdays: birthdayPeople.length,
          greetingsSent: 0,
          emails: 0,
          notifications: 0,
          errors: [...ddlErrors],
        };

        for (const emp of birthdayPeople) {
          // One automatic greeting per employee per year (rerun-safe).
          const already = await db.birthdayGreeting.findFirst({
            where: { employeeId: emp.id, year, source: 'auto' },
          }).catch(() => null);
          if (already) continue;

          const res = await deliverBirthdayGreeting({
            db,
            tenantId: tenant.id,
            tenantName: tenant.name,
            employee: emp,
            year,
            source: 'auto',
            senderName: `${tenant.name || 'The team'} (automatic)`,
            message: null,
          });
          if (res.row) {
            tenantResult.greetingsSent += 1;
            greetingsSent += 1;
          }
          tenantResult.emails += res.emails;
          tenantResult.notifications += res.notifications;
          emails += res.emails;
          notifications += res.notifications;
          if (res.errors.length) tenantResult.errors.push(...res.errors);
        }

        details.push(tenantResult);
      } catch (e) {
        details.push({ tenant: tenant.name, error: (e as Error).message });
        console.warn(`[BirthdayCron] tenant ${tenant.id} failed: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      buildStamp: BUILD_STAMP,
      mode: sweepAll ? 'all_tenants' : 'admin_single_tenant',
      date: istToday().dateKey,
      tenantsSwept: tenants.length,
      birthdaysFound: details.reduce((a: number, d: any) => a + (d.birthdays || 0), 0),
      greetingsSent,
      emails,
      notifications,
      details,
      checkedAt: new Date().toISOString(),
    }, { headers: cors() });
  } catch (error) {
    console.error('Birthday greetings cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
