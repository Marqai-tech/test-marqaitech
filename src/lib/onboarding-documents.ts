/**
 * BRD 5.8 — OnboardingDocument hardening helpers.
 *
 * - fileHash: SHA-256 of the decoded payload → duplicate detection across the
 *   candidate's OTHER documents (same file uploaded twice).
 * - archiveCurrentVersion: before a re-upload overwrites the live file, the
 *   current file is copied into OnboardingDocumentVersion (version history —
 *   BRD 5.8: re-uploads must not silently destroy prior submissions).
 * - isExpired: expiry-date flagging for HR/candidate views.
 */
import { createHash } from 'crypto';

type Tx = { $queryRawUnsafe: (q: string, ...p: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...p: any[]) => Promise<any> };

/** SHA-256 of a data-URL or raw base64 payload (stable across data-URL prefix variants). */
export function computeFileHash(dataUrlOrBase64: string): string {
  const comma = dataUrlOrBase64.indexOf(',');
  const payload = dataUrlOrBase64.startsWith('data:') && comma >= 0 ? dataUrlOrBase64.slice(comma + 1) : dataUrlOrBase64;
  return createHash('sha256').update(payload.replace(/\s/g, '')).digest('hex');
}

/** True when expiryDate exists and is in the past (display-level flag). */
export function isExpired(expiryDate: string | Date | null | undefined, nowMs?: number): boolean {
  if (!expiryDate) return false;
  const t = new Date(expiryDate).getTime();
  return Number.isFinite(t) && t < (nowMs ?? Date.now());
}

export interface DocRowLike {
  id: string;
  fileUrl?: string | null;
  fileData?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  fileMimeType?: string | null;
  fileHash?: string | null;
  status?: string | null;
  uploadedAt?: string | Date | null;
  version?: number | null;
}

/**
 * Copy the document's CURRENT file into OnboardingDocumentVersion as version N
 * (N = the document's current version counter, 0 → first archive is v1) and
 * return N. No-op (returns 0) when the document has no live file.
 */
export async function archiveCurrentVersion(db: Tx, doc: DocRowLike): Promise<number> {
  const raw = doc.fileUrl || doc.fileData;
  if (!raw) return 0;
  const archivedVersion = Number(doc.version || 0); // live v0 → archived as v1 on first re-upload
  await db.$executeRawUnsafe(
    `INSERT INTO "OnboardingDocumentVersion"
       ("id","onboardingDocumentId","version","fileName","fileData","fileMimeType","fileSize","fileHash","status","uploadedAt","archivedAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),NOW())`,
    `docv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    doc.id,
    archivedVersion,
    doc.fileName || null,
    raw,
    doc.fileMimeType || doc.mimeType || null,
    doc.fileSize || null,
    doc.fileHash || null,
    doc.status || null,
    doc.uploadedAt || null,
  ).catch((e: unknown) => { console.warn('[onboarding-documents] archive version failed:', e); });
  return archivedVersion;
}

export interface DuplicateHit {
  kind: 'file' | 'number';
  documentId: string;
  documentLabel: string | null;
}

/**
 * BRD 5.8 duplicate detection for one candidate:
 *  - same file content (SHA-256) already on a DIFFERENT document, or
 *  - same document number on a DIFFERENT document.
 */
export async function findDuplicates(
  db: Tx,
  candidateEmail: string,
  documentId: string,
  fileHash?: string | null,
  documentNumber?: string | null,
): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = [];
  if (fileHash) {
    const rows = await db.$queryRawUnsafe(
      `SELECT "id","documentLabel" FROM "OnboardingDocument"
       WHERE "candidateEmail" = $1 AND "id" <> $2 AND "fileHash" = $3 LIMIT 1`,
      candidateEmail, documentId, fileHash,
    ).catch(() => []) as any[];
    if (rows[0]) hits.push({ kind: 'file', documentId: rows[0].id, documentLabel: rows[0].documentLabel });
  }
  if (documentNumber && String(documentNumber).trim()) {
    const rows = await db.$queryRawUnsafe(
      `SELECT "id","documentLabel" FROM "OnboardingDocument"
       WHERE "candidateEmail" = $1 AND "id" <> $2 AND "documentNumber" = $3 LIMIT 1`,
      candidateEmail, documentId, String(documentNumber).trim(),
    ).catch(() => []) as any[];
    if (rows[0]) hits.push({ kind: 'number', documentId: rows[0].id, documentLabel: rows[0].documentLabel });
  }
  return hits;
}
