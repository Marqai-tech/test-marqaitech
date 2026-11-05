import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/employees/data-lock — returns the current lock state.
 * POST /api/employees/data-lock — body: { locked: boolean } — sets the lock state.
 *
 * Task 72: The lock state is stored in CollaborationSettings.employeeDataLocked.
 * When locked, employee ID, email, and employment details cannot be changed
 * via PUT /api/employees/[id] (server-side enforcement).
 */
async function ensureColumn(db: any) {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "employeeDataLocked" BOOLEAN NOT NULL DEFAULT false`);
  } catch { /* column may already exist */ }
}

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    await ensureColumn(db);
    const rows = await db.$queryRawUnsafe(`SELECT "employeeDataLocked" FROM "CollaborationSettings" LIMIT 1`).catch(() => []) as any[];
    const locked = rows?.[0]?.employeeDataLocked === true || rows?.[0]?.employeedatalocked === true || false;
    return NextResponse.json({ locked }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Data Lock GET] error:', error);
    return NextResponse.json({ locked: false }, { headers: corsHeaders() });
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Only tenant admins + super admins can lock/unlock
    const role = (decoded.role as string) || '';
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can lock/unlock employee data' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { locked } = body;
    if (typeof locked !== 'boolean') {
      return NextResponse.json({ error: 'locked (boolean) is required' }, { status: 400, headers: corsHeaders() });
    }

    await ensureColumn(db);

    // Upsert the CollaborationSettings row with the lock state
    const tenantSlug = request.headers.get('x-tenant-slug');
    let tenantId: string | null = null;
    if (tenantSlug) {
      const tenant = await platformDb.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenant) tenantId = tenant.id;
    }
    if (!tenantId && decoded.tenantId) tenantId = decoded.tenantId as string;

    if (tenantId) {
      // Try UPDATE first
      const updated = await db.$executeRawUnsafe(
        `UPDATE "CollaborationSettings" SET "employeeDataLocked" = $1, "updatedAt" = NOW() WHERE "tenantId" = $2`,
        locked, tenantId,
      ).catch(() => 0);
      // If no row was updated, INSERT
      if (updated === 0) {
        await db.$executeRawUnsafe(
          `INSERT INTO "CollaborationSettings" ("id", "tenantId", "employeeDataLocked", "encryptionEnabled", "fileSharingLimitMB", "messageRetentionDays", "calendarSyncEnabled", "calendarSyncProvider", "emailIntegrationEnabled", "emailProvider", "smtpPort", "smtpEncryption", "autoDeleteMessages", "maxCallDurationMin", "allowExternalSharing", "watermarkEnabled", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, true, 25, 90, true, 'google', false, 'smtp', 587, 'tls', false, 60, true, false, NOW(), NOW())`,
          tenantId, locked,
        ).catch(() => null);
      }
    }

    console.log(`[Data Lock] Employee data ${locked ? 'LOCKED' : 'UNLOCKED'} by ${decoded.userId}`);
    return NextResponse.json({ locked, message: locked ? 'Employee data has been locked. Employee ID, email, and employment details are now read-only.' : 'Employee data has been unlocked. All fields are now editable.' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Data Lock POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
