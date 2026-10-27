import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { downloadLatestPunches, hrmsEmployeeCode, type ETimeOfficePunch } from '@/lib/etimeoffice-client';
import { classifyBiometricDay } from '@/lib/etimeoffice-attendance';
import { localDayStartFor } from '@/lib/timezone-utils';
import { pickBestAttendanceRow } from '@/lib/attendance-day';
import { effectiveBreakMinutes, loadAttendanceBreakPolicy } from '@/lib/attendance-break-rules';
import { loadEmployeeShiftWindows, shiftFullDayHours, type EmployeeShiftWindow } from '@/lib/attendance-shift';

const CHECKPOINT_KEY = 'etimeoffice_biometric_last_record';
const STATUS_KEY = 'etimeoffice_biometric_sync_status';
const MAP_KEY = 'etimeoffice_employee_code_map';
const CATEGORY = 'integration';
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

type DbLike = PrismaClient | Prisma.TransactionClient;

type ParsedPunch = {
  source: ETimeOfficePunch;
  employeeCode: string;
  punchTime: Date;
  recordKey: string;
};

function localMinutesFor(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function localDateTimeToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Unexpected Team Office PunchDate format: ${value}`);

  const [, dayText, monthText, yearText, hourText, minuteText, secondText = '0'] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(localAsUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Invalid Team Office PunchDate: ${value}`);
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(localAsUtc));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const representedAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  const result = new Date(localAsUtc - (representedAsUtc - localAsUtc));
  if (Number.isNaN(result.getTime())) throw new Error(`Could not convert Team Office PunchDate: ${value}`);
  return result;
}

function getRecordKey(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.ID === undefined || payload.ID === null) return null;
  return `${String(payload.Table || '')}:${String(payload.ID)}`;
}

function parsePunches(punches: ETimeOfficePunch[], timeZone: string): ParsedPunch[] {
  return punches.map((source) => {
    if (!source.Empcode || !source.PunchDate || !Number.isFinite(Number(source.ID))) {
      throw new Error('Team Office returned a punch without Empcode, PunchDate, or ID; checkpoint was not advanced.');
    }
    const recordKey = getRecordKey(source);
    if (!recordKey) throw new Error('Team Office returned a punch without a record ID; checkpoint was not advanced.');
    return {
      source,
      employeeCode: hrmsEmployeeCode(source.Empcode),
      punchTime: localDateTimeToUtc(source.PunchDate, timeZone),
      recordKey,
    };
  });
}

async function readSetting(db: DbLike, tenantId: string, key: string) {
  return db.setting.findFirst({
    where: { tenantId, companyId: null, category: CATEGORY, key },
    select: { value: true },
  });
}

async function writeSetting(db: DbLike, tenantId: string, key: string, value: string, dataType = 'string') {
  // companyId is NULL for tenant-wide settings. PostgreSQL treats NULL values
  // as distinct in ordinary unique indexes, so use a read/update-or-create
  // here instead of relying on the compound upsert constraint.
  const existing = await db.setting.findFirst({
    where: { tenantId, companyId: null, category: CATEGORY, key },
    select: { id: true },
  });
  const data = { value, dataType, isEditable: false };
  if (existing) return db.setting.update({ where: { id: existing.id }, data });
  return db.setting.create({
    data: {
      tenantId, companyId: null, category: CATEGORY, key,
      ...data,
      description: 'Managed by Team Office biometric sync',
    },
  });
}

function initialCheckpoint() {
  // Seed from the last successful MaxRecord shared during setup. Admins can
  // move it back one record before the first sync to include that sample punch.
  return process.env.ETIMEOFFICE_LAST_RECORD?.trim() || '102026$383';
}

export interface ETimeOfficeSyncOptions {
  /** Rewind the cursor to this MMyyyy$ID record before downloading (admin re-sync). */
  rewindToRecord?: string;
  /** Re-classify attendance for every biometric-punch day in [from, to) —
   *  Task 158 "correct the calculation": recomputes check-in/out, work hours,
   *  late/half-day status from ALL stored punches of the window, overriding
   *  auto-present placeholder rows (punchMethod='auto') when real punches exist. */
  reclassifyFrom?: Date;
  reclassifyTo?: Date;
}

