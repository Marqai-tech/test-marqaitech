import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "LeaveFormSettings" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "settings" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "LeaveFormSettings_pkey" PRIMARY KEY ("id"))`);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LeaveFormSettings_tenantId_key" ON "LeaveFormSettings"("tenantId")`);
    } catch { /* non-fatal */ }

    let settings: any = null;
    try {
      const rows = await db.$queryRawUnsafe(`SELECT settings FROM "LeaveFormSettings" WHERE "tenantId" = $1 LIMIT 1`, tenantId) as any[];
      if (rows?.[0]?.settings) settings = typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings;
    } catch { /* table might not exist yet */ }

    const DEFAULT_FIELDS = {
      showReason: true, mandatoryReason: true,
      showDaySelection: true, showShift: false,
      showAttachment: true, mandatoryAttachment: false,
      showContactNumber: true, mandatoryContactNumber: true,
      showContactAddress: true, mandatoryContactAddress: true,
      showHandover: true, mandatoryHandover: true,
      showTeamOnLeave: true,
      showRelocation: false, mandatoryRelocation: true,
      showNotifyCc: true,
    };

    return NextResponse.json({ settings: settings || DEFAULT_FIELDS }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[FormSettings GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const role = decoded.role as string;
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can configure form settings' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const settings = body.settings || body;

    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "LeaveFormSettings" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "settings" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "LeaveFormSettings_pkey" PRIMARY KEY ("id"))`);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LeaveFormSettings_tenantId_key" ON "LeaveFormSettings"("tenantId")`);
    } catch { /* non-fatal */ }

    const settingsJson = JSON.stringify(settings);
    const id = `lfs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const rows = await db.$queryRawUnsafe(`SELECT id FROM "LeaveFormSettings" WHERE "tenantId" = $1 LIMIT 1`, tenantId) as any[];
      if (rows?.[0]?.id) {
        await db.$executeRawUnsafe(`UPDATE "LeaveFormSettings" SET "settings" = $1, "updatedAt" = NOW() WHERE "tenantId" = $2`, settingsJson, tenantId);
      } else {
        await db.$executeRawUnsafe(`INSERT INTO "LeaveFormSettings" ("id", "tenantId", "settings", "updatedAt") VALUES ($1, $2, $3, NOW())`, id, tenantId, settingsJson);
      }
    } catch (e) {
      console.error('[FormSettings POST] DB error:', e);
      throw e;
    }

    return NextResponse.json({ success: true, message: 'Form settings saved', settings }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[FormSettings POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
