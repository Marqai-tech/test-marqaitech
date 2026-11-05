import { getDb } from '@/lib/tenant-db';
import { NextRequest } from 'next/server';

/**
 * Daily L&D compliance & certification cron:
 *   1. Certificate expiry engine — alerts at 60 / 30 / 15 days before expiry
 *      (deduped via remindersSent JSON), escalation to the direct manager
 *      when the employee ignores the 15-day alert.
 *   2. Expired certificates → status 'expired'.
 *   3. Overdue mandatory enrollments → reminder (due date passed, not completed).
 *
 * Auth: ?secret=CRON_SECRET (or Authorization: Bearer). Non-fatal per row.
 */
const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (secret !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb(request);
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const summary = { certsScanned: 0, alerts60: 0, alerts30: 0, alerts15: 0, escalated: 0, markedExpired: 0, overdueReminders: 0, errors: 0 };

  try {
    // ── 1+2. Certificate expiry engine ────────────────────────────────────
    const certs = await db.certificate.findMany({
      where: { status: 'active', validUntil: { not: null } },
      include: { employee: { select: { id: true, userId: true, firstName: true, lastName: true, reportingManagerId: true } } },
    });
    const { dispatchNotification } = await import('@/lib/notification-center');

    // Resolve tenantId per user (Employee has no tenantId column; User does)
    const userIds = certs.map((c: { employee: { userId: string | null } }) => c.employee?.userId).filter(Boolean) as string[];
    const tenantByUser = new Map<string, string>();
    if (userIds.length) {
      const users = await db.user.findMany({ where: { id: { in: userIds.slice(0, 500) } }, select: { id: true, tenantId: true } });
      for (const u of users) if (u.tenantId) tenantByUser.set(u.id, u.tenantId);
    }

    for (const cert of certs) {
      summary.certsScanned++;
      try {
        const days = Math.ceil((new Date(cert.validUntil as unknown as string).getTime() - now) / DAY);
        const reminders = (cert.remindersSent || {}) as Record<string, string>;

        if (days <= 0) {
          await db.certificate.update({ where: { id: cert.id }, data: { status: 'expired' } });
          summary.markedExpired++;
          continue;
        }

        for (const threshold of [60, 30, 15]) {
          if (days <= threshold && !reminders[String(threshold)]) {
            const escalated = threshold === 15;
            const recipients: { userId: string; name?: string }[] = [];
            if (cert.employee?.userId) recipients.push({ userId: cert.employee.userId, name: `${cert.employee.firstName} ${cert.employee.lastName}` });

            if (escalated && cert.employee?.reportingManagerId) {
              const mgr = await db.employee.findUnique({
                where: { id: cert.employee.reportingManagerId },
                select: { userId: true, firstName: true, lastName: true },
              });
              if (mgr?.userId) {
                recipients.push({ userId: mgr.userId, name: `${mgr.firstName} ${mgr.lastName}` });
                summary.escalated++;
              }
            }
            await dispatchNotification({
              tenantId: (cert.employee?.userId && tenantByUser.get(cert.employee.userId)) || null,
              module: 'learning',
              eventKey: 'learning.compliance.reminder',
              recipients,
              vars: {
                Course_Name: `Certificate expiring in ${days} days: ${cert.title}`,
                Assigned_By: 'L&D Compliance Engine',
                Due_Date: new Date(cert.validUntil as unknown as string).toLocaleDateString('en-IN'),
                Mandatory: escalated ? 'ESCALATED to manager' : 'Renewal required',
              },
              entity: { type: 'certificate', id: cert.id, link: '/learning/certifications' },
            });
            reminders[String(threshold)] = new Date().toISOString();
            await db.certificate.update({ where: { id: cert.id }, data: { remindersSent: reminders } });
            if (threshold === 60) summary.alerts60++;
            if (threshold === 30) summary.alerts30++;
            if (threshold === 15) summary.alerts15++;
          }
        }
      } catch (e) {
        summary.errors++;
        console.error('[lnd-cron] certificate row failed:', e);
      }
    }

    // ── 3. Overdue mandatory enrollments ─────────────────────────────────
    const overdue = await db.courseEnrollment.findMany({
      where: { status: { in: ['assigned', 'in_progress'] }, dueDate: { lt: new Date() } },
      include: { employee: { select: { id: true, userId: true, firstName: true, lastName: true } }, course: { select: { title: true } } },
      take: 100,
    });
    const overdueUserIds = overdue.map((e: { employee: { userId: string | null } }) => e.employee?.userId).filter(Boolean) as string[];
    const tenantByUser2 = new Map<string, string>();
    if (overdueUserIds.length) {
      const users2 = await db.user.findMany({ where: { id: { in: overdueUserIds.slice(0, 500) } }, select: { id: true, tenantId: true } });
      for (const u of users2) if (u.tenantId) tenantByUser2.set(u.id, u.tenantId);
    }
    for (const e of overdue) {
      try {
        if (!e.employee?.userId) continue;
        await dispatchNotification({
          tenantId: (e.employee?.userId && tenantByUser2.get(e.employee.userId)) || null,
          module: 'learning',
          eventKey: 'learning.compliance.reminder',
          recipients: [{ userId: e.employee.userId, name: `${e.employee.firstName} ${e.employee.lastName}` }],
          vars: {
            Course_Name: `Overdue training: ${e.course?.title || 'Course'}`,
            Assigned_By: 'L&D',
            Due_Date: e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN') : 'Overdue',
            Mandatory: 'Yes',
          },
          entity: { type: 'course_enrollment', id: e.id, link: '/learning' },
        });
        summary.overdueReminders++;
      } catch (err) {
        summary.errors++;
        console.error('[lnd-cron] overdue row failed:', err);
      }
    }

    return Response.json({ success: true, ...summary });
  } catch (error) {
    console.error('[lnd-cron] fatal:', error);
    return Response.json({ success: false, error: 'Cron failed', ...summary }, { status: 500 });
  }
}
