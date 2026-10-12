/**
 * Task 78 — FIX "no data visible on LIVE tenant (marqaitechgroup.3boxeshrms.com)"
 *
 * ROOT CAUSE: the TenantDatabase.connectionString for marqaitechgroup uses the
 * Neon DIRECT endpoint host + `channel_binding=require`. In the Vercel runtime,
 * PrismaNeon (neon HTTP driver) fails the SCRAM channel-binding handshake for
 * this string, so every tenant-DB query 503s (DB_UNAVAILABLE). The demo tenant
 * (pooler host, no channel_binding) and the platform DB (direct host, no
 * channel_binding) both work on Vercel; all three work locally.
 *
 * FIX:
 *  1. Rewrite the marqaitechgroup registry row to the proven-working demo
 *     pattern: -pooler host, sslmode=require, connect_timeout=10, no
 *     channel_binding (password preserved from the existing string).
 *  2. Apply the one real schema drift item on both tenant DBs:
 *     PolicyAcknowledgment.action TEXT NOT NULL DEFAULT 'accepted'.
 * All changes are idempotent and additive.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

function toPoolerNoChannelBinding(cs) {
  const u = new URL(cs);
  // swap direct endpoint host to the pooled host (same pattern as the demo tenant)
  u.hostname = u.hostname.replace('.aws.neon.tech', '-pooler.aws.neon.tech');
  const p = u.searchParams;
  p.delete('channel_binding');
  p.set('sslmode', 'require');
  p.set('connect_timeout', '10');
  return u.toString();
}

const DDL = `ALTER TABLE "PolicyAcknowledgment" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'accepted'`;
const VERIFY = `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='PolicyAcknowledgment' AND column_name='action'`;

async function main() {
  const platformSql = neon(PLATFORM);

  // ---- 1) Fix the LIVE tenant registry connection string ----
  const rows = await platformSql.query(`
    SELECT td.id, td."connectionString" AS cs, td."directUrl" AS du, td."databaseName" AS db, t.slug
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"`);
  for (const r of rows) {
    if (r.slug !== 'marqaitechgroup') continue;
    if (!r.cs.includes('channel_binding')) {
      console.log(`[fix] ${r.slug}: connection string already clean — no change`);
      continue;
    }
    const newCs = toPoolerNoChannelBinding(r.cs);
    const newDu = r.du ? toPoolerNoChannelBinding(r.du) : newCs;
    await platformSql.query(`UPDATE "TenantDatabase" SET "connectionString" = $1, "directUrl" = $2 WHERE id = $3`, [newCs, newDu, r.id]);
    const masked = newCs.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
    console.log(`[fix] ${r.slug}: registry updated -> ${masked}`);
  }

  // ---- 2) Re-read all tenant DBs (with fixed strings) and apply DDL ----
  const tenants = await platformSql.query(`
    SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);

  for (const t of tenants) {
    const sql = neon(t.cs);
    try {
      const hasTable = await sql.query(`SELECT to_regclass('public."PolicyAcknowledgment"') IS NOT NULL AS ok`);
      if (hasTable[0].ok) {
        await sql.query(DDL);
        const v = await sql.query(VERIFY);
        console.log(`[fix] ${t.slug}: PolicyAcknowledgment.action -> ${v[0] ? v[0].data_type + ' default ' + v[0].column_default : 'MISSING'}`);
      } else {
        console.log(`[fix] ${t.slug}: no PolicyAcknowledgment table — skipped`);
      }
      // smoke: read employee count through the app-style connection string
      const n = await sql.query(`SELECT COUNT(*)::int AS n FROM "Employee"`);
      console.log(`[fix] ${t.slug}: Employee rows reachable = ${n[0].n}`);
    } catch (e) {
      console.error(`[fix] ${t.slug}: FAILED — ${e.message.split('\n')[0]}`);
    }
  }
  console.log('[fix] done');
}

main().catch(e => { console.error(e); process.exit(1); });
