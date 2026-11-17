/**
 * Branded Email Template Renderer
 *
 * Professional, tenant-branded HTML email template with:
 *  - Company logo (or initial-monogram fallback)
 *  - Tenant brand color (header gradient + buttons + accents)
 *  - Status-aware color treatment (approved/rejected/pending/info)
 *  - Responsive layout (desktop + mobile)
 *  - Inline CSS for Gmail/Outlook compatibility
 *  - Plain-text alternative generator
 *  - HTML-escaped dynamic content
 *
 * This renderer is the single source of truth for outbound email UI.
 * The legacy `buildEmailHtml` in notification-render.ts delegates here
 * so all existing dispatch paths get the new design automatically.
 */

import { escapeHtml, renderPlaceholders } from './notification-render';

export type EmailStatus = 'approved' | 'rejected' | 'pending' | 'info' | 'warning' | 'welcome';

export interface TenantBranding {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface EmailSection {
  /** Optional small heading inside the body */
  heading?: string;
  /** Paragraph text (already escaped by caller, or plain text — will be escaped) */
  text?: string;
  /** Optional key→value detail rows rendered as a definition list */
  details?: Array<{ label: string; value: string }>;
}

export interface RenderEmailOptions {
  /** Email title (the H1 in the header band) */
  title: string;
  /** Pre-header text (the preview snippet shown in inbox list) */
  preheader?: string;
  /** Greeting line, e.g. "Hi Rahul," */
  greeting?: string;
  /** Body sections (paragraphs + detail blocks) */
  sections?: EmailSection[];
  /** Plain-text body fallback (used if sections not provided) */
  bodyText?: string;
  /** Status indicator → controls the accent color + status badge */
  status?: EmailStatus;
  /** Primary CTA button */
  primaryAction?: { label: string; url: string };
  /** Secondary CTA button (e.g. "View Details") */
  secondaryAction?: { label: string; url: string };
  /** Approve/Reject action buttons (for actionable notifications) */
  approvalActions?: { approveUrl: string; rejectUrl: string };
  /** Expiry notice for action links */
  actionExpiresAt?: string;
  /** Tenant branding */
  branding: TenantBranding;
  /** Footer note (small print) */
  footerNote?: string;
  /** App base URL for absolute links */
  appBaseUrl?: string;
}

const STATUS_CONFIG: Record<EmailStatus, { color: string; bg: string; label: string; icon: string }> = {
  approved: { color: '#059669', bg: '#ecfdf5', label: 'Approved', icon: '&#10003;' },
  rejected: { color: '#dc2626', bg: '#fef2f2', label: 'Rejected', icon: '&#10007;' },
  pending: { color: '#d97706', bg: '#fffbeb', label: 'Pending', icon: '&#9203;' },
  warning: { color: '#d97706', bg: '#fffbeb', label: 'Attention Required', icon: '&#9888;' },
  info: { color: '#2563eb', bg: '#eff6ff', label: 'Information', icon: '&#8505;' },
  welcome: { color: '#7c3aed', bg: '#f5f3ff', label: 'Welcome', icon: '&#10022;' },
};

/**
 * Resolve a brand color. Accepts hex (#rrggbb / #rgb), defaults to teal-green.
 * Returns the full hex string + a darker shade for gradients.
 */
function resolveBrandColor(input?: string | null): { primary: string; dark: string } {
  const fallback = { primary: '#10b981', dark: '#047857' };
  if (!input) return fallback;
  let hex = input.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) && !/^#[0-9a-fA-F]{3}$/.test(hex)) return fallback;
  // Expand #rgb → #rrggbb
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  // Darken by ~25% for gradient
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.max(0, Math.round(r * 0.65));
  const dg = Math.max(0, Math.round(g * 0.65));
  const db = Math.max(0, Math.round(b * 0.65));
  const dark = '#' + [dr, dg, db].map(x => x.toString(16).padStart(2, '0')).join('');
  return { primary: hex, dark };
}

