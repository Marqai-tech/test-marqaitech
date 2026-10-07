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
    const usable = (value: unknown) => {
      const s = value as Record<string, unknown> | null;
      return !!s?.emailIntegrationEnabled && !!s.smtpHost && !!s.smtpUsername && !!s.smtpPassword;
    };
    const settings = await (db as any).collaborationSettings?.findFirst?.({ where: { tenantId } });
    if (usable(settings)) return settings as Record<string, unknown>;

    // Some local/shared-DB setups persist tenant settings on the platform
    // client while workflow requests resolve through a tenant client. Re-read
    // the same tenant record from the platform client before falling back to
    // development logging.
    const platformSettings = await (getPlatformDb() as any).collaborationSettings?.findFirst?.({ where: { tenantId } });
    if (usable(platformSettings)) return platformSettings as Record<string, unknown>;
    return null;
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
  const envSettings = {
    emailIntegrationEnabled: true,
    emailProvider: 'smtp',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpUsername: process.env.SMTP_USERNAME,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpEncryption: process.env.SMTP_ENCRYPTION || 'ssl',
    smtpFromName: process.env.SMTP_FROM_NAME,
    smtpFromAddress: process.env.SMTP_FROM_EMAIL,
  };
  if (envSettings.smtpHost && envSettings.smtpUsername && envSettings.smtpPassword) {
    try {
      const res = await sendPerTenantEmail(envSettings as any, params);
      if (res.success) return { success: true };
      console.warn(`[NotificationCenter] Local SMTP fallback failed (${(res as any).error})`);
    } catch (e) {
      console.warn(`[NotificationCenter] Local SMTP fallback error: ${(e as Error).message}`);
    }
  }
  return sendGlobalEmail(params);
}

// Re-export for callers that already know they want the global sender
export { sendGlobalEmail };
