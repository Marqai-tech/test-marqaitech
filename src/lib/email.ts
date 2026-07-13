/**
 * Email service using Resend (https://resend.com)
 *
 * Set RESEND_API_KEY in your .env.local or Vercel environment variables.
 * If the key is missing, emails will be logged to console (dev mode).
 *
 * FROM address handling:
 *  - If EMAIL_FROM env var is set, that address is used.
 *  - Otherwise falls back to Resend's sandbox: onboarding@resend.dev
 *  - If a domain/sender verification error occurs, automatically retries
 *    with onboarding@resend.dev as the from address.
 */

import { Resend } from 'resend';

/** Resend's default sandbox domain — works without domain verification */
const RESEND_SANDBOX_FROM = 'onboarding@resend.dev';

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (resend) return resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[EmailService] RESEND_API_KEY not set — emails will be logged only.');
    return null;
  }
  resend = new Resend(apiKey);
  return resend;
}

/**
 * Check if an error is a domain / sender verification error from Resend.
 * These errors occur when the FROM address domain has not been verified.
 */
function isDomainVerificationError(error: unknown): boolean {
  if (!error) return false;

  // Resend returns errors as objects with a `message` and sometimes `name`
  const err = error as Record<string, unknown> | null;

  if (err?.message && typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('domain') ||
      msg.includes('verified') ||
      msg.includes('sender') ||
      msg.includes('not found') ||
      msg.includes('from address') ||
      msg.includes('validation_error')
    ) {
      return true;
    }
  }

  // Some Resend SDK errors expose a `name` field
  if (err?.name && typeof err.name === 'string') {
    const name = err.name.toLowerCase();
    if (name.includes('validation') || name.includes('forbidden')) {
      return true;
    }
  }

  return false;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via Resend.
 * Returns { success: boolean, error?: string, usedFallback?: boolean }
 *
 * If the primary FROM address triggers a domain-verification error,
 * the function automatically retries using onboarding@resend.dev.
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<{ success: boolean; error?: string; usedFallback?: boolean }> {
  const { to, subject, html, from } = params;

  // When EMAIL_FROM is not set, use the Resend sandbox domain as fallback
  const defaultFrom = process.env.EMAIL_FROM || RESEND_SANDBOX_FROM;
  const sender = from || defaultFrom;

  const client = getResendClient();

  if (!client) {
    // Dev mode: just log the email details
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    console.log(`[EmailService DEV] To: ${recipients} | Subject: ${subject}`);
    console.log(`[EmailService DEV] From: ${sender}`);
    // In dev mode, we consider it "sent" so the UI flow doesn't break
    return { success: true };
  }

  try {
    const result = await client.emails.send({
      from: sender,
      to,
      subject,
      html,
    });

    // Resend SDK v2+ returns { data, error } — check for API-level errors
    if (result.error) {
      console.error('[EmailService] Resend API error:', JSON.stringify(result.error, null, 2));

      // If this is a domain/sender verification error, retry with sandbox
      if (isDomainVerificationError(result.error) && sender !== RESEND_SANDBOX_FROM) {
        console.warn(
          `[EmailService] Domain verification failed for "${sender}". Retrying with ${RESEND_SANDBOX_FROM}...`,
        );
        return await sendWithFallback(client, { to, subject, html });
      }

      const errorMsg =
        (result.error as Record<string, unknown>)?.message?.toString() || 'Resend send failed';
      return { success: false, error: errorMsg };
    }

    const recipients = Array.isArray(to) ? to.join(', ') : to;
    console.log(
      `[EmailService] Email sent to ${recipients} — Subject: "${subject}" — From: "${sender}"`,
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[EmailService] Exception during send:', message, err);

    // If this looks like a domain verification error, retry with sandbox
    if (isDomainVerificationError(err) && sender !== RESEND_SANDBOX_FROM) {
      console.warn(
        `[EmailService] Domain verification exception for "${sender}". Retrying with ${RESEND_SANDBOX_FROM}...`,
      );
      return await sendWithFallback(client, { to, subject, html });
    }

    return { success: false, error: message };
  }
}

/**
 * Internal: attempt to send using the Resend sandbox FROM address.
 */
async function sendWithFallback(
  client: Resend,
  params: { to: string | string[]; subject: string; html: string },
): Promise<{ success: boolean; error?: string; usedFallback?: boolean }> {
  const { to, subject, html } = params;

  try {
    const result = await client.emails.send({
      from: RESEND_SANDBOX_FROM,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error(
        `[EmailService] Retry with ${RESEND_SANDBOX_FROM} also failed:`,
        JSON.stringify(result.error, null, 2),
      );
      const errorMsg =
        (result.error as Record<string, unknown>)?.message?.toString() ||
        'Resend send failed (sandbox retry)';
      return { success: false, error: errorMsg, usedFallback: true };
    }

    const recipients = Array.isArray(to) ? to.join(', ') : to;
    console.log(
      `[EmailService] Email sent via sandbox fallback to ${recipients} — Subject: "${subject}" — From: "${RESEND_SANDBOX_FROM}"`,
    );
    return { success: true, usedFallback: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EmailService] Exception during sandbox retry:`, message, err);
    return { success: false, error: message, usedFallback: true };
  }
}