/** Get the first initial (uppercase) for monogram fallback. */
function getInitial(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'H';
  return cleaned[0].toUpperCase();
}

/**
 * Build the branded header block: logo image if available, else a
 * colored monogram tile. Always shows the company name next to it.
 */
function buildHeader(branding: TenantBranding, brandColor: { primary: string; dark: string }): string {
  const name = escapeHtml(branding.name || 'HRMS');
  const logo = branding.logoUrl?.trim();
  if (logo) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;padding:8px 0;">
            <img src="${escapeHtml(logo)}" alt="${name}" style="height:40px;max-width:200px;display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
      </table>`;
  }
  // Monogram fallback
  const initial = getInitial(branding.name || 'H');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="vertical-align:middle;padding:8px 0;">
          <div style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;background:${brandColor.primary};color:#ffffff;border-radius:10px;font-size:20px;font-weight:700;vertical-align:middle;font-family:Arial,sans-serif;">${initial}</div>
          <span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:18px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">${name}</span>
        </td>
      </tr>
    </table>`;
}

/**
 * Build the status badge — a small pill shown next to the title.
 */
function buildStatusBadge(status?: EmailStatus): string {
  if (!status) return '';
  const cfg = STATUS_CONFIG[status];
  return `<span style="display:inline-block;margin-left:10px;padding:3px 10px;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}22;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;vertical-align:middle;font-family:Arial,sans-serif;">${cfg.icon} ${cfg.label}</span>`;
}

/**
 * Build the body sections — paragraphs + detail tables.
 */
function buildSections(sections: EmailSection[], bodyText?: string): string {
  if ((!sections || sections.length === 0) && bodyText) {
    // Legacy plain-text path: split on double-newlines into paragraphs
    return bodyText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.65;font-family:Arial,sans-serif;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
      .join('');
  }
  return (sections || []).map(section => {
    const parts: string[] = [];
    if (section.heading) {
      parts.push(`<h3 style="margin:0 0 10px;font-size:14px;font-weight:600;color:#0f172a;font-family:Arial,sans-serif;">${escapeHtml(section.heading)}</h3>`);
    }
    if (section.text) {
      parts.push(`<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.65;font-family:Arial,sans-serif;">${escapeHtml(section.text).replace(/\n/g, '<br />')}</p>`);
    }
    if (section.details && section.details.length > 0) {
      const rows = section.details.map(d => `
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:500;font-family:Arial,sans-serif;width:40%;vertical-align:top;">${escapeHtml(d.label)}</td>
          <td style="padding:6px 0 6px 12px;color:#0f172a;font-size:13px;font-weight:600;font-family:Arial,sans-serif;vertical-align:top;">${escapeHtml(d.value)}</td>
        </tr>`).join('');
      parts.push(`
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 14px;">
          <tbody>${rows}</tbody>
        </table>`);
    }
    return parts.join('');
  }).join('');
}

/**
 * Build the action buttons row.
 */
function buildActions(opts: RenderEmailOptions, brandColor: { primary: string; dark: string }): string {
  const buttons: string[] = [];
  if (opts.approvalActions) {
    buttons.push(`<a href="${escapeHtml(opts.approvalActions.approveUrl)}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,sans-serif;">&#10003;&nbsp; Approve</a>`);
    buttons.push(`<a href="${escapeHtml(opts.approvalActions.rejectUrl)}" style="display:inline-block;padding:12px 24px;background:#ffffff;color:#dc2626;text-decoration:none;border:1px solid #dc2626;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,sans-serif;margin-left:8px;">&#10007;&nbsp; Reject</a>`);
  }
  if (opts.primaryAction) {
    buttons.push(`<a href="${escapeHtml(opts.primaryAction.url)}" style="display:inline-block;padding:12px 26px;background:${brandColor.primary};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,sans-serif;">${escapeHtml(opts.primaryAction.label)}</a>`);
  }
  if (opts.secondaryAction) {
    const margin = buttons.length > 0 ? 'margin-left:8px;' : '';
    buttons.push(`<a href="${escapeHtml(opts.secondaryAction.url)}" style="display:inline-block;padding:12px 22px;background:#ffffff;color:${brandColor.dark};text-decoration:none;border:1px solid ${brandColor.dark}33;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,sans-serif;${margin}">${escapeHtml(opts.secondaryAction.label)}</a>`);
  }
  if (buttons.length === 0) return '';
  const expiryNote = opts.actionExpiresAt
    ? `<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">Action links expire on ${escapeHtml(opts.actionExpiresAt)}.</p>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px;"><tr><td>${buttons.join(' ')}</td></tr></table>${expiryNote}`;
}

