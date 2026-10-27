/**
 * Task 142 — SMS delivery service (OTP sign-in codes + HR alerts).
 *
 * The mobile OTP previously delivered ONLY by email, so users who could not
 * reach their inbox never received a code ("OTP not getting to the mobile").
 * This module adds a pluggable SMS channel. The FIRST configured provider
 * wins; if nothing is configured, sendSms() reports success:false with a
 * clear reason so callers can surface an honest delivery status.
 *
 * Supported providers (env vars, checked in this order):
 *
 *  1. Twilio
 *     - TWILIO_ACCOUNT_SID      e.g. ACxxxxxxxx
 *     - TWILIO_AUTH_TOKEN
 *     - TWILIO_FROM_NUMBER      e.g. +15551234567
 *       (or TWILIO_MESSAGING_SERVICE_SID for service senders)
 *
 *  2. MSG91
 *     - MSG91_AUTH_KEY
 *     - MSG91_SENDER_ID         6-letter DLT sender, e.g. THRBOX
 *     - MSG91_TEMPLATE_ID       DLT template id (optional)
 *
 *  3. Generic HTTP gateway
 *     - SMS_HTTP_URL            POST {to, message, from?} JSON
 *     - SMS_HTTP_AUTH_HEADER    optional "Name: value" header pair
 *     - SMS_HTTP_FROM           optional sender id
 *
 * All requests are fire-and-forget-safe (never throw); the boolean result
 * tells the OTP route which channels actually went out so the mobile app
 * can show "code sent via SMS" / "check your email" / a fallback guidance.
 */

export interface SendSmsResult {
  success: boolean;
  provider?: 'twilio' | 'msg91' | 'http';
  error?: string;
}

function normalizeE164(raw: string, defaultDial = '91'): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (raw.trim().startsWith('+')) return `+${digits}`;
  // 10-digit local number → assume the default dial code (India for 3Boxes).
  if (digits.length === 10) return `+${defaultDial}${digits}`;
  return `+${digits}`;
}

async function sendViaTwilio(to: string, message: string): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !service)) {
    return { success: false, error: 'Twilio env vars incomplete' };
  }
  try {
    const body = new URLSearchParams({
      To: to,
      Body: message,
      ...(from ? { From: from } : {}),
      ...(service ? { MessagingServiceSid: service } : {}),
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (res.ok && data?.sid) return { success: true, provider: 'twilio' };
    return { success: false, error: `Twilio ${res.status}: ${data?.message || 'send failed'}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'twilio error' };
  }
}

async function sendViaMsg91(to: string, message: string): Promise<SendSmsResult> {
  const auth = process.env.MSG91_AUTH_KEY;
  const sender = process.env.MSG91_SENDER_ID || 'THRBOX';
  const template = process.env.MSG91_TEMPLATE_ID;
  if (!auth) return { success: false, error: 'MSG91_AUTH_KEY not set' };
  try {
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: template || undefined,
        short_url: '0',
        recipients: [
          {
            mobiles: to.replace('+', ''),
            MESSAGE: message,
            SENDER: sender,
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (res.ok && data?.type !== 'error') return { success: true, provider: 'msg91' };
    return { success: false, error: `MSG91: ${data?.message || 'send failed'}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'msg91 error' };
  }
}

async function sendViaHttpGateway(to: string, message: string): Promise<SendSmsResult> {
  const url = process.env.SMS_HTTP_URL;
  if (!url) return { success: false, error: 'SMS_HTTP_URL not set' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = process.env.SMS_HTTP_AUTH_HEADER;
  if (authHeader && authHeader.includes(':')) {
    const [name, ...rest] = authHeader.split(':');
    headers[name.trim()] = rest.join(':').trim();
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, message, from: process.env.SMS_HTTP_FROM || undefined }),
    });
    if (res.ok) return { success: true, provider: 'http' };
    return { success: false, error: `SMS gateway HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'sms gateway error' };
  }
}

/** True when ANY sms provider has enough env configuration to attempt a send. */
export function isSmsConfigured(): boolean {
  return Boolean(
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)) ||
      process.env.MSG91_AUTH_KEY ||
      process.env.SMS_HTTP_URL,
  );
}

/**
 * Send an SMS through the first configured provider.
 * `dialHint` (digits, e.g. "91") is used when the raw number has no + prefix
 * and is not a 10-digit local number.
 */
export async function sendSms(rawPhone: string, message: string, dialHint = '91'): Promise<SendSmsResult> {
  const to = normalizeE164(rawPhone, dialHint.replace(/\D/g, '') || '91');
  if (!to || to.replace(/\D/g, '').length < 8) {
    return { success: false, error: 'invalid destination number' };
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const t = await sendViaTwilio(to, message);
    if (t.success) return t;
    if (isSmsConfigured() && !process.env.MSG91_AUTH_KEY && !process.env.SMS_HTTP_URL) return t;
  }
  if (process.env.MSG91_AUTH_KEY) {
    const m = await sendViaMsg91(to, message);
    if (m.success) return m;
  }
  if (process.env.SMS_HTTP_URL) {
    return sendViaHttpGateway(to, message);
  }
  return { success: false, error: 'no SMS provider configured' };
}
