/**
 * Notification Center Summary API (Task 36)
 *
 *   GET /api/notifications/summary — module-wise counts + channel health for the console overview.
 * Admin/HR only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { NOTIFICATION_MODULES, TOTAL_EVENT_COUNT } from '@/lib/notification-events';

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'tenant_admin', 'hr_admin', 'company_hr_admin', 'hr_manager'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: cors() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: cors() });
    const role = ((decoded.role as string) || '').toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(role);
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: cors() });
    const tokenTenantId = (decoded.tenantId as string) || null;

    const [byModule, byStatus, pendingActions, webhooks] = await Promise.all([
      (db as any).notificationDelivery.groupBy({ by: ['module'], _count: { _all: true } }).catch(() => []),
      (db as any).notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
      (db as any).notificationDelivery.count({ where: { actionable: true, actionResult: null, actionedAt: null } }).catch(() => 0),
      (db as any).integrationWebhook.findMany({ where: { tenantId: tokenTenantId, enabled: true }, select: { id: true, type: true, name: true } }).catch(() => []),
    ]);

    return NextResponse.json(
      {
        totalEvents: TOTAL_EVENT_COUNT,
        modules: NOTIFICATION_MODULES.map((m) => ({
          module: m.module,
          label: m.label,
          color: m.color,
          description: m.description,
          eventCount: m.events.length,
          escalatableCount: m.events.filter((e) => e.escalatable).length,
          deliveryCount: byModule.find((b: any) => b.module === m.module)?._count._all || 0,
        })),
        statusCounts: byStatus.map((s: any) => ({ status: s.status, count: s._count._all })),
        pendingActions,
        activeWebhooks: webhooks,
        smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
      },
      { headers: cors() },
    );
  } catch (error) {
    console.error('Notification summary GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}
