/**
 * /api/preboarding/brd/documents — BRD 5.8 Document Management & 5.9 Verification.
 *
 * GET   ?candidateId=<id>   documents of one candidate (with fileUrl)
 *       ?status=<status>    across candidates: pending|submitted|approved|rejected|resubmission
 *       ?tab=pending|approved|rejected|awaiting_resubmission|all   (BRD 5.9 tabs)
 *       Returns documents joined with candidate meta (name, email, preboardingId, jobTitle).
 *
 * PATCH { documentId, action: 'approve'|'reject'|'request_resubmission', remarks }
 *       BRD 5.8 F: rejection remarks are MANDATORY; approved docs are locked;
 *       request_resubmission → status 'resubmission_requested' (candidate re-upload allowed).
 *       Every action writes audit history + candidate portal message.
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { HR_ROLES, notifyCandidate, audit, ensurePreboardingId } from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
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

    const sp = new URL(req.url).searchParams;
    const candidateId = sp.get('candidateId');
    const tab = sp.get('tab') || sp.get('status') || 'all';

    let where = '';
    const params: any[] = [];
    if (candidateId) { where = `WHERE d."preboardingCandidateId" = $1`; params.push(candidateId); }

    const rows = await db.$queryRawUnsafe(
      `SELECT d.*, pbc."candidateName", pbc."candidateEmail", pbc."preboardingId", pbc."jobTitle"
       FROM "OnboardingDocument" d
       LEFT JOIN "PreboardingCandidate" pbc ON pbc."id" = d."preboardingCandidateId"
       ${where}
       ORDER BY d."updatedAt" DESC
       LIMIT 500`,
      ...params,
    ).catch(() => []) as any[];

    let documents = rows;
    switch (tab) {
      case 'pending': documents = rows.filter((d: any) => d.status === 'pending'); break;
      case 'submitted': documents = rows.filter((d: any) => d.status === 'submitted'); break;
      case 'approved': documents = rows.filter((d: any) => d.status === 'approved'); break;
      case 'rejected': documents = rows.filter((d: any) => d.status === 'rejected'); break;
      case 'awaiting_resubmission': documents = rows.filter((d: any) => d.status === 'resubmission_requested' || d.status === 'rejected'); break;
      default: break;
    }

    const counts = {
      all: rows.length,
      pending: rows.filter((d: any) => d.status === 'pending').length,
      submitted: rows.filter((d: any) => d.status === 'submitted').length,
      approved: rows.filter((d: any) => d.status === 'approved').length,
      rejected: rows.filter((d: any) => d.status === 'rejected').length,
      awaiting_resubmission: rows.filter((d: any) => d.status === 'resubmission_requested' || d.status === 'rejected').length,
    };

    return NextResponse.json({ documents, counts }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/documents] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = String(body.documentId || '');
    const action = String(body.action || '');
    const remarks = String(body.remarks || body.notes || '').trim();
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400, headers: CORS });
    if (!['approve', 'reject', 'request_resubmission'].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' | 'reject' | 'request_resubmission'" }, { status: 400, headers: CORS });
    }

    const docs = await db.$queryRawUnsafe(`SELECT * FROM "OnboardingDocument" WHERE "id"=$1 LIMIT 1`, documentId).catch(() => []) as any[];
    if (!docs.length) return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: CORS });
    const doc = docs[0];

    // BRD 5.8 F validations
    if (action === 'reject' && !remarks) {
      return NextResponse.json({ error: 'Rejection remarks are mandatory (BRD 5.8 F)' }, { status: 400, headers: CORS });
    }
    if (action === 'approve' && !doc.fileUrl) {
      return NextResponse.json({ error: 'Cannot approve an empty/unreadable document (BRD 5.8 F)' }, { status: 400, headers: CORS });
    }
    if (action === 'approve' && doc.status === 'approved') {
      return NextResponse.json({ error: 'Document already approved — approved documents are locked' }, { status: 409, headers: CORS });
    }
    if (action === 'request_resubmission' && !remarks) {
      return NextResponse.json({ error: 'Please describe what the candidate must correct' }, { status: 400, headers: CORS });
    }

    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'resubmission_requested';
    await db.$executeRawUnsafe(
      `UPDATE "OnboardingDocument" SET "status"=$1, "reviewedById"=$2, "reviewedAt"=NOW(), "reviewNotes"=$3, "updatedAt"=NOW() WHERE "id"=$4`,
      newStatus, (decoded as any).userId || null, remarks || null, documentId,
    );

    // Candidate portal message (in-app) + best-effort email
    const label = doc.documentLabel || doc.documentType;
    const msg = action === 'approve'
      ? `Your document "${label}" has been approved.`
      : action === 'reject'
        ? `Your document "${label}" was rejected. Reason: ${remarks} Please re-upload a corrected copy.`
        : `Correction required for "${label}": ${remarks} Please re-upload.`;
    await notifyCandidate(db, doc.candidateEmail, msg);
    await import('@/lib/email').then(({ sendEmail }) => sendEmail({
      to: doc.candidateEmail,
      subject: action === 'approve' ? `Document approved: ${label}` : `Action required: ${label}`,
      html: `<p>Dear candidate,</p><p>${msg}</p>`,
    }).catch(() => null)).catch(() => null);

    // Ensure the parent has a preboardingId for the audit trail
    const pbRows = await db.$queryRawUnsafe(`SELECT id, "preboardingId", "candidateName" FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, doc.preboardingCandidateId).catch(() => []) as any[];
    let preboardingId = pbRows[0]?.preboardingId;
    if (!preboardingId && pbRows[0]) preboardingId = await ensurePreboardingId(db, pbRows[0]);

    await audit(db, (decoded as any).userId, `DOCUMENT_${newStatus.toUpperCase()}`, 'preboarding',
      `${preboardingId || doc.preboardingCandidateId} ${doc.candidateEmail}: "${label}" → ${newStatus}${remarks ? ` (${remarks})` : ''}`);

    return NextResponse.json({ message: `Document ${newStatus.replace(/_/g, ' ')}.`, documentId, status: newStatus }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/documents] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
