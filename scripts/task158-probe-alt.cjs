#!/usr/bin/env node
/* Task 158 — exhaustive upstream probe: alternate endpoints + per-employee,
 * to prove whether e-timeoffice holds ANY punches after 23 Oct 14:40 IST. */
const fs = require('node:fs');
const env = {};
for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const baseUrl = (env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
const raw = `${env.ETIMEOFFICE_CORPORATE_ID}:${env.ETIMEOFFICE_USERNAME}:${env.ETIMEOFFICE_PASSWORD}:true`;
const authorization = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;

async function call(label, path, params) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => null);
    if (!body) { console.log(`${label}: HTTP ${res.status} non-JSON`); return null; }
    const rows = Array.isArray(body.PunchData) ? body.PunchData : null;
    if (rows) {
      console.log(`${label}: MaxRecord=${body.MaxRecord} rows=${rows.length}${rows.length ? ` first=${rows[0].PunchDate}/${rows[0].Empcode} last=${rows[rows.length - 1].PunchDate}/${rows[rows.length - 1].Empcode}` : ''}`);
    } else {
      console.log(`${label}: HTTP ${res.status} keys=${Object.keys(body).join(',')} ${JSON.stringify(body).slice(0, 140)}`);
    }
    return body;
  } catch (e) {
    console.log(`${label}: FAILED ${e.message}`);
    return null;
  }
}

async function main() {
  // 1) Current checkpoint per-employee probes (does ANY emp have rows after 1241?)
  for (const emp of ['006', '004', '011', 'ALL']) {
    await call(`DownloadLastPunchData Emp=${emp} from=102026$1241`, '/DownloadLastPunchData', { Empcode: emp, LastRecord: '102026$1241' });
  }
  // 2) Far-future cursor sanity
  await call('DownloadLastPunchData Emp=ALL from=102026$99999', '/DownloadLastPunchData', { Empcode: 'ALL', LastRecord: '102026$99999' });
  // 3) Alternate endpoint names (punch-by-date guesses)
  for (const ep of ['/DownloadPunchData', '/GetPunchData', '/PunchData', '/DownloadAttendance', '/GetLastPunchData', '/DownloadPunchLog']) {
    await call(`ALT ${ep} (from/to Oct 23-27)`, ep, { FromDate: '23/10/2026', ToDate: '27/10/2026', Empcode: 'ALL' });
  }
  // 4) Table name probe — maybe a NEW month table already exists (e.g. 112026)
  await call('DownloadLastPunchData LastRecord=112026$0', '/DownloadLastPunchData', { Empcode: 'ALL', LastRecord: '112026$0' });
}
main().catch((e) => { console.error('PROBE2 FAILED:', e.message); process.exit(1); });
