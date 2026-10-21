import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectAccess } from '@/lib/project-rbac';
import { createProjectWorkspace } from '@/lib/project-events';

/**
 * GET /api/projects/[id]/workspace
 * Returns the project's collaboration workspace links (chat room + board)
 * WITHOUT creating anything. { roomId, boardId } — null when not created yet.
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
      select: { id: true, name: true, workspaceRoomId: true, workspaceBoardId: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({
      projectId: project.id,
      projectName: project.name,
      roomId: project.workspaceRoomId || null,
      boardId: project.workspaceBoardId || null,
    });
  } catch (error) {
    console.error('GET project workspace error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/workspace — Task 121
 * IDEMPOTENT: ensures the project workspace exists (chat room + delivery
 * board via createProjectWorkspace) for ANY project — not only intake-approved
 * ones — so every project can have its conversation + files from the moment a
 * member needs them. Returns { roomId, boardId } (existing or newly created).
 * Members of the room are the project's members (createProjectWorkspace).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      select: {
        id: true, name: true, companyId: true, methodology: true,
        projectManagerId: true, deliveryManagerId: true,
        workspaceRoomId: true, workspaceBoardId: true,
      },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Resolve the caller's employee id (room creator + first member).
    const me = await db.employee.findFirst({
      where: { userId: decoded.userId },
      select: { id: true },
    });

    const result = await createProjectWorkspace(db, project, me?.id || null);

    // Make sure the CALLER is a room member (createProjectWorkspace adds
    // project members; global admins / managers opening from the Projects
    // module may not be listed there).
    let joinedNow = false;
    if (result.roomId && me) {
      const existing = await db.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: result.roomId, userId: me.id } },
      }).catch(() => null);
      if (!existing) {
        await db.chatRoomMember.create({
          data: { roomId: result.roomId, userId: me.id, role: 'member' },
        }).catch(() => null);
        joinedNow = true;
      }
    }

    return NextResponse.json({
      projectId: project.id,
      roomId: result.roomId,
      boardId: result.boardId,
      createdNow: !project.workspaceRoomId && !!result.roomId,
      joinedNow,
    });
  } catch (error) {
    console.error('POST project workspace error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
