/**
 * Recruitment / Preboarding / Onboarding — dynamic workflow configuration.
 *
 * Per-tenant, optionally per-company configuration stored in the
 * RecruitmentWorkflowConfig table (JSON `config` column), resolved through:
 *   company-scoped row → tenant-wide row (companyId null) → built-in defaults.
 *
 * Three workflow types:
 *   1. recruitment  — application pipeline stages + offer-approval chain
 *   2. preboarding  — offer-acceptance → joining stage machine
 *   3. onboarding   — post-joining checklist generated on ATS→employee convert
 *
 * Stage KEYS are bound to the values the rest of the system persists
 * (JobApplication.status / PreboardingCandidate.status) so data integrity is
 * preserved; tenants dynamically control labels, order, visibility, SLAs,
 * approval chains and the generated checklist.
 */

// ─────────────────────────── Types ───────────────────────────

export type WorkflowType = 'recruitment' | 'preboarding' | 'onboarding';

export const WORKFLOW_TYPES: WorkflowType[] = ['recruitment', 'preboarding', 'onboarding'];

export interface PipelineStage {
  key: string;        // persisted JobApplication.status value
  label: string;      // display label
  color?: string;     // tailwind-ish token: slate|blue|amber|violet|green|red|cyan
  slaDays?: number | null;  // target days to clear this stage (informational + UI)
  enabled?: boolean;  // hidden from pipeline UI when false (existing records still render)
}

export interface ApprovalTier {
  tier: number;
  approverType: 'reporting_manager' | 'department_head' | 'hr_admin' | 'tenant_admin' | 'finance' | 'specific_user';
  approverUserId?: string | null;
  label?: string;
}

export interface RecruitmentWorkflowConfig {
  stages: PipelineStage[];
  offerApproval: {
    enabled: boolean;
    tiers: ApprovalTier[];   // sequential; empty = any hr_admin/admin can approve
  };
  autoAdvance?: boolean;     // auto-move application to next enabled stage on SLA breach (future)
}

export interface PreboardingStage {
  key: string;         // persisted PreboardingCandidate.status value
  label: string;
  slaDays?: number | null;
  enabled?: boolean;
  notifyRoles?: string[];    // roles notified when a candidate enters this stage
}

export interface PreboardingWorkflowConfig {
  stages: PreboardingStage[];
  requireHRVerification?: boolean;
  blockJoiningUntilDocsComplete?: boolean;
}

export interface OnboardingTaskDef {
  task: string;
  category: string;    // general, it_setup, hr_docs, training, introduction, buddy_setup, payroll_setup, project_allocation
  dueOffsetDays: number;
  assigneeRole?: string | null;
}

export interface OnboardingPhase {
  key: string;
  label: string;
  tasks: OnboardingTaskDef[];
}

export interface OnboardingWorkflowConfig {
  generateFromTemplates: boolean;  // also use OnboardingTaskTemplate rows (if any)
  phases: OnboardingPhase[];       // flat checklist generated on convert
  buddyEnabled?: boolean;
}

// ─────────────────────── System stage keys ───────────────────────

/** JobApplication.status values (see prisma schema comment). */
export const APPLICATION_STAGE_KEYS = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'] as const;

/** PreboardingCandidate.status values (see prisma schema comment). */
export const PREBOARDING_STAGE_KEYS = ['offer_accepted', 'document_collection', 'bgv', 'provisioning', 'asset_request', 'joined'] as const;

export const ONBOARDING_TASK_CATEGORIES = [
  'general', 'it_setup', 'hr_docs', 'training', 'introduction', 'buddy_setup', 'payroll_setup', 'project_allocation',
] as const;

// ─────────────────────────── Defaults ───────────────────────────

export const DEFAULT_RECRUITMENT_CONFIG: RecruitmentWorkflowConfig = {
  stages: [
    { key: 'applied', label: 'Applied', color: 'slate', slaDays: null, enabled: true },
    { key: 'screening', label: 'Screening', color: 'blue', slaDays: 3, enabled: true },
    { key: 'interview', label: 'Interview', color: 'amber', slaDays: 7, enabled: true },
    { key: 'offered', label: 'Offered', color: 'violet', slaDays: 3, enabled: true },
    { key: 'hired', label: 'Hired', color: 'green', slaDays: null, enabled: true },
    { key: 'rejected', label: 'Rejected', color: 'red', slaDays: null, enabled: true },
  ],
  offerApproval: {
    enabled: true,
    tiers: [{ tier: 1, approverType: 'hr_admin', label: 'HR Approval' }],
  },
  autoAdvance: false,
};

