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
 */
export function buildEmailHtml(opts: {
  title: string;
  bodyText: string;
  actionUrl?: string;
  companyName?: string;
  expiresAt?: string;
}): string {
  const { title, bodyText, actionUrl, companyName = '3Boxes HRMS', expiresAt } = opts;
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      `<p style="margin:0 0 14px;white-space:pre-line;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(p)}</p>`,
    )
    .join('');

  const buttons = actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>
        <td style="padding-right:10px;"><a href="${actionUrl}&action=approve" style="display:inline-block;padding:12px 26px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">&#10003; Approve</a></td>
        <td><a href="${actionUrl}&action=reject" style="display:inline-block;padding:12px 26px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">&#10007; Reject</a></td>
      </tr></table>
      ${expiresAt ? `<p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Action links expire on ${escapeHtml(expiresAt)}.</p>` : ''}`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#065f46,#10b981);border-radius:14px 14px 0 0;padding:22px 28px;">
      <div style="color:rgba(255,255,255,.85);font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(companyName)}</div>
      <div style="color:#ffffff;font-size:19px;font-weight:700;margin-top:4px;line-height:1.35;">${escapeHtml(title)}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:26px 28px 22px;box-shadow:0 6px 24px rgba(15,23,42,.08);">
      ${paragraphs}
      ${buttons}
      <div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:14px;font-size:11px;color:#94a3b8;">
        Sent by ${escapeHtml(companyName)} via 3Boxes HRMS · People · Process · Technology
      </div>
    </div>
  </div>
</body></html>`;
}
