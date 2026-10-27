import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { withSchemaSync } from '@/lib/schema-sync';
import { getTokenFromHeaders } from '@/lib/auth';
import { employeeIdsWithStoredPhoto, employeePhotoApiPath } from '@/lib/profile-photo';
import { effectiveBreakMinutes, loadAttendanceBreakPolicy } from '@/lib/attendance-break-rules';
import { loadEmployeeShiftWindows, shiftFullDayHours } from '@/lib/attendance-shift';
import { attendanceDayWindow, canonicalAttendanceDate, dedupeAttendanceRowsByDay, findAttendanceForLocalDay, type AttendanceDayRow } from '@/lib/attendance-day';
import { attendanceDayKeyOf, dayKeyToIstStart, localDayStartFor, APP_TIMEZONE } from '@/lib/timezone-utils';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};

    // ─── Company-scoped data visibility ───
    if (scope.scope === 'self') {
      // Employees can only see their own attendance records
      const employee = await withSchemaSync(() => db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true },
      }));
      if (employee) {
        where.employeeId = employee.id;
      } else {
        // No employee record — return empty
        return NextResponse.json(
          { attendance: [], pagination: { page, limit, total: 0, totalPages: 0 } },
          { headers: corsHeaders() }
        );
      }
    } else if (scope.companyId) {
      // Admin with a specific company selected via CompanySwitcher
      where.employee = { companyId: scope.companyId };
    }
    // scope === 'all' && no companyId → admin sees all companies

    // Apply additional filters on top of company scope
    // Task 83: `employeeIds` (comma-separated) + `startDate`/`endDate` month
    // range — the Muster Roll page queries a whole month for a set of
    // employees; previously these params were silently IGNORED, so the grid
    // mixed records from other months (whatever fit in the default page).
    const employeeIdsParam = searchParams.get('employeeIds');
    if (employeeIdsParam) {
      const ids = employeeIdsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        // Intersect with a self-scope filter if one is already applied
        if (where.employeeId && typeof where.employeeId === 'string') {
          where.employeeId = ids.includes(where.employeeId) ? where.employeeId : '__none__';
        } else {
          where.employeeId = { in: ids };
        }
      }
    }
    if (employeeId) where.employeeId = employeeId;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        // Task 162: rows are stored either at IST midnight (previous day
        // 18:30 UTC — biometric sync/webhook) or at UTC midnight of the
        // local day (legacy manual writers). The IST-midnight window of the
        // FIRST day through the IST-midnight window of the LAST day covers
        // both conventions for exactly the requested days — no next-day
        // leakage (the old 29.5h window pulled the following day's rows
        // into this view, shadowing the requested day in the roster).
        const endDay = endDate.length === 10 ? endDate : new Date(e.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const windowStart = attendanceDayWindow(startDate.length === 10 ? startDate : s.toISOString().slice(0, 10));
        const windowEnd = attendanceDayWindow(endDay);
        where.date = { gte: windowStart.gte, lt: windowEnd.lt };
      }
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Task 162: exact 24h IST window — contains BOTH stored conventions of
      // this business day (IST-midnight row = previous 18:30 UTC and legacy
      // UTC-midnight row) and NOTHING else. The previous window extended to
      // UTC midnight of the next day, so the NEXT day's IST-keyed row leaked
      // into today's roster and, being the higher date, won the per-employee
      // first-row match — biometric punches appeared missing for everyone.
      where.date = attendanceDayWindow(date);
    } else if (date) {
      where.date = new Date(date);
    }
    if (status) where.status = status;

    const [attendanceRawAll, totalRaw] = await Promise.all([
      withSchemaSync(() => db.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })),
      withSchemaSync(() => db.attendance.count({ where })),
    ]);
    // Task 162: legacy duplicates — the same business day can exist twice
    // (IST-midnight biometric row + UTC-midnight manual/regularized row).
    // Merge per (employee, business day) keeping the row with real punches
    // so a shell row can no longer shadow the biometric record.
    type AdminAttendanceRow = AttendanceDayRow & { employeeId: string; employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null };
    const deduped = dedupeAttendanceRowsByDay(attendanceRawAll as unknown as AdminAttendanceRow[]);
    const attendanceRaw = deduped.kept;
    const total = Math.max(0, totalRaw - deduped.dropped);

    const photoIds = [...new Set(attendanceRaw.map((row) => row.employee?.id).filter(Boolean))] as string[];
    const hasPhoto = await employeeIdsWithStoredPhoto(db, photoIds);
    // Task 133: per-employee shift windows so the UI computes "Late by"
    // against the employee's OWN shift start (e.g. 11:00 for MARQ004).
    const shiftWinMap = await loadEmployeeShiftWindows(db as any, photoIds);
    const shiftWindows: Record<string, { start: string; end: string }> = {};
    for (const [empId, win] of shiftWinMap) {
      shiftWindows[empId] = {
        start: `${String(Math.floor(win.startMinutes / 60) % 24).padStart(2, '0')}:${String(win.startMinutes % 60).padStart(2, '0')}`,
        end: `${String(Math.floor(win.endMinutes / 60) % 24).padStart(2, '0')}:${String(win.endMinutes % 60).padStart(2, '0')}`,
      };
    }
    const attendance = attendanceRaw.map((row) => {
      const emp = row.employee;
      if (!emp) return { ...row, employee: null };
      return {
        ...row,
        employee: {
          ...emp,
          avatar: hasPhoto.has(emp.id) ? employeePhotoApiPath(emp.id, request.url, getTokenFromHeaders(request)) : null,
        },
      };
    });

    return NextResponse.json(
      {
        attendance,
        shiftWindows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: { ...corsHeaders(), 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    console.error('Get attendance error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    // If table/column doesn't exist, return empty data instead of 500
    if (/column .* does not exist|does not exist in the current database|table .* does not exist/i.test(errMsg)) {
      return NextResponse.json(
        { attendance: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
        { headers: corsHeaders() }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await request.json();
    const { employeeId, action, location } = body;

    if (!employeeId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, action (checkin/checkout)' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── BUG FIX (user report: check-in on 15/09 displayed as 16/09) ───
    // The attendance day must be the employee's LOCAL calendar date, not the
    // server's UTC date. The client now sends its local date (YYYY-MM-DD) and
    // local time (HH:mm). If absent, fall back to the UTC behavior.
    const dateStr = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : null;
    const localTimeStr = typeof body.localTime === 'string' && /^\d{2}:\d{2}$/.test(body.localTime)
      ? body.localTime
      : null;

    let today: Date;
    let todayKey: string;
    if (dateStr) {
      // Task 162: the canonical day key is IST midnight (matches the biometric
      // sync), not UTC midnight — one row per business day regardless of which
      // channel wrote it.
      today = canonicalAttendanceDate(dateStr);
      todayKey = dateStr;
    } else {
      const nowIst = new Date();
      today = localDayStartFor(nowIst, APP_TIMEZONE);
      todayKey = attendanceDayKeyOf(nowIst);
    }
    // Previous business day — used by checkout when the punch crosses midnight
    const prevDayKey: string | null = dateStr
      ? attendanceDayKeyOf(new Date(canonicalAttendanceDate(dateStr).getTime() - 12 * 60 * 60 * 1000))
      : null;

    // ─── Company-scoped data visibility for POST ───
    // Verify the target employee belongs to the same company as the user
    const targetEmployee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, userId: true },
    });

    if (!targetEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    if (scope.scope === 'self') {
      // Employees can only create attendance for themselves
      if (targetEmployee.userId !== scope.userId) {
        return NextResponse.json(
          { error: 'You can only check in/out for yourself' },
          { status: 403, headers: corsHeaders() }
        );
      }
    } else if (scope.companyId) {
      // Admin with specific company — employee must belong to that company
      if (targetEmployee.companyId !== scope.companyId) {
        return NextResponse.json(
          { error: 'Employee does not belong to the selected company' },
          { status: 403, headers: corsHeaders() }
        );
      }
    }
    // scope === 'all' && no companyId → admin can access any employee

    // Task 162: resolve the existing row through the dual-convention day
    // window so a legacy UTC-midnight row (or the biometric IST-midnight row)
    // is REUSED instead of creating a second row for the same business day.
    const existingRecordToday = await findAttendanceForLocalDay(db, employeeId, todayKey);

    if (action === 'checkin') {
      if (existingRecordToday && existingRecordToday.checkIn) {
        return NextResponse.json(
          { error: 'Already checked in today' },
          { status: 400, headers: corsHeaders() }
        );
      }

      const now = new Date();
      // Company rule: late counting starts only after 10:00 AM local time.
      // Task 133: employees with an assigned shift (roster) use THEIR shift
      // start + grace instead (e.g. 11:00+15 for the 11–5 shift).
      // The comparison uses the CLIENT's local time (localTimeStr) when
      // provided — the server runs in UTC so now.getHours() would be wrong
      // for employees in other timezones.
      const shiftWinMap = await loadEmployeeShiftWindows(db as any, [employeeId]);
      const empShift = shiftWinMap.get(employeeId);
      const lateCutoff = empShift ? empShift.startMinutes + empShift.graceMinutes : 10 * 60;
      let isLate = false;
      try {
        const localMinutes = localTimeStr
          ? (() => { const [h, m] = localTimeStr.split(':').map(Number); return h * 60 + m; })()
          : now.getHours() * 60 + now.getMinutes();
        isLate = localMinutes > lateCutoff;
      } catch {
        const localMinutes = localTimeStr
          ? (() => { const [h, m] = localTimeStr.split(':').map(Number); return h * 60 + m; })()
          : now.getHours() * 60 + now.getMinutes();
        isLate = localMinutes > lateCutoff;
      }

      let checkInStatus = isLate ? 'late' : 'present';
      if (isLate) {
        // Task 162: IST month window so IST-midnight (biometric) rows of the
        // month's first days are included in the prior-late count.
        const monthStart = dayKeyToIstStart(`${todayKey.slice(0, 7)}-01`);
        const nextMonthStart = dayKeyToIstStart(attendanceDayKeyOf(new Date(monthStart.getTime() + 31 * 24 * 60 * 60 * 1000)).slice(0, 7) + '-01');
        const priorRows = await db.attendance.findMany({
          where: {
            employeeId,
            date: { gte: monthStart, lt: nextMonthStart },
            checkIn: { not: null },
          },
          select: { checkIn: true, date: true },
        });
        const priorLateCount = priorRows.filter(row => {
          if (!row.checkIn) return false;
          // Only rows of PRIOR business days count toward the streak
          if (attendanceDayKeyOf(row.date as Date) === todayKey) return false;
          const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
          }).formatToParts(row.checkIn);
          const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
          const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
          return hour * 60 + minute > lateCutoff;
        }).length;
        if (priorLateCount >= 3) checkInStatus = 'half_day';
      }

      const attendance = existingRecordToday
        ? await db.attendance.update({ where: { id: existingRecordToday.id }, data: { checkIn: now, status: checkInStatus, location } })
        : await db.attendance.create({
            data: {
              employeeId,
              date: today,
              checkIn: now,
              status: checkInStatus,
              location,
            },
          });

      return NextResponse.json(
        { attendance, message: 'Checked in successfully' },
        { status: 201, headers: corsHeaders() }
      );
    } else if (action === 'checkout') {
      // Checkout normally targets today's record. If the punch crosses
      // midnight (checked in yesterday evening, checking out after 00:00),
      // fall back to the previous day's record when today has no open check-in.
      // Task 162: both lookups use the dual-convention day window.
      let existingRecord = existingRecordToday;
      let recordId: string | null = existingRecordToday?.id || null;
      if ((!existingRecord || !existingRecord.checkIn || existingRecord.checkOut) && prevDayKey) {
        const prevRecord = await findAttendanceForLocalDay(db, employeeId, prevDayKey);
        if (prevRecord && prevRecord.checkIn && !prevRecord.checkOut) {
          existingRecord = prevRecord;
          recordId = prevRecord.id;
        }
      }

      if (!existingRecord || !existingRecord.checkIn) {
        return NextResponse.json(
          { error: 'Must check in before checking out' },
          { status: 400, headers: corsHeaders() }
        );
      }
      if (!recordId) {
        return NextResponse.json(
          { error: 'Attendance record not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      if (existingRecord.checkOut) {
        return NextResponse.json(
          { error: 'Already checked out today' },
          { status: 400, headers: corsHeaders() }
        );
      }

      const now = new Date();
      // Production hours exclude the mandatory one-hour lunch. If actual
      // break punches show a longer break, deduct the full actual duration.
      const grossMinutes = (now.getTime() - existingRecord.checkIn.getTime()) / 60000;
      const breakPolicy = await loadAttendanceBreakPolicy(db);
      // Task 133: per-employee shift window (roster-assigned shifts).
      const empShift = (await loadEmployeeShiftWindows(db as any, [employeeId])).get(employeeId);
      const punchedBreakMinutes = existingRecord.breakIn && existingRecord.breakOut
        ? effectiveBreakMinutes(existingRecord.breakIn, existingRecord.breakOut, existingRecord.checkIn, now, breakPolicy)
        : null;
      const localMinutes = (value: Date) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
        return Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0);
      };
      const checkInMinutes = localMinutes(existingRecord.checkIn);
      const checkOutMinutes = localMinutes(now);
      const lunchOverlapMinutes = effectiveBreakMinutes(null, null, existingRecord.checkIn, now, breakPolicy);
      const breakMinutes = punchedBreakMinutes != null ? punchedBreakMinutes : lunchOverlapMinutes;
      const workHours = Math.max(0, (grossMinutes - breakMinutes) / 60);
      // Task 133: finalize at the employee's own shift end; full-day hours
      // scale with the shift (11–5 → 5h net) instead of the flat 8h rule.
      const finalizeMinutes = empShift ? empShift.endMinutes : breakPolicy.shiftEndMinutes;
      const canFinalize = checkOutMinutes >= finalizeMinutes;
      const fullDayHours = empShift ? shiftFullDayHours(empShift) : 8;
      const belowEightHours = canFinalize && workHours < fullDayHours;
      // Overtime is earned only after both requirements are met:
      // eight net production hours and the shift end.
      const overtime = workHours >= 8 && checkOutMinutes > finalizeMinutes
        ? Math.max(0, (checkOutMinutes - finalizeMinutes) / 60)
        : 0;

      const attendance = await db.attendance.update({
        where: {
          id: recordId,
        },
        data: {
          checkOut: now,
          workHours: canFinalize ? parseFloat(workHours.toFixed(2)) : null,
          overtime: canFinalize ? parseFloat(overtime.toFixed(2)) : 0,
          status: belowEightHours ? 'half_day' : existingRecord.status,
          breakMinutes: Math.round(breakMinutes),
        },
      });

      // Under-eight-hour days must be visible immediately, while the
      // employee still submits regularization themselves.
      if (belowEightHours && scope.tenantId) {
        try {
          const { dispatchToRoles } = await import('@/lib/notification-center');
          await dispatchToRoles({
            tenantId: scope.tenantId,
            module: 'attendance',
            eventKey: 'attendance.production_hours.low',
            recipients: targetEmployee.userId ? [{ userId: targetEmployee.userId }] : [],
            roles: ['hr_admin', 'admin', 'tenant_admin', 'ceo'],
            vars: {
              Production_Hours: workHours.toFixed(2),
              Required_Hours: fullDayHours.toFixed(2),
              Attendance_Date: existingRecord?.date ? attendanceDayKeyOf(existingRecord.date) : todayKey,
            },
            entity: { type: 'attendance', id: attendance.id, link: '/attendance' },
          });
        } catch (notificationError) {
          console.warn('[attendance] low-hours notification failed:', notificationError);
        }
      }

      return NextResponse.json(
        { attendance, message: 'Checked out successfully' },
        { headers: corsHeaders() }
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use checkin or checkout' },
        { status: 400, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('Attendance check-in/out error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
