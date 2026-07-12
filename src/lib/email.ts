/**
 * Email service using Resend (https://resend.com)
 *
 * Set RESEND_API_KEY in your .env.local or Vercel environment variables.
 * If the key is missing, emails will be logged to console (dev mode).
 */

import { Resend } from 'resend';

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

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via Resend.
 * Returns { success: boolean, error?: string }
 */
export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  const { to, subject, html, from } = params;

  const defaultFrom = process.env.EMAIL_FROM || '3 Boxes HRMS <noreply@3boxeshrms.com>';
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
    const { error } = await client.emails.send({
      from: sender,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[EmailService] Resend error:', error);
      return { success: false, error: error.message || 'Resend send failed' };
    }

    const recipients = Array.isArray(to) ? to.join(', ') : to;
    console.log(`[EmailService] Email sent to ${recipients} — Subject: "${subject}"`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[EmailService] Exception:', message);
    return { success: false, error: message };
  }
}
