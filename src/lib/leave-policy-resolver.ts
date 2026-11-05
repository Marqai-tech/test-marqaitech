/**
 * Leave Policy Resolver — finds the applicable LeavePolicyRule for a given
 * (employee, leaveType) pair using explicit priority + specificity conflict
 * resolution.
 *
 * RESOLUTION CASCADE (highest priority wins):
 *   1. LeaveTypePolicyMapping rows that match the employee AND link this leave type.
 *      - Filter by: companyId (mandatory), branchId/departmentId/employmentType/gender/employeeIds match.
 *      - Sort by priority DESC; first match wins.
 *   2. If no mapping, fall back to LeavePolicyRule rows that:
 *      - belong to the employee's company
 *      - have this leave type in their `leaveTypeAllocations` JSON
 *      - match the employee's scope (employmentType/branch/department/gender/employeeIds)
 *      - Sort by priority DESC; first match wins.
 *   3. If still no match, return null (employee cannot use this leave type).
 *
 * SPECIFICITY PRIORITY CONVENTION (recommended when creating mappings):
 *   100 = employee-specific (employeeIds set)
 *    80 = branch + department
 *    60 = branch only
 *    40 = department only
 *    20 = employment-type only
 *    10 = all employees
 *
 * TEST-ENVIRONMENT ONLY — operates on the tenant-scoped `db` passed in.
 */
import { syncLeaveConfigSchema } from './leave-config-schema-sync';

export interface ResolvedPolicy {
  source: 'mapping' | 'policy_rule' | 'none';
  mappingId?: string;
  policyRuleId?: string;
  policyRuleName?: string;
  priority: number;
  // Effective rule fields (merged from policy rule + mapping overrides)
  effective: {
    annualQuota?: number;
    accrualFrequency?: string;
    accrualAmount?: number;
    maxBalance?: number;
    openingBalance?: number;
    prorateNewJoiners?: boolean;
    minAdvanceNotice?: number;
    maxFutureDays?: number;
    backdatedAllowed?: boolean;
    backdatedMaxDays?: number;
    minConsecutiveDays?: number;
    maxConsecutiveDays?: number;
    halfDayEligible?: boolean;
    requireAttachment?: boolean;
    requireAttachmentAfterDays?: number;
    overlappingLeaveAllowed?: boolean;
    sandwichRuleEnabled?: boolean;
    proRataEnabled?: boolean;
    probationRestriction?: boolean;
    probationMonths?: number;
    encashmentAllowed?: boolean;
    carryForwardGlobal?: boolean;
    maxCarryForwardDays?: number;
    yearEndProcessingMode?: string;
    yearEndMaxCarryForward?: number;
    yearEndMaxEncashment?: number;
    yearEndExpiryDays?: number;
    encashmentBasis?: string;
    encashmentMaxDays?: number;
    encashmentAutoYearEnd?: boolean;
    encashmentEmployeeInitiated?: boolean;
  };
  // The leave-type-specific allocation from the policy rule's leaveTypeAllocations JSON
  allocation?: {
    leaveTypeId: string;
    quota: number;
    carryForward: boolean;
    maxCarryForward: number;
  };
  // All matching policies (for debug / conflict-preview UI)
  allMatches: Array<{
    mappingId?: string;
    policyRuleId: string;
    policyRuleName: string;
    priority: number;
    reason: string;
  }>;
}

