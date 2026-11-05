/** Task 94 — replicate the app's getDbForTenant path: PrismaNeon + POOLER string -> tenant_demo */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

async function main() {
  const cs = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require&connect_timeout=10';
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: cs }) });
  const u = await db.user.findUnique({ where: { email: 'admin@demo.3boxeshrms.com' }, select: { id: true, email: true, role: true, status: true } });
  console.log('B PrismaNeon+pooler user lookup:', JSON.stringify(u));
  console.log('B employee.count via app path:', await db.employee.count());
  await db.$disconnect();
}
main().catch(e => { console.error('B FAILED:', e.message); process.exit(1); });
