/* Reproduce the deployed /api/birthdays 500 locally against the PRODUCTION
 * tenant DB — runs the exact route logic (ensureBirthdayTables + findMany +
 * greeting query) with the local Prisma client. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { neon } = require('@neondatabase/serverless');
const path = require('path');
process.env.DATABASE_URL = process.env.DATABASE_URL || '';

async function main() {
  // resolve tenant DB like the runtime does
  const plat = neon(process.env.DATABASE_URL);
  const trow = await plat`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup' LIMIT 1`;
  const cs = trow[0].cs;
  console.log('tenant cs prefix:', String(cs).slice(0, 30));

  const { PrismaClient } = await import('./../src/generated/prisma/client.ts');
  const { PrismaNeon } = await import('@prisma/adapter-neon');
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: cs }) });
  try {
    console.log('1) plain findMany (no new field):',
      (await db.employee.findMany({ where: { status: 'active' }, select: { id: true }, take: 1 })).length);
  } catch (e) { console.log('1) FAILED:', e.message.slice(0, 200)); }
  try {
    console.log('2) findMany originalBirthday not null:',
      (await db.employee.findMany({ where: { status: 'active', originalBirthday: { not: null } }, select: { id: true, originalBirthday: true }, take: 3 })).length);
  } catch (e) { console.log('2) FAILED:', e.message.slice(0, 300)); }
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BirthdayGreeting" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "year" INTEGER NOT NULL, "source" TEXT NOT NULL DEFAULT 'manual', "senderUserId" TEXT, "senderName" TEXT, "message" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id"))`);
    console.log('3) DDL ok');
  } catch (e) { console.log('3) FAILED:', e.message.slice(0, 200)); }
  try {
    console.log('4) birthdayGreeting.findMany:', (await db.birthdayGreeting.findMany({ take: 1 })).length);
  } catch (e) { console.log('4) FAILED:', e.message.slice(0, 300)); }
  await db.$disconnect();
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
