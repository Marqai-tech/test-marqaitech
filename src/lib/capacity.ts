/**
 * Capacity Planning & Live Availability engine.
 *
 * Answers the HRMS-driven delivery questions:
 *   - How allocated is each employee per week (across ALL projects, including
 *     soft "bench" reservations)?
 *   - Which approved leaves / company holidays reduce available capacity?
 *   - Who is over-allocated beyond the configured threshold (alert feed)?
 *
 * Weekly buckets (Mon–Sun ISO weeks). Contracted weekly hours resolution:
 *   EmployeeCostRate.weeklyHours (active) → Employee.defaultWeeklyHours → 40.
 */

export interface CapacityEmployeeWeek {
  weekStart: string;          // YYYY-MM-DD (Monday)
  allocatedHours: number;
  scheduledHours: number;     // contracted − leave − holiday hours
  leaveHours: number;
  holidayHours: number;
  utilizationPct: number;     // allocated / scheduled * 100
  overAllocated: boolean;
  softReservedHours: number;
  allocations: Array<{ projectId: string; projectName: string; allocationPct: number; soft: boolean; weeklyHours: number; status: string }>;
  leaves: Array<{ startDate: string; endDate: string; status: string; typeName?: string }>;
  holidays: Array<{ date: string; name: string }>;
}

export interface CapacityEmployee {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  designation?: string | null;
  department?: string | null;
  timezone?: string | null;
  weeklyHours: number;         // contracted
  skills?: Array<{ skill: string; level: string }>;
  weeks: CapacityEmployeeWeek[];
  overallOverAllocatedWeeks: number;
}

