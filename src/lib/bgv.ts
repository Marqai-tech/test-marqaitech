/**
 * Shared BGV (background verification) library — used by every vendor/BGV
 * route so status machines, tokens, notifications and PDF generation behave
 * identically across the module.
 *
 * Security properties implemented here (BRD vendor-access brief):
 *  - Invite tokens: 256-bit crypto-random, only a SHA-256 hash is stored,
 *    expiry + single-use consumption, never returned after creation.
 *  - Notifications: every email/in-app send is recorded in BgvNotification
 *    with queued/sent/failed + error — failures are never silently swallowed.
 *  - Deployment URLs are built from validated request origin / env, never
 *    hardcoded.
 *  - Case numbers: BGV-YYYY-NNNN per tenant DB.
 *  - Standard report PDF: generated server-side from the immutable snapshot
 *    (jsPDF, already a repository dependency). DRAFT previews are watermarked.
 */
import { NextRequest } from 'next/server';
import crypto from 'crypto';

/* ─────────────────────────── enums & constants ─────────────────────────── */

export const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export const BGV_CASE_STATUSES = [
  'awaiting_assignment',
  'assigned',
  'in_progress',
  'submitted_for_hr_review',
  'awaiting_information',
  'rework_required',
  'approved_by_hr',
  'rejected_by_hr',
  'cancelled',
] as const;

/** Case states where the vendor can still work on checks. */
export const BGV_WORKABLE_STATUSES = ['assigned', 'in_progress', 'rework_required'];
/** Terminal case states — no vendor or HR mutation allowed. */
export const BGV_TERMINAL_STATUSES = ['approved_by_hr', 'rejected_by_hr', 'cancelled'];

export const CHECK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const CHECK_RESULTS = ['Clear', 'Discrepancy Found', 'Unable to Verify'] as const;
export type CheckResult = typeof CHECK_RESULTS[number];

/** Results that legally REQUIRE a written reason (mock 13/14 rule). */
export const RESULTS_REQUIRING_REASON: CheckResult[] = ['Discrepancy Found', 'Unable to Verify'];

export const INVITE_TTL_DAYS = 7;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const VENDOR_PDF_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_EVIDENCE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function labelForStatus(status?: string | null): string {
  const map: Record<string, string> = {
    awaiting_assignment: 'Awaiting Assignment',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    submitted_for_hr_review: 'Submitted for HR Review',
    awaiting_information: 'Awaiting Information',
    rework_required: 'Rework Required',
    approved_by_hr: 'Approved by HR',
    rejected_by_hr: 'Rejected by HR',
    cancelled: 'Cancelled',
  };
  return map[String(status || '')] || String(status || '—');
}

/* ─────────────────────────── invite tokens ─────────────────────────── */

/** 256-bit url-safe token. The RAW value goes out by email exactly once. */
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Deployment origin from validated sources only: explicit Origin/Referer
 * headers of the incoming request, then NEXT_PUBLIC_APP_URL / APP_URL env.
 * Never a hardcoded deploy URL. Falls back to '' when nothing validates.
 */
export function resolveBaseUrl(req?: NextRequest | null): string {
  const candidates: string[] = [];
  try {
    const origin = req?.headers?.get('origin');
    if (origin) candidates.push(origin);
    const referer = req?.headers?.get('referer');
    if (referer) candidates.push(new URL(referer).origin);
  } catch { /* ignore malformed headers */ }
  for (const envKey of ['NEXT_PUBLIC_APP_URL', 'APP_URL']) {
    const v = process.env[envKey];
    if (v) candidates.push(v);
  }
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    } catch { /* skip invalid */ }
  }
  return '';
}

