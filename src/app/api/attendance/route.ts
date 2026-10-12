import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { withSchemaSync } from '@/lib/schema-sync';
import { getTokenFromHeaders } from '@/lib/auth';
import { employeeIdsWithStoredPhoto, employeePhotoApiPath } from '@/lib/profile-photo';
import { effectiveBreakMinutes } from '@/lib/attendance-break-rules';

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
        // Rows are stored either at UTC midnight of the local calendar day
        // (`YYYY-MM-DDT00:00:00.000Z`) or at IST midnight (`…+05:30` =
        // previous day 18:30 UTC). Start from the earlier of the two for the
        // first day; end at UTC midnight of the day AFTER the last day (this
        // includes both storage formats for the last day, excludes the next).
        const utcStart = new Date(startDate.length === 10 ? `${startDate}T00:00:00.000Z` : s.getTime());
        const istStart = new Date(startDate.length === 10 ? `${startDate}T00:00:00.000+05:30` : s.getTime());
        const rangeStart = istStart < utcStart ? istStart : utcStart;
        const endDay = endDate.length === 10 ? endDate : new Date(e.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        // UTC midnight of the day AFTER the last day
        const rangeEnd = new Date(new Date(`${endDay}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
        where.date = { gte: rangeStart, lt: rangeEnd };
      }
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Punches are stored either as UTC midnight of the local calendar day
      // (`YYYY-MM-DDT00:00:00.000Z`) or as IST midnight (`…+05:30` = previous
      // 18:30 UTC). Exact `new Date(date)` equality missed one of those and
      // the admin roster then derived Absent for every employee.
      const utcStart = new Date(`${date}T00:00:00.000Z`);
      const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
      const istStart = new Date(`${date}T00:00:00.000+05:30`);
      const rangeStart = istStart < utcStart ? istStart : utcStart;
      where.date = { gte: rangeStart, lt: utcEnd };
    } else if (date) {
      where.date = new Date(date);
    }
    if (status) where.status = status;

    const [attendanceRaw, total] = await Promise.all([
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

    const photoIds = [...new Set(attendanceRaw.map((row) => row.employee?.id).filter(Boolean))] as string[];
    const hasPhoto = await employeeIdsWithStoredPhoto(db, photoIds);
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
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
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
    if (dateStr) {
      today = new Date(`${dateStr}T00:00:00.000Z`);
      if (isNaN(today.getTime())) {
        today = new Date();
        today.setUTCHours(0, 0, 0, 0);
      }
    } else {
      today = new Date();
      today.setUTCHours(0, 0, 0, 0);
    }
    // Previous calendar day — used by checkout when the punch crosses midnight
    const prevDay: Date | null = dateStr
      ? new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000)
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

    const existingRecordToday = await db.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today,
        },
      },
    });

    if (action === 'checkin') {
      if (existingRecordToday && existingRecordToday.checkIn) {
        return NextResponse.json(
          { error: 'Already checked in today' },
          { status: 400, headers: corsHeaders() }
        );
      }

      const now = new Date();
      // Company rule: late counting starts only after 10:00 AM local time.
      // The comparison uses the CLIENT's local time (localTimeStr) when
      // provided — the server runs in UTC so now.getHours() would be wrong
      // for employees in other timezones.
      let isLate = false;
      try {
        const localMinutes = localTimeStr
          ? (() => { const [h, m] = localTimeStr.split(':').map(Number); return h * 60 + m; })()
          : now.getHours() * 60 + now.getMinutes();
        isLate = localMinutes > 10 * 60;
      } catch {
        const localMinutes = localTimeStr
          ? (() => { const [h, m] = localTimeStr.split(':').map(Number); return h * 60 + m; })()
          : now.getHours() * 60 + now.getMinutes();
        isLate = localMinutes > 10 * 60;
      }

      const attendance = await db.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date: today,
          },
        },
        create: {
          employeeId,
          date: today,
          checkIn: now,
          status: isLate ? 'late' : 'present',
          location,
        },
        update: {
          checkIn: now,
          status: isLate ? 'late' : 'present',
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
      let existingRecord = existingRecordToday;
      let recordDate = today;
      if ((!existingRecord || !existingRecord.checkIn || existingRecord.checkOut) && prevDay) {
        const prevRecord = await db.attendance.findUnique({
          where: { employeeId_date: { employeeId, date: prevDay } },
        });
        if (prevRecord && prevRecord.checkIn && !prevRecord.checkOut) {
          existingRecord = prevRecord;
          recordDate = prevDay;
        }
      }

      if (!existingRecord || !existingRecord.checkIn) {
        return NextResponse.json(
          { error: 'Must check in before checking out' },
          { status: 400, headers: corsHeaders() }
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
      const punchedBreakMinutes = existingRecord.breakIn && existingRecord.breakOut
        ? effectiveBreakMinutes(existingRecord.breakIn, existingRecord.breakOut, existingRecord.checkIn, now)
        : null;
      const localMinutes = (value: Date) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
        return Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0);
      };
      const checkInMinutes = localMinutes(existingRecord.checkIn);
      const checkOutMinutes = localMinutes(now);
      const lunchOverlapMinutes = Math.max(0, Math.min(checkOutMinutes, 14 * 60 + 30) - Math.max(checkInMinutes, 13 * 60 + 30));
      const breakMinutes = punchedBreakMinutes != null ? punchedBreakMinutes : lunchOverlapMinutes;
      const workHours = Math.max(0, (grossMinutes - breakMinutes) / 60);
      const belowEightHours = workHours < 8;
      // Overtime is earned only after both requirements are met:
      // eight net production hours and the 6:30 PM IST shift end.
      const overtime = workHours >= 8 && checkOutMinutes > 18 * 60 + 30
        ? Math.max(0, (checkOutMinutes - (18 * 60 + 30)) / 60)
        : 0;

      const attendance = await db.attendance.update({
        where: {
          employeeId_date: {
            employeeId,
            date: recordDate,
          },
        },
        data: {
          checkOut: now,
          workHours: parseFloat(workHours.toFixed(2)),
          overtime: parseFloat(overtime.toFixed(2)),
          status: belowEightHours ? 'half_day' : (existingRecord.status === 'late' ? 'late' : 'present'),
          halfDay: belowEightHours,
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
            roles: ['hr_admin', 'admin', 'tenant_admin'],
            vars: {
              Production_Hours: workHours.toFixed(2),
              Required_Hours: '8.00',
              Attendance_Date: recordDate.toISOString().slice(0, 10),
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
