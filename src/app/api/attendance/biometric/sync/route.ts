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
  if (!user) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  if (!user) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(user.role)) return unauthorized();
  if (!user.tenantId) return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 400 });

  // Task 159/161: optional body { rewindTo, rewindDays, rematch } triggers a
  // self-healing resync — rematch orphaned punches against the current
  // roster and/or rewind the vendor checkpoint so missed days are re-pulled.
  // Task 158: body may also carry { rewindToRecord } (alias of rewindTo) and
  // { reclassifyDays } — recompute attendance from ALL stored punches of the
  // last N IST days (corrects late/half-day/work-hours and overrides
  // auto-present placeholders where real punches exist).
  let opts: { rewindTo?: string; rewindDays?: number; rematch?: boolean; reclassifyFrom?: Date; reclassifyTo?: Date } = {};
  try {
    const body = await request.json();
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.rewindTo === 'string' && b.rewindTo.trim()) opts.rewindTo = b.rewindTo.trim();
      else if (typeof b.rewindToRecord === 'string' && b.rewindToRecord.trim()) opts.rewindTo = b.rewindToRecord.trim();
      if (typeof b.rewindDays === 'number' && Number.isFinite(b.rewindDays) && b.rewindDays > 0) opts.rewindDays = Math.min(90, b.rewindDays);
      if (typeof b.rematch === 'boolean') opts.rematch = b.rematch;
      const days = Number(b.reclassifyDays);
      if (Number.isFinite(days) && days >= 1) {
        const windowDays = Math.min(Math.floor(days), 120);
        const nowIst = new Date(Date.now() + 5.5 * 3600_000);
        const todayStartIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
        opts.reclassifyTo = new Date(todayStartIst + 24 * 3600_000 - 5.5 * 3600_000);
        opts.reclassifyFrom = new Date(todayStartIst - (windowDays - 1) * 86_400_000 - 5.5 * 3600_000);
      }
    }
  } catch { /* empty body = plain sync */ }

  try {
    const db = await getSyncDatabase(user.tenantId);
    if (!db) return NextResponse.json({ error: 'Team Office sync is not configured for this tenant.' }, { status: 403 });
    return NextResponse.json(await syncETimeOfficePunches(db, user.tenantId, opts));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Team Office biometric sync failed.';
    console.error('[ETimeOfficeSync] Manual sync failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
