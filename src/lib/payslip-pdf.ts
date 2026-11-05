/**
 * Task 130 — Payslip PDF generator (server-side, jsPDF).
 *
 * Renders the RELEASED payslip format:
 *   ┌──────────────────────────────┐
 *   │           [LOGO]             │
 *   │     MARQ AI TECH PVT LTD     │
 *   │  #399, Level 1, SS Prime, …  │
 *   │                              │
 *   │  Salary Payslip - April 2026 │
 *   ├──────────────┬───────────────┤
 *   │ Employee info grid (2×2)     │
 *   ├──────────────┴───────────────┤
 *   │ Earnings | Amt | Deductions  │
 *   │ …                            │
 *   │ Total Earnings | Total Ded.  │
 *   ├──────────────────────────────┤
 *   │ Net Salary        75,000.00  │
 *   └──────────────────────────────┘
 *   Amount in Words: Seventy Five Thousand Rupees Only.
 *   This is a system generated payslip and does not require any signature.
 *
 * ₹ note: jsPDF core fonts are WinAnsi and cannot encode U+20B9, so the
 * rupee sign is drawn with an embedded 6 KB DejaVuSans subset
 * (RUPEE_FONT_B64, generated asset). All other text uses Helvetica.
 */
import { RUPEE_FONT_B64, MARQAI_TECH_LOGO_B64, isMarqAITechCompany } from './payslip-assets';

export interface PayslipPdfLine {
  label: string;
  amount: number;
}

export interface PayslipPdfInput {
  monthName: string;
  year: number;
  company: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  };
  /** Pre-resolved base64 PNG (no data: prefix). Falls back to the MarqAI mark by company name. */
  logoB64?: string | null;
  employee: {
    name: string;
    employeeCode: string;
    designation?: string | null;
    department?: string | null;
    dateOfJoining?: Date | string | null;
    location?: string | null;
  };
  earnings: PayslipPdfLine[];
  deductions: PayslipPdfLine[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  effectiveWorkDays: number;
  daysInMonth: number;
  currency: string;
}

const INR_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(n: number): string {
  return INR_FMT.format(Number.isFinite(n) ? n : 0);
}

