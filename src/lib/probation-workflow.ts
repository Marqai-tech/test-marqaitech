import { sanitizeMultiLineText } from '@/lib/sanitize';
import { createNotification } from '@/lib/notifications';
import { sendTenantEmail } from '@/lib/notification-channels';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

export type ProbationHistoryEntry = {
  action: string;
  actorId: string;
  actorRole: string;
  comments: string;
  at: string;
  fromStatus?: string;
  toStatus?: string;
};

export function parseProbationData(value: unknown): Record<string, any> {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

export function cleanProbationComment(value: unknown): string {
  return sanitizeMultiLineText(value, 5000);
}

export function validateEffectiveDate(effectiveDate: unknown, joiningDate: Date): string | null {
  if (!effectiveDate) return null;
  const effective = new Date(String(effectiveDate));
  if (Number.isNaN(effective.getTime())) return 'Please enter a valid effective date.';
  const start = new Date(joiningDate);
  effective.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return effective < start
    ? `Effective date cannot be before the employee start date (${start.toLocaleDateString('en-IN')}).`
    : null;
}

export function appendProbationHistory(data: Record<string, any>, entry: Omit<ProbationHistoryEntry, 'at' | 'comments'> & { comments?: unknown }) {
  const history = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  data.statusHistory = [...history, {
    ...entry,
    comments: cleanProbationComment(entry.comments),
    at: new Date().toISOString(),
  }];
  return data;
}

function confirmationLetterText(employee: any, effectiveDate: string) {
  const name = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  return `CONFIRMATION LETTER\n\nDate: ${new Date().toLocaleDateString('en-IN')}\n\nDear ${name},\n\nWe are pleased to confirm your employment with effect from ${new Date(effectiveDate).toLocaleDateString('en-IN')}. Your probation has been completed successfully. All employment terms and company policies continue to apply.\n\nCongratulations.\n\nHuman Resources`;
}

async function ensureDocumentWorkflowColumns(db: any) {
  // Older tenant/test databases predate centralized document management.
  // Keep the upgrade allow-listed and idempotent so Prisma can read and create
  // Document rows without weakening any existing constraints.
  const statements = [
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'other'`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileNodeId" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "uploadedById" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isRequested" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "requestedById" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "requiredFormat" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "maxFileSizeMb" INTEGER`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "expiryAlertSent" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "expiryAlertDays" INTEGER NOT NULL DEFAULT 30`,
  ];
  for (const statement of statements) await db.$executeRawUnsafe(statement);
}

export async function applyFinalProbationDecision(params: {
  db: any;
  tenantId: string;
  reviewId: string;
  employeeId: string;
  action: string;
  effectiveDate?: string | null;
  extensionPeriod?: number | null;
  actorId: string;
  actorRole: string;
  comments?: unknown;
  probationData: Record<string, any>;
  terminateOnReject?: boolean;
}) {
  const { db, tenantId, employeeId, reviewId } = params;
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, employeeId: true, email: true, userId: true, dateOfJoining: true },
  });
  if (!employee) throw new Error('Employee not found while finalizing probation review.');

  const comments = cleanProbationComment(params.comments);
  const data = { ...params.probationData };
  const effectiveDate = params.effectiveDate || data.effectiveDate || new Date().toISOString();
  const dateError = validateEffectiveDate(effectiveDate, employee.dateOfJoining);
  if (dateError) throw new Error(dateError);

  const decision = params.action === 'approve'
    ? 'confirm'
    : params.action === 'extend'
      ? 'extend'
      // Rejecting a probation review must not terminate the employee. A
      // termination is a separate, explicit workflow decision.
      : 'rejected';
  const reviewStatus = decision === 'confirm' || decision === 'extend' ? 'completed' : 'rejected';
  appendProbationHistory(data, {
    action: `final_${decision}`,
    actorId: params.actorId,
    actorRole: params.actorRole,
    comments,
    fromStatus: String(data.decision || 'pending'),
    toStatus: decision,
  });
  data.decision = decision;
  data.workflowStage = 'completed';
  data.effectiveDate = effectiveDate;
  data.finalComments = comments;
  data.finalActionedBy = params.actorId;
  data.finalActionDate = new Date().toISOString();

  let letterDocument: any = null;
  let letterEmailHtml = '';

  // Helper: update Employee status with Prisma-first + RAW SQL fallback
  // (same pattern as Task 159 — tenant DBs with schema drift make
  // db.employee.update throw, so we fall back to a targeted RAW SQL UPDATE).
  async function applyEmployeeStatus(empId: string, empStatus: string, status: string) {
    try {
      await db.employee.update({
        where: { id: empId },
        data: { employeeStatus: empStatus, status },
      });
    } catch (prismaErr) {
      console.warn('[probation-workflow] Prisma employee.update failed, trying RAW SQL fallback:', prismaErr instanceof Error ? prismaErr.message : prismaErr);
      await db.$executeRawUnsafe(
        `UPDATE "Employee" SET "employeeStatus" = $1, "status" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
        empStatus, status, empId,
      );
    }
  }

  if (decision === 'confirm') {
    await ensureDocumentWorkflowColumns(db);
    const letter = confirmationLetterText(employee, effectiveDate);
    letterEmailHtml = `<div style="white-space:pre-line;border:1px solid #ddd;padding:16px;margin-top:16px">${letter.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(letter, 490), 52, 70);
    const fileUrl = pdf.output('datauristring');
    await applyEmployeeStatus(employeeId, 'confirmed', 'active');
    letterDocument = await db.document.create({
      data: {
        employeeId,
        name: `Confirmation Letter - ${new Date(effectiveDate).toLocaleDateString('en-CA')}.pdf`,
        type: 'confirmation_letter',
        category: 'lifecycle',
        fileUrl,
        description: `Automatically generated after probation confirmation. Payroll eligible from ${new Date(effectiveDate).toLocaleDateString('en-IN')}.`,
        uploadedById: params.actorId,
      },
    });
    data.confirmationLetter = letterDocument.id;
    data.payrollEligible = true;
    data.payrollEligibilityDate = effectiveDate;
  } else if (decision === 'extend') {
    const months = Number(params.extensionPeriod || data.extensionPeriod || 0);
    data.extensionPeriod = months;
    const base = new Date(data.probationStartDate || employee.dateOfJoining);
    base.setMonth(base.getMonth() + Number(data.probationPeriod || 0) + months);
    data.revisedEndDate = base.toISOString();
    await applyEmployeeStatus(employeeId, 'probation', 'active');
  } else if (decision === 'terminate') {
    await applyEmployeeStatus(employeeId, 'terminated', 'terminated');
    data.payrollEligible = false;
  }

  const review = await db.performanceReview.update({
    where: { id: reviewId },
    data: { status: reviewStatus, comments: JSON.stringify(data), reviewDate: new Date() },
  });

  const name = `${employee.firstName} ${employee.lastName}`.trim();
  const title = decision === 'confirm' ? 'Employment Confirmed' : decision === 'extend' ? 'Probation Extended' : decision === 'terminate' ? 'Probation Review Outcome – Employment Termination' : 'Probation Review Rejected';
  const message = decision === 'confirm'
    ? `Your employment is confirmed effective ${new Date(effectiveDate).toLocaleDateString('en-IN')}. Your confirmation letter is available in Documents.`
    : decision === 'extend'
      ? `Your probation has been extended${data.revisedEndDate ? ` until ${new Date(data.revisedEndDate).toLocaleDateString('en-IN')}` : ''}.`
      : decision === 'terminate'
        ? `Following the authorized probation decision, your employment is terminated effective ${new Date(effectiveDate).toLocaleDateString('en-IN')}. Please contact HR regarding the formal letter, final settlement, and exit formalities.`
        : 'Your probation review was rejected. Please contact HR for the next steps under your company policy.';
  const inAppResult = employee.userId
    ? await createNotification({ tenantId, userId: employee.userId, title, message, type: decision === 'terminate' ? 'warning' : 'success', category: 'performance', link: '/employees/probation' })
    : null;
  let emailResult: { success: boolean; error?: string } | null = null;
  if (employee.email) {
    // REQ 5 — wrap the probation-outcome body in the tenant-branded template.
    const bodyHtml = `<p>Dear ${name},</p><p>${message}</p>${decision === 'confirm' ? `<p>Your confirmation letter is stored in your employee Documents section.</p>${letterEmailHtml}` : ''}<p>HR Team</p>`;
    try {
      const html = await buildBrandedEmailForTenant(tenantId, { title, bodyHtml });
      emailResult = await sendTenantEmail(db, tenantId, {
        to: employee.email,
        subject: title,
        html,
      }).catch((error) => ({ success: false, error: error instanceof Error ? error.message : 'Email delivery failed' }));
    } catch (error) {
      emailResult = { success: false, error: error instanceof Error ? error.message : 'Email build failed' };
    }
  }
  data.notificationHistory = Array.isArray(data.notificationHistory) ? data.notificationHistory : [];
  data.notificationHistory.push({
    event: `probation_${decision}`,
    recipientUserId: employee.userId || null,
    recipientEmail: employee.email || null,
    inAppStatus: inAppResult ? 'sent' : 'skipped',
    emailStatus: emailResult?.success ? 'sent' : employee.email ? 'failed' : 'skipped',
    emailError: emailResult?.error || null,
    approverId: params.actorId,
    comments,
    effectiveDate,
    revisedEndDate: data.revisedEndDate || null,
    at: new Date().toISOString(),
  });
  await db.performanceReview.update({ where: { id: reviewId }, data: { comments: JSON.stringify(data) } });
  await db.auditLog.create({ data: {
    userId: params.actorId,
    action: `PROBATION_${decision.toUpperCase()}`,
    module: 'employees',
    details: JSON.stringify({ reviewId, employeeId, decision, comments, effectiveDate, timestamp: new Date().toISOString() }),
  } }).catch(() => null);
  return { review, data, employee, letterDocument, decision, reviewStatus };
}
