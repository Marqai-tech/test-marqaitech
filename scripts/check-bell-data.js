const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  const byCat = await c.query(`SELECT category, type, count(*)::int AS n FROM "Notification" GROUP BY 1,2 ORDER BY n DESC`);
  console.log('=== Notification rows by category/type ===');
  console.table(byCat.rows);
  // find the template table's real column names
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='NotificationTemplate' ORDER BY ordinal_position`);
  console.log('NotificationTemplate columns:', cols.rows.map(r => r.column_name).join(', '));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