export const DEFAULT_PREBOARDING_CONFIG: PreboardingWorkflowConfig = {
  stages: [
    { key: 'offer_accepted', label: 'Offer Accepted', slaDays: 2, enabled: true, notifyRoles: ['hr_admin'] },
    { key: 'document_collection', label: 'Document Collection', slaDays: 5, enabled: true, notifyRoles: ['hr_admin'] },
    { key: 'bgv', label: 'Background Verification', slaDays: 7, enabled: true, notifyRoles: ['hr_admin'] },
    { key: 'provisioning', label: 'IT Provisioning', slaDays: 3, enabled: true, notifyRoles: ['it_admin'] },
    { key: 'asset_request', label: 'Asset Request', slaDays: 2, enabled: true, notifyRoles: ['admin'] },
    { key: 'joined', label: 'Day 1 Ready / Joined', slaDays: null, enabled: true, notifyRoles: [] },
  ],
  requireHRVerification: true,
  blockJoiningUntilDocsComplete: false,
};

export const DEFAULT_ONBOARDING_CONFIG: OnboardingWorkflowConfig = {
  generateFromTemplates: true,
  buddyEnabled: true,
  phases: [
    {
      key: 'pre_joining',
      label: 'Pre-Joining (before Day 1)',
      tasks: [
        { task: 'Send digital paperwork pack (tax forms, direct deposit, employment agreement, emergency contact)', category: 'hr_docs', dueOffsetDays: -3 },
        { task: 'Collect signed NDA and policy acknowledgments', category: 'hr_docs', dueOffsetDays: 0 },
        { task: 'Create system access and corporate email account', category: 'it_setup', dueOffsetDays: -1 },
        { task: 'Allocate laptop / device and workstation', category: 'it_setup', dueOffsetDays: -1 },
      ],
    },
    {
      key: 'day_one',
      label: 'Day 1 & First Week',
      tasks: [
        { task: 'Payroll setup and benefits enrollment', category: 'payroll_setup', dueOffsetDays: 1 },
        { task: 'Team introductions and office orientation', category: 'introduction', dueOffsetDays: 0 },
        { task: 'First check-in with buddy / mentor', category: 'buddy_setup', dueOffsetDays: 1 },
      ],
    },
    {
      key: 'ramp_up',
      label: 'Ramp-up (30 days)',
      tasks: [
        { task: 'Assign initial training modules and KRAs', category: 'training', dueOffsetDays: 7 },
        { task: 'Project / team allocation review with manager', category: 'project_allocation', dueOffsetDays: 14 },
      ],
    },
  ],
};

export const DEFAULT_CONFIGS: Record<WorkflowType, RecruitmentWorkflowConfig | PreboardingWorkflowConfig | OnboardingWorkflowConfig> = {
  recruitment: DEFAULT_RECRUITMENT_CONFIG,
  preboarding: DEFAULT_PREBOARDING_CONFIG,
  onboarding: DEFAULT_ONBOARDING_CONFIG,
};

// ─────────────────────────── Validation ───────────────────────────

function isStr(v: unknown): v is string { return typeof v === 'string'; }

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validateRecruitmentConfig(cfg: unknown): { ok: true; value: RecruitmentWorkflowConfig } | { ok: false; error: string } {
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'Config must be an object' };
  const c = cfg as Record<string, unknown>;

  if (!Array.isArray(c.stages) || c.stages.length === 0) return { ok: false, error: 'At least one pipeline stage is required' };
  const seen = new Set<string>();
  const stages: PipelineStage[] = [];
  for (const raw of c.stages) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each stage must be an object' };
    const s = raw as Record<string, unknown>;
    if (!isStr(s.key) || !(APPLICATION_STAGE_KEYS as readonly string[]).includes(s.key)) {
      return { ok: false, error: `Invalid stage key "${String(s.key)}" — allowed: ${APPLICATION_STAGE_KEYS.join(', ')}` };
    }
    if (seen.has(s.key)) return { ok: false, error: `Duplicate stage key "${s.key}"` };
    seen.add(s.key);
    if (!isStr(s.label) || !s.label.trim()) return { ok: false, error: `Stage "${s.key}" needs a non-empty label` };
    if (s.slaDays != null && num(s.slaDays) === null) return { ok: false, error: `Stage "${s.key}" slaDays must be a number` };
    stages.push({
      key: s.key,
      label: s.label.trim().slice(0, 60),
      color: isStr(s.color) ? s.color : 'slate',
      slaDays: s.slaDays == null ? null : num(s.slaDays),
      enabled: s.enabled !== false,
    });
  }

  const oa = (c.offerApproval && typeof c.offerApproval === 'object' ? c.offerApproval : {}) as Record<string, unknown>;
  const tiers: ApprovalTier[] = [];
  if (Array.isArray(oa.tiers)) {
    const allowed = ['reporting_manager', 'department_head', 'hr_admin', 'tenant_admin', 'finance', 'specific_user'];
    let tierNo = 0;
    for (const raw of oa.tiers) {
      if (!raw || typeof raw !== 'object') continue;
      const t = raw as Record<string, unknown>;
      if (!isStr(t.approverType) || !allowed.includes(t.approverType)) {
        return { ok: false, error: `Invalid approverType "${String(t.approverType)}" — allowed: ${allowed.join(', ')}` };
      }
      tierNo += 1;
      if (t.approverType === 'specific_user' && !isStr(t.approverUserId)) {
        return { ok: false, error: `Tier ${tierNo}: specific_user requires approverUserId` };
      }
      tiers.push({
        tier: tierNo,
        approverType: t.approverType as ApprovalTier['approverType'],
        approverUserId: isStr(t.approverUserId) ? t.approverUserId : null,
        label: isStr(t.label) ? t.label.slice(0, 80) : undefined,
      });
    }
  }

  return {
    ok: true,
    value: {
      stages,
      offerApproval: { enabled: oa.enabled !== false, tiers },
      autoAdvance: c.autoAdvance === true,
    },
  };
}

