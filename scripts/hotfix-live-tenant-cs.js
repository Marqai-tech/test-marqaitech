/**
 * Task 78 HOTFIX — correct the marqaitechgroup registry connection string.
 * The previous script built an invalid host (...-us-east-1-pooler.aws.neon.tech).
 * Correct Neon pooler pattern (same as demo): endpoint-pooler.region.aws.neon.tech
 * -> ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech
 */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const CORRECT_HOST = 'ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech';

async function main() {
  const platformSql = neon(PLATFORM);
  const rows = await platformSql.query(`
    SELECT td.id, td."connectionString" AS cs, td."directUrl" AS du, t.slug
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup'`);
  const r = rows[0];
  if (!r) { console.log('marqaitechgroup registry row not found!'); process.exit(1); }

  // recover credentials from whatever string is stored (broken or not)
  const u = new URL(r.cs);
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, '');
  const fixed = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${CORRECT_HOST}/${db}?sslmode=require&connect_timeout=10`;

  // verify BEFORE saving: connect with the fixed string
  const test = neon(fixed);
  const n = await test.query(`SELECT COUNT(*)::int AS n FROM "Employee"`);
  console.log(`[hotfix] pre-save verify OK — Employee rows = ${n[0].n}`);

  await platformSql.query(
    `UPDATE "TenantDatabase" SET "connectionString" = $1, "directUrl" = $2 WHERE id = $3`,
    [fixed, fixed, r.id]
  );
  const masked = fixed.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  console.log(`[hotfix] registry saved -> ${masked}`);
}

main().catch(e => { console.error('[hotfix] FAILED:', e.message.split('\n')[0]); process.exit(1); });
