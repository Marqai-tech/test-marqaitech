import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { safeAuditLog } from '@/lib/audit-safe';
import { sendEmail } from '@/lib/email';
import { attendanceLocalMinutes, effectiveBreakMinutes, loadAttendanceBreakPolicy } from '@/lib/attendance-break-rules';
import { detectAndAlertSuspiciousPunch } from '@/lib/suspicious-punch';
import { ensureEmployeeRemoteColumns } from '@/lib/employee-remote-columns';

/**
 * POST /api/attendance/punch
 *
 * Unified punch endpoint for check-in / check-out / break-in / break-out
 * with GPS auto-capture. Every punch is written to:
 *   (a) the Attendance row (updated with the relevant timestamp + GPS fields)
 *   (b) the PunchEvent table (one row per event — used by the punch-log report)
 *
 * Body:
 *   {
 *     employeeId: string,
 *     action: 'checkin' | 'checkout' | 'breakin' | 'breakout',
 *     date: 'YYYY-MM-DD' (employee LOCAL calendar date),
 *     localTime: 'HH:mm' (employee LOCAL time, 24h format),
 *     gps?: { lat: number, lng: number, accuracy?: number, label?: string } | null,
 *     method?: 'mobile' | 'web' (default 'mobile' when gps is present, else 'web').
 *              Task 108: 'biometric' and 'manual_edit' are REJECTED on this
 *              route — device punches use /api/attendance/biometric (with its
 *              own device token) and manual edits use the admin routes. This
 *              prevents anyone from bypassing the remote check-in permission
 *              gate by declaring a different method.
 *     notes?: string
 *   }
 *
 * Task 108 — REMOTE CHECK-IN GATING (WFH pre-approval):
 *   Mobile/web punches (check-in, check-out, break-in, break-out) are only
 *   accepted when an admin has enabled the matching per-employee flag
 *   (Employee.mobileCheckInEnabled / Employee.webCheckInEnabled) from
 *   Attendance → Remote Check-In. Everyone else must use the office
 *   biometric device. Authorized remote punches keep full GPS recording;
 *   geofence radius no longer REJECTS them (WFH employees are legitimately
 *   outside the office) but the inside/outside distance is stored for audit.
 *   Punches whose coordinates exactly match the geofence center are flagged
 *   "[GeoAudit]" — real GPS never reproduces the office pin to 6 decimals.
 *
 * Returns: { ok: true, event: { type, timestamp, gps? }, attendance: {...} }
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Keep HRMS button punches visible in Attendance → Biometric → Punches.
 * This is an internal audit record only; it never attempts to write a punch
 * back to the physical BIO-PARK terminal or Team Office.
 */
