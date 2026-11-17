import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * PATCH /api/onboarding/portal-details
 *   body: { preboardingCandidateId, action: 'return_for_correction' | 'acknowledge', note?: string }
 *
 * HR-side actions on a candidate's submitted preboarding portal details
 * (BRD 5.9 Verification & Approval — Return for Correction):
 *  - return_for_correction : clears portalSubmittedAt, sets correctionNote →
 *                            the candidate's wizard reopens for editing with the note shown
 *  - acknowledge            : clears an outstanding correctionNote (HR reviewed)
 */
export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || !HR_ROLES.includes(String((decoded as any).role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }
    const hrUserId = (decoded as any).userId as string;

    const body = await req.json().catch(() => ({}));
    const { preboardingCandidateId, action } = body || {};
    if (!preboardingCandidateId) return NextResponse.json({ error: 'preboardingCandidateId required' }, { status: 400, headers: CORS });

    const rows = await db.$queryRawUnsafe(
      `SELECT id, "candidateEmail", "candidateName", "portalSubmittedAt", "correctionNote" FROM "PreboardingCandidate" WHERE id = $1 LIMIT 1`,
      String(preboardingCandidateId),
    ).catch(() => []) as any[];
    if (rows.length === 0) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const pb = rows[0];

    if (action === 'return_for_correction') {
      const note = String(body.note || '').trim();
      if (!note) return NextResponse.json({ error: 'A correction note is required (what should the candidate fix?).' }, { status: 400, headers: CORS });
      if (!pb.portalSubmittedAt) {
        return NextResponse.json({ error: 'Candidate has not submitted their details yet — nothing to return.' }, { status: 409, headers: CORS });
      }
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate"
         SET "portalSubmittedAt" = NULL, "correctionNote" = $1, "correctionSetAt" = NOW(), "updatedAt" = NOW()
         WHERE "id" = $2`,
        note, pb.id,
      );
      // Notify the candidate in their portal messages
      await db.$executeRawUnsafe(
        `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
         VALUES ($1,$2,'HR Team','hr',$3,$3,NOW(),NOW())`,
        `msg-correction-${Date.now()}`, pb.candidateEmail,
        `HR has returned your preboarding details for correction: ${note} Please review and update the highlighted sections, then re-submit.`,
      ).catch(() => 0);

      await db.auditLog.create({
        data: { userId: hrUserId, action: 'PREBOARDING_DETAILS_RETURNED', module: 'onboarding', details: `Returned details of ${pb.candidateEmail} for correction: ${note}` },
      }).catch(() => null);

      return NextResponse.json({ message: 'Details returned to candidate for correction', note }, { headers: CORS });
    }

    if (action === 'acknowledge') {
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET "correctionNote" = NULL, "updatedAt" = NOW() WHERE "id" = $1`, pb.id,
      );
      return NextResponse.json({ message: 'Correction acknowledged' }, { headers: CORS });
    }

    return NextResponse.json({ error: "action must be 'return_for_correction' or 'acknowledge'" }, { status: 400, headers: CORS });
  } catch (error) {
    console.error('[onboarding/portal-details] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
