/**
 * Approver configuration resolver — shared by:
 *  - /api/employees/update-requests      (profile update workflow)
 *  - /api/employees/probation/[id]       (probation → confirmation workflow)
 *  - /api/employees/workflow-config      (CRUD for the configuration)
 *
 * EmployeeWorkflowConfig rows are stored per-tenant with workflowType:
 *   'update_profile'          — profile field-change approval chain
 *   'probation_confirmation'  — probation → confirmed approval chain
 *
 * config JSON shape:
 *   { tiers: [{ approverType, approverUserId?, approverName? }], fieldSensitivity?: {...} }
 */
import { getAuthInfo } from '@/lib/companyScope';

export type ApproverType = 'reporting_manager' | 'hr_admin' | 'tenant_admin' | 'ceo' | 'specific_user' | 'finance';

export interface WorkflowTier {
  approverType: ApproverType;
  approverUserId?: string | null;
  approverName?: string | null;
}

export interface ParsedWorkflowConfig {
  id: string;
  name: string;
  tiers: WorkflowTier[];
  fieldSensitivity?: Record<string, string>;
  actionRules?: Record<string, { reviewStatus: string; decision: string; employeeStatus?: string }>;
  extension?: { enabled: boolean; maxMonths: number; defaultMonths: number };
}

/**
 * The first-run values are migration seeds, not runtime fallbacks.  They are
 * written to EmployeeWorkflowConfig and all workflow execution reads the
 * tenant's saved row afterwards.
 */
export const WORKFLOW_SEEDS: Record<'update_profile' | 'probation_confirmation', WorkflowTier[]> = {
  update_profile: [
    { approverType: 'reporting_manager', approverName: 'Reporting Manager' },
    { approverType: 'hr_admin', approverName: 'HR Admin' },
  ],
  probation_confirmation: [
    { approverType: 'hr_admin', approverName: 'HR Review' },
    { approverType: 'tenant_admin', approverName: 'MD/Admin Final Confirmation' },
  ],
};

export const PROBATION_RULE_SEED = {
  approve: { reviewStatus: 'completed', decision: 'confirm', employeeStatus: 'confirmed' },
  extend: { reviewStatus: 'in_progress', decision: 'extend' },
  reject: { reviewStatus: 'rejected', decision: 'terminate', employeeStatus: 'terminated' },
};

export const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  reporting_manager: 'Reporting Manager',
  hr_admin: 'HR Admin',
  tenant_admin: 'MD / Tenant Admin',
  ceo: 'CEO',
  specific_user: 'Specific User',
  finance: 'Finance',
};

