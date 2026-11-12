/**
 * /api/preboarding/brd/documents/[id]/file — streams the actual document bytes.
 *
 * WHY: candidate uploads are stored as base64 data-URLs inside the
 * OnboardingDocument row ("fileUrl" legacy column / "fileData" column).
 * Browsers BLOCK top-level navigation to `data:` URLs, so opening the raw
 * value in a new tab (previous behaviour) showed nothing. This endpoint
 * decodes the base64 and streams real bytes with the correct Content-Type so
 * <img>, <iframe> (PDF), mammoth (Word) and download buttons all work.
 *
 * GET  /api/preboarding/brd/documents/<id>/file                → inline view
 * GET  /api/preboarding/brd/documents/<id>/file?download=1     → attachment
 *
 * Auth: HR/Admin roles via Authorization header OR the same JWT passed as
 * `?token=` (needed because <img>/<iframe> cannot set headers). A candidate
 * token is also allowed for the candidate's OWN document (portal preview).
 */
import { NextResponse, NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { HR_ROLES } from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

function safeFileName(name: string | null | undefined, fallback: string): string {
  const cleaned = String(name || '').replace(/[\r\n"\\]/g, '').trim();
  return cleaned || fallback;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Document id required' }, { status: 400, headers: CORS });

    // ── Auth: header token OR ?token= query (img/iframe cannot send headers) ──
    const token = getTokenFromHeaders(req) || new URL(req.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS });

    // Normalize the Authorization header BEFORE tenant resolution: getDb()
    // reads the JWT from headers to pick the tenant database. When the token
    // arrives via ?token= (img/iframe), the header is absent and getDb would
    // otherwise fall back to the platform DB (no OnboardingDocument table → 404).
    const headers = new Headers(req.headers);
    if (!headers.get('authorization')) headers.set('authorization', `Bearer ${token}`);
    const db = await getDb(new NextRequest(req.url, { method: 'GET', headers }));

    const rows = await db.$queryRawUnsafe(
      `SELECT "id", "candidateEmail", "fileName", "fileUrl", "fileData", "mimeType", "fileMimeType", "fileSize"
       FROM "OnboardingDocument" WHERE "id" = $1 LIMIT 1`,
      id,
    ).catch(() => []) as any[];
    if (!rows.length) return NextResponse.json({ error: 'Document not found' }, { status: 404, headers: CORS });
    const doc = rows[0];

    const role = String((decoded as any).role || '');
    const isHR = HR_ROLES.includes(role);
    const isOwner = (decoded as any).kind === 'candidate' && String((decoded as any).email || '').toLowerCase() === String(doc.candidateEmail || '').toLowerCase();
    if (!isHR && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    // ── Resolve payload: data-URL ("data:<mime>;base64,<payload>") or raw base64 ──
    const raw = (doc.fileUrl || doc.fileData || '') as string;
    if (!raw) {
      return NextResponse.json({ error: 'No file has been uploaded for this document yet' }, { status: 404, headers: CORS });
    }

    let mime: string | null = null;
    let base64: string = raw;
    const dataUrlMatch = /^data:([^;,]+)?(;charset=[^;,]+)?;base64,(.*)$/s.exec(raw);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1] || null;
      base64 = dataUrlMatch[3];
    }
    if (!mime) mime = (doc.mimeType || doc.fileMimeType || null) as string | null;
    // Fallback: sniff from filename extension
    if (!mime || mime === 'application/octet-stream') {
      const ext = safeFileName(doc.fileName, '').split('.').pop()?.toLowerCase();
      const sniffed: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      if (ext && sniffed[ext]) mime = sniffed[ext];
    }
    if (!mime) mime = 'application/octet-stream';

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return NextResponse.json({ error: 'Stored file payload is empty or corrupted' }, { status: 422, headers: CORS });
    }

    const fileName = safeFileName(doc.fileName, 'document');
    const asDownload = new URL(req.url).searchParams.get('download') === '1';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': mime,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[preboarding/brd/documents/file] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
