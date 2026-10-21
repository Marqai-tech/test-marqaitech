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
 * the platform DB (shared-mode tenants + platform-level rooms) and every
 * active dedicated tenant database.
 *
 * NOTE: ChatRoom carries companyId/projectId as SCALAR foreign keys (no
 * Prisma relations in the schema), so room/project names are resolved with
 * separate scalar-select queries instead of includes.
 *
 * Query params: tenantId, roomId, q (body substring), limit (≤200).
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

    const tenants = await platformDb.tenant.findMany({
      where: tenantId ? { id: tenantId } : undefined,
      select: { id: true, name: true, slug: true },
    });
    const dedicated = await platformDb.tenantDatabase.findMany({
      where: { isActive: true, ...(tenantId ? { tenantId } : {}) },
      select: { tenantId: true, databaseName: true },
    });

    const rows: Record<string, unknown>[] = [];
    const deactivatedRooms: Record<string, unknown>[] = [];

    const collectFrom = async (
      // Structural subset both Prisma clients satisfy at runtime.
      db: {
        chatMessage: { findMany: (a: Record<string, unknown>) => Promise<any[]> };
        chatRoom: { findMany: (a: Record<string, unknown>) => Promise<any[]> };
        project: { findMany: (a: Record<string, unknown>) => Promise<any[]> };
      },
      tenantName: string,
      tenantIdForRows: string | null,
      source: string,
    ) => {
      const msgs = await db.chatMessage
        .findMany({
          where: {
            isDeleted: true,
            ...(roomId ? { roomId } : {}),
            ...(q ? { body: { contains: q } } : {}),
          },
          orderBy: { deletedAt: 'desc' },
          take: limit,
          include: { sender: { select: { id: true, firstName: true, lastName: true, email: true } } },
        })
        .catch(() => []);

      // Resolve rooms by scalar ids (no relations on ChatRoom).
      const roomIds = Array.from(new Set(msgs.map((m) => m.roomId as string))).filter(Boolean);
      const rooms = roomIds.length
        ? await db.chatRoom
            .findMany({
              where: { id: { in: roomIds } },
              select: { id: true, name: true, roomType: true, projectId: true, isActive: true },
            })
            .catch(() => [])
        : [];
      const roomById = new Map(rooms.map((r) => [r.id as string, r]));

      const projectIds = Array.from(new Set(rooms.map((r) => r.projectId as string).filter(Boolean)));
      const projects = projectIds.length
        ? await db.project
            .findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
            .catch(() => [])
        : [];
      const projectNameById = new Map(projects.map((p) => [p.id as string, p.name as string]));

      for (const m of msgs) {
        const room = roomById.get(m.roomId as string);
        const sender = (m.sender as any) || {};
        rows.push({
          messageId: m.id,
          tenantId: tenantIdForRows,
          tenantName,
          roomId: m.roomId,
          roomName: room?.name ?? null,
          roomType: room?.roomType ?? null,
          roomActive: room?.isActive ?? null,
          projectName: room?.projectId ? projectNameById.get(room.projectId as string) ?? null : null,
          senderId: m.senderId,
          senderName: `${sender.firstName ?? ''} ${sender.lastName ?? ''}`.trim() || 'Unknown',
          senderEmail: sender.email ?? null,
          body: m.body,
          attachments: m.attachments,
          createdAt: m.createdAt,
          deletedAt: m.deletedAt,
          source,
        });
      }

      const inactive = await db.chatRoom
        .findMany({
          where: { isActive: false, ...(roomId ? { id: roomId } : {}) },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: { id: true, name: true, roomType: true, projectId: true, updatedAt: true },
        })
        .catch(() => []);
      const inactiveProjectIds = Array.from(new Set(inactive.map((r) => r.projectId as string).filter(Boolean)));
      const inactiveProjects = inactiveProjectIds.length
        ? await db.project
            .findMany({ where: { id: { in: inactiveProjectIds } }, select: { id: true, name: true } })
            .catch(() => [])
        : [];
      const inactiveProjectNames = new Map(inactiveProjects.map((p) => [p.id as string, p.name as string]));
      for (const r of inactive) {
        deactivatedRooms.push({
          roomId: r.id,
          tenantId: tenantIdForRows,
          tenantName,
          name: r.name,
          roomType: r.roomType,
          projectName: r.projectId ? inactiveProjectNames.get(r.projectId as string) ?? null : null,
          updatedAt: r.updatedAt,
          source,
        });
      }
    };

    // 1. Platform DB (shared-mode tenants + platform rooms).
    try {
      await collectFrom(platformDb as any, 'Platform (shared)', tenantId || null, 'platform');
    } catch (e) {
      console.error('chat-archive platform sweep failed:', e);
    }

    // 2. Every active dedicated tenant DB.
    for (const t of dedicated.slice(0, 25)) {
      const tInfo = tenants.find((x) => x.id === t.tenantId);
      try {
        const db = await getDbForTenantById(t.tenantId);
        await collectFrom(db as any, tInfo?.name || t.databaseName || t.tenantId, t.tenantId, 'dedicated');
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
