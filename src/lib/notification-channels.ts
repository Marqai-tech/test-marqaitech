/**
 * Notification Center — Email channel (Task 36)
 *
 * Tenant-first email delivery: uses the tenant's CollaborationSettings
 * (SMTP / Google / Outlook / Resend) via email-sender.ts when configured and
 * enabled; otherwise falls back to the global Resend sender (email.ts).
 * Falls back to console logging in dev when neither is configured.
 */
import { getPlatformDb } from '@/lib/tenant-db';
import { sendEmail as sendPerTenantEmail } from '@/lib/email-sender';
import { sendEmail as sendGlobalEmail } from '@/lib/email';

type PrismaClient = ReturnType<typeof getPlatformDb>;

export interface ChannelEmailResult {
  success: boolean;
  error?: string;
  usedFallback?: boolean;
}

async function loadTenantMailSettings(db: PrismaClient, tenantId: string): Promise<Record<string, unknown> | null> {
  try {
    const settings = await (db as any).collaborationSettings?.findFirst?.({ where: { tenantId } });
    if (!settings) return null;
    const s = settings as Record<string, unknown>;
    // Only return when there is a usable, enabled configuration
    if (!s.emailIntegrationEnabled) return null;
    return s;
  } catch {
    return null;
  }
}

export async function sendTenantEmail(
  db: PrismaClient,
  tenantId: string,
  params: { to: string; subject: string; html: string },
): Promise<ChannelEmailResult> {
  const settings = await loadTenantMailSettings(db, tenantId);
  if (settings) {
    try {
      const res = await sendPerTenantEmail(settings as any, params);
      if (res.success) return { success: true };
      console.warn(`[NotificationCenter] Tenant email failed (${(res as any).error}) — trying global sender`);
    } catch (e) {
      console.warn(`[NotificationCenter] Tenant email error — trying global sender: ${(e as Error).message}`);
    }
  }
  return sendGlobalEmail(params);
}

// Re-export for callers that already know they want the global sender
export { sendGlobalEmail };