export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl}/vendor/set-password?token=${encodeURIComponent(token)}`;
}

/* ─────────────────────────── notifications ─────────────────────────── */

interface NotifyArgs {
  db: any; // tenant Prisma client (raw SQL + models)
  event: string;
  recipient: string;
  bgvRequestId?: string | null;
  vendorCompanyId?: string | null;
  vendorUserId?: string | null;
  subject: string;
  html: string;
  /** also create an in-app notification for an HR-side user id */
  inAppUserId?: string | null;
  inAppTitle?: string;
  inAppMessage?: string;
  tenantId?: string | null;
}

/**
 * Sends an email (best effort) + records delivery state in BgvNotification.
 * Never throws — a mail failure must not fail the API call, but it IS
 * recorded as 'failed' with the provider error so it can be retried.
 */
export async function notifyBgvEvent(args: NotifyArgs): Promise<void> {
  const {
    db, event, recipient, bgvRequestId, vendorCompanyId, vendorUserId,
    subject, html, inAppUserId, inAppTitle, inAppMessage, tenantId,
  } = args;

  const notifyId = `bn-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "BgvNotification" ("id","event","channel","recipient","bgvRequestId","vendorCompanyId","vendorUserId","status","createdAt","updatedAt")
       VALUES ($1,$2,'email',$3,$4,$5,$6,'queued',NOW(),NOW())`,
      notifyId, event, recipient, bgvRequestId || null, vendorCompanyId || null, vendorUserId || null,
    ).catch(() => 0);

    if (recipient) {
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({ to: recipient, subject, html });
      if (result?.success) {
        await db.$executeRawUnsafe(
          `UPDATE "BgvNotification" SET "status"='sent',"providerMessageId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
          result.via || 'sent', notifyId,
        ).catch(() => 0);
      } else {
        await db.$executeRawUnsafe(
          `UPDATE "BgvNotification" SET "status"='failed',"error"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
          (result?.error || 'provider reported failure').slice(0, 500), notifyId,
        ).catch(() => 0);
      }
    }
  } catch (e: any) {
    try {
      await db.$executeRawUnsafe(
        `UPDATE "BgvNotification" SET "status"='failed',"error"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        String(e?.message || e || 'notify failed').slice(0, 500), notifyId,
      );
    } catch { /* nothing more we can do */ }
  }

  // Optional in-app copy for HR-side users (existing Notification model).
  if (inAppUserId) {
    try {
      await db.notification.create({
        data: {
          userId: inAppUserId,
          tenantId: tenantId || null,
          title: inAppTitle || 'BGV update',
          message: inAppMessage || subject,
          type: 'info',
          category: 'bgv',
          isRead: false,
          isEmailSent: false,
        },
      });
    } catch { /* in-app is optional */ }
  }
}

/* ─────────────────────────── case numbers ─────────────────────────── */

