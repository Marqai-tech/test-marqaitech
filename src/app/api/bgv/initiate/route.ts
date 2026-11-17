import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES, nextCaseNumber, notifyBgvEvent, BGV_TERMINAL_STATUSES, resolveBaseUrl } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/bgv/initiate — HR initiates BGV with a vendor (mock screen 07).
 *
 * Hardened per the vendor-access brief (fix #6):
 *  - preboardingCandidateId is REQUIRED and the candidate + every shared
 *    document are resolved server-side from OnboardingDocument with an
 *    ownership predicate — omitting/forgetging the id cannot bypass checks.
 *  - Candidate must be in an eligible preboarding/offer-accepted state.
 *  - Request + checks + shares are created inside ONE transaction with a
 *    row lock on the candidate's existing cases; a partial UNIQUE index
 *    ("BgvRequest_active_candidateEmail_key") is the final guard — a second
 *    active case for the same candidate is impossible even under concurrency.
 *  - Only ACTIVE vendors with at least one active vendor admin can receive
 *    cases; otherwise HR gets a clear remedy instead of a silently lost case.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const {
      preboardingCandidateId, vendorCompanyId, checks, documents,
      dueDate, instructions,
    } = body || {};

    // candidateEmail is DERIVED from the candidate row — the client never
    // supplies it, so a forged email/candidate combination is impossible.
    if (!preboardingCandidateId || !vendorCompanyId) {
      return NextResponse.json({ error: 'preboardingCandidateId and vendorCompanyId are required' }, { status: 400, headers: CORS });
    }
    if (!Array.isArray(checks) || checks.length === 0) {
      return NextResponse.json({ error: 'Select at least one verification check' }, { status: 400, headers: CORS });
    }
    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: 'Select at least one approved document to share with the vendor' }, { status: 400, headers: CORS });
    }

    // ── Vendor: active + has at least one active admin (else HR must fix staffing first)
    const vcRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorCompany" WHERE "id"=$1 AND "status"='active' LIMIT 1`, vendorCompanyId,
    ).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor not found or inactive' }, { status: 404, headers: CORS });
    const vendor = vcRows[0];

    const adminRows = await db.$queryRawUnsafe(
      `SELECT "email","name" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active' LIMIT 1`,
      vendorCompanyId,
    ).catch(() => []) as any[];
    if (adminRows.length === 0) {
      return NextResponse.json(
        { error: `No active administrator exists for ${vendor.name}. Invite an admin from Vendor Management first, or the case would sit unattended.` },
        { status: 409, headers: CORS },
      );
    }

    // ── Candidate: server-side ownership + eligibility
    const pbRows = await db.$queryRawUnsafe(
      `SELECT "id","candidateEmail","candidateName","status","onboardingStatus","backgroundCheckStatus"
         FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`,
      preboardingCandidateId,
    ).catch(() => []) as any[];
    if (pbRows.length === 0) {
      return NextResponse.json({ error: 'Candidate not found for this case' }, { status: 404, headers: CORS });
    }
    const pb = pbRows[0];
    const candidateEmail = String(pb.candidateEmail || '').toLowerCase();
    if (!candidateEmail) {
      return NextResponse.json({ error: 'Candidate has no email on record' }, { status: 422, headers: CORS });
    }

    // Eligibility: accepted-offer / preboarding stage, BGV not already cleared/failed.
    const eligibleStatuses = ['offer_accepted', 'preboarding', 'initiated', 'details_pending', 'verification', 'ready_to_join', 'joined'];
    const pbStatus = String(pb.status || '').toLowerCase();
    const onboardingStatus = String(pb.onboardingStatus || '').toLowerCase();
    if (pb.backgroundCheckStatus === 'cleared' || pb.backgroundCheckStatus === 'failed') {
      return NextResponse.json({ error: `BGV for this candidate is already ${pb.backgroundCheckStatus}.` }, { status: 409, headers: CORS });
    }
    if (!eligibleStatuses.includes(pbStatus) && !['provisional_employee', 'bgv_pending', ''].includes(onboardingStatus)) {
      return NextResponse.json(
        { error: `Candidate state (${pbStatus || onboardingStatus || 'unknown'}) is not eligible for BGV initiation yet.` },
        { status: 409, headers: CORS },
      );
    }

    // ── Document ownership: every shared doc must belong to THIS candidate.
    const docIds = [...new Set(documents.map((d: any) => (typeof d === 'string' ? d : d?.id)).filter(Boolean))] as string[];
    if (docIds.length === 0) {
      return NextResponse.json({ error: 'No valid document ids supplied' }, { status: 400, headers: CORS });
    }
    const placeholders = docIds.map((_, i) => `$${i + 3}`).join(',');
    const docRows = await db.$queryRawUnsafe(
      `SELECT "id","documentType","documentLabel","status" FROM "OnboardingDocument"
        WHERE "id" IN (${placeholders}) AND "preboardingCandidateId" = $2 AND "candidateEmail" = $1`,
      candidateEmail, preboardingCandidateId, ...docIds,
    ).catch(() => []) as any[];
    const ownedIds = new Set(docRows.map((r: any) => r.id));
    const notOwned = docIds.filter((id) => !ownedIds.has(id));
    if (notOwned.length > 0) {
      return NextResponse.json(
        { error: `${notOwned.length} selected document(s) do not belong to this candidate — sharing blocked.` },
        { status: 403, headers: CORS },
      );
    }
    const approvedDocs = docRows.filter((r: any) => r.status === 'approved');
    if (approvedDocs.length === 0) {
      return NextResponse.json(
        { error: 'Only approved documents can be shared with a vendor. Approve the documents first (or select approved ones).' },
        { status: 409, headers: CORS },
      );
    }

    // Sanitized check list [{type,label}]
    const allowedCheckTypes = ['identity','address','employment','education','criminal','reference','other'];
    const cleanChecks = (checks as any[])
      .map((c) => (typeof c === 'string' ? { type: c, label: c } : { type: c?.type, label: c?.label || c?.type }))
      .filter((c) => c.type && allowedCheckTypes.includes(String(c.type)));
    if (cleanChecks.length === 0) {
      return NextResponse.json({ error: 'Invalid check types' }, { status: 400, headers: CORS });
    }

    const due = dueDate ? new Date(dueDate) : null;
    if (dueDate && (isNaN(due!.getTime()))) {
      return NextResponse.json({ error: 'Invalid due date' }, { status: 400, headers: CORS });
    }
    const instructionsSafe = String(instructions || '').slice(0, 1000) || null;

    const caseNumber = await nextCaseNumber(db);
    const reqId = `bgv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    // ── Transactional creation with duplicate guard.
    // Lock any existing rows for this candidate (serializes concurrent HR
    // clicks), re-check for an active case, then insert. The partial unique
    // index is the final backstop.
    try {
      await db.$transaction(async (tx: any) => {
        const existing = await tx.$queryRawUnsafe(
          `SELECT "id","status" FROM "BgvRequest"
            WHERE "candidateEmail"=$1 AND "status" NOT IN (${'\'' + BGV_TERMINAL_STATUSES.join('\',\'') + '\''})
            ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`,
          candidateEmail,
        );
        if (existing.length > 0) {
          throw Object.assign(new Error('An active BGV case already exists for this candidate'), { code: 'DUPLICATE_ACTIVE' });
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO "BgvRequest" ("id","candidateEmail","candidateName","preboardingCandidateId","vendorCompanyId","initiatedByHRId","status","caseNumber","dueDate","instructions","checks","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'awaiting_assignment',$7,$8,$9,$10,NOW(),NOW())`,
          reqId, candidateEmail, pb.candidateName || null, preboardingCandidateId, vendorCompanyId, auth.userId,
          caseNumber, due, instructionsSafe, JSON.stringify(cleanChecks),
        );

        for (const c of cleanChecks) {
          const checkId = `chk-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
          await tx.$executeRawUnsafe(
            `INSERT INTO "BgvCheck" ("id","bgvRequestId","checkType","checkLabel","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,'pending',NOW(),NOW())`,
            checkId, reqId, c.type, c.label,
          );
        }

        for (const doc of approvedDocs) {
          const shareId = `sh-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
          await tx.$executeRawUnsafe(
            `INSERT INTO "BgvDocumentShare" ("id","bgvRequestId","onboardingDocumentId","documentType","documentLabel","fileUrl","sharedById")
             VALUES ($1,$2,$3,$4,$5,NULL,$6)`,
            shareId, reqId, doc.id, doc.documentType || null, doc.documentLabel || null, auth.userId,
          );
        }
      });
    } catch (txError: any) {
      if (txError?.code === 'DUPLICATE_ACTIVE' || String(txError?.message || '').includes('bgvrequest_active_candidateemail_key') || txError?.code === 'P2002') {
        return NextResponse.json(
          { error: 'An active BGV case already exists for this candidate.', code: 'DUPLICATE_ACTIVE' },
          { status: 409, headers: CORS },
        );
      }
      throw txError;
    }

    // Set the preboarding candidate's BGV marker (progress flow).
    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "backgroundCheckStatus"='in_progress',"updatedAt"=NOW() WHERE "id"=$1`,
      preboardingCandidateId,
    ).catch(() => 0);

    // ── Notify the vendor's active admins (delivered state is recorded).
    const baseUrl = resolveBaseUrl(req);
    const admins = await db.$queryRawUnsafe(
      `SELECT "email","name" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active'`,
      vendorCompanyId,
    ).catch(() => []) as any[];
    for (const admin of admins) {
      await notifyBgvEvent({
        db,
        event: 'bgv_initiated',
        recipient: admin.email,
        bgvRequestId: reqId,
        vendorCompanyId,
        subject: `New BGV case ${caseNumber}: ${pb.candidateName || candidateEmail}`,
        html: `<p>A new background verification case was assigned to <strong>${vendor.name}</strong>.</p>
               <table style="border-collapse:collapse;font-family:Arial;">
                 <tr><td style="padding:4px 10px;color:#64748b;">Case ID</td><td style="padding:4px 10px;"><b>${caseNumber}</b></td></tr>
                 <tr><td style="padding:4px 10px;color:#64748b;">Candidate</td><td style="padding:4px 10px;">${pb.candidateName || ''} (${candidateEmail})</td></tr>
                 <tr><td style="padding:4px 10px;color:#64748b;">Checks</td><td style="padding:4px 10px;">${cleanChecks.map((c: any) => c.label || c.type).join(', ')}</td></tr>
                 <tr><td style="padding:4px 10px;color:#64748b;">Due</td><td style="padding:4px 10px;">${due ? due.toISOString().slice(0, 10) : '—'}</td></tr>
               </table>
               <p>The case is in your <b>Unassigned</b> queue — assign it to one of your active employees from the vendor dashboard${baseUrl ? ` (<a href="${baseUrl}/vendor-portal/dashboard">open dashboard</a>)` : ''}.</p>`,
        inAppUserId: auth.userId,
        inAppTitle: 'BGV case initiated',
        inAppMessage: `BGV case ${caseNumber} for ${pb.candidateName || candidateEmail} sent to ${vendor.name}.`,
        tenantId: auth.tenantId,
      });
    }

    await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_REQUEST_INITIATED', module: 'bgv', details: `Initiated BGV ${caseNumber} for ${pb.candidateName || candidateEmail} → vendor ${vendor.name}` } }).catch(() => null);

    return NextResponse.json({
      message: `BGV case ${caseNumber} created — sent to ${vendor.name}'s admin for assignment.`,
      requestId: reqId, caseNumber, status: 'awaiting_assignment', vendor: vendor.name,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('BGV initiate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
