/**
 * Task 94 (94-1) — Register the `demo` test tenant in the platform DB (ep-blue-fire neondb).
 * - Tenant row: slug 'demo', domain demo.3boxeshrms.com, plan enterprise, status active
 * - TenantDatabase row: -> tenant_demo on the POOLER host (same pattern as the proven demo tenant row)
 * Idempotent: safe to re-run.
 */
const { Client } = require('pg');
const crypto = require('crypto');

const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const POOLER = 'ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech';

async function main() {
  const c = new Client({ connectionString: PLATFORM_CS });
  await c.connect();

  // Generate a cuid-like id (matching the app's id shape: 'c' + timestamp + random)
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(8).toString('hex');
  const tenantId = `cm${ts}${rand}`.slice(0, 30);

  const existing = await c.query(`SELECT id, slug FROM "Tenant" WHERE slug = 'demo'`);
  let id;
  if (existing.rows.length > 0) {
    id = existing.rows[0].id;
    console.log(`Tenant 'demo' already exists: ${id} — updating instead of inserting`);
    await c.query(
      `UPDATE "Tenant" SET name=$1, "domain"=$2, plan=$3, status='active', country='IN', currency='INR', timezone='Asia/Kolkata', "maxCompaniesAllowed"=$4, "updatedAt"=NOW() WHERE id=$5`,
      ['3Boxes Test Demo', 'demo.3boxeshrms.com', 'enterprise', 10, id]
    );
  } else {
    id = tenantId;
    await c.query(
      `INSERT INTO "Tenant" (id, name, slug, "domain", plan, status, country, currency, timezone, "maxCompaniesAllowed", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,'active','IN','INR','Asia/Kolkata',$6,NOW())`,
      [id, '3Boxes Test Demo', 'demo', 'demo.3boxeshrms.com', 'enterprise', 10]
    );
    console.log(`Tenant 'demo' created: ${id}`);
  }

  const connString = `postgresql://neondb_owner:npg_pxZd8woKe4WB@${POOLER}/tenant_demo?sslmode=require&connect_timeout=10`;
  const directUrl = `postgresql://neondb_owner:npg_pxZd8woKe4WB@${POOLER}/tenant_demo?sslmode=require`;

  const tdb = await c.query(`SELECT id FROM "TenantDatabase" WHERE "tenantId" = $1`, [id]);
  if (tdb.rows.length > 0) {
    await c.query(
      `UPDATE "TenantDatabase" SET "connectionString"=$1, "directUrl"=$2, "databaseName"='tenant_demo', "isActive"=true, "updatedAt"=NOW() WHERE "tenantId"=$3`,
      [connString, directUrl, id]
    );
    console.log('TenantDatabase row updated -> tenant_demo');
  } else {
    await c.query(
      `INSERT INTO "TenantDatabase" (id, "tenantId", "connectionString", "directUrl", "databaseName", "isActive", "provisionedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'tenant_demo', true, NOW(), NOW())`,
      [`td-${id}`, id, connString, directUrl]
    );
    console.log('TenantDatabase row created -> tenant_demo');
  }

  // Confirm
  const check = await c.query(
    `SELECT t.slug, t.name, t.status, td."databaseName", td."isActive" FROM "Tenant" t LEFT JOIN "TenantDatabase" td ON td."tenantId"=t.id WHERE t.slug='demo'`
  );
  console.log('VERIFY:', JSON.stringify(check.rows[0]));
  await c.end();
}
main().catch(e => { console.error('REGISTER FAILED:', e.message); process.exit(1); });
