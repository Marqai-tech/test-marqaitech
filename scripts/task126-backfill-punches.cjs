// Task 126 — LOCAL biometric backfill: import the Team Office punch history
// (Feb→Oct 2026) that the production sync skipped (its checkpoint was seeded
// mid-October). Replicates src/lib/etimeoffice-sync.ts semantics EXACTLY:
//   • dedupe by vendor recordKey (Table:ID) within the device + time range
//   • employee matching: ETIMEOFFICE_EMPLOYEE_MAP then MARQ<pad3> fallback
//   • PunchEvent per accepted punch + BiometricPunch raw row
//   • per-(employee, local-day) attendance upsert via classifyBiometricDay
//     (2-min dedupe, first punch = check_in, rest = check_out; late > 10:00;
//     half_day when finalized && workHours < 8 or 3+ previous lates;
//     workHours only when checkout >= 18:30 local; mandatory 60-min break)
// Then refreshes the checkpoint/status settings so the live sync continues.
// Idempotent: re-running skips already-imported record keys.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\\$/g, '$');
  }
  return env;
}
const env = loadEnv();

const TZ = env.ETIMEOFFICE_TIMEZONE || 'Asia/Kolkata';
const TZ_OFFSET_MIN = 330; // Asia/Kolkata (no DST)
const BREAK = { start: 810, end: 870, duration: 60, mandatory: true, shiftEnd: 1110 }; // marqaitechgroup_only policy row

const envLine = env.DATABASE_URL;
if (!envLine) { console.error('DATABASE_URL missing'); process.exit(1); }

