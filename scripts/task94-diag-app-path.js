/** Task 94 — A) platform DB recency check  B) replicate app's getDbForTenant path via PrismaNeon+pooler */
const { Client } = require('pg');
const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';

async function main() {
  // A. platform DB activity recency
  const p = new Client({ host: HOST, user: 'neondb_owner', password: 'npg_pxZd8woKe4WB', database: 'neondb', ssl: { rejectUnauthorized: false } });
  await p.connect();
  const su = await p.query(`SELECT email, "lastLogin" FROM "User" WHERE email='superadmin@3boxeshrms.com'`);
  console.log('A1 superadmin lastLogin:', su.rows[0]?.lastLogin);
  const tr = await p.query(`SELECT count(*)::int n, max("createdAt") latest FROM "TrialRegistration"`);
  console.log('A2 TrialRegistration:', JSON.stringify(tr.rows[0]));
  const la = await p.query(`SELECT max("createdAt") latest FROM "LoginActivity"`);
  console.log('A3 LoginActivity latest:', la.rows[0]?.latest);
  const au = await p.query(`SELECT max("createdAt") latest FROM "AuditLog"`);
  console.log('A4 AuditLog latest:', au.rows[0]?.latest);
  await p.end();

  // B. replicate app path: PrismaNeon + POOLER string -> tenant_demo user lookup
  const { PrismaClient } = require('/home/z/my-project/src/generated/prisma/client');
  const { PrismaNeon } = require('/home/z/my-project/node_modules/@prisma/adapter-neon/dist/index.js');
  const cs = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require&connect_timeout=10';
  const adapter = new PrismaNeon({ connectionString: cs });
  const db = new PrismaClient({ adapter });
  const u = await db.user.findUnique({ where: { email: 'admin@demo.3boxeshrms.com' }, select: { id: true, email: true, role: true, status: true } });
  console.log('B PrismaNeon+pooler user lookup:', JSON.stringify(u));
  const cnt = await db.employee.count();
  console.log('B employee.count via app path:', cnt);
  await db.$disconnect();
}
main().catch(e => { console.error('CHECK FAILED:', e.message); process.exit(1); });