async function recordManualBiometricAudit(
  db: any,
  params: { employeeId: string; action: string; timestamp: Date; attendanceId: string; method: string; notes?: string | null },
) {
  if (params.method === 'biometric') return;

  const device = await db.biometricDevice.upsert({
    where: { serialNumber: 'HRMS-MANUAL-PUNCHES' },
    create: {
      name: 'Manual HRMS',
      serialNumber: 'HRMS-MANUAL-PUNCHES',
      vendor: 'custom',
      model: 'HRMS manual attendance audit',
      apiTokenHash: createHash('sha256').update('hrms-manual-attendance-audit').digest('hex'),
      isActive: true,
    },
    update: { isActive: true },
    select: { id: true },
  });

  const punchType = params.action === 'checkin' ? 'check_in'
    : params.action === 'checkout' ? 'check_out'
      : params.action === 'breakin' ? 'break_in'
        : 'break_out';

  await db.biometricPunch.create({
    data: {
      deviceId: device.id,
      employeeId: params.employeeId,
      attendanceId: params.attendanceId,
      punchType,
      punchTime: params.timestamp,
      rawPayload: {
        source: 'manual_hrms',
        method: params.method,
        action: params.action,
        notes: params.notes || null,
      },
    },
  });
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/** Build a Date object from a YYYY-MM-DD + HH:mm.
 * Task 69 FIX: the old code used `new Date('YYYY-MM-DDTHH:mm:00')` which
 * parses as the SERVER's local timezone (UTC on Vercel). This caused the
 * IST time sent by the client (e.g., 12:08 PM IST) to be interpreted as
 * 12:08 PM UTC. When the browser read it back, it added +5:30 → displayed
 * 5:38 PM instead of 12:08 PM.
 *
 * The fix: the client now also sends `utcTimestamp` (the result of
 * `new Date().toISOString()` in the browser, which is the correct UTC
 * representation of the current instant). The server prefers this field.
 * For backward compatibility, if `utcTimestamp` is not present, we fall
 * back to `buildLocalTimestamp(date, localTime)` — but this path has the
 * timezone bug and should be avoided.
 */
function buildLocalTimestamp(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

async function resolvePunchGeofences(db: any, tenantId: string | null) {
  const configured = await db.geofence.findMany({
    where: { isActive: true },
    select: { name: true, centerLat: true, centerLng: true, radiusMeters: true },
  }).catch(() => []);
  if (configured.length > 0) return configured;

  // Fallback for the configured office location. It is scoped by tenant slug
  // so local QA and production use the same office pin without changing DB data.
  if (tenantId) {
    const tenant = await getPlatformDb().tenant.findUnique({
      where: { id: tenantId }, select: { slug: true },
    }).catch(() => null);
    if (tenant?.slug === 'test-tenant' || tenant?.slug === 'marqaitechgroup') {
      return [{ name: tenant.slug === 'test-tenant' ? 'QA Test Tenant office' : 'MarqAI Tech office', centerLat: 13.098275, centerLng: 77.585622, radiusMeters: 200 }];
    }
  }
  return [];
}

/** ALTER TABLE helper — adds the Task 57 columns to Attendance if missing */
async function ensureAttendanceColumns(db: any) {
  const cols = [
    ['"breakIn"', 'TIMESTAMP(3)'],
    ['"breakOut"', 'TIMESTAMP(3)'],
    ['"breakMinutes"', 'INTEGER'],
    ['"checkInGpsLat"', 'DOUBLE PRECISION'],
    ['"checkInGpsLng"', 'DOUBLE PRECISION'],
    ['"checkInGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"checkInGpsLabel"', 'TEXT'],
    ['"checkOutGpsLat"', 'DOUBLE PRECISION'],
    ['"checkOutGpsLng"', 'DOUBLE PRECISION'],
    ['"checkOutGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"checkOutGpsLabel"', 'TEXT'],
    ['"breakInGpsLat"', 'DOUBLE PRECISION'],
    ['"breakInGpsLng"', 'DOUBLE PRECISION'],
    ['"breakInGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"breakInGpsLabel"', 'TEXT'],
    ['"breakOutGpsLat"', 'DOUBLE PRECISION'],
    ['"breakOutGpsLng"', 'DOUBLE PRECISION'],
    ['"breakOutGpsAccuracy"', 'DOUBLE PRECISION'],
    ['"breakOutGpsLabel"', 'TEXT'],
    ['"punchMethod"', 'TEXT'],
    ['"earlyLogout"', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ];
  for (const [col, type] of cols) {
    await db.$executeRawUnsafe(`ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS ${col} ${type}`).catch(() => null);
  }
}

/** Create PunchEvent table if missing */
async function ensurePunchEventTable(db: any) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PunchEvent" (
      "id" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "date" TIMESTAMP(3) NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL,
      "gpsLat" DOUBLE PRECISION,
      "gpsLng" DOUBLE PRECISION,
      "gpsAccuracy" DOUBLE PRECISION,
      "gpsLabel" TEXT,
      "method" TEXT,
      "notes" TEXT,
      "deviceId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      CONSTRAINT "PunchEvent_pkey" PRIMARY KEY ("id")
    )
  `).catch(() => null);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PunchEvent_employeeId_idx" ON "PunchEvent"("employeeId")`).catch(() => null);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PunchEvent_date_idx" ON "PunchEvent"("date")`).catch(() => null);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PunchEvent_type_idx" ON "PunchEvent"("type")`).catch(() => null);
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const scope = await resolveCompanyScope(request);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    let { employeeId, action, date, localTime, utcTimestamp, gps, notes, mode } = body;

    if (!employeeId || !action || !date || (!localTime && !utcTimestamp)) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, action, date, localTime (or utcTimestamp)' },
        { status: 400, headers: corsHeaders() },
      );
    }
    const validActions = ['checkin', 'checkout', 'breakin', 'breakout', 'set_early_logout'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Ensure schema is up-to-date (idempotent ALTERs)
    await ensureAttendanceColumns(db);
    await ensurePunchEventTable(db);
    // Task 108: tenant DBs may lack the Employee remote check-in columns —
    // create them before the employee lookup reads the flags.
    await ensureEmployeeRemoteColumns(db);

    // Verify employee exists + scope-permit
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true, companyId: true, userId: true, employeeId: true, firstName: true, lastName: true, email: true,
        // Task 108: remote check-in pre-approval flags
        wfhPreApproved: true, mobileCheckInEnabled: true, webCheckInEnabled: true,
        // Task 109: holiday/weekend punch policy flag
        holidayWeekendPunchEnabled: true,
      },
    }).catch(async () => {
      // Columns may not exist yet on a cold DB — retry without them so the
      // punch route degrades to legacy behavior instead of 500ing.
      return db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, companyId: true, userId: true, employeeId: true, firstName: true, lastName: true, email: true },
      });
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── Task 108: method whitelist ───
    // Only the two remote channels may punch through this route. Anything
    // else (biometric / manual_edit / spoofed values) is rejected so the
    // permission gate below cannot be bypassed by renaming the method.
    const rawMethod = typeof body.method === 'string' ? body.method.toLowerCase() : '';
    if (rawMethod && rawMethod !== 'mobile' && rawMethod !== 'web') {
      return NextResponse.json(
        { error: `Method '${body.method}' is not allowed on the punch endpoint. Use the office biometric device for attendance.`, code: 'INVALID_PUNCH_METHOD' },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ─── Task 108: REMOTE CHECK-IN PERMISSION GATE ───
    // Mobile app punches = 'mobile', browser punches = 'web'. Both are
    // remote channels that require an explicit employee-wise WFH
    // pre-approval from admin/management (Attendance → Remote Check-In).
    // Applies to check-in, check-out, break-in AND break-out.
    const method = rawMethod || (gps && gps.lat != null ? 'mobile' : 'web');
    const punchActions = ['checkin', 'checkout', 'breakin', 'breakout', 'entry'];
    if (punchActions.includes(action)) {
      // Columns may be missing on a lagging DB (legacy select fallback) —
      // treat undefined as NOT enabled (fail-closed).
      const channelAllowed = method === 'mobile'
        ? (employee as Record<string, unknown>).mobileCheckInEnabled === true
        : (employee as Record<string, unknown>).webCheckInEnabled === true;
      if (!channelAllowed) {
        const channel = method === 'mobile' ? 'Mobile check-in' : 'Web check-in';
        return NextResponse.json(
          {
            error: `${channel} is not enabled for your account. Mobile/Web check-in requires work-from-home pre-approval from admin/management. Please mark attendance using the office biometric device or contact your administrator.`,
            code: 'REMOTE_CHECKIN_NOT_ENABLED',
            permission: method,
          },
          { status: 403, headers: corsHeaders() },
        );
      }
    }
    // ─── Task 109: HOLIDAY / WEEKEND PUNCH GATE ───
    // Business rule: working on a holiday or a weekend requires prior
    // approval from the admin or the immediate approver. Biometric punches
    // on holidays are ALWAYS recorded (separate device webhook — never
    // blocked); this gate governs the remote channels only (mobile app +
    // web check-in / breaks). Admins can open holidays & weekends free for
    // a specific employee from Attendance → Remote Check-In
    // (holidayWeekendPunchEnabled) — that toggle bypasses the request
    // requirement. Otherwise an APPROVED HOLIDAY_WORK request covering the
    // date unlocks the punch.
    let holidayName: string | null = null;
    let isWeekendDay = false;
    if (punchActions.includes(action)) {
      const gateDate = new Date(`${date}T00:00:00`);
      if (!Number.isNaN(gateDate.getTime())) {
        const dow = gateDate.getDay(); // 0 = Sunday, 6 = Saturday
        isWeekendDay = dow === 0 || dow === 6;
        try {
          const holidayWhere: Record<string, unknown> = {
            date: { gte: gateDate, lt: new Date(gateDate.getTime() + 86400000) },
          };
          if (employee.companyId) holidayWhere.companyId = employee.companyId;
          const holiday = await db.holiday.findFirst({ where: holidayWhere, select: { name: true } }).catch(() => null);
          if (holiday) holidayName = holiday.name;
        } catch { holidayName = null; }
        if (isWeekendDay || holidayName) {
          const freePunch = (employee as Record<string, unknown>).holidayWeekendPunchEnabled === true;
          let holidayApproved = false;
          if (!freePunch) {
            const approvedRequest = await db.attendanceRequest.findFirst({
              where: {
                employeeId,
                requestType: 'HOLIDAY_WORK',
                status: 'approved',
                startDate: { lte: gateDate },
                OR: [{ endDate: null }, { endDate: { gte: gateDate } }],
              },
              select: { id: true },
            }).catch(() => null);
            holidayApproved = !!approvedRequest;
          }
          if (!freePunch && !holidayApproved) {
            return NextResponse.json({
              error: `Working on ${holidayName ? `the holiday "${holidayName}"` : 'a weekend'} requires prior approval. Please raise a Holiday / Weekend Work request to your admin or immediate approver (Attendance → Requests). Biometric punches on holidays are always recorded.`,
              code: 'HOLIDAY_WORK_APPROVAL_REQUIRED',
              date,
              holiday: holidayName,
              weekend: isWeekendDay,
            }, { status: 403, headers: corsHeaders() });
          }
        }
      }
    }

    // Self-scope users can only punch for themselves
    if (scope.scope === 'self' && employee.userId !== scope.userId) {
      return NextResponse.json({ error: 'You can only punch for yourself' }, { status: 403, headers: corsHeaders() });
    }

    // Task 69 FIX: prefer utcTimestamp (sent by the browser as
    // new Date().toISOString()) which correctly represents the instant in UTC.
    // Fallback to buildLocalTimestamp(date, localTime) for backward compat
    // (this path has the timezone bug — server interprets IST time as UTC).
    const timestamp = utcTimestamp ? new Date(utcTimestamp) : buildLocalTimestamp(date, localTime);
    if (Number.isNaN(timestamp.getTime())) {
      return NextResponse.json({ error: 'Invalid date/time' }, { status: 400, headers: corsHeaders() });
    }
    const dateObj = new Date(`${date}T00:00:00`); // calendar date at local midnight
    const [localHour, localMinute] = String(localTime || '').split(':').map(Number);
    const localMinutes = Number.isFinite(localHour) && Number.isFinite(localMinute) ? localHour * 60 + localMinute : null;

    const gpsLat = gps && gps.lat != null ? Number(gps.lat) : null;
    const gpsLng = gps && gps.lng != null ? Number(gps.lng) : null;
    const gpsAccuracy = gps && gps.accuracy != null ? Number(gps.accuracy) : null;
    const gpsLabel = gps && gps.label ? String(gps.label) : null;

    const existingBeforeRules = await db.attendance.findFirst({ where: { employeeId, date: dateObj } });
    const beforeLunch = localMinutes !== null && localMinutes < 13 * 60 + 30;
    const afterLunchBeforeClose = localMinutes !== null && localMinutes >= 13 * 60 + 30 && localMinutes < 18 * 60 + 30;
    if (action !== 'checkin' && action !== 'set_early_logout') {
      if (beforeLunch || (afterLunchBeforeClose && existingBeforeRules?.breakIn && action !== 'breakout')) action = 'entry';
      else if (localMinutes !== null && localMinutes >= 18 * 60 + 30) action = 'checkout';
    }
    if (action === 'entry') {
      const eventId = `pe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "PunchEvent" ("id", "employeeId", "type", "date", "timestamp", "gpsLat", "gpsLng", "gpsAccuracy", "gpsLabel", "method", "notes", "createdAt") VALUES ($1,$2,'entry',$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        eventId, employeeId, dateObj, timestamp, gpsLat, gpsLng, gpsAccuracy, gpsLabel, method, notes || null,
      );
      return NextResponse.json({ ok: true, event: { id: eventId, type: 'entry', timestamp }, message: 'Entry punch recorded.' }, { headers: corsHeaders() });
    }
    if (action === 'breakin' && localMinutes !== null && localMinutes < 13 * 60 + 30) {
      return NextResponse.json({ error: 'Break-In is available from 1:30 PM onward.' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'breakin' && !existingBeforeRules?.checkIn) {
      return NextResponse.json({ error: 'You must Check-In before starting a break.' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'breakout' && !existingBeforeRules?.breakIn) {
      return NextResponse.json({ error: 'You must record Break-In before Break-Out.' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'checkout' && (!existingBeforeRules?.checkIn || (existingBeforeRules?.checkOut && !(localMinutes !== null && localMinutes >= 18 * 60 + 30)))) {
      return NextResponse.json({ error: existingBeforeRules?.checkOut ? 'Already checked out today.' : 'You must Check-In before checking out.' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'set_early_logout') {
      if (!existingBeforeRules?.checkIn || existingBeforeRules?.checkOut) return NextResponse.json({ error: 'Early Logout is available only after Check-In and before Check-Out.' }, { status: 400, headers: corsHeaders() });
      const updated = await db.attendance.update({ where: { id: existingBeforeRules.id }, data: { earlyLogout: true, updatedAt: new Date() } as any });
      return NextResponse.json({ ok: true, attendance: updated, message: 'Early Logout enabled. Your next punch will be Check-Out.' }, { headers: corsHeaders() });
    }

    // GPS is mandatory for employee check-in/out. Validate before creating or
    // updating Attendance so denied/unavailable punches never persist.
    //
    // Task 108 geofence semantics: employees reaching this point ARE
    // remote-check-in authorized (WFH pre-approved), so the office radius no
    // longer REJECTS the punch — a WFH employee is legitimately outside the
    // radius. Instead the exact distance to the nearest geofence is computed
    // and recorded: inside → office presence evidence; outside → explicit
    // "[Remote WFH]" audit note; distance < 1m → "[GeoAudit]" mock-location
    // flag (real GPS never reproduces the office pin to 6 decimals).
    let geofenceAuditNote: string | null = null;
    if (action === 'checkin' || action === 'checkout') {
      if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng)) {
        return NextResponse.json(
          { error: 'Location access is required to check in/check out. Please enable location access and try again.' },
          { status: 400, headers: corsHeaders() },
        );
      }
      const geofences = await resolvePunchGeofences(db, scope.tenantId || null);
      if (geofences.length === 0) {
        return NextResponse.json(
          { error: 'Office location is not configured for this tenant. Please contact your administrator.' },
          { status: 409, headers: corsHeaders() },
        );
      }
      const distances = geofences.map((geofence: { centerLat: number; centerLng: number; radiusMeters: number }) => ({
        distance: haversineMeters(gpsLat!, gpsLng!, Number(geofence.centerLat), Number(geofence.centerLng)),
        radius: Number(geofence.radiusMeters),
      }));
      const nearest = distances.reduce((a, b) => (a.distance <= b.distance ? a : b));
      const inside = nearest.distance <= nearest.radius;
      if (!inside) {
        geofenceAuditNote = `[Remote WFH] Punch recorded ${Math.round(nearest.distance)}m outside the office geofence (${nearest.radius}m radius) — authorized remote check-in.`;
      } else if (nearest.distance < 1) {
        // Physically implausible for real GPS: consumer devices carry 3-30m
        // jitter, so a coordinate IDENTICAL to the fence center (two punches
        // from different employees matching the pin to 6 decimals, accuracy
        // exactly 10m) indicates a declared/mock location. Recorded, not
        // rejected — HR decides; visible in notes + punch log.
        geofenceAuditNote = '[GeoAudit] Coordinates exactly match the office geofence center — flagged for verification (possible mock/declared location).';
      }
      // Task 113 — attendance mode declared in the app (design #12: Office /
      // Out Side toggle). Audit-only: recorded in the notes trail so HR can
      // see the user's declared context next to the geofence evidence.
      if (mode === 'outside' || mode === 'office') {
        const modeTag = `[Mode: ${mode === 'outside' ? 'Outside' : 'Office'} — user-declared in app]`;
        geofenceAuditNote = geofenceAuditNote ? `${modeTag} ${geofenceAuditNote}` : modeTag;
      }
    }

    // 1. Upsert the Attendance row with the relevant timestamp + GPS fields
    const attUpdate: Record<string, unknown> = {
      updatedAt: new Date(),
      punchMethod: method,
    };
    if (geofenceAuditNote) {
      attUpdate.notes = existingBeforeRules?.notes
        ? `${existingBeforeRules.notes} ${geofenceAuditNote}`
        : geofenceAuditNote;
    }
    if (action === 'checkin') {
      attUpdate.checkIn = timestamp;
      attUpdate.checkInGpsLat = gpsLat;
      attUpdate.checkInGpsLng = gpsLng;
      attUpdate.checkInGpsAccuracy = gpsAccuracy;
      attUpdate.checkInGpsLabel = gpsLabel;
      attUpdate.location = gpsLabel || (gpsLat != null ? `${gpsLat.toFixed(6)},${gpsLng!.toFixed(6)}` : null);
      const graceCutoff = 10 * 60;
      const late = localMinutes !== null && localMinutes > graceCutoff;
      let monthlyLateCount = 0;
      if (late) {
        const monthStart = new Date(`${date.slice(0, 7)}-01T00:00:00`);
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        monthlyLateCount = await db.attendance.count({ where: { employeeId, date: { gte: monthStart, lt: nextMonth }, status: 'late' } }).catch(() => 0);
      }
      attUpdate.status = late && monthlyLateCount >= 3 ? 'half_day' : late ? 'late' : 'present';
      if (late && monthlyLateCount >= 3) attUpdate.notes = 'Fourth late arrival this month: attendance automatically marked Half-Day.';
    } else if (action === 'checkout') {
      attUpdate.checkOut = timestamp;
      attUpdate.checkOutGpsLat = gpsLat;
      attUpdate.checkOutGpsLng = gpsLng;
      attUpdate.checkOutGpsAccuracy = gpsAccuracy;
      attUpdate.checkOutGpsLabel = gpsLabel;
      // Compute workHours + breakMinutes + overtime on checkout
      // (will be finalized below once we have the existing breakIn/breakOut)
    } else if (action === 'breakin') {
      attUpdate.breakIn = timestamp;
      attUpdate.breakInGpsLat = gpsLat;
      attUpdate.breakInGpsLng = gpsLng;
      attUpdate.breakInGpsAccuracy = gpsAccuracy;
      attUpdate.breakInGpsLabel = gpsLabel;
    } else if (action === 'breakout') {
      attUpdate.breakOut = timestamp;
      attUpdate.breakOutGpsLat = gpsLat;
      attUpdate.breakOutGpsLng = gpsLng;
      attUpdate.breakOutGpsAccuracy = gpsAccuracy;
      attUpdate.breakOutGpsLabel = gpsLabel;
    }

    // Upsert by (employeeId, date) — the unique constraint
    // First, see if a row exists
    const existing = await db.attendance.findFirst({
      where: { employeeId, date: dateObj },
    });

    let attendance: any;
    if (existing) {
      // Merge the update
      attendance = await db.attendance.update({
        where: { id: existing.id },
        data: attUpdate,
      });
    } else {
      // Create with the action timestamp + GPS
      attendance = await db.attendance.create({
        data: {
          employeeId,
          date: dateObj,
          status: action === 'checkin' ? 'present' : 'present',
          ...attUpdate,
        } as any,
      });
    }

    // On checkout or breakout: recompute derived fields (workHours, breakMinutes, overtime)
    if (action === 'checkout' || action === 'breakout') {
      const refreshed = await db.attendance.findUnique({ where: { id: attendance.id } });
      if (refreshed?.checkIn && refreshed?.checkOut) {
        const breakPolicy = await loadAttendanceBreakPolicy(db);
        // BUG_069 fix (manual route): Always calculate workHours when both
        // checkIn + checkOut exist, regardless of current server time.
        // Previously gated by `canFinalize` (current time >= 6:30 PM), which
        // meant early checkouts got workHours = null → dashboard showed
        // "Present" instead of "Below 8 hours — regularization required".
        const spanMs = refreshed.checkOut.getTime() - refreshed.checkIn.getTime();
        const spanMinutes = Math.max(0, Math.round(spanMs / 60000));
        const breakMinutes = effectiveBreakMinutes(refreshed.breakIn, refreshed.breakOut, refreshed.checkIn, refreshed.checkOut, breakPolicy);
        const workMinutes = Math.max(0, spanMinutes - breakMinutes);
        const workHours = Math.round((workMinutes / 60) * 100) / 100;
        // OT: anything over 480 min (8h) — simple default; the Shift's
        // otThresholdMinutes would override when the shift is linked.
        const otMinutes = Math.max(0, workMinutes - 480);
        const overtime = Math.round((otMinutes / 60) * 100) / 100;
        const preservedHalfDay = attendance.status === 'half_day';
        const fourthLate = (attendance.notes || '').includes('Fourth late arrival');
        const lowProduction = workHours < 8;
        const combinedNotes = [
          fourthLate ? 'Fourth late arrival this month: attendance automatically marked Half-Day.' : '',
          lowProduction ? 'Net working time is below the required 8 hours. Apply Attendance Regularization for full-day correction.' : '',
        ].filter(Boolean).join(' ');
        await db.attendance.update({
          where: { id: attendance.id },
          data: {
            workHours: workHours,
            breakMinutes,
            overtime,
            status: workHours < 8 ? 'half_day' : (preservedHalfDay ? 'half_day' : attendance.status),
            notes: combinedNotes || attendance.notes,
          },
        });
        attendance = { ...attendance, workHours, breakMinutes, overtime };
      }
    }

    // Surface automatic attendance penalties to the employee and HR. These
    // are in-app notifications; the existing notification center can fan out
    // email when the tenant has email delivery enabled.
    if (action === 'checkin' || action === 'checkout' || action === 'breakout') {
      const automaticHalfDay = attendance?.status === 'half_day';
      if (automaticHalfDay && scope.tenantId) {
        try {
          const hrUsers = await db.user.findMany({
            where: { tenantId: scope.tenantId, role: { in: ['admin', 'tenant_admin', 'hr_admin', 'hr'] } },
            select: { id: true, email: true },
          });
          const recipientIds = Array.from(new Set([employee.userId, ...hrUsers.map((u: { id: string }) => u.id)].filter(Boolean)));
          if (recipientIds.length) {
            await db.notification.createMany({
              data: recipientIds.map((userId: string) => ({
                tenantId: scope.tenantId,
                userId,
                title: 'Attendance marked half-day',
                message: `Attendance for ${date} is marked half-day. Submit regularization for HR approval if a full-day correction is required.`,
                type: 'warning',
                category: 'attendance',
                link: '/attendance/regularize',
              })),
            });
          }
          const emailRecipients = Array.from(new Set([
            employee.email,
            ...hrUsers.map((u: { email?: string | null }) => u.email),
          ].filter((email): email is string => Boolean(email))));
          if (emailRecipients.length && existingBeforeRules?.status !== 'half_day') {
            await sendEmail({
              to: emailRecipients,
              subject: `Attendance action required: half-day on ${date}`,
              html: `<p>Attendance for ${date} has been marked half-day for ${employee.firstName} ${employee.lastName}.</p><p>This may be due to the fourth late arrival of the month or production time below eight hours. Please submit regularization for HR approval.</p>`,
            });
          }
        } catch (notificationError) {
          console.warn('[punch] automatic half-day notification failed (non-fatal):', notificationError);
        }
      }
    }

    // ─── Task 109: suspicious-punch detection + admin alerts (non-fatal) ───
    // Exact-pin mock signatures, coordinates shared between employees, and
    // holiday/weekend punches are flagged to admins in-app + by email.
    if (['checkin', 'checkout', 'breakin', 'breakout'].includes(action)) {
      await detectAndAlertSuspiciousPunch({
        db,
        tenantId: scope.tenantId || null,
        employee: {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          userId: employee.userId,
        },
        dateStr: date,
        action,
        method,
        gpsLat,
        gpsLng,
        holidayName,
        isWeekend: isWeekendDay,
      }).catch(() => null);
    }

    // Mirror HRMS button actions into the Biometric Punches audit. This gives
    // staff one attendance timeline while keeping the physical device history
    // clearly separate as BIO-PARK / Team Office records.
    try {
      await recordManualBiometricAudit(db, {
        employeeId,
        action,
        timestamp,
        attendanceId: attendance.id,
        method,
        notes,
      });
    } catch (e) {
      console.warn('[punch] Manual biometric audit insert failed (non-fatal):', (e as Error).message);
    }

    // 2. Insert the PunchEvent row for the activity log
    let punchEvent: any = null;
    try {
      // Use raw SQL since the Prisma client may not know about PunchEvent yet
      // (generated after prisma generate)
      const eventId = `pe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "PunchEvent" ("id", "employeeId", "type", "date", "timestamp", "gpsLat", "gpsLng", "gpsAccuracy", "gpsLabel", "method", "notes", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        eventId,
        employeeId,
        action,
        dateObj,
        timestamp,
        gpsLat,
        gpsLng,
        gpsAccuracy,
        gpsLabel,
        method,
        notes || null,
      );
      punchEvent = { id: eventId, type: action, timestamp, gpsLat, gpsLng, method };
    } catch (e) {
      console.warn('[punch] PunchEvent insert failed (non-fatal):', (e as Error).message);
    }

    // 3. Audit log
    await safeAuditLog(db, {
      userId: scope.userId,
      action: `ATTENDANCE_PUNCH_${action.toUpperCase()}`,
      module: 'attendance',
      details: `${action} for employee ${employee.employeeId} at ${timestamp.toISOString()}${gpsLat != null ? ` (GPS: ${gpsLat.toFixed(6)},${gpsLng!.toFixed(6)})` : ''}`,
    });

    const userMessage = action === 'breakin' && localMinutes !== null && localMinutes < 13 * 60 + 30
      ? 'Early Break-In recorded. The official break starts at 1:30 PM; taking break early may reduce production time.'
      : action === 'breakout' && localMinutes !== null && localMinutes < 14 * 60 + 30
        ? 'Break-Out recorded. Production hours start at 2:30 PM.'
        : undefined;
    return NextResponse.json({
      ok: true,
      event: punchEvent,
      attendance,
      timestamp: timestamp.toISOString(),
      ...(userMessage ? { message: userMessage } : {}),
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[punch] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() },
    );
  }
}

/**
 * GET /api/attendance/punch (debug) — returns the latest PunchEvent rows for
 * the authenticated user. Useful for sanity-checking the schema is live.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    await ensurePunchEventTable(db);
    const rows = await db.$queryRawUnsafe(
      `SELECT pe."id", pe."type", pe."timestamp", pe."gpsLat", pe."gpsLng", pe."gpsAccuracy", pe."gpsLabel", pe."method"
       FROM "PunchEvent" pe
       ORDER BY pe."timestamp" DESC
       LIMIT 20`,
    ) as any[];
    return NextResponse.json({ events: rows }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[punch] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
