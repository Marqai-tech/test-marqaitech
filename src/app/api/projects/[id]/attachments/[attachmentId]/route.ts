import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/projects/[id]/attachments/[attachmentId] — Task 121
 * Serves the file's base64 payload as a binary download. Any authenticated
 * tenant employee may download (mirrors the list endpoint's tenant-internal
 * visibility); the heavy dataUrl is only fetched on this dedicated route so
 * list responses stay light.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id, attachmentId } = await params;
    const att = await db.projectAttachment.findFirst({
      where: { id: attachmentId, projectId: id, isActive: true },
    });
    if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    const comma = att.dataUrl.indexOf(',');
    const meta = att.dataUrl.slice(5, comma); // "<mime>;base64"
    const b64 = att.dataUrl.slice(comma + 1);
    const mime = (meta.split(';')[0] || att.mimeType || 'application/octet-stream').trim();
    const bytes = Buffer.from(b64, 'base64');

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': mime.startsWith('application/') || mime.startsWith('image/') || mime.startsWith('text/') ? mime : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${(att.fileName || 'file').replace(/"/g, '')}"`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('GET project attachment download error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]/attachments/[attachmentId] — Task 121
 * Soft-deletes a project attachment (isActive=false) — history is retained
 * for safety/audit, matching the chat retention policy. Access: the
 * uploader, or an admin role.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id, attachmentId } = await params;
    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const att = await db.projectAttachment.findFirst({ where: { id: attachmentId, projectId: id } });
    if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    const isAdminRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(decoded.role);
    if (att.uploadedById !== employee.id && !isAdminRole) {
      return NextResponse.json({ error: 'Only the uploader or an admin can delete this file' }, { status: 403 });
    }

    await db.projectAttachment.update({ where: { id: attachmentId }, data: { isActive: false } });
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId,
          action: 'PROJECT_ATTACHMENT_DELETE',
          module: 'projects',
          details: `Soft-deleted attachment "${att.fileName}" from project ${id}`,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, id: attachmentId, deleted: true });
  } catch (error) {
    console.error('DELETE project attachment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
