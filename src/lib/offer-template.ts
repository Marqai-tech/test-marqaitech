/**
 * Offer Template Rendering helpers (REQ-OFR-01)
 *
 * Renders an OfferTemplate.body (HTML/Markdown with {{placeholders}}) against
 * an Offer row to produce a self-contained HTML document.
 *
 * Supported placeholders (all optional unless noted):
 *   {{candidateName}}    — Offer.candidateName
 *   {{position}}         — Offer.position
 *   {{department}}       — Offer.department
 *   {{salary}}           — Offer.offeredSalary (formatted with thousands sep)
 *   {{currency}}         — Offer.offeredCurrency
 *   {{ctc}}              — Offer.offeredCTC (fallback to salary)
 *   {{joiningDate}}      — Offer.joiningDate (locale-formatted)
 *   {{probationDays}}    — Offer.probationPeriod
 *   {{reportingTo}}      — Offer.reportingTo
 *   {{companyName}}      — default "Marq AI Tech Pvt Ltd" if not provided
 *   {{todayDate}}        — current date (locale-formatted)
 */

export interface TemplateRenderInput {
  candidateName?: string | null;
  position?: string | null;
  department?: string | null;
  offeredSalary?: number | null;
  offeredCurrency?: string | null;
  offeredCTC?: number | null;
  joiningDate?: Date | string | null;
  probationPeriod?: number | null;
  reportingTo?: string | null;
  companyName?: string;
  todayDate?: Date;
}

export interface TemplateRenderOutput {
  html: string;
  headerHtml: string;
  footerHtml: string;
  missingPlaceholders: string[];
}

const KNOWN_PLACEHOLDERS = [
  'candidateName',
  'position',
  'department',
  'salary',
  'currency',
  'ctc',
  'joiningDate',
  'probationDays',
  'reportingTo',
  'companyName',
  'todayDate',
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('en-IN');
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function renderOfferTemplate(
  body: string,
  input: TemplateRenderInput
): TemplateRenderOutput {
  const companyName = input.companyName || 'Your Organization';
  const today = input.todayDate || new Date();

  const values: Record<string, string> = {
    candidateName: escapeHtml(input.candidateName || ''),
    position: escapeHtml(input.position || ''),
    department: escapeHtml(input.department || ''),
    salary: formatNumber(input.offeredSalary || undefined),
    currency: escapeHtml(input.offeredCurrency || 'INR'),
    ctc: formatNumber(input.offeredCTC ?? input.offeredSalary ?? undefined),
    joiningDate: formatDate(input.joiningDate),
    probationDays: input.probationPeriod ? String(input.probationPeriod) : '90',
    reportingTo: escapeHtml(input.reportingTo || ''),
    companyName: escapeHtml(companyName),
    todayDate: formatDate(today),
  };

  let rendered = body || '';
  const missing: string[] = [];

  for (const key of KNOWN_PLACEHOLDERS) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    if (re.test(rendered)) {
      // Reset lastIndex since we use the global flag
      re.lastIndex = 0;
      rendered = rendered.replace(re, values[key] || '');
      // If the value is empty, flag as missing
      if (!values[key]) missing.push(key);
    }
  }

  return {
    html: rendered,
    headerHtml: '',
    footerHtml: '',
    missingPlaceholders: Array.from(new Set(missing)),
  };
}

/**
 * Wrap a rendered template body inside a printable HTML envelope.
 * Useful for the preview page and the "generatedPdfUrl" HTML store.
 */
export function wrapRenderedOffer(
  renderedHtml: string,
  opts: { header?: string | null; footer?: string | null; title?: string } = {}
): string {
  const title = opts.title ? escapeHtml(opts.title) : 'Offer Letter';
  const header = opts.header || '';
  const footer = opts.footer || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; }
  .offer-header { border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .offer-header h1 { color: #1e3a8a; font-size: 24px; margin: 0 0 4px 0; }
  .offer-header h2 { color: #1e3a8a; font-size: 20px; margin: 0 0 4px 0; }
  .offer-header .company-name { color: #1e3a8a; font-size: 22px; font-weight: 700; margin: 0; }
  .offer-header .company-tagline { color: #64748b; font-size: 12px; margin: 2px 0 0 0; }
  .offer-header img { max-height: 70px; max-width: 200px; object-fit: contain; }
  .offer-header .header-left { flex: 1; min-width: 200px; }
  .offer-header .header-right { text-align: right; }
  .offer-footer { border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #64748b; }
  .offer-footer .footer-company { font-weight: 600; color: #475569; margin-bottom: 4px; }
  .offer-footer .footer-address { margin: 2px 0; }
  .offer-footer .footer-contact { margin: 4px 0; }
  .offer-footer .footer-confidential { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-style: italic; font-size: 11px; }
  .meta { color: #64748b; font-size: 13px; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  ${header ? `<div class="offer-header">${header}</div>` : ''}
  <main>
    ${renderedHtml}
  </main>
  ${footer ? `<div class="offer-footer">${footer}</div>` : ''}
</body>
</html>`;
}
