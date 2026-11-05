#!/usr/bin/env node
/* Task 158 — probe the live e-timeoffice API around the stuck checkpoint.
 * 1. Shows max stored source-record IDs in the tenant DB vs checkpoint.
 * 2. Calls DownloadLastPunchData at the CURRENT checkpoint and at a rewound
 *    cursor to see whether punches after 23 Oct exist upstream. */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

const env = {};
for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PLATFORM = env.DATABASE_URL;

async function main() {
  // ── 1) DB-side record ID audit ──
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const db = neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);

  const ids = await db.query(`
    SELECT MAX(("rawPayload"->>'ID')::bigint)::bigint AS max_id,
           MIN(("rawPayload"->>'ID')::bigint)::bigint AS min_id,
           COUNT(*)::int AS n
    FROM "BiometricPunch" WHERE "rawPayload"->>'integration' = 'etimeoffice'`);
  console.log('STORED etimeoffice punches: min ID =', ids[0].min_id, ' max ID =', ids[0].max_id, ' count =', ids[0].n);

  const recent = await db.query(`
    SELECT ("rawPayload"->>'ID')::bigint AS rid, "punchTime", "rawPayload"->>'Empcode' AS emp, "punchType", "createdAt"
    FROM "BiometricPunch" WHERE "rawPayload"->>'integration' = 'etimeoffice'
    ORDER BY ("rawPayload"->>'ID')::bigint DESC LIMIT 12`);
  console.log('LATEST STORED RECORDS (by source ID):');
  for (const r of recent) console.log(`  ID=${r.rid}  punch=${new Date(r.punchTime).toISOString()}  emp=${r.emp}  ${r.punchType}  created=${new Date(r.createdAt).toISOString()}`);

  // Gap check: any missing IDs between max stored and checkpoint 1241?
  const checkpoint = 1241;
  const storedMax = Number(ids[0].max_id);
  console.log(`CHECKPOINT ID = ${checkpoint}, STORED MAX ID = ${storedMax}, GAP = ${checkpoint - storedMax} records never imported`);

  const gaps = await db.query(`
    WITH seq AS (SELECT generate_series(${storedMax + 1}, ${checkpoint}) AS id)
    SELECT COUNT(*)::int AS missing FROM seq
    WHERE NOT EXISTS (SELECT 1 FROM "BiometricPunch" bp WHERE (bp."rawPayload"->>'ID')::bigint = seq.id)`);
  console.log('IDs in (storedMax, checkpoint] with NO stored row:', gaps[0].missing);

  // ── 2) Live API probe ──
  const baseUrl = (env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
  const raw = `${env.ETIMEOFFICE_CORPORATE_ID}:${env.ETIMEOFFICE_USERNAME}:${env.ETIMEOFFICE_PASSWORD}:true`;
  const authorization = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  const empCode = env.ETIMEOFFICE_EMP_CODE?.trim() || 'ALL';

  async function probe(label, lastRecord) {
    const url = new URL(`${baseUrl}/DownloadLastPunchData`);
    url.searchParams.set('Empcode', empCode);
    url.searchParams.set('LastRecord', lastRecord);
    try {
      const res = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const body = await res.json().catch(() => null);
      if (!body) { console.log(`${label}: HTTP ${res.status}, body not JSON`); return; }
      const rows = Array.isArray(body.PunchData) ? body.PunchData : [];
      console.log(`${label}: MaxRecord=${body.MaxRecord} rows=${rows.length}${rows.length ? ' first=' + JSON.stringify(rows[0]) + ' last=' + JSON.stringify(rows[rows.length - 1]) : ''}`);
      return rows;
    } catch (e) {
      console.log(`${label}: FAILED ${e.message}`);
    }
  }

  const current = env.ETIMEOFFICE_LAST_RECORD?.trim() || '102026$1241';
  console.log('\nPROBE at CURRENT checkpoint:', current);
  await probe('  current', current.replace('\\$', '$'));

  // Rewind probes — walk back through stored-max boundaries
  const storedMaxId = Number(ids[0].max_id);
  console.log('\nPROBE rewound to stored-max boundary 102026$' + storedMaxId);
  await probe('  rewind-max', `102026$${storedMaxId}`);

  // Try fetching around 23 Oct: the stored rows near 23 Oct
  const oct23 = await db.query(`
    SELECT MIN(("rawPayload"->>'ID')::bigint)::bigint AS min_id, MAX(("rawPayload"->>'ID')::bigint)::bigint AS max_id
    FROM "BiometricPunch"
    WHERE "rawPayload"->>'integration' = 'etimeoffice' AND "punchTime" >= '2026-10-23' AND "punchTime" < '2026-10-24'`);
  if (oct23[0].min_id) {
    const from = Number(oct23[0].min_id) - 1;
    console.log(`\nPROBE rewound to just before 23-Oct first record (102026$${from})`);
    const rows = await probe('  rewind-23oct', `102026$${from}`);
    if (rows && rows.length) {
      const byDay = {};
      for (const r of rows) {
        const d = String(r.PunchDate || '').slice(0, 10);
        byDay[d] = (byDay[d] || 0) + 1;
      }
      console.log('  upstream rows by PunchDate:', JSON.stringify(byDay));
    }
  }
}
main().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
