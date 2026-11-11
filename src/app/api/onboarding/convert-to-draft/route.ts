/**
 * POST /api/onboarding/convert-to-draft
 *
 * HR converts a candidate (who has an accepted offer or hired application)
 * into a Draft Employee. This does NOT create an Employee record or generate
 * an Employee ID. Instead it:
 *
 *  1. Creates/updates a PreboardingCandidate with draft employee fields
 *     (department, designation, manager, salary, etc.)
 *  2. Sets onboardingStatus = 'bgv_pending'
 *  3. Sets status = 'document_collection'
 *  4. Links the candidate's CandidatePortalUser account
 *  5. Sends "Onboarding Started" notification
 *  6. Creates audit log
 *
 * The candidate keeps their existing Candidate Portal login. An Onboarding
 * section appears in their portal where they can upload documents and see
 * BGV status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'recruiter', 'recruiter_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden — only HR/Admins can convert candidates' }, { status: 403, headers: CORS });

    const body = await req.json();
    const {
      applicationId, offerId, candidateEmail, candidateName, candidatePhone,
      joiningDate, departmentId, designationId, reportingManagerId,
      employmentType, ctc, workLocation, startDate, jobTitle,
    } = body || {};

    if (!candidateEmail && !applicationId && !offerId) {
      return NextResponse.json({ error: 'Provide applicationId, offerId, or candidateEmail' }, { status: 400, headers: CORS });
    }

    // ── Gather candidate data from application/offer if not provided ──
    let app: any = null;
    let offer: any = null;
    let resolvedEmail = candidateEmail || '';
    let resolvedName = candidateName || '';
    let resolvedPhone = candidatePhone || '';
    let resolvedJobTitle = jobTitle || '';

    if (applicationId) {
      app = await db.jobApplication.findUnique({
        where: { id: applicationId },
        include: { jobPosting: { select: { id: true, title: true, departmentId: true } } },
      }).catch(() => null);
      if (app) {
        resolvedEmail = resolvedEmail || app.candidateEmail;
        resolvedName = resolvedName || app.candidateName;
        resolvedPhone = resolvedPhone || app.candidatePhone || '';
        resolvedJobTitle = resolvedJobTitle || app.jobPosting?.title || '';
      }
    }
    if (offerId && !app) {
      offer = await db.offer.findUnique({ where: { id: offerId } }).catch(() => null);
      if (offer) {
        resolvedEmail = resolvedEmail || offer.candidateEmail;
        resolvedName = resolvedName || offer.candidateName;
        resolvedJobTitle = resolvedJobTitle || offer.position || '';
      }
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: 'Could not determine candidate email' }, { status: 400, headers: CORS });
    }

    // ── Prevent duplicate conversion ──
    const existing = await db.$queryRawUnsafe(
      `SELECT id, "onboardingStatus" FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 AND "onboardingStatus" IN ('bgv_pending','provisional_employee','active_employee') LIMIT 1`,
      resolvedEmail.toLowerCase(),
    ).catch(() => []) as any[];
    if (existing.length > 0) {
      return NextResponse.json({
        error: `Candidate is already in onboarding pipeline (status: ${existing[0].onboardingStatus})`,
      }, { status: 409, headers: CORS });
    }

    // ── Find or create the CandidatePortalUser account ──
    let portalUser = await db.$queryRawUnsafe(
      `SELECT id FROM "CandidatePortalUser" WHERE "candidateEmail" = $1 LIMIT 1`,
      resolvedEmail.toLowerCase(),
    ).catch(() => []) as any[];

    let portalUserId = portalUser[0]?.id || null;
    if (!portalUserId) {
      // Create a CandidatePortalUser with a default password so they can log in
      const defaultPassword = 'Welcome@123';
      const hashedPwd = await hashPassword(defaultPassword);
      const newPortal = await db.$queryRawUnsafe(
        `INSERT INTO "CandidatePortalUser" ("candidateEmail", "candidateName", "passwordHash", "passwordSetAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, NOW(), NOW(), NOW()) RETURNING id`,
        resolvedEmail.toLowerCase(), resolvedName, hashedPwd,
      ).catch(() => []) as any[];
      portalUserId = newPortal[0]?.id || null;
    }

    // ── Create or update PreboardingCandidate with draft fields ──
    const jDate = joiningDate ? new Date(joiningDate) : new Date();
    const sDate = startDate ? new Date(startDate) : jDate;

    // Check if a PreboardingCandidate already exists for this email
    const existingPb = await db.$queryRawUnsafe(
      `SELECT id FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 LIMIT 1`,
      resolvedEmail.toLowerCase(),
    ).catch(() => []) as any[];

    let preboardingId: string;
    if (existingPb.length > 0) {
      // Update existing
      preboardingId = existingPb[0].id;
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET
          "candidateName" = $1, "candidatePhone" = $2, "jobTitle" = $3,
          "departmentId" = $4, "designationId" = $5, "reportingManagerId" = $6,
          "employmentType" = $7, "ctc" = $8, "workLocation" = $9,
          "joiningDate" = $10, "startDate" = $11,
          "candidatePortalUserId" = $12, "onboardingStatus" = 'bgv_pending',
          "status" = 'document_collection', "backgroundCheckStatus" = 'pending',
          "convertedById" = $13, "updatedAt" = NOW()
        WHERE "id" = $14`,
        resolvedName, resolvedPhone || null, resolvedJobTitle || null,
        departmentId || null, designationId || null, reportingManagerId || null,
        employmentType || 'full-time', ctc ? Number(ctc) : null, workLocation || null,
        jDate, sDate, portalUserId, auth.userId, preboardingId,
      ).catch(() => 0);
    } else {
      // Create new
      const newPb = await db.$queryRawUnsafe(
        `INSERT INTO "PreboardingCandidate" (
          "candidateName", "candidateEmail", "candidatePhone", "jobTitle",
          "departmentId", "designationId", "reportingManagerId",
          "employmentType", "offeredSalary", "currency", "ctc", "workLocation",
          "joiningDate", "startDate", "offerDate",
          "candidatePortalUserId", "onboardingStatus", "status", "backgroundCheckStatus",
          "convertedById", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'INR', $10, $11, $12, $13, NOW(),
          $14, 'bgv_pending', 'document_collection', 'pending', $15, NOW(), NOW()
        ) RETURNING id`,
        resolvedName, resolvedEmail.toLowerCase(), resolvedPhone || null, resolvedJobTitle || null,
        departmentId || null, designationId || null, reportingManagerId || null,
        employmentType || 'full-time', ctc ? Number(ctc) : null, ctc ? Number(ctc) : null, workLocation || null,
        jDate, sDate, portalUserId, auth.userId,
      ).catch(() => []) as any[];
      preboardingId = newPb[0]?.id || '';
    }

    // ── Seed default required documents (if not already configured) ──
    const defaultDocs = [
      { type: 'aadhaar', label: 'Aadhaar Card' },
      { type: 'pan', label: 'PAN Card' },
      { type: 'education_cert', label: 'Educational Certificate' },
      { type: 'experience_letter', label: 'Previous Employment Experience Letter' },
      { type: 'bank_proof', label: 'Bank Account Proof' },
      { type: 'address_proof', label: 'Address Proof' },
    ];
    for (const doc of defaultDocs) {
      await db.$executeRawUnsafe(
        `INSERT INTO "OnboardingDocument" ("id", "preboardingCandidateId", "candidateEmail", "documentType", "documentLabel", "status", "createdAt", "updatedAt")
         SELECT $1, $2, $3, $4, $5, 'pending', NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM "OnboardingDocument" WHERE "preboardingCandidateId" = $2 AND "documentType" = $4
         )`,
        `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        preboardingId, resolvedEmail.toLowerCase(), doc.type, doc.label,
      ).catch(() => 0);
    }

    // ── Send "Onboarding Started" notification to candidate's portal ──
    // (via in-app notification on the CandidatePortalUser)
    // We'll store this as a CandidateMessage so it appears in their portal
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "CandidateMessage" ("id", "candidateEmail", "senderRole", "message", "createdAt", "updatedAt")
         VALUES ($1, $2, 'system', $3, NOW(), NOW())`,
        `msg-${Date.now()}`, resolvedEmail.toLowerCase(),
        `Welcome to the onboarding process! Your status is now "BGV Pending". Please upload your documents in the Onboarding section. Your Employee ID will be assigned after Background Verification is complete.`,
      );
    } catch { /* non-critical */ }

    // ── Audit log ──
    try {
      await db.auditLog.create({
        data: {
          userId: auth.userId,
          action: 'CANDIDATE_CONVERTED_TO_DRAFT',
          module: 'onboarding',
          details: `Converted ${resolvedName} (${resolvedEmail}) to draft employee. Preboarding ID: ${preboardingId}. Department: ${departmentId || 'n/a'}. CTC: ${ctc || 'n/a'}.`,
        },
      }).catch(() => null);
    } catch { /* non-critical */ }

    return NextResponse.json({
      message: `Candidate converted to draft employee. Onboarding started. Status: BGV Pending.`,
      preboardingCandidateId: preboardingId,
      candidateEmail: resolvedEmail,
      onboardingStatus: 'bgv_pending',
      portalUserId: portalUserId,
      defaultPassword: portalUser.length === 0 ? 'Welcome@123' : undefined,
      documentsSeeded: defaultDocs.length,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Convert-to-draft error:', error);
    const msg = error instanceof Error ? error.message : 'Conversion failed';
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
