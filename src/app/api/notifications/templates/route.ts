/**
 * Notification Templates admin API (Task 36)
 *
 *   GET    /api/notifications/templates            — module-wise catalog (code defaults merged with tenant overrides)
 *   PUT    /api/notifications/templates            — upsert tenant override { module, eventKey, ...fields }
 *   DELETE /api/notifications/templates?module=&eventKey= — reset one event to the global default
 *
 * Admin/HR only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { NOTIFICATION_MODULES } from '@/lib/notification-events';
import { ensureTemplatesSeeded } from '@/lib/notification-center';

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'hr_admin', 'company_hr_admin', 'hr_manager'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

    await ensureTemplatesSeeded(db);
    const tenantTemplates = await (db as any).notificationTemplate.findMany({ where: { tenantId: auth.tenantId } });
    const overrides = new Map(tenantTemplates.map((t: any) => [`${t.module}:${t.eventKey}`, t]));
    const prefs = await (db as any).notificationPreference.findMany({ where: { tenantId: auth.tenantId, scope: 'tenant' } });
    const prefByModule = new Map(prefs.filter((p: any) => !p.eventKey).map((p: any) => [p.module, p]));

    const modules = NOTIFICATION_MODULES.map((mod) => ({
      module: mod.module,
      label: mod.label,
      description: mod.description,
      color: mod.color,
      preference: prefByModule.get(mod.module) || null,
      events: mod.events.map((ev) => {
        const override = overrides.get(`${mod.module}:${ev.eventKey}`);
        return {
          eventKey: ev.eventKey,
          name: ev.name,
          description: ev.description,
          recipients: ev.recipients,
          placeholders: ev.placeholders,
          escalatable: !!ev.escalatable,
          overrideId: override?.id || null,
          enabled: override ? override.enabled : true,
          channels: override ? JSON.parse(override.channels || '[]') : ev.defaultChannels,
          actionable: override ? override.actionable : !!ev.actionable,
          expiresHours: override?.expiresHours ?? 168,
          subject: override?.subject ?? ev.subject,
          bodyEmail: override?.bodyEmail ?? ev.body,
          bodySms: override?.bodySms ?? ev.sms,
          bodySlack: override?.bodySlack ?? ev.slack,
          isOverridden: !!override,
        };
      }),
    }));

    return NextResponse.json({ modules }, { headers: cors() });
  } catch (error) {
    console.error('Notification templates GET error:', error);
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
    const { module, eventKey } = body || {};
    if (!module || !eventKey) return NextResponse.json({ error: 'module and eventKey are required' }, { status: 400, headers: cors() });

    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['name', 'subject', 'bodyEmail', 'bodyInApp', 'bodySms', 'bodySlack']) {
      if (typeof body[key] === 'string') data[key] = body[key];
    }
    if (Array.isArray(body.channels)) data.channels = JSON.stringify(body.channels);
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (typeof body.actionable === 'boolean') data.actionable = body.actionable;
    if (typeof body.expiresHours === 'number') data.expiresHours = Math.max(1, Math.min(24 * 30, body.expiresHours));

    const existing = await (db as any).notificationTemplate.findFirst({
      where: { tenantId: auth.tenantId, module, eventKey },
    });
    let saved;
    if (existing) {
      saved = await (db as any).notificationTemplate.update({ where: { id: existing.id }, data });
    } else {
      saved = await (db as any).notificationTemplate.create({
        data: { tenantId: auth.tenantId, module, eventKey, ...data } as any,
      });
    }
    return NextResponse.json({ success: true, template: saved }, { headers: cors() });
  } catch (error) {
    console.error('Notification templates PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function DELETE(request: NextRequest) {
  const db = await getDb(request);
  try {
    const auth = await authGuard(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: cors() });
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: cors() });

    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module');
    const eventKey = searchParams.get('eventKey');
    if (!module || !eventKey) return NextResponse.json({ error: 'module and eventKey are required' }, { status: 400, headers: cors() });

    await (db as any).notificationTemplate.deleteMany({ where: { tenantId: auth.tenantId, module, eventKey } });
    return NextResponse.json({ success: true, message: 'Reset to default template' }, { headers: cors() });
  } catch (error) {
    console.error('Notification templates DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}
