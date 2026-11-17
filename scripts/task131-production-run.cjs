/**
 * Task 131 — production data backfill v2 (idempotent, run AFTER CR approval).
 *
 * CEO role parity via permission KEYS (Role/Permission rows differ per DB):
 *   1. Platform: CEO grants must equal the Tenant Administrator role's grants.
 *   2. Each tenant DB: for every platform tenant_admin grant (matched by
 *      Permission.key), grant the same permission to the CEO role where a
 *      Permission row with that key exists locally. Tenant DBs without any
 *      Permission rows (demo) are skipped with a note.
 *
 * USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *        node scripts/task131-production-run.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task131-run] FATAL: DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const platform = neon(PLATFORM);

  // ── source of truth: platform Tenant Administrator grants (by key) ──
  const taRole = await platform.query(`SELECT id FROM "Role" WHERE key = 'tenant_admin' LIMIT 1`);
  if (taRole.length === 0) throw new Error('platform tenant_admin role not found');
  const taGrants = await platform.query(
    `SELECT m.key AS "moduleKey", p.action, p.id AS "permissionId"
     FROM "RolePermission" rp JOIN "Permission" p ON p.id = rp."permissionId" JOIN "Module" m ON m.id = p."moduleId"
     WHERE rp."roleId" = $1`, [taRole[0].id]);
  console.log(`[task131-run] platform tenant_admin grants: ${taGrants.length} (source of truth)`);

  // ── 1. platform CEO parity (idempotent) ──
  const ceoPlatform = await platform.query(`SELECT id FROM "Role" WHERE key = 'ceo' LIMIT 1`);
  if (ceoPlatform.length === 0) throw new Error('platform CEO role not found');
  const ceoIdPlatform = ceoPlatform[0].id;
  const ceoPermsPlatform = new Set(
    (await platform.query(
      `SELECT m.key || ':' || p.action AS k FROM "RolePermission" rp JOIN "Permission" p ON p.id = rp."permissionId" JOIN "Module" m ON m.id = p."moduleId" WHERE rp."roleId" = $1`, [ceoIdPlatform],
    )).map((r) => r.k),
  );
  let copiedPlatform = 0;
  for (const g of taGrants) {
    const k = `${g.moduleKey}:${g.action}`;
    if (ceoPermsPlatform.has(k)) continue;
    await platform.query(
      `INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())`, [ceoIdPlatform, g.permissionId]);
    copiedPlatform++;
  }
  console.log(`[task131-run] platform CEO: copied ${copiedPlatform} missing grants`);

  // ── 2. tenant DBs ──
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);
  for (const t of tenants) {
    const sql = neon(t.cs);
    try {
      const permCount = await sql.query(`SELECT count(*)::int AS n FROM "Permission"`);
      if (permCount[0].n === 0) {
        console.log(`  [${t.slug}] no Permission rows — RBAC grants not used here, skipped`);
        continue;
      }
      const ceoRole = await sql.query(`SELECT id FROM "Role" WHERE key = 'ceo' LIMIT 1`);
      let ceoId;
      if (ceoRole.length === 0) {
        const created = await sql.query(
          `INSERT INTO "Role" ("id", "name", "key", "description", "isSystem", "level", "status", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, 'CEO', 'ceo', 'Chief Executive Officer — same access rights as Tenant Admin', true, 1, 'active', NOW(), NOW())
           RETURNING id`);
        ceoId = created[0].id;
        console.log(`  [${t.slug}] CEO role row CREATED`);
      } else {
        ceoId = ceoRole[0].id;
      }
      const ceoPerms = new Set(
        (await sql.query(
          `SELECT m.key || ':' || p.action AS k FROM "RolePermission" rp JOIN "Permission" p ON p.id = rp."permissionId" JOIN "Module" m ON m.id = p."moduleId" WHERE rp."roleId" = $1`, [ceoId],
        )).map((r) => r.k),
      );
      let copied = 0, missingPerm = 0;
      for (const g of taGrants) {
        const k = `${g.moduleKey}:${g.action}`;
        if (ceoPerms.has(k)) continue;
        const perm = await sql.query(
          `SELECT p.id FROM "Permission" p JOIN "Module" m ON m.id = p."moduleId" WHERE m.key = $1 AND p.action = $2 LIMIT 1`,
          [g.moduleKey, g.action]);
        if (perm.length === 0) { missingPerm++; continue; }
        await sql.query(
          `INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())`, [ceoId, perm[0].id]);
        copied++;
      }
      const total = await sql.query(`SELECT count(*)::int AS n FROM "RolePermission" WHERE "roleId" = $1`, [ceoId]);
      console.log(`  [${t.slug}] CEO role: copied ${copied} grants (${missingPerm} permission keys not present locally) — now ${total[0].n} permissions`);
    } catch (e) {
      console.error(`  [${t.slug}] FAILED: ${e.message}`);
    }
  }
  console.log('[task131-run] done');
}

main().catch((e) => { console.error('[task131-run] FAILED:', e); process.exit(1); });
