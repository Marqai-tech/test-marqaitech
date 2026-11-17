/**
 * Project Delivery Workflow — dynamic configuration engine.
 *
 * Mirrors the RecruitmentWorkflowConfig pattern: per-tenant, optionally
 * per-company JSON config stored in ProjectWorkflowConfig, resolved through
 *   company-scoped row → tenant-wide row (companyId null) → built-in defaults.
 *
 * Covers the full delivery lifecycle:
 *   1. Intake approval chain (project intake submission → approval → workspace)
 *   2. Stage-gate review chain (Team Lead → Project Sponsor etc.)
 *   3. Capacity rules (over-allocation threshold, soft allocation, backup hand-offs)
 *   4. Workspace automation (auto chat room + kanban board + notifications)
 *   5. Timesheet rules (approval routing, waterfall phase gating, sprint pre-population)
 *   6. Closure rules (post-mortem, milestone checks, compliance checklist)
 *   7. Sprint defaults (duration)
 */

// ─────────────────────────── Types ───────────────────────────

export type ProjectApproverType =
  | 'reporting_manager'      // project manager (falls back to delivery manager)
  | 'department_head'        // head of the project's department
  | 'hr_admin'
  | 'tenant_admin'
  | 'ceo'
  | 'specific_employee'      // approverValue = employeeId
  | 'project_sponsor';       // Project.executiveSponsor employee

export interface ProjectApprovalTier {
  tier: number;
  approverType: ProjectApproverType;
  approverValue?: string | null; // employeeId for specific_employee / project_sponsor
  label?: string;
}

export interface ProjectWorkflowConfigShape {
  intake: {
    requireApproval: boolean;
    requireBusinessObjective: boolean;
    requireExecutiveSponsor: boolean;
    requireTargetCompletionDate: boolean;
    chain: ProjectApprovalTier[];       // sequential; empty + requireApproval → any admin/tenant_admin
  };
  stageGates: {
    enabled: boolean;
    chain: ProjectApprovalTier[];       // e.g. Team Lead → Project Sponsor
  };
  capacity: {
    overAllocationThresholdPct: number; // default 100 → alert when sum of allocation % exceeds this
    includeSoftAllocations: boolean;    // soft ("bench") reservations count toward capacity
    backupHandoffEnabled: boolean;
    backupHandoffLeaveDays: number;     // approved leave ≥ N working days → backup hand-off prompt
  };
  workspace: {
    autoCreateChatRoom: boolean;
    autoCreateKanbanBoard: boolean;
    seedBoardFromTasks: boolean;
    notifyOnApproval: boolean;
  };
  timesheets: {
    approvalMode: 'allocation_approver' | 'project_manager' | 'hr_admin';
    enforceWaterfallPhaseGating: boolean; // block logging time to phase N before phase N-1 approved
    autoPrepopulateSprint: boolean;       // pre-fill active sprint on timesheet helpers
  };
  closure: {
    requirePostMortem: boolean;
    requireAllMilestonesApproved: boolean;
    complianceChecklist: string[];
  };
  sprints: {
    defaultDurationDays: number;
  };
}

// ─────────────────────────── Defaults ───────────────────────────

export const DEFAULT_PROJECT_WORKFLOW_CONFIG: ProjectWorkflowConfigShape = {
  intake: {
    requireApproval: true,
    requireBusinessObjective: true,
    requireExecutiveSponsor: false,
    requireTargetCompletionDate: true,
    chain: [
      { tier: 1, approverType: 'reporting_manager', label: 'Project Manager Review' },
      { tier: 2, approverType: 'tenant_admin', label: 'Executive / Admin Approval' },
    ],
  },
  stageGates: {
    enabled: true,
    chain: [
      { tier: 1, approverType: 'reporting_manager', label: 'Team Lead Review' },
      { tier: 2, approverType: 'project_sponsor', label: 'Project Sponsor Approval' },
    ],
  },
  capacity: {
    overAllocationThresholdPct: 100,
    includeSoftAllocations: true,
    backupHandoffEnabled: true,
    backupHandoffLeaveDays: 5,
  },
  workspace: {
    autoCreateChatRoom: true,
    autoCreateKanbanBoard: true,
    seedBoardFromTasks: true,
    notifyOnApproval: true,
  },
  timesheets: {
    approvalMode: 'allocation_approver',
    enforceWaterfallPhaseGating: true,
    autoPrepopulateSprint: true,
  },
  closure: {
    requirePostMortem: true,
    requireAllMilestonesApproved: false,
    complianceChecklist: [
      'All deliverables archived to project documentation',
      'Client/stakeholder acceptance recorded',
      'Company policy & compliance sign-off confirmed',
    ],
  },
  sprints: {
    defaultDurationDays: 14,
  },
};

