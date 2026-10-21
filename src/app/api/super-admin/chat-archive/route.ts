import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/super-admin/chat-archive — Task 121 (safety measure)
 *
 * Super Admin ONLY. Retention/compliance view over DELETED chat history:
 * messages are soft-deleted (isDeleted=true) — their body and attachments are
 * retained in the database and only masked from member feeds. This endpoint
 * surfaces them for every project AND individual chat, across ALL tenants:
 *   - the platform DB (shared-mode tenants + platform-level rooms), and
 *   - every active dedicated tenant database.
 *
 * Query params:
 *   tenantId  restrict to one tenant
 *   roomId    restrict to one room
 *   q         substring match on message body
 *   limit     page size (default 50, max 200)
 *
 * Response: { rows: [{ messageId, tenantId, tenantName, roomId, roomName,
 *   roomType, projectName, roomActive, senderId, senderName, body,
 *   attachments, createdAt, deletedAt, source }], rooms: [...deactivated rooms] }
 */
export async function GET(request: NextRequest) {
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const roomId = searchParams.get('roomId');
    const q = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    // ── Enumerate sources ────────────────────────────────────────────────
    const tenants = await platformDb.tenant.findMany({
      where: tenantId ? { id: tenantId } : undefined,
      select: { id: true, name: true, slug: true, isActive: true },
    });
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const dedicated = await platformDb.tenantDatabase.findMany({
      where: {
        isActive: true,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { tenantId: true, databaseName: true },
    });

    type Row = Record<string, unknown>;
    const rows: Row[] = [];
    const deactivatedRooms: Row[] = [];

    const messageWhere = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      isDeleted: true,
      ...(roomId ? { roomId } : {}),
      ...(q ? { body: { contains: q } } : {}),
      ...extra,
    });

    const roomInclude = {
      project: { select: { id: true, name: true } },
      company: { select: { name: true, companyGroup: { select: { tenantId: true, name: true } } } },
    };

    const collectFrom = async (db: {
      chatMessage: {
        findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
      };
      chatRoom: {
        findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
      };
    }, tenantName: string, tenantIdForRows: string | null, source: string) => {
      const msgs = await db.chatMessage.findMany({
        where: messageWhere(),
        orderBy: { deletedAt: 'desc' },
        take: limit,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
          room: { include: roomInclude },
        },
      }).catch(() => []);

      for (const m of msgs) {
        const room = m.room as Record<string, unknown> | null;
        const sender = m.sender as Record<string, unknown> | null;
        rows.push({
          messageId: m.id,
          tenantId: tenantIdForRows,
          tenantName,
          roomId: room?.id ?? m.roomId,
          roomName: room?.name ?? null,
          roomType: room?.roomType ?? null,
          roomActive: room?.isActive ?? null,
          projectName: (room?.project as Record<string, unknown> | undefined)?.name ?? null,
          senderId: m.senderId,
          senderName: sender ? `${sender.firstName ?? ''} ${sender.lastName ?? ''}`.trim() : 'Unknown',
          senderEmail: sender?.email ?? null,
          body: m.body,
          attachments: m.attachments, // retained JSON (names/metadata) — compliance
          createdAt: m.createdAt,
          deletedAt: m.deletedAt,
          source,
        });
      }

      const rooms = await db.chatRoom.findMany({
        where: {
          isActive: false,
          ...(roomId ? { id: roomId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: roomInclude,
      }).catch(() => []);

      for (const r of rooms) {
        deactivatedRooms.push({
          roomId: r.id,
          tenantId: tenantIdForRows,
          tenantName,
          name: r.name,
          roomType: r.roomType,
          projectName: (r.project as Record<string, unknown> | undefined)?.name ?? null,
          lastMessageAt: r.lastMessageAt,
          updatedAt: r.updatedAt,
          source,
        });
      }
    };

    // ── 1. Platform DB (shared-mode tenant data + platform rooms) ────────
    try {
      await collectFrom(platformDb as unknown as Parameters<typeof collectFrom>[0], 'Platform (shared)', tenantId || null, 'platform');
    } catch (e) {
      console.error('chat-archive platform sweep failed:', e);
    }

    // ── 2. Each active dedicated tenant DB ───────────────────────────────
    for (const t of dedicated.slice(0, 25)) {
      const tInfo = tenantById.get(t.tenantId);
      try {
        const db = await getDbForTenantById(t.tenantId);
        await collectFrom(db as unknown as Parameters<typeof collectFrom>[0], tInfo?.name || t.databaseName || t.tenantId, t.tenantId, 'dedicated');
      } catch (e) {
        console.error(`chat-archive sweep failed for tenant ${t.tenantId}:`, e);
      }
    }

    rows.sort((a, b) => new Date(b.deletedAt as string).getTime() - new Date(a.deletedAt as string).getTime());

    return NextResponse.json({
      rows: rows.slice(0, limit),
      rooms: deactivatedRooms,
      tenants: tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
      truncated: rows.length > limit,
    });
  } catch (error) {
    console.error('GET super-admin chat-archive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
