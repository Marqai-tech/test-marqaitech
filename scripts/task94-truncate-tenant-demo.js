/** Task 94 — truncate ALL tables in tenant_demo (fast cleanup between seed attempts). */
const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require' });
  await c.connect();
  await c.query(`DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;`);
  const t = await c.query(`SELECT count(*)::int n FROM "Company"`);
  const u = await c.query(`SELECT count(*)::int n FROM "User"`);
  console.log(`tenant_demo truncated — Company: ${t.rows[0].n}, User: ${u.rows[0].n}`);
  await c.end();
}
main().catch(e => { console.error('TRUNCATE FAILED:', e.message); process.exit(1); });
