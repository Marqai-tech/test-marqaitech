import { getDbForTenantById } from '@/lib/tenant-db';

type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'login' | 'logout' | 'workflow';
type NotificationCategory = 'system' | 'auth' | 'leave' | 'payroll' | 'recruitment' | 'performance' | 'workflow' | 'alert';

interface CreateNotificationParams {
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  category?: NotificationCategory;
  link?: string;
}

/**
 * Create an in-app notification in the TENANT database.
 *
 * Task 36 fix: this previously wrote to the platform DB (via @/lib/prisma),
 * which made notifications invisible for tenants with dedicated DBs
 * (GET /api/notifications reads from the tenant DB). All writes now route
 * through getDbForTenantById so the bell icon works for every tenant.
 */
export async function createNotification(params: CreateNotificationParams) {
  const { tenantId, userId, title, message, type = 'info', category = 'system', link } = params;

  try {
    const db = await getDbForTenantById(tenantId);
    const notification = await db.notification.create({
      data: {
        tenantId,
        userId,
        title,
        message,
        type,
        category,
        link,
        isRead: false,
        isEmailSent: false,
      },
    });
    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}

/**
 * Send a notification email AND update the in-app Notification's isEmailSent
 * flag on success.
 *
 * Task 161 fix: the rejoin/termination/transfer/probation workflows were
 * calling createNotification (in-app) + sendTenantEmail (email) separately.
 * The email was sent but isEmailSent stayed false forever because nothing
 * connected the two. This helper bridges that gap:
 *   1. Sends the email via sendTenantEmail (tenant SMTP → env SMTP → Resend)
 *   2. On success, updates Notification.isEmailSent = true via RAW SQL
 *   3. On failure, logs the error but doesn't throw (non-fatal)
 *
 * Usage:
 *   const notif = await createNotification({ tenantId, userId, title, message, ... });
 *   if (email) await sendNotificationEmail(db, tenantId, notif, email, title, html);
 */
export async function sendNotificationEmail(
  db: any,
  tenantId: string,
  notification: { id: string } | null,
  email: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!notification?.id || !email) return false;
  try {
    const { sendTenantEmail } = await import('@/lib/notification-channels');
    const res = await sendTenantEmail(db, tenantId, { to: email, subject, html });
    if (res.success) {
      // Update the isEmailSent flag via RAW SQL (avoids Prisma schema-drift issues)
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Notification" SET "isEmailSent" = true WHERE "id" = $1`,
          notification.id,
        );
      } catch { /* non-fatal — the email was sent, just the flag update failed */ }
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[sendNotificationEmail] failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
