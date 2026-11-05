/**
 * Task 132 — production data fix: sync MISSING platform mirror rows for
 * tenant-DB-only users (idempotent, run AFTER CR approval).
 *
 * The mobile workspace ladder relies on the apex (3boxeshrms.com) finding a
 * PLATFORM-DB User row to answer 403 + suggestedUrl. Users created directly
 * in a tenant DB (the MarqAI CEO, Task 129) never got that mirror row, so
 * mobile login failed for them with "Invalid email, employee ID, or
 * password" even with the correct password.
 *
 * For every ACTIVE tenant DB (demo excluded — its workspace URL is not a
 * *.3boxeshrms.com subdomain), create the platform mirror row for each
 * tenant user that has none: same id, email, password hash, name, avatar,
 * role, status, tenantId. Idempotent via ON CONFLICT DO NOTHING.
 *
 * USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *        node scripts/task132-mirror-sync.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: DATABASE_URL not set'); process.exit(1); }

async function main() {
  const platform = neon(PLATFORM);

  const tenants = await platform.query(`
    SELECT t.id, t.slug, td."connectionString" AS cs
    FROM "Tenant" t
    JOIN "TenantDatabase" td ON td."tenantId" = t.id AND td."isActive" = true
    WHERE t.slug <> '3boxes-hrms-demo'`);
  console.log(`active non-demo tenant DBs: ${tenants.map(t => t.slug).join(', ') || '(none)'}`);

  let inserted = 0;
  for (const t of tenants) {
    const sql = neon(t.cs);
    const users = await sql.query(
      `SELECT id, email, password, name, avatar, role, status FROM "User" WHERE email IS NOT NULL`);
    const mirrors = await platform.query(
      `SELECT id, email FROM "User" WHERE "tenantId" = $1`, [t.id]);
    const haveIds = new Set(mirrors.map(u => u.id));
    const haveEmails = new Set(mirrors.map(u => String(u.email).toLowerCase()));

    const missing = users.filter(u => !haveIds.has(u.id) && !haveEmails.has(String(u.email).toLowerCase()));
    console.log(`[${t.slug}] tenant users=${users.length}, platform mirrors=${mirrors.length}, missing=${missing.length}${missing.length ? ' → ' + missing.map(u => u.email).join(', ') : ''}`);

    for (const u of missing) {
      await platform.query(
        `INSERT INTO "User" ("id", "email", "password", "name", "avatar", "tenantId", "role", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [u.id, u.email, u.password, u.name || u.email, u.avatar || null, t.id, u.role, u.status === 'inactive' ? 'inactive' : 'active']);
      inserted++;
      console.log(`  + mirror row created: ${u.email} (role=${u.role}, id=${u.id})`);
    }
  }
  console.log(`\nDONE — mirror rows inserted: ${inserted}`);
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
