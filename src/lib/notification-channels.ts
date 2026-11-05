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

// ─── Circuit breakers (Task 88) ────────────────────────────────────────────
// A broken tenant SMTP (changed password, blocked port — e.g. the webhostbox
// 535 auth failure) used to stall EVERY notification dispatch: each email
// retried the full SMTP handshake (~2-10s) and multi-recipient dispatches
// (approvals, reminder crons) blew past serverless time limits. After
// repeated failures we short-circuit that sender for CIRCUIT_OPEN_MS and go
// straight to the next fallback; any success resets the breaker instantly.
const SMTP_CIRCUIT_OPEN_MS = 5 * 60 * 1000;
const SMTP_CIRCUIT_THRESHOLD = 2; // consecutive failures before opening

const tenantSmtpBreakers = new Map<string, { fails: number; openedAt: number }>();
const envSmtpBreaker = { fails: 0, openedAt: 0 };
const globalSenderBreaker = { fails: 0, openedAt: 0 };

function isCircuitOpen(b: { fails: number; openedAt: number }): boolean {
  return b.fails >= SMTP_CIRCUIT_THRESHOLD && Date.now() - b.openedAt < SMTP_CIRCUIT_OPEN_MS;
}
function recordFailure(b: { fails: number; openedAt: number }) {
  b.fails += 1;
  b.openedAt = Date.now();
}
function recordSuccess(b: { fails: number; openedAt: number }) {
  b.fails = 0;
  b.openedAt = 0;
}
function tenantBreaker(tenantId: string) {
  let b = tenantSmtpBreakers.get(tenantId);
  if (!b) { b = { fails: 0, openedAt: 0 }; tenantSmtpBreakers.set(tenantId, b); }
  return b;
}

export async function sendTenantEmail(
  db: PrismaClient,
  tenantId: string,
  params: { to: string; subject: string; html: string },
): Promise<ChannelEmailResult> {
  // 1) Tenant CollaborationSettings SMTP — first choice (breaker-aware)
  const tb = tenantBreaker(tenantId);
  if (!isCircuitOpen(tb)) {
    const settings = await loadTenantMailSettings(db, tenantId);
    if (settings) {
      try {
        const res = await sendPerTenantEmail(settings as any, params);
        if (res.success) {
          recordSuccess(tb);
          return { success: true };
        }
        recordFailure(tb);
        console.warn(`[NotificationCenter] Tenant email failed (${(res as any).error}) — trying global sender`);
      } catch (e) {
        recordFailure(tb);
        console.warn(`[NotificationCenter] Tenant email error — trying global sender: ${(e as Error).message}`);
      }
    }
  } else {
    console.warn(`[NotificationCenter] Tenant SMTP circuit open for tenant ${tenantId} — skipping to fallback (will retry after ${SMTP_CIRCUIT_OPEN_MS / 60000} min)`);
  }

  // 2) Environment SMTP fallback (breaker-aware)
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
    if (!isCircuitOpen(envSmtpBreaker)) {
      try {
        const res = await sendPerTenantEmail(envSettings as any, params);
        if (res.success) {
          recordSuccess(envSmtpBreaker);
          return { success: true };
        }
        recordFailure(envSmtpBreaker);
        console.warn(`[NotificationCenter] Local SMTP fallback failed (${(res as any).error})`);
      } catch (e) {
        recordFailure(envSmtpBreaker);
        console.warn(`[NotificationCenter] Local SMTP fallback error: ${(e as Error).message}`);
      }
    }
  }

  // 3) Global Resend sender (breaker-aware — e.g. Resend sandbox mode only
  // delivers to the account owner, so repeated failures must not slow
  // every dispatch down)
  if (isCircuitOpen(globalSenderBreaker)) {
    return { success: false, error: 'Global email sender temporarily disabled after repeated failures (auto-retries in a few minutes)' };
  }
  const res = await sendGlobalEmail(params);
  if (res.success) recordSuccess(globalSenderBreaker);
  else recordFailure(globalSenderBreaker);
  return res;
}

// Re-export for callers that already know they want the global sender
export { sendGlobalEmail };