export function validatePreboardingConfig(cfg: unknown): { ok: true; value: PreboardingWorkflowConfig } | { ok: false; error: string } {
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'Config must be an object' };
  const c = cfg as Record<string, unknown>;
  if (!Array.isArray(c.stages) || c.stages.length === 0) return { ok: false, error: 'At least one preboarding stage is required' };
  const seen = new Set<string>();
  const stages: PreboardingStage[] = [];
  for (const raw of c.stages) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each stage must be an object' };
    const s = raw as Record<string, unknown>;
    if (!isStr(s.key) || !(PREBOARDING_STAGE_KEYS as readonly string[]).includes(s.key)) {
      return { ok: false, error: `Invalid stage key "${String(s.key)}" — allowed: ${PREBOARDING_STAGE_KEYS.join(', ')}` };
    }
    if (seen.has(s.key)) return { ok: false, error: `Duplicate stage key "${s.key}"` };
    seen.add(s.key);
    if (!isStr(s.label) || !s.label.trim()) return { ok: false, error: `Stage "${s.key}" needs a non-empty label` };
    const notifyRoles = Array.isArray(s.notifyRoles) ? s.notifyRoles.filter(isStr).slice(0, 8) : [];
    stages.push({
      key: s.key,
      label: s.label.trim().slice(0, 60),
      slaDays: s.slaDays == null ? null : num(s.slaDays),
      enabled: s.enabled !== false,
      notifyRoles,
    });
  }
  return {
    ok: true,
    value: {
      stages,
      requireHRVerification: c.requireHRVerification !== false,
      blockJoiningUntilDocsComplete: c.blockJoiningUntilDocsComplete === true,
    },
  };
}

export function validateOnboardingConfig(cfg: unknown): { ok: true; value: OnboardingWorkflowConfig } | { ok: false; error: string } {
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'Config must be an object' };
  const c = cfg as Record<string, unknown>;
  if (!Array.isArray(c.phases)) return { ok: false, error: 'phases must be an array' };
  const phases: OnboardingPhase[] = [];
  let total = 0;
  for (const raw of c.phases) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each phase must be an object' };
    const p = raw as Record<string, unknown>;
    const tasks: OnboardingTaskDef[] = [];
    if (Array.isArray(p.tasks)) {
      for (const tRaw of p.tasks) {
        if (!tRaw || typeof tRaw !== 'object') continue;
        const t = tRaw as Record<string, unknown>;
        if (!isStr(t.task) || !t.task.trim()) return { ok: false, error: 'Each task needs non-empty text' };
        const cat = isStr(t.category) && (ONBOARDING_TASK_CATEGORIES as readonly string[]).includes(t.category) ? t.category : 'general';
        const off = t.dueOffsetDays == null ? 0 : num(t.dueOffsetDays);
        if (off === null) return { ok: false, error: `Task "${t.task}": dueOffsetDays must be a number` };
        tasks.push({
          task: t.task.trim().slice(0, 300),
          category: cat,
          dueOffsetDays: off,
          assigneeRole: isStr(t.assigneeRole) ? t.assigneeRole : null,
        });
        total += 1;
      }
    }
    if (!isStr(p.key) || !p.key.trim()) return { ok: false, error: 'Each phase needs a key' };
    phases.push({ key: p.key.trim().slice(0, 40), label: isStr(p.label) && p.label.trim() ? p.label.trim().slice(0, 60) : p.key, tasks });
  }
  if (total > 100) return { ok: false, error: 'Too many tasks (max 100)' };
  return {
    ok: true,
    value: {
      generateFromTemplates: c.generateFromTemplates !== false,
      buddyEnabled: c.buddyEnabled !== false,
      phases,
    },
  };
}

