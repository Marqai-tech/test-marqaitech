import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getChatContext } from '@/lib/chat-permissions';

/**
 * GET /api/collaboration/chat/rooms/[id]/members
 * Returns the room's members with basic employee identity (name, avatar,
 * email, status). Requester must be a room member (admins may inspect any
 * room in their tenant).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const roomExists = await db.chatRoom.findFirst({ where: { id, isActive: true }, select: { id: true } });
    if (!roomExists) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const membership = await db.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId: employee.id } },
    });
    if (!membership && !['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
    }

    const members = await db.chatRoomMember.findMany({
      where: { roomId: id },
      orderBy: { joinedAt: 'asc' },
    });

    const employeeIds = members.map((m) => m.userId);
    const employees = await db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true, status: true },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    return NextResponse.json({
      members: members.map((m) => {
        const e = byId.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          lastReadAt: m.lastReadAt,
          firstName: e?.firstName ?? null,
          lastName: e?.lastName ?? null,
          email: e?.email ?? null,
          avatar: e?.avatar ?? null,
          status: e?.status ?? null,
        };
      }),
    });
  } catch (error) {
    console.error('GET chat room members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/collaboration/chat/rooms/[id]/members
 * Body: { memberIds: string[] }
 *
 * Task 120 — add people to an EXISTING chat (the create-time member picker
 * was the only way to populate a room before). Rules:
 *  - The room must be a group/project/team/announcement room — direct 1:1
 *    rooms stay 1:1 (create a group instead).
 *  - The requester must hold CHAT-MANAGER rights (Task 122: HR/tenant admins
 *    by default, plus the custom manager list when enabled — populating a
 *    chat is an "edit" right, no longer open to every room member).
 *  - Only CURRENT employees can be added: separated staff (terminated /
 *    resigned / inactive) are rejected so the Chat module never surfaces
 *    them (same rule the directory and pickers enforce via ?excludeInactive).
 *  - Already-member ids are skipped (idempotent, no duplicate rows — the
 *    schema's @@unique([roomId, userId]) would reject them anyway).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const memberIds: unknown = body?.memberIds;
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'memberIds is required (at least one employee id)' }, { status: 400 });
    }
    if (memberIds.length > 100) {
      return NextResponse.json({ error: 'Too many memberIds (max 100 per request)' }, { status: 400 });
    }

    const requester = await db.employee.findFirst({ where: { userId: decoded.userId } });
    if (!requester) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const room = await db.chatRoom.findFirst({ where: { id, isActive: true } });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.roomType === 'direct') {
      return NextResponse.json(
        { error: 'Direct chats cannot accept new members — create a group chat instead' },
        { status: 400 },
      );
    }

    // Task 122 — populating a chat is an EDIT right: chat managers only
    // (HR/tenant admins by default, plus the custom manager list).
    const ctx = await getChatContext(request, db, platformDb, decoded, requester.id);
    if (!ctx.permissions.canEditGroup) {
      return NextResponse.json(
        { error: 'Only HR/tenant admins (or selected chat managers) can add people to chats' },
        { status: 403 },
      );
    }

    const uniqueIds = Array.from(new Set(memberIds.map((v) => String(v).trim()).filter(Boolean)));

    // Resolve candidates — must be current (non-separated) employees.
    const candidates = await db.employee.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    const candidateById = new Map(candidates.map((c) => [c.id, c]));

    const INACTIVE = new Set(['inactive', 'terminated', 'resigned']);
    const existing = await db.chatRoomMember.findMany({
      where: { roomId: id, userId: { in: uniqueIds } },
      select: { userId: true },
    });
    const alreadyMember = new Set(existing.map((m) => m.userId));

    const toAdd: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const empId of uniqueIds) {
      const emp = candidateById.get(empId);
      if (!emp) {
        skipped.push({ id: empId, reason: 'Employee not found' });
      } else if (INACTIVE.has((emp.status || '').toLowerCase())) {
        skipped.push({ id: empId, reason: 'Employee is separated (terminated/resigned/inactive)' });
      } else if (alreadyMember.has(empId)) {
        skipped.push({ id: empId, reason: 'Already a member' });
      } else {
        toAdd.push(empId);
      }
    }

    if (toAdd.length > 0) {
      await db.chatRoomMember.createMany({
        data: toAdd.map((empId) => ({ roomId: id, userId: empId, role: 'member' })),
      });
      // Bump the room so it resurfaces at the top of every member's list.
      await db.chatRoom.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => null);
      try {
        await db.auditLog.create({
          data: {
            userId: decoded.userId,
            action: 'CHAT_ROOM_ADD_MEMBERS',
            module: 'collaboration',
            details: `Added ${toAdd.length} member(s) to chat room ${id}${room.name ? ` (${room.name})` : ''}`,
          },
        });
      } catch {}
    }

    const members = await db.chatRoomMember.findMany({ where: { roomId: id }, orderBy: { joinedAt: 'asc' } });

    return NextResponse.json({
      room: { id: room.id, name: room.name, roomType: room.roomType, memberCount: members.length },
      added: toAdd.length,
      addedIds: toAdd,
      skipped,
    });
  } catch (error) {
    console.error('POST chat room members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
