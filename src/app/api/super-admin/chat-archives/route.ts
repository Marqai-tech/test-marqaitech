import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDbForTenantById } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/super-admin/chat-archives — Task 121 (safety measure)
 * Super-admin-only retention view over ALL chat history — including
 * soft-deleted messages and deactivated rooms. Nothing in chat is ever
 * hard-deleted by users: DELETE on a message only flags it
 * (isDeleted/deletedAt), so compliance keeps a complete record.
 *
 * Modes:
 *   (no params)            -> every room in the tenant: metadata + counts
 *                             (incl. deleted-message count, incl. inactive rooms)
 *   ?roomId=<id>           -> the room's FULL transcript with every message,
 *                             deleted ones flagged { deleted: true, deletedAt }
 *   ?tenantId=<id>         -> super-admin company switcher (golden rule,
 *                             Task 98-d): read from that tenant's DB instead
 * Access: super_admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded || decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const db = tenantId ? await getDbForTenantById(tenantId) : await getDb(request);

    const roomId = searchParams.get('roomId');
    if (roomId) {
      const room = await db.chatRoom.findFirst({
        where: { id: roomId },
        include: { members: { select: { userId: true, role: true, joinedAt: true } } },
      });
      if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

      const messages = await db.chatMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: 'asc' },
        take: 500,
        include: { sender: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });

      return NextResponse.json({
        room: {
          id: room.id,
          name: room.name,
          roomType: room.roomType,
          projectId: room.projectId,
          isActive: room.isActive,
          createdAt: room.createdAt,
          memberCount: room.members.length,
        },
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          attachments: m.attachments,
          createdAt: m.createdAt,
          deleted: m.isDeleted,
          deletedAt: m.deletedAt,
          sender: m.sender,
        })),
      });
    }

    const rooms = await db.chatRoom.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 300,
      include: { _count: { select: { messages: true, members: true } } },
    });

    // Deleted-message counts per room (single grouped query).
    const deletedGroups = await db.chatMessage.groupBy({
      by: ['roomId'],
      _count: { _all: true },
      where: { isDeleted: true },
    });
    const deletedByRoom = new Map(deletedGroups.map((g) => [g.roomId, g._count._all]));

    // Project names for project rooms (best-effort).
    const projectIds = Array.from(new Set(rooms.map((r) => r.projectId).filter(Boolean))) as string[];
    const projects = projectIds.length
      ? await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, code: true } })
      : [];
    const projectById = new Map(projects.map((p) => [p.id, p]));

    return NextResponse.json({
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        roomType: r.roomType,
        projectId: r.projectId,
        projectName: r.projectId ? projectById.get(r.projectId)?.name ?? null : null,
        isActive: r.isActive,
        lastMessageAt: r.lastMessageAt,
        createdAt: r.createdAt,
        messageCount: r._count.messages,
        deletedMessageCount: deletedByRoom.get(r.id) ?? 0,
        memberCount: r._count.members,
      })),
    });
  } catch (error) {
    console.error('GET chat archives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
