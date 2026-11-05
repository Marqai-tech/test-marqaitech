/* Task 158 — production biometric re-sync runner.
 * Bundles the REAL src/lib sync engine (esbuild) and runs it against the
 * MarqAI tenant DB: rewinds the Team Office cursor to the start of the
 * October table, re-downloads everything (idempotent recordKey dedupe),
 * and re-classifies attendance for every biometric-punch day since Oct 1
 * (corrects late/half-day/work-hours and overrides auto-present rows). */
import fs from 'node:fs';

async function main() {
  // 1) Production env BEFORE any lib module initializes.
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const [k, v] of Object.entries(env)) {
    if (/^(DATABASE_URL|ETIMEOFFICE_|CRON_SECRET|PLATFORM_)/.test(k)) process.env[k] = v;
  }
  // Normalize an escaped \$ checkpoint env (Next-style .env escaping) — the
  // lib validates the raw MMyyyy$ID format.
  if (process.env.ETIMEOFFICE_LAST_RECORD) {
    process.env.ETIMEOFFICE_LAST_RECORD = process.env.ETIMEOFFICE_LAST_RECORD.replace(/\\\$/g, '$');
  }

  // 2) Resolve the tenant through the REAL routing layer.
  const { getDbForTenantById, getPlatformDb } = await import('../src/lib/tenant-db');
  const platformDb = getPlatformDb();
  const tenant = await platformDb.tenant.findFirst({
    where: { slug: 'marqaitechgroup', status: 'active' },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error('Active tenant marqaitechgroup not found');
  console.log('TENANT:', tenant.slug, tenant.id);

  const db = await getDbForTenantById(tenant.id);

  // Before snapshot (attendance state since Oct 1)
  const before = await (db as any).$queryRaw`
    SELECT (date AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS n,
           SUM(CASE WHEN "checkIn" IS NOT NULL THEN 1 ELSE 0 END)::int AS with_in
    FROM "Attendance" WHERE date >= '2026-09-30T18:30:00Z' GROUP BY 1 ORDER BY 1`;
  console.log('ATTENDANCE BEFORE (IST days):');
  for (const r of before) console.log(`  ${new Date(r.day).toISOString().slice(0, 10)} rows=${r.n} checkIn=${r.with_in}`);

  // 3) Re-sync: rewind to the first October record + re-classify Oct 1 → now.
  const reclassifyFrom = new Date(Date.UTC(2026, 9, 1) - 5.5 * 3600_000); // Oct 1 00:00 IST
  const reclassifyTo = new Date(Date.now() + 24 * 3600_000);              // through today
  const { syncETimeOfficePunches } = await import('../src/lib/etimeoffice-sync');
  const result = await syncETimeOfficePunches(db as any, tenant.id, {
    rewindToRecord: '102026$1',
    reclassifyFrom,
    reclassifyTo,
  });
  console.log('RESYNC RESULT:', JSON.stringify(result, null, 2));

  // After snapshot
  const after = await (db as any).$queryRaw`
    SELECT (date AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS n,
           SUM(CASE WHEN "checkIn" IS NOT NULL THEN 1 ELSE 0 END)::int AS with_in,
           SUM(CASE WHEN "checkOut" IS NOT NULL THEN 1 ELSE 0 END)::int AS with_out
    FROM "Attendance" WHERE date >= '2026-09-30T18:30:00Z' GROUP BY 1 ORDER BY 1`;
  console.log('ATTENDANCE AFTER (IST days):');
  for (const r of after) console.log(`  ${new Date(r.day).toISOString().slice(0, 10)} rows=${r.n} checkIn=${r.with_in} checkOut=${r.with_out}`);

  // Status recompute sample
  const sample = await (db as any).$queryRaw`
    SELECT (a.date AT TIME ZONE 'Asia/Kolkata')::date AS day, e."employeeId" AS code, a.status, a."workHours",
           a."checkIn" AT TIME ZONE 'Asia/Kolkata' AS ci, a."checkOut" AT TIME ZONE 'Asia/Kolkata' AS co, a."punchMethod"
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE a.date >= '2026-10-22T18:30:00Z' ORDER BY a.date, e."employeeId"`;
  console.log('RECENT DAYS AFTER RESYNC:');
  for (const r of sample) {
    const fmt = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(11, 16) + 'IST-shifted' : '—');
    console.log(`  ${new Date(r.day).toISOString().slice(0, 10)} ${r.code} ${r.status} wh=${r.workHours ?? '—'} in=${fmt(r.ci)} out=${fmt(r.co)} (${r.punchMethod})`);
  }

  await (db as any).$disconnect();
}

main().catch((e) => { console.error('RESYNC FAILED:', e?.message || e); process.exit(1); });
