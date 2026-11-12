import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/onboarding/documents/upload — candidate uploads a document */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isCandidate = (decoded as any).kind === 'candidate';
    const userEmail = (decoded as any).email || '';
    const isAdmin = ['super_admin','tenant_admin','admin','hr_admin','company_hr_admin'].includes((decoded as any).role || '');

    const body = await req.json();
    const { documentId, fileDataUrl, fileName, fileSize, mimeType } = body || {};
    if (!documentId || !fileDataUrl) return NextResponse.json({ error: 'documentId and fileDataUrl required' }, { status: 400, headers: CORS });
    if (fileDataUrl.length > 14*1024*1024) return NextResponse.json({ error: 'File too large — max 10MB' }, { status: 400, headers: CORS });

    const docs = await db.$queryRawUnsafe(`SELECT * FROM "OnboardingDocument" WHERE "id" = $1 LIMIT 1`, documentId).catch(() => []) as any[];
    if (docs.length === 0) return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: CORS });
    const doc = docs[0];
    if (!isAdmin && doc.candidateEmail !== userEmail) return NextResponse.json({ error: 'You do not own this document' }, { status: 403, headers: CORS });

    // ── BRD 5.8 upload rules ──
    // 1. Approved documents are locked against unauthorized changes (server-side)
    if (doc.status === 'approved' && !isAdmin) {
      return NextResponse.json({ error: 'This document has been approved by HR and is locked. Please contact HR if it needs to change.', code: 'APPROVED_LOCKED' }, { status: 409, headers: CORS });
    }
    // 2. File type whitelist — PDF/JPG/JPEG/PNG only (BRD 5.8.C)
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
    if (mimeType && !ALLOWED_MIME.includes(String(mimeType))) {
      return NextResponse.json({ error: 'Only PDF, JPG or PNG files are allowed' }, { status: 400, headers: CORS });
    }

    await db.$executeRawUnsafe(
      `UPDATE "OnboardingDocument" SET "fileUrl"=$1,"fileName"=$2,"fileSize"=$3,"mimeType"=$4,"status"='submitted',"uploadedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$5`,
      fileDataUrl, fileName||null, fileSize||null, mimeType||null, documentId,
    );

    // Notify HR
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`,
      `msg-${Date.now()}`, doc.candidateEmail, `Document "${doc.documentLabel}" uploaded and submitted for review.`,
    ).catch(() => 0);

    await db.auditLog.create({ data: { userId: (decoded as any).userId, action: 'ONBOARDING_DOCUMENT_UPLOADED', module: 'onboarding', details: `Document "${doc.documentLabel}" uploaded for ${doc.candidateEmail}` } }).catch(() => null);

    return NextResponse.json({ message: 'Document uploaded. Status: Submitted.', documentId, status: 'submitted' }, { headers: CORS });
  } catch (error) {
    console.error('Document upload error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', debug: errMsg }, { status: 500, headers: CORS });
  }
}
