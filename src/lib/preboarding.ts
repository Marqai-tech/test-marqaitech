/**
 * BRD Preboarding Module — shared helpers.
 *
 * Implements the Business Requirement Document (HRMS Preboarding & Onboarding
 * Module) server-side model:
 *   - Stage derivation (BRD Figure 1.1 lifecycle)
 *   - Joining readiness checklist computation (BRD 5.10)
 *   - Preboarding ID generation (PRE-YYYY-NNNN, BRD 5.2)
 *   - Candidate notification helper (in-app portal message)
 */
import type { PrismaClient } from '@/generated/prisma';

export const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export interface PBCandidateRow {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  reportingManagerId?: string | null;
  employmentType?: string | null;
  workLocation?: string | null;
  joiningDate?: string | Date | null;
  offerId?: string | null;
  onboardingStatus?: string | null;
  status?: string | null;
  employeeId?: string | null;
  portalDetails?: unknown;
  portalSubmittedAt?: string | Date | null;
  correctionNote?: string | null;
  readinessChecklist?: unknown;
  readyToJoinAt?: string | Date | null;
  joiningConfirmed?: boolean | null;
  joiningConfirmedAt?: string | Date | null;
  actualJoiningDate?: string | Date | null;
  didNotJoinAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  preboardingStage?: string | null;
  preboardingId?: string | null;
  [k: string]: unknown;
}

export interface DocRow {
  status?: string | null;
  [k: string]: unknown;
}

/** Parse portalDetails regardless of driver (jsonb object vs escaped string). */
export function parsePortalDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }
  return (raw && typeof raw === 'object') ? (raw as Record<string, any>) : {};
}

export function parseJsonMap(raw: unknown): Record<string, any> {
  return parsePortalDetails(raw);
}

/**
 * BRD stage derivation (Figure 1.1). Terminal states win, then joined,
 * then ready_to_join, then verification (details submitted), then
 * details_pending, then initiated.
 */
export function deriveStage(pb: PBCandidateRow): string {
  if (pb.cancelledAt || pb.cancellationReason || pb.preboardingStage === 'cancelled') return 'cancelled';
  if (pb.didNotJoinAt || pb.preboardingStage === 'did_not_join') return 'did_not_join';
  if (pb.employeeId && (pb.onboardingStatus === 'active_employee' || pb.preboardingStage === 'joined')) return 'joined';
  if (pb.readyToJoinAt || pb.preboardingStage === 'ready_to_join') return 'ready_to_join';
  if (pb.portalSubmittedAt || pb.preboardingStage === 'verification') return 'verification';
  const details = parsePortalDetails(pb.portalDetails);
  if (details && Object.keys(details).length > 0) return 'details_pending';
  return 'initiated';
}

export const STAGE_LABELS: Record<string, string> = {
  initiated: 'Initiated',
  details_pending: 'Details Pending',
  verification: 'Verification',
  ready_to_join: 'Ready to Join',
  joined: 'Joined',
  did_not_join: 'Did Not Join',
  cancelled: 'Cancelled',
};

export const STAGE_PIPELINE = ['initiated', 'details_pending', 'verification', 'ready_to_join', 'joined'] as const;

export function documentStatusOf(docs: DocRow[]): string {
  if (!docs.length) return 'Pending';
  if (docs.every(d => d.status === 'approved')) return 'Completed';
  return 'Pending';
}

export function verificationStatusOf(docs: DocRow[]): string {
  if (!docs.length) return 'Pending';
  if (docs.some(d => d.status === 'rejected')) return 'Rejected';
  if (docs.some(d => d.status === 'submitted')) return 'In Review';
  if (docs.every(d => d.status === 'approved')) return 'Verified';
  return 'Pending';
}

export function joiningReadinessOf(pb: PBCandidateRow, checklist: Record<string, any>): string {
  if (deriveStage(pb) === 'joined') return 'Ready';
  if (pb.readyToJoinAt) return 'Ready';
  const items = Object.values(checklist || {}) as any[];
  if (items.length && items.every(i => i?.status === 'complete')) return 'Ready';
  return 'Not Ready';
}

/** BRD 5.10 joining readiness checklist (15 requirements). */
export const READINESS_REQUIREMENTS = [
  'Offer Accepted',
  'Personal Details',
  'Address Details',
  'Mandatory Documents',
  'Bank Details',
  'Statutory Information',
  'Employment Details',
  'Reporting Manager',
  'Department',
  'Work Location',
  'Shift',
  'IT Requirements',
  'Asset Requirements',
  'Joining Instructions',
  'Joining Date',
] as const;

/** Items whose completion is computed from candidate data (not manual). */
const COMPUTED: Record<string, (pb: PBCandidateRow, docs: DocRow[], details: Record<string, any>) => boolean> = {
  'Offer Accepted': (pb) => Boolean(pb.offerId) || deriveStage(pb) !== 'initiated',
  'Personal Details': (_pb, _docs, d) => Boolean(d.personal?.firstName && d.personal?.lastName && d.personal?.mobileNumber),
  'Address Details': (_pb, _docs, d) => Boolean(d.address?.permanentAddressLine1 && d.address?.permanentCity),
  'Mandatory Documents': (_pb, docs) => docs.length > 0 && docs.every(x => x.status === 'approved'),
  'Bank Details': (_pb, _docs, d) => Boolean(d.bank?.accountHolderName && d.bank?.accountNumber),
  'Statutory Information': (_pb, _docs, d) => Boolean(d.bank?.panNumber || d.bank?.uanNumber),
  'Employment Details': (pb) => Boolean(pb.jobTitle && pb.employmentType),
  'Reporting Manager': (pb) => Boolean(pb.reportingManagerId),
  'Department': (pb) => Boolean(pb.departmentId),
  'Work Location': (pb) => Boolean(pb.workLocation),
  'Joining Date': (pb) => Boolean(pb.joiningDate),
};

