/**
 * GET /api/leave/reports/balance
 *
 * Returns employee-wise leave balance data computed from:
 *   1. LeaveTypePolicyMapping → which leave types + rules apply to employees
 *   2. LeavePolicyRule → entitledDaysPerYear for each leave type
 *   3. LeaveRequest (approved) → days taken per employee per leave type
 *
 * Computed: remaining = entitled - taken
 *
 * Query params: companyId, departmentId, branchId, employeeId, year
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(req: NextRequest) {
  const db: any = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });

    const url = new URL(req.url);
    const departmentId = url.searchParams.get('departmentId');
    const branchId = url.searchParams.get('branchId');
    const employeeId = url.searchParams.get('employeeId');
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
    const effectiveCompanyId = scope.companyId || scope.ownCompanyId;

    // 1. Fetch all active employees (with dept, branch, designation)
    const empWhere: Record<string, unknown> = { status: { in: ['active', 'on_leave'] } };
    if (effectiveCompanyId) empWhere.companyId = effectiveCompanyId;
    if (departmentId) empWhere.departmentId = departmentId;
    if (branchId) empWhere.branchId = branchId;
    if (employeeId) empWhere.id = employeeId;

    const employees = await db.employee.findMany({
      where: empWhere,
      select: {
        id: true, employeeId: true, firstName: true, lastName: true,
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        gender: true, employeeType: true, employeeStatus: true,
      },
    }).catch(() => []);

    // 2. Fetch all leave types
    const leaveTypes = await db.leaveType.findMany({
      where: { status: 'active', ...(effectiveCompanyId ? { companyId: effectiveCompanyId } : {}) },
      select: { id: true, name: true, code: true, defaultDays: true },
    }).catch(() => []);

    // 3. Fetch all active mappings
    let mappings: any[] = [];
    try {
      mappings = await db.$queryRawUnsafe(
        `SELECT m.*, r.name as "ruleName", r."entitledDaysPerYear", r."leaveTypeId" as "ruleLeaveTypeId"
         FROM "LeaveTypePolicyMapping" m
         LEFT JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
         WHERE m.status = 'active'`
      );
    } catch { mappings = []; }

    // 4. Fetch all rules (for entitledDaysPerYear)
    let rules: any[] = [];
    try {
      rules = await db.$queryRawUnsafe(
        `SELECT id, name, "leaveTypeId", "entitledDaysPerYear", "policyId", gender, "employmentType"
         FROM "LeavePolicyRule" WHERE status = 'active'`
      );
    } catch { rules = []; }

    // 5. Fetch approved leave requests for the year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const leaveRequests = await db.leaveRequest.findMany({
      where: {
        status: 'approved',
        startDate: { gte: yearStart },
        endDate: { lte: yearEnd },
        ...(effectiveCompanyId ? { employee: { companyId: effectiveCompanyId } } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      select: {
        id: true, employeeId: true, leaveTypeId: true,
        startDate: true, endDate: true, halfDay: true, status: true,
      },
    }).catch(() => []);

    // 6. Compute days taken per employee per leave type
    const takenMap = new Map<string, number>(); // key: empId|leaveTypeId
    for (const lr of leaveRequests) {
      const days = lr.halfDay ? 0.5 : Math.ceil((new Date(lr.endDate).getTime() - new Date(lr.startDate).getTime()) / 86400000) + 1;
      const key = `${lr.employeeId}|${lr.leaveTypeId}`;
      takenMap.set(key, (takenMap.get(key) || 0) + days);
    }

    // 7. Build the report rows
    const reportRows: any[] = [];
    for (const emp of employees) {
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
      // Find mappings that apply to this employee
      const empMappings = mappings.filter((m: any) => {
        // Check employment type
        if (m.employmentType && m.employmentType !== 'all') {
          const empType = (emp.employeeType || '').toLowerCase().replace('_', '-');
          const mType = m.employmentType.toLowerCase().replace('_', '-');
          if (mType !== empType) return false;
        }
        // Check gender
        if (m.genderApplicability && m.genderApplicability !== 'all' && m.genderApplicability !== 'both') {
          const empGender = (emp.gender || '').toLowerCase();
          if (empGender !== m.genderApplicability.toLowerCase()) return false;
        }
        // Check branch
        if (m.branchId && m.branchId !== emp.branch?.id) return false;
        // Check department
        if (m.departmentId && m.departmentId !== emp.department?.id) return false;
        return true;
      });

      // For each mapped leave type, compute balance
      const empLeaveTypes = new Map<string, { entitled: number; ruleName: string }>();
      for (const m of empMappings) {
        const ltId = m.leaveTypeId;
        const entitled = Number(m.entitledDaysPerYear || 0);
        const ruleName = m.ruleName || '—';
        if (!empLeaveTypes.has(ltId) || empLeaveTypes.get(ltId)!.entitled < entitled) {
          empLeaveTypes.set(ltId, { entitled, ruleName });
        }
      }

      // Also check rules directly linked to leave types (without mappings)
      for (const r of rules) {
        const ltId = r.leaveTypeId;
        if (ltId && !empLeaveTypes.has(ltId)) {
          // Check if the rule's scope matches the employee
          let matches = true;
          if (r.gender && r.gender !== 'both' && r.gender !== 'all') {
            if ((emp.gender || '').toLowerCase() !== r.gender.toLowerCase()) matches = false;
          }
          if (matches) {
            empLeaveTypes.set(ltId, { entitled: Number(r.entitledDaysPerYear || 0), ruleName: r.name });
          }
        }
      }

      // Build rows for each leave type
      for (const [ltId, info] of empLeaveTypes) {
        const lt = leaveTypes.find((t: any) => t.id === ltId);
        const taken = takenMap.get(`${emp.id}|${ltId}`) || 0;
        const remaining = info.entitled - taken;
        reportRows.push({
          employeeId: emp.id,
          empId: emp.employeeId,
          employeeName: empName,
          department: emp.department?.name || '—',
          departmentId: emp.department?.id || null,
          branch: emp.branch?.name || '—',
          branchId: emp.branch?.id || null,
          designation: emp.designation?.title || '—',
          leaveTypeId: ltId,
          leaveTypeName: lt?.name || 'Unknown',
          leaveTypeCode: lt?.code || '?',
          ruleApplied: info.ruleName,
          entitled: info.entitled,
          taken,
          remaining,
          year,
        });
      }

      // If no mappings/rules, still show the employee with 0 leave types (for the "no data" state)
      if (empLeaveTypes.size === 0) {
        reportRows.push({
          employeeId: emp.id,
          empId: emp.employeeId,
          employeeName: empName,
          department: emp.department?.name || '—',
          departmentId: emp.department?.id || null,
          branch: emp.branch?.name || '—',
          branchId: emp.branch?.id || null,
          designation: emp.designation?.title || '—',
          leaveTypeId: null,
          leaveTypeName: '—',
          leaveTypeCode: '—',
          ruleApplied: '—',
          entitled: 0,
          taken: 0,
          remaining: 0,
          year,
        });
      }
    }

    // Summary KPIs
    const totalEntitled = reportRows.reduce((s, r) => s + r.entitled, 0);
    const totalTaken = reportRows.reduce((s, r) => s + r.taken, 0);
    const totalRemaining = reportRows.reduce((s, r) => s + r.remaining, 0);
    const negativeBalance = reportRows.filter(r => r.remaining < 0).length;
    const leaveTypeCount = new Set(reportRows.map(r => r.leaveTypeId).filter(Boolean)).size;

    return NextResponse.json({
      rows: reportRows,
      summary: {
        totalEmployees: employees.length,
        totalEntitled,
        totalTaken,
        totalRemaining,
        negativeBalance,
        leaveTypeCount,
      },
    }, { headers: cors() });
  } catch (error: any) {
    console.error('Leave balance report error:', error);
    return NextResponse.json({ rows: [], summary: {}, error: error?.message }, { status: 500, headers: cors() });
  }
}