const APPROVER_TYPES: ProjectApproverType[] = [
  'reporting_manager', 'department_head', 'hr_admin', 'tenant_admin', 'specific_employee', 'project_sponsor',
];

// ─────────────────────────── Validation ───────────────────────────

function validateTier(t: unknown, i: number, path: string): string | null {
  if (!t || typeof t !== 'object') return `${path}[${i}] must be an object`;
  const tier = t as Record<string, unknown>;
  if (typeof tier.tier !== 'number' || tier.tier < 1) return `${path}[${i}].tier must be a positive number`;
  if (!APPROVER_TYPES.includes(tier.approverType as ProjectApproverType)) {
    return `${path}[${i}].approverType "${tier.approverType}" is not supported (allowed: ${APPROVER_TYPES.join(', ')})`;
  }
  if (
    (tier.approverType === 'specific_employee' || tier.approverType === 'project_sponsor') &&
    !tier.approverValue
  ) {
    return `${path}[${i}].approverValue is required for approverType "${tier.approverType}"`;
  }
  return null;
}

function validateChain(chain: unknown, path: string): string | null {
  if (!Array.isArray(chain)) return `${path} must be an array`;
  for (let i = 0; i < chain.length; i++) {
    const err = validateTier(chain[i], i, path);
    if (err) return err;
  }
  return null;
}

export function validateProjectWorkflowConfig(
  cfg: unknown
): { ok: true; value: ProjectWorkflowConfigShape } | { ok: false; error: string } {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { ok: false, error: 'Config must be a JSON object' };
  }
  const c = cfg as Record<string, any>;

  const intake = c.intake ?? {};
  if (typeof intake.requireApproval !== 'undefined' && typeof intake.requireApproval !== 'boolean') {
    return { ok: false, error: 'intake.requireApproval must be a boolean' };
  }
  for (const f of ['requireBusinessObjective', 'requireExecutiveSponsor', 'requireTargetCompletionDate']) {
    if (typeof intake[f] !== 'undefined' && typeof intake[f] !== 'boolean') {
      return { ok: false, error: `intake.${f} must be a boolean` };
    }
  }
  const chainErr = validateChain(intake.chain, 'intake.chain');
  if (chainErr) return { ok: false, error: chainErr };

  const gates = c.stageGates ?? {};
  if (typeof gates.enabled !== 'undefined' && typeof gates.enabled !== 'boolean') {
    return { ok: false, error: 'stageGates.enabled must be a boolean' };
  }
  const gateErr = validateChain(gates.chain, 'stageGates.chain');
  if (gateErr) return { ok: false, error: gateErr };

  const cap = c.capacity ?? {};
  if (typeof cap.overAllocationThresholdPct !== 'undefined') {
    const v = Number(cap.overAllocationThresholdPct);
    if (!Number.isFinite(v) || v < 50 || v > 400) {
      return { ok: false, error: 'capacity.overAllocationThresholdPct must be between 50 and 400' };
    }
  }
  if (typeof cap.backupHandoffLeaveDays !== 'undefined') {
    const v = Number(cap.backupHandoffLeaveDays);
    if (!Number.isFinite(v) || v < 1 || v > 90) {
      return { ok: false, error: 'capacity.backupHandoffLeaveDays must be between 1 and 90' };
    }
  }

  const ts = c.timesheets ?? {};
  if (
    typeof ts.approvalMode !== 'undefined' &&
    !['allocation_approver', 'project_manager', 'hr_admin'].includes(ts.approvalMode)
  ) {
    return { ok: false, error: 'timesheets.approvalMode must be allocation_approver | project_manager | hr_admin' };
  }

  const cl = c.closure ?? {};
  if (typeof cl.complianceChecklist !== 'undefined') {
    if (!Array.isArray(cl.complianceChecklist) || cl.complianceChecklist.some((x: unknown) => typeof x !== 'string')) {
      return { ok: false, error: 'closure.complianceChecklist must be an array of strings' };
    }
  }

  const sp = c.sprints ?? {};
  if (typeof sp.defaultDurationDays !== 'undefined') {
    const v = Number(sp.defaultDurationDays);
    if (!Number.isFinite(v) || v < 3 || v > 60) {
      return { ok: false, error: 'sprints.defaultDurationDays must be between 3 and 60' };
    }
  }

  return { ok: true, value: cfg as ProjectWorkflowConfigShape };
}

