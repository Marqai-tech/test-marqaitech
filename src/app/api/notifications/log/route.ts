/**
 * Notification Delivery Log API (Task 36)
 *
 *   GET /api/notifications/log?module=&channel=&status=&page=1&limit=25
 *
 * Admin/HR only — the audit trail of every notification sent across channels.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module') || undefined;
    const channel = searchParams.get('channel') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));

    const where: Record<string, unknown> = {};
    if (!isAdmin) {
      // Non-admins only see their own deliveries
      where.recipientId = decoded.userId as string;
    }
    if (module) where.module = module;
    if (channel) where.channel = channel;
    if (status) where.status = status;

    const [rows, total, counts] = await Promise.all([
      (db as any).notificationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      (db as any).notificationDelivery.count({ where }),
      (db as any).notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
    ]);

    return NextResponse.json(
      {
        deliveries: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        statusCounts: counts.map((c: any) => ({ status: c.status, count: c._count._all })),
        isAdmin,
      },
      { headers: cors() },
    );
  } catch (error) {
    console.error('Notification log GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}
