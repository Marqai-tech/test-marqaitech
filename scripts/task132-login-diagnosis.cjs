/**
 * Task 132 — READ-ONLY diagnosis: mobile login ladder failure for
 * mahesh@marqaitech.com.
 *
 * Hypothesis (proven via live API probes):
 *   - Tenant host login (marqaitechgroup.3boxeshrms.com) → 200 OK for mahesh.
 *   - Apex login (3boxeshrms.com) → 401 without suggestedUrl, because the
 *     apex only authenticates against the PLATFORM DB and only answers
 *     403+suggestedUrl for users FOUND THERE with a valid password.
 *   - hr@marqaitech.com HAS a platform mirror row → ladder works for her.
 *   - mahesh@marqaitech.com does NOT → mobile ladder dies at the apex and
 *     never reaches the tenant workspace.
 *
 * This script diffs: platform User rows (per tenant) vs tenant DB User rows.
 * USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *        node scripts/task132-login-diagnosis.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: DATABASE_URL not set'); process.exit(1); }

function mask(hash) { return hash ? String(hash).slice(0, 12) + '…' : '(none)'; }

async function main() {
  const platform = neon(PLATFORM);

  const tenants = await platform.query(`
    SELECT t.id, t.slug, td."connectionString" AS cs
    FROM "Tenant" t
    LEFT JOIN "TenantDatabase" td ON td."tenantId" = t.id AND td."isActive" = true
    ORDER BY t."createdAt"`);
  console.log(`tenants: ${tenants.map(t => t.slug || t.id).join(', ')}`);

  for (const t of tenants) {
    console.log(`\n================ tenant: ${t.slug || '(no slug)'} ================`);
    // platform mirror rows for this tenant
    let mirrors = [];
    try {
      mirrors = await platform.query(
        `SELECT id, email, name, role, status, "tenantId", "password" FROM "User" WHERE "tenantId" = $1`, [t.id]);
    } catch (e) { console.log('  platform user query failed:', e.message); }
    console.log(`  PLATFORM mirror rows (${mirrors.length}):`);
    for (const u of mirrors) {
      console.log(`    ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(14)} status=${String(u.status).padEnd(10)} id=${u.id} pw=${mask(u.password)}`);
    }

    if (!t.cs) { console.log('  (no active tenant DB connection string)'); continue; }
    let tenantUsers = [];
    try {
      const sql = neon(t.cs);
      tenantUsers = await sql.query(
        `SELECT id, email, name, role, status, "password" FROM "User" ORDER BY "createdAt"`);
    } catch (e) { console.log('  tenant DB query failed:', e.message); continue; }
    console.log(`  TENANT DB users (${tenantUsers.length}):`);
    for (const u of tenantUsers) {
      console.log(`    ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(14)} status=${String(u.status).padEnd(10)} id=${u.id} pw=${mask(u.password)}`);
    }

    const mirrorEmails = new Set(mirrors.map(u => String(u.email).toLowerCase()));
    const missing = tenantUsers.filter(u => u.email && !mirrorEmails.has(String(u.email).toLowerCase()));
    console.log(`  → TENANT users WITHOUT platform mirror: ${missing.length ? missing.map(u => u.email).join(', ') : '(none)'}`);
  }
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