/** Deep-merge a partial config over the defaults (arrays replaced wholesale). */
export function mergeProjectWorkflowConfig(partial: unknown): ProjectWorkflowConfigShape {
  const base = JSON.parse(JSON.stringify(DEFAULT_PROJECT_WORKFLOW_CONFIG)) as ProjectWorkflowConfigShape;
  if (!partial || typeof partial !== 'object') return base;
  const p = partial as Record<string, any>;
  for (const key of Object.keys(base) as (keyof ProjectWorkflowConfigShape)[]) {
    if (p[key] === undefined) continue;
    if (Array.isArray(base[key])) {
      (base as any)[key] = p[key];
    } else if (typeof base[key] === 'object' && base[key] !== null) {
      (base as any)[key] = { ...(base as any)[key], ...(typeof p[key] === 'object' && p[key] !== null ? p[key] : {}) };
    } else {
      (base as any)[key] = p[key];
    }
  }
  return base;
}

// ─────────────────────────── Resolution ───────────────────────────

/**
 * Resolve the effective config for a tenant (optionally company-scoped).
 * Precedence: company row → tenant-wide row (companyId null) → defaults.
 */
export async function resolveProjectWorkflowConfig(
  db: any,
  tenantId: string | null | undefined,
  companyId?: string | null
): Promise<ProjectWorkflowConfigShape> {
  try {
    if (!tenantId) return DEFAULT_PROJECT_WORKFLOW_CONFIG;
    const rows = await db.projectWorkflowConfig.findMany({
      where: { tenantId, isActive: true, OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])] },
      orderBy: { updatedAt: 'desc' },
    });
    const companyRow = companyId ? rows.find((r: any) => r.companyId === companyId) : null;
    const tenantRow = rows.find((r: any) => r.companyId === null);
    const row = companyRow || tenantRow;
    if (!row) return DEFAULT_PROJECT_WORKFLOW_CONFIG;
    return mergeProjectWorkflowConfig(JSON.parse(row.config));
  } catch {
    return DEFAULT_PROJECT_WORKFLOW_CONFIG;
  }
}

/** Resolve a ProjectApprovalStep tier to a concrete employeeId. */
export async function resolveTierApprover(
  db: any,
  project: { projectManagerId?: string | null; deliveryManagerId?: string | null; departmentId?: string | null; executiveSponsor?: string | null },
  tier: ProjectApprovalTier
): Promise<{ employeeId: string | null; note?: string }> {
  switch (tier.approverType) {
    case 'reporting_manager':
      return { employeeId: project.projectManagerId || project.deliveryManagerId || null };
    case 'department_head': {
      if (!project.departmentId) return { employeeId: null, note: 'No department on project' };
      const dept = await db.department.findUnique({ where: { id: project.departmentId }, select: { headId: true } }).catch(() => null);
      return { employeeId: dept?.headId || null, note: dept?.headId ? undefined : 'Department has no head set' };
    }
    case 'project_sponsor':
      return { employeeId: project.executiveSponsor || tier.approverValue || null };
    case 'specific_employee':
      return { employeeId: tier.approverValue || null };
    case 'hr_admin':
    case 'tenant_admin': case 'ceo':
    default:
      // Role-based approvers are resolved at decision time by role check,
      // not pinned to one employee.
      return { employeeId: null };
  }
}
