// Task 126 — PROBE the Team Office API with a rewound cursor (September 2026)
// to see whether punch history before Oct 8 still exists. READ-ONLY probe.
const fs = require('node:fs');
const env = {};
for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
  const m = /^(ETIMEOFFICE_[A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\\$/g, '$');
}

const baseUrl = (env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
const raw = `${env.ETIMEOFFICE_CORPORATE_ID}:${env.ETIMEOFFICE_USERNAME}:${env.ETIMEOFFICE_PASSWORD}:true`;
const authorization = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;

async function probe(lastRecord) {
  const url = new URL(`${baseUrl}/DownloadLastPunchData`);
  url.searchParams.set('Empcode', env.ETIMEOFFICE_EMP_CODE || 'ALL');
  url.searchParams.set('LastRecord', lastRecord);
  const res = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.Error) return { status: res.status, error: body?.Msg || `HTTP ${res.status}` };
  const punches = Array.isArray(body.PunchData) ? body.PunchData : [];
  const dates = punches.map((p) => p.PunchDate).sort();
  return {
    maxRecord: body.MaxRecord,
    count: punches.length,
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
    sample: punches.slice(0, 3).map((p) => `${p.Empcode} ${p.PunchDate} ID=${p.ID} Table=${p.Table}`),
  };
}

(async () => {
  console.log('PROBE Sept 2026 cursor 092026$1 …');
  console.log(JSON.stringify(await probe('092026$1'), null, 1));
  console.log('\nPROBE May 2026 cursor 052026$1 …');
  console.log(JSON.stringify(await probe('052026$1'), null, 1));
})().catch((e) => { console.error('probe failed:', e.message); process.exit(1); });
