/**
 * Notification Center — Template rendering (Task 36)
 *
 * Generic {{Placeholder}} engine. Matching is normalized:
 * {{Employee_Name}}, {{employeeName}} and {{employee name}} are equivalent.
 * Unknown placeholders are left intact so admins can see them in previews.
 */

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function renderPlaceholders(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  if (!template) return '';
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(vars || {})) {
    if (v === null || v === undefined) continue;
    lookup.set(normalizeKey(k), String(v));
  }
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const value = lookup.get(normalizeKey(rawKey));
    return value !== undefined ? value : match; // keep unknown placeholders visible
  });
}

/** List placeholders used by a template (for the console editor UI). */
export function extractPlaceholders(template: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template || ''))) out.add(m[1].trim());
  return Array.from(out);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap a plain-text notification body into a branded, email-client-safe
 * HTML document. Action buttons (Approve/Reject) are rendered when an
 * actionUrl is provided — recipients act without opening the HRMS platform.
 *
 * ENHANCED: now delegates to the full branded template renderer in
 * email-template-renderer.ts. The legacy signature is preserved so all
 * existing dispatchNotification callers get the new design automatically.
 * Branding (logo, brandColor, contact) is fetched by notification-center.ts
 * and passed via the `branding` field. When branding is not provided, a
 * clean fallback with the company name only is used.
 */
export function buildEmailHtml(opts: {
  title: string;
  bodyText: string;
  actionUrl?: string;
  companyName?: string;
  expiresAt?: string;
  branding?: {
    name: string;
    logoUrl?: string | null;
    brandColor?: string | null;
    website?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  status?: 'approved' | 'rejected' | 'pending' | 'info' | 'warning' | 'welcome';
  greeting?: string;
}): string {
  const { title, bodyText, actionUrl, companyName = '3Boxes HRMS', expiresAt, branding, status, greeting } = opts;
  // Lazy import to avoid circular dependency at module-load time
  const { buildBrandedEmail } = require('./email-template-renderer');
  return buildBrandedEmail({
    title,
    bodyText,
    actionUrl,
    status,
    greeting,
    actionExpiresAt: expiresAt,
    approvalActions: actionUrl ? {
      approveUrl: actionUrl + (actionUrl.includes('?') ? '&' : '?') + 'action=approve',
      rejectUrl: actionUrl + (actionUrl.includes('?') ? '&' : '?') + 'action=reject',
    } : undefined,
    branding: branding || { name: companyName },
  });
}
