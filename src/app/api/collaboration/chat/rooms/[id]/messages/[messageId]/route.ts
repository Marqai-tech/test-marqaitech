import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * DELETE /api/collaboration/chat/rooms/[id]/messages/[messageId]
 * SOFT-deletes a chat message (isDeleted=true, deletedAt=now) so the history
 * stays in the database — member feeds filter isDeleted:false, and the
 * Super Admin retention viewer (/api/super-admin/chat-archive, Task 121)
 * can still surface it. Only the sender may delete their own message;
 * tenant admins / super admins may delete any message in their tenant.
 *
 * (Task 121 — this route file was rebuilt: the original directory name got
 * mangled on the build sandbox's overlay filesystem and the route never
 * reached the LIVE deployment; the soft-delete contract is unchanged.)
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id, messageId } = await params;

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Membership gate (admins may moderate any room in their tenant).
    const membership = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId: employee.id } },
    });
    const isAdminRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(decoded.role);
    if (!membership && !isAdminRole) {
      return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
    }

    const message = await db.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.roomId !== id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (message.isDeleted) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    if (message.senderId !== employee.id && !isAdminRole) {
      return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
    }

    await db.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true, id: messageId });
  } catch (error) {
    console.error('DELETE chat message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/collaboration/chat/rooms/[id]/messages/[messageId]
 * Single-message fetch (used after a share/deep link). Soft-deleted messages
 * stay hidden from members.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id, messageId } = await params;

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const membership = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId: employee.id } },
    });
    if (!membership) return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });

    const message = await db.chatMessage.findFirst({
      where: { id: messageId, roomId: id, isDeleted: false },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
      },
    });
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    return NextResponse.json({ message });
  } catch (error) {
    console.error('GET chat message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
