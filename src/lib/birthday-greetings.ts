/**
 * Task 136 — Birthday greetings engine.
 *
 * Employees get TWO birth dates:
 *   • dateOfBirth       — the official "as per records" date (documents).
 *   • originalBirthday  — the REAL birth date; this is the one birthdays are
 *                         celebrated on (dashboard section + wishes + the
 *                         daily auto-greeting cron).
 *
 * Shared by:
 *   • GET  /api/birthdays            (dashboard section data)
 *   • POST /api/birthdays/wish       (manual "Send wishes" from any user)
 *   • GET  /api/cron/birthday-greetings (daily auto greetings, all tenants)
 */
import { sendTenantEmail } from '@/lib/notification-channels';
import { createNotification } from '@/lib/notifications';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

/** IST "today" — the birthday calendar for this product runs on India time
 *  regardless of where the Vercel region happens to be. */
export function istToday(): { year: number; month: number; day: number; dateKey: string } {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = nowIst.getUTCFullYear();
  const month = nowIst.getUTCMonth() + 1;
  const day = nowIst.getUTCDate();
  return { year, month, day, dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

/** Month/day of a stored birthday Date (UTC — rows are written from
 *  "YYYY-MM-DD" strings, so UTC getters return exactly what was entered). */
export function birthdayMonthDay(value: unknown): { month: number; day: number } | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return null;
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Whole self-healing DDL for older tenant DBs: the greeting table + the
 *  originalBirthday column (Neon serverless driver — one statement at a
 *  time). Never throws; problems surface as errors[] entries. */
export async function ensureBirthdayTables(db: any): Promise<string[]> {
  const errors: string[] = [];
  const statements = [
    `CREATE TABLE IF NOT EXISTS "BirthdayGreeting" (
      "id" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "senderUserId" TEXT,
      "senderName" TEXT,
      "message" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "BirthdayGreeting_employeeId_year_idx" ON "BirthdayGreeting"("employeeId", "year")`,
    `CREATE INDEX IF NOT EXISTS "BirthdayGreeting_year_idx" ON "BirthdayGreeting"("year")`,
    `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "originalBirthday" TIMESTAMP(3)`,
  ];
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (e: any) {
      errors.push(`ddl: ${e?.message || e}`);
    }
  }
  return errors;
}

/** Festive (but small) greeting-card email. */
export function birthdayCardHtml(params: {
  employeeName: string;
  tenantName: string;
  senderLine: string;
  message?: string | null;
}): string {
  const { employeeName, tenantName, senderLine, message } = params;
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;padding:20px">
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 60%,#f59e0b 100%);border-radius:16px;padding:26px 22px;text-align:center;color:#fff">
      <div style="font-size:40px;line-height:1">🎂</div>
      <h1 style="margin:10px 0 4px;font-size:22px;letter-spacing:.5px">Happy Birthday, ${employeeName}!</h1>
      <p style="margin:0;font-size:13px;opacity:.92">${tenantName ? `${tenantName} · ` : ''}Wishing you a wonderful year ahead</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:18px 22px;background:#fff">
      ${message ? `<p style="margin:0 0 10px;color:#334155;font-size:14px;font-style:italic">“${message}”</p>` : ''}
      <p style="margin:0;color:#64748b;font-size:12.5px">${senderLine}</p>
    </div>
  </div>`;
}

/** Deliver one greeting: greeting row + bell (if the employee has a login)
 *  + email. Returns per-channel diagnostics; never throws. */
export async function deliverBirthdayGreeting(params: {
  db: any;
  tenantId: string;
  tenantName: string;
  employee: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null; userId?: string | null };
  year: number;
  source: 'auto' | 'manual';
  senderUserId?: string | null;
  senderName: string;
  message?: string | null;
}): Promise<{ row: any | null; notifications: number; emails: number; errors: string[] }> {
  const { db, tenantId, tenantName, employee, year, source, senderUserId, senderName, message } = params;
  const errors: string[] = [];
  let row: any = null;
  let notifications = 0;
  let emails = 0;

  const first = (employee.firstName || '').trim();
  const fullName = `${first} ${employee.lastName || ''}`.trim() || 'there';

  try {
    row = await db.birthdayGreeting.create({
      data: {
        employeeId: employee.id,
        year,
        source,
        senderUserId: senderUserId || null,
        senderName: senderName || null,
        message: message || null,
      },
    });
  } catch (e: any) {
    errors.push(`greeting row: ${e?.message || e}`);
  }

  if (employee.userId) {
    try {
      const created = await createNotification({
        tenantId,
        userId: employee.userId,
        title: '🎂 Happy Birthday!',
        message:
          source === 'auto'
            ? `${tenantName || 'The team'} wishes you a very happy birthday! Enjoy your day, ${first || 'friend'}.`
            : `${senderName} sent you birthday wishes${message ? `: “${message}”` : ''}. Happy birthday, ${first || 'friend'}!`,
        link: '/dashboard',
        type: 'birthday',
        category: 'social',
      });
      if (created) notifications += 1;
      else errors.push('notification create returned null');
    } catch (e: any) {
      errors.push(`notification: ${e?.message || e}`);
    }
  }

  if (employee.email && String(employee.email).includes('@')) {
    try {
      // REQ 5 — wrap the festive birthday card in the tenant-branded template
      // (logo + colors + footer) so recipients see consistent tenant identity.
      const innerHtml = birthdayCardHtml({
        employeeName: first || fullName,
        tenantName,
        senderLine: source === 'auto' ? `— Your team at ${tenantName || 'the office'}` : `— With warm wishes from ${senderName}`,
        message,
      });
      const html = await buildBrandedEmailForTenant(tenantId, {
        title: `🎂 Happy Birthday, ${first || fullName}!`,
        bodyHtml: innerHtml,
      });
      const res = await sendTenantEmail(db, tenantId, {
        to: String(employee.email),
        subject: `🎂 Happy Birthday, ${first || fullName}!`,
        html,
      });
      if (res?.success) emails += 1;
      else errors.push(`email: ${res?.error || 'no channel'}`);
    } catch (e: any) {
      errors.push(`email: ${e?.message || e}`);
    }
  }

  return { row, notifications, emails, errors };
}
