/**
 * Task 129 — CEO role one-off heal, run against the platform DB + ALL active
 * tenant DBs BEFORE push:
 *   1. Upsert a system Role row { key:'ceo', name:'CEO', isSystem:true, level:1 }
 *      so the RBAC UI lists it and UserRoleAssignment rebuilds can resolve it.
 *   2. Copy the tenant_admin role's RolePermission grants onto the ceo role
 *      (when both exist) so the DB-backed RBAC mirrors the code-level parity.
 *   3. PROMOTE the existing "management without a role" users: any User whose
 *      linked Employee.isManagement=true and whose role is still 'employee'
 *      becomes 'ceo' (the exact complaint in Task 129). Users must re-login
 *      afterwards for the JWT to carry the new role.
 *
 * Idempotent. USAGE: set -a; source .env.production.local; set +a; node scripts/task129-ceo-heal.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task129-ceo-heal] FATAL: DATABASE_URL not set.');
  process.exit(1);
}

async function heal(label, cs) {
  const sql = neon(cs);
  const out = { role: false, perms: 0, promoted: 0 };
  try {
    // 1 — Role row (global system role; NULL tenantId/companyId)
    const existing = await sql.query(`SELECT id FROM "Role" WHERE key = 'ceo' LIMIT 1`);
    let roleId;
    if (existing.length > 0) {
      roleId = existing[0].id;
      out.role = true;
    } else {
      const ins = await sql.query(`
        INSERT INTO "Role" (id, name, key, "isSystem", level, "tenantId", "companyId", "createdAt", "updatedAt")
        VALUES ('ceo-role-' || md5(random()::text), 'CEO', 'ceo', true, 1, NULL, NULL, NOW(), NOW())
        RETURNING id`);
      roleId = ins[0].id;
      out.role = true;
    }

    // 2 — copy tenant_admin's RolePermission grants (if any exist)
    try {
      const grants = await sql.query(`
        SELECT rp."permissionId" FROM "RolePermission" rp
        JOIN "Role" r ON r.id = rp."roleId"
        WHERE r.key = 'tenant_admin' AND rp.granted = true`);
      if (grants.length > 0) {
        for (const g of grants) {
          const dup = await sql.query(
            `SELECT 1 FROM "RolePermission" WHERE "roleId" = $1 AND "permissionId" = $2 LIMIT 1`,
            [roleId, g.permissionId]
          );
          if (dup.length === 0) {
            await sql.query(
              `INSERT INTO "RolePermission" (id, "roleId", "permissionId", granted, "createdAt", "updatedAt")
               VALUES ('rp-' || md5(random()::text), $1, $2, true, NOW(), NOW())`,
              [roleId, g.permissionId]
            );
            out.perms += 1;
          }
        }
      }
    } catch (e) {
      // RolePermission table may be empty/unshaped in some DBs — non-fatal
      console.log(`[task129-ceo-heal] ${label}: RolePermission copy skipped (${e.message.split('\n')[0]})`);
    }

    // 3 — promote management-without-role users
    const promo = await sql.query(`
      UPDATE "User" u SET role = 'ceo'
      FROM "Employee" e
      WHERE e."userId" = u.id
        AND e."isManagement" = true
        AND u.role = 'employee'
      RETURNING u.email`);
    out.promoted = promo.length;
    for (const r of promo) console.log(`[task129-ceo-heal] ${label}: promoted ${r.email} → ceo`);

    console.log(`[task129-ceo-heal] ${label}: role=${out.role ? 'present' : 'MISSING'}, permsCopied=${out.perms}, promoted=${out.promoted}`);
    return out.role;
  } catch (e) {
    console.error(`[task129-ceo-heal] ${label}: FAILED — ${e && e.message ? e.message.split('\n')[0] : e}`);
    return false;
  }
}

async function main() {
  const targets = [['platform (DATABASE_URL)', PLATFORM]];
  const platformSql = neon(PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`${t.slug} (${t.db})`, t.cs]);
  } catch (e) {
    console.error('[task129-ceo-heal] Tenant registry read failed:', e.message);
  }
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await heal(label, cs)) ok += 1;
  }
  console.log(`[task129-ceo-heal] done — ${ok}/${targets.length} DBs healed`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
