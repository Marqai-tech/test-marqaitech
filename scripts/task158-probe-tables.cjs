#!/usr/bin/env node
/* Task 158 — probe OTHER month tables (072026, 082026, 092026, 102025, 112026)
 * to test the "device clock slipped / writing to an old month table" theory. */
const fs = require('node:fs');
const env = {};
for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const baseUrl = (env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
const raw = `${env.ETIMEOFFICE_CORPORATE_ID}:${env.ETIMEOFFICE_USERNAME}:${env.ETIMEOFFICE_PASSWORD}:true`;
const authorization = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;

async function call(label, lastRecord) {
  const url = new URL(`${baseUrl}/DownloadLastPunchData`);
  url.searchParams.set('Empcode', 'ALL');
  url.searchParams.set('LastRecord', lastRecord);
  try {
    const res = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => null);
    if (body?.PunchData) {
      const rows = body.PunchData;
      const span = rows.length ? ` first=${rows[0].PunchDate}/${rows[0].Empcode}/${rows[0].Table} last=${rows[rows.length - 1].PunchDate}/${rows[rows.length - 1].Empcode}/${rows[rows.length - 1].Table}` : '';
      console.log(`${label}: MaxRecord=${body.MaxRecord} rows=${rows.length}${span}`);
      if (rows.length > 6) console.log(`   (showing first/last of ${rows.length})`);
    } else {
      console.log(`${label}: ${JSON.stringify(body).slice(0, 160)}`);
    }
  } catch (e) { console.log(`${label}: FAILED ${e.message}`); }
}

async function main() {
  // July table beyond the last known July record (2434) — are NEW punches landing there?
  await call('072026 from $2434 (new July-table rows?)', '072026$2434');
  await call('072026 from $3000', '072026$3000');
  // Other month tables from zero
  await call('082026 from $0', '082026$0');
  await call('092026 from $0', '092026$0');
  await call('102025 from $0 (wrong-year table?)', '102025$0');
  await call('092025 from $0', '092025$0');
}
main().catch((e) => { console.error('PROBE3 FAILED:', e.message); process.exit(1); });
