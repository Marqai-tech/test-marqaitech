import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/onboarding/mark-joined — mark candidate as Provisional Employee */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { preboardingCandidateId } = body || {};
    if (!preboardingCandidateId) return NextResponse.json({ error: 'preboardingCandidateId required' }, { status: 400, headers: CORS });

    const rows = await db.$queryRawUnsafe(
      `SELECT id, "candidateName", "candidateEmail", "onboardingStatus" FROM "PreboardingCandidate" WHERE "id" = $1 LIMIT 1`, preboardingCandidateId,
    ).catch(() => []) as any[];
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    const pb = rows[0];
    if (pb.onboardingStatus === 'active_employee') return NextResponse.json({ error: 'Already activated' }, { status: 409, headers: CORS });
    if (pb.onboardingStatus === 'bgv_failed') return NextResponse.json({ error: 'BGV failed' }, { status: 400, headers: CORS });

    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "onboardingStatus"='provisional_employee',"status"='joined',"updatedAt"=NOW() WHERE "id"=$1`, preboardingCandidateId,
    );

    // Notify candidate
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`,
      `msg-${Date.now()}`, pb.candidateEmail,
      `You have been marked as "Joined". You now have provisional access to view attendance and apply for leave. Full access after BGV approval.`,
    ).catch(() => 0);

    await db.auditLog.create({ data: { userId: auth.userId, action: 'CANDIDATE_MARKED_JOINED_PROVISIONAL', module: 'onboarding', details: `Marked ${pb.candidateName} as Joined (Provisional)` } }).catch(() => null);

    return NextResponse.json({ message: 'Marked as Joined. Provisional access activated.', onboardingStatus: 'provisional_employee' }, { headers: CORS });
  } catch (error) {
    console.error('Mark-joined error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
