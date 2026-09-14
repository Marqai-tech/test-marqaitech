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
