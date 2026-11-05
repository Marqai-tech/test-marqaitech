/**
 * Payroll Attendance Corrections — manual punch / Excel upload + audit trail.
 *
 * POST /api/payroll/attendance-corrections
 *   Lets a payroll manager / HR fix attendance irregularities for payroll:
 *     • multipart/form-data — fields: file (.xlsx), reason (required)
 *     • application/json    — { employeeCode, date, checkIn?, checkOut?,
 *                               status?, note?, reason? }
 *
 *   Per valid row the existing Attendance row is located with the IST
 *   dual-convention day lookup (attendanceDayWindow — rows are stored either
 *   at UTC midnight or IST midnight), then upserted:
 *     status, checkIn/checkOut as IST wall-time datetimes (only when
 *     provided), workHours recomputed when both punches are known
 *     ((out - in) - breakMinutes, min 0, 2dp), punchMethod 'manual' and a
 *     'Payroll correction — <reason>' notes line appended to any existing
 *     notes. Every changed row writes an AttendanceAuditLog entry
 *     (action: 'payroll_correction'). When at least one row applied,
 *     Admin/HR are emailed via the 'payroll.attendance_corrected'
 *     notification event.
 *
 * GET /api/payroll/attendance-corrections[?includeMass=1]
 *   Latest 200 audit entries for the payroll module audit trail page
 *   (optionally including the 'mass_correction' entries written by the
 *   Regularize month-view bulk update).
 */
import * as XLSX from 'xlsx';
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { canonicalAttendanceDate, findAttendanceForLocalDay } from '@/lib/attendance-day';
import { parseDeviceTimestamp } from '@/lib/timezone-utils';

export { OPTIONS };

const VALID_STATUSES = ['present', 'absent', 'late', 'half_day', 'holiday', 'weekend', 'on_leave'];
const MAX_ROWS = 500;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Minimal Attendance row shape consumed from findAttendanceForLocalDay. */
interface ExistingAttendance {
  id: string;
  status: string;
  checkIn: Date | null;
  checkOut: Date | null;
  workHours: number | null;
  notes: string | null;
  breakMinutes: number | null;
}

interface EmployeeLite {
  id: string;
  employeeId: string;
}

interface ParsedCorrectionRow {
  employeeCode: string;
  dateKey: string;
  checkInHm: { h: number; m: number } | null;
  checkOutHm: { h: number; m: number } | null;
  explicitStatus: string | null;
  note: string;
}

/** A parsed sheet/JSON row — either ready to apply or carrying a validation error. */
type ParsedEntry = { rowNumber: number; row: ParsedCorrectionRow } | { rowNumber: number; error: string };

interface CorrectionRowResult {
  row: number;
  employeeCode: string;
  date: string;
  ok: boolean;
  error?: string;
}

/* ── Parsing helpers ──────────────────────────────────────────────────── */

/**
 * Build a Date from a YYYY-MM-DD + HH:mm IST wall time.
 * Copy of the punch route's buildLocalTimestamp (Task 162): the naive wall
 * time is interpreted as business-timezone (IST) time, never server time.
 */
function buildIstTimestamp(dateStr: string, timeStr: string): Date {
  const parsed = parseDeviceTimestamp(`${dateStr}T${timeStr}:00`);
  return parsed || new Date(`${dateStr}T${timeStr}:00Z`);
}

function hmToTimeStr(hm: { h: number; m: number }): string {
  return `${String(hm.h).padStart(2, '0')}:${String(hm.m).padStart(2, '0')}`;
}

/** 'HH:mm' | 'HH:mm:ss' | Date | Excel time fraction → {h, m}; null = absent; 'invalid' = malformed. */
function parseHm(value: unknown): { h: number; m: number } | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    // SheetJS cellDates builds Date objects with UTC methods
    return { h: value.getUTCHours(), m: value.getUTCMinutes() };
  }
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value < 1) {
    // Excel time fraction (0.354166… = 08:30)
    const totalMin = Math.round(value * 24 * 60);
    return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
  }
  if (typeof value !== 'string') return 'invalid';
  const raw = value.trim();
  if (!raw) return null;
  const match = TIME_RE.exec(raw);
  if (!match) return 'invalid';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return 'invalid';
  return { h, m };
}

