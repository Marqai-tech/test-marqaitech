import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

interface OfferRow {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  department?: string | null;
  offeredSalary: number;
  offeredCurrency: string;
  offeredCTC?: number | null;
  joiningDate: string;
  probationPeriod: number;
  reportingTo?: string | null;
  status: string;
  templateId?: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  header?: string | null;
  footer?: string | null;
  clauses?: string | null;
  country: string;
  language: string;
}

interface BrandingRow {
  tenantId: string;
  logo?: string | null;
  companyName?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  colors?: string | null;
  signature?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  defaultFooterText?: string | null;
  legalNotice?: string | null;
  version?: number;
}

interface ColorSet { primary: string; secondary: string; }

function parseColors(s?: string | null): ColorSet {
  if (!s) return { primary: '#10b981', secondary: '#0f172a' };
  try {
    const p = JSON.parse(s);
    return {
      primary: typeof p.primary === 'string' ? p.primary : '#10b981',
      secondary: typeof p.secondary === 'string' ? p.secondary : '#0f172a',
    };
  } catch {
    return { primary: '#10b981', secondary: '#0f172a' };
  }
}

// Convert hex color (#RRGGBB) → RGB array
function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return [16, 185, 129]; // fallback emerald
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [Number.isFinite(r) ? r : 16, Number.isFinite(g) ? g : 185, Number.isFinite(b) ? b : 129];
}

// Format ISO date → "15 November 2026"
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

// Format currency like "INR 1,200,000"
function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—';
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

// Strip {{placeholders}} out of a template body and replace with offer values
function renderTemplate(body: string, offer: OfferRow, branding: BrandingRow, colors: ColorSet): string {
  const replacements: Record<string, string> = {
    candidateName: offer.candidateName || '',
    candidateEmail: offer.candidateEmail || '',
    position: offer.position || '',
    department: offer.department || '—',
    location: '—',
    employmentType: 'Full-time',
    salary: formatMoney(offer.offeredSalary, offer.offeredCurrency),
    ctc: offer.offeredCTC != null ? formatMoney(offer.offeredCTC, offer.offeredCurrency) : formatMoney(offer.offeredSalary * 12, offer.offeredCurrency),
    currency: offer.offeredCurrency || 'INR',
    joiningDate: formatDate(offer.joiningDate),
    probationDays: String(offer.probationPeriod || 90),
    reportingTo: offer.reportingTo || '—',
    noticePeriod: '30 days',
    companyName: branding.companyName || '',
    companyAddress: branding.address || '',
    companyEmail: branding.email || '',
    companyPhone: branding.phone || '',
    companyWebsite: branding.website || '',
    offerDate: formatDate(new Date().toISOString()),
    expiryDate: formatDate(new Date(Date.now() + 7 * 86400000).toISOString()),
  };
  let out = body;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return out;
}