async function ensureIntegrationDevice(db: DbLike) {
  const serialNumber = process.env.ETIMEOFFICE_DEVICE_SERIAL?.trim() || 'A230501663';
  const name = process.env.ETIMEOFFICE_DEVICE_NAME?.trim() || 'BIO-PARK D01 (Team Office)';
  const apiTokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
  const device = await db.biometricDevice.upsert({
    where: { serialNumber },
    create: {
      serialNumber,
      name,
      vendor: 'custom',
      model: 'BIO-PARK D01 / e-timeoffice cloud API',
      apiTokenHash,
      lastHeartbeatAt: new Date(),
    },
    update: { lastHeartbeatAt: new Date() },
    select: { id: true, name: true, isActive: true },
  });
  if (!device.isActive) throw new Error(`Biometric source ${name} is marked inactive in HRMS.`);
  return device;
}

function statusJson(status: Record<string, unknown>) {
  return JSON.stringify(status);
}

/** Fetch Team Office's incremental punches and atomically store them in the tenant DB. */

// Task 158 — reclassifyFrom/reclassifyTo extend Task 159/161's SyncOptions:
// when set, every biometric-punch day inside the window is re-classified
// (attendance recomputed from ALL stored punches), not just days with new
// inserts.
type SyncOptions = { rewindTo?: string; rewindDays?: number; rematch?: boolean; reclassifyFrom?: Date; reclassifyTo?: Date };
const REWIND_RE = /^(0[1-9]|1[0-2])\d{4}\$\d+$/;

function normName(v: string) {
  return String(v || '').toLowerCase().replace(/[^a-z]/g, '');
}

/* ── Task 161: tolerant reader↔roster matching ─────────────────────
 * Some employees' codes on the biometric reader do not match their HRMS
 * employeeId. Punches with such codes land as 'unmatched' rows (visible in
 * Biometric Punches) and never reach the Attendance dashboard. The matcher
 * below resolves them by (1) a persisted device-code→HRMS-code map, (2) the
 * transformed HRMS code, (3) the exact normalized full name, and finally
 * (4) a conservative fuzzy name match (token overlap, then bigram Dice).
 * Every name-resolved pairing is persisted into the code map so future
 * punches from that reader code match instantly by code. */

const NAME_MATCH_THRESHOLD = 0.86;

function normTokens(v: string): string[] {
  return String(v || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 2);
}

function bigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) || 0;
    if (n > 0) {
      hits += 1;
      grams.set(g, n - 1);
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

function nameScore(deviceName: string, employeeName: string): number {
  const a = normName(deviceName);
  const b = normName(employeeName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = normTokens(deviceName);
  const tb = normTokens(employeeName);
  if (ta.length && tb.length) {
    const setA = new Set(ta);
    const setB = new Set(tb);
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter += 1;
    if (setA.size === setB.size && inter === setA.size) return 0.95; // same tokens, any order
    if (inter === Math.min(setA.size, setB.size)) return 0.9;       // subset (middle name/initial dropped)
  }
  return bigramDice(a, b);
}

type RosterEntry = { id: string; employeeId: string; fullName: string };

/** Unique-best fuzzy match against the roster; ties stay unmatched (safe). */
function bestNameMatch(deviceName: string, roster: RosterEntry[]): { id: string; employeeId: string } | null {
  let best: { id: string; employeeId: string; score: number } | null = null;
  let tied = false;
  for (const e of roster) {
    const score = nameScore(deviceName, e.fullName);
    if (score < NAME_MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { id: e.id, employeeId: e.employeeId, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  return best && !tied ? { id: best.id, employeeId: best.employeeId } : null;
}

async function loadCodeMap(db: DbLike, tenantId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const row = await readSetting(db, tenantId, MAP_KEY).catch(() => null);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed || {})) {
        if (k && v) map.set(k.toUpperCase(), String(v).toUpperCase());
      }
    } catch { /* corrupt map ignored — rebuilt on the next rematch */ }
  }
  return map;
}

/** Task 159: cursor for a days-back rewind — the oldest punch inside the
 * window provides the vendor table month plus an ID just before it, so the
 * incremental download replays (and re-dedupes) that window. */
async function cursorDaysBack(db: DbLike, deviceId: string, days: number, timeZone: string): Promise<string | null> {
  const since = new Date(Date.now() - days * 86_400_000);
  const oldest = await db.biometricPunch.findFirst({
    where: { deviceId, punchTime: { gte: since } },
    orderBy: { punchTime: 'asc' },
    select: { punchTime: true, rawPayload: true },
  });
  if (!oldest) return null;
  const raw = (oldest.rawPayload || {}) as Record<string, unknown>;
  const id = Number(raw.ID);
  if (!Number.isFinite(id)) return null;
  const mm = new Intl.DateTimeFormat('en-GB', { timeZone, month: '2-digit' }).format(oldest.punchTime);
  const yyyy = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric' }).format(oldest.punchTime);
  return `${mm}${yyyy}$${Math.max(1, id - 1)}`;
}

/** Task 159 entry point: optional self-healing rematch + checkpoint rewind,
 * then walks the incremental cursor forward until the vendor reports no new
 * punches (max 6 batches). Previously this was a single-shot function. */
export async function syncETimeOfficePunches(db: PrismaClient, tenantId: string, opts: SyncOptions = {}) {
  const timeZone = process.env.ETIMEOFFICE_TIMEZONE?.trim() || DEFAULT_TIME_ZONE;
  const checkpointSetting = await readSetting(db, tenantId, CHECKPOINT_KEY);
  let startCursor = checkpointSetting?.value || initialCheckpoint();
  const rewindTo = opts.rewindTo?.trim();
  if (rewindTo && REWIND_RE.test(rewindTo)) {
    startCursor = rewindTo;
  } else if (opts.rewindDays && Number.isFinite(opts.rewindDays) && opts.rewindDays > 0) {
    const device0 = await ensureIntegrationDevice(db);
    const back = await cursorDaysBack(db, device0.id, Math.min(90, Math.floor(opts.rewindDays)), timeZone);
    if (back) startCursor = back;
  }

  const totals = { imported: 0, matched: 0, unmatched: 0, duplicatesSkipped: 0, rematched: 0, batches: 0 };
  let cursor = startCursor;
  let lastDevice = '';
  for (let i = 0; i < 6; i++) {
    const batch = await syncBatch(db, tenantId, cursor, timeZone, { rematch: opts.rematch !== false, firstBatch: i === 0, reclassifyFrom: opts.reclassifyFrom, reclassifyTo: opts.reclassifyTo });
    if (!batch || 'skipped' in batch) break;
    totals.imported += batch.imported || 0;
    totals.matched += batch.matched || 0;
    totals.unmatched += batch.unmatched || 0;
    totals.duplicatesSkipped += batch.duplicatesSkipped || 0;
    totals.rematched = Math.max(totals.rematched, batch.rematched || 0);
    totals.batches += 1;
    lastDevice = String(batch.device || '');
    const next = String(batch.lastRecord || cursor);
    if (next === cursor || !(batch.imported > 0)) { cursor = next; break; }
    cursor = next;
  }

  await writeSetting(db, tenantId, STATUS_KEY, statusJson({
    state: 'success',
    lastSyncAt: new Date().toISOString(),
    ...totals,
    lastRecord: cursor,
    device: lastDevice,
    ...(rewindTo || opts.rewindDays ? { rewind: rewindTo || `${opts.rewindDays}d` } : {}),
  }), 'json').catch(() => undefined);

  return { ...totals, lastRecord: cursor, requestedFrom: startCursor, device: lastDevice };
}

/** One incremental download-and-import pass. */
async function syncBatch(db: PrismaClient, tenantId: string, requestedCursor: string, timeZone: string, opts: { rematch: boolean; firstBatch: boolean; reclassifyFrom?: Date; reclassifyTo?: Date }) {
  let response: Awaited<ReturnType<typeof downloadLatestPunches>>;
  try {
    response = await downloadLatestPunches(requestedCursor);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Team Office request failed.';
    await writeSetting(db, tenantId, STATUS_KEY, statusJson({
      state: 'error', lastAttemptAt: new Date().toISOString(), message,
    }), 'json').catch(() => undefined);
    throw error;
  }

  let parsed: ParsedPunch[];
  try {
    parsed = parsePunches(response.PunchData, timeZone);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Team Office returned invalid punch data.';
    await writeSetting(db, tenantId, STATUS_KEY, statusJson({
      state: 'error', lastAttemptAt: new Date().toISOString(), message,
    }), 'json').catch(() => undefined);
    throw error;
  }
  const device = await ensureIntegrationDevice(db);
  const nextCursor = response.MaxRecord.trim() || requestedCursor;

  // Task 158 — re-sync/re-classification windows legitimately touch many
  // employee-days in one pass; give the interactive transaction room to work.
  const result = await db.$transaction(async (tx) => {
    // Transaction-scoped lock prevents two cron/manual requests for this tenant
    // from inserting the same vendor rows concurrently.
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`etimeoffice:${tenantId}`})) AS locked`;
    if (!lockRows?.[0]?.locked) return { skipped: 'another sync is running' as const };

    const currentSetting = await readSetting(tx, tenantId, CHECKPOINT_KEY);
    const currentCursor = currentSetting?.value || initialCheckpoint();
    // Task 159: the FIRST batch of a wrapper run may intentionally rewind the
    // checkpoint, so the equality guard only applies to continuation batches.
    if (!opts.firstBatch && currentCursor !== requestedCursor) return { skipped: 'a newer sync already advanced the checkpoint' as const };

    // Task 159/161: self-healing rematch — orphaned (unmatched) punches from
    // the last 90 days on ANY device are re-matched against the CURRENT
    // roster: persisted device-code map first, then the transformed HRMS
    // code, then the exact normalized full name, and finally a conservative
    // fuzzy name match (covers reader-side code mismatches). A matched
    // orphan is deleted and re-inserted through the normal pipeline below,
    // so it flows into punchEvent + the attendance upsert with zero
    // duplicated logic. Name-resolved pairings are persisted into the code
    // map so future punches from that reader code match instantly.
    let rematched = 0;
    let nameMatched = 0;
    const codeMapAdditions = new Map<string, string>();
    const codeMap = await loadCodeMap(tx, tenantId);
    if (opts.rematch) {
      const since = new Date(Date.now() - 90 * 86_400_000);
      const orphans = await tx.biometricPunch.findMany({
        where: { employeeId: null, punchType: 'unmatched', punchTime: { gte: since } },
        orderBy: { punchTime: 'asc' },
        take: 2000,
      });
      if (orphans.length) {
        const rosterRows = await tx.employee.findMany({
          where: { department: { company: { companyGroup: { tenantId } } } },
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        });
        const byCode = new Map<string, { id: string; employeeId: string }>();
        const byName = new Map<string, { id: string; employeeId: string }>();
        const roster: RosterEntry[] = rosterRows.map((e) => {
          if (e.employeeId) byCode.set(e.employeeId.toUpperCase(), { id: e.id, employeeId: e.employeeId });
          const n = normName(`${e.firstName || ''} ${e.lastName || ''}`);
          if (n && !byName.has(n)) byName.set(n, { id: e.id, employeeId: e.employeeId });
          return { id: e.id, employeeId: e.employeeId, fullName: `${e.firstName || ''} ${e.lastName || ''}` };
        });
        for (const o of orphans) {
          const raw = (o.rawPayload || {}) as Record<string, unknown>;
          // eTimeOffice rows carry Empcode/Name; device-webhook rows carry
          // employeeCode/employeeName — accept both shapes.
          const rawCode = String(raw.Empcode ?? raw.employeeCode ?? '').trim();
          const rawName = String(raw.Name ?? raw.employeeName ?? raw.name ?? '').trim();
          if (!rawCode && !rawName) continue;
          const code = rawCode ? hrmsEmployeeCode(rawCode) : '';
          const mappedCode = rawCode ? codeMap.get(rawCode.toUpperCase()) : undefined;
          const exactName = rawName ? byName.get(normName(rawName)) : undefined;
          const emp =
            (mappedCode ? byCode.get(mappedCode) : undefined) ||
            (code ? byCode.get(code.toUpperCase()) : undefined) ||
            exactName ||
            (rawName ? bestNameMatch(rawName, roster) : undefined);
          if (!emp) continue; // still unmatched — device code has no HRMS employee
          if (rawCode && emp.employeeId) {
            codeMapAdditions.set(rawCode.toUpperCase(), emp.employeeId.toUpperCase());
          }
          const recKey = getRecordKey(raw) || `rematch:${o.id}`;
          await tx.biometricPunch.delete({ where: { id: o.id } });
          parsed.push({
            source: raw as unknown as ETimeOfficePunch,
            employeeCode: emp.employeeId || code,
            punchTime: o.punchTime,
            recordKey: recKey,
          });
          rematched += 1;
          if (!mappedCode && !code && rawName) nameMatched += 1;
        }
      }
    }

    const existingPunchRows = parsed.length
      ? await tx.biometricPunch.findMany({
          where: {
            deviceId: device.id,
            punchTime: {
              gte: new Date(Math.min(...parsed.map((p) => p.punchTime.getTime()))),
              lte: new Date(Math.max(...parsed.map((p) => p.punchTime.getTime()))),
            },
          },
          select: { rawPayload: true },
        })
      : [];
    const existingKeys = new Set<string>();
    for (const row of existingPunchRows) {
      const key = getRecordKey(row.rawPayload || {});
      if (key) existingKeys.add(key);
    }

    const toInsert = parsed.filter((p) => !existingKeys.has(p.recordKey));
    const employeeCodes = [...new Set(toInsert.map((p) => p.employeeCode))];
    const employees = employeeCodes.length
      ? await tx.employee.findMany({
          where: {
            employeeId: { in: employeeCodes },
            department: { company: { companyGroup: { tenantId } } },
          },
          select: { id: true, employeeId: true },
        })
      : [];
    const employeeByCode = new Map(employees.map((employee) => [employee.employeeId, employee] as const));

    // Task 161: name fallback for NEW reader codes that no roster code (and no
    // persisted map entry) resolves — brand-new mismatches are resolved by
    // exact/fuzzy name right away instead of piling up as unmatched rows.
    const resolvedForInsert = new Map<string, { id: string; employeeId: string }>();
    const unresolved = toInsert.filter((p) => !employeeByCode.get(p.employeeCode));
    if (unresolved.length) {
      const rosterRows = await tx.employee.findMany({
        where: { department: { company: { companyGroup: { tenantId } } } },
        select: { id: true, employeeId: true, firstName: true, lastName: true },
      });
      const byCodeAll = new Map<string, { id: string; employeeId: string }>();
      const byNameAll = new Map<string, { id: string; employeeId: string }>();
      const rosterAll: RosterEntry[] = rosterRows.map((e) => {
        if (e.employeeId) byCodeAll.set(e.employeeId.toUpperCase(), { id: e.id, employeeId: e.employeeId });
        const n = normName(`${e.firstName || ''} ${e.lastName || ''}`);
        if (n && !byNameAll.has(n)) byNameAll.set(n, { id: e.id, employeeId: e.employeeId });
        return { id: e.id, employeeId: e.employeeId, fullName: `${e.firstName || ''} ${e.lastName || ''}` };
      });
      for (const p of unresolved) {
        const raw = p.source as unknown as Record<string, unknown>;
        const rawCode = String(raw.Empcode ?? raw.employeeCode ?? '').trim();
        const rawName = String(raw.Name ?? raw.employeeName ?? raw.name ?? '').trim();
        if (!rawCode && !rawName) continue;
        const mappedCode = rawCode ? codeMap.get(rawCode.toUpperCase()) : undefined;
        const hit =
          (mappedCode ? byCodeAll.get(mappedCode) : undefined) ||
          (rawName ? byNameAll.get(normName(rawName)) : undefined) ||
          (rawName ? bestNameMatch(rawName, rosterAll) : undefined);
        if (hit?.employeeId) {
          resolvedForInsert.set(p.recordKey, hit);
          if (rawCode && hit.employeeId) codeMapAdditions.set(rawCode.toUpperCase(), hit.employeeId.toUpperCase());
          if (!mappedCode && rawName) nameMatched += 1;
        }
      }
    }

    const insertedEvents: Array<{ id: string; employeeId: string; punchTime: Date; dayStart: Date }> = [];
    let unmatched = 0;
    for (const punch of toInsert) {
      const employee = employeeByCode.get(punch.employeeCode) || resolvedForInsert.get(punch.recordKey);
      const rawPayload = { ...punch.source, integration: 'etimeoffice', sourceRecordKey: punch.recordKey };
      const row = await tx.biometricPunch.create({
        data: {
          deviceId: device.id,
          employeeId: employee?.id || null,
          punchType: employee ? 'punch' : 'unmatched',
          punchTime: punch.punchTime,
          rawPayload,
        },
        select: { id: true },
      });
      if (!employee) {
        unmatched += 1;
        continue;
      }

      const dayStart = localDayStartFor(punch.punchTime, timeZone);
      insertedEvents.push({ id: row.id, employeeId: employee.id, punchTime: punch.punchTime, dayStart });
      await tx.punchEvent.create({
        data: {
          employeeId: employee.id,
          type: 'biometric',
          date: dayStart,
          timestamp: punch.punchTime,
          method: 'biometric',
          deviceId: device.id,
          notes: `Imported from Team Office (${punch.recordKey})`,
        },
      });
    }

    const dayGroups = new Map<string, { employeeId: string; dayStart: Date; newIds: string[] }>();
    for (const event of insertedEvents) {
      const groupKey = `${event.employeeId}:${event.dayStart.toISOString()}`;
      const group = dayGroups.get(groupKey) || { employeeId: event.employeeId, dayStart: event.dayStart, newIds: [] };
      group.newIds.push(event.id);
      dayGroups.set(groupKey, group);
    }

    // Task 158 — re-classification window: also rebuild attendance for days
    // that already have stored punches (no new inserts required). This lets an
    // admin re-sync correct past calculations once late-arriving punches, a
    // device clock fix, or rule changes land.
    if (opts.reclassifyFrom && opts.reclassifyTo) {
      const windowRows = await tx.biometricPunch.findMany({
        where: {
          deviceId: device.id,
          employeeId: { not: null },
          punchTime: { gte: opts.reclassifyFrom, lt: opts.reclassifyTo },
        },
        select: { id: true, employeeId: true, punchTime: true },
      });
      for (const row of windowRows) {
        const employeeId = row.employeeId as string;
        const dayStart = localDayStartFor(row.punchTime, timeZone);
        const groupKey = `${employeeId}:${dayStart.toISOString()}`;
        const group = dayGroups.get(groupKey) || { employeeId, dayStart, newIds: [] };
        if (!group.newIds.includes(row.id)) group.newIds.push(row.id);
        dayGroups.set(groupKey, group);
      }
    }

    // Task 133: per-employee shift windows (roster-assigned shifts, e.g.
    // MARQ004 on 11:00–17:00) — employees WITHOUT an assignment keep the
    // tenant-wide rules (10:00 late cutoff / 18:30 finalize / 8h full day).
    const shiftWindows = await loadEmployeeShiftWindows(tx as any, [...new Set([...dayGroups.values()].map(g => g.employeeId))]);
    const lateCutoffFor = (win: EmployeeShiftWindow | undefined) =>
      win ? win.startMinutes + win.graceMinutes : 10 * 60;

    for (const group of dayGroups.values()) {
      const dayEnd = new Date(group.dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayPunches = await tx.biometricPunch.findMany({
        where: {
          deviceId: device.id,
          employeeId: group.employeeId,
          punchTime: { gte: group.dayStart, lt: dayEnd },
        },
        orderBy: [{ punchTime: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, punchTime: true },
      });
      if (!dayPunches.length) continue;

      // Task 162: look through the FULL dual-convention day window — a legacy
      // UTC-midnight row for the same business day (written by manual punch /
      // regularize / auto-present before the IST unification) must be UPDATED
      // in place, not shadowed by a second IST-midnight row.
      const existingRows = await tx.attendance.findMany({
        where: { employeeId: group.employeeId, date: { gte: group.dayStart, lt: dayEnd } },
        select: { id: true, date: true, checkIn: true, checkOut: true, breakIn: true, breakOut: true, breakMinutes: true, punchMethod: true, earlyLogout: true, status: true },
      });
      const existingAttendance = pickBestAttendanceRow(existingRows);
      const duplicateWindowMinutes = Number(process.env.ETIMEOFFICE_DUPLICATE_WINDOW_MINUTES || '2');
      const classified = classifyBiometricDay(dayPunches, Number.isFinite(duplicateWindowMinutes) ? duplicateWindowMinutes : 2, {
        // Task 158 — auto-present placeholder rows (punchMethod='auto') must
        // NOT block real biometric punches: only genuinely MANUAL entries
        // (web/mobile/HR) keep their check-in when punches arrive later.
        manualCheckIn: Boolean(existingAttendance?.checkIn && existingAttendance?.punchMethod !== 'biometric' && existingAttendance?.punchMethod !== 'auto'),
        existingCheckOut: existingAttendance?.checkOut,
        existingBreakIn: existingAttendance?.breakIn,
        existingBreakOut: existingAttendance?.breakOut,
        earlyLogout: Boolean(existingAttendance?.earlyLogout),
      });
      const acceptedPunches = classified.accepted;
      if (!acceptedPunches.length) continue;
      const first = acceptedPunches[0];
      // Keep an existing check-in ONLY when it came from a genuinely manual
      // entry; auto-present placeholders (and biometric rows) are recomputed
      // from the real punches so late-arriving scans correct the record.
      const existingIsManual = Boolean(existingAttendance?.checkIn && existingAttendance?.punchMethod !== 'biometric' && existingAttendance?.punchMethod !== 'auto');
      const checkIn = existingIsManual && existingAttendance?.checkIn
        ? existingAttendance.checkIn
        : (classified.classifications.get(first.id) === 'check_in' ? first.punchTime : null);
      const checkoutPunches = acceptedPunches.filter(p => classified.classifications.get(p.id) === 'check_out');
      const checkoutPunch = checkoutPunches[checkoutPunches.length - 1];
      const candidateOut = checkoutPunch?.punchTime || null;
      const checkOut = candidateOut && existingAttendance?.checkOut && existingAttendance.checkOut > candidateOut
        ? existingAttendance.checkOut : candidateOut || existingAttendance?.checkOut || null;
      const firstBreak = classified.completedBreaks[0] || null;
      const breakIn = firstBreak?.start || existingAttendance?.breakIn || null;
      const breakOut = firstBreak?.end || existingAttendance?.breakOut || null;
      const breakPolicy = await loadAttendanceBreakPolicy(tx);
      const empShift = shiftWindows.get(group.employeeId);
      const breakMinutes = checkIn && checkOut
        ? effectiveBreakMinutes(breakIn, breakOut, checkIn, checkOut, breakPolicy)
        : existingAttendance?.breakMinutes || 0;
      // Task 133: finalize at the EMPLOYEE's shift end (17:00 for the 11–5
      // shift) instead of the tenant-wide 18:30 default.
      const canFinalize = Boolean(checkOut && localMinutesFor(checkOut, timeZone) >= (empShift ? empShift.endMinutes : breakPolicy.shiftEndMinutes));
      const workHours = canFinalize && checkIn && checkOut && checkOut > checkIn
        ? Number((Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60_000 - breakMinutes) / 60).toFixed(2))
        : null;
      let attendanceStatus = existingAttendance?.status || 'present';
      if (checkIn) {
        const localParts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
        }).formatToParts(checkIn);
        const year = Number(localParts.find(part => part.type === 'year')?.value);
        const month = Number(localParts.find(part => part.type === 'month')?.value);
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const monthStart = localDateTimeToUtc(`01/${String(month).padStart(2, '0')}/${year} 00:00:00`, timeZone);
        const monthEnd = localDateTimeToUtc(`01/${String(nextMonth).padStart(2, '0')}/${nextYear} 00:00:00`, timeZone);
        const previousCheckIns = await tx.attendance.findMany({
          where: {
            employeeId: group.employeeId,
            date: { gte: monthStart, lt: monthEnd },
            checkIn: { not: null, lt: checkIn },
          },
          select: { checkIn: true },
        });
        // Task 133: late cutoff = employee shift start + its grace (11:00+15
        // for the 11–5 shift); tenant default stays 10:00 for everyone else.
        const lateCutoff = lateCutoffFor(empShift);
        const isLate = localMinutesFor(checkIn, timeZone) > lateCutoff;
        const previousLateCount = previousCheckIns.filter(row => row.checkIn && localMinutesFor(row.checkIn, timeZone) > lateCutoff).length;
        const fullDayHours = empShift ? shiftFullDayHours(empShift) : 8;
        attendanceStatus = (existingAttendance?.status === 'half_day' || (canFinalize && workHours !== null && workHours < fullDayHours) || (isLate && previousLateCount >= 3))
          ? 'half_day'
          : isLate ? 'late' : 'present';
      }
      const attendance = existingAttendance
        ? await tx.attendance.update({
            where: { id: existingAttendance.id },
            data: {
              ...(checkIn ? { checkIn } : {}),
              ...(checkOut ? { checkOut } : {}),
              ...(workHours !== null ? { workHours } : {}),
              ...(breakIn ? { breakIn } : {}),
              ...(breakOut ? { breakOut } : {}),
              breakMinutes: breakMinutes || null,
              status: attendanceStatus,
              punchMethod: 'biometric',
              location: device.name,
            },
            select: { id: true },
          })
        : await tx.attendance.create({
            data: {
              employeeId: group.employeeId,
              date: group.dayStart,
              checkIn,
              checkOut,
              workHours,
              breakIn,
              breakOut,
              breakMinutes: breakMinutes || null,
              status: attendanceStatus,
              punchMethod: 'biometric',
              location: device.name,
            },
            select: { id: true },
          });

      for (const event of dayPunches) {
        const punchType = classified.classifications.get(event.id) || 'duplicate';
        await tx.biometricPunch.update({
          where: { id: event.id },
          data: { punchType, attendanceId: attendance.id },
        });
        const eventType = punchType === 'check_in' ? 'checkin'
          : punchType === 'check_out' ? 'checkout'
            : punchType === 'break_in' ? 'breakin'
              : punchType === 'break_out' ? 'breakout'
            : punchType === 'entry_only' ? 'entry'
              : 'duplicate';
        await tx.punchEvent.updateMany({
          where: {
            employeeId: group.employeeId,
            date: group.dayStart,
            timestamp: event.punchTime,
            method: 'biometric',
          },
          data: { type: eventType },
        });
      }
    }

    // Task 161: persist every code pairing resolved by name so future
    // punches from the same reader code match instantly (and HR can audit
    // the mapping in the integration settings).
    if (codeMapAdditions.size) {
      const merged = await loadCodeMap(tx, tenantId);
      for (const [k, v] of codeMapAdditions) if (!merged.has(k)) merged.set(k, v);
      const flat: Record<string, string> = {};
      for (const [k, v] of merged) flat[k] = v;
      await writeSetting(tx, tenantId, MAP_KEY, JSON.stringify(flat), 'json').catch(() => undefined);
    }

    const status = {
      state: 'success',
      lastSyncAt: new Date().toISOString(),
      imported: toInsert.length,
      matched: insertedEvents.length,
      unmatched,
      rematched,
      nameMatched,
      duplicatesSkipped: parsed.length - toInsert.length,
      lastRecord: nextCursor,
      device: device.name,
    };
    await writeSetting(tx, tenantId, CHECKPOINT_KEY, nextCursor);
    await writeSetting(tx, tenantId, STATUS_KEY, statusJson(status), 'json');
    return status;
  }, { timeout: 180_000, maxWait: 15_000 }).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Team Office database sync failed.';
    await writeSetting(db, tenantId, STATUS_KEY, statusJson({
      state: 'error', lastAttemptAt: new Date().toISOString(), message,
    }), 'json').catch(() => undefined);
    throw error;
  });

  return {
    ...result,
    requestedFrom: requestedCursor,
    received: parsed.length,
    ...(result && 'skipped' in result ? {} : { apiMessage: response.Msg }),
  };
}

export async function getETimeOfficeSyncStatus(db: DbLike, tenantId: string) {
  const [checkpoint, status] = await Promise.all([
    readSetting(db, tenantId, CHECKPOINT_KEY),
    readSetting(db, tenantId, STATUS_KEY),
  ]);
  let parsedStatus: unknown = null;
  try { parsedStatus = status?.value ? JSON.parse(status.value) : null; } catch { parsedStatus = status?.value || null; }

  // Task 158 — device staleness: how long since the source actually delivered
  // its last punch. Lets admins spot "device offline" (e.g. uploads stopped
  // mid-month) even though the sync job itself reports success.
  let lastPunchAt: string | null = null;
  let lastPunchAgeDays: number | null = null;
  try {
    const last = await db.biometricPunch.findFirst({
      where: { device: { serialNumber: process.env.ETIMEOFFICE_DEVICE_SERIAL?.trim() || 'A230501663' } },
      orderBy: { punchTime: 'desc' },
      select: { punchTime: true },
    });
    if (last?.punchTime) {
      lastPunchAt = last.punchTime.toISOString();
      lastPunchAgeDays = Math.floor((Date.now() - last.punchTime.getTime()) / 86_400_000);
    }
  } catch { /* status fields are best-effort */ }

  return {
    configured: Boolean(process.env.ETIMEOFFICE_CORPORATE_ID && process.env.ETIMEOFFICE_USERNAME && process.env.ETIMEOFFICE_PASSWORD),
    lastRecord: checkpoint?.value || initialCheckpoint(),
    status: parsedStatus,
    lastPunchAt,
    lastPunchAgeDays,
  };
}
