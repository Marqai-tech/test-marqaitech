import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * POST /api/admin/import-attendance
 *
 * Admin-only bulk import of attendance records from an Excel export.
 * Used to backfill historical attendance (e.g. from biometric reports)
 * when individual /api/attendance POSTs would be too slow or rejected
 * by the "already checked in" guard.
 *
 * Body:
 *   {
 *     records: [
 *       { employeeId: "<DB Employee.id>", date: "YYYY-MM-DD",
 *         checkIn: "HH:MM", checkOut: "HH:MM" | null,
 *         workHours: number | null, punchMethod: "biometric" | "manual" }
 *     ]
 *   }
 *
 * Behavior:
 *   - Uses Prisma attendance.upsert pattern (findUnique + create/update)
 *     keyed on (employeeId, date) so re-runs are safe (idempotent).
 *   - Skips records where employeeId is not found in the tenant DB.
 *   - Returns { success, created, updated, skipped, errors[] }.
 *
 * Authorization: super_admin / tenant_admin / admin only.
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

interface AttendanceRecord {
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string | null; // HH:MM
  checkOut?: string | null; // HH:MM
  workHours?: number | null;
  punchMethod?: string;
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    if (!['super_admin', 'tenant_admin', 'admin'].includes(decoded.role as string)) {
      return NextResponse.json({ error: 'Only admins can import attendance' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const records: AttendanceRecord[] = Array.isArray(body?.records) ? body.records : [];

    if (records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400, headers: corsHeaders() });
    }

    if (records.length > 2000) {
      return NextResponse.json({ error: `Too many records (${records.length}). Max 2000 per call.` }, { status: 400, headers: corsHeaders() });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Group by employee to validate IDs in one go
    const uniqueEmpIds = Array.from(new Set(records.map(r => r.employeeId)));
    const validEmps = await db.employee.findMany({
      where: { id: { in: uniqueEmpIds } },
      select: { id: true },
    }).catch(() => [] as { id: string }[]);
    const validEmpSet = new Set(validEmps.map(e => e.id));

    // Process each record
    for (const rec of records) {
      try {
        if (!rec.employeeId || !rec.date) {
          skipped++;
          errors.push(`Missing employeeId or date: ${JSON.stringify(rec)}`);
          continue;
        }
        if (!validEmpSet.has(rec.employeeId)) {
          skipped++;
          errors.push(`Employee not found: ${rec.employeeId} for date ${rec.date}`);
          continue;
        }

        // Parse date (YYYY-MM-DD → UTC midnight)
        const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rec.date);
        if (!dateMatch) {
          skipped++;
          errors.push(`Invalid date format: ${rec.date}`);
          continue;
        }
        const dayStart = new Date(`${rec.date}T00:00:00.000Z`);

        // Parse check-in/check-out times → UTC Date objects
        const parseTime = (timeStr: string | null | undefined, dateStr: string): Date | null => {
          if (!timeStr || !/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) return null;
          const [hh, mm] = timeStr.split(':').map(Number);
          if (isNaN(hh) || isNaN(mm)) return null;
          return new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`);
        };

        const checkIn = parseTime(rec.checkIn, rec.date);
        const checkOut = parseTime(rec.checkOut, rec.date);

        if (!checkIn && !checkOut) {
          skipped++;
          errors.push(`No check-in or check-out time for ${rec.employeeId} on ${rec.date}`);
          continue;
        }

        // Determine attendance status
        let status = 'present';
        if (checkIn && checkOut) {
          const workMs = checkOut.getTime() - checkIn.getTime();
          const workHoursCalc = workMs / (1000 * 60 * 60);
          if (workHoursCalc < 4) status = 'half_day';
          else if (checkIn.getUTCHours() >= 10 && checkIn.getUTCMinutes() > 0) status = 'late';
        } else if (checkIn && !checkOut) {
          status = 'present'; // missing OUT — assume present
        }

        // Compute workHours if not provided
        let workHours = rec.workHours ?? null;
        if (workHours === null && checkIn && checkOut) {
          workHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        }

        // Upsert — uses unique constraint (employeeId, date)
        const existing = await db.attendance.findUnique({
          where: { employeeId_date: { employeeId: rec.employeeId, date: dayStart } },
          select: { id: true },
        }).catch(() => null);

        if (existing) {
          await db.attendance.update({
            where: { id: existing.id },
            data: {
              checkIn: checkIn || undefined,
              ...(checkOut ? { checkOut } : {}),
              ...(workHours !== null ? { workHours } : {}),
              status,
              punchMethod: rec.punchMethod || 'biometric',
            },
          }).catch((e: unknown) => {
            throw new Error(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
          });
          updated++;
        } else {
          await db.attendance.create({
            data: {
              employeeId: rec.employeeId,
              date: dayStart,
              checkIn: checkIn || null,
              checkOut: checkOut || null,
              workHours: workHours ?? null,
              status,
              punchMethod: rec.punchMethod || 'biometric',
            },
          }).catch((e: unknown) => {
            throw new Error(`Create failed: ${e instanceof Error ? e.message : String(e)}`);
          });
          created++;
        }
      } catch (e) {
        skipped++;
        errors.push(`Error for ${rec.employeeId} ${rec.date}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: records.length,
      created,
      updated,
      skipped,
      errors: errors.slice(0, 50),
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Import attendance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
