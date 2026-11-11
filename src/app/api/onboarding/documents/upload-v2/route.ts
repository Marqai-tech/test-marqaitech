import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/onboarding/documents/upload-v2 — candidate uploads a document (v2 with better error handling) */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  const debugSteps: string[] = [];
  try {
    debugSteps.push('1_start');
    const token = getTokenFromHeaders(req as unknown as Request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    debugSteps.push('2_auth_ok');

    const body = await req.json();
    const { documentId, fileDataUrl, fileName, fileSize, mimeType } = body || {};
    if (!documentId || !fileDataUrl) return NextResponse.json({ error: 'documentId and fileDataUrl required' }, { status: 400, headers: CORS });
    if (fileDataUrl.length > 14*1024*1024) return NextResponse.json({ error: 'File too large — max 10MB' }, { status: 400, headers: CORS });
    debugSteps.push('3_body_ok');

    const docs = await db.$queryRawUnsafe(`SELECT * FROM "OnboardingDocument" WHERE "id" = $1 LIMIT 1`, documentId).catch((e:any) => { debugSteps.push('3a_select_err:'+e.message); return []; }) as any[];
    if (docs.length === 0) return NextResponse.json({ error: 'Document not found', debug: debugSteps }, { status: 404, headers: CORS });
    const doc = docs[0];
    debugSteps.push('4_doc_found');

    const isAdmin = ['super_admin','tenant_admin','admin','hr_admin','company_hr_admin'].includes((decoded as any).role || '');
    const userEmail = (decoded as any).email || '';
    if (!isAdmin && doc.candidateEmail !== userEmail) {
      return NextResponse.json({ error: 'You do not own this document', debug: debugSteps, expected: userEmail, actual: doc.candidateEmail }, { status: 403, headers: CORS });
    }
    debugSteps.push('5_owner_ok');

    // Update document — using Prisma's tagged template approach (cleaner type handling)
    try {
      const result = await db.$executeRaw`
        UPDATE "OnboardingDocument"
        SET "fileUrl" = ${fileDataUrl},
            "fileName" = ${fileName || null},
            "fileSize" = ${fileSize ? Number(fileSize) : null},
            "mimeType" = ${mimeType || null},
            "status" = 'submitted',
            "uploadedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "id" = ${documentId}
      `;
      debugSteps.push(`6_update_ok (${result} rows)`);
    } catch (updateErr: any) {
      debugSteps.push('6_update_err: ' + updateErr.message);
      throw new Error('UPDATE failed: ' + updateErr.message);
    }

    // Notify HR (best-effort)
    try {
      await db.$executeRaw`
        INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt")
        VALUES (${'msg-' + Date.now()}, ${doc.candidateEmail}, 'system', ${'Document "' + doc.documentLabel + '" uploaded and submitted for review.'}, NOW(), NOW())
      `;
      debugSteps.push('7_msg_ok');
    } catch (msgErr: any) {
      debugSteps.push('7_msg_err: ' + msgErr.message);
    }

    // Audit log (best-effort)
    try {
      const userId = (decoded as any).userId || null;
      await db.$executeRaw`
        INSERT INTO "AuditLog" ("id","userId","action","module","details","createdAt")
        VALUES (${'log-' + Date.now()}, ${userId}, 'ONBOARDING_DOCUMENT_UPLOADED', 'onboarding', ${'Document "' + doc.documentLabel + '" uploaded for ' + doc.candidateEmail}, NOW())
      `;
      debugSteps.push('8_audit_ok');
    } catch (auditErr: any) {
      debugSteps.push('8_audit_err: ' + auditErr.message);
    }

    return NextResponse.json({ message: 'Document uploaded. Status: Submitted.', documentId, status: 'submitted', debug: debugSteps }, { headers: CORS });
  } catch (error) {
    console.error('Document upload v2 error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', debug: errMsg, steps: debugSteps }, { status: 500, headers: CORS });
  }
}
