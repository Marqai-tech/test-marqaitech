import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** PATCH /api/onboarding/documents/[id]/review — HR approves/rejects document */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: documentId } = await params;
    const body = await req.json();
    const { action, notes } = body || {};
    if (!['approve','reject'].includes(action)) return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400, headers: CORS });

    const docs = await db.$queryRawUnsafe(`SELECT * FROM "OnboardingDocument" WHERE "id" = $1 LIMIT 1`, documentId).catch(() => []) as any[];
    if (docs.length === 0) return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: CORS });
    const doc = docs[0];
    if (doc.status !== 'submitted') return NextResponse.json({ error: `Document must be 'submitted'. Current: ${doc.status}` }, { status: 400, headers: CORS });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await db.$executeRawUnsafe(
      `UPDATE "OnboardingDocument" SET "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4`,
      newStatus, auth.userId, notes||null, documentId,
    );

    // Notify candidate
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`,
      `msg-${Date.now()}`, doc.candidateEmail,
      action === 'approve' ? `Your document "${doc.documentLabel}" has been approved.` : `Your document "${doc.documentLabel}" has been rejected. ${notes||'Please re-upload.'}`,
    ).catch(() => 0);

    await db.auditLog.create({ data: { userId: auth.userId, action: `DOCUMENT_${action.toUpperCase()}D`, module: 'onboarding', details: `${action==='approve'?'Approved':'Rejected'} document "${doc.documentLabel}" for ${doc.candidateEmail}` } }).catch(() => null);

    return NextResponse.json({ message: `Document ${newStatus}.`, documentId, status: newStatus }, { headers: CORS });
  } catch (error) {
    console.error('Document review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
