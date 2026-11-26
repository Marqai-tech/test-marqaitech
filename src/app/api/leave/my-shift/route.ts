/**
 * GET /api/leave/my-shift?date=YYYY-MM-DD
 * Returns the authenticated employee's shift for the given date (or today).
 * Used by the Apply Leave page to show shift details so employees (especially
 * in manufacturing with night shifts like 7pm-4am) know which shift their
 * leave applies to.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { loadEmployeeShiftWindows } from '@/lib/attendance-shift';

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const todayKey = dateParam || new Date().toISOString().split('T')[0];

    // Find the employee for this user
    const employee = await db.employee.findFirst({
      where: { userId: scope.userId, status: 'active' },
      select: { id: true },
    });

    if (!employee) {
      return NextResponse.json({ shift: null });
    }

    // Load shift window for this employee on the given date
    const shiftMap = await loadEmployeeShiftWindows(db as any, [employee.id], { todayKey });
    const win = shiftMap.get(employee.id);

    if (!win) {
      return NextResponse.json({ shift: null });
    }

    // Format times for display (convert minutes-since-midnight to HH:mm)
    const fmtTime = (mins: number): string => {
      const m = ((mins % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    const isCrossMidnight = win.endMinutes <= win.startMinutes || win.endMinutes > 1440;

    return NextResponse.json({
      shift: {
        id: win.shiftId,
        name: win.name,
        startTime: fmtTime(win.startMinutes),
        endTime: fmtTime(win.endMinutes),
        endTimeNextDay: isCrossMidnight,
        crossMidnight: isCrossMidnight,
        breakMinutes: win.breakMinutes,
        // Display string like "19:00 - 04:00 (next day)"
        display: `${fmtTime(win.startMinutes)} - ${fmtTime(win.endMinutes)}${isCrossMidnight ? ' (next day)' : ''}`,
      },
    });
  } catch (error) {
    console.error('[leave/my-shift] Error:', error);
    return NextResponse.json({ shift: null });
  }
}
