import { NextResponse } from 'next/server';
import { getDbForTenantById, getPlatformDb } from '@/lib/tenant-db';
import { syncETimeOfficePunches } from '@/lib/etimeoffice-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get('authorization')?.trim();
  return Boolean(secret && header === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const slug = process.env.ETIMEOFFICE_TENANT_SLUG?.trim() || 'marqaitechgroup';
  try {
    const tenant = await getPlatformDb().tenant.findFirst({
      where: { slug, status: 'active' },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: `Active tenant not found: ${slug}` }, { status: 404 });
    }

    const db = await getDbForTenantById(tenant.id);
    const result = await syncETimeOfficePunches(db, tenant.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Biometric sync failed.';
    console.error('[ETimeOfficeCron] Sync failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