function localDayStartUtc(punchTime) {
  // local midnight IST for the punch's local day, expressed as UTC instant
  const localMs = punchTime.getTime() + TZ_OFFSET_MIN * 60_000;
  const localMidnight = Math.floor(localMs / 86_400_000) * 86_400_000;
  return new Date(localMidnight - TZ_OFFSET_MIN * 60_000);
}
function localMinutes(value) {
  const localMs = value.getTime() + TZ_OFFSET_MIN * 60_000;
  const mins = Math.floor((localMs % 86_400_000) / 60_000);
  return mins;
}
function localDateKey(value) {
  return new Date(value.getTime() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
function hrmsCode(empcode) {
  const normalized = String(empcode).trim();
  for (const entry of (env.ETIMEOFFICE_EMPLOYEE_MAP || '').split(',')) {
    const [d, e] = entry.split(':', 2).map((p) => p?.trim());
    if (d && e && d.toUpperCase() === normalized.toUpperCase()) return e.toUpperCase();
  }
  if (normalized.toUpperCase().startsWith('MARQ')) return normalized.toUpperCase();
  return `MARQ${normalized.padStart(3, '0')}`;
}
function recordKey(payload) {
  return payload && payload.ID !== undefined && payload.ID !== null
    ? `${String(payload.Table || '')}:${String(payload.ID)}` : null;
}

async function download(lastRecord) {
  const baseUrl = (env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
  const raw = `${env.ETIMEOFFICE_CORPORATE_ID}:${env.ETIMEOFFICE_USERNAME}:${env.ETIMEOFFICE_PASSWORD}:true`;
  const url = new URL(`${baseUrl}/DownloadLastPunchData`);
  url.searchParams.set('Empcode', env.ETIMEOFFICE_EMP_CODE || 'ALL');
  url.searchParams.set('LastRecord', lastRecord);
  const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.Error) throw new Error(body?.Msg || `HTTP ${res.status}`);
  if (!Array.isArray(body.PunchData)) throw new Error('unexpected response shape');
  return body;
}

function classifyDay(punches) {
  // classifyBiometricDay: 2-min dedupe window; first accepted = check_in; every later accepted = check_out
  const ordered = [...punches].sort((a, b) => a.punchTime - b.punchTime);
  const accepted = [];
  for (const p of ordered) {
    const prev = accepted[accepted.length - 1];
    if (prev && p.punchTime.getTime() - prev.punchTime.getTime() <= 2 * 60_000) continue;
    accepted.push(p);
  }
  const kinds = accepted.map((p, i) => ({ p, kind: i === 0 ? 'check_in' : 'check_out' }));
  return kinds;
}

async function main() {
  const platform = neon(envLine);
  const tenants = await platform.query(`
    SELECT t.id AS tenant_id, t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const t = tenants.find((x) => /marqai/i.test(x.slug));
  if (!t) throw new Error('tenant not found');
  const db = neon(t.cs);
  console.log('tenant:', t.slug);

  // 1. download the full backlog (Feb 2026 → now)
  const from = process.env.BACKFILL_CURSOR || '022026$1';
  console.log('downloading punches from cursor', from, '…');
  const body = await download(from);
  const parsed = body.PunchData
    .map((p) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(p.PunchDate || '').trim());
      if (!m) return null;
      const [, d, mo, y, h, mi, s = '0'] = m;
      const punchTime = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - TZ_OFFSET_MIN * 60_000);
      return { source: p, code: hrmsCode(p.Empcode), punchTime, key: recordKey(p) };
    })
    .filter(Boolean)
    .sort((a, b) => a.punchTime - b.punchTime);
  console.log(`downloaded ${parsed.length} punches (${parsed[0]?.punchTime?.toISOString()} → ${parsed[parsed.length - 1]?.punchTime?.toISOString()}), MaxRecord ${body.MaxRecord}`);

  // 2. resolve the integration device (created by ensureIntegrationDevice)
  const dev = await db.query(`SELECT id FROM "BiometricDevice" WHERE "serialNumber" = $1 LIMIT 1`, [env.ETIMEOFFICE_DEVICE_SERIAL || 'A230501663']);
  if (!dev[0]) throw new Error('integration device row not found');
  const DEVICE_ID = dev[0].id;
  const existing = await db.query(`
    SELECT "rawPayload" FROM "BiometricPunch"
    WHERE "deviceId" = $1 AND "punchTime" >= $2 AND "punchTime" <= $3`,
    [DEVICE_ID, parsed[0].punchTime, parsed[parsed.length - 1].punchTime]);
  const existingKeys = new Set(existing.map((r) => recordKey(r.rawPayload || {})).filter(Boolean));
  const toInsert = parsed.filter((p) => !existingKeys.has(p.key));
  console.log(`existing ${existing.length} rows → ${toInsert.length} new punches to import`);

  // 3. employee mapping (from ALL parsed punches — independent of dedupe)
  const allCodes = [...new Set(parsed.map((p) => p.code))];
  const emps2 = allCodes.length ? await db.query(`SELECT id, "employeeId" FROM "Employee" WHERE "employeeId" = ANY($1)`, [allCodes]) : [];
  const empMap = new Map(emps2.map((e) => [e.employeeId, e.id]));
  const matched = toInsert.filter((p) => empMap.has(p.code));
  const unmatched = toInsert.length - matched.length;
  // all employee-matched punches in the download (dedupe-independent) — used by
  // the recovery attendance pass and reporting
  const matchedAll = parsed.filter((p) => empMap.has(p.code));
  console.log(`employee match: ${matched.length} new matched, ${matchedAll.length} matched overall, ${unmatched} unmatched (codes: ${allCodes.filter((c) => !empMap.has(c)).join(', ') || '—'})`);

  // 4. insert punches + events (batched)
  let imported = 0;
  const inserted = []; // { id, employeeId, punchTime, dayStart }
  const CHUNK = 200;
  for (let i = 0; i < matched.length; i += CHUNK) {
    const slice = matched.slice(i, i + CHUNK);
    const bpValues = [];
    const peValues = [];
    slice.forEach((p, j) => {
      const dayStart = localDayStartUtc(p.punchTime);
      bpValues.push(`('bp_' || replace(gen_random_uuid()::text, '-', ''), '${DEVICE_ID}', '${empMap.get(p.code)}', 'punch', '${p.punchTime.toISOString()}', '${JSON.stringify({ ...p.source, integration: 'etimeoffice', sourceRecordKey: p.key }).replace(/'/g, "''")}'::jsonb, now())`);
      peValues.push(`('pe_' || replace(gen_random_uuid()::text, '-', ''), '${empMap.get(p.code)}', 'biometric', '${dayStart.toISOString()}', '${p.punchTime.toISOString()}', 'biometric', 'Imported from Team Office (${p.key}) [Task 126 backfill]', now())`);
      inserted.push({ employeeId: empMap.get(p.code), punchTime: p.punchTime, dayStart });
    });
    await db.query(`
      INSERT INTO "BiometricPunch" (id, "deviceId", "employeeId", "punchType", "punchTime", "rawPayload", "createdAt")
      VALUES ${bpValues.join(',')}`);
    await db.query(`
      INSERT INTO "PunchEvent" (id, "employeeId", type, date, timestamp, method, notes, "createdAt")
      VALUES ${peValues.join(',')}`);
    imported += slice.length;
    console.log(`  imported ${imported}/${matched.length}…`);
  }
  console.log(`imported ${imported} punches + ${imported} punch events`);

  // 4b. when nothing new imported (recovery run), rebuild day groups from ALL
  // matched punches in the window so the attendance pass still executes.
  if (imported === 0) {
    for (const p of matchedAll) {
      inserted.push({ employeeId: empMap.get(p.code), punchTime: p.punchTime, dayStart: localDayStartUtc(p.punchTime) });
    }
    console.log(`recovery mode: ${inserted.length} matched punches requeued for the attendance pass`);
  }

  // 5. day groups → attendance upserts (only days with NEW punches)
  const groups = new Map();
  for (const ev of inserted) {
    const k = `${ev.employeeId}|${ev.dayStart.toISOString()}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(ev);
  }
  console.log(`day groups: ${groups.size}`);
  let attCreated = 0, attUpdated = 0;
  const perEmpMonth = {};
  for (const [k, evs] of groups) {
    const [employeeId, dayIso] = k.split('|');
    const dayStart = new Date(dayIso);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    // ALL punches for this employee/day (existing + new), like the sync does
    const dayPunches = await db.query(`
      SELECT id, "punchTime" FROM "BiometricPunch"
      WHERE "deviceId" = $1 AND "employeeId" = $2 AND "punchTime" >= $3 AND "punchTime" < $4
      ORDER BY "punchTime" ASC, "createdAt" ASC`, [DEVICE_ID, employeeId, dayStart, dayEnd]);
    if (!dayPunches.length) continue;
    const kinds = classifyDay(dayPunches.map((r) => ({ id: r.id, punchTime: new Date(r.punchTime) })));
    const existingAtt = await db.query(`
      SELECT "checkIn", "checkOut", status, "punchMethod" FROM "Attendance"
      WHERE "employeeId" = $1 AND date = $2 LIMIT 1`, [employeeId, dayStart]);
    const prior = existingAtt[0] || null;
    const manualCheckIn = Boolean(prior?.checkIn && prior?.punchMethod !== 'biometric');
    let checkIn = null;
    if (prior?.checkIn) checkIn = new Date(prior.checkIn);
    else if (kinds[0]?.kind === 'check_in') checkIn = kinds[0].p.punchTime;
    const outs = kinds.filter((x) => x.kind === 'check_out');
    const candidateOut = outs.length ? outs[outs.length - 1].p.punchTime : null;
    let checkOut = candidateOut;
    if (prior?.checkOut && new Date(prior.checkOut) > candidateOut) checkOut = new Date(prior.checkOut);
    else if (!candidateOut && prior?.checkOut) checkOut = new Date(prior.checkOut);
    const breakMinutes = checkIn && checkOut && localMinutes(checkIn) < BREAK.end && localMinutes(checkOut) > BREAK.start
      ? BREAK.duration : (prior ? (prior.breakMinutes ?? 0) : 0);
    const canFinalize = Boolean(checkOut && localMinutes(checkOut) >= BREAK.shiftEnd);
    const workHours = canFinalize && checkIn && checkOut && checkOut > checkIn
      ? Number((Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60_000 - breakMinutes) / 60).toFixed(2)) : null;
    let status = prior?.status || 'present';
    if (checkIn) {
      const isLate = localMinutes(checkIn) > 600; // after 10:00
      const prevLates = await db.query(`
        SELECT count(*)::int AS n FROM "Attendance"
        WHERE "employeeId" = $1 AND date >= $2 AND date < $3
          AND "checkIn" IS NOT NULL AND "checkIn" < $4
          AND (date_part('hour', "checkIn" AT TIME ZONE 'Asia/Kolkata') > 10
               OR (date_part('hour', "checkIn" AT TIME ZONE 'Asia/Kolkata') = 10
                   AND date_part('minute', "checkIn" AT TIME ZONE 'Asia/Kolkata') > 0))`,
        [employeeId, new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1)), dayStart, checkIn]);
      status = (prior?.status === 'half_day' || (canFinalize && workHours !== null && workHours < 8) || (isLate && prevLates[0].n >= 3))
        ? 'half_day' : isLate ? 'late' : 'present';
    }
    if (prior) {
      await db.query(`
        UPDATE "Attendance" SET "checkIn" = $2, "checkOut" = COALESCE($3, "checkOut"),
          "workHours" = COALESCE($4, "workHours"), status = $5, "punchMethod" = 'biometric', "updatedAt" = now()
        WHERE "employeeId" = $1 AND date = $6`, [employeeId, checkIn, checkOut, workHours, status, dayStart]);
      attUpdated += 1;
    } else {
      await db.query(`
        INSERT INTO "Attendance" (id, "employeeId", date, "checkIn", "checkOut", status, "workHours", "breakMinutes", "punchMethod", notes, "createdAt", "updatedAt")
        VALUES ('att_' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, $6, $7, 'biometric', 'Team Office biometric sync (Task 126 backfill)', now(), now())`,
        [employeeId, dayStart, checkIn, checkOut, status, workHours, breakMinutes || null]);
      attCreated += 1;
    }
    const mk = `${employeeId}|${localDateKey(dayStart).slice(0, 7)}`;
    perEmpMonth[mk] = (perEmpMonth[mk] || 0) + 1;
  }
  console.log(`attendance: ${attCreated} created, ${attUpdated} updated`);
  for (const [k, n] of Object.entries(perEmpMonth).sort()) console.log('  ', k, '→', n, 'day(s)');

  // 6. refresh checkpoint + status settings (live sync stays seamless)
  const checkpoint = (await db.query(`SELECT value FROM "Setting" WHERE key = 'etimeoffice_biometric_last_record'`))[0]?.value;
  const target = checkpoint && checkpoint >= '102026$1130' ? checkpoint : '102026$1130';
  await db.query(`
    UPDATE "Setting" SET value = $1::text WHERE key = 'etimeoffice_biometric_last_record'`, [target]);
  await db.query(`
    UPDATE "Setting" SET value = $1::jsonb WHERE key = 'etimeoffice_biometric_sync_status'`, [
    JSON.stringify({ state: 'success', lastSyncAt: new Date().toISOString(), imported: 0, matched: 0, unmatched: 0, duplicatesSkipped: 0, lastRecord: target, device: 'BIO-PARK D01 (Team Office)', note: 'Task 126 historical backfill applied locally' })]);
  console.log('checkpoint remains', target);
}
main().catch((e) => { console.error(e); process.exit(1); });
