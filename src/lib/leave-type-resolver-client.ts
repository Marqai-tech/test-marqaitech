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
 * Resolve which leave type IDs an employee should see, based on policies,
 * mappings and policy rules. Returns a Set of leave type IDs, or null if no
 * filtering applies (meaning: show whatever the API returned).
 *
 * BUG_256 fix: mapping rows with employeeIds set now only apply to the
 * listed employees (mirrors the server-side employeeMatchesMapping logic),
 * and directly-assigned LeavePolicyRule rows (bulk policy mapping) are
 * honoured via the optional `rules` parameter.
 */
export function resolveEmployeeLeaveTypeIds(
  employee: EmployeeLite & { id: string },
  policies: any[],
  mappings: any[],
  empLeavePolicyIds: string[] = [],
  rules: any[] = [],
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
      // BUG_256 fix: employee-specific mappings (employeeIds set) only apply
      // to the listed employees — otherwise every employee would see types
      // mapped to someone else via bulk policy assignment.
      const mEmpIds = parseJsonArray(m.employeeIds);
      if (mEmpIds.length > 0 && !(employee as any).id) continue;
      if (mEmpIds.length > 0 && !mEmpIds.includes((employee as any).id)) continue;
      hasFilter = true;
      allowed.add(m.leaveTypeId);
    }
  }

  // Source 4: directly-assigned LeavePolicyRule rows (bulk policy mapping).
  // A rule assigned to this employee via employeeIds grants its leaveType
  // (direct column or first leaveTypeAllocations entry) even when the
  // best-effort mapping sync did not produce a LeaveTypePolicyMapping row.
  if (rules.length > 0) {
    for (const r of rules) {
      if (r.status && r.status !== 'active') continue;
      const rEmpIds = parseJsonArray(r.employeeIds);
      if (rEmpIds.length === 0 || !rEmpIds.includes((employee as any).id)) continue;
      const alloc = parseJsonArray((r as any).leaveTypeAllocations);
      const firstAllocLtId = Array.isArray(alloc) && alloc.length > 0 && (alloc[0] as any)?.leaveTypeId ? String((alloc[0] as any).leaveTypeId) : null;
      const ltId = r.leaveTypeId || firstAllocLtId;
      if (ltId) {
        hasFilter = true;
        allowed.add(ltId);
      }
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
  employee: (EmployeeLite & { id: string }) | null,
  policies: any[],
  mappings: any[],
  empLeavePolicyIds: string[] = [],
  rules: any[] = [],
): any[] {
  const allowed = resolveEmployeeLeaveTypeIds(employee, policies, mappings, empLeavePolicyIds, rules);
  if (!allowed) return allTypes; // no filter → show all
  return allTypes.filter((t: any) => allowed.has(t.id));
}