function matchesEmployee(
  emp: { id: string; employmentType: string | null; branchId: string | null; departmentId: string | null; gender: string | null },
  scope: {
    employmentType?: string;
    branchId?: string | null;
    departmentId?: string | null;
    genderApplicability?: string;
    employeeIds?: string | null;
  },
): { match: boolean; reason: string } {
  // employmentType: 'all' matches; otherwise must equal employee's type
  if (scope.employmentType && scope.employmentType !== 'all') {
    // Normalize: schema uses 'full-time'/'part-time' etc., employee uses 'full_time'/'part_time'
    const normalized = scope.employmentType.replace(/-/g, '_');
    if (emp.employmentType && emp.employmentType !== normalized && emp.employmentType !== scope.employmentType) {
      return { match: false, reason: `employment type '${emp.employmentType}' ≠ '${scope.employmentType}'` };
    }
  }
  // branchId: null = all branches; otherwise must match
  if (scope.branchId && emp.branchId !== scope.branchId) {
    return { match: false, reason: `branch '${emp.branchId || 'none'}' ≠ '${scope.branchId}'` };
  }
  // departmentId: null = all departments; otherwise must match
  if (scope.departmentId && emp.departmentId !== scope.departmentId) {
    return { match: false, reason: `department '${emp.departmentId || 'none'}' ≠ '${scope.departmentId}'` };
  }
  // gender: 'all' matches; otherwise must match employee gender
  if (scope.genderApplicability && scope.genderApplicability !== 'all') {
    if (emp.gender && emp.gender.toLowerCase() !== scope.genderApplicability.toLowerCase()) {
      return { match: false, reason: `gender '${emp.gender}' ≠ '${scope.genderApplicability}'` };
    }
  }
  // employeeIds: JSON array — if set, employee must be in the list
  if (scope.employeeIds) {
    try {
      const ids: string[] = JSON.parse(scope.employeeIds);
      if (Array.isArray(ids) && ids.length > 0 && !ids.includes(emp.id)) {
        return { match: false, reason: 'employee not in specific-employees list' };
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return { match: true, reason: 'matches scope' };
}

function extractAllocation(allocationsJson: string, leaveTypeId: string) {
  try {
    const arr = JSON.parse(allocationsJson);
    if (!Array.isArray(arr)) return undefined;
    return arr.find((a: any) => a.leaveTypeId === leaveTypeId);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the applicable policy for an employee + leave type.
 * Returns the winning policy + all matches (for debug).
 */
export async function resolveLeavePolicy(
  db: any,
  params: { employeeId: string; leaveTypeId: string; companyId?: string },
): Promise<ResolvedPolicy> {
  await syncLeaveConfigSchema(db);

  const { employeeId, leaveTypeId } = params;

  // Fetch employee
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employmentType: true,
      branchId: true,
      departmentId: true,
      gender: true,
      companyId: true,
    },
  });
  if (!employee) {
    return { source: 'none', priority: 0, effective: {}, allMatches: [] };
  }

  const companyId = params.companyId || employee.companyId;
  const allMatches: ResolvedPolicy['allMatches'] = [];

  // ─── Step 1: Try LeaveTypePolicyMapping rows ───
  // Use raw SQL since the table may not be in the Prisma client cache yet.
  let mappings: any[] = [];
  try {
    mappings = await db.$queryRawUnsafe(`
      SELECT m.*, r.name as "policyRuleName", r."leaveTypeAllocations",
             r."annualQuota", r."accrualFrequency", r."accrualAmount", r."maxBalance",
             r."openingBalance", r."prorateNewJoiners", r."minAdvanceNotice", r."maxFutureDays",
             r."backdatedAllowed", r."backdatedMaxDays", r."minConsecutiveDays", r."maxConsecutiveDays",
             r."halfDayEligible", r."requireAttachment", r."requireAttachmentAfterDays",
             r."overlappingLeaveAllowed", r."sandwichRuleEnabled", r."proRataEnabled",
             r."probationRestriction", r."probationMonths", r."encashmentAllowed",
             r."carryForwardGlobal", r."maxCarryForwardDays", r."yearEndProcessingMode",
             r."yearEndMaxCarryForward", r."yearEndMaxEncashment", r."yearEndExpiryDays",
             r."encashmentBasis", r."encashmentMaxDays", r."encashmentAutoYearEnd",
             r."encashmentEmployeeInitiated"
      FROM "LeaveTypePolicyMapping" m
      JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
      WHERE m."leaveTypeId" = $1
        AND m."companyId" = $2
        AND m.status = 'active'
        AND r.status = 'active'
      ORDER BY m.priority DESC
    `, leaveTypeId, companyId);
  } catch {
    mappings = [];
  }

  for (const m of mappings) {
    const scopeCheck = matchesEmployee(employee, {
      employmentType: m.employmentType,
      branchId: m.branchId,
      departmentId: m.departmentId,
      genderApplicability: m.genderApplicability,
      employeeIds: m.employeeIds,
    });
    if (scopeCheck.match) {
      allMatches.push({
        mappingId: m.id,
        policyRuleId: m.policyRuleId,
        policyRuleName: m.policyRuleName,
        priority: m.priority,
        reason: scopeCheck.reason,
      });
    }
  }

  if (allMatches.length > 0) {
    const winner = allMatches[0];
    const winnerRow = mappings.find((m: any) => m.id === winner.mappingId);
    const allocation = extractAllocation(winnerRow.leaveTypeAllocations, leaveTypeId);
    return {
      source: 'mapping',
      mappingId: winner.mappingId,
      policyRuleId: winner.policyRuleId,
      policyRuleName: winner.policyRuleName,
      priority: winner.priority,
      effective: {
        annualQuota: winnerRow.annualQuota,
        accrualFrequency: winnerRow.accrualFrequency,
        accrualAmount: winnerRow.accrualAmount,
        maxBalance: winnerRow.maxBalance,
        openingBalance: winnerRow.openingBalance,
        prorateNewJoiners: winnerRow.prorateNewJoiners,
        minAdvanceNotice: winnerRow.minAdvanceNotice,
        maxFutureDays: winnerRow.maxFutureDays,
        backdatedAllowed: winnerRow.backdatedAllowed,
        backdatedMaxDays: winnerRow.backdatedMaxDays,
        minConsecutiveDays: winnerRow.minConsecutiveDays,
        maxConsecutiveDays: winnerRow.maxConsecutiveDays,
        halfDayEligible: winnerRow.halfDayEligible,
        requireAttachment: winnerRow.requireAttachment,
        requireAttachmentAfterDays: winnerRow.requireAttachmentAfterDays,
        overlappingLeaveAllowed: winnerRow.overlappingLeaveAllowed,
        sandwichRuleEnabled: winnerRow.sandwichRuleEnabled,
        proRataEnabled: winnerRow.proRataEnabled,
        probationRestriction: winnerRow.probationRestriction,
        probationMonths: winnerRow.probationMonths,
        encashmentAllowed: winnerRow.encashmentAllowed,
        carryForwardGlobal: winnerRow.carryForwardGlobal,
        maxCarryForwardDays: winnerRow.maxCarryForwardDays,
        yearEndProcessingMode: winnerRow.yearEndProcessingMode,
        yearEndMaxCarryForward: winnerRow.yearEndMaxCarryForward,
        yearEndMaxEncashment: winnerRow.yearEndMaxEncashment,
        yearEndExpiryDays: winnerRow.yearEndExpiryDays,
        encashmentBasis: winnerRow.encashmentBasis,
        encashmentMaxDays: winnerRow.encashmentMaxDays,
        encashmentAutoYearEnd: winnerRow.encashmentAutoYearEnd,
        encashmentEmployeeInitiated: winnerRow.encashmentEmployeeInitiated,
      },
      allocation,
      allMatches,
    };
  }

  // ─── Step 2: Fall back to LeavePolicyRule rows directly ───
  let rules: any[] = [];
  try {
    rules = await db.$queryRawUnsafe(`
      SELECT r.*
      FROM "LeavePolicyRule" r
      WHERE r."companyId" = $1
        AND r.status = 'active'
        AND r."leaveTypeAllocations" LIKE $2
      ORDER BY r.priority DESC
    `, companyId, `%${leaveTypeId}%`);
  } catch {
    rules = [];
  }

  for (const r of rules) {
    const allocation = extractAllocation(r.leaveTypeAllocations, leaveTypeId);
    if (!allocation) continue; // false-positive LIKE match
    const scopeCheck = matchesEmployee(employee, {
      employmentType: r.employmentType,
      branchId: r.branchId,
      departmentId: r.departmentId,
      genderApplicability: r.genderApplicability || 'all',
      employeeIds: r.employeeIds,
    });
    if (scopeCheck.match) {
      allMatches.push({
        policyRuleId: r.id,
        policyRuleName: r.name,
        priority: r.priority,
        reason: `policy rule fallback — ${scopeCheck.reason}`,
      });
    }
  }

  if (allMatches.length > 0) {
    const winner = allMatches[0];
    const winnerRow = rules.find((r: any) => r.id === winner.policyRuleId);
    const allocation = extractAllocation(winnerRow.leaveTypeAllocations, leaveTypeId);
    return {
      source: 'policy_rule',
      policyRuleId: winner.policyRuleId,
      policyRuleName: winner.policyRuleName,
      priority: winner.priority,
      effective: {
        annualQuota: winnerRow.annualQuota,
        accrualFrequency: winnerRow.accrualFrequency,
        accrualAmount: winnerRow.accrualAmount,
        maxBalance: winnerRow.maxBalance,
        openingBalance: winnerRow.openingBalance,
        prorateNewJoiners: winnerRow.prorateNewJoiners,
        minAdvanceNotice: winnerRow.minAdvanceNotice,
        maxFutureDays: winnerRow.maxFutureDays,
        backdatedAllowed: winnerRow.backdatedAllowed,
        backdatedMaxDays: winnerRow.backdatedMaxDays,
        minConsecutiveDays: winnerRow.minConsecutiveDays,
        maxConsecutiveDays: winnerRow.maxConsecutiveDays,
        halfDayEligible: winnerRow.halfDayEligible,
        requireAttachment: winnerRow.requireAttachment,
        requireAttachmentAfterDays: winnerRow.requireAttachmentAfterDays,
        overlappingLeaveAllowed: winnerRow.overlappingLeaveAllowed,
        sandwichRuleEnabled: winnerRow.sandwichRuleEnabled,
        proRataEnabled: winnerRow.proRataEnabled,
        probationRestriction: winnerRow.probationRestriction,
        probationMonths: winnerRow.probationMonths,
        encashmentAllowed: winnerRow.encashmentAllowed,
        carryForwardGlobal: winnerRow.carryForwardGlobal,
        maxCarryForwardDays: winnerRow.maxCarryForwardDays,
        yearEndProcessingMode: winnerRow.yearEndProcessingMode,
        yearEndMaxCarryForward: winnerRow.yearEndMaxCarryForward,
        yearEndMaxEncashment: winnerRow.yearEndMaxEncashment,
        yearEndExpiryDays: winnerRow.yearEndExpiryDays,
        encashmentBasis: winnerRow.encashmentBasis,
        encashmentMaxDays: winnerRow.encashmentMaxDays,
        encashmentAutoYearEnd: winnerRow.encashmentAutoYearEnd,
        encashmentEmployeeInitiated: winnerRow.encashmentEmployeeInitiated,
      },
      allocation,
      allMatches,
    };
  }

  return { source: 'none', priority: 0, effective: {}, allMatches: [] };
}

/**
 * Validation helper — checks a leave application against the resolved policy.
 * Returns an array of error messages (empty = valid).
 */
export function validateLeaveAgainstPolicy(
  params: {
    startDate: string;
    endDate: string;
    halfDay: boolean;
    hasAttachment: boolean;
    days: number; // working-day count
    today: string; // YYYY-MM-DD
    isProbation: boolean;
  },
  policy: ResolvedPolicy,
): string[] {
  const errors: string[] = [];
  const e = policy.effective;
  if (!e || policy.source === 'none') return errors; // no policy = no restrictions

  const { startDate, endDate, halfDay, hasAttachment, days, today, isProbation } = params;

  // minAdvanceNotice
  if (e.minAdvanceNotice && e.minAdvanceNotice > 0) {
    const diffMs = new Date(startDate).getTime() - new Date(today).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < e.minAdvanceNotice) {
      errors.push(`This leave type requires at least ${e.minAdvanceNotice} day(s) advance notice. Please select a start date on or after ${new Date(new Date(today).getTime() + e.minAdvanceNotice * 86400000).toISOString().slice(0, 10)}.`);
    }
  }

  // maxFutureDays
  if (e.maxFutureDays && e.maxFutureDays > 0) {
    const diffMs = new Date(startDate).getTime() - new Date(today).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > e.maxFutureDays) {
      errors.push(`Leave cannot be applied more than ${e.maxFutureDays} day(s) in advance.`);
    }
  }

  // backdatedAllowed
  if (!e.backdatedAllowed) {
    if (new Date(startDate) < new Date(today)) {
      errors.push('Backdated leave applications are not allowed for this leave type.');
    }
  } else if (e.backdatedMaxDays && e.backdatedMaxDays > 0) {
    const diffMs = new Date(today).getTime() - new Date(startDate).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > e.backdatedMaxDays) {
      errors.push(`Backdated leave can only be applied up to ${e.backdatedMaxDays} day(s) in the past.`);
    }
  }

  // minConsecutiveDays
  if (e.minConsecutiveDays && e.minConsecutiveDays > 0 && days < e.minConsecutiveDays) {
    errors.push(`Minimum consecutive leave for this type is ${e.minConsecutiveDays} day(s). You requested ${days} day(s).`);
  }

  // maxConsecutiveDays
  if (e.maxConsecutiveDays && e.maxConsecutiveDays > 0 && days > e.maxConsecutiveDays) {
    errors.push(`Maximum consecutive leave for this type is ${e.maxConsecutiveDays} day(s). You requested ${days} day(s).`);
  }

  // halfDayEligible
  if (halfDay && e.halfDayEligible === false) {
    errors.push('Half-day leave is not allowed for this leave type.');
  }

  // requireAttachment
  if (e.requireAttachment) {
    const threshold = e.requireAttachmentAfterDays || 0;
    if (days > threshold && !hasAttachment) {
      errors.push(`Supporting document is required for leaves longer than ${threshold} day(s). Please attach a document.`);
    }
  }

  // probationRestriction
  if (isProbation && e.probationRestriction) {
    errors.push(`Leave cannot be applied during the ${e.probationMonths || 6}-month probation period.`);
  }

  return errors;
}
