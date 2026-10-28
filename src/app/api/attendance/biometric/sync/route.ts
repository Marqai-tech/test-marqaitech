import { NextResponse } from 'next/server';
import { requireUser, isAdminRole } from '@/lib/attendance-leave-api';
import { getDbForTenantById, getPlatformDb } from '@/lib/tenant-db';
import { getETimeOfficeSyncStatus, syncETimeOfficePunches } from '@/lib/etimeoffice-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
}

async function getSyncDatabase(tenantId: string) {
  const slug = process.env.ETIMEOFFICE_TENANT_SLUG?.trim() || 'marqaitechgroup';
  const tenant = await getPlatformDb().tenant.findFirst({
    where: { id: tenantId, slug, status: 'active' },
    select: { id: true },
  });
  return tenant ? getDbForTenantById(tenant.id) : null;
}

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return unauthorized();
  if (!user.tenantId) return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 400 });

  try {
    const db = await getSyncDatabase(user.tenantId);
    if (!db) return NextResponse.json({ error: 'Team Office sync is not configured for this tenant.' }, { status: 403 });
    return NextResponse.json(await getETimeOfficeSyncStatus(db, user.tenantId));
  } catch (error) {
    console.error('[ETimeOfficeSync] Status lookup failed:', error);
    return NextResponse.json({ error: 'Could not load Team Office sync status.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return unauthorized();
  if (!user.tenantId) return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 400 });

  try {
    const db = await getSyncDatabase(user.tenantId);
    if (!db) return NextResponse.json({ error: 'Team Office sync is not configured for this tenant.' }, { status: 403 });
    return NextResponse.json(await syncETimeOfficePunches(db, user.tenantId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Team Office biometric sync failed.';
    console.error('[ETimeOfficeSync] Manual sync failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
