import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getFeedContext, FEED_ADMIN_ROLES, parseFeedCreatorIds } from '@/lib/feed-permissions';

/**
 * Task 138 — Social Feed governance API (mirrors the Task 122 chat settings
 * pattern).
 *
 * GET   — any authenticated user: the tenant's mode + the caller's effective
 *         permissions (drives composer visibility on every feed surface).
 * PATCH — feed admins only: { creationMode, creatorIds }.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } }).catch(() => null);
    const ctx = await getFeedContext(request, db, platformDb, decoded as { role?: string; tenantId?: string | null }, employee?.id ?? null);

    return NextResponse.json({
      settings: {
        creationMode: ctx.settings.creationMode,
        creatorIds: ctx.settings.creatorIds,
        creatorCount: ctx.settings.creatorIds.length,
      },
      permissions: ctx.permissions,
    });
  } catch (error) {
    console.error('GET feed settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    if (
      decoded.role !== 'super_admin' &&
      !FEED_ADMIN_ROLES.includes(decoded.role as (typeof FEED_ADMIN_ROLES)[number])
    ) {
      return NextResponse.json({ error: 'Only HR / tenant admins can change social feed settings' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { creationMode, creatorIds } = body as { creationMode?: string; creatorIds?: unknown };
    if (creationMode !== undefined && creationMode !== 'admins' && creationMode !== 'selected') {
      return NextResponse.json({ error: "creationMode must be 'admins' or 'selected'" }, { status: 400 });
    }
    let nextIds: string[] | undefined;
    if (creatorIds !== undefined) {
      if (!Array.isArray(creatorIds)) return NextResponse.json({ error: 'creatorIds must be an array of employee ids' }, { status: 400 });
      nextIds = parseFeedCreatorIds(creatorIds);
      if (nextIds.length > 500) return NextResponse.json({ error: 'Too many creators selected (max 500)' }, { status: 400 });
    }

    const ctx = await getFeedContext(request, db, platformDb, decoded as { role?: string; tenantId?: string | null }, null);
    if (!ctx.tenantId) return NextResponse.json({ error: 'No tenant context — settings cannot be saved' }, { status: 400 });

    const update: Record<string, unknown> = { updatedBy: String(decoded.userId || '') };
    if (creationMode !== undefined) update.feedCreationMode = creationMode;
    if (nextIds !== undefined) update.feedCreatorIds = JSON.stringify(nextIds);

    await db.collaborationSettings.upsert({
      where: { tenantId: ctx.tenantId },
      update,
      create: { tenantId: ctx.tenantId, ...update },
    });

    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId,
          action: 'FEED_GOVERNANCE_UPDATE',
          module: 'collaboration',
          details: `Social feed settings updated — creationMode=${creationMode ?? 'unchanged'}, creatorCount=${nextIds?.length ?? ctx.settings.creatorIds.length}`,
        },
      });
    } catch { /* audit is best-effort */ }

    const settings = await getFeedContext(request, db, platformDb, decoded as { role?: string; tenantId?: string | null }, null);
    return NextResponse.json({
      success: true,
      settings: {
        creationMode: settings.settings.creationMode,
        creatorIds: settings.settings.creatorIds,
        creatorCount: settings.settings.creatorIds.length,
      },
    });
  } catch (error) {
    console.error('PATCH feed settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
