import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken, hashPassword } from '@/lib/auth';
import { HR_ROLES, ensurePreboardingId } from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * BRD 5.3 — Preboarding Initiation (dedicated screen backend).
 *
 * Eligibility (server-enforced, mirrors BRD §2.1 + 5.3):
 *   - a valid offer exists AND Offer.status = 'accepted'
 *   - offer not withdrawn (status check covers it)
 *   - no active preboarding for that candidate email
 *   - no active (draft/invited) initiation for that offer
 *
 * GET  (no params)  → { eligible, drafts, invited }   for the Level-1 list
 * GET  ?offerId=    → { offer, initiation }           for the initiation form
 * POST { action }
 *   save-draft      → upsert draft payload for the offer (draft only)
 *   send-invitation → validate + create PreboardingCandidate, portal user,
 *                     User account, selected OnboardingDocuments and flip the
 *                     initiation to 'invited' — all inside ONE $transaction
 *                     (BRD 5.3: retries/double-clicks can't duplicate records).
 *   cancel          → draft → cancelled (reason required)
 */

type Tx = { $queryRawUnsafe: (q: string, ...p: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...p: any[]) => Promise<any> };

const ACTIVE_PB_STATUSES = "('bgv_pending','provisional_employee','active_employee')";
const DEFAULT_DOCS = [
  { type: 'aadhaar', label: 'Aadhaar Card', required: true },
  { type: 'pan', label: 'PAN Card', required: true },
  { type: 'education_cert', label: 'Educational Certificate', required: true },
  { type: 'experience_letter', label: 'Previous Employment Experience Letter', required: false },
  { type: 'bank_proof', label: 'Bank Account Proof', required: true },
  { type: 'address_proof', label: 'Address Proof', required: false },
];

const OFFER_SELECT = `SELECT "id","candidateId","candidateName","candidateEmail","position","department",
  "offeredSalary","offeredCurrency","offeredCTC","joiningDate","probationPeriod","reportingTo",
  "status","sentAt","respondedAt","jobPostingId" FROM "Offer"`;

function jsonb(v: unknown): string {
  return JSON.stringify(v ?? {});
}

async function loadOffer(db: Tx, offerId: string) {
  const rows = await db.$queryRawUnsafe(`${OFFER_SELECT} WHERE "id"=$1 LIMIT 1`, offerId).catch(() => []) as any[];
  return rows[0] || null;
}

async function loadActiveInitiation(db: Tx, offerId: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT * FROM "PreboardingInitiation" WHERE "offerId"=$1 AND "status" IN ('draft','invited')
     ORDER BY "createdAt" DESC LIMIT 1`, offerId,
  ).catch(() => []) as any[];
  return rows[0] || null;
}

/** Best-effort link from the accepted offer back to its JobApplication. */
async function findApplicationId(db: Tx, offer: any): Promise<string | null> {
  const rows = await db.$queryRawUnsafe(
    `SELECT "id" FROM "JobApplication"
     WHERE LOWER("candidateEmail") = LOWER($1) AND ("jobPostingId" = $2 OR $2::text IS NULL)
     ORDER BY ("jobPostingId" = $2) DESC NULLS LAST, "createdAt" DESC LIMIT 1`,
    offer.candidateEmail, offer.jobPostingId || null,
  ).catch(() => []) as any[];
  return rows[0]?.id || null;
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const offerId = new URL(req.url).searchParams.get('offerId');
    if (offerId) {
      const offer = await loadOffer(db, offerId);
      if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: CORS });
      const initiation = await loadActiveInitiation(db, offerId);
      return NextResponse.json({ offer, initiation, defaultDocuments: DEFAULT_DOCS }, { headers: CORS });
    }

    // Level 1: eligible accepted offers (no active preboarding / no invited
    // initiation), plus saved drafts and recent invitations.
    const eligible = await db.$queryRawUnsafe(
      `SELECT o."id", o."candidateName", o."candidateEmail", o."position", o."department",
              o."offeredSalary", o."offeredCurrency", o."offeredCTC", o."joiningDate",
              o."probationPeriod", o."respondedAt", o."jobPostingId"
       FROM "Offer" o
       WHERE o."status" = 'accepted'
         AND NOT EXISTS (
           SELECT 1 FROM "PreboardingCandidate" p
           WHERE LOWER(p."candidateEmail") = LOWER(o."candidateEmail")
             AND p."onboardingStatus" IN ${ACTIVE_PB_STATUSES})
         AND NOT EXISTS (
           SELECT 1 FROM "PreboardingInitiation" i
           WHERE i."offerId" = o."id" AND i."status" = 'invited')
       ORDER BY o."respondedAt" DESC NULLS LAST LIMIT 200`,
    ).catch(() => []) as any[];

    const drafts = await db.$queryRawUnsafe(
      `SELECT i.*, o."position", o."offeredSalary", o."offeredCurrency", o."joiningDate" AS "offerJoiningDate"
       FROM "PreboardingInitiation" i LEFT JOIN "Offer" o ON o."id" = i."offerId"
       WHERE i."status" = 'draft' ORDER BY i."updatedAt" DESC LIMIT 100`,
    ).catch(() => []) as any[];

    const invited = await db.$queryRawUnsafe(
      `SELECT i."id", i."offerId", i."candidateName", i."candidateEmail", i."jobTitle",
              i."invitedAt", i."preboardingCandidateId", i."status", o."position"
       FROM "PreboardingInitiation" i LEFT JOIN "Offer" o ON o."id" = i."offerId"
       WHERE i."status" = 'invited' ORDER BY i."invitedAt" DESC LIMIT 100`,
    ).catch(() => []) as any[];

    return NextResponse.json({ eligible, drafts, invited }, { headers: CORS });
  } catch (error) {
    console.error('[initiation] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }
    const userId = String((decoded as any).userId || '');
    const tenantId = (decoded as any).tenantId || null;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const offerId = String(body.offerId || '');
    if (!['save-draft', 'send-invitation', 'cancel'].includes(action)) {
      return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400, headers: CORS });
    }
    if (!offerId) return NextResponse.json({ error: 'offerId required' }, { status: 400, headers: CORS });

    const offer = await loadOffer(db, offerId);
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: CORS });
    // ── BRD §2.1 / 5.3 eligibility — server-side, not UI-gated ──
    if (offer.status !== 'accepted') {
      return NextResponse.json(
        { error: `BRD §2.1: preboarding can only be initiated for an ACCEPTED offer (current status: '${offer.status}').` },
        { status: 409, headers: CORS },
      );
    }
    const candidateEmail = String(offer.candidateEmail || '').toLowerCase();
    if (!candidateEmail) return NextResponse.json({ error: 'Offer has no candidate email' }, { status: 400, headers: CORS });

    const existingPb = await db.$queryRawUnsafe(
      `SELECT "id","onboardingStatus" FROM "PreboardingCandidate"
       WHERE "candidateEmail" = $1 AND "onboardingStatus" IN ${ACTIVE_PB_STATUSES} LIMIT 1`,
      candidateEmail,
    ).catch(() => []) as any[];
    if (existingPb.length) {
      return NextResponse.json(
        { error: `Candidate already in onboarding (status: ${existingPb[0].onboardingStatus}).` },
        { status: 409, headers: CORS },
      );
    }

    const hrDetails = body.hrDetails && typeof body.hrDetails === 'object' ? body.hrDetails : {};
    const checklist = body.checklist && typeof body.checklist === 'object' ? body.checklist : {};
    const communication = body.communication && typeof body.communication === 'object' ? body.communication : { sendEmail: true, sendInApp: true };
    const remarks = typeof body.remarks === 'string' ? body.remarks : null;

    // ── cancel: draft only, reason required ──
    if (action === 'cancel') {
      const reason = String(body.reason || '').trim();
      if (!reason) return NextResponse.json({ error: 'A cancellation reason is required' }, { status: 400, headers: CORS });
      const draft = await loadActiveInitiation(db, offerId);
      if (!draft || draft.status !== 'draft') {
        return NextResponse.json({ error: 'Only a DRAFT initiation can be cancelled' }, { status: 409, headers: CORS });
      }
      const n = await db.$executeRawUnsafe(
        `UPDATE "PreboardingInitiation" SET "status"='cancelled', "cancelledById"=$2, "cancelledAt"=NOW(),
           "cancelReason"=$3, "updatedAt"=NOW() WHERE "id"=$1 AND "status"='draft'`,
        draft.id, userId, reason,
      ).catch(() => 0);
      if (!n) return NextResponse.json({ error: 'Initiation was already cancelled or invited' }, { status: 409, headers: CORS });
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" ("id","userId","action","module","details","createdAt")
         VALUES ($1,$2,'PREBOARDING_INITIATION_CANCELLED','preboarding',$3,NOW())`,
        `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId,
        `Cancelled initiation for ${offer.candidateName} (${candidateEmail}), offer ${offerId}. Reason: ${reason}`,
      ).catch(() => 0);
      return NextResponse.json({ message: 'Initiation cancelled', status: 'cancelled' }, { headers: CORS });
    }

    // ── validation for save-draft / send-invitation ──
    const joiningDate = hrDetails.joiningDate ? new Date(hrDetails.joiningDate) : null;
    if (action === 'send-invitation') {
      if (!joiningDate || Number.isNaN(joiningDate.getTime())) {
        return NextResponse.json({ error: 'HR Details: a valid expected joining date is required before sending the invitation' }, { status: 400, headers: CORS });
      }
      if (!hrDetails.departmentId) {
        return NextResponse.json({ error: 'HR Details: department is required before sending the invitation' }, { status: 400, headers: CORS });
      }
      if (!hrDetails.ctc || Number(hrDetails.ctc) <= 0) {
        return NextResponse.json({ error: 'HR Details: CTC is required before sending the invitation' }, { status: 400, headers: CORS });
      }
    }

    const documents: Array<{ type: string; label: string; required: boolean }> =
      Array.isArray(checklist.documents) && checklist.documents.length
        ? checklist.documents.filter((d: any) => d && d.type && d.label)
        : DEFAULT_DOCS;

    // ── save-draft: upsert (draft only) ──
    if (action === 'save-draft') {
      const draft = await loadActiveInitiation(db, offerId);
      if (draft && draft.status === 'invited') {
        return NextResponse.json({ error: 'Invitation already sent for this offer' }, { status: 409, headers: CORS });
      }
      if (draft) {
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingInitiation" SET "hrDetails"=$2, "checklist"=$3, "communication"=$4,
             "remarks"=$5, "jobTitle"=$6, "updatedAt"=NOW() WHERE "id"=$1 AND "status"='draft'`,
          draft.id, jsonb(hrDetails), jsonb(checklist), jsonb(communication), remarks, offer.position,
        ).catch(() => 0);
        return NextResponse.json({ message: 'Draft saved', initiationId: draft.id, status: 'draft' }, { headers: CORS });
      }
      const iniId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "PreboardingInitiation"
             ("id","offerId","applicationId","candidateName","candidateEmail","jobTitle",
              "hrDetails","checklist","communication","remarks","status","createdById","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,NOW(),NOW())`,
          iniId, offerId, await findApplicationId(db, offer), offer.candidateName, candidateEmail,
          offer.position, jsonb(hrDetails), jsonb(checklist), jsonb(communication), remarks, userId,
        );
      } catch (e: any) {
        if (String(e?.message || '').includes('PreboardingInitiation_active_offer_key')) {
          return NextResponse.json({ error: 'An active initiation already exists for this offer' }, { status: 409, headers: CORS });
        }
        throw e;
      }
      return NextResponse.json({ message: 'Draft saved', initiationId: iniId, status: 'draft' }, { status: 201, headers: CORS });
    }

    // ── send-invitation ──
    const draft = await loadActiveInitiation(db, offerId);
    if (draft && draft.status === 'invited') {
      return NextResponse.json({ error: 'Invitation already sent for this offer' }, { status: 409, headers: CORS });
    }

    // Harden FK targets (same normalization as convert-to-draft).
    let departmentId = hrDetails.departmentId || null;
    let designationId = hrDetails.designationId || null;
    let reportingManagerId = hrDetails.reportingManagerId || null;
    if (departmentId) {
      const ok = await db.$queryRawUnsafe(`SELECT id FROM "Department" WHERE id=$1 LIMIT 1`, departmentId).catch(() => []) as any[];
      if (!ok[0]) departmentId = null;
    }
    if (designationId) {
      const ok = await db.$queryRawUnsafe(`SELECT id FROM "Designation" WHERE id=$1 LIMIT 1`, designationId).catch(() => []) as any[];
      if (!ok[0]) designationId = null;
    }
    // BRD 5.1 filters — company/branch stored on the preboarding record.
    let companyId = hrDetails.companyId || null;
    let branchId = hrDetails.branchId || null;
    if (companyId) {
      const ok = await db.$queryRawUnsafe(`SELECT id FROM "Company" WHERE id=$1 LIMIT 1`, companyId).catch(() => []) as any[];
      if (!ok[0]) companyId = null;
    }
    if (branchId) {
      const ok = await db.$queryRawUnsafe(`SELECT id FROM "Branch" WHERE id=$1 LIMIT 1`, branchId).catch(() => []) as any[];
      if (!ok[0]) branchId = null;
    }
    if (reportingManagerId) {
      const empOk = await db.$queryRawUnsafe(`SELECT id FROM "Employee" WHERE id=$1 LIMIT 1`, reportingManagerId).catch(() => []) as any[];
      if (!empOk[0]) {
        const viaUser = await db.$queryRawUnsafe(
          `SELECT e."id" FROM "Employee" e JOIN "User" u ON u.id = e."userId" WHERE u.id=$1 LIMIT 1`, reportingManagerId,
        ).catch(() => []) as any[];
        reportingManagerId = viaUser[0]?.id || null;
      }
    }

    const applicationId = draft?.applicationId || await findApplicationId(db, offer);
    // Preboarding must reuse the candidate portal account. Do not create or
    // assign a company email until the employee-conversion step is completed.
    const companyEmail = null;

    // Portal user (candidate's SAME account is preserved — find or create).
    let portalUserId: string | null = null;
    const portalUser = await db.$queryRawUnsafe(
      `SELECT id FROM "CandidatePortalUser" WHERE "candidateEmail"=$1 LIMIT 1`, candidateEmail,
    ).catch(() => []) as any[];
    if (portalUser[0]) {
      portalUserId = portalUser[0].id;
    } else {
      const cpuId = `cpu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const hashed = await hashPassword('Welcome@123');
      const created = await db.$queryRawUnsafe(
        `INSERT INTO "CandidatePortalUser" ("id","candidateEmail","candidateName","passwordHash","passwordSetAt","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,NOW(),NOW(),NOW()) RETURNING id`,
        cpuId, candidateEmail, offer.candidateName, hashed,
      ).catch(() => []) as any[];
      portalUserId = created[0]?.id || cpuId;
    }

    const pbId = `pb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jDate = joiningDate || (offer.joiningDate ? new Date(offer.joiningDate) : new Date());
    const ctc = Number(hrDetails.ctc) || Number(offer.offeredCTC) || Number(offer.offeredSalary) || null;

    // Atomic claim + creation (BRD 5.3): the unique active-offer index and the
    // status-guarded UPDATE make retries/double-clicks a 409, and the
    // $transaction means no partial records if any insert fails.
    try {
      await db.$transaction(async (tx: Tx) => {
        if (draft) {
          const n = await tx.$executeRawUnsafe(
            `UPDATE "PreboardingInitiation" SET "status"='invited', "invitedById"=$2, "invitedAt"=NOW(),
               "hrDetails"=$3, "checklist"=$4, "communication"=$5, "remarks"=$6, "jobTitle"=$7, "updatedAt"=NOW()
             WHERE "id"=$1 AND "status"='draft'`,
            draft.id, userId, jsonb(hrDetails), jsonb(checklist), jsonb(communication), remarks, offer.position,
          );
          if (!n) throw new Error('INITIATION_ALREADY_INVITED');
        } else {
          await tx.$executeRawUnsafe(
            `INSERT INTO "PreboardingInitiation"
               ("id","offerId","applicationId","candidateName","candidateEmail","jobTitle","hrDetails",
                "checklist","communication","remarks","status","createdById","invitedById","invitedAt",
                "preboardingCandidateId","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'invited',$11,$11,NOW(),NULL,NOW(),NOW())`,
            `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, offerId, applicationId,
            offer.candidateName, candidateEmail, offer.position, jsonb(hrDetails), jsonb(checklist),
            jsonb(communication), remarks, userId,
          );
        }

        const pbRows = await tx.$queryRawUnsafe(
          `SELECT "id" FROM "PreboardingCandidate" WHERE "candidateEmail"=$1 AND "onboardingStatus" IN ${ACTIVE_PB_STATUSES} LIMIT 1`,
          candidateEmail,
        );
        if (pbRows.length) throw new Error('CANDIDATE_ALREADY_IN_ONBOARDING');

        await tx.$executeRawUnsafe(
          `INSERT INTO "PreboardingCandidate"
             ("id","candidateName","candidateEmail","jobTitle","departmentId","designationId","reportingManagerId",
              "employmentType","offeredSalary","currency","ctc","workLocation","joiningDate","startDate","offerDate",
              "offerId","jobApplicationId","candidatePortalUserId","companyEmail","companyId","branchId",
              "onboardingStatus","status","backgroundCheckStatus","convertedById","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'INR',$10,$11,$12,$12,NOW(),$13,$14,$15,$16,$17,$18,'bgv_pending',
                  'document_collection','pending',$19,NOW(),NOW())`,
          pbId, offer.candidateName, candidateEmail, offer.position || null, departmentId, designationId,
          reportingManagerId, hrDetails.employmentType || 'full-time', ctc, ctc, hrDetails.workLocation || null,
          jDate, offerId, applicationId, portalUserId, companyEmail, companyId, branchId, userId,
        );

        for (const doc of documents) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "OnboardingDocument"
               ("id","preboardingCandidateId","candidateEmail","documentType","documentLabel","required","status","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW(),NOW())`,
            `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, pbId, candidateEmail,
            doc.type, doc.label, doc.required === false ? false : true,
          );
        }

        const iniIdRow = await tx.$queryRawUnsafe(
          `SELECT "id" FROM "PreboardingInitiation" WHERE "offerId"=$1 AND "status"='invited' ORDER BY "invitedAt" DESC LIMIT 1`,
          offerId,
        );
        if (iniIdRow[0]) {
          await tx.$executeRawUnsafe(
            `UPDATE "PreboardingInitiation" SET "preboardingCandidateId"=$2, "updatedAt"=NOW() WHERE "id"=$1`,
            iniIdRow[0].id, pbId,
          );
        }
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('INITIATION_ALREADY_INVITED') || msg.includes('PreboardingInitiation_active_offer_key')) {
        return NextResponse.json({ error: 'Invitation already sent for this offer' }, { status: 409, headers: CORS });
      }
      if (msg.includes('CANDIDATE_ALREADY_IN_ONBOARDING')) {
        return NextResponse.json({ error: 'Candidate already in onboarding' }, { status: 409, headers: CORS });
      }
      throw e;
    }

    const preboardingId = await ensurePreboardingId(db, { id: pbId });

    // Notifications AFTER the data change succeeded (BRD 5.3).
    const joinDateStr = jDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const message = `Preboarding initiated for ${offer.position || 'your application'}! Expected joining: ${joinDateStr}. ` +
      `Open Preboarding in your candidate portal to complete your joining information and upload documents.` +
      (remarks ? ` Note from HR: ${remarks}` : '');
    if (communication.sendInApp !== false) {
      await db.$executeRawUnsafe(
        `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
         VALUES ($1,$2,'HR System','system',$3,$3,NOW(),NOW())`,
        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, candidateEmail, message,
      ).catch(() => 0);
    }

    let emailSent = false;
    if (communication.sendEmail !== false) {
      try {
        const { sendEmail } = await import('@/lib/email');
        const requiredDocumentList = documents
          .filter((doc: any) => doc.required !== false)
          .map((doc: any) => `<li>${doc.label || doc.type}</li>`)
          .join('');
        const res = await sendEmail({
          to: candidateEmail,
          subject: `Preboarding initiated — ${offer.position || 'your application'} (joining ${joinDateStr})`,
          html: `<p>Hi ${offer.candidateName},</p>
<p>Your preboarding has started for <strong>${offer.position || 'your application'}</strong>. Expected joining date: <strong>${joinDateStr}</strong>.</p>
<p>Use your existing candidate-portal login and open <strong>Preboarding</strong>. Complete your personal, address, bank, tax, emergency-contact and joining details, then upload the required documents.</p>
<p><strong>Required documents:</strong></p><ul>${requiredDocumentList || '<li>See the checklist in your portal</li>'}</ul>
<p>Upload clear files in the allowed format and size. If HR rejects a document, open the rejected item, read the remarks, correct it and upload it again. Your employee ID and company email will be created only after BGV and employee conversion are completed.</p>${remarks ? `<p><em>Note from HR: ${remarks}</em></p>` : ''}`,
        });
        emailSent = Boolean(res?.success);
      } catch { /* honest reporting below */ }
    }

    await db.$executeRawUnsafe(
      `INSERT INTO "AuditLog" ("id","userId","action","module","details","createdAt")
       VALUES ($1,$2,'PREBOARDING_INITIATED','preboarding',$3,NOW())`,
      `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId,
      `Initiated preboarding for ${offer.candidateName} (${candidateEmail}) from offer ${offerId}. Preboarding: ${preboardingId}. Candidate portal account reused; company account deferred until employee conversion. Email sent: ${emailSent}.`,
    ).catch(() => 0);

    return NextResponse.json({
      message: 'Invitation sent — preboarding initiated',
      preboardingCandidateId: pbId,
      preboardingId,
      companyEmail,
      documentsSeeded: documents.length,
      emailSent,
      status: 'invited',
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('[initiation] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