/**
 * Build the footer block: company name + contact + copyright.
 */
function buildFooter(branding: TenantBranding, footerNote?: string): string {
  const name = escapeHtml(branding.name || 'HRMS');
  const contactParts: string[] = [];
  if (branding.email) contactParts.push(`<a href="mailto:${escapeHtml(branding.email)}" style="color:#64748b;text-decoration:none;">${escapeHtml(branding.email)}</a>`);
  if (branding.phone) contactParts.push(escapeHtml(branding.phone!));
  if (branding.website) {
    let url = branding.website;
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    contactParts.push(`<a href="${escapeHtml(url)}" style="color:#64748b;text-decoration:none;">${escapeHtml(branding.website)}</a>`);
  }
  const contactRow = contactParts.length > 0
    ? `<div style="margin:4px 0 0;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">${contactParts.join(' &nbsp;·&nbsp; ')}</div>`
    : '';
  const addressRow = branding.address
    ? `<div style="margin:4px 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">${escapeHtml(branding.address)}</div>`
    : '';
  const noteRow = footerNote
    ? `<div style="margin:10px 0 0;font-size:11px;color:#94a3b8;font-style:italic;font-family:Arial,sans-serif;">${escapeHtml(footerNote)}</div>`
    : '';
  const year = new Date().getFullYear();
  return `
    <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:18px;">
      <div style="font-size:13px;font-weight:600;color:#475569;font-family:Arial,sans-serif;">${name}</div>
      ${contactRow}
      ${addressRow}
      ${noteRow}
      <div style="margin:14px 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">&copy; ${year} ${name}. All rights reserved. Powered by 3Boxes HRMS.</div>
    </div>`;
}

/**
 * Render a complete branded HTML email.
 */
