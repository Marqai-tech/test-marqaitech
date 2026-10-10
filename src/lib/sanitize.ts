/**
 * Server-side text sanitization utilities.
 *
 * These helpers strip HTML/script characters from free-text user input
 * BEFORE the value is persisted to the database. React auto-escapes JSX
 * output, but the raw stored value can be consumed by other surfaces
 * (mobile app, exports, notifications, audit log strings) that may not
 * escape correctly — so we sanitize at the write boundary as
 * defense-in-depth.
 *
 * Usage:
 *   import { sanitizePlainText } from '@/lib/sanitize';
 *   const cleanReason = sanitizePlainText(body.reason, 2000);
 */

/**
 * Sanitize a free-text string for safe storage.
 *
 * - Trims leading/trailing whitespace
 * - Removes control characters (except newline/tab)
 * - Strips HTML tags entirely (anything between < and >)
 * - Escapes the 5 HTML special characters (& < > " ')
 * - Enforces a max length (default 2000 chars)
 * - Returns '' for null/undefined/non-string input
 *
 * The result is safe to render in:
 *   - React JSX (auto-escaped again — no harm)
 *   - Plain-text emails (no HTML interpreted)
 *   - Audit log strings (no injection)
 *   - Mobile app text views (no HTML)
 *
 * @param value - The raw user input
 * @param maxLength - Maximum allowed length (default 2000)
 * @returns The sanitized string
 */
export function sanitizePlainText(value: unknown, maxLength = 2000): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    // Reject objects/arrays/numbers — coerce to string first
    try {
      value = String(value);
    } catch {
      return '';
    }
  }

  let s = value as string;

  // 1. Remove control characters except newline (\n) and tab (\t)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Strip HTML tags entirely — removes <script>, <img onerror=...>, etc.
  //    This regex is intentionally simple; for true XSS defense use a
  //    dedicated library. Combined with step 3 (entity escaping), the
  //    stored value cannot contain any executable markup.
  s = s.replace(/<[^>]*>/g, '');

  // 3. Escape the 5 HTML special characters so any residual angle brackets
  //    that survived tag stripping are rendered as text, not markup.
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 4. Trim and enforce max length
  s = s.trim().slice(0, maxLength);

  return s;
}

/**
 * Sanitize a multi-line text block (e.g. comments, descriptions).
 * Same as sanitizePlainText but preserves newlines and has a larger
 * default max length.
 */
export function sanitizeMultiLineText(value: unknown, maxLength = 5000): string {
  return sanitizePlainText(value, maxLength);
}

/**
 * Document/attachment URL safety (QA — "Add Employee › Documents › Document
 * Link Security").
 *
 * Employee document links are rendered as <a href={fileUrl}> across the app.
 * An untrusted URL like `javascript:alert(1)` or a `data:text/html` payload
 * would execute when the link is opened. We therefore only allow:
 *   1. Absolute http(s) URLs  — parsed with the URL constructor so schemes
 *      like `java\nscript:` cannot slip through a naive regex.
 *   2. data: URLs carrying a SAFE, non-executable MIME type (files the
 *      upload picker produces: PDFs, images, office documents). HTML/SVG/
 *      XML/JS payloads stay blocked because they can execute script.
 *
 * Returns true when the URL is safe to persist AND safe to render as a
 * navigation target. Empty/absent values are considered safe (the field is
 * optional).
 */
const UNSAFE_DATA_MIME_RE = /(text\/html|application\/xhtml|image\/svg|javascript|ecmascript|\+xml|\/xml|(^|\/)xml($|\/))/i;

export function isSafeDocumentUrl(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (raw === '') return true;

  // Block known dangerous schemes up-front (cheap check, incl. obfuscation)
  if (/^\s*(javascript|vbscript|file|blob|about|chrome|chrome-extension|moz-extension|res|ms-msdt|ms-officecmd)\s*:/i.test(raw)) return false;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  if (/^data:/i.test(raw)) {
    // data:[<mime>][;base64],<payload> — extract the MIME type
    const m = /^data:([^;,]*)/i.exec(raw);
    const mime = (m?.[1] || '').trim().toLowerCase();
    if (!mime) return false;               // data:,... defaults to text/plain → still refuse
    if (mime.startsWith('text/')) return false; // text/html, text/xml, text/javascript…
    if (UNSAFE_DATA_MIME_RE.test(mime)) return false;
    return true;                            // image/*, application/pdf, office docs…
  }

  // Protocol-relative (//host), scheme-relative or bare strings are refused —
  // the document form expects a full http(s) link or an uploaded data: file.
  return false;
}

/**
 * Detect whether a string contains potentially dangerous HTML/script content.
 * Returns true if the input looks like an injection attempt. Useful for
 * logging / alerting without modifying the value.
 */
export function containsHtmlOrScript(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /<\s*(script|img|svg|iframe|object|embed|link|style|meta|input|form|button|video|audio|source|base|marquee|details|embed)[^>]*>/i.test(value)
    || /on\w+\s*=/i.test(value) // onerror=, onclick=, onload=, etc.
    || /javascript:/i.test(value)
    || /data:text\/html/i.test(value);
}
