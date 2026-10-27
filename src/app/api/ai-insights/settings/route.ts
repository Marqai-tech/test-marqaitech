import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORY = 'ai-insights';
const KEY = 'ui_preferences';

/** Tenant-wide AI Insights preferences live in the Setting table
 * (category 'ai-insights', key 'ui_preferences'). GET returns the raw JSON
 * string (or 200 {value:null}) so the page can merge with defaults. */
async function resolveTenant(request: Request) {
  const token = getTokenFromHeaders(request);
  const payload = await verifyToken(token);
  if (!payload) return null;
  const role = String(payload.role || '');
  if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(role)) return null;
  const tenantId = payload.tenantId ? String(payload.tenantId) : null;
  return { tenantId, role };
}

export async function GET(request: Request) {
  const ctx = await resolveTenant(request);
  if (!ctx) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!ctx.tenantId) return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 400 });
  try {
    const db = await getDb(request);
    const row = await db.setting.findFirst({
      where: { tenantId: ctx.tenantId, companyId: null, category: CATEGORY, key: KEY },
      select: { value: true },
    });
    return NextResponse.json({ value: row?.value ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[AIInsightsSettings] GET failed:', error);
    return NextResponse.json({ value: null });
  }
}

export async function PUT(request: Request) {
  const ctx = await resolveTenant(request);
  if (!ctx) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!ctx.tenantId) return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 400 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid settings payload.' }, { status: 400 });
    }
    // Light schema guard — only accept the known preference keys.
    const allowed = ['attendance', 'payroll', 'hiring', 'performance', 'leave', 'projects',
      'showModelChips', 'confidenceThreshold', 'alertLateStreak', 'alertOvertimeHours',
      'notifyEmail', 'notifyInApp'] as const;
    const clean: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) clean[k] = (body as Record<string, unknown>)[k];
    }
    const value = JSON.stringify(clean);

    const db = await getDb(request);
    const where = { tenantId: ctx.tenantId, companyId: null, category: CATEGORY, key: KEY };
    const existing = await db.setting.findFirst({ where, select: { id: true } });
    if (existing) {
      await db.setting.update({ where: { id: existing.id }, data: { value, dataType: 'json', isEditable: false } });
    } else {
      await db.setting.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: null,
          category: CATEGORY,
          key: KEY,
          value,
          dataType: 'json',
          isEditable: false,
          description: 'AI Insights section preferences (Task 159)',
        },
      });
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('[AIInsightsSettings] PUT failed:', error);
    return NextResponse.json({ error: 'Could not save AI settings.' }, { status: 500 });
  }
}
