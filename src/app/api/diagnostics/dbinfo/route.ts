import { NextResponse } from 'next/server';
import { getPlatformDb, getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

/**
 * TEMPORARY Task 78 diagnostic — identifies WHICH physical databases the
 * running app is connected to (platform + current tenant), so environment
 * mismatches (e.g., a Vercel env var pointing at an old Neon branch) become
 * visible. READ-ONLY: current_database(), server addr, and column presence
 * probes. No user data returned.
 */
export async function GET(request: Request) {
  // auth-gated: any authenticated user may call, but nothing sensitive returned
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors() });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors() });
  }

  const out: Record<string, unknown> = {};

  try {
    const platformDb = getPlatformDb();
    const rows = (await platformDb.$queryRawUnsafe(
      `SELECT current_database() AS db, inet_server_addr()::text AS host, version() AS ver`
    )) as any;
    const row = rows[0];
    const tCount = (await platformDb.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Tenant"`)) as any;
    const registry = (await platformDb.$queryRawUnsafe(
      `SELECT t.slug, td."databaseName" AS db, td."isActive" AS active,
        substring(td."connectionString" from '@([^/]+)') AS host,
        (td."connectionString" LIKE '%channel_binding%') AS has_channel_binding
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"`
    )) as any;
    out.platform = {
      database: row?.db,
      serverAddr: row?.host,
      pgVersion: String(row?.ver || '').split(' ').slice(0, 2).join(' '),
      tenantCount: tCount[0]?.n,
      registry,
    };
  } catch (e: any) {
    out.platformError = String(e?.message || e).slice(0, 200);
  }

  try {
    const db = await getDb(request);
    const rows = (await db.$queryRawUnsafe(
      `SELECT current_database() AS db, inet_server_addr()::text AS host`
    )) as any;
    const empCols = (await db.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name='Employee' AND column_name IN ('isManagement','avatar','earlyLogout')`
    )) as any;
    const empCount = (await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Employee"`)) as any;
    out.currentTenantDb = {
      database: rows[0]?.db,
      serverAddr: rows[0]?.host,
      employeeProbeColumns: empCols.map((c: any) => c.column_name),
      employeeCount: empCount[0]?.n,
    };
  } catch (e: any) {
    out.tenantDbError = String(e?.message || e).slice(0, 200);
  }

  return NextResponse.json(out, { headers: cors() });
}