/** Load the active workflow config of a given type for the current tenant. */
export async function loadWorkflowConfig(
  db: Record<string, any>,
  req: Request,
  workflowType: 'update_profile' | 'probation_confirmation',
): Promise<ParsedWorkflowConfig | null> {
  try {
    const auth = await getAuthInfo(req);
    if (!auth?.tenantId) return null;
    const cfg = await (db as any).employeeWorkflowConfig?.findFirst({
      where: { tenantId: auth.tenantId, workflowType, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!cfg) return null;
    let parsed: { tiers?: WorkflowTier[]; fieldSensitivity?: Record<string, string>; actionRules?: ParsedWorkflowConfig['actionRules']; extension?: ParsedWorkflowConfig['extension'] } = {};
    try { parsed = JSON.parse(cfg.config || '{}'); } catch { return null; }
    const tiers = Array.isArray(parsed.tiers) ? parsed.tiers.filter((t) => t && t.approverType) : [];
    if (!tiers.length) return null;
    return { id: cfg.id, name: cfg.name, tiers, fieldSensitivity: parsed.fieldSensitivity, actionRules: parsed.actionRules, extension: parsed.extension };
  } catch {
    return null;
  }
}

/** Ensure a tenant has a persisted configuration before a workflow runs. */
export async function ensureWorkflowConfig(
  db: Record<string, any>,
  req: Request,
  workflowType: 'update_profile' | 'probation_confirmation',
): Promise<ParsedWorkflowConfig | null> {
  const existing = await loadWorkflowConfig(db, req, workflowType);
  if (existing) {
    if (workflowType === 'probation_confirmation' && (!existing.actionRules || !existing.extension)) {
      try {
        const auth = await getAuthInfo(req);
        const current = await db.employeeWorkflowConfig.findUnique({ where: { id: existing.id } });
        const parsed = JSON.parse(current.config || '{}');
        const migrated = { ...parsed, actionRules: parsed.actionRules || PROBATION_RULE_SEED, extension: parsed.extension || { enabled: true, maxMonths: 12, defaultMonths: 3 } };
        await db.employeeWorkflowConfig.update({ where: { id: existing.id }, data: { config: JSON.stringify(migrated) } });
        return { ...existing, actionRules: migrated.actionRules, extension: migrated.extension };
      } catch { /* existing configuration remains authoritative */ }
    }
    return existing;
  }
  try {
    const auth = await getAuthInfo(req);
    if (!auth?.tenantId) return null;
    const tiers = WORKFLOW_SEEDS[workflowType];
    const config = workflowType === 'probation_confirmation'
      ? { tiers, actionRules: PROBATION_RULE_SEED, extension: { enabled: true, maxMonths: 12, defaultMonths: 3 } }
      : { tiers };
    const cfg = await db.employeeWorkflowConfig.create({
      data: {
        tenantId: auth.tenantId,
        workflowType,
        isActive: true,
        name: workflowType === 'update_profile' ? 'Profile Update Approval Workflow' : 'Probation Confirmation Approval Workflow',
        config: JSON.stringify(config),
      },
    });
    return { id: cfg.id, name: cfg.name, tiers, actionRules: workflowType === 'probation_confirmation' ? PROBATION_RULE_SEED : undefined, extension: workflowType === 'probation_confirmation' ? { enabled: true, maxMonths: 12, defaultMonths: 3 } : undefined };
  } catch {
    return null;
  }
}

/**
 * Resolve the concrete userId(s) that act for a tier, given the employee in
 * question. Always includes super_admin/tenant_admin as a fallback audience
 * for notification purposes (they can act on any stage).
 */
export async function resolveTierApprovers(
  db: Record<string, any>,
  tier: WorkflowTier,
  employeeId: string,
): Promise<{ userIds: string[]; label: string }> {
  const label = tier.approverName || APPROVER_TYPE_LABELS[tier.approverType] || tier.approverType;
  const userIds = new Set<string>();
  try {
    if (tier.approverType === 'reporting_manager') {
      const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } });
      if (emp?.reportingManagerId) {
        const mgr = await db.employee.findUnique({ where: { id: emp.reportingManagerId }, select: { userId: true } });
        if (mgr?.userId) userIds.add(mgr.userId);
      }
    } else if (tier.approverType === 'hr_admin') {
      // tenant_admin included: on tenants where the HR lead holds the
      // tenant_admin role (e.g. MarqAI — hr@gmail.com), HR-tier alerts
      // must reach them, not only literal hr_admin accounts.
      const admins = await db.user.findMany({
        where: { role: { in: ['admin', 'hr_admin', 'company_hr_admin', 'tenant_admin', 'ceo'] }, status: 'active' },
        select: { id: true },
        take: 20,
      });
      admins.forEach((a: { id: string }) => userIds.add(a.id));
    } else if ((tier.approverType === 'tenant_admin' || tier.approverType === 'ceo')) {
      const admins = await db.user.findMany({
        where: { role: { in: ['super_admin', 'tenant_admin', 'ceo'] }, status: 'active' },
        select: { id: true },
        take: 20,
      });
      admins.forEach((a: { id: string }) => userIds.add(a.id));
    } else if (tier.approverType === 'finance') {
      const fin = await db.user.findMany({
        where: { role: { in: ['finance', 'finance_admin'] }, status: 'active' },
        select: { id: true },
        take: 20,
      });
      fin.forEach((a: { id: string }) => userIds.add(a.id));
    } else if (tier.approverType === 'specific_user' && tier.approverUserId) {
      userIds.add(tier.approverUserId);
    }
  } catch { /* fall through */ }
  return { userIds: [...userIds], label };
}
