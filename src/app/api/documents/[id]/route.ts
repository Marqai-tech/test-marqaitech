import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { validateDocumentDataUrl } from '@/lib/document-validation';
import { isSafeDocumentUrl } from '@/lib/sanitize';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.status !== undefined) data.status = body.status;
    if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    if (body.type !== undefined) data.type = body.type;
    if (body.fileUrl !== undefined) {
      // REQ 2: server-side PDF-only / 3MB / safe-URL validation on PATCH too.
      const fileUrl: string | null = body.fileUrl ? String(body.fileUrl) : null;
      if (fileUrl) {
        if (!isSafeDocumentUrl(fileUrl)) {
          return NextResponse.json({ error: 'File URL must be a safe http(s) link or a PDF data URL.' }, { status: 400, headers: corsHeaders() });
        }
        const payloadError = validateDocumentDataUrl(fileUrl);
        if (payloadError) {
          return NextResponse.json({ error: payloadError }, { status: 400, headers: corsHeaders() });
        }
      }
      data.fileUrl = fileUrl;
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category || 'other';

    const document = await db.document.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ document }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update document error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    await db.document.delete({ where: { id } });

    return NextResponse.json({ message: 'Document deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
