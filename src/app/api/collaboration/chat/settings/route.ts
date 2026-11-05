import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  getChatContext,
  loadChatGovernance,
  parseManagerIds,
  computeChatPermissions,
  CHAT_ADMIN_ROLES,
} from '@/lib/chat-permissions';

/**
 * GET /api/collaboration/chat/settings — Task 122
 *
 * Chat governance for the signed-in user: the tenant's toggles plus the
 * EFFECTIVE permissions computed for the caller. Every chat surface (web +
 * mobile) calls this once per session to decide:
 *   - whether the "Group" option appears in new-chat pickers (canCreateGroup)
 *   - whether rename/delete actions render on chats (canEditGroup / canDeleteGroup)
 *   - whether "delete direct chat" is offered (canDeleteDirect)
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Employee record is optional (admin-only users may not have one).
    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } }).catch(() => null);

    const ctx = await getChatContext(request, db, platformDb, decoded, employee?.id ?? null);

    return NextResponse.json({
      settings: {
        customManagersEnabled: ctx.settings.customManagersEnabled,
        directDeleteEnabled: ctx.settings.directDeleteEnabled,
        managerIds: ctx.settings.managerIds,
        managerCount: ctx.settings.managerIds.length,
      },
      permissions: ctx.permissions,
    });
  } catch (error) {
    console.error('GET chat settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/collaboration/chat/settings — Task 122 (chat admins only)
 * Body: { customManagersEnabled?, directDeleteEnabled?, managerIds? }
 *
 * Only the three governance fields are touched — the rest of the
 * CollaborationSettings row is owned by the general settings endpoint.
 */
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
      !CHAT_ADMIN_ROLES.includes(decoded.role as (typeof CHAT_ADMIN_ROLES)[number])
    ) {
      return NextResponse.json({ error: 'Only HR/tenant admins can change chat settings' }, { status: 403 });
    }

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId } }).catch(() => null);
    const updatedBy = employee?.id ?? (decoded.userId as string);

    const ctx = await getChatContext(request, db, platformDb, decoded, employee?.id ?? null);
    if (!ctx.tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { customManagersEnabled, directDeleteEnabled, managerIds } = body as {
      customManagersEnabled?: unknown;
      directDeleteEnabled?: unknown;
      managerIds?: unknown;
    };

    // Validate + merge onto current values (partial PATCH).
    const next = {
      customManagersEnabled:
        typeof customManagersEnabled === 'boolean' ? customManagersEnabled : ctx.settings.customManagersEnabled,
      directDeleteEnabled:
        typeof directDeleteEnabled === 'boolean' ? directDeleteEnabled : ctx.settings.directDeleteEnabled,
      managerIds: Array.isArray(managerIds) ? parseManagerIds(managerIds) : ctx.settings.managerIds,
    };
    if (next.managerIds.length > 200) {
      return NextResponse.json({ error: 'Too many chat managers (max 200)' }, { status: 400 });
    }
    // Custom managers are meaningless without the flag — keep them stored
    // (so re-enabling restores the list) but they grant nothing while off.

    const settings = await db.collaborationSettings.upsert({
      where: { tenantId: ctx.tenantId },
      update: {
        chatCustomManagersEnabled: next.customManagersEnabled,
        chatDirectDeleteEnabled: next.directDeleteEnabled,
        chatGroupManagerIds: JSON.stringify(next.managerIds),
        updatedBy,
      },
      create: {
        tenantId: ctx.tenantId,
        chatCustomManagersEnabled: next.customManagersEnabled,
        chatDirectDeleteEnabled: next.directDeleteEnabled,
        chatGroupManagerIds: JSON.stringify(next.managerIds),
        updatedBy,
      },
    });
    void settings;

    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId,
          action: 'CHAT_GOVERNANCE_UPDATE',
          module: 'collaboration',
          details: `Chat settings updated — customManagersEnabled=${next.customManagersEnabled}, directDeleteEnabled=${next.directDeleteEnabled}, managerCount=${next.managerIds.length}`,
        },
      });
    } catch {}

    const governance = await loadChatGovernance(db, ctx.tenantId);
    return NextResponse.json({
      settings: {
        customManagersEnabled: governance.customManagersEnabled,
        directDeleteEnabled: governance.directDeleteEnabled,
        managerIds: governance.managerIds,
        managerCount: governance.managerIds.length,
      },
      permissions: computeChatPermissions(governance, decoded.role, employee?.id ?? null),
    });
  } catch (error) {
    console.error('PATCH chat settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
