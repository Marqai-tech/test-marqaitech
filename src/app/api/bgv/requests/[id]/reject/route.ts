import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/bgv/requests/[id]/reject — HR rejects BGV */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json();
    const { reason } = body || {};
    if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400, headers: CORS });

    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    if (reqRows[0].status === 'rejected_by_hr') return NextResponse.json({ error: 'Already rejected' }, { status: 409, headers: CORS });

    await db.$executeRawUnsafe(`UPDATE "BgvReport" SET "hrDecision"='rejected',"hrDecisionById"=$1,"hrDecisionAt"=NOW(),"hrDecisionReason"=$2 WHERE "bgvRequestId"=$3 AND "status"='submitted'`, auth.userId, reason, requestId).catch(() => 0);
    await db.$executeRawUnsafe(`UPDATE "BgvRequest" SET "status"='rejected_by_hr',"updatedAt"=NOW() WHERE "id"=$1`, requestId);

    // If linked to PreboardingCandidate, update status (do NOT terminate or delete)
    if (reqRows[0].preboardingCandidateId) {
      await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "backgroundCheckStatus"='failed',"bgvNotes"=$1,"updatedAt"=NOW() WHERE "id"=$2`, reason, reqRows[0].preboardingCandidateId).catch(() => 0);
      // Notify candidate
      const pbRows = await db.$queryRawUnsafe(`SELECT "candidateEmail","candidateName" FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, reqRows[0].preboardingCandidateId).catch(() => []) as any[];
      if (pbRows.length > 0) {
        await db.$executeRawUnsafe(`INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`, `msg-${Date.now()}`, pbRows[0].candidateEmail, `Your background verification has not been cleared. Please contact HR for more information.`).catch(() => 0);
      }
    }

    await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_REJECTED', module: 'bgv', details: `Rejected BGV ${requestId}: ${reason}` } }).catch(() => null);
    return NextResponse.json({ message: 'BGV rejected.', status: 'rejected_by_hr' }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
