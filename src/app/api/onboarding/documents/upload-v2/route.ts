import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { computeFileHash, archiveCurrentVersion, findDuplicates } from '@/lib/onboarding-documents';

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
    const documentNumber = typeof body?.documentNumber === 'string' ? body.documentNumber.trim() : '';
    const issueDate = body?.issueDate ? new Date(body.issueDate) : null;
    const expiryDate = body?.expiryDate ? new Date(body.expiryDate) : null;
    if (!documentId || !fileDataUrl) return NextResponse.json({ error: 'documentId and fileDataUrl required' }, { status: 400, headers: CORS });
    if (fileDataUrl.length > 14*1024*1024) return NextResponse.json({ error: 'File too large — max 10MB' }, { status: 400, headers: CORS });
    if (issueDate && Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: 'Invalid issue date' }, { status: 400, headers: CORS });
    if (expiryDate && Number.isNaN(expiryDate.getTime())) return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400, headers: CORS });
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
    debugSteps.push('5b_rules_ok');

    // 3. Duplicate detection (BRD 5.8)
    const fileHash = computeFileHash(String(fileDataUrl));
    const dupHits = await findDuplicates(db, doc.candidateEmail, documentId, fileHash, documentNumber || null);
    if (dupHits.length) {
      const hit = dupHits[0];
      const where = hit.documentLabel ? ` as "${hit.documentLabel}"` : '';
      return NextResponse.json({
        error: hit.kind === 'file'
          ? `Duplicate file: this exact file is already uploaded${where}. Upload a different file.`
          : `Duplicate document number: "${documentNumber}" is already used${where}.`,
        code: 'DUPLICATE_DOCUMENT',
      }, { status: 409, headers: CORS });
    }

    // 4. Version history — archive the current file before overwriting.
    const archived = await archiveCurrentVersion(db, doc);
    const newVersion = Number(doc.version || 0) + 1;

    // Update document — using Prisma's tagged template approach (cleaner type handling)
    try {
      const result = await db.$executeRaw`
        UPDATE "OnboardingDocument"
        SET "fileUrl" = ${fileDataUrl},
            "fileName" = ${fileName || null},
            "fileSize" = ${fileSize ? Number(fileSize) : null},
            "mimeType" = ${mimeType || null},
            "fileHash" = ${fileHash},
            "documentNumber" = ${documentNumber || doc.documentNumber || null},
            "issueDate" = ${issueDate || doc.issueDate || null},
            "expiryDate" = ${expiryDate || doc.expiryDate || null},
            "version" = ${newVersion},
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

    // Notify HR (best-effort). senderName/body are NOT NULL in the DB —
    // omitting them made this insert fail silently, so candidates never saw it.
    try {
      await db.$executeRaw`
        INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
        VALUES (${'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)}, ${doc.candidateEmail}, 'HR System', 'system', ${'Document "' + doc.documentLabel + '" uploaded and submitted for review' + (newVersion > 1 ? ` (version ${newVersion})` : '') + '.'}, ${'Document "' + doc.documentLabel + '" uploaded and submitted for review' + (newVersion > 1 ? ` (version ${newVersion})` : '') + '.'}, NOW(), NOW())
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

    return NextResponse.json({ message: 'Document uploaded. Status: Submitted.', documentId, status: 'submitted', version: newVersion, archivedVersion: archived || null, debug: debugSteps }, { headers: CORS });
  } catch (error) {
    console.error('Document upload v2 error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', debug: errMsg, steps: debugSteps }, { status: 500, headers: CORS });
  }
}
