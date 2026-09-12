/**
 * AES-256-GCM field encryption for sensitive PM data
 * (employee cost rates, third-party integration tokens).
 *
 * Key management:
 *   - Primary: env var PM_ENCRYPTION_KEY (hex 64 chars = 32 bytes, or any passphrase → SHA-256 derived)
 *   - Fallback: deterministic key derived from the app secret salt (keeps dev/demo working
 *     without configuration; LIVE deployments should set PM_ENCRYPTION_KEY).
 *
 * Wire format:  v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>
 */

import crypto from 'crypto';

const FALLBACK_SECRET = '3boxes-pm-field-encryption-v1';

function getKey(): Buffer {
  const raw = process.env.PM_ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(`${raw || ''}${FALLBACK_SECRET}`, 'utf8').digest();
}

export function encryptField(plaintext: string | number | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const value = String(plaintext);
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
  } catch (e) {
    console.error('encryptField failed:', e);
    return null;
  }
}

export function decryptField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parts = String(payload).split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** Decrypt a numeric field; returns null when missing/unreadable. */
export function decryptNumber(payload: string | null | undefined): number | null {
  const s = decryptField(payload);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
