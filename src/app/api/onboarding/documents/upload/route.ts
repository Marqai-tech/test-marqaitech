import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { computeFileHash, archiveCurrentVersion, findDuplicates } from '@/lib/onboarding-documents';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

const HR_ADMIN_ROLES = ['super_admin','tenant_admin','admin','hr_admin','company_hr_admin'];

/**
 * POST /api/onboarding/documents/upload — candidate uploads (or re-uploads) a document.
 *
 * BRD 5.8 hardening:
 *  - duplicate detection: the same file content (SHA-256) or the same document
 *    number already on ANOTHER of this candidate's documents → 409
 *  - version history: a re-upload archives the current file into
 *    OnboardingDocumentVersion first — prior submissions are never lost
 *  - metadata: documentNumber / issueDate / expiryDate stored with the file
 *  - approved documents stay locked (server-side)
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const userEmail = (decoded as any).email || '';
    const isAdmin = HR_ADMIN_ROLES.includes((decoded as any).role || '');

    const body = await req.json();
    const { documentId, fileDataUrl, fileName, fileSize, mimeType } = body || {};
    const documentNumber = typeof body?.documentNumber === 'string' ? body.documentNumber.trim() : '';
    const issueDate = body?.issueDate ? new Date(body.issueDate) : null;
    const expiryDate = body?.expiryDate ? new Date(body.expiryDate) : null;
    if (!documentId || !fileDataUrl) return NextResponse.json({ error: 'documentId and fileDataUrl required' }, { status: 400, headers: CORS });
    if (fileDataUrl.length > 14*1024*1024) return NextResponse.json({ error: 'File too large — max 10MB' }, { status: 400, headers: CORS });
    if (issueDate && Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: 'Invalid issue date' }, { status: 400, headers: CORS });
    if (expiryDate && Number.isNaN(expiryDate.getTime())) return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400, headers: CORS });
    if (issueDate && expiryDate && expiryDate < issueDate) return NextResponse.json({ error: 'Expiry date cannot be earlier than the issue date' }, { status: 400, headers: CORS });

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

    // 3. Duplicate detection (BRD 5.8) — same content or same doc number on
    //    ANOTHER of this candidate's documents.
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

    await db.$executeRawUnsafe(
      `UPDATE "OnboardingDocument"
       SET "fileUrl"=$1,"fileName"=$2,"fileSize"=$3,"mimeType"=$4,"fileHash"=$5,
           "documentNumber"=$6,"issueDate"=$7,"expiryDate"=$8,"version"=$9,
           "status"='submitted',"uploadedAt"=NOW(),"updatedAt"=NOW()
       WHERE "id"=$10`,
      fileDataUrl, fileName||null, fileSize||null, mimeType||null, fileHash,
      documentNumber || doc.documentNumber || null, issueDate || doc.issueDate || null, expiryDate || doc.expiryDate || null,
      newVersion, documentId,
    );

    // Notify HR + candidate (in-app). senderName/body are NOT NULL — omitting
    // them made this insert fail silently in earlier versions.
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
       VALUES ($1,$2,'HR System','system',$3,$3,NOW(),NOW())`,
      `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, doc.candidateEmail,
      `Document "${doc.documentLabel}" uploaded and submitted for review${newVersion > 1 ? ` (version ${newVersion})` : ''}.`,
    ).catch(() => 0);

    await db.auditLog.create({ data: { userId: (decoded as any).userId, action: 'ONBOARDING_DOCUMENT_UPLOADED', module: 'onboarding', details: `Document "${doc.documentLabel}" uploaded for ${doc.candidateEmail}${newVersion > 1 ? ` — version ${newVersion} (previous archived)` : ''}` } }).catch(() => null);

    return NextResponse.json({
      message: `Document uploaded. Status: Submitted${newVersion > 1 ? ` — version ${newVersion} (previous version preserved in history)` : ''}.`,
      documentId, status: 'submitted', version: newVersion, archivedVersion: archived || null,
    }, { headers: CORS });
  } catch (error) {
    console.error('Document upload error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', debug: errMsg }, { status: 500, headers: CORS });
  }
}

/**
 * PATCH /api/onboarding/documents/upload — candidate (or HR) updates document
 * metadata only (number / issue date / expiry date) without replacing the file.
 */
export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const userEmail = (decoded as any).email || '';
    const isAdmin = HR_ADMIN_ROLES.includes((decoded as any).role || '');

    const body = await req.json().catch(() => ({}));
    const documentId = String(body?.documentId || '');
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400, headers: CORS });
    const documentNumber = typeof body?.documentNumber === 'string' ? body.documentNumber.trim() : null;
    const issueDate = body?.issueDate ? new Date(body.issueDate) : null;
    const expiryDate = body?.expiryDate ? new Date(body.expiryDate) : null;
    if (issueDate && Number.isNaN(issueDate.getTime())) return NextResponse.json({ error: 'Invalid issue date' }, { status: 400, headers: CORS });
    if (expiryDate && Number.isNaN(expiryDate.getTime())) return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400, headers: CORS });

    const docs = await db.$queryRawUnsafe(`SELECT * FROM "OnboardingDocument" WHERE "id" = $1 LIMIT 1`, documentId).catch(() => []) as any[];
    if (!docs.length) return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: CORS });
    const doc = docs[0];
    if (!isAdmin && doc.candidateEmail !== userEmail) return NextResponse.json({ error: 'You do not own this document' }, { status: 403, headers: CORS });
    if (doc.status === 'approved' && !isAdmin) {
      return NextResponse.json({ error: 'This document has been approved by HR and is locked.', code: 'APPROVED_LOCKED' }, { status: 409, headers: CORS });
    }

    // Duplicate document-number check across this candidate's other documents.
    if (documentNumber) {
      const dupHits = await findDuplicates(db, doc.candidateEmail, documentId, null, documentNumber);
      if (dupHits.length) {
        return NextResponse.json({ error: `Duplicate document number: "${documentNumber}" is already used as "${dupHits[0].documentLabel}".`, code: 'DUPLICATE_DOCUMENT' }, { status: 409, headers: CORS });
      }
    }

    await db.$executeRawUnsafe(
      `UPDATE "OnboardingDocument" SET "documentNumber"=$1,"issueDate"=$2,"expiryDate"=$3,"updatedAt"=NOW() WHERE "id"=$4`,
      documentNumber ?? doc.documentNumber ?? null, issueDate || doc.issueDate || null, expiryDate || doc.expiryDate || null, documentId,
    ).catch(() => 0);

    return NextResponse.json({ message: 'Document details updated', documentId }, { headers: CORS });
  } catch (error) {
    console.error('Document metadata update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
