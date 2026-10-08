import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { downloadLatestPunches, hrmsEmployeeCode, type ETimeOfficePunch } from '@/lib/etimeoffice-client';
import { localDayStartFor } from '@/lib/timezone-utils';

const CHECKPOINT_KEY = 'etimeoffice_biometric_last_record';
const STATUS_KEY = 'etimeoffice_biometric_sync_status';
const CATEGORY = 'integration';
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

type DbLike = PrismaClient | Prisma.TransactionClient;

type ParsedPunch = {
  source: ETimeOfficePunch;
  employeeCode: string;
  punchTime: Date;
  recordKey: string;
};

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
export async function syncETimeOfficePunches(db: PrismaClient, tenantId: string) {
  const checkpointSetting = await readSetting(db, tenantId, CHECKPOINT_KEY);
  const requestedCursor = checkpointSetting?.value || initialCheckpoint();
  const timeZone = process.env.ETIMEOFFICE_TIMEZONE?.trim() || DEFAULT_TIME_ZONE;

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

  const result = await db.$transaction(async (tx) => {
    // Transaction-scoped lock prevents two cron/manual requests for this tenant
    // from inserting the same vendor rows concurrently.
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`etimeoffice:${tenantId}`})) AS locked`;
    if (!lockRows?.[0]?.locked) return { skipped: 'another sync is running' as const };

    const currentSetting = await readSetting(tx, tenantId, CHECKPOINT_KEY);
    const currentCursor = currentSetting?.value || initialCheckpoint();
    if (currentCursor !== requestedCursor) return { skipped: 'a newer sync already advanced the checkpoint' as const };

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

    const insertedEvents: Array<{ id: string; employeeId: string; punchTime: Date; dayStart: Date }> = [];
    let unmatched = 0;
    for (const punch of toInsert) {
      const employee = employeeByCode.get(punch.employeeCode);
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

      const first = dayPunches[0];
      const last = dayPunches[dayPunches.length - 1];
      const lastIsAfterFirst = last.punchTime.getTime() > first.punchTime.getTime();
      const existingAttendance = await tx.attendance.findUnique({
        where: { employeeId_date: { employeeId: group.employeeId, date: group.dayStart } },
        select: { checkIn: true, checkOut: true },
      });
      const checkIn = existingAttendance?.checkIn && existingAttendance.checkIn < first.punchTime
        ? existingAttendance.checkIn : first.punchTime;
      const candidateOut = lastIsAfterFirst ? last.punchTime : null;
      const checkOut = candidateOut && existingAttendance?.checkOut && existingAttendance.checkOut > candidateOut
        ? existingAttendance.checkOut : candidateOut || existingAttendance?.checkOut || null;
      const workHours = checkIn && checkOut && checkOut > checkIn
        ? Number(((checkOut.getTime() - checkIn.getTime()) / 3_600_000).toFixed(2))
        : null;
      const attendance = await tx.attendance.upsert({
        where: { employeeId_date: { employeeId: group.employeeId, date: group.dayStart } },
        create: {
          employeeId: group.employeeId,
          date: group.dayStart,
          checkIn,
          checkOut,
          workHours,
          status: 'present',
          punchMethod: 'biometric',
          location: device.name,
        },
        update: {
          checkIn,
          ...(checkOut ? { checkOut } : {}),
          ...(workHours !== null ? { workHours } : {}),
          status: 'present',
          punchMethod: 'biometric',
          location: device.name,
        },
        select: { id: true },
      });

      for (let index = 0; index < dayPunches.length; index += 1) {
        const event = dayPunches[index];
        const punchType = index === 0 ? 'check_in' : index === dayPunches.length - 1 ? 'check_out' : 'punch';
        await tx.biometricPunch.update({
          where: { id: event.id },
          data: { punchType: dayPunches.length === 1 ? 'check_in' : punchType, attendanceId: attendance.id },
        });
      }
    }

    const status = {
      state: 'success',
      lastSyncAt: new Date().toISOString(),
      imported: toInsert.length,
      matched: insertedEvents.length,
      unmatched,
      duplicatesSkipped: parsed.length - toInsert.length,
      lastRecord: nextCursor,
      device: device.name,
    };
    await writeSetting(tx, tenantId, CHECKPOINT_KEY, nextCursor);
    await writeSetting(tx, tenantId, STATUS_KEY, statusJson(status), 'json');
    return status;
  }).catch(async (error: unknown) => {
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
  return {
    configured: Boolean(process.env.ETIMEOFFICE_CORPORATE_ID && process.env.ETIMEOFFICE_USERNAME && process.env.ETIMEOFFICE_PASSWORD),
    lastRecord: checkpoint?.value || initialCheckpoint(),
    status: parsedStatus,
  };
}