export function validateWorkflowConfig(type: WorkflowType, cfg: unknown) {
  switch (type) {
    case 'recruitment': return validateRecruitmentConfig(cfg);
    case 'preboarding': return validatePreboardingConfig(cfg);
    case 'onboarding': return validateOnboardingConfig(cfg);
  }
}

// ─────────────────────────── Resolution ───────────────────────────

function deepMergeList<T extends { key: string }>(base: T[], override: unknown): T[] {
  if (!Array.isArray(override)) return base;
  const byKey = new Map(base.map((s) => [s.key, s]));
  const out: T[] = [];
  for (const raw of override) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (!isStr(o.key)) continue;
    const merged = { ...(byKey.get(o.key) || ({} as T)), ...(o as T) } as T;
    out.push(merged);
    byKey.delete(o.key);
  }
  // keep any default stages not explicitly listed at the end
  for (const rest of byKey.values()) out.push(rest);
  return out;
}

/**
 * Resolve the effective config for a tenant (optionally company-scoped).
 * Falls back: company row → tenant-wide row → defaults, merging each layer
 * over the defaults so newly introduced fields always have values.
 */
export async function resolveWorkflowConfig(
  db: Record<string, any>,
  tenantId: string | null | undefined,
  type: WorkflowType,
  companyId?: string | null
): Promise<RecruitmentWorkflowConfig | PreboardingWorkflowConfig | OnboardingWorkflowConfig> {
  const defaults = DEFAULT_CONFIGS[type];
  if (!tenantId) return defaults;
  try {
    const rows = await (db as any).recruitmentWorkflowConfig.findMany({
      where: { tenantId, workflowType: type, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!rows?.length) return defaults;
    const companyRow = companyId ? rows.find((r: any) => r.companyId === companyId) : null;
    const tenantRow = rows.find((r: any) => !r.companyId);
    const row = companyRow || tenantRow;
    if (!row?.config) return defaults;
    let parsed: unknown;
    try { parsed = JSON.parse(row.config); } catch { return defaults; }
    // Merge over defaults by shape
    if (type === 'recruitment') {
      const v = validateRecruitmentConfig({ ...defaults, ...(parsed as object) });
      if (v.ok) {
        const d = defaults as RecruitmentWorkflowConfig;
        return { ...v.value, stages: deepMergeList(d.stages, (parsed as any)?.stages) };
      }
      return defaults;
    }
    if (type === 'preboarding') {
      const v = validatePreboardingConfig({ ...defaults, ...(parsed as object) });
      if (v.ok) {
        const d = defaults as PreboardingWorkflowConfig;
        return { ...v.value, stages: deepMergeList(d.stages, (parsed as any)?.stages) };
      }
      return defaults;
    }
    const v = validateOnboardingConfig({ ...defaults, ...(parsed as object) });
    return v.ok ? v.value : defaults;
  } catch {
    return defaults;
  }
}

/** Convenience: strongly-typed resolvers. */
export async function resolveRecruitmentConfig(db: any, tenantId: string | null | undefined, companyId?: string | null): Promise<RecruitmentWorkflowConfig> {
  return (await resolveWorkflowConfig(db, tenantId, 'recruitment', companyId)) as RecruitmentWorkflowConfig;
}
export async function resolvePreboardingConfig(db: any, tenantId: string | null | undefined, companyId?: string | null): Promise<PreboardingWorkflowConfig> {
  return (await resolveWorkflowConfig(db, tenantId, 'preboarding', companyId)) as PreboardingWorkflowConfig;
}
export async function resolveOnboardingConfig(db: any, tenantId: string | null | undefined, companyId?: string | null): Promise<OnboardingWorkflowConfig> {
  return (await resolveWorkflowConfig(db, tenantId, 'onboarding', companyId)) as OnboardingWorkflowConfig;
}

/** Enabled stage keys in configured order. */
export function enabledStageKeys(config: RecruitmentWorkflowConfig): string[] {
  return config.stages.filter((s) => s.enabled !== false).map((s) => s.key);
}
export function enabledPreboardingKeys(config: PreboardingWorkflowConfig): string[] {
  return config.stages.filter((s) => s.enabled !== false).map((s) => s.key);
}
