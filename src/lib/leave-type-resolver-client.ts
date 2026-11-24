/**
 * Shared client-side leave type resolver — mirrors the logic used by the
 * Apply Leave page (/leave/apply). Used by both the Leave Dashboard
 * (/leave) and Apply Leave by HR (/leave/apply-by-hr) so all three pages
 * show the SAME leave types for a given employee.
 *
 * Three sources are combined to determine which leave types an employee
 * should see:
 *   1. Employee's directly-assigned policies (leavePolicyIds → leaveTypeIds)
 *   2. Scope-based policy matching (empStatus / branch / dept filters)
 *   3. LeaveTypePolicyMapping rows filtered by the employee's profile
 */

interface EmployeeLite {
  id: string;
  employeeStatus?: string | null;
  employmentType?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  gender?: string | null;
}

function parseJsonArray(v: any): string[] {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

/**
 * Resolve which leave type IDs an employee should see, based on policies
 * and mappings. Returns a Set of leave type IDs, or null if no filtering
 * applies (meaning: show whatever the API returned).
 */
export function resolveEmployeeLeaveTypeIds(
  employee: EmployeeLite | null,
  policies: any[],
  mappings: any[],
  empLeavePolicyIds: string[] = [],
): Set<string> | null {
  if (!employee) return null;

  const allowed = new Set<string>();
  let hasFilter = false;

  // Source 1: Employee's directly-assigned policies (leavePolicyIds)
  if (empLeavePolicyIds.length > 0) {
    for (const pid of empLeavePolicyIds) {
      const p = policies.find((pp: any) => pp.id === pid);
      if (p && p.status === 'active') {
        const ltIds = parseJsonArray(p.leaveTypeIds);
        if (ltIds.length > 0) {
          hasFilter = true;
          ltIds.forEach((id: string) => allowed.add(id));
        }
      }
    }
  }

  // Source 2: Scope-based policy matching (empStatus, branch, dept)
  for (const p of policies) {
    if (p.status !== 'active') continue;
    if (empLeavePolicyIds.includes(p.id)) continue; // already handled
    const empStatuses = parseJsonArray(p.empStatus);
    const branchIds = parseJsonArray(p.branchIds);
    const deptIds = parseJsonArray(p.departmentIds);
    let matches = true;
    if (empStatuses.length > 0 && !empStatuses.map((s: string) => s.toLowerCase()).includes('all')) {
      const empStatus = (employee.employeeStatus || '').toLowerCase();
      if (empStatus && !empStatuses.map((s: string) => s.toLowerCase()).includes(empStatus)) matches = false;
    }
    if (matches && branchIds.length > 0 && employee.branchId && !branchIds.includes(employee.branchId)) matches = false;
    if (matches && deptIds.length > 0 && employee.departmentId && !deptIds.includes(employee.departmentId)) matches = false;
    if (matches) {
      const ltIds = parseJsonArray(p.leaveTypeIds);
      if (ltIds.length > 0) {
        hasFilter = true;
        ltIds.forEach((id: string) => allowed.add(id));
      }
    }
  }

  // Source 3: LeaveTypePolicyMapping rows
  if (mappings.length > 0) {
    for (const m of mappings) {
      if (m.status !== 'active') continue;
      const empType = m.employmentType || 'all';
      if (empType !== 'all' && employee.employmentType && employee.employmentType !== empType.replace(/-/g, '_') && employee.employmentType !== empType) continue;
      if (m.branchId && employee.branchId !== m.branchId) continue;
      if (m.departmentId && employee.departmentId !== m.departmentId) continue;
      const gender = (m.genderApplicability || 'all').toLowerCase();
      if (gender !== 'all' && gender !== 'both' && employee.gender && employee.gender.toLowerCase() !== gender) continue;
      hasFilter = true;
      allowed.add(m.leaveTypeId);
    }
  }

  return hasFilter ? allowed : null;
}

/**
 * Filter leave types for an employee using the same 3-source logic as the
 * Apply Leave page. If no filtering applies (no policies/mappings configured),
 * returns the original list unchanged.
 */
export function filterLeaveTypesForEmployee(
  allTypes: any[],
  employee: EmployeeLite | null,
  policies: any[],
  mappings: any[],
  empLeavePolicyIds: string[] = [],
): any[] {
  const allowed = resolveEmployeeLeaveTypeIds(employee, policies, mappings, empLeavePolicyIds);
  if (!allowed) return allTypes; // no filter → show all
  return allTypes.filter((t: any) => allowed.has(t.id));
}
