import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getChatContext } from '@/lib/chat-permissions';

/**
 * PATCH /api/collaboration/chat/rooms/[id] — Task 122 (edit chat)
 * Body: { name?, description? }
 * Renames / re-describes a chat. Group-ish rooms: chat managers only
 * (HR/tenant admins by default, plus the custom manager list when enabled).
 * Direct rooms cannot be renamed (they have no name).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const description = typeof body?.description === 'string' ? body.description.trim() : undefined;
    if (name !== undefined && name.length === 0) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const room = await db.chatRoom.findFirst({ where: { id, isActive: true } });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.roomType === 'direct') {
      return NextResponse.json({ error: 'Direct chats cannot be renamed' }, { status: 400 });
    }

    const ctx = await getChatContext(request, db, platformDb, decoded, employee.id);
    if (!ctx.permissions.canEditGroup) {
      return NextResponse.json(
        { error: 'Only HR/tenant admins (or selected chat managers) can edit chats' },
        { status: 403 },
      );
    }

    const updated = await db.chatRoom.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });

    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId,
          action: 'CHAT_ROOM_EDIT',
          module: 'collaboration',
          details: `Edited chat room ${id} (${updated.name ?? room.name ?? 'unnamed'})`,
        },
      });
    } catch {}

    return NextResponse.json({
      room: { id: updated.id, name: updated.name, description: updated.description, roomType: updated.roomType },
    });
  } catch (error) {
    console.error('PATCH chat room error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/collaboration/chat/rooms/[id] — Task 122 (delete chat)
 *
 * SAFETY MODEL (soft delete — history is retained for Super Admin
 * eDiscovery, Task 121):
 *  - GROUP / project / team / announcement rooms: chat managers only.
 *    The room flips isActive=false and gets deletedAt/deletedBy stamps; ALL
 *    messages remain in the database and the room surfaces in the Super
 *    Admin chat-archive ("Deleted Chat History") sweep.
 *  - DIRECT rooms: any participant may delete THEIR copy while
 *    `directDeleteEnabled` is on (default) — the room is hidden from that
 *    member's list only (isHidden); the other participant keeps it. A new
 *    message in the room clears the hidden flag so replies resurface.
 *    Chat admins can always delete their copy regardless of the toggle.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const room = await db.chatRoom.findFirst({ where: { id } });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const ctx = await getChatContext(request, db, platformDb, decoded, employee.id);

    if (room.roomType === 'direct') {
      // ── Direct chat: hide for the CALLER only ──────────────────────────
      const membership = await db.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: id, userId: employee.id } },
      });
      if (!membership) return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
      if (!ctx.permissions.canDeleteDirect) {
        return NextResponse.json(
          { error: 'Deleting direct chats is disabled by your admin in chat settings' },
          { status: 403 },
        );
      }
      await db.chatRoomMember.update({
        where: { roomId_userId: { roomId: id, userId: employee.id } },
        data: { isHidden: true, hiddenAt: new Date() },
      });
      try {
        await db.auditLog.create({
          data: {
            userId: decoded.userId,
            action: 'CHAT_DIRECT_HIDE',
            module: 'collaboration',
            details: `Employee ${employee.id} deleted (hid) their direct chat ${id}`,
          },
        });
      } catch {}
      return NextResponse.json({ deleted: true, scope: 'self' });
    }

    // ── Group-ish rooms: soft-delete for EVERYONE (managers only) ─────────
    if (!ctx.permissions.canDeleteGroup) {
      return NextResponse.json(
        { error: 'Only HR/tenant admins (or selected chat managers) can delete group chats' },
        { status: 403 },
      );
    }
    if (room.isActive) {
      await db.chatRoom.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), deletedBy: employee.id },
      });
      try {
        await db.auditLog.create({
          data: {
            userId: decoded.userId,
            action: 'CHAT_ROOM_DELETE',
            module: 'collaboration',
            details: `Deleted chat room ${id} (${room.name ?? 'unnamed'}) — history retained for audit`,
          },
        });
      } catch {}
    }
    return NextResponse.json({ deleted: true, scope: 'everyone' });
  } catch (error) {
    console.error('DELETE chat room error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
