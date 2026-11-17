/* Task 166 — post-deploy verification.
 * 1) All three domains reachable
 * 2) New bundle carries the Present/Absent-only checkbox marker
 * 3) Production flags verified: MARQ004 presentAbsentOnly='true', her late/half_day rows now present,
 *    Madhuri/Suresh Task-164 mappings intact
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const DOMAINS = [
  'https://marqaitechgroup.3boxeshrms.com',
  'https://nexus-hrms-demo.vercel.app',
  'https://3boxeshrms.com',
];

function makeClient(url: string) {
  const clean = url.replace(/([?&])channel_binding=[^&]*&?/, '$1');
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: clean }) });
}

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  ok ? pass++ : fail++;
};

async function main() {
  // 1) Domains
  for (const d of DOMAINS) {
    try {
      const res = await fetch(d, { signal: AbortSignal.timeout(20000) });
      check(`domain ${d}`, res.ok, `HTTP ${res.status}`);
    } catch (e) {
      check(`domain ${d}`, false, (e as Error).message.slice(0, 80));
    }
  }

  // 2) Bundle marker on the employees page (Present / Absent only checkbox)
  const marker = 'Present+%2FAbsent+only' ;
  const marker2 = 'Present / Absent only';
  let bundleFound = false;
  try {
    const home = await fetch('https://marqaitechgroup.3boxeshrms.com/employees', { signal: AbortSignal.timeout(20000) });
    const html = await home.text();
    const chunks = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]);
    const unique = [...new Set(chunks)].slice(-60);
    for (const c of unique) {
      const u = c.startsWith('http') ? c : `https://marqaitechgroup.3boxeshrms.com${c}`;
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!r?.ok) continue;
      const body = await r.text();
      if (body.includes(decodeURIComponent(marker)) || body.includes(marker2) || body.includes('presentAbsentOnly')) { bundleFound = true; break; }
    }
  } catch { /* handled below */ }
  check('employees chunk carries Present/Absent-only marker', bundleFound);

  // 3) Production data
  const platform = makeClient(process.env.DATABASE_URL!);
  const rec = await platform.tenantDatabase.findFirst({
    where: { tenant: { slug: 'marqaitechgroup' }, isActive: true },
    select: { connectionString: true },
  });
  const db = makeClient(rec!.connectionString);

  const flags = await db.$queryRawUnsafe(
    `SELECT "employeeId", "presentAbsentOnly", "autoPresentAllDays", "biometricId" FROM "Employee" WHERE "employeeId" IN ('MARQ004','MARQ007','MARQ008')`,
  ) as Array<Record<string, string>>;
  const f = Object.fromEntries(flags.map((r) => [r.employeeId, r]));
  check('MARQ004 flagged presentAbsentOnly=true', f.MARQ004?.presentAbsentOnly === 'true');
  check('MARQ007 biometric 2 + auto-present intact', f.MARQ007?.biometricId === '2' && f.MARQ007?.autoPresentAllDays === 'true');
  check('MARQ008 biometric 007 intact', f.MARQ008?.biometricId === '007');

  const shardha = await db.$queryRawUnsafe(`SELECT id FROM "Employee" WHERE "employeeId"='MARQ004'`) as Array<{ id: string }>;
  const bad = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "Attendance" WHERE "employeeId"=$1 AND status IN ('late','half_day')`,
    shardha[0].id,
  ) as Array<{ n: number }>;
  check('MARQ004 has zero late/half_day rows', bad[0]?.n === 0, `remaining=${bad[0]?.n}`);

  const present = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "Attendance" WHERE "employeeId"=$1 AND notes LIKE '%present/absent-only salary mode%'`,
    shardha[0].id,
  ) as Array<{ n: number }>;
  check('MARQ004 flipped rows carry the Task 166 note', (present[0]?.n || 0) >= 17, `noted=${present[0]?.n}`);

  await db.$disconnect();
  await platform.$disconnect();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
