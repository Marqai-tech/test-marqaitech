/* Task 166 — production data fix: Shardha (MARQ004) present/absent-only salary mode.
 * 1) Ensure the runtime column (idempotent)
 * 2) Flag MARQ004 presentAbsentOnly='true'
 * 3) Update her existing late/half_day attendance rows → present (timing not
 *    mandatory for salary); absent rows stay absent. Read-only audit printed. */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

function makeClient(url: string) {
  const clean = url.replace(/([?&])channel_binding=[^&]*&?/, '$1');
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: clean }) });
}

async function main() {
  const platform = makeClient(process.env.DATABASE_URL!);
  const rec = await platform.tenantDatabase.findFirst({
    where: { tenant: { slug: 'marqaitechgroup' }, isActive: true },
    select: { connectionString: true },
  });
  const db = makeClient(rec!.connectionString);

  // 1) Column (idempotent)
  await db.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "presentAbsentOnly" TEXT`);
  console.log('column ensured: Employee.presentAbsentOnly');

  // 2) Flag the employee
  const emp = await db.$queryRawUnsafe(
    `UPDATE "Employee" SET "presentAbsentOnly" = 'true' WHERE "employeeId" = 'MARQ004' RETURNING id, "firstName", "lastName"`,
  ) as Array<{ id: string; firstName: string; lastName: string }>;
  console.log('flagged:', JSON.stringify(emp));

  const id = emp[0]?.id;
  if (!id) throw new Error('MARQ004 not found');

  // Audit before
  const rows = await db.$queryRawUnsafe(
    `SELECT to_char("date", 'YYYY-MM-DD') AS day, status, "checkIn"::text, "checkOut"::text, notes
       FROM "Attendance" WHERE "employeeId" = $1 AND status IN ('late','half_day') ORDER BY "date"`,
    id,
  ) as Array<{ day: string; status: string; checkIn: string | null; checkOut: string | null; notes: string | null }>;
  console.log(`late/half_day rows for MARQ004: ${rows.length}`);
  rows.forEach((r) => console.log(JSON.stringify(r)));

  // 3) Flip them to present
  const updated = await db.$executeRawUnsafe(
    `UPDATE "Attendance" SET status = 'present',
        notes = COALESCE(notes || ' | ', '') || 'Present (present/absent-only salary mode — punch timing not mandatory, Task 166)'
      WHERE "employeeId" = $1 AND status IN ('late','half_day')`,
    id,
  );
  console.log(`rows updated late/half_day -> present: ${updated}`);

  // Verify Suresh's flag state (from Task 164) untouched
  const suresh = await db.$queryRawUnsafe(
    `SELECT "employeeId", "autoPresentAllDays", "biometricId" FROM "Employee" WHERE "employeeId" IN ('MARQ007','MARQ008')`,
  ) as Array<Record<string, string>>;
  console.log('peer flags (unchanged):', JSON.stringify(suresh));

  await db.$disconnect();
  await platform.$disconnect();
}
main().catch((e) => { console.error('DATA FIX FAILED:', e.message); process.exit(1); });
