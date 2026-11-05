import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectAccess } from '@/lib/project-rbac';

/**
 * GET /api/projects/[id]/files — Task 121
 * Aggregated "Files" view for a project. ONE source of truth for files:
 * every project file is an attachment message inside the project's workspace
 * chat room (posted from the Projects module's upload button OR from the chat
 * itself), plus any project-drive FileNode entries from the Collaboration
 * Drive feature (metadata listing).
 *
 * Returns:
 *   files:      attachment messages from the workspace room (newest first) —
 *               [{ messageId, name, mimeType, sizeBytes, dataUrl, senderName,
 *                  senderId, createdAt, source: 'chat' }]
 *   driveFiles: FileNode project-drive rows (metadata only)
 *   roomId:     the workspace room id (null when the workspace was never created)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const access = await resolveProjectAccess(decoded, id, db);
    if (!access.canView) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, workspaceRoomId: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const roomId = project.workspaceRoomId || null;

    let files: Record<string, unknown>[] = [];
    if (roomId) {
      const messages = await db.chatMessage.findMany({
        where: { roomId, isDeleted: false, NOT: { attachments: null } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      for (const m of messages) {
        let parsed: unknown = null;
        try {
          parsed = m.attachments ? JSON.parse(m.attachments) : null;
        } catch {
          continue;
        }
        if (!Array.isArray(parsed)) continue;
        for (const a of parsed as Record<string, unknown>[]) {
          if (!a || typeof a !== 'object') continue;
          const name = typeof a.name === 'string' ? a.name : 'attachment';
          files.push({
            messageId: m.id,
            name,
            mimeType: (a.mimeType as string) || 'application/octet-stream',
            sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : 0,
            dataUrl: typeof a.dataUrl === 'string' ? a.dataUrl : null,
            senderId: m.senderId,
            senderName: m.sender ? `${m.sender.firstName ?? ''} ${m.sender.lastName ?? ''}`.trim() : 'Unknown',
            createdAt: m.createdAt,
            source: 'chat',
          });
        }
      }
    }

    // Project-drive FileNode entries (Collaboration Drive) — metadata only;
    // content bytes for these are managed by the Drive feature itself.
    let driveFiles: Record<string, unknown>[] = [];
    try {
      const nodes = await db.fileNode.findMany({
        where: { driveType: 'project', projectId: id, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      });
      driveFiles = nodes.map((n) => ({
        id: n.id,
        name: n.name,
        nodeType: n.nodeType,
        mimeType: n.mimeType,
        sizeBytes: n.sizeBytes,
        storagePath: n.storagePath,
        uploadedBy: n.uploadedBy ? `${n.uploadedBy.firstName ?? ''} ${n.uploadedBy.lastName ?? ''}`.trim() : null,
        createdAt: n.createdAt,
        source: 'drive',
      }));
    } catch {
      // Drive feature may be unavailable in some tenants — non-fatal.
    }

    return NextResponse.json({ projectId: id, roomId, files, driveFiles });
  } catch (error) {
    console.error('GET project files error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
