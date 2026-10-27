/**
 * Notification Center — Template rendering (Task 36)
 *
 * Generic {{Placeholder}} engine. Matching is normalized:
 * {{Employee_Name}}, {{employeeName}} and {{employee name}} are equivalent.
 * Unknown placeholders are left intact so admins can see them in previews.
 */

import { TenantBranding, DEFAULT_TENANT_BRANDING, safeHexColor, lightenColor } from '@/lib/tenant-branding';

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
 * REQ 5 (tenant-branded emails): the layout now accepts a `branding` param
 * (TenantBranding) which controls:
 *   - the company logo in the header (rendered as an <img> when logo is set)
 *   - the header gradient (primaryColor → accentColor)
 *   - the footer "Sent by" line
 * When branding is null/omitted, defaults are used (3Boxes HRMS green).
 *
 * Tenant isolation: callers MUST pass the resolved branding for the
 * current tenant — never reuse branding across tenants. The notification
 * center dispatch path fetches branding once per dispatch and threads it
 * through.
 */
export function buildEmailHtml(opts: {
  title: string;
  bodyText?: string;
  /** Pre-rendered HTML body — when supplied, replaces the auto-generated
   *  paragraphs from bodyText. Used to wrap existing rich HTML emails (OTP,
   *  birthday, suspicious-punch, etc.) in the branded template without
   *  re-escaping their content. Caller is responsible for escaping. */
  bodyHtml?: string;
  actionUrl?: string;
  companyName?: string;
  expiresAt?: string;
  /** Tenant branding — pass the result of getTenantBranding(tenantId). */
  branding?: TenantBranding | null;
}): string {
  const { title, bodyText, bodyHtml, actionUrl, expiresAt } = opts;
  // Backward-compat: when no branding is passed, fall back to defaults so
  // existing callers don't break. New callers should always pass branding.
  const branding: TenantBranding = opts.branding || DEFAULT_TENANT_BRANDING;
  const companyName = opts.companyName || branding.name || '3Boxes HRMS';
  const primary = safeHexColor(branding.primaryColor, DEFAULT_TENANT_BRANDING.primaryColor);
  const accent = safeHexColor(branding.accentColor, DEFAULT_TENANT_BRANDING.accentColor);
  const footerTint = lightenColor(primary, 0.92);

  // Logo block: render an <img> when a logo URL is available, else skip.
  // The logo is rendered at 32px height to fit cleanly in the header band.
  const logoHtml = branding.logo
    ? `<img src="${escapeHtml(branding.logo)}" alt="${escapeHtml(companyName)}" style="height:32px;width:auto;max-width:160px;object-fit:contain;display:block;margin-bottom:6px;" />`
    : '';

  // bodyHtml takes precedence (caller-supplied rich HTML); otherwise split
  // bodyText into escaped paragraphs.
  const bodyContent = bodyHtml
    ? bodyHtml
    : (bodyText || '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) =>
          `<p style="margin:0 0 14px;white-space:pre-line;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(p)}</p>`,
        )
        .join('');

  const buttons = actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>
        <td style="padding-right:10px;"><a href="${actionUrl}&action=approve" style="display:inline-block;padding:12px 26px;background:${accent};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">&#10003; Approve</a></td>
        <td><a href="${actionUrl}&action=reject" style="display:inline-block;padding:12px 26px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">&#10007; Reject</a></td>
      </tr></table>
      ${expiresAt ? `<p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Action links expire on ${escapeHtml(expiresAt)}.</p>` : ''}`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,${primary},${accent});border-radius:14px 14px 0 0;padding:22px 28px;">
      ${logoHtml}
      <div style="color:rgba(255,255,255,.85);font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(companyName)}</div>
      <div style="color:#ffffff;font-size:19px;font-weight:700;margin-top:4px;line-height:1.35;">${escapeHtml(title)}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:26px 28px 22px;box-shadow:0 6px 24px rgba(15,23,42,.08);">
      ${bodyContent}
      ${buttons}
      <div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:14px;font-size:11px;color:#94a3b8;background:${footerTint};margin:-20px -28px -22px;padding:14px 28px;border-radius:0 0 14px 14px;">
        Sent by ${escapeHtml(companyName)} via 3Boxes HRMS · People · Process · Technology
      </div>
    </div>
  </div>
</body></html>`;
}
