import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { safeAuditLog } from '@/lib/audit-safe';

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
 *     method?: 'mobile' | 'web' | 'biometric' | 'manual_edit' (default 'mobile' when gps is present, else 'web'),
 *     notes?: string
 *   }
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
    const { employeeId, action, date, localTime, utcTimestamp, gps, notes } = body;

    if (!employeeId || !action || !date || (!localTime && !utcTimestamp)) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, action, date, localTime (or utcTimestamp)' },
        { status: 400, headers: corsHeaders() },
      );
    }
    const validActions = ['checkin', 'checkout', 'breakin', 'breakout'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Ensure schema is up-to-date (idempotent ALTERs)
    await ensureAttendanceColumns(db);
    await ensurePunchEventTable(db);

    // Verify employee exists + scope-permit
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, userId: true, employeeId: true, firstName: true, lastName: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
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

    const method = body.method || (gps && gps.lat != null ? 'mobile' : 'web');
    const gpsLat = gps && gps.lat != null ? Number(gps.lat) : null;
    const gpsLng = gps && gps.lng != null ? Number(gps.lng) : null;
    const gpsAccuracy = gps && gps.accuracy != null ? Number(gps.accuracy) : null;
    const gpsLabel = gps && gps.label ? String(gps.label) : null;

    // 1. Upsert the Attendance row with the relevant timestamp + GPS fields
    const attUpdate: Record<string, unknown> = {
      updatedAt: new Date(),
      punchMethod: method,
    };
    if (action === 'checkin') {
      attUpdate.checkIn = timestamp;
      attUpdate.checkInGpsLat = gpsLat;
      attUpdate.checkInGpsLng = gpsLng;
      attUpdate.checkInGpsAccuracy = gpsAccuracy;
      attUpdate.checkInGpsLabel = gpsLabel;
      attUpdate.location = gpsLabel || (gpsLat != null ? `${gpsLat.toFixed(6)},${gpsLng!.toFixed(6)}` : null);
      attUpdate.status = 'present'; // mark present on check-in
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
        const spanMs = refreshed.checkOut.getTime() - refreshed.checkIn.getTime();
        const spanMinutes = Math.max(0, Math.round(spanMs / 60000));
        let breakMinutes = 0;
        if (refreshed.breakIn && refreshed.breakOut) {
          breakMinutes = Math.max(0, Math.round((refreshed.breakOut.getTime() - refreshed.breakIn.getTime()) / 60000));
        }
        const workMinutes = Math.max(0, spanMinutes - breakMinutes);
        const workHours = Math.round((workMinutes / 60) * 100) / 100;
        // OT: anything over 480 min (8h) — simple default; the Shift's
        // otThresholdMinutes would override when the shift is linked.
        const otMinutes = Math.max(0, workMinutes - 480);
        const overtime = Math.round((otMinutes / 60) * 100) / 100;
        await db.attendance.update({
          where: { id: attendance.id },
          data: {
            workHours,
            breakMinutes,
            overtime,
          },
        });
        attendance = { ...attendance, workHours, breakMinutes, overtime };
      }
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

    return NextResponse.json({
      ok: true,
      event: punchEvent,
      attendance,
      timestamp: timestamp.toISOString(),
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