/**
 * POST /api/offers/[id]/generate-branded-pdf
 *
 * Generates a real application/pdf file using jsPDF with:
 *   - Company logo (if branding.logo exists — embedded as image)
 *   - Header: company name, address, contact
 *   - Body: offer letter content (rendered from template)
 *   - Footer: legal notice + page number
 *   - Branded colors (primary/secondary from branding.colors)
 *
 * Returns: { pdfUrl (data URL), generatedAt, templateId, brandingVersion }
 *
 * On lock: once an offer is sent or accepted, this endpoint refuses to
 * regenerate — caller must create a new offer version instead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded as any).role || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can generate PDFs' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    const { id: offerId } = await params;

    // 1. Load offer
    const offerRows = await db.$queryRawUnsafe(
      `SELECT * FROM "Offer" WHERE "id" = $1 LIMIT 1`,
      offerId,
    ).catch(() => []) as any[];
    if (offerRows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }
    const offer: OfferRow = offerRows[0];

    // Lock check — once sent or accepted, refuse to regenerate
    if (['sent', 'accepted'].includes(offer.status)) {
      return NextResponse.json({
        error: `Cannot regenerate PDF — offer is already ${offer.status}. Create a new offer version if changes are required.`,
        code: 'OFFER_LOCKED',
      }, { status: 409, headers: corsHeaders() });
    }

    // 2. Load branding
    let branding: BrandingRow = {
      tenantId, logo: null, companyName: null, address: null, email: null,
      phone: null, website: null, colors: null, signature: null,
      signatoryName: null, signatoryDesignation: null,
      defaultFooterText: null, legalNotice: null, version: 0,
    };
    try {
      const brandRows = await db.$queryRawUnsafe(
        `SELECT * FROM "OfferBranding" WHERE "tenantId" = $1 LIMIT 1`,
        tenantId,
      ) as any[];
      if (brandRows.length > 0) branding = { ...branding[0] };
    } catch { /* table may not exist yet */ }

    // 3. Load template (if offer has one attached)
    let template: TemplateRow | null = null;
    if (offer.templateId) {
      try {
        const tplRows = await db.$queryRawUnsafe(
          `SELECT * FROM "OfferTemplate" WHERE "id" = $1 LIMIT 1`,
          offer.templateId,
        ) as any[];
        if (tplRows.length > 0) template = tplRows[0];
      } catch {}
    }

    // 4. Generate PDF with jsPDF
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const colors = parseColors(branding.colors);
    const [pr, pg, pb] = hexToRgb(colors.primary);
    const [sr, sg, sb] = hexToRgb(colors.secondary);

    // ─── Header (top of page 1) ───
    let y = margin;

    // Logo (if present as data URL)
    if (branding.logo && branding.logo.startsWith('data:image/')) {
      try {
        const m = branding.logo.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) {
          const fmt = m[1] === 'png' ? 'PNG' : m[1] === 'jpg' || m[1] === 'jpeg' ? 'JPEG' : 'PNG';
          const imgData = m[2];
          // Constrain to 60×60 box
          const logoSize = 50;
          doc.addImage(imgData, fmt, margin, y, logoSize, logoSize, undefined, 'FAST');
        }
      } catch { /* image add failed — continue */ }
    }

    // Company name + contact (right of logo)
    const headerX = branding.logo ? margin + 60 : margin;
    doc.setFontSize(16);
    doc.setTextColor(sr, sg, sb);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.companyName || 'Company Name', headerX, y + 14);

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    const contactLines: string[] = [];
    if (branding.address) contactLines.push(branding.address);
    const contactInfo = [
      branding.email, branding.phone, branding.website,
    ].filter(Boolean).join(' · ');
    if (contactInfo) contactLines.push(contactInfo);
    contactLines.forEach((line, i) => {
      doc.text(line, headerX, y + 28 + i * 11);
    });

    // Horizontal accent rule
    y += 60;
    doc.setDrawColor(pr, pg, pb);
    doc.setLineWidth(2);
    doc.line(margin, y, pageWidth - margin, y);

    // ─── Title ───
    y += 30;
    doc.setFontSize(20);
    doc.setTextColor(sr, sg, sb);
    doc.setFont('helvetica', 'bold');
    doc.text('Offer of Employment', margin, y);

    y += 20;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(`Offer Date: ${formatDate(new Date().toISOString())}`, margin, y);
    doc.text(`Reference: OFF-${offerId.slice(-8).toUpperCase()}`, pageWidth - margin - 150, y);

    // ─── Body ───
    y += 25;
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);

    // If we have a template body, render it; otherwise use a default body
    let bodyText: string;
    if (template?.body) {
      bodyText = renderTemplate(template.body, offer, branding, colors);
    } else {
      bodyText = `Dear ${offer.candidateName},

We are delighted to extend you an offer of employment for the position of ${offer.position}${offer.department ? ` in our ${offer.department} department` : ''}.

Your employment will commence on ${formatDate(offer.joiningDate)}, subject to the terms and conditions outlined below.

Compensation:
• Monthly Salary: ${formatMoney(offer.offeredSalary, offer.offeredCurrency)}
• Annual CTC: ${offer.offeredCTC != null ? formatMoney(offer.offeredCTC, offer.offeredCurrency) : formatMoney(offer.offeredSalary * 12, offer.offeredCurrency)}
• Currency: ${offer.offeredCurrency}

Terms:
• Probation Period: ${offer.probationPeriod || 90} days
• Reporting To: ${offer.reportingTo || 'To be assigned'}
• Notice Period: 30 days

Please review this offer carefully. If you accept, kindly sign and return a copy of this letter by ${formatDate(new Date(Date.now() + 7 * 86400000).toISOString())}.

We look forward to welcoming you to the team!`;
    }

    // Strip HTML tags from template body if present
    bodyText = bodyText.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    // Render body with automatic page breaks
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lineHeight = 14;
    const bodyWidth = pageWidth - 2 * margin;
    const paragraphs = bodyText.split('\n');

    for (const para of paragraphs) {
      if (!para.trim()) { y += lineHeight / 2; continue; }
      const wrapped = doc.splitTextToSize(para, bodyWidth) as string[];
      for (const line of wrapped) {
        if (y > pageHeight - margin - 60) {
          // Page break — add footer + page number, then new page
          addFooter(doc, branding, margin, pageWidth, pageHeight, 1);
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
    }

    // ─── Signature section ───
    y += 40;
    if (y > pageHeight - margin - 100) {
      addFooter(doc, branding, margin, pageWidth, pageHeight, 1);
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text('Sincerely,', margin, y);
    y += 30;

    // Signature image (if present)
    if (branding.signature && branding.signature.startsWith('data:image/')) {
      try {
        const m = branding.signature.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) {
          const fmt = m[1] === 'png' ? 'PNG' : m[1] === 'jpg' || m[1] === 'jpeg' ? 'JPEG' : 'PNG';
          doc.addImage(m[2], fmt, margin, y - 20, 120, 40, undefined, 'FAST');
          y += 30;
        }
      } catch {}
    } else {
      y += 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(branding.signatoryName || 'Authorized Signatory', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(branding.signatoryDesignation || '', margin, y);
    doc.text(branding.companyName || '', margin, y + 12);

    // ─── Candidate acceptance line ───
    y += 50;
    if (y > pageHeight - margin - 60) {
      addFooter(doc, branding, margin, pageWidth, pageHeight, 1);
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text('Candidate Acceptance:', margin, y);
    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, y, margin + 250, y);
    doc.text(`${offer.candidateName}`, margin, y + 14);
    doc.text(`${offer.candidateEmail}`, margin, y + 28);

    // ─── Final footer with page number on last page ───
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      addFooter(doc, branding, margin, pageWidth, pageHeight, i, pageCount);
    }

    // 5. Output as data URL
    const pdfDataUrl = doc.output('datauristring');

    // 6. Persist PDF URL + metadata on the offer row
    try {
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "generatedPdfUrl" = $2, "generatedAt" = NOW(), "updatedAt" = NOW()
         WHERE "id" = $1`,
        offerId, pdfDataUrl,
      );
    } catch (e) {
      // generatedAt column may not exist yet — try ALTER + retry
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3)`);
        await db.$executeRawUnsafe(
          `UPDATE "Offer" SET "generatedPdfUrl" = $2, "generatedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
          offerId, pdfDataUrl,
        );
      } catch { /* non-fatal */ }
    }

    // 7. Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: (decoded as any).userId,
          action: 'OFFER_PDF_GENERATED',
          module: 'offers',
          details: `Generated branded PDF for offer ${offerId} — tenant=${tenantId}, template=${template?.id || 'default'}, branding v${branding.version || 0}`,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      offerId,
      pdfUrl: pdfDataUrl,
      generatedAt: new Date().toISOString(),
      templateId: template?.id || null,
      templateVersion: template ? '1.0' : null,
      brandingVersion: branding.version || 0,
      pageCount,
      locked: false,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Generate branded PDF error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: corsHeaders() });
  }
}

/** Render the footer on the current page: legal notice (left) + page number (right) */
function addFooter(
  doc: any,
  branding: BrandingRow,
  margin: number,
  pageWidth: number,
  pageHeight: number,
  pageNum: number,
  pageCount?: number,
) {
  const y = pageHeight - 30;

  // Footer accent line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y - 12, pageWidth - margin, y - 12);

  // Left: legal notice or default footer text
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  const footerText = branding.defaultFooterText || branding.legalNotice ||
    'This offer is confidential and intended solely for the named recipient.';
  const wrapped = doc.splitTextToSize(footerText, pageWidth - 2 * margin - 100) as string[];
  wrapped.forEach((line: string, i: number) => {
    doc.text(line, margin, y - 4 + i * 10);
  });

  // Right: page number
  const pageLabel = pageCount ? `Page ${pageNum} of ${pageCount}` : `Page ${pageNum}`;
  doc.text(pageLabel, pageWidth - margin - 60, y - 4);

  // Right: company website
  if (branding.website) {
    doc.text(branding.website, pageWidth - margin - 60, y + 8);
  }
}