/** Excel serial number → 'YYYY-MM-DD' (1900 date system, epoch 1899-12-30). */
function excelSerialToDayKey(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
  return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

/** Date cell (Date instance | Excel serial | string) → 'YYYY-MM-DD' day key. */
function dayKeyFromCellValue(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && isFinite(value)) {
    return excelSerialToDayKey(value);
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) return raw.replace(/\//g, '-');
    // 'DD/MM/YYYY' is common in Indian sheets — accepted only when unambiguous (day > 12)
    const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw);
    if (dmy) {
      const d = Number(dmy[1]);
      const m = Number(dmy[2]);
      if (d > 12 && m <= 12) {
        return `${dmy[3]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      return excelSerialToDayKey(serial);
    }
  }
  return null;
}

/** Normalize a Status cell; returns null when absent/empty, false when invalid. */
function normalizeStatusCell(value: unknown): string | null | false {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return null;
  return VALID_STATUSES.includes(raw) ? raw : false;
}

function buildCorrectionNote(reason: string, note: string): string {
  return `Payroll correction${reason ? ` — ${reason}` : ''}${note ? `: ${note}` : ''}`;
}

/* ── Row application ──────────────────────────────────────────────────── */

async function applyCorrectionRow(
  db: Awaited<ReturnType<typeof getDb>>,
  row: ParsedCorrectionRow,
  ctx: {
    resolveEmployee: (code: string) => EmployeeLite | null;
    changedBy: string;
    changedByIp: string | null;
    reason: string;
  },
): Promise<CorrectionRowResult> {
  const employee = ctx.resolveEmployee(row.employeeCode);
  if (!employee) {
    return { row: 0, employeeCode: row.employeeCode, date: row.dateKey, ok: false, error: 'Unknown employee code' };
  }

  // IST dual-convention lookup — never blindly create duplicates.
  const existing = await findAttendanceForLocalDay<ExistingAttendance>(db, employee.id, row.dateKey);

  const checkIn = row.checkInHm ? buildIstTimestamp(row.dateKey, hmToTimeStr(row.checkInHm)) : null;
  const checkOut = row.checkOutHm ? buildIstTimestamp(row.dateKey, hmToTimeStr(row.checkOutHm)) : null;

  const data: {
    status: string;
    checkIn?: Date;
    checkOut?: Date;
    workHours?: number;
    punchMethod: string;
    notes: string;
  } = {
    // Explicit status wins; when omitted the correction asserts presence
    // (punches given or a fresh row) but never demotes an existing valid
    // status that is left untouched by punches.
    status: row.explicitStatus
      || (checkIn || checkOut
        ? 'present'
        : existing?.status && VALID_STATUSES.includes(existing.status)
          ? existing.status
          : 'present'),
    punchMethod: 'manual',
    notes: [existing?.notes?.trim(), buildCorrectionNote(ctx.reason, row.note)].filter(Boolean).join(' | ').slice(0, 500),
  };
  if (checkIn) data.checkIn = checkIn;
  if (checkOut) data.checkOut = checkOut;

  // Recompute production hours when both punches are known after the merge,
  // minus any recorded break (mirrors the bulk-update route).
  const effIn = checkIn ?? existing?.checkIn ?? null;
  const effOut = checkOut ?? existing?.checkOut ?? null;
  if (effIn && effOut) {
    const breakMinutes = existing?.breakMinutes ?? 0;
    const hours = Math.max(0, (new Date(effOut).getTime() - new Date(effIn).getTime()) / 3600000 - breakMinutes / 60);
    data.workHours = Math.round(hours * 100) / 100;
  }

  const beforeData = existing
    ? { status: existing.status, checkIn: existing.checkIn, checkOut: existing.checkOut, workHours: existing.workHours, notes: existing.notes }
    : null;

  let record: { id: string; status: string; checkIn: Date | null; checkOut: Date | null; workHours: number | null; notes: string | null };
  if (existing) {
    record = await db.attendance.update({ where: { id: existing.id }, data });
  } else {
    record = await db.attendance.create({
      data: { employeeId: employee.id, date: canonicalAttendanceDate(row.dateKey), ...data },
    });
  }

  // Every payroll correction is audit-logged for the payroll audit trail.
  await db.attendanceAuditLog.create({
    data: {
      employeeId: employee.id,
      attendanceId: record.id,
      action: 'payroll_correction',
      beforeData: beforeData as object,
      afterData: { status: record.status, checkIn: record.checkIn, checkOut: record.checkOut, workHours: record.workHours, notes: record.notes },
      changedBy: ctx.changedBy,
      changedByIp: ctx.changedByIp,
      reason: (ctx.reason || 'Payroll attendance correction').slice(0, 300),
    },
  });

  return { row: 0, employeeCode: employee.employeeId, date: row.dateKey, ok: true };
}

/* ── POST ─────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can apply payroll attendance corrections', 403);

  const contentType = request.headers.get('content-type') || '';
  let reason = '';
  let entries: ParsedEntry[] = [];

  if (contentType.includes('multipart/form-data')) {
    // ── Excel upload path ──
    const form = await request.formData().catch(() => null);
    if (!form) return fail('Invalid form data', 400);

    const reasonField = form.get('reason');
    reason = typeof reasonField === 'string' ? reasonField.trim() : '';
    if (!reason) return fail('A correction reason is required', 422);

    const file = form.get('file');
    if (!(file instanceof File)) return fail('An .xlsx file is required', 422);
    if (!/\.(xlsx|xls)$/i.test(file.name)) return fail('Invalid file type. Only .xlsx files are supported.', 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      return fail('Could not read the Excel file — make sure it is a valid .xlsx workbook', 422);
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return fail('Excel file has no sheets', 422);

    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    if (sheetRows.length === 0) return fail('Excel file has no data rows', 422);
    if (sheetRows.length > MAX_ROWS) return fail(`Too many rows — maximum ${MAX_ROWS} per upload`, 422);

    // Flexible case-insensitive header mapping.
    const alias = (raw: string) => String(raw).trim().toLowerCase().replace(/[\s_-]+/g, '');
    const CODE_KEYS = new Set(['employeecode', 'employeeid', 'empcode', 'empid']);
    const IN_KEYS = new Set(['checkin', 'in', 'punchin']);
    const OUT_KEYS = new Set(['checkout', 'out', 'punchout']);
    const NOTE_KEYS = new Set(['note', 'notes', 'remarks']);

    entries = sheetRows.map((rawRow, index) => {
      const rowNumber = index + 2; // 1-based Excel row (single header row)
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawRow)) {
        const normalized = alias(key);
        if (CODE_KEYS.has(normalized)) mapped.employeeCode = value;
        else if (normalized === 'date') mapped.date = value;
        else if (IN_KEYS.has(normalized)) mapped.checkIn = value;
        else if (OUT_KEYS.has(normalized)) mapped.checkOut = value;
        else if (normalized === 'status') mapped.status = value;
        else if (NOTE_KEYS.has(normalized)) mapped.note = value;
      }

      const code = String(mapped.employeeCode ?? '').trim();
      const dateKey = dayKeyFromCellValue(mapped.date);
      const hasAnyContent = code || dateKey || mapped.checkIn || mapped.checkOut || mapped.status || String(mapped.note ?? '').trim();
      if (!hasAnyContent) return null; // ignore fully empty rows

      if (!code) return { rowNumber, error: 'Missing employee code' };
      if (!dateKey) return { rowNumber, error: 'Invalid or missing date — use YYYY-MM-DD' };

      const checkInHm = parseHm(mapped.checkIn);
      if (checkInHm === 'invalid') return { rowNumber, error: `Invalid Check In "${String(mapped.checkIn)}" — use HH:mm` };
      const checkOutHm = parseHm(mapped.checkOut);
      if (checkOutHm === 'invalid') return { rowNumber, error: `Invalid Check Out "${String(mapped.checkOut)}" — use HH:mm` };

      const status = normalizeStatusCell(mapped.status);
      if (status === false) return { rowNumber, error: `Invalid status "${String(mapped.status)}" — allowed: ${VALID_STATUSES.join(', ')}` };

      return {
        rowNumber,
        row: {
          employeeCode: code,
          dateKey,
          checkInHm: checkInHm || null,
          checkOutHm: checkOutHm || null,
          explicitStatus: status || null,
          note: String(mapped.note ?? '').trim(),
        },
      };
    }).filter((e): e is ParsedEntry => e !== null);
  } else {
    // ── Single-row JSON path ──
    const body = await parseBody(request);
    if (!body) return fail('Invalid JSON');

    reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const employeeCode = typeof body.employeeCode === 'string' ? body.employeeCode.trim() : '';
    const dateRaw = typeof body.date === 'string' ? body.date.trim() : '';
    if (!employeeCode) return fail('employeeCode is required', 422);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return fail('date must be YYYY-MM-DD', 422);

    const checkInHm = parseHm(body.checkIn ?? '');
    if (checkInHm === 'invalid') return fail('checkIn must be HH:mm (24h) or null', 422);
    const checkOutHm = parseHm(body.checkOut ?? '');
    if (checkOutHm === 'invalid') return fail('checkOut must be HH:mm (24h) or null', 422);

    const statusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
    let explicitStatus: string | null = null;
    if (statusRaw && statusRaw !== 'auto') {
      if (!VALID_STATUSES.includes(statusRaw)) {
        return fail(`Invalid status — allowed: ${VALID_STATUSES.join(', ')}`, 422);
      }
      explicitStatus = statusRaw;
    }

    entries = [{
      rowNumber: 1,
      row: {
        employeeCode,
        dateKey: dateRaw,
        checkInHm: checkInHm || null,
        checkOutHm: checkOutHm || null,
        explicitStatus,
        note: typeof body.note === 'string' ? body.note.trim() : '',
      },
    }];
  }

  // Resolve employees once — active employees only, exact code match first,
  // then a case-insensitive fallback for sloppy spreadsheets.
  const employees = await db.employee.findMany({
    where: { status: 'active' },
    select: { id: true, employeeId: true },
  });
  const byCode = new Map<string, EmployeeLite>();
  const byCodeLower = new Map<string, EmployeeLite>();
  for (const e of employees) {
    const code = e.employeeId.trim();
    byCode.set(code, e);
    byCodeLower.set(code.toLowerCase(), e);
  }
  const resolveEmployee = (code: string): EmployeeLite | null =>
    byCode.get(code) || byCodeLower.get(code.toLowerCase()) || null;

  const changedBy = String(user.email || user.userId || user.id || 'system');
  const changedByIp = request.headers.get('x-forwarded-for');

  const results: CorrectionRowResult[] = [];
  const appliedDates: string[] = [];

  for (const entry of entries) {
    if ('error' in entry) {
      results.push({ row: entry.rowNumber, employeeCode: '', date: '', ok: false, error: entry.error });
      continue;
    }
    try {
      const result = await applyCorrectionRow(db, entry.row, { resolveEmployee, changedBy, changedByIp: changedByIp || null, reason });
      results.push({ ...result, row: entry.rowNumber });
      if (result.ok) appliedDates.push(entry.row.dateKey);
    } catch (e: unknown) {
      results.push({ row: entry.rowNumber, employeeCode: entry.row.employeeCode, date: entry.row.dateKey, ok: false, error: e instanceof Error ? e.message : 'Update failed' });
    }
  }

  const applied = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  // One notification per apply — Admin/HR are informed and can review the
  // audit trail at /payroll/attendance-corrections. Never fail the request
  // on notification errors.
  let notified = false;
  const tenantId = (user.tenantId as string) || '';
  if (applied > 0 && tenantId) {
    try {
      const { dispatchToRoles } = await import('@/lib/notification-center');
      const sorted = [...new Set(appliedDates)].sort();
      const period = sorted.length === 0
        ? '—'
        : sorted.length === 1
          ? sorted[0]
          : `${sorted[0]} to ${sorted[sorted.length - 1]}`;
      const actorUserId = (user.userId as string) || (user.id as string) || '';
      await dispatchToRoles({
        tenantId,
        module: 'payroll',
        eventKey: 'payroll.attendance_corrected',
        recipients: actorUserId ? [{ userId: actorUserId }] : [],
        roles: ['hr_admin', 'admin', 'tenant_admin', 'ceo'],
        vars: {
          Applied_By: user.name || user.email || 'Payroll manager',
          Rows_Applied: applied,
          Rows_Failed: failed,
          Correction_Period: period,
          Correction_Reason: reason || '—',
        },
        entity: { type: 'payroll_attendance_correction', id: 'n/a', link: '/payroll/attendance-corrections' },
      });
      notified = true;
    } catch (notificationError) {
      console.warn('[payroll/attendance-corrections] notification failed:', notificationError);
    }
  }

  return ok({ applied, failed, results, notified }, failed > 0 && applied === 0 ? 422 : 200);
}

/* ── GET — audit trail ────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can view the payroll attendance audit trail', 403);

  const includeMass = new URL(request.url).searchParams.get('includeMass') === '1';
  const logs = await db.attendanceAuditLog.findMany({
    where: { action: { in: includeMass ? ['payroll_correction', 'mass_correction'] : ['payroll_correction'] } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
  });

  return ok({ logs });
}