const MANUAL_ONLY = new Set(['Shift', 'IT Requirements', 'Asset Requirements', 'Joining Instructions']);

export interface ReadinessItem {
  requirement: string;
  responsibleRole: string;
  status: 'complete' | 'pending';
  source: 'computed' | 'manual';
  updatedBy?: string | null;
  updatedAt?: string | null;
}

const RESPONSIBLE_ROLE: Record<string, string> = {
  'Offer Accepted': 'Recruitment',
  'Personal Details': 'Candidate',
  'Address Details': 'Candidate / HR',
  'Mandatory Documents': 'Candidate / HR',
  'Bank Details': 'Candidate / Payroll',
  'Statutory Information': 'Candidate / HR',
  'Employment Details': 'HR',
  'Reporting Manager': 'HR / Hiring Manager',
  'Department': 'HR',
  'Work Location': 'HR',
  'Shift': 'HR / Manager',
  'IT Requirements': 'IT',
  'Asset Requirements': 'IT',
  'Joining Instructions': 'HR',
  'Joining Date': 'HR',
};

/** Mandatory items that must be complete before Mark Ready to Join (BRD 5.10). */
export const READINESS_MANDATORY = new Set([
  'Offer Accepted', 'Personal Details', 'Address Details', 'Mandatory Documents',
  'Employment Details', 'Reporting Manager', 'Department', 'Joining Date',
]);

export function computeReadiness(pb: PBCandidateRow, docs: DocRow[]): { items: ReadinessItem[]; completed: number; percent: number } {
  const details = parsePortalDetails(pb.portalDetails);
  const stored = parseJsonMap(pb.readinessChecklist);
  const items: ReadinessItem[] = READINESS_REQUIREMENTS.map((req) => {
    const manual = MANUAL_ONLY.has(req) || stored[req];
    if (manual && stored[req]) {
      return {
        requirement: req,
        responsibleRole: RESPONSIBLE_ROLE[req] || 'HR',
        status: stored[req].status === 'complete' ? 'complete' : 'pending',
        source: MANUAL_ONLY.has(req) ? 'manual' : 'computed',
        updatedBy: stored[req].updatedBy || null,
        updatedAt: stored[req].updatedAt || null,
      };
    }
    if (MANUAL_ONLY.has(req)) {
      const st = stored[req]?.status === 'complete';
      return { requirement: req, responsibleRole: RESPONSIBLE_ROLE[req] || 'HR', status: st ? 'complete' : 'pending', source: 'manual', updatedBy: stored[req]?.updatedBy || null, updatedAt: stored[req]?.updatedAt || null };
    }
    const fn = COMPUTED[req];
    const ok = fn ? fn(pb, docs, details) : Boolean(stored[req]?.status === 'complete');
    return { requirement: req, responsibleRole: RESPONSIBLE_ROLE[req] || 'HR', status: ok ? 'complete' : 'pending', source: 'computed' };
  });
  const completed = items.filter(i => i.status === 'complete').length;
  return { items, completed, percent: Math.round((completed / items.length) * 100) };
}

/** Generate (lazily, idempotent) the human Preboarding ID: PRE-YYYY-NNNN. */
export async function ensurePreboardingId(db: PrismaClient, pb: { id: string; preboardingId?: string | null; createdAt?: string | Date | null }): Promise<string> {
  if (pb.preboardingId) return pb.preboardingId;
  const year = pb.createdAt ? new Date(pb.createdAt).getFullYear() : new Date().getFullYear();
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "PreboardingCandidate" WHERE "preboardingId" LIKE $1`,
    `PRE-${year}-%`,
  ).catch(() => [{ c: 0 }])) as any[];
  const seq = String((rows[0]?.c || 0) + 1).padStart(4, '0');
  const preboardingId = `PRE-${year}-${seq}`;
  await db.$executeRawUnsafe(
    `UPDATE "PreboardingCandidate" SET "preboardingId" = $1, "updatedAt" = NOW() WHERE "id" = $2 AND ("preboardingId" IS NULL OR "preboardingId" = '')`,
    preboardingId, pb.id,
  ).catch(() => 0);
  return preboardingId;
}

/** In-app candidate portal message (senderName + body are NOT NULL in DB). */
export async function notifyCandidate(db: PrismaClient, candidateEmail: string, message: string): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
     VALUES ($1,$2,'HR System','system',$3,$3,NOW(),NOW())`,
    `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, candidateEmail.toLowerCase(), message,
  ).catch(() => 0);
}

/** Best-effort audit log write. */
export async function audit(db: PrismaClient, userId: string | null | undefined, action: string, module: string, details: string): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "AuditLog" ("id","userId","action","module","details","createdAt")
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId || null, action, module, details,
  ).catch(() => 0);
}

/** Best-effort outbound email (logged only until SMTP/Resend is configured). */
export async function sendEmailBestEffort(to: string, subject: string, html: string): Promise<void> {
  try {
    const { sendEmail } = await import('@/lib/email');
    await sendEmail({ to, subject, html }).catch(() => null);
  } catch { /* non-fatal */ }
}