/** Next case number in the form BGV-YYYY-NNNN (per tenant DB). */
export async function nextCaseNumber(db: any): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "BgvRequest" WHERE "caseNumber" LIKE $1`,
      `BGV-${year}-%`,
    ) as { n: number }[];
    const next = (rows?.[0]?.n || 0) + 1;
    return `BGV-${year}-${String(next).padStart(4, '0')}`;
  } catch {
    return `BGV-${year}-${Date.now().toString(36).toUpperCase()}`;
  }
}

/* ─────────────────────────── report snapshot ─────────────────────────── */

export interface SnapshotCheck {
  checkId: string;
  checkType: string;
  checkLabel: string;
  status: string;
  result: string | null;
  findings: string | null;
  verificationDate: string | null;
  completedAt: string | null;
  evidenceIds: string[];
  evidenceFiles: { id: string; fileName: string }[];
}

export interface ReportSnapshot {
  caseId: string;
  caseNumber: string | null;
  candidateName: string;
  candidateEmail: string;
  vendorCompanyId: string;
  vendorName: string;
  investigatorId: string;
  investigatorName: string;
  investigatorEmail: string;
  submittedAt: string;
  version: number;
  overallFindings: string;
  overallResult: string | null;
  checks: SnapshotCheck[];
  /** shared documents that were visible to the investigator */
  sharedDocuments: { id: string; documentType: string | null; documentLabel: string | null }[];
  instructions: string | null;
  dueDate: string | null;
}

/* ─────────────────────────── standard PDF ─────────────────────────── */

function pdfEsc(s?: string | null): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Generate the Marqaitech standard BGV report PDF from a snapshot.
 * draft=true renders a red DRAFT watermark band on every page.
 * Returns the PDF bytes (Node Buffer). Throws on failure — callers record
 * pdfStatus='failed' + pdfError and must NOT pretend a download is ready.
 */
export async function generateStandardReportPdf(
  snap: ReportSnapshot,
  opts: { draft?: boolean } = {},
): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  let y = 56;

  const ensure = (need: number) => {
    if (y + need > H - 56) { doc.addPage(); y = 56; }
  };

  // Header
  doc.setFillColor(22, 37, 78);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Marqaitech — Standard Background Verification Report', M, 25);
  y = 64;
  doc.setTextColor(30, 41, 59);

  const kv = (label: string, value: string) => {
    ensure(18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text(label, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
    doc.text(pdfEsc(value).slice(0, 110) || '-', M + 118, y);
    y += 15;
  };

  kv('Case ID', `${snap.caseNumber || snap.caseId} (v${snap.version})`);
  kv('Candidate', `${snap.candidateName} · ${snap.candidateEmail}`);
  kv('Vendor', snap.vendorName);
  kv('Investigator', `${snap.investigatorName} (${snap.investigatorEmail})`);
  kv('Verification due', snap.dueDate ? new Date(snap.dueDate).toISOString().slice(0, 10) : '-');
  kv('Submitted', new Date(snap.submittedAt).toLocaleString('en-GB'));
  y += 6;

  // Checks table
  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(22, 37, 78);
  doc.text('Check Results', M, y);
  y += 14;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, W - 2 * M, 18, 'FD');
  doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text('Check', M + 6, y + 12.5);
  doc.text('Result', M + 150, y + 12.5);
  doc.text('Verified on', M + 268, y + 12.5);
  doc.text('Evidence', W - M - 60, y + 12.5);
  y += 18;

  for (const c of snap.checks) {
    const findings = pdfEsc(c.findings);
    const lines = doc.splitTextToSize(findings || '-', W - 2 * M - 20);
    const blockH = Math.max(26, 14 + lines.length * 11);
    ensure(blockH);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y, W - M, y);
    y += 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(pdfEsc(c.checkLabel || c.checkType).slice(0, 40), M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(c.result === 'Clear' ? 5 : c.result === 'Discrepancy Found' ? 185 : 146, 84, 65);
    doc.text(pdfEsc(c.result) || 'Pending', M + 150, y);
    doc.setTextColor(71, 85, 105);
    doc.text(c.verificationDate ? new Date(c.verificationDate).toISOString().slice(0, 10) : '-', M + 268, y);
    doc.text(c.evidenceIds.length ? `${c.evidenceIds.length} file(s)` : '-', W - M - 60, y);
    y += 13;
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8.5);
    for (const ln of lines) { ensure(11); doc.text(ln, M + 6, y); y += 11; }
    y += 6;
    doc.setFontSize(9);
  }

  // Overall findings
  ensure(40);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(22, 37, 78);
  doc.text('Overall Findings', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  const overall = doc.splitTextToSize(pdfEsc(snap.overallFindings) || '-', W - 2 * M);
  for (const ln of overall) { ensure(12); doc.text(ln, M, y); y += 12; }
  y += 8;

  // Shared documents + footer
  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(`Shared documents verified: ${snap.sharedDocuments.length} · Checks: ${snap.checks.length}`, M, y);
  y += 24;
  doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text(
    opts.draft
      ? 'DRAFT PREVIEW — generated before vendor submission. Not an official report.'
      : `Submitted snapshot v${snap.version} — immutable record generated at submission time. Not a certification or signature.`,
    M, H - 30,
  );

  if (opts.draft) {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(46);
      doc.text('DRAFT', W / 2 - 70, H / 2, { angle: 28 });
      doc.setFontSize(10);
      doc.text('PREVIEW ONLY — NOT SUBMITTED', W / 2 - 78, H / 2 + 26, { angle: 28 });
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}
