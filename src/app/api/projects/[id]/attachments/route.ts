import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB binary (~4 MB base64) — Vercel body limit is ~4.5 MB

/**
 * GET /api/projects/[id]/attachments — Task 121
 * Lists the project's file attachments (newest first). Access: any
 * authenticated employee of the tenant (project files are tenant-internal);
 * the UI only surfaces the tab to project members.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const attachments = await db.projectAttachment.findMany({
      where: { projectId: id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        category: true,
        uploadedById: true,
        createdAt: true,
      },
    });

    // Attach lightweight uploader names (plain scalar join — no FK relation).
    const uploaderIds = Array.from(new Set(attachments.map((a) => a.uploadedById).filter(Boolean))) as string[];
    const uploaders = uploaderIds.length
      ? await db.employee.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameById = new Map(uploaders.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));

    return NextResponse.json({
      attachments: attachments.map((a) => ({
        ...a,
        uploaderName: a.uploadedById ? nameById.get(a.uploadedById) || null : null,
      })),
    });
  } catch (error) {
    console.error('GET project attachments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/attachments — Task 121
 * Uploads a file to the project. Body (JSON):
 *   { fileName, mimeType, size, dataUrl }
 *   dataUrl: "data:<mime>;base64,<payload>" — stored in the tenant DB
 *   (same storage pattern as employee avatars; Vercel has no writable fs).
 * Access: project team (allocations/managers/creator) or admin role.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, companyId: true, projectManagerId: true, deliveryManagerId: true, createdBy: true, allocations: { select: { employeeId: true } } },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const isAdminRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(decoded.role);
    const teamIds = new Set<string>(project.allocations.map((a) => a.employeeId));
    if (project.projectManagerId) teamIds.add(project.projectManagerId);
    if (project.deliveryManagerId) teamIds.add(project.deliveryManagerId);
    const isOnTeam = teamIds.has(employee.id) || project.createdBy === employee.id;
    if (!isOnTeam && !isAdminRole) {
      return NextResponse.json({ error: 'Only project members can upload files' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body?.fileName ?? '').trim();
    const mimeType = String(body?.mimeType ?? 'application/octet-stream').trim();
    const size = Number(body?.size ?? 0);
    const dataUrl = String(body?.dataUrl ?? '');
    const category = String(body?.category ?? 'document').trim() || 'document';

    if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    if (!dataUrl.startsWith('data:')) return NextResponse.json({ error: 'dataUrl must be a base64 data URL' }, { status: 400 });
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (!b64) return NextResponse.json({ error: 'dataUrl payload is empty' }, { status: 400 });
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File too large — max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB per file` }, { status: 413 });
    }

    const created = await db.projectAttachment.create({
      data: {
        projectId: id,
        fileName: fileName.slice(0, 255),
        mimeType: mimeType.slice(0, 120) || 'application/octet-stream',
        fileSize: Number.isFinite(size) && size > 0 ? Math.floor(size) : approxBytes,
        category: category.slice(0, 60),
        dataUrl,
        uploadedById: employee.id,
      },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, category: true, createdAt: true },
    });

    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId,
          action: 'PROJECT_ATTACHMENT_UPLOAD',
          module: 'projects',
          details: `Uploaded "${created.fileName}" (${created.fileSize} bytes) to project ${id}`,
        },
      });
    } catch {}

    return NextResponse.json({ attachment: { ...created, uploaderName: `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() } }, { status: 201 });
  } catch (error) {
    console.error('POST project attachments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
