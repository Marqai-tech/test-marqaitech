/**
 * Fix: "Learning & Development module not visible in the Modules section".
 *
 * Root cause: the super-admin MODULE_CATALOGUE had no 'learning' entry, so
 * `module_learning` FeatureFlag rows were never seeded for any tenant. The
 * Sidebar and /modules page resolve visibility from DB flags first
 * (isModuleEnabledForTenant → _dbModuleOverrides), so L&D was hidden for
 * every tenant that already had module_* flags.
 *
 * This script inserts the missing `module_learning` flag (enabled=true,
 * source='platform_default') for EVERY tenant in the platform DB.
 * Idempotent: existing flags are left untouched (never overrides an
 * admin's deliberate choice).
 *
 * Usage: node scripts/seed-learning-module-flag.js
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(PLATFORM_CS);
const log = (...a) => console.log('[module-flag]', ...a);

async function main() {
  const tenants = await sql`
    SELECT "id", "name", "slug", "status"
    FROM "Tenant"
    ORDER BY "createdAt" ASC`;
  log(`Found ${tenants.length} tenants in platform DB`);

  let inserted = 0;
  let existing = 0;
  for (const t of tenants) {
    const dup = await sql`
      SELECT "id", "enabled" FROM "FeatureFlag"
      WHERE "tenantId" = ${t.id} AND "key" = 'module_learning'
      LIMIT 1`;
    if (dup.length > 0) {
      existing++;
      log(`  · ${t.slug || t.id}: flag exists (enabled=${dup[0].enabled}) — left untouched`);
      continue;
    }
    await sql`
      INSERT INTO "FeatureFlag" ("id", "tenantId", "key", "label", "enabled", "source", "notes", "createdAt", "updatedAt")
      VALUES (
        'ff_lnd_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
        ${t.id}, 'module_learning', 'Learning & Development', true, 'platform_default',
        'Courses, learning paths, certifications & compliance training',
        NOW(), NOW()
      )`;
    inserted++;
    log(`  + ${t.slug || t.id}: module_learning flag inserted (enabled=true)`);
  }

  log(`Done. inserted=${inserted}, already-existed=${existing}, tenants=${tenants.length}`);

  // Verify: count flags per tenant for learning
  const verify = await sql`
    SELECT t."slug", f."enabled"
    FROM "FeatureFlag" f JOIN "Tenant" t ON t."id" = f."tenantId"
    WHERE f."key" = 'module_learning'`;
  log('Verification — module_learning flags now present for:');
  for (const v of verify) log(`  ${v.slug}: enabled=${v.enabled}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
