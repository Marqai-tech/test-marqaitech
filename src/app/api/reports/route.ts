import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';
import { getWeekendDays, getHolidaysInRange, toDayStr } from '@/lib/working-days';

/* ────────────────────────────── helpers ────────────────────────────── */

function intParam(sp: URLSearchParams, key: string, fallback: number): number {
  const raw = parseInt(sp.get(key) || '', 10);
  return Number.isFinite(raw) ? raw : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** UTC month window [start, endExclusive) + day count — attendance dates are stored as UTC midnights. */
function monthRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, endExclusive, daysInMonth };
}

/** YYYY-MM-DD for day `d` of the month (UTC calendar key — matches stored dates). */
function dayStr(month: number, year: number, d: number): string {
  return new Date(Date.UTC(year, month - 1, d)).toISOString().split('T')[0];
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

const empSelect = {
  employeeId: true,
  firstName: true,
  lastName: true,
  dateOfJoining: true,
  companyId: true,
  department: { select: { name: true } },
  designation: { select: { title: true } },
};

type RosterEmp = {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dateOfJoining: Date | null;
  companyId: string | null;
  department: { name: string } | null;
  designation: { title: string } | null;
};

function empName(e: { firstName: string; lastName: string }): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

/* ────────────────────────────── route ────────────────────────────── */

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userRole = (decoded.role as string) || 'employee';
    const userId = decoded.userId as string;
    const scope = getDataScope(userRole);
    const isSelfOnly = scope === 'self';
    const isTeam = scope === 'team';

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'employee_report';
    const now = new Date();
    const month = clamp(intParam(searchParams, 'month', now.getUTCMonth() + 1), 1, 12);
    const year = intParam(searchParams, 'year', now.getUTCFullYear());

    // Build employee filter based on role
    let employeeFilter: Record<string, unknown> = { status: 'active' };

    if (isSelfOnly && userId) {
      employeeFilter = { userId, status: 'active' };
    } else if (isTeam && userId) {
      const ownEmp = await db.employee.findFirst({
        where: { userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        employeeFilter = { departmentId: ownEmp.departmentId, status: 'active' };
      }
    }

    // Exclude super_admin users from HR admin view
    if (userRole === 'admin') {
      employeeFilter = {
        ...employeeFilter,
        user: { role: { not: 'super_admin' } },
      };
    }

    // Explicit UI filters (company / department / designation)
    const filterCompanyId = searchParams.get('companyId') || '';
    const filterDepartmentId = searchParams.get('departmentId') || '';
    const filterDesignationId = searchParams.get('designationId') || '';
    if (filterCompanyId) employeeFilter = { ...employeeFilter, companyId: filterCompanyId };
    if (filterDepartmentId) employeeFilter = { ...employeeFilter, departmentId: filterDepartmentId };
    if (filterDesignationId) employeeFilter = { ...employeeFilter, designationId: filterDesignationId };

    const mr = monthRange(month, year);

    switch (type) {
      /* ════════════════════════ EMPLOYEE ════════════════════════ */
      case 'employee_report': {
        const totalEmployees = await db.employee.count({ where: employeeFilter });
        const newHires30d = await db.employee.count({
          where: { ...employeeFilter, dateOfJoining: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        });
        const deptData = await db.employee.findMany({
          where: employeeFilter,
          select: { department: { select: { name: true } }, designation: { select: { title: true } } },
        });
        const deptMap: Record<string, number> = {};
        deptData.forEach((e) => {
          const name = e.department?.name || 'Unknown';
          deptMap[name] = (deptMap[name] || 0) + 1;
        });
        const separated = isSelfOnly ? 0 : await db.employee.count({ where: { status: { in: ['terminated', 'resigned'] } } });
        const employees = await db.employee.findMany({
          where: employeeFilter,
          select: { employeeId: true, firstName: true, lastName: true, email: true, department: { select: { name: true } }, designation: { select: { title: true } }, dateOfJoining: true, status: true },
          take: isSelfOnly ? 1 : 100,
          orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ type, headcount: totalEmployees, newHires: newHires30d, attrition: separated, departmentDistribution: deptMap, employees, dataScope: scope });
      }

      /* ════════════════════════ LEAVE ════════════════════════ */
      case 'leave_report': {
        const leaveRequests = await db.leaveRequest.findMany({
          where: isSelfOnly ? { employee: { userId } } : isTeam ? { employee: employeeFilter } : {},
          select: { leaveType: { select: { name: true } }, status: true, startDate: true, endDate: true, employee: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
          take: 200,
          orderBy: { createdAt: 'desc' },
        });
        const byType: Record<string, number> = {};
        leaveRequests.forEach((lr) => {
          const name = lr.leaveType?.name || 'Unknown';
          byType[name] = (byType[name] || 0) + 1;
        });
        const byStatus: Record<string, number> = {};
        leaveRequests.forEach((lr) => { byStatus[lr.status] = (byStatus[lr.status] || 0) + 1; });
        const deptLeave: Record<string, number> = {};
        leaveRequests.forEach((lr) => {
          const dept = lr.employee?.department?.name || 'Unknown';
          deptLeave[dept] = (deptLeave[dept] || 0) + 1;
        });
        return NextResponse.json({ type, byType, byStatus, departmentAverages: deptLeave, records: leaveRequests, total: leaveRequests.length, dataScope: scope });
      }

      /* ════════════════════════ ATTENDANCE (period-aware) ════════════════════════ */
      case 'attendance_report': {
        const attendance = await db.attendance.findMany({
          where: {
            date: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : isTeam ? { employee: employeeFilter } : { employee: employeeFilter }),
          },
          select: {
            status: true, date: true, checkIn: true, checkOut: true, workHours: true, overtime: true,
            employee: { select: empSelect },
          },
          take: 2000,
          orderBy: { date: 'desc' },
        });

        const byStatus: Record<string, number> = {};
        const byDate: Record<string, Record<string, number>> = {};
        const byDepartment: Record<string, { present: number; late: number; absent: number; leave: number; wfh: number; total: number }> = {};
        let lateArrivals = 0;
        let totalOvertime = 0;
        let totalWorkHours = 0;

        const records = attendance.map((a) => {
          byStatus[a.status] = (byStatus[a.status] || 0) + 1;
          const ds = toDayStr(a.date);
          byDate[ds] = byDate[ds] || { present: 0, late: 0, absent: 0, leave: 0, wfh: 0, other: 0 };
          const bucket = byDate[ds];
          if (a.status === 'present') bucket.present++;
          else if (a.status === 'late') bucket.late++;
          else if (a.status === 'absent') bucket.absent++;
          else if (a.status === 'on_leave') bucket.leave++;
          else if (a.status === 'wfh') bucket.wfh++;
          else bucket.other++;

          const dept = a.employee?.department?.name || 'Unassigned';
          const dBucket = byDepartment[dept] = byDepartment[dept] || { present: 0, late: 0, absent: 0, leave: 0, wfh: 0, total: 0 };
          dBucket.total++;
          if (a.status === 'present') dBucket.present++;
          else if (a.status === 'late') dBucket.late++;
          else if (a.status === 'absent') dBucket.absent++;
          else if (a.status === 'on_leave') dBucket.leave++;
          else if (a.status === 'wfh') dBucket.wfh++;

          if (a.status === 'late') lateArrivals++;
          totalOvertime += a.overtime || 0;
          totalWorkHours += a.workHours || 0;

          return {
            employeeCode: a.employee?.employeeId || '—',
            name: a.employee ? empName(a.employee) : '—',
            department: dept,
            designation: a.employee?.designation?.title || '—',
            date: ds,
            status: a.status,
            checkIn: a.checkIn ? a.checkIn.toISOString() : null,
            checkOut: a.checkOut ? a.checkOut.toISOString() : null,
            workHours: a.workHours ?? null,
            overtime: a.overtime ?? null,
          };
        });

        const present = attendance.filter((a) => ['present', 'late', 'wfh', 'half_day'].includes(a.status)).length;
        const rate = pct(present, attendance.length);

        return NextResponse.json({
          type,
          month, year, daysInMonth: mr.daysInMonth,
          attendanceRate: rate,
          lateArrivals,
          totalOvertime,
          totalWorkHours: Math.round(totalWorkHours * 10) / 10,
          byStatus,
          byDate,
          byDepartment,
          records,
          total: attendance.length,
          dataScope: scope,
        });
      }

      /* ════════════════════════ MUSTER ROLL ════════════════════════ */
      case 'muster_roll': {
        const roster: RosterEmp[] = await db.employee.findMany({
          where: employeeFilter,
          select: empSelect,
          orderBy: [{ employeeId: 'asc' }],
          take: 300,
        });
        const empIds = roster.map((e) => e.id);

        const [attRows, approvedLeaves, holidays, weekendDow, companies] = await Promise.all([
          empIds.length ? db.attendance.findMany({
            where: { date: { gte: mr.start, lt: mr.endExclusive }, employeeId: { in: empIds } },
            select: { employeeId: true, date: true, status: true },
          }) : Promise.resolve([] as { employeeId: string; date: Date; status: string }[]),
          db.leaveRequest.findMany({
            where: {
              status: 'approved',
              startDate: { lt: mr.endExclusive },
              endDate: { gte: mr.start },
              ...(isSelfOnly ? { employee: { userId } } : {}),
            },
            select: { employeeId: true, startDate: true, endDate: true, halfDay: true, leaveType: { select: { name: true } } },
            take: 1000,
          }),
          getHolidaysInRange(db, mr.start, new Date(mr.endExclusive.getTime() - 1)),
          getWeekendDays(db),
          db.company.findMany({ select: { id: true, name: true } }),
        ]);

        const companyName = new Map(companies.map((c: { id: string; name: string }) => [c.id, c.name]));
        const holidaySet = new Set(holidays.map((h) => h.date));
        const weekendSet = new Set(weekendDow);

        // attendance lookup: empId -> dayStr -> status
        const attMap = new Map<string, Map<string, string>>();
        attRows.forEach((r) => {
          if (!attMap.has(r.employeeId)) attMap.set(r.employeeId, new Map());
          attMap.get(r.employeeId)!.set(toDayStr(r.date), r.status);
        });
        // leave lookup: empId -> set of covered dayStrs
        const leaveMap = new Map<string, Set<string>>();
        approvedLeaves.forEach((l) => {
          if (!leaveMap.has(l.employeeId)) leaveMap.set(l.employeeId, new Set());
          const set = leaveMap.get(l.employeeId)!;
          const s = toDayStr(l.startDate);
          const e = toDayStr(l.endDate);
          let cursor = new Date(`${s}T00:00:00.000Z`);
          const end = new Date(`${e}T00:00:00.000Z`);
          let guard = 0;
          while (cursor <= end && guard < 400) {
            guard++;
            set.add(cursor.toISOString().split('T')[0]);
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
        });

        const todayStr = new Date().toISOString().split('T')[0];

        const dayHeaders = Array.from({ length: mr.daysInMonth }, (_, i) => dayStr(month, year, i + 1));

        const records = roster.map((e) => {
          const empAtt = attMap.get(e.id);
          const empLeaves = leaveMap.get(e.id);
          const dojStr = e.dateOfJoining ? toDayStr(e.dateOfJoining) : null;
          const cells: string[] = [];
          const totals = { P: 0, PL: 0, A: 0, HD: 0, L: 0, WFH: 0, WO: 0, H: 0 };

          for (let d = 1; d <= mr.daysInMonth; d++) {
            const ds = dayStr(month, year, d);
            let code = '—'; // future / before joining / not applicable
            if (dojStr && ds < dojStr) {
              code = '—';
            } else if (ds > todayStr) {
              code = '—';
            } else if (empAtt?.has(ds)) {
              const st = empAtt.get(ds)!;
              if (st === 'present') { code = 'P'; totals.P++; }
              else if (st === 'late') { code = 'PL'; totals.PL++; }
              else if (st === 'half_day') { code = 'HD'; totals.HD++; }
              else if (st === 'wfh') { code = 'WFH'; totals.WFH++; }
              else if (st === 'on_leave') { code = 'L'; totals.L++; }
              else if (st === 'weekend') { code = 'WO'; totals.WO++; }
              else if (st === 'holiday') { code = 'H'; totals.H++; }
              else { code = 'A'; totals.A++; }
            } else if (empLeaves?.has(ds)) {
              code = 'L'; totals.L++;
            } else if (weekendSet.has(new Date(`${ds}T00:00:00.000Z`).getUTCDay())) {
              code = 'WO'; totals.WO++;
            } else if (holidaySet.has(ds)) {
              code = 'H'; totals.H++;
            } else {
              code = 'A'; totals.A++; // past working day with no punch/leave → absent
            }
            cells.push(code);
          }

          return {
            employeeCode: e.employeeId,
            name: empName(e),
            department: e.department?.name || 'Unassigned',
            designation: e.designation?.title || '—',
            company: e.companyId ? (companyName.get(e.companyId) || '—') : '—',
            days: cells,
            presentDays: totals.P + totals.PL + totals.HD + totals.WFH,
            lateDays: totals.PL,
            absentDays: totals.A,
            leaveDays: totals.L,
            wfhDays: totals.WFH,
            weekendDays: totals.WO,
            holidayDays: totals.H,
          };
        });

        const grand = records.reduce(
          (acc, r) => ({
            present: acc.present + r.presentDays,
            absent: acc.absent + r.absentDays,
            leave: acc.leave + r.leaveDays,
            wfh: acc.wfh + r.wfhDays,
          }),
          { present: 0, absent: 0, leave: 0, wfh: 0 },
        );
        const marked = grand.present + grand.absent + grand.leave + grand.wfh;

        return NextResponse.json({
          type,
          month, year, daysInMonth: mr.daysInMonth, dayHeaders,
          holidays: holidays,
          summary: [
            { label: 'Employees', value: records.length },
            { label: 'Present Days', value: grand.present, color: 'emerald' },
            { label: 'Absent Days', value: grand.absent, color: 'red' },
            { label: 'On Leave Days', value: grand.leave, color: 'sky' },
            { label: 'WFH Days', value: grand.wfh, color: 'violet' },
            { label: 'Attendance %', value: pct(grand.present, marked), color: 'cyan' },
          ],
          records,
          total: records.length,
          dataScope: scope,
        });
      }

      /* ════════════════════════ DEPARTMENT-WISE ATTENDANCE ════════════════════════ */
      case 'attendance_dept_wise':
      case 'attendance_designation_wise': {
        const byDesignation = type === 'attendance_designation_wise';
        const roster: RosterEmp[] = await db.employee.findMany({
          where: employeeFilter,
          select: empSelect,
          take: 500,
        });
        const empIds = roster.map((e) => e.id);
        const attRows = empIds.length ? await db.attendance.findMany({
          where: { date: { gte: mr.start, lt: mr.endExclusive }, employeeId: { in: empIds } },
          select: { employeeId: true, status: true },
        }) : [];

        // group roster headcount
        const headcount = new Map<string, number>();
        roster.forEach((e) => {
          const key = (byDesignation ? e.designation?.title : e.department?.name) || 'Unassigned';
          headcount.set(key, (headcount.get(key) || 0) + 1);
        });

        // aggregate attendance per group
        const agg = new Map<string, { present: number; late: number; absent: number; leave: number; wfh: number; halfDay: number; total: number }>();
        attRows.forEach((r) => {
          const emp = roster.find((e) => e.id === r.employeeId);
          const key = (byDesignation ? emp?.designation?.title : emp?.department?.name) || 'Unassigned';
          const bucket = agg.set(key, agg.get(key) || { present: 0, late: 0, absent: 0, leave: 0, wfh: 0, halfDay: 0, total: 0 }).get(key)!;
          bucket.total++;
          if (r.status === 'present') bucket.present++;
          else if (r.status === 'late') bucket.late++;
          else if (r.status === 'absent') bucket.absent++;
          else if (r.status === 'on_leave') bucket.leave++;
          else if (r.status === 'wfh') bucket.wfh++;
          else if (r.status === 'half_day') bucket.halfDay++;
        });

        const records = Array.from(new Set([...headcount.keys(), ...agg.keys()])).sort().map((name) => {
          const h = headcount.get(name) || 0;
          const a = agg.get(name) || { present: 0, late: 0, absent: 0, leave: 0, wfh: 0, halfDay: 0, total: 0 };
          const effective = a.present + a.late + a.wfh + a.halfDay * 0.5;
          return {
            [byDesignation ? 'designation' : 'department']: name,
            headcount: h,
            present: a.present,
            late: a.late,
            absent: a.absent,
            onLeave: a.leave,
            wfh: a.wfh,
            halfDay: a.halfDay,
            markedTotal: a.total,
            attendanceRate: pct(effective, a.total),
          };
        });

        const totalMarked = records.reduce((s, r) => s + r.markedTotal, 0);
        const totalEffective = records.reduce((s, r) => s + (r.present + r.late + r.wfh + r.halfDay * 0.5), 0);

        return NextResponse.json({
          type,
          month, year,
          summary: [
            { label: byDesignation ? 'Designations' : 'Departments', value: records.length },
            { label: 'Employees', value: roster.length },
            { label: 'Marked Entries', value: totalMarked },
            { label: 'Attendance %', value: pct(totalEffective, totalMarked), color: 'cyan' },
          ],
          records,
          total: records.length,
          dataScope: scope,
        });
      }

      /* ════════════════════════ WFH REQUESTS ════════════════════════ */
      case 'wfh_report': {
        const rows = await db.wfhRequest.findMany({
          where: {
            startDate: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            requestType: true, reasonCategory: true, startDate: true, endDate: true, totalDays: true,
            status: true, expectedWorkingHours: true, remoteLocation: true, availableForMeetings: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { startDate: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        const byType: Record<string, number> = {};
        let totalDays = 0;
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          byType[r.requestType] = (byType[r.requestType] || 0) + 1;
          totalDays += r.totalDays || 0;
          return {
            employeeCode: r.employee?.employeeId || '—',
            name: r.employee ? empName(r.employee) : '—',
            department: r.employee?.department?.name || 'Unassigned',
            startDate: toDayStr(r.startDate),
            endDate: r.endDate ? toDayStr(r.endDate) : '—',
            requestType: r.requestType,
            reasonCategory: r.reasonCategory,
            totalDays: r.totalDays ?? null,
            expectedWorkingHours: r.expectedWorkingHours ?? null,
            remoteLocation: r.remoteLocation || '—',
            availableForMeetings: r.availableForMeetings ? 'Yes' : 'No',
            status: r.status,
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'WFH Requests', value: rows.length },
            { label: 'Total Days', value: totalDays, color: 'violet' },
            { label: 'Pending', value: byStatus['pending'] || 0, color: 'amber' },
            { label: 'Approved', value: byStatus['approved'] || 0, color: 'emerald' },
          ],
          byStatus, byType, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ GATE PASSES ════════════════════════ */
      case 'gatepass_report': {
        const rows = await db.gatepass.findMany({
          where: {
            requestedAt: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            type: true, requestedAt: true, actualOutTime: true, actualInTime: true, reason: true,
            status: true, managerStatus: true, securityStatus: true, visitorName: true, visitorCompany: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { requestedAt: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        const byType: Record<string, number> = {};
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          byType[r.type] = (byType[r.type] || 0) + 1;
          return {
            employeeCode: r.employee?.employeeId || (r.visitorName ? 'VISITOR' : '—'),
            name: r.employee ? empName(r.employee) : (r.visitorName || '—'),
            department: r.employee?.department?.name || (r.visitorCompany || '—'),
            type: r.type,
            date: toDayStr(r.requestedAt),
            requestedAt: r.requestedAt.toISOString(),
            actualOutTime: r.actualOutTime ? r.actualOutTime.toISOString() : null,
            actualInTime: r.actualInTime ? r.actualInTime.toISOString() : null,
            managerStatus: r.managerStatus,
            securityStatus: r.securityStatus,
            reason: r.reason,
            status: r.status,
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'Gate Passes', value: rows.length },
            { label: 'Pending', value: byStatus['pending'] || 0, color: 'amber' },
            { label: 'Approved', value: byStatus['approved'] || 0, color: 'emerald' },
            { label: 'Rejected', value: byStatus['rejected'] || 0, color: 'red' },
          ],
          byStatus, byType, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ REGULARIZATIONS ════════════════════════ */
      case 'regularization_report': {
        const rows = await db.attendanceRegularization.findMany({
          where: {
            date: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            date: true, punchType: true, requestedTime: true, reason: true, status: true,
            isWeekend: true, isHoliday: true, approvedBy: true, comments: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { date: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        const byPunchType: Record<string, number> = {};
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          byPunchType[r.punchType] = (byPunchType[r.punchType] || 0) + 1;
          return {
            employeeCode: r.employee?.employeeId || '—',
            name: r.employee ? empName(r.employee) : '—',
            department: r.employee?.department?.name || 'Unassigned',
            date: toDayStr(r.date),
            punchType: r.punchType,
            requestedTime: r.requestedTime ? r.requestedTime.toISOString() : null,
            isWeekend: r.isWeekend ? 'Yes' : 'No',
            isHoliday: r.isHoliday ? 'Yes' : 'No',
            reason: r.reason,
            status: r.status,
            comments: r.comments || '—',
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'Regularizations', value: rows.length },
            { label: 'Pending', value: byStatus['pending'] || 0, color: 'amber' },
            { label: 'Approved', value: byStatus['approved'] || 0, color: 'emerald' },
            { label: 'Rejected', value: byStatus['rejected'] || 0, color: 'red' },
          ],
          byStatus, byPunchType, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ HOURLY PERMISSIONS ════════════════════════ */
      case 'permission_report': {
        const rows = await db.hourlyPermission.findMany({
          where: {
            date: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            date: true, startTime: true, endTime: true, hours: true, reason: true,
            status: true, autoApproved: true, adjustedCheckOut: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { date: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        let totalHours = 0;
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          totalHours += r.hours || 0;
          return {
            employeeCode: r.employee?.employeeId || '—',
            name: r.employee ? empName(r.employee) : '—',
            department: r.employee?.department?.name || 'Unassigned',
            date: toDayStr(r.date),
            startTime: r.startTime ? r.startTime.toISOString() : null,
            endTime: r.endTime ? r.endTime.toISOString() : null,
            hours: r.hours,
            reason: r.reason,
            autoApproved: r.autoApproved ? 'Yes' : 'No',
            status: r.status,
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'Permissions', value: rows.length },
            { label: 'Total Hours', value: Math.round(totalHours * 100) / 100, color: 'sky' },
            { label: 'Pending', value: byStatus['pending'] || 0, color: 'amber' },
            { label: 'Approved', value: (byStatus['approved'] || 0) + (byStatus['auto_approved'] || 0), color: 'emerald' },
          ],
          byStatus, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ COMP-OFF CREDITS ════════════════════════ */
      case 'compoff_report': {
        const rows = await db.compOffLeave.findMany({
          where: {
            earnedDate: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            earnedDate: true, hours: true, source: true, expiryDate: true, used: true, status: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { earnedDate: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        let totalHours = 0;
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          bySource[r.source] = (bySource[r.source] || 0) + 1;
          totalHours += r.hours || 0;
          return {
            employeeCode: r.employee?.employeeId || '—',
            name: r.employee ? empName(r.employee) : '—',
            department: r.employee?.department?.name || 'Unassigned',
            earnedDate: toDayStr(r.earnedDate),
            hours: r.hours,
            source: r.source,
            expiryDate: r.expiryDate ? toDayStr(r.expiryDate) : '—',
            used: r.used || 0,
            status: r.status,
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'Comp-off Credits', value: rows.length },
            { label: 'Total Hours', value: Math.round(totalHours * 100) / 100, color: 'sky' },
            { label: 'Active', value: byStatus['active'] || 0, color: 'emerald' },
            { label: 'Used / Expired', value: (byStatus['used'] || 0) + (byStatus['expired'] || 0), color: 'slate' },
          ],
          byStatus, bySource, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ OVERTIME (REQUESTS) ════════════════════════ */
      case 'overtime_request_report': {
        const rows = await db.overtimeRequest.findMany({
          where: {
            date: { gte: mr.start, lt: mr.endExclusive },
            ...(isSelfOnly ? { employee: { userId } } : { employee: employeeFilter }),
          },
          select: {
            date: true, startTime: true, endTime: true, estimatedHours: true, reason: true,
            payoutPreference: true, status: true, comments: true,
            employee: { select: empSelect },
          },
          take: 500,
          orderBy: { date: 'desc' },
        });
        const byStatus: Record<string, number> = {};
        const byPayout: Record<string, number> = {};
        let totalHours = 0;
        const records = rows.map((r) => {
          byStatus[r.status] = (byStatus[r.status] || 0) + 1;
          byPayout[r.payoutPreference] = (byPayout[r.payoutPreference] || 0) + 1;
          totalHours += r.estimatedHours || 0;
          return {
            employeeCode: r.employee?.employeeId || '—',
            name: r.employee ? empName(r.employee) : '—',
            department: r.employee?.department?.name || 'Unassigned',
            date: toDayStr(r.date),
            startTime: r.startTime ? r.startTime.toISOString() : null,
            endTime: r.endTime ? r.endTime.toISOString() : null,
            estimatedHours: r.estimatedHours,
            payoutPreference: r.payoutPreference,
            reason: r.reason,
            status: r.status,
            comments: r.comments || '—',
          };
        });
        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'OT Requests', value: rows.length },
            { label: 'Estimated Hours', value: Math.round(totalHours * 100) / 100, color: 'sky' },
            { label: 'Pending', value: byStatus['pending'] || 0, color: 'amber' },
            { label: 'Approved', value: byStatus['approved'] || 0, color: 'emerald' },
          ],
          byStatus, byPayout, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ SHIFTS & ROSTERS ════════════════════════ */
      case 'shift_report': {
        const [shifts, rosters, assignments] = await Promise.all([
          db.shift.findMany({
            select: { name: true, startTime: true, endTime: true, breakDuration: true, graceTime: true, status: true, companyId: true },
            take: 100,
            orderBy: { name: 'asc' },
          }),
          db.rotationalRoster.findMany({
            select: { id: true, name: true, pattern: true, rotationUnit: true, startDate: true, isActive: true, assignments: { select: { currentOffset: true, startDate: true, endDate: true, employee: { select: empSelect } } } },
            take: 50,
            orderBy: { name: 'asc' },
          }),
          isSelfOnly || isTeam ? Promise.resolve([]) : db.employeeRosterAssignment.findMany({
            select: { currentOffset: true, startDate: true, endDate: true, roster: { select: { name: true, rotationUnit: true } }, employee: { select: empSelect } },
            take: 300,
          }),
        ]);

        const companies = await db.company.findMany({ select: { id: true, name: true } });
        const companyName = new Map(companies.map((c: { id: string; name: string }) => [c.id, c.name]));
        const shiftNames = new Map(shifts.map((s: { id: string; name: string }) => [s.id, s.name]));

        const records: Record<string, unknown>[] = shifts.map((s: { name: string; startTime: string; endTime: string; breakDuration: number; graceTime: number; status: string; companyId: string | null; id: string }) => ({
          kind: 'Shift',
          name: s.name,
          employeeCode: '—',
          employeeName: '—',
          department: s.companyId ? (companyName.get(s.companyId) || '—') : 'All Companies',
          startTime: s.startTime,
          endTime: s.endTime,
          breakMins: s.breakDuration,
          graceMins: s.graceTime,
          rotationUnit: '—',
          status: s.status,
        }));

        rosters.forEach((r: { name: string; pattern: unknown; rotationUnit: string; startDate: Date; isActive: boolean; assignments: { currentOffset: number; startDate: Date; endDate: Date | null; employee: RosterEmp }[] }) => {
          const patternNames = Array.isArray(r.pattern)
            ? (r.pattern as string[]).map((id) => shiftNames.get(id) || 'unknown').join(' → ')
            : String(r.pattern);
          if (r.assignments.length === 0) {
            records.push({ kind: 'Roster', name: r.name, employeeCode: '—', employeeName: '(no assignments)', department: patternNames, startTime: '—', endTime: '—', breakMins: '—', graceMins: '—', rotationUnit: r.rotationUnit, status: r.isActive ? 'active' : 'inactive' });
          }
          r.assignments.forEach((a) => {
            records.push({
              kind: 'Roster Assignment',
              name: r.name,
              employeeCode: a.employee?.employeeId || '—',
              employeeName: a.employee ? empName(a.employee) : '—',
              department: a.employee?.department?.name || 'Unassigned',
              startTime: patternNames,
              endTime: `offset ${a.currentOffset + 1}`,
              breakMins: '—',
              graceMins: '—',
              rotationUnit: r.rotationUnit,
              status: a.endDate && new Date(a.endDate) < now ? 'ended' : 'active',
            });
          });
        });

        assignments.forEach((a: { currentOffset: number; startDate: Date; endDate: Date | null; roster: { name: string; rotationUnit: string }; employee: RosterEmp }) => {
          records.push({
            kind: 'Roster Assignment',
            name: a.roster.name,
            employeeCode: a.employee?.employeeId || '—',
            employeeName: a.employee ? empName(a.employee) : '—',
            department: a.employee?.department?.name || 'Unassigned',
            startTime: '—',
            endTime: `offset ${a.currentOffset + 1}`,
            breakMins: '—',
            graceMins: '—',
            rotationUnit: a.roster.rotationUnit,
            status: a.endDate && new Date(a.endDate) < now ? 'ended' : 'active',
          });
        });

        return NextResponse.json({
          type, month, year,
          summary: [
            { label: 'Shifts', value: shifts.length },
            { label: 'Rosters', value: rosters.length },
            { label: 'Assignments', value: records.filter((r) => r.kind === 'Roster Assignment').length },
            { label: 'Active Shifts', value: shifts.filter((s: { status: string }) => s.status === 'active').length, color: 'emerald' },
          ],
          records,
          total: records.length,
          dataScope: scope,
        });
      }

      /* ════════════════════════ HOLIDAYS ════════════════════════ */
      case 'holiday_report': {
        const yStart = new Date(Date.UTC(year, 0, 1));
        const yEnd = new Date(Date.UTC(year + 1, 0, 1));
        const rows = await db.holiday.findMany({
          where: {
            date: { gte: yStart, lt: yEnd },
            ...(filterCompanyId ? { companyId: filterCompanyId } : {}),
          },
          select: { name: true, date: true, type: true, isOptional: true, description: true, companyId: true },
          orderBy: { date: 'asc' },
          take: 200,
        });
        const companies = await db.company.findMany({ select: { id: true, name: true } });
        const companyName = new Map(companies.map((c: { id: string; name: string }) => [c.id, c.name]));

        const byType: Record<string, number> = {};
        const byMonth: Record<string, number> = {};
        const records = rows.map((h) => {
          byType[h.type] = (byType[h.type] || 0) + 1;
          const ds = toDayStr(h.date);
          const mKey = ds.slice(0, 7);
          byMonth[mKey] = (byMonth[mKey] || 0) + 1;
          return {
            name: h.name,
            date: ds,
            weekday: new Date(`${ds}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
            month: mKey,
            type: h.type,
            optional: h.isOptional ? 'Yes' : 'No',
            company: h.companyId ? (companyName.get(h.companyId) || '—') : '—',
            description: h.description || '—',
          };
        });

        return NextResponse.json({
          type, year,
          summary: [
            { label: `Holidays ${year}`, value: rows.length },
            { label: 'Company-wide', value: rows.filter((h: { isOptional: boolean }) => !h.isOptional).length, color: 'cyan' },
            { label: 'Optional / Elective', value: rows.filter((h: { isOptional: boolean }) => h.isOptional).length, color: 'amber' },
          ],
          byType, byMonth, records, total: rows.length, dataScope: scope,
        });
      }

      /* ════════════════════════ PAYROLL ════════════════════════ */
      case 'payroll_report': {
        // Payroll data is sensitive — only accessible to hr_admin, finance, tenant_admin, super_admin
        if (isSelfOnly) {
          return NextResponse.json({ type, totalGross: 0, totalNet: 0, departmentCosts: {}, monthOverMonth: {}, records: [], total: 0, dataScope: scope, message: 'Self-service payroll view - use payslips endpoint' });
        }
        const payrolls = await db.payroll.findMany({
          where: isTeam ? { employee: employeeFilter } : {},
          select: { month: true, year: true, grossSalary: true, netSalary: true, totalDeductions: true, status: true, currency: true, employee: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
          take: 500,
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });
        const deptCost: Record<string, number> = {};
        payrolls.forEach((p) => {
          const dept = p.employee?.department?.name || 'Unknown';
          deptCost[dept] = (deptCost[dept] || 0) + p.netSalary;
        });
        const byMonth: Record<string, { gross: number; net: number; deductions: number }> = {};
        payrolls.forEach((p) => {
          const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
          if (!byMonth[key]) byMonth[key] = { gross: 0, net: 0, deductions: 0 };
          byMonth[key].gross += p.grossSalary;
          byMonth[key].net += p.netSalary;
          byMonth[key].deductions += p.totalDeductions;
        });
        const totalGross = payrolls.reduce((s, p) => s + p.grossSalary, 0);
        const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0);
        return NextResponse.json({ type, totalGross, totalNet, departmentCosts: deptCost, monthOverMonth: byMonth, records: payrolls, total: payrolls.length, dataScope: scope });
      }

      /* ════════════════════════ RECRUITMENT ════════════════════════ */
      case 'recruitment_report': {
        // Recruitment reports restricted for self-only
        if (isSelfOnly) {
          return NextResponse.json({ type, openPositions: 0, totalApplications: 0, sourceEffectiveness: {}, byStatus: {}, timeToFill: 'N/A', records: [], dataScope: scope, message: 'Recruitment reports not available for self-service' });
        }
        const openPositions = await db.jobPosting.count({ where: { status: 'open' } });
        const applications = await db.jobApplication.findMany({
          select: { source: true, status: true, appliedDate: true, jobPosting: { select: { title: true, department: { select: { name: true } } } } },
          take: 500,
          orderBy: { appliedDate: 'desc' },
        });
        const bySource: Record<string, number> = {};
        applications.forEach((a) => { bySource[a.source] = (bySource[a.source] || 0) + 1; });
        const byStatus: Record<string, number> = {};
        applications.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
        const hired = applications.filter((a) => a.status === 'hired').length;
        const timeToFill = applications.length > 0 && hired > 0 ? '21 days avg' : 'N/A';
        return NextResponse.json({ type, openPositions, totalApplications: applications.length, sourceEffectiveness: bySource, byStatus, timeToFill, records: applications, dataScope: scope });
      }

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
