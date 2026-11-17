/**
 * Task 157 — Feed broadcast: when an HR/Admin raises or updates a feed post,
 * every active employee gets (a) an in-app notification (which also surfaces
 * on the mobile app via its notifications sync) and (b) an email.
 *
 * Reuses the existing `core_hr.announcement.published` notification template
 * (default channels: in_app + email) through dispatchNotification, so the
 * sends are logged in NotificationDelivery and admins can tune/re-route the
 * event from the Notification Center templates console.
 */
import { dispatchNotification } from '@/lib/notification-center';

const MAX_RECIPIENTS = 1000;
const BODY_PREVIEW_LIMIT = 1500;

/* Loose structural reader (same posture as feed-permissions' SettingsReader):
 * keeps the tenant-scoped PrismaClient assignable without importing the
 * generated types here. */
export interface FeedBroadcastDb {
  user: { findMany: (a: any) => Promise<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface FeedBroadcastPost {
  id: string;
  content: string;
  postType?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  achievement: 'Achievement',
  birthday: 'Birthday',
  welcome: 'Welcome',
  policy: 'Policy Update',
  event: 'Event',
  general: 'Update',
};

/**
 * Fan out a feed post to ALL active users of the tenant (every employee with
 * a login, plus admin logins — "email to all the employees, notification for
 * all the users"). `mode: 'published'` → new post; `mode: 'updated'` → post
 * was edited. Never throws — broadcast failures are logged and returned.
 */
export async function broadcastFeedPost(params: {
  db: FeedBroadcastDb;
  tenantId: string | null;
  post: FeedBroadcastPost;
  authorName: string;
  mode: 'published' | 'updated';
}): Promise<{ notified: number; skipped: boolean; reason?: string }> {
  const { db, tenantId, post, authorName, mode } = params;
  if (!tenantId) return { notified: 0, skipped: true, reason: 'no tenant' };

  try {
    const users = await db.user.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
      take: MAX_RECIPIENTS,
    }) as Array<{ id: string; name: string | null }>;
    const recipients = users
      .filter(u => typeof u.id === 'string' && u.id)
      .map(u => ({ userId: u.id, name: (u.name || '').trim() || undefined }));
    if (recipients.length === 0) return { notified: 0, skipped: true, reason: 'no recipients' };

    const typeLabel = TYPE_LABELS[post.postType || 'general'] || 'Update';
    const title = mode === 'published'
      ? `New ${typeLabel} from ${authorName}`
      : `${typeLabel} updated by ${authorName}`;
    const plain = String(post.content || '').replace(/\s+/g, ' ').trim();
    const bodyPreview = plain.length > BODY_PREVIEW_LIMIT ? `${plain.slice(0, BODY_PREVIEW_LIMIT)}…` : plain;

    await dispatchNotification({
      tenantId,
      module: 'core_hr',
      eventKey: 'core_hr.announcement.published',
      recipients,
      vars: {
        Announcement_Title: title,
        Announcement_Body: bodyPreview,
      },
      entity: { type: 'social_post', id: post.id, link: '/social-feed' },
    });

    return { notified: recipients.length, skipped: false };
  } catch (e) {
    console.error('[feed-broadcast] failed:', e);
    return { notified: 0, skipped: true, reason: e instanceof Error ? e.message : 'broadcast failed' };
  }
}
