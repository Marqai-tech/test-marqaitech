// Task 127 — fix wrong punches displayed on Wed 21 Oct 2026 (Dussehra holiday)
//
// ROOT CAUSE: the Task 126 backfill wrote Attendance.date with the
// "IST-midnight-as-UTC" convention (T18:30 of the previous UTC day) while the
// live sync / seed / UI all use naive UTC midnight (T00:00). The UI renders
// the raw date, so every backfill row displayed ONE DAY EARLY — the Oct 22
// morning punches appeared as "Wed 21 Oct" punches (on a holiday).
//
// FIX (data-level, idempotent):
//   1. Add the missing Oct 21 2026 Dussehra holiday (user-confirmed) for the
//      same companies that already carry the Oct 20 DUSSEHRA entry.
//   2. Dedupe (employeeId, date+330min) groups — keep the most accurate row:
//        - past days  → the backfill row (finalized classification)
//        - today      → the live-sync row (it stays the sync's upsert target)
//        - fake auto-present rows (in=04:00Z & out=13:00Z) always lose to
//          rows with real punches
//      patching any missing check-in/out fields from the loser first.
//   3. Normalize every remaining T18:30 row → +330 min (T00:00 convention).
//   4. Rebuild Oct 20 + Oct 21 (holiday dates): drop all junk rows (absent
//      derives, fake auto-present) and create clean status='holiday' rows.
//
// READ-mostly-safe: prints a full before/after audit. Run: node scripts/task127-fix-attendance.cjs
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';
if (!PLATFORM) { console.error('DATABASE_URL missing'); process.exit(1); }

const TODAY = new Date().toISOString().slice(0, 10);
const isFakeAuto = (r) =>
  r.checkIn && r.checkOut &&
  new Date(r.checkIn).toISOString() === `${r.date.toISOString().slice(0, 10)}T04:00:00.000Z` &&
  new Date(r.checkOut).toISOString() === `${r.date.toISOString().slice(0, 10)}T13:00:00.000Z`;
