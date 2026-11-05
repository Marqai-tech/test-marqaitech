const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  // users and their notification counts by category
  const perUser = await c.query(`
    SELECT u.email, u.role, u.status,
           count(n.id) FILTER (WHERE n.category='auth') AS auth_n,
           count(n.id) FILTER (WHERE n.category<>'auth') AS module_n,
           max(n."createdAt") AS last_any
    FROM "User" u LEFT JOIN "Notification" n ON n."userId" = u.id
    GROUP BY u.id, u.email, u.role, u.status
    HAVING count(n.id) > 0
    ORDER BY module_n DESC`);
  console.log('=== Per-user: auth vs module notifications (demo) ===');
  console.table(perUser.rows);
  // The bell's actual view: latest 20 overall (as the API returns per user)
  const users = await c.query(`SELECT id, email FROM "User" WHERE status='active' ORDER BY "createdAt" LIMIT 5`);
  for (const u of users.rows) {
    const latest = await c.query(`SELECT category, type, title, "createdAt" FROM "Notification" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 20`, [u.id]);
    const cats = {};
    latest.rows.forEach(r => { cats[r.category] = (cats[r.category]||0)+1; });
    console.log(`--- ${u.email}: latest-20 mix:`, JSON.stringify(cats));
  }
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
