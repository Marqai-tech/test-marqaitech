#!/usr/bin/env node
/* Task 164 — production data update:
 *  1. Ensure Employee.biometricId + autoPresentAllDays TEXT columns exist
 *  2. Madhuri N  (MARQ008) → biometricId '007'
 *     Suresh V N (MARQ007) → biometricId '2'  + autoPresentAllDays 'true'
 *  3. Seed the etimeoffice_employee_code_map with BOTH explicit pairs — this
 *     protects punch attribution IMMEDIATELY (the currently deployed sync
 *     already reads this map with top priority, before any deploy).
 * Idempotent: safe to re-run. */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.id AS tenant_id, t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const t = tenants.find((x) => /marqai/i.test(x.slug));
  const db = neon(t.cs);
  console.log('== Tenant:', t.slug, t.tenant_id, '==');

  // 1) columns
  await db.query(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "biometricId" TEXT`);
  await db.query(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "autoPresentAllDays" TEXT`);
  console.log('1) columns ensured (biometricId, autoPresentAllDays)');

  // 2) employee values
  const upd = await db.query(`
    UPDATE "Employee" SET "biometricId" = v.bio, "autoPresentAllDays" = v.ap
    FROM (VALUES
      ('MARQ008', '007', NULL),
      ('MARQ007', '2',   'true')
    ) AS v(code, bio, ap)
    WHERE "Employee"."employeeId" = v.code
    RETURNING "Employee"."employeeId", "Employee"."firstName", "Employee"."biometricId", "Employee"."autoPresentAllDays"`);
  console.log('2) employees updated:', JSON.stringify(upd));

  // 3) seed the code map (preserve any existing learned entries)
  const existing = await db.query(`
    SELECT id, value FROM "Setting"
    WHERE "tenantId" = $1 AND "companyId" IS NULL AND category = 'integration' AND key = 'etimeoffice_employee_code_map' LIMIT 1`, [t.tenant_id]);
  let map = {};
  if (existing.length && existing[0].value) {
    try { map = JSON.parse(existing[0].value) || {}; } catch { map = {}; }
  }
  map['002'] = 'MARQ007';
  map['007'] = 'MARQ008';
  const flat = JSON.stringify(map);
  if (existing.length) {
    await db.query(`UPDATE "Setting" SET value = $1, "dataType" = 'json', "updatedAt" = NOW() WHERE id = $2`, [flat, existing[0].id]);
  } else {
    await db.query(`
      INSERT INTO "Setting" (id, "tenantId", "companyId", category, key, value, dataType, "isEditable", description, "createdAt", "updatedAt")
      VALUES ('set_task164_codemap_' || floor(random() * 1000000000)::text, $1, NULL, 'integration', 'etimeoffice_employee_code_map', $2, 'json', false, 'Managed by Team Office biometric sync', NOW(), NOW())`,
      [t.tenant_id, flat]);
  }
  console.log('3) code map seeded:', flat);

  // verify
  const check = await db.query(`
    SELECT "employeeId", "firstName", "lastName", "biometricId", "autoPresentAllDays"
    FROM "Employee" WHERE "employeeId" IN ('MARQ007','MARQ008')`);
  console.log('VERIFY:', JSON.stringify(check));
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
