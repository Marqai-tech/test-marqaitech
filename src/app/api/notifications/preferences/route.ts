/**
 * Notification Preferences API (Task 36) — escalation matrix + module defaults
 *
 *   GET /api/notifications/preferences                     — all tenant-scope module preferences
 *   PUT  /api/notifications/preferences                    — upsert { module, escalationEnabled, escalationHours, escalateToRole, channelsEnabled, channelsDisabled }
 *
 * Admin/HR only. escalationHours default 48 (per requirements: escalate when a
 * manager does not approve within 48 hours).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'hr_admin', 'company_hr_admin', 'hr_manager'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

async function authGuard(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  if (!token) return { error: 'No token', status: 401 as const };
  const decoded = await verifyToken(token);
  if (!decoded) return { error: 'Invalid token', status: 401 as const };
  // Identity comes from the JWT (tenant users live in tenant DBs, not the
  // platform DB). Tenant resolution: x-tenant-slug header first, then token.
  const platformDb = getPlatformDb();
  let tenantId = (decoded.tenantId as string) || null;
  const tenantSlug = request.headers.get('x-tenant-slug');
  if (tenantSlug) {
    const tenant = await platformDb.tenant.findUnique({ where: { slug: tenantSlug } });
    if (tenant) tenantId = tenant.id;
  }
  if (!tenantId) return { error: 'Tenant not found', status: 404 as const };
  const role = ((decoded.role as string) || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin', 'super_admin', 'tenant_admin', 'hr_admin', 'company_hr_admin', 'hr_manager'].includes(role);
  return { userId: decoded.userId as string, role, tenantId, isAdmin };
}

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const auth = await authGuard(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: cors() });
    const prefs = await (db as any).notificationPreference.findMany({ where: { tenantId: auth.tenantId, scope: 'tenant' } });
    return NextResponse.json({ preferences: prefs }, { headers: cors() });
  } catch (error) {
    console.error('Notification preferences GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function PUT(request: NextRequest) {
  const db = await getDb(request);
  try {
    const auth = await authGuard(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: cors() });
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: cors() });

    const body = await request.json();
    const { module } = body || {};
    if (!module) return NextResponse.json({ error: 'module is required' }, { status: 400, headers: cors() });

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.escalationEnabled === 'boolean') data.escalationEnabled = body.escalationEnabled;
    if (typeof body.escalationHours === 'number') data.escalationHours = Math.max(1, Math.min(24 * 14, body.escalationHours));
    if (typeof body.escalateToRole === 'string') data.escalateToRole = body.escalateToRole || null;
    if (Array.isArray(body.channelsEnabled)) data.channelsEnabled = JSON.stringify(body.channelsEnabled);
    if (Array.isArray(body.channelsDisabled)) data.channelsDisabled = JSON.stringify(body.channelsDisabled);

    const existing = await (db as any).notificationPreference.findFirst({
      where: { tenantId: auth.tenantId, scope: 'tenant', module, eventKey: null },
    });
    let saved;
    if (existing) {
      saved = await (db as any).notificationPreference.update({ where: { id: existing.id }, data });
    } else {
      saved = await (db as any).notificationPreference.create({
        data: { tenantId: auth.tenantId, scope: 'tenant', module, eventKey: null, ...data } as any,
      });
    }
    return NextResponse.json({ success: true, preference: saved }, { headers: cors() });
  } catch (error) {
    console.error('Notification preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}