export interface CapacityAlert {
  employeeId: string;
  employeeName: string;
  weekStart: string;
  utilizationPct: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface CapacityResult {
  from: string;
  to: string;
  thresholdPct: number;
  employees: CapacityEmployee[];
  alerts: CapacityAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = date.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function eachMonday(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cur = mondayOf(from);
  const end = mondayOf(to);
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur = new Date(cur.getTime() + 7 * DAY_MS);
  }
  return out;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/**
 * Compute weekly capacity for a set of employees between two dates.
 * db = tenant Prisma client.
 */
export async function computeCapacity(
  db: any,
  employeeIds: string[],
  from: Date,
  to: Date,
  opts?: { thresholdPct?: number; includeSoft?: boolean }
): Promise<CapacityResult> {
  const thresholdPct = Math.max(10, Math.min(400, opts?.thresholdPct ?? 100));
  const includeSoft = opts?.includeSoft ?? true;
  const cappedTo = employeeIds.slice(0, 200); // hard cap for payload sanity

  const [employees, costRates, allocations, leaves, holidays] = await Promise.all([
    db.employee.findMany({
      where: { id: { in: cappedTo } },
      select: {
        id: true, employeeId: true, firstName: true, lastName: true, timezone: true, defaultWeeklyHours: true,
        designation: { select: { title: true } },
        department: { select: { name: true } },
        skills: { select: { skill: true, level: true } },
      },
    }),
    db.employeeCostRate.findMany({
      where: { employeeId: { in: cappedTo }, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    }).catch(() => []),
    db.projectAllocation.findMany({
      where: {
        employeeId: { in: cappedTo },
        status: { in: includeSoft ? ['active', 'soft'] : ['active'] },
        OR: [
          { startDate: { lte: to }, endDate: null },
          { startDate: { lte: to }, endDate: { gte: from } },
          { startDate: { gte: from }, endDate: { gte: from } },
        ],
      },
      include: { project: { select: { id: true, name: true, status: true } } },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: cappedTo },
        status: { in: ['approved', 'pending'] },
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: { leaveType: { select: { name: true } } },
    }).catch(() => []),
    getHolidaysSafe(db, from, to),
  ]);

  const holidaysByDate = new Map<string, string>();
  for (const h of holidays || []) holidaysByDate.set(h.date, h.name);

  const result: CapacityResult = {
    from: dayStr(from),
    to: dayStr(to),
    thresholdPct,
    employees: [],
    alerts: [],
  };

  const costRateByEmp = new Map<string, any>();
  for (const cr of costRates || []) {
    if (!costRateByEmp.has(cr.employeeId)) costRateByEmp.set(cr.employeeId, cr);
  }

  for (const emp of employees) {
    const weeklyHours =
      costRateByEmp.get(emp.id)?.weeklyHours || emp.defaultWeeklyHours || 40;
    const empAllocs = (allocations || []).filter((a: any) => a.employeeId === emp.id);
    const empLeaves = (leaves || []).filter((l: any) => l.employeeId === emp.id);

    const weeks: CapacityEmployeeWeek[] = [];
    let overWeeks = 0;

    for (const monday of eachMonday(from, to)) {
      const weekEnd = new Date(monday.getTime() + 6 * DAY_MS);

      // Allocations overlapping this week
      const weekAllocs = empAllocs.filter((a: any) => {
        const aStart = new Date(a.startDate);
        const aEnd = a.endDate ? new Date(a.endDate) : new Date('2999-12-31');
        return overlaps(aStart, aEnd, monday, weekEnd);
      });

      let allocatedHours = 0;
      let softReservedHours = 0;
      const allocationRows = weekAllocs.map((a: any) => {
        const pct = a.allocationPct ?? 100;
        const wh = (pct / 100) * weeklyHours;
        if (a.status === 'soft') softReservedHours += wh;
        else allocatedHours += wh;
        return {
          projectId: a.projectId,
          projectName: a.project?.name || 'Project',
          allocationPct: pct,
          soft: a.status === 'soft',
          weeklyHours: Math.round(wh * 10) / 10,
          status: a.status,
        };
      });

      // Leave days in this week (any status approved/pending overlap → count approved fully, pending as informational)
      let leaveHours = 0;
      const leaveRows: CapacityEmployeeWeek['leaves'] = [];
      for (const l of empLeaves) {
        const lStart = new Date(l.startDate);
        const lEnd = new Date(l.endDate);
        if (!overlaps(lStart, lEnd, monday, weekEnd)) continue;
        const effStart = lStart < monday ? monday : lStart;
        const effEnd = lEnd > weekEnd ? weekEnd : lEnd;
        const days = Math.floor((effEnd.getTime() - effStart.getTime()) / DAY_MS) + 1;
        const wh = l.status === 'approved' ? days * 8 : 0;
        leaveHours += wh;
        leaveRows.push({
          startDate: dayStr(lStart), endDate: dayStr(lEnd), status: l.status,
          typeName: l.leaveType?.name,
        });
      }

      // Holidays in this week
      let holidayHours = 0;
      const holidayRows: CapacityEmployeeWeek['holidays'] = [];
      for (let i = 0; i < 7; i++) {
        const d = dayStr(new Date(monday.getTime() + i * DAY_MS));
        const hName = holidaysByDate.get(d);
        if (hName) {
          holidayHours += 8;
          holidayRows.push({ date: d, name: hName });
        }
      }

      const scheduledHours = Math.max(0, weeklyHours - leaveHours - holidayHours);
      // Utilization vs scheduled hours; when the whole week is leave/holiday the
      // denominator would be 0 — fall back to contracted hours for a meaningful figure.
      const utilizationBase = scheduledHours > 0 ? scheduledHours : weeklyHours;
      const utilizationPct = utilizationBase > 0
        ? Math.round(((allocatedHours + softReservedHours) / utilizationBase) * 100)
        : allocatedHours + softReservedHours > 0 ? 999 : 0;
      const overAllocated = utilizationPct > thresholdPct;
      if (overAllocated) overWeeks++;

      weeks.push({
        weekStart: dayStr(monday),
        allocatedHours: Math.round(allocatedHours * 10) / 10,
        scheduledHours,
        leaveHours,
        holidayHours,
        utilizationPct,
        overAllocated,
        softReservedHours: Math.round(softReservedHours * 10) / 10,
        allocations: allocationRows,
        leaves: leaveRows,
        holidays: holidayRows,
      });

      if (overAllocated) {
        result.alerts.push({
          employeeId: emp.id,
          employeeName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          weekStart: dayStr(monday),
          utilizationPct,
          severity: utilizationPct > thresholdPct + 25 ? 'critical' : 'warning',
          message:
            `${emp.firstName || 'Employee'} is at ${utilizationPct}% capacity for week ${dayStr(monday)} ` +
            `(threshold ${thresholdPct}%) across ${allocationRows.length} project allocation(s)` +
            (softReservedHours > 0 ? `, incl. ${Math.round(softReservedHours)}h soft-reserved` : '') + '.',
        });
      }
    }

    result.employees.push({
      employeeId: emp.id,
      employeeCode: emp.employeeId,
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      designation: emp.designation?.title || null,
      department: emp.department?.name || null,
      timezone: emp.timezone || null,
      weeklyHours,
      skills: (emp.skills || []).slice(0, 12).map((s: any) => ({ skill: s.skill, level: s.level })),
      weeks,
      overallOverAllocatedWeeks: overWeeks,
    });
  }

  result.alerts.sort((a, b) => b.utilizationPct - a.utilizationPct);
  return result;
}

async function getHolidaysSafe(db: any, from: Date, to: Date) {
  try {
    const { getHolidaysInRange } = await import('@/lib/working-days');
    return await getHolidaysInRange(db, from, to);
  } catch {
    return [];
  }
}

/**
 * Check whether adding a new allocation would push an employee over the
 * threshold during any overlapping week. Used by matchmaking + soft-booking.
 */
export async function wouldExceedCapacity(
  db: any,
  employeeId: string,
  startDate: Date,
  endDate: Date,
  allocationPct: number,
  opts?: { thresholdPct?: number; excludeProjectId?: string }
): Promise<{ exceeds: boolean; peakPct: number; detail: string }> {
  const cap = await computeCapacity(
    db, [employeeId], startDate, endDate,
    { thresholdPct: opts?.thresholdPct ?? 100, includeSoft: true }
  );
  const emp = cap.employees[0];
  if (!emp) return { exceeds: false, peakPct: 0, detail: '' };
  const relevant = emp.weeks.filter((w) =>
    overlaps(new Date(w.weekStart), new Date(new Date(w.weekStart).getTime() + 6 * DAY_MS), startDate, endDate)
  );
  let peak = 0;
  for (const w of relevant) peak = Math.max(peak, w.utilizationPct);
  const projected = peak + allocationPct;
  const exceeds = projected > (opts?.thresholdPct ?? 100);
  return {
    exceeds,
    peakPct: projected,
    detail: exceeds
      ? `Assignment would take this employee to ~${projected}% capacity (threshold ${opts?.thresholdPct ?? 100}%). Existing commitments in the window: ${
          relevant.flatMap((w) => w.allocations.map((a) => `${a.projectName} (${a.allocationPct}%)`)).join(', ') || 'none'
        }.`
      : '',
  };
}