function fmtDateDMY(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Thin wrapper that draws a text run and returns its width for chaining. */
function runWidth(doc: any, text: string): number {
  return doc.getTextWidth(text);
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const pageW = doc.internal.pageSize.getWidth(); // 210
  const margin = 14;
  const contentW = pageW - margin * 2; // 182
  let y = 10;

  // ── Register the rupee font ──
  doc.addFileToVFS('RupeeSans.ttf', RUPEE_FONT_B64);
  doc.addFont('RupeeSans.ttf', 'RupeeSans', 'normal');

  // ── Logo (centered) ──
  // NOTE: must be JPEG — a PNG with alpha triggers a jsPDF path that inflates
  // BOTH the image (raw grayscale) and the embedded rupee font (~1 MB PDF).
  const logoB64 = input.logoB64 || (isMarqAITechCompany(input.company.name) ? MARQAI_TECH_LOGO_B64 : null);
  let logoH = 0;
  if (logoB64) {
    try {
      const logoW = 30;
      logoH = 15;
      doc.addImage(logoB64, 'JPEG', (pageW - logoW) / 2, y, logoW, logoH);
      y += logoH + 2;
    } catch {
      logoH = 0; // malformed image — keep going without it
    }
  }

  // ── Company name + address (centered) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(input.company.name || 'Payslip', pageW / 2, y + 4, { align: 'center' });
  y += 8;

  const addressParts = [
    input.company.address || '',
    [input.company.city, input.company.state, input.company.zipCode].filter(Boolean).join(' - '),
  ].filter(Boolean).join(', ');
  if (addressParts) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 100, 110);
    const addrLines = doc.splitTextToSize(addressParts, contentW - 20);
    for (const line of addrLines) {
      doc.text(line, pageW / 2, y + 3, { align: 'center' });
      y += 4;
    }
  }
  y += 1;

  // ── Divider + title ──
  doc.setDrawColor(210, 216, 220);
  doc.setLineWidth(0.35);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(17, 24, 39);
  doc.text(`Salary Payslip - ${input.monthName} ${input.year}`, pageW / 2, y, { align: 'center' });
  y += 7;

  // ── Employee info grid (2 label/value pairs per row) ──
  const infoRows: Array<[string, string, string, string]> = [
    ['Employee Name', input.employee.name, 'Location', input.employee.location || '—'],
    ['Employee ID', input.employee.employeeCode, 'Effective Work Days', String(input.effectiveWorkDays)],
    ['Date of Joining', fmtDateDMY(input.employee.dateOfJoining), 'Days in Month', String(input.daysInMonth)],
    ['Designation', input.employee.designation || '—', '', ''],
    ['Department', input.employee.department || '—', '', ''],
  ];

  const colLabel = 36;
  const colValue = (contentW - colLabel * 2) / 2;
  const rowH = 8;

  doc.setFontSize(8.5);
  for (const [l1, v1, l2, v2] of infoRows) {
    // row background + borders
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, contentW, rowH, 'FD');
    // cell borders (vertical separators)
    doc.setDrawColor(215, 220, 224);
    doc.setLineWidth(0.25);
    doc.line(margin + colLabel, y, margin + colLabel, y + rowH);
    doc.line(margin + colLabel + colValue, y, margin + colLabel + colValue, y + rowH);
    doc.line(margin + colLabel + colValue + colLabel, y, margin + colLabel + colValue + colLabel, y + rowH);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);

    // labels
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(110, 120, 130);
    doc.text(l1, margin + 2, y + 5.2);
    if (l2) doc.text(l2, margin + colLabel + colValue + 2, y + 5.2);
    // values
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(25, 32, 40);
    doc.text(String(v1).slice(0, 42), margin + colLabel + 2, y + 5.3);
    if (l2) doc.text(String(v2).slice(0, 30), margin + colLabel + colValue + colLabel + 2, y + 5.3);

    y += rowH;
  }
  // outer border of the info grid (top edge drawn by first row rect, sides here)
  doc.setDrawColor(215, 220, 224);
  doc.rect(margin, y - rowH * infoRows.length, contentW, rowH * infoRows.length);
  y += 5;

  // ── Earnings / Deductions table ──
  const earningRows = input.earnings.filter((e) => e.amount > 0.004);
  const deductionRows = input.deductions.filter((d) => d.amount > 0.004);
  const rowCount = Math.max(earningRows.length, deductionRows.length, 1);

  const colE = 66;
  const colA = 25;
  const tableRowH = 7.4;

  const drawAmountHeader = (x: number, w: number) => {
    // "Amount (₹)" — the rupee glyph needs the custom font
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    const open = 'Amount (';
    const close = ')';
    const rupeeW = runWidth(doc, 'W'); // placeholder, recomputed after font switch
    const openW = doc.getTextWidth(open);
    doc.setFont('RupeeSans', 'normal');
    doc.setFontSize(9.2);
    const rpW = doc.getTextWidth('₹');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    const closeW = doc.getTextWidth(close);
    const totalW = openW + rpW + closeW;
    let tx = x + (w - totalW) / 2;
    const baseY = y + 5;
    doc.text(open, tx, baseY);
    tx += openW;
    doc.setFont('RupeeSans', 'normal');
    doc.setFontSize(9.2);
    doc.text('₹', tx, baseY);
    void rupeeW;
    tx += rpW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    doc.text(close, tx, baseY);
  };

  // header row
  doc.setFillColor(240, 244, 244);
  doc.rect(margin, y, contentW, tableRowH, 'FD');
  doc.setDrawColor(160, 170, 178);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentW, tableRowH);
  doc.line(margin + colE, y, margin + colE, y + tableRowH);
  doc.line(margin + colE + colA, y, margin + colE + colA, y + tableRowH);
  doc.line(margin + colE + colA + colE, y, margin + colE + colA + colE, y + tableRowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.setTextColor(25, 32, 40);
  doc.text('Earnings', margin + 2.5, y + 5);
  drawAmountHeader(margin + colE, colA);
  doc.text('Deductions', margin + colE + colA + 2.5, y + 5);
  drawAmountHeader(margin + colE + colA + colE, colA);
  y += tableRowH;

  // body rows
  doc.setFontSize(8.4);
  for (let i = 0; i < rowCount; i++) {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, contentW, tableRowH, 'FD');
    doc.setDrawColor(215, 220, 224);
    doc.setLineWidth(0.25);
    doc.line(margin, y + tableRowH, pageW - margin, y + tableRowH);
    doc.line(margin + colE, y, margin + colE, y + tableRowH);
    doc.line(margin + colE + colA, y, margin + colE + colA, y + tableRowH);
    doc.line(margin + colE + colA + colE, y, margin + colE + colA + colE, y + tableRowH);

    const e = earningRows[i];
    const d = deductionRows[i];
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 52, 60);
    if (e) doc.text(e.label, margin + 2.5, y + 5);
    if (d) doc.text(d.label, margin + colE + colA + 2.5, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(25, 32, 40);
    if (e) doc.text(money(e.amount), margin + colE + colA - 2, y + 5, { align: 'right' });
    if (d) doc.text(money(d.amount), margin + colE + colA + colE + colA - 2, y + 5, { align: 'right' });
    y += tableRowH;
  }

  // totals row
  doc.setFillColor(238, 242, 242);
  doc.rect(margin, y, contentW, tableRowH, 'FD');
  doc.setDrawColor(160, 170, 178);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentW, tableRowH);
  doc.line(margin + colE, y, margin + colE, y + tableRowH);
  doc.line(margin + colE + colA, y, margin + colE + colA, y + tableRowH);
  doc.line(margin + colE + colA + colE, y, margin + colE + colA + colE, y + tableRowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(25, 32, 40);
  doc.text('Total Earnings', margin + 2.5, y + 5);
  doc.text(money(input.totalEarnings), margin + colE + colA - 2, y + 5, { align: 'right' });
  doc.text('Total Deductions', margin + colE + colA + 2.5, y + 5);
  doc.text(money(input.totalDeductions), margin + colE + colA + colE + colA - 2, y + 5, { align: 'right' });
  y += tableRowH + 6;

  // ── Net salary box ──
  const netH = 12;
  doc.setFillColor(243, 246, 246);
  doc.setDrawColor(140, 200, 160);
  doc.setLineWidth(0.4);
  doc.rect(margin, y, contentW, netH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(25, 32, 40);
  doc.text('Net Salary', margin + 3, y + 7.6);
  doc.setFontSize(12.5);
  doc.text(money(input.netPay), pageW - margin - 3, y + 7.8, { align: 'right' });
  y += netH + 4;

  // ── Amount in words ──
  const { amountInWordsINR } = await import('./amount-in-words');
  const wordsLabel = 'Amount in Words: ';
  const wordsText = `${amountInWordsINR(input.netPay)}.`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(25, 32, 40);
  const labelW = doc.getTextWidth(wordsLabel); // measured IN bold to match the drawn label
  const valueLines = doc.splitTextToSize(wordsText, contentW - labelW - 2);
  doc.text(wordsLabel, margin, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.text(valueLines[0], margin + labelW, y + 3);
  y += 6;

  // ── Footer ──
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 128, 136);
  doc.text('This is a system generated payslip and does not require any signature.', pageW / 2, y + 6, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}