const hasReal = (r) => r.checkIn && !isFakeAuto(r);
// Keeper scoring — context-aware:
//   today     → the live-sync (00:00) row wins (it stays the sync's upsert target)
//   past days → the backfill row wins among real rows (it classified with the
//               COMPLETE day's punches + the finalized half-day rule)
function scoreRow(r, isToday = false) {
  let s = 0;
  if (hasReal(r)) s += 100;
  const isMidnight = r.date.getTime() % 86400000 === 0;
  if (isMidnight === isToday) s += 50;
  s -= new Date(r.createdAt).getTime() / 1e12; // older wins ties
  return s;
}

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const marqai = tenants.find((t) => /marqai/i.test(t.slug));
  const db = neon(marqai.cs);
  console.log('tenant:', marqai.slug, '| today:', TODAY);

  // ── 1. Oct 21 Dussehra holiday for the companies that have Oct 20 ──
  const oct20 = await db.query(`SELECT id, name, "companyId", type, country FROM "Holiday"
    WHERE date = '2026-10-20' AND name ILIKE '%DUSSEHRA%'`);
  let addedHol = 0;
  for (const h of oct20) {
    const exists = await db.query(
      `SELECT id FROM "Holiday" WHERE date = '2026-10-21' AND "companyId" = $1`, [h.companyId]);
    if (exists.length === 0) {
      await db.query(
        `INSERT INTO "Holiday" (id, name, date, type, country, description, "isOptional", "optionalQuota", "companyId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, '2026-10-21', $2, $3, $4, false, 0, $5, now(), now())`,
        ['DUSSEHRA (Extended Holiday)', h.type, h.country || 'India',
         'Extended Dussehra holiday — user-confirmed non-working day (Task 127)', h.companyId]);
      addedHol += 1;
    }
  }
  console.log(`holiday Oct 21 added for ${addedHol} company(ies)`);

  // ── 2. Dedupe (employeeId, normalized date) groups ──
  const shifted = await db.query(
    `SELECT id, "employeeId", date, "checkIn", "checkOut", status, "createdAt"
     FROM "Attendance" WHERE date::time = '18:30:00' ORDER BY "employeeId", date`);
  console.log(`18:30-style rows: ${shifted.length}`);

  let deleted = 0, patched = 0;
  const groups = new Map();
  for (const r of shifted) {
    const nd = new Date(r.date.getTime() + 330 * 60000);
    const key = `${r.employeeId}|${nd.toISOString()}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(r);
  }
  for (const [key, rows] of groups) {
    // counterparts: T00:00 rows on the normalized day
    const [empId, ndIso] = key.split('|');
    const ndDay = ndIso.slice(0, 10);
    const counterparts = await db.query(
      `SELECT id, "employeeId", date, "checkIn", "checkOut", status, "createdAt"
       FROM "Attendance" WHERE "employeeId" = $1 AND date >= $2 AND date < $3
       AND date::time = '00:00:00'`,
      [empId, `${ndDay} 00:00:00`, `${ndDay} 23:59:59`]);
    const all = [...rows, ...counterparts];
    if (all.length <= 1) continue;

    const isToday = ndDay === TODAY;
    all.sort((a, b) => scoreRow(b, isToday) - scoreRow(a, isToday));
    const keeper = all[0];
    const losers = all.slice(1);
    // Delete losers FIRST (the unique constraint would block a date-normalizing
    // patch while the counterpart row still exists).
    for (const l of losers) {
      await db.query(`DELETE FROM "Attendance" WHERE id = $1`, [l.id]);
      deleted += 1;
    }
    // Patch keeper fields that are missing + normalize its date bucket
    const patch = { date: `${ndDay} 00:00:00` };
    for (const l of losers) {
      if (!keeper.checkIn && l.checkIn) patch.checkIn = l.checkIn;
      if (!keeper.checkOut && l.checkOut) patch.checkOut = l.checkOut;
      if (hasReal(l) && isFakeAuto(keeper)) patch.status = l.status; // real classification wins over fake
    }
    const sets = Object.keys(patch).map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const vals = Object.values(patch).map((v) => (v instanceof Date ? v.toISOString() : v));
    await db.query(`UPDATE "Attendance" SET ${sets} WHERE id = $${vals.length + 1}`, [...vals, keeper.id]);
    patched += 1;
  }
  console.log(`dedupe: keepers patched+normalized = ${patched}, losers deleted = ${deleted}`);

  // ── 3. Normalize any remaining lone T18:30 rows ──
  const norm = await db.query(
    `UPDATE "Attendance" SET date = date + interval '330 minutes'
     WHERE date::time = '18:30:00' RETURNING id`);
  console.log(`normalized remaining 18:30 rows: ${norm.length}`);

  // ── 3b. Generic final dedupe sweep (idempotency — catches stragglers from
  // any partially-completed earlier run: same (employeeId, date) >1 row) ──
  const dupPairs = await db.query(
    `SELECT "employeeId", date::date AS d, count(*)::int AS n FROM "Attendance"
     GROUP BY 1, 2 HAVING count(*) > 1`);
  let sweepDeleted = 0;
  for (const p of dupPairs) {
    const grp = await db.query(
      `SELECT id, "employeeId", date, "checkIn", "checkOut", status, "createdAt"
       FROM "Attendance" WHERE "employeeId" = $1 AND date >= $2 AND date < $3`,
      [p.employeeId, `${p.d.toISOString?.() ?? p.d} 00:00:00`, `${p.d.toISOString?.() ?? p.d} 23:59:59`]);
    grp.sort((a, b) => scoreRow(b, p.d.toISOString().slice(0, 10) === TODAY) - scoreRow(a, p.d.toISOString().slice(0, 10) === TODAY));
    for (const l of grp.slice(1)) {
      await db.query(`DELETE FROM "Attendance" WHERE id = $1`, [l.id]);
      sweepDeleted += 1;
    }
  }
  console.log(`final dedupe sweep: ${dupPairs.length} groups, ${sweepDeleted} deleted`);

  // ── 4. Rebuild the two Dussehra holiday days (Oct 20 + Oct 21) ──
  const holEmps = await db.query(`
    SELECT e.id, e."companyId" FROM "Employee" e
    WHERE e.status = 'active' AND e."companyId" IN (
      SELECT DISTINCT "companyId" FROM "Holiday" WHERE date IN ('2026-10-20','2026-10-21'))`);
  const empById = new Map(holEmps.map((e) => [e.id, e]));
  const delHol = await db.query(
    `DELETE FROM "Attendance" WHERE date >= '2026-10-20' AND date < '2026-10-22' RETURNING id, "employeeId"`);
  console.log(`holiday-days junk rows deleted: ${delHol.length}`);
  let holRows = 0;
  for (const day of ['2026-10-20', '2026-10-21']) {
    for (const e of holEmps) {
      await db.query(
        `INSERT INTO "Attendance" (id, "employeeId", date, status, notes, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'holiday', $3, now(), now())
         ON CONFLICT ("employeeId", date) DO NOTHING`,
        [e.id, `${day} 00:00:00`, 'Dussehra holiday (Task 127)']);
      holRows += 1;
    }
  }
  console.log(`holiday rows created: ${holRows} (${holEmps.length} employees × 2 days)`);

  // ── 5. Verify ──
  const remain18 = await db.query(`SELECT count(*)::int AS n FROM "Attendance" WHERE date::time = '18:30:00'`);
  const dups = await db.query(`
    SELECT "employeeId", date::date, count(*)::int AS n FROM "Attendance"
    GROUP BY 1, 2 HAVING count(*) > 1 LIMIT 10`);
  const oct2122 = await db.query(`
    SELECT date::text, status, count(*)::int AS n, string_agg(DISTINCT a."checkIn"::text, ' | ') AS ins
    FROM "Attendance" a WHERE date >= '2026-10-20' AND date <= '2026-10-23'
    GROUP BY 1, 2 ORDER BY 1, 2`);
  console.log('\nVERIFY remaining 18:30 rows:', remain18[0].n, '| dup groups:', dups.length);
  for (const d of dups) console.log('  DUP!', d.employeeId, d.date, d.n);
  console.log('Oct 20-23 rows now:');
  for (const r of oct2122) console.log(`  ${r.date} ${r.status.padEnd(9)} n=${r.n} ${r.ins ? 'in=' + r.ins.slice(0, 80) : ''}`);

  // Sept LOP sanity per employee (absent + half*0.5 from deduped rows)
  const sept = await db.query(`
    SELECT e."employeeId" AS code,
           sum(CASE WHEN a.status='absent' THEN 1 ELSE 0 END)::float
         + sum(CASE WHEN a.status='half_day' THEN 0.5 ELSE 0 END)::float AS lop,
           count(*)::int AS rows
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE a.date >= '2026-09-01' AND a.date < '2026-10-01'
    GROUP BY 1 ORDER BY 1`);
  console.log('\nSeptember LOP (deduped rows):');
  for (const r of sept) console.log(`  ${r.code}: ${r.lop} LOP from ${r.rows} rows`);
}

main().catch((e) => { console.error(e); process.exit(1); });
