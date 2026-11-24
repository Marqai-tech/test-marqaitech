import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { normalizeLeaveBalances } from '@/lib/leave-balance-rules';
import { resolveLeavePolicy } from '@/lib/leave-policy-resolver';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, max-age=0',
  };
}

function isProbationEmployee(status: unknown, joiningDate: Date | null | undefined): boolean {
  if (!String(status || '').toLowerCase().includes('probation') || !joiningDate) return false;
  const end = new Date(joiningDate);
  end.setMonth(end.getMonth() + 6);
  return end.getTime() > Date.now();
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/leave/balance
 * Returns the authenticated employee's leave balances for the current year.
 * If the user is a manager/HR/admin and an `employeeId` query param is supplied,
 * that employee's balances are returned instead (subject to company scoping).
 *
 * Company scoping rules:
 * - Employees (scope='self'): only see their own balances
 * - Admins with companyId selected: see balances for employees in that company
 * - Admins without companyId: see all balances
 *
 * Response shape:
 * {
 *   balances: Array<{
 *     id, leaveTypeId, leaveType: { id, name, code, color? },
 *     year, total, used, remaining, carryForward
 *   }>,
 *   summary: { totalAllocated, totalUsed, totalRemaining }
 * }
 */
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
    const requestedEmployeeId = searchParams.get('employeeId');
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    // Resolve target employee
    let employeeId: string | undefined = requestedEmployeeId || undefined;

    if (scope.scope === 'self') {
      // Employees can only see their own balances
      if (requestedEmployeeId) {
        // If they requested a specific employeeId, verify it's their own
        const selfEmployee = await db.employee.findFirst({
          where: { userId: scope.userId, status: 'active' },
          select: { id: true },
        });
        if (!selfEmployee || selfEmployee.id !== requestedEmployeeId) {
          return NextResponse.json(
            { error: 'You can only view your own leave balance' },
            { status: 403, headers: corsHeaders() }
          );
        }
        employeeId = selfEmployee.id;
      } else {
        // No specific employee requested — resolve from authenticated user
        const employee = await db.employee.findFirst({
          where: { userId: scope.userId, status: 'active' },
          select: { id: true },
        });
        if (!employee) {
          return NextResponse.json(
            { balances: [], summary: { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 } },
            { headers: corsHeaders() }
          );
        }
        employeeId = employee.id;
      }
    } else {
      // Admin users
      if (!employeeId) {
        // Admin didn't specify an employee — return balances for their company scope
        // For admins with a specific companyId, filter by that company's employees
        // For admins without companyId, return all
        const employeeWhere: Record<string, unknown> = {};
        if (scope.companyId) {
          employeeWhere.companyId = scope.companyId;
        }

        const employees = await db.employee.findMany({
          where: employeeWhere,
          select: { id: true, employeeStatus: true, dateOfJoining: true, gender: true },
        });

        if (employees.length === 0) {
          return NextResponse.json(
            { balances: [], summary: { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 } },
            { headers: corsHeaders() }
          );
        }

        const employeeIds = employees.map(e => e.id);

        const balances = await db.leaveBalance.findMany({
          where: { employeeId: { in: employeeIds }, year },
          include: {
            leaveType: {
              select: {
                id: true,
                name: true,
                code: true,
                probationRestricted: true,
              },
            },
            employee: {
              select: { id: true, firstName: true, lastName: true, employeeId: true },
            },
          },
          orderBy: { leaveType: { name: 'asc' } },
        });

        const balancesByEmployee = new Map<string, typeof balances>();
        for (const balance of balances) {
          const rows = balancesByEmployee.get(balance.employeeId) || [];
          rows.push(balance);
          balancesByEmployee.set(balance.employeeId, rows);
        }
        const normalizedBalances = employees.flatMap(employee => normalizeLeaveBalances(
          balancesByEmployee.get(employee.id) || [],
          {
            gender: employee.gender,
            probation: isProbationEmployee(employee.employeeStatus, employee.dateOfJoining),
          },
        ));
        const summary = normalizedBalances.reduce(
          (acc, b) => {
            acc.totalAllocated += b.total || 0;
            acc.totalUsed += b.used || 0;
            acc.totalRemaining += b.remaining || 0;
            return acc;
          },
          { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 }
        );

        return NextResponse.json(
          {
            balances: normalizedBalances.map((b) => ({
              id: b.id,
              leaveTypeId: b.leaveTypeId,
              leaveType: b.leaveType,
              employeeId: b.employeeId,
              employee: b.employee,
              year: b.year,
              total: b.total,
              used: b.used,
              remaining: b.remaining,
              carryForward: b.carryForward,
            })),
            summary,
          },
          { headers: corsHeaders() }
        );
      } else {
        // Admin requested a specific employee's balance — verify company scope
        const targetEmployee = await db.employee.findUnique({
          where: { id: requestedEmployeeId },
          select: { id: true, companyId: true },
        });
        if (!targetEmployee) {
          return NextResponse.json(
            { balances: [], summary: { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 } },
            { headers: corsHeaders() }
          );
        }
        if (scope.companyId && targetEmployee.companyId !== scope.companyId) {
          return NextResponse.json(
            { error: 'Employee does not belong to the selected company' },
            { status: 403, headers: corsHeaders() }
          );
        }
        employeeId = targetEmployee.id;
      }
    }

    const targetEmployee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, companyId: true, employeeStatus: true, dateOfJoining: true, gender: true, employeeType: true, branchId: true, departmentId: true } });
    const isProbation = isProbationEmployee(targetEmployee?.employeeStatus, targetEmployee?.dateOfJoining);
    const balances = await db.leaveBalance.findMany({
      where: { employeeId, year },
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            code: true,
            probationRestricted: true,
          },
        },
      },
      orderBy: { leaveType: { name: 'asc' } },
    });

    // If no balance records exist yet for this year, fall back to listing all
    // active leave types with zeroed-out balances. This gives the UI something
    // sensible to render for new employees.
    // Company scoping: for non-admins, only show leave types that belong to
    // their company. LeaveType doesn't have companyId directly, but we filter
    // through the employee's company scope.
    let result = balances;
    if (balances.length === 0) {
      const leaveTypeWhere: Record<string, unknown> = { status: 'active' };
      // For non-admins or admins with a specific company, try to filter leave types
      // by company if the LeaveType model has a companyId relation
      if (scope.companyId) {
        leaveTypeWhere.companyId = scope.companyId;
      }

      const leaveTypes = await db.leaveType.findMany({
        where: leaveTypeWhere,
        select: {
          id: true,
          name: true,
          code: true,
          defaultDays: true,
          probationRestricted: true,
        },
        orderBy: { name: 'asc' },
      });
      // Override defaultDays with rule's entitledDaysPerYear where available
      const ltIdsForRules = leaveTypes.map(lt => lt.id);
      const ruleMapSynthetic = new Map<string, number>();
      if (ltIdsForRules.length > 0) {
        try {
          const ph = ltIdsForRules.map((_, i) => `$${i + 1}`).join(',');
          const rr: any[] = await db.$queryRawUnsafe(
            `SELECT "leaveTypeId", "entitledDaysPerYear" FROM "LeavePolicyRule"
             WHERE "leaveTypeId" IN (${ph}) AND status = 'active'`, ...ltIdsForRules
          );
          for (const r of rr) {
            const e = Number(r.entitledDaysPerYear || 0);
            if (!ruleMapSynthetic.has(r.leaveTypeId) || ruleMapSynthetic.get(r.leaveTypeId)! < e)
              ruleMapSynthetic.set(r.leaveTypeId, e);
          }
        } catch {}
      }
      result = leaveTypes.map((lt) => {
        const entitled = ruleMapSynthetic.get(lt.id) || lt.defaultDays || 0;
        return {
          id: `synthetic-${lt.id}`,
          leaveTypeId: lt.id,
          leaveType: { id: lt.id, name: lt.name, code: lt.code, probationRestricted: lt.probationRestricted },
          year,
          total: isProbation ? 0 : entitled,
          used: 0,
          remaining: isProbation ? 0 : entitled,
          carryForward: 0,
          synthetic: true,
        } as typeof balances[number];
      });
    }

    // Always expose every active leave type, even when an employee has no
    // balance row yet. This keeps ESS/Home cards complete (including Personal
    // Leave and LOP) for new or probationary employees.
    // ─── Mapping enforcement: only show types that are mapped to this employee ───
    let activeLeaveTypes = await db.leaveType.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, code: true, defaultDays: true, probationRestricted: true },
      orderBy: { name: 'asc' },
    }).catch(() => []);

    // Filter by mapping (same logic as /api/leave-types GET)
    // If NO mappings exist → show NOTHING (user requirement: only mapped leave types)
    if (targetEmployee?.id) {
      let mappingsExist = false;
      try {
        const rows: any[] = await db.$queryRawUnsafe(
          `SELECT COUNT(*)::int as cnt FROM "LeaveTypePolicyMapping" WHERE status = 'active'`
        );
        mappingsExist = rows[0]?.cnt > 0;
      } catch { /* table might not exist */ }

      if (!mappingsExist) {
        // BUG FIX (2026-11-23): No LeaveTypePolicyMapping records exist.
        // Previously this showed NOTHING — but the user may have assigned
        // leave types via the Policy form (PolicyForm saves leaveTypeIds
        // on the Policy record). Fall back to those policy-based assignments
        // so leave types appear on the dashboard even without explicit
        // LeaveTypePolicyMapping records (which are created via the
        // /leave/configuration page).
        const policyLtIds = new Set<string>();
        try {
          const policyRows: any[] = await db.$queryRawUnsafe(
            `SELECT "leaveTypeIds", "empStatus", "branchIds", "departmentIds", "designationIds"
             FROM "Policy"
             WHERE category = 'leave' AND status = 'active'
               AND "leaveTypeIds" IS NOT NULL AND "leaveTypeIds" != ''`
          );
          const safeJsonArray = (v: any): string[] => {
            try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; }
          };
          for (const p of policyRows) {
            // Check "Applies to" filters against this employee
            const pStatuses = safeJsonArray(p.empStatus);
            const pBranches = safeJsonArray(p.branchIds);
            const pDepts = safeJsonArray(p.departmentIds);
            const pDesigs = safeJsonArray(p.designationIds);
            if (pStatuses.length > 0 && targetEmployee?.employeeStatus && !pStatuses.includes(targetEmployee.employeeStatus)) continue;
            if (pBranches.length > 0 && targetEmployee?.branchId && !pBranches.includes(targetEmployee.branchId)) continue;
            if (pDepts.length > 0 && targetEmployee?.departmentId && !pDepts.includes(targetEmployee.departmentId)) continue;
            // Collect leave type IDs from this policy
            for (const id of safeJsonArray(p.leaveTypeIds)) policyLtIds.add(id);
          }
        } catch (e) {
          console.warn('[leave/balance] policy-based leaveTypeIds fallback failed (non-fatal):', e);
        }

        if (policyLtIds.size === 0) {
          // No mappings and no policy-based assignments → show nothing
          activeLeaveTypes = [];
          result = [] as typeof result;
        } else {
          // Filter to only leave types assigned via policies
          activeLeaveTypes = activeLeaveTypes.filter((lt: any) => policyLtIds.has(lt.id));
          result = result.filter((b: any) => policyLtIds.has(b.leaveTypeId)) as typeof result;
          // Override defaultDays with rule's entitledDaysPerYear where available
          try {
            const ltIdArr = Array.from(policyLtIds);
            const placeholders = ltIdArr.map((_, i) => `$${i + 1}`).join(',');
            const ruleRows: any[] = await db.$queryRawUnsafe(
              `SELECT "leaveTypeId", "entitledDaysPerYear" FROM "LeavePolicyRule"
               WHERE "leaveTypeId" IN (${placeholders}) AND status = 'active'`,
              ...ltIdArr
            );
            const ruleMap = new Map<string, number>();
            for (const r of ruleRows) {
              const entitled = Number(r.entitledDaysPerYear || 0);
              if (!ruleMap.has(r.leaveTypeId) || ruleMap.get(r.leaveTypeId)! < entitled) {
                ruleMap.set(r.leaveTypeId, entitled);
              }
            }
            activeLeaveTypes = activeLeaveTypes.map((lt: any) => ({
              ...lt,
              defaultDays: ruleMap.get(lt.id) || lt.defaultDays || 0,
            }));
          } catch {}
        }
      } else {
        // Mappings exist → use direct SQL query (same as leave-types API) for robust filtering
        try {
          const ltIds = activeLeaveTypes.map((lt: any) => lt.id);
          if (ltIds.length > 0) {
            const placeholders = ltIds.map((_: any, i: number) => `$${i + 1}`).join(',');
            const mappingRows: any[] = await db.$queryRawUnsafe(
              `SELECT "leaveTypeId", "employmentType", "genderApplicability", "branchId", "departmentId", "employeeIds"
               FROM "LeaveTypePolicyMapping"
               WHERE "leaveTypeId" IN (${placeholders})
                 AND status = 'active'`,
              ...ltIds
            );

            if (mappingRows.length === 0) {
              // No mappings for these specific leave types → show nothing
              activeLeaveTypes = [];
              result = [] as typeof result;
            } else {
              // Group mappings by leaveTypeId
              const mappingsByLt = new Map<string, any[]>();
              for (const m of mappingRows) {
                const arr = mappingsByLt.get(m.leaveTypeId) || [];
                arr.push(m);
                mappingsByLt.set(m.leaveTypeId, arr);
              }

              // Filter: only keep leave types where at least one mapping matches the employee
              const empGender = (targetEmployee?.gender || '').toLowerCase();
              const empEmpType = (targetEmployee?.employeeType || '').toLowerCase().replace('_', '-');
              const empBranchId = targetEmployee?.branchId || null;
              const empDeptId = targetEmployee?.departmentId || null;

              // Also fetch rule's entitledDaysPerYear for each mapped leave type
              let ruleRows: any[] = [];
              try {
                ruleRows = await db.$queryRawUnsafe(
                  `SELECT r."leaveTypeId", r."entitledDaysPerYear", r.name as "ruleName"
                   FROM "LeavePolicyRule" r
                   JOIN "LeaveTypePolicyMapping" m ON m."policyRuleId" = r.id
                   WHERE r.status = 'active' AND m.status = 'active'`
                );
              } catch {}
              const ruleMap = new Map<string, number>();
              for (const r of ruleRows) {
                const ltId = r.leaveTypeId;
                const entitled = Number(r.entitledDaysPerYear || 0);
                if (!ruleMap.has(ltId) || ruleMap.get(ltId)! < entitled) {
                  ruleMap.set(ltId, entitled);
                }
              }

              const visibleTypes = activeLeaveTypes.filter((lt: any) => {
                const ltMappings = mappingsByLt.get(lt.id) || [];
                if (ltMappings.length === 0) return false;
                return ltMappings.some((m: any) => {
                  // Employment type check
                  const mEmpType = (m.employmentType || 'all').toLowerCase();
                  if (mEmpType !== 'all') {
                    const rt = mEmpType.replace('_', '-');
                    if (rt === 'full-time' && empEmpType !== 'full-time') return false;
                    if (rt === 'part-time' && empEmpType !== 'part-time') return false;
                    if (rt === 'contract' && empEmpType !== 'contract') return false;
                    if (rt === 'internship' && empEmpType !== 'internship' && empEmpType !== 'intern') return false;
                    if (rt !== empEmpType) return false;
                  }
                  // Gender check
                  const mGender = (m.genderApplicability || 'all').toLowerCase();
                  if (mGender !== 'all' && mGender !== 'both') {
                    if (empGender === 'male' && mGender !== 'male' && mGender !== 'm') return false;
                    if (empGender === 'female' && mGender !== 'female' && mGender !== 'f') return false;
                    if (empGender === 'other' && mGender !== 'other' && mGender !== 'o') return false;
                    if (!empGender) return false;
                  }
                  // Branch check
                  if (m.branchId && m.branchId !== empBranchId) return false;
                  // Department check
                  if (m.departmentId && m.departmentId !== empDeptId) return false;
                  // Employee IDs check
                  if (m.employeeIds) {
                    try {
                      const ids = JSON.parse(m.employeeIds);
                      if (Array.isArray(ids) && ids.length > 0 && !ids.includes(targetEmployee?.id)) return false;
                    } catch {}
                  }
                  return true;
                });
              }).map((lt: any) => {
                // Override defaultDays with the rule's entitledDaysPerYear
                const ruleQuota = ruleMap.get(lt.id) || lt.defaultDays || 0;
                return { ...lt, defaultDays: ruleQuota };
              });

              activeLeaveTypes = visibleTypes;

              // Also filter existing balance rows
              const visibleTypeIds = new Set(visibleTypes.map((lt: any) => lt.id));
              result = result.filter((b: any) => visibleTypeIds.has(b.leaveTypeId)) as typeof result;
            }
          }
        } catch (mappingErr) {
          console.warn('[leave/balance] mapping filter failed (non-fatal):', mappingErr);
        }
      }
    }

    // ─── FINAL SAFETY-NET FALLBACK (HRMS_BUG_241): If mapping enforcement
    // filtered everything out but active leave types DO exist, show them all.
    // This matches /api/leave-types' behavior (lines 408-419) — an empty
    // result blocks the employee from seeing any balance cards, which is
    // never acceptable. The apply page works because /api/leave-types has
    // this fallback; the balance API didn't, causing the dashboard to show
    // "No leave balances configured" while the apply page showed leave types.
    if (result.length === 0 && activeLeaveTypes.length === 0) {
      try {
        const allTypes = await db.leaveType.findMany({
          where: { status: 'active' },
          select: { id: true, name: true, code: true, defaultDays: true, probationRestricted: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        }).catch(() => []);
        if (allTypes.length > 0) {
          // Override defaultDays with rule's entitledDaysPerYear (same as
          // branches 2 and 3 above) so the total is correct.
          const ltIds = allTypes.map((lt: any) => lt.id);
          if (ltIds.length > 0) {
            try {
              const placeholders = ltIds.map((_: any, i: number) => `$${i + 1}`).join(',');
              const ruleRows: any[] = await db.$queryRawUnsafe(
                `SELECT "leaveTypeId", "entitledDaysPerYear" FROM "LeavePolicyRule"
                 WHERE "leaveTypeId" IN (${placeholders}) AND status = 'active'`,
                ...ltIds
              );
              const ruleMap = new Map<string, number>();
              for (const r of ruleRows) {
                const entitled = Number(r.entitledDaysPerYear || 0);
                if (!ruleMap.has(r.leaveTypeId) || ruleMap.get(r.leaveTypeId)! < entitled) {
                  ruleMap.set(r.leaveTypeId, entitled);
                }
              }
              allTypes.forEach((lt: any) => {
                const ruleQuota = ruleMap.get(lt.id);
                if (ruleQuota !== undefined && ruleQuota > 0) lt.defaultDays = ruleQuota;
              });
            } catch {}
          }
          console.warn(`[leave/balance] Final fallback: showing all ${allTypes.length} active type(s) — mapping enforcement returned 0 for employee=${employeeId}`);
          activeLeaveTypes = allTypes as typeof activeLeaveTypes;
        }
      } catch {}
    }

    const existingLeaveTypeIds = new Set(result.map((b: any) => b.leaveTypeId));
    for (const leaveType of activeLeaveTypes) {
      if (existingLeaveTypeIds.has(leaveType.id)) continue;
      result.push({
        id: `synthetic-${leaveType.id}`,
        leaveTypeId: leaveType.id,
        leaveType: leaveType,
        year,
        total: isProbation ? 0 : (leaveType.defaultDays || 0),
        used: 0,
        remaining: isProbation ? 0 : (leaveType.defaultDays || 0),
        carryForward: 0,
        synthetic: true,
      } as typeof result[number]);
    }

    const normalizedBalances = normalizeLeaveBalances(result, { gender: targetEmployee?.gender, probation: isProbation });

    // ─── BUG FIX (HRMS_BUG_241/243/244/245): Dynamically recompute `used`
    // (taken) and `pending` from LeaveRequest rows, not just the
    // LeaveBalance.used column. The LeaveBalance row is only updated on
    // approval via deductLeaveBalance — and if that silently failed (0 rows),
    // the balance showed 0 taken even after approved leaves. By recomputing
    // from LeaveRequest we always reflect reality, including pending leaves.
    // ───
    try {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      const liveRequests = await db.leaveRequest.findMany({
        where: {
          employeeId,
          status: { in: ['approved', 'pending'] },
          OR: [
            { startDate: { gte: yearStart, lte: yearEnd } },
            { endDate: { gte: yearStart, lte: yearEnd } },
          ],
        },
        select: {
          leaveTypeId: true, startDate: true, endDate: true,
          halfDay: true, status: true, chargeableDays: true,
        },
      });
      // Compute taken (approved) and pending per leave type
      const takenByType = new Map<string, number>();
      const pendingByType = new Map<string, number>();
      for (const req of liveRequests) {
        // Use chargeableDays if set; otherwise compute from dates
        let days = req.chargeableDays;
        if (days == null || isNaN(Number(days))) {
          const s = new Date(req.startDate);
          const e = new Date(req.endDate);
          if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
            days = req.halfDay ? 0.5 : Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          } else {
            days = req.halfDay ? 0.5 : 1;
          }
        }
        const d = Number(days) || 0;
        if (req.status === 'approved') {
          takenByType.set(req.leaveTypeId, (takenByType.get(req.leaveTypeId) || 0) + d);
        } else if (req.status === 'pending') {
          pendingByType.set(req.leaveTypeId, (pendingByType.get(req.leaveTypeId) || 0) + d);
        }
      }
      // Override the balance rows with live values
      for (const b of normalizedBalances) {
        const ltId = b.leaveTypeId;
        const liveTaken = takenByType.get(ltId) || 0;
        const livePending = pendingByType.get(ltId) || 0;
        // Use the live taken (from requests) if it's higher than the DB value,
        // or always use it (since the DB value may be stale).
        // We always use the live value as the source of truth.
        b.used = liveTaken;
        b.remaining = Math.max(0, (b.total || 0) - liveTaken - livePending);
        // Add pending as a custom field for the UI
        (b as any).pending = livePending;
      }
    } catch (liveErr) {
      console.warn('[leave/balance] live request recompute failed (non-fatal):', liveErr);
    }

    const summary = normalizedBalances.reduce(
      (acc, b) => {
        acc.totalAllocated += b.total || 0;
        acc.totalUsed += b.used || 0;
        acc.totalRemaining += b.remaining || 0;
        return acc;
      },
      { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 }
    );

    return NextResponse.json(
      {
        balances: normalizedBalances.map((b) => ({
          id: b.id,
          leaveTypeId: b.leaveTypeId,
          leaveType: b.leaveType,
          year: b.year,
          total: b.total,
          used: b.used,
          pending: (b as any).pending || 0,
          remaining: b.remaining,
          carryForward: b.carryForward,
        })),
        probation: isProbation,
        gender: targetEmployee?.gender || null,
        summary,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('GET /api/leave/balance error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leave balance' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
