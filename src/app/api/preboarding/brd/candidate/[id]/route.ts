/**
 * /api/preboarding/brd/candidate/[id]
 *
 * GET   — full BRD candidate profile:
 *           candidate + documents (with fileUrl for authorized HR) +
 *           portalDetails + readiness checklist + offer/employment info.
 * PATCH — BRD 5.2 C. Actions:
 *           action=update-joining-date  { joiningDate, reason }   (BRD: reason + notification)
 *           action=cancel               { reason }                (Cancel Preboarding)
 *           action=confirm-joining                                (Mark Joining Confirmed)
 *           action=send-reminder                                  (Send Reminder)
 *           action=assign-hr            { hrAssignedTo }
 *           action=return-for-correction { note }                 (BRD 5.4 — reopen portal wizard)
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import {
  HR_ROLES, deriveStage, parsePortalDetails, computeReadiness, ensurePreboardingId,
  notifyCandidate, audit, sendEmailBestEffort, STAGE_LABELS,
} from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

async function loadCandidate(db: any, id: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT * FROM "PreboardingCandidate" WHERE "id" = $1 LIMIT 1`, id,
  ).catch(() => []) as any[];
  return rows[0] || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }
    const { id } = await params;
    const pb = await loadCandidate(db, id);
    if (!pb) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });

    const preboardingId = await ensurePreboardingId(db, pb);
    const docs = await db.$queryRawUnsafe(
      `SELECT * FROM "OnboardingDocument" WHERE "preboardingCandidateId" = $1 ORDER BY "createdAt" ASC`, pb.id,
    ).catch(() => []) as any[];
    const readiness = computeReadiness(pb, docs);
    const messages = await db.$queryRawUnsafe(
      `SELECT "id","senderRole","message","createdAt","readAt" FROM "CandidateMessage" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 30`,
      pb.candidateEmail,
    ).catch(() => []) as any[];

    // Ref data
    let departmentName = null, designationName = null;
    if (pb.departmentId) { try { const r = await db.$queryRawUnsafe(`SELECT name FROM "Department" WHERE id=$1 LIMIT 1`, pb.departmentId) as any[]; departmentName = r[0]?.name || null; } catch {} }
    if (pb.designationId) { try { const r = await db.$queryRawUnsafe(`SELECT title FROM "Designation" WHERE id=$1 LIMIT 1`, pb.designationId) as any[]; designationName = r[0]?.title || null; } catch {} }

    const stage = deriveStage(pb);
    return NextResponse.json({
      candidate: {
        ...pb,
        preboardingId,
        stage,
        stageLabel: STAGE_LABELS[stage] || stage,
        department: departmentName,
        designation: designationName,
        portalDetails: parsePortalDetails(pb.portalDetails),
      },
      documents: docs,
      readiness,
      messages,
      stageLabel: STAGE_LABELS[stage] || stage,
    }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/candidate] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }
    const { id } = await params;
    const pb = await loadCandidate(db, id);
    if (!pb) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const preboardingId = await ensurePreboardingId(db, pb);
    const who = (decoded as any).name || (decoded as any).email || 'HR';

    switch (action) {
      case 'update-joining-date': {
        const jd = body.joiningDate ? new Date(body.joiningDate) : null;
        const reason = String(body.reason || '').trim();
        if (!jd) return NextResponse.json({ error: 'joiningDate is required' }, { status: 400, headers: CORS });
        if (!reason) return NextResponse.json({ error: 'A reason is required when changing the joining date (BRD 5.2 D.7)' }, { status: 400, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "joiningDate"=$1, "startDate"=$1, "postponedJoiningDate"=$1, "postponementReason"=$2, "updatedAt"=NOW() WHERE "id"=$3`,
          jd, reason, pb.id,
        );
        await notifyCandidate(db, pb.candidateEmail, `Your joining date has been updated to ${jd.toISOString().slice(0, 10)}. Reason: ${reason}`);
        await audit(db, (decoded as any).userId, 'PREBOARDING_JOINING_DATE_UPDATED', 'preboarding', `${preboardingId} ${pb.candidateName}: joining date → ${jd.toISOString().slice(0, 10)} (${reason}) by ${who}`);
        return NextResponse.json({ message: 'Joining date updated and candidate notified.' }, { headers: CORS });
      }

      case 'cancel': {
        const reason = String(body.reason || '').trim();
        if (!reason) return NextResponse.json({ error: 'A cancellation reason is mandatory (BRD 5.2 C)' }, { status: 400, headers: CORS });
        if (pb.employeeId) return NextResponse.json({ error: 'Cannot cancel — candidate already has an employee record' }, { status: 409, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "cancelledAt"=NOW(), "cancellationReason"=$1, "preboardingStage"='cancelled', "updatedAt"=NOW() WHERE "id"=$2`,
          reason, pb.id,
        );
        await notifyCandidate(db, pb.candidateEmail, `Your preboarding record ${preboardingId} has been cancelled. Reason: ${reason}`);
        await audit(db, (decoded as any).userId, 'PREBOARDING_CANCELLED', 'preboarding', `${preboardingId} ${pb.candidateName} cancelled: ${reason} (by ${who})`);
        return NextResponse.json({ message: 'Preboarding cancelled. History retained.' }, { headers: CORS });
      }

      case 'confirm-joining': {
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "joiningConfirmed"=TRUE, "joiningConfirmedAt"=NOW(), "preboardingStage"=CASE WHEN "preboardingStage" IN ('cancelled','did_not_join') THEN "preboardingStage" ELSE 'ready_to_join' END, "updatedAt"=NOW() WHERE "id"=$1`,
          pb.id,
        );
        await notifyCandidate(db, pb.candidateEmail, `HR has confirmed your joining intention for ${pb.jobTitle || 'your role'}. Please complete any remaining preboarding tasks.`);
        await audit(db, (decoded as any).userId, 'PREBOARDING_JOINING_CONFIRMED', 'preboarding', `${preboardingId} ${pb.candidateName}: joining confirmed by ${who}`);
        return NextResponse.json({ message: 'Joining confirmed.' }, { headers: CORS });
      }

      case 'send-reminder': {
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "reminderSentAt"=NOW(), "updatedAt"=NOW() WHERE "id"=$1`, pb.id,
        );
        const pendingDocs = await db.$queryRawUnsafe(
          `SELECT "documentLabel" FROM "OnboardingDocument" WHERE "preboardingCandidateId"=$1 AND "status" IN ('pending','rejected')`, pb.id,
        ).catch(() => []) as any[];
        const docList = pendingDocs.map((d: any) => d.documentLabel).join(', ');
        await notifyCandidate(db, pb.candidateEmail, `Reminder: please complete your preboarding details and upload pending documents${docList ? ` (${docList})` : ''} before your joining date.`);
        await sendEmailBestEffort(pb.candidateEmail, 'Preboarding Reminder — Action Required',
          `<p>Dear ${pb.candidateName},</p><p>Please complete your preboarding details and upload pending documents${docList ? `: <b>${docList}</b>` : ''} in the candidate portal before your joining date.</p>`);
        await audit(db, (decoded as any).userId, 'PREBOARDING_REMINDER_SENT', 'preboarding', `${preboardingId} ${pb.candidateName}: reminder sent by ${who}`);
        return NextResponse.json({ message: 'Reminder sent to candidate (in-app + email).' }, { headers: CORS });
      }

      case 'assign-hr': {
        const hrAssignedTo = String(body.hrAssignedTo || '').trim();
        if (!hrAssignedTo) return NextResponse.json({ error: 'hrAssignedTo is required' }, { status: 400, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "hrAssignedTo"=$1, "updatedAt"=NOW() WHERE "id"=$2`, hrAssignedTo, pb.id,
        );
        await audit(db, (decoded as any).userId, 'PREBOARDING_HR_ASSIGNED', 'preboarding', `${preboardingId} ${pb.candidateName}: assigned to ${hrAssignedTo}`);
        return NextResponse.json({ message: `Assigned to ${hrAssignedTo}.` }, { headers: CORS });
      }

      case 'return-for-correction': {
        const note = String(body.note || '').trim();
        if (!note) return NextResponse.json({ error: 'A correction note is required' }, { status: 400, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "correctionNote"=$1, "correctionSetAt"=NOW(), "portalSubmittedAt"=NULL, "declarationAcceptedAt"=NULL, "declarationName"=NULL, "updatedAt"=NOW() WHERE "id"=$2`,
          note, pb.id,
        );
        await notifyCandidate(db, pb.candidateEmail, `HR returned your preboarding details for correction: ${note} Please update and resubmit.`);
        await audit(db, (decoded as any).userId, 'PREBOARDING_RETURNED_FOR_CORRECTION', 'preboarding', `${preboardingId} ${pb.candidateName}: returned for correction — ${note}`);
        return NextResponse.json({ message: 'Returned for correction. Candidate portal reopened.' }, { headers: CORS });
      }

      default:
        return NextResponse.json({ error: `Unknown action '${action}'. Valid: update-joining-date, cancel, confirm-joining, send-reminder, assign-hr, return-for-correction` }, { status: 400, headers: CORS });
    }
  } catch (error) {
    console.error('[preboarding/brd/candidate] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
