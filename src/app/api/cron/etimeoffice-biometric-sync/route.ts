import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { syncETimeOfficePunches } from '@/lib/etimeoffice-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = process.env.ETIMEOFFICE_TENANT_SLUG?.trim() || 'marqaitechgroup';
  try {
    const platformDb = getPlatformDb();
    const tenant = await platformDb.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true, status: true },
    });
    if (!tenant || tenant.status !== 'active') {
      return NextResponse.json({ error: `Configured biometric tenant '${tenantSlug}' is missing or inactive.` }, { status: 404 });
    }

    const db = await getDbForTenantById(tenant.id);
    const result = await syncETimeOfficePunches(db, tenant.id);
    return NextResponse.json({ success: true, tenant: tenant.slug, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Team Office biometric sync failed.';
    console.error('[ETimeOfficeSyncCron] Sync failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
