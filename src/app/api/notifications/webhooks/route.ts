/**
 * Integration Webhooks API (Task 36) — Slack / Microsoft Teams channels
 *
 *   GET    /api/notifications/webhooks       — list
 *   POST   /api/notifications/webhooks       — create { type, name, webhookUrl, channel, defaultModule? }
 *   PUT    /api/notifications/webhooks?id=   — update { ...fields, enabled? }
 *   DELETE /api/notifications/webhooks?id=   — remove
 *   POST   { test: true, id }                — send a test message to the webhook
 *
 * Admin/HR only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'hr_admin', 'company_hr_admin', 'hr_manager'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    const webhooks = await (db as any).integrationWebhook.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ webhooks }, { headers: cors() });
  } catch (error) {
    console.error('Webhooks GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const auth = await authGuard(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: cors() });
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: cors() });

    const body = await request.json();

    // Test mode — POST { id, test: true }
    if (body?.test && body?.id) {
      const hook = await (db as any).integrationWebhook.findFirst({ where: { id: body.id, tenantId: auth.tenantId } });
      if (!hook) return NextResponse.json({ error: 'Webhook not found' }, { status: 404, headers: cors() });
      const payload = hook.type === 'teams'
        ? {
            type: 'message',
            attachments: [{
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                type: 'AdaptiveCard', version: '1.4',
                body: [
                  { type: 'TextBlock', text: `${body.companyName || '3Boxes HRMS'} · Test notification`, weight: 'Bolder', wrap: true },
                  { type: 'TextBlock', text: 'This is a test message from your 3Boxes HRMS Notification Center. If you can read this, the integration is working.', wrap: true },
                ],
              },
            }],
          }
        : {
            text: `🔔 *${body.companyName || '3Boxes HRMS'}* — Test notification`,
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: '🔔 Test notification' } },
              { type: 'section', text: { type: 'mrkdwn', text: 'This is a *test message* from your 3Boxes HRMS Notification Center.\nIf you can read this, the integration is working.' } },
            ],
          };
      const res = await fetch(hook.webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `Webhook responded ${res.status}` }, { status: 200, headers: cors() });
      }
      return NextResponse.json({ success: true, message: 'Test message delivered' }, { headers: cors() });
    }

    const { type, name, webhookUrl, channel, defaultModule } = body || {};
    if (!type || !name || !webhookUrl) {
      return NextResponse.json({ error: 'type, name and webhookUrl are required' }, { status: 400, headers: cors() });
    }
    if (!/^https?:\/\//i.test(webhookUrl)) {
      return NextResponse.json({ error: 'webhookUrl must be a valid https URL' }, { status: 400, headers: cors() });
    }
    const hook = await (db as any).integrationWebhook.create({
      data: {
        tenantId: auth.tenantId,
        type,
        name,
        webhookUrl,
        channel: channel || (type === 'teams' ? 'teams' : 'slack'),
        defaultModule: defaultModule || null,
      },
    });
    return NextResponse.json({ success: true, webhook: hook }, { headers: cors() });
  } catch (error) {
    console.error('Webhooks POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function PUT(request: NextRequest) {
  const db = await getDb(request);
  try {
    const auth = await authGuard(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: cors() });
    if (!auth.isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: cors() });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: cors() });

    const body = await request.json();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === 'string') data.name = body.name;
    if (typeof body.webhookUrl === 'string') data.webhookUrl = body.webhookUrl;
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (typeof body.defaultModule === 'string' || body.defaultModule === null) data.defaultModule = body.defaultModule;

    const updated = await (db as any).integrationWebhook.updateMany({ where: { id, tenantId: auth.tenantId }, data });
    if (!updated.count) return NextResponse.json({ error: 'Webhook not found' }, { status: 404, headers: cors() });
    return NextResponse.json({ success: true }, { headers: cors() });
  } catch (error) {
    console.error('Webhooks PUT error:', error);
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
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: cors() });

    await (db as any).integrationWebhook.deleteMany({ where: { id, tenantId: auth.tenantId } });
    return NextResponse.json({ success: true }, { headers: cors() });
  } catch (error) {
    console.error('Webhooks DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}
