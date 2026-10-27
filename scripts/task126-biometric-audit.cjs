// Task 126 — biometric punch coverage vs attendance rows per employee/month.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const db = neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);

  // BiometricPunch columns
  const cols = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'BiometricPunch' ORDER BY ordinal_position`);
  console.log('BiometricPunch columns:', cols.map((c) => `${c.column_name}:${c.data_type}`).join(', '));

  const pcols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'PunchEvent' ORDER BY ordinal_position`);
  console.log('PunchEvent columns:', pcols.map((c) => c.column_name).join(', '));

  const total = await db.query(`SELECT count(*)::int AS n, min("punchTime") AS min, max("punchTime") AS max FROM "BiometricPunch"`).catch(async () => {
    return db.query(`SELECT count(*)::int AS n FROM "BiometricPunch"`);
  });
  console.log('BiometricPunch total:', JSON.stringify(total[0]));

  const emps = await db.query(`
    SELECT id, "firstName", "lastName", "employeeId" FROM "Employee"
    WHERE status = 'active' ORDER BY "firstName"`);
  for (const e of emps) {
    const name = `${e.firstName} ${e.lastName}`;
    const punches = await db.query(`
      SELECT date_part('month', "punchTime")::int AS m, count(*)::int AS n,
             count(DISTINCT date_trunc('day', "punchTime"))::int AS days
      FROM "BiometricPunch"
      WHERE "employeeId" = $1 AND "punchTime" >= '2026-05-01' AND "punchTime" < '2026-11-01'
      GROUP BY 1 ORDER BY 1`, [e.id]).catch(async (err) => {
      console.log(`  ${name}: punch query failed (${err.message.slice(0, 60)})`);
      return [];
    });
    const pe = await db.query(`
      SELECT date_part('month', "createdAt")::int AS m, count(*)::int AS n
      FROM "PunchEvent" WHERE "employeeId" = $1 AND "createdAt" >= '2026-05-01' AND "createdAt" < '2026-11-01'
      GROUP BY 1 ORDER BY 1`).catch(() => []);
    console.log(`${name.padEnd(26)} biometric: ${punches.map((p) => `${p.m}:${p.n} punches/${p.days}d`).join(' ') || '—'} | punchEvents: ${pe.map((p) => `${p.m}:${p.n}`).join(' ') || '—'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