export function renderEmail(opts: RenderEmailOptions): string {
  const brandColor = resolveBrandColor(opts.branding.brandColor);
  const header = buildHeader(opts.branding, brandColor);
  const statusBadge = buildStatusBadge(opts.status);
  const body = buildSections(opts.sections || [], opts.bodyText);
  const actions = buildActions(opts, brandColor);
  const footer = buildFooter(opts.branding, opts.footerNote);
  const preheader = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>` : '';
  const greeting = opts.greeting ? `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:600;font-family:Arial,sans-serif;">${escapeHtml(opts.greeting)}</p>` : '';
  const statusAccent = opts.status ? STATUS_CONFIG[opts.status] : null;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.06);">
      <!-- Header band -->
      <tr><td style="background:linear-gradient(135deg,${brandColor.dark},${brandColor.primary});padding:22px 28px;">
        ${header.replace(/color:#0f172a/g, 'color:#ffffff').replace(/color:#ffffff;/g, 'color:#ffffff;').replace('<span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:18px;font-weight:700;color:#ffffff', '<span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:18px;font-weight:700;color:#ffffff')}
      </td></tr>
      <!-- Title strip -->
      <tr><td style="padding:24px 28px 0;">
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;line-height:1.35;font-family:Arial,sans-serif;">${escapeHtml(opts.title)}${statusBadge}</h1>
      </td></tr>
      ${statusAccent ? `<tr><td style="padding:14px 28px 0;"><div style="padding:10px 14px;background:${statusAccent.bg};border-left:3px solid ${statusAccent.color};border-radius:6px;font-size:13px;color:${statusAccent.color};font-weight:600;font-family:Arial,sans-serif;">${statusAccent.icon} ${statusAccent.label}</div></td></tr>` : ''}
      <!-- Body -->
      <tr><td style="padding:18px 28px 8px;">
        ${greeting}
        ${body}
        ${actions}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:8px 28px 24px;">
        ${footer}
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:12px 8px;text-align:center;font-size:10px;color:#94a3b8;font-family:Arial,sans-serif;">This is an automated message from ${escapeHtml(opts.branding.name || 'HRMS')}. Please do not reply directly to this email.</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Generate a plain-text alternative from the same options.
 * Critical for deliverability (spam filters penalize HTML-only emails).
 */
export function renderEmailText(opts: RenderEmailOptions): string {
  const lines: string[] = [];
  lines.push(opts.branding.name || 'HRMS');
  lines.push('='.repeat((opts.branding.name || 'HRMS').length));
  lines.push('');
  lines.push(opts.title);
  if (opts.status) lines.push(`[${STATUS_CONFIG[opts.status].label}]`);
  lines.push('');
  if (opts.greeting) lines.push(opts.greeting);
  lines.push('');
  if (opts.bodyText) {
    lines.push(opts.bodyText);
  } else if (opts.sections) {
    for (const s of opts.sections) {
      if (s.heading) { lines.push(s.heading); lines.push('-'.repeat(s.heading.length)); }
      if (s.text) lines.push(s.text);
      if (s.details) {
        for (const d of s.details) lines.push(`  ${d.label}: ${d.value}`);
      }
      lines.push('');
    }
  }
  if (opts.primaryAction) lines.push(`Action: ${opts.primaryAction.label} → ${opts.primaryAction.url}`);
  if (opts.secondaryAction) lines.push(`            ${opts.secondaryAction.label} → ${opts.secondaryAction.url}`);
  if (opts.approvalActions) {
    lines.push(`Approve: ${opts.approvalActions.approveUrl}`);
    lines.push(`Reject:  ${opts.approvalActions.rejectUrl}`);
  }
  if (opts.actionExpiresAt) lines.push(`Action links expire on ${opts.actionExpiresAt}.`);
  lines.push('');
  lines.push('---');
  lines.push(opts.branding.name || 'HRMS');
  if (opts.branding.email) lines.push(`Email: ${opts.branding.email}`);
  if (opts.branding.phone) lines.push(`Phone: ${opts.branding.phone}`);
  if (opts.branding.website) lines.push(`Web: ${opts.branding.website}`);
  if (opts.branding.address) lines.push(opts.branding.address);
  const year = new Date().getFullYear();
  lines.push(`(c) ${year} ${opts.branding.name || 'HRMS'}. All rights reserved.`);
  return lines.join('\n');
}

/**
 * Convenience: render an email from a plain-text body (the legacy shape
 * used by notification-center.ts). Returns just the HTML — callers that
 * need the plain-text version should call renderEmailText directly.
 */
export function buildBrandedEmail(opts: {
  title: string;
  bodyText: string;
  actionUrl?: string;
  approvalActions?: { approveUrl: string; rejectUrl: string };
  status?: EmailStatus;
  branding: TenantBranding;
  greeting?: string;
  actionExpiresAt?: string;
}): string {
  return renderEmail({
    title: opts.title,
    bodyText: opts.bodyText,
    status: opts.status,
    greeting: opts.greeting,
    branding: opts.branding,
    approvalActions: opts.approvalActions,
    actionExpiresAt: opts.actionExpiresAt,
    primaryAction: opts.actionUrl ? { label: 'View Details', url: opts.actionUrl } : undefined,
  });
}
