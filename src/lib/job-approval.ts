/**
 * 3Boxes HRMS — Job approval chain engine (shared by job create/update and
 * the /api/recruitment/job-approval route).
 *
 * Mirrors the requisition approval engine: a tenant-configured, ordered tier
 * list (JobApprovalWorkflowConfig) decides who must approve a job posting
 * before it goes live. While pending, JobPosting.status = 'pending_approval'
 * and jobApprovalStatus tracks the tier walk:
 *   pending → tier_<n>_approved → approved | rejected
 *
 * Column-safety: all JobPosting approval columns are additive — the
 * ensureJobApprovalColumns() guard creates them at runtime (P2022 guard, same
 * pattern as the hiringTeam column) so tenants that haven't been synced yet
 * keep working.
 */
import {
  resolveJobApprovalConfig,
  canApproveAtApprovalTier,
  approvalTierIndexToStatus,
  approvalStatusToTierIndex,
  rolesForApprovalTier,
  RequisitionApprovalTier,
  JobApprovalWorkflowConfig,
} from '@/lib/recruitment-workflow';

export type { JobApprovalWorkflowConfig };

let columnsEnsured = false;

/** Runtime additive-column guard (Postgres only — cheap IF NOT EXISTS). */
export async function ensureJobApprovalColumns(db: Record<string, any>): Promise<void> {
  if (columnsEnsured) return;
  const statements = [
    `ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "jobApprovalStatus" TEXT`,
    `ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "jobApprovalChain" TEXT`,
    `ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "jobApprovalRemarks" TEXT`,
    `ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "jobApprovedAt" TIMESTAMP(3)`,
  ];
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch {
      /* SQLite (local dev) or already exists — non-fatal */
    }
  }
  columnsEnsured = true;
}

/** Resolve the job's hiring manager (first hiring_manager in the team JSON). */
export function resolveJobHiringManagerId(job: { hiringTeam?: string | null }): string | null {
  try {
    if (!job.hiringTeam) return null;
    const team = typeof job.hiringTeam === 'string' ? JSON.parse(job.hiringTeam) : job.hiringTeam;
    if (!Array.isArray(team)) return null;
    const lead = team.find((m: Record<string, unknown>) => m?.role === 'hiring_manager' && m?.id);
    return (lead?.id as string) || null;
  } catch {
    return null;
  }
}

/** Resolve a department head login user id (Department.headId → Employee → User). */
export async function resolveDepartmentHeadUserIdForJob(db: Record<string, any>, departmentId: string | null | undefined): Promise<string | null> {
  if (!departmentId) return null;
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT u."id" AS "userId" FROM "Department" d
         JOIN "Employee" e ON e."id" = d."headId"
         LEFT JOIN "User" u ON u."id" = e."userId"
        WHERE d."id" = $1 LIMIT 1`,
      departmentId,
    ) as any[];
    return rows[0]?.userId || null;
  } catch {
    return null;
  }
}

export interface JobTierContext {
  chain: RequisitionApprovalTier[];
  currentIndex: number;       // 0-based tier the job is waiting on
  currentTier: RequisitionApprovalTier | null;
}

/** Parse the job's frozen approval chain and compute the waiting tier. */
export function jobApprovalContext(job: { jobApprovalChain?: string | null; jobApprovalStatus?: string | null }): JobTierContext | null {
  let chain: RequisitionApprovalTier[] = [];
  try {
    const raw = job.jobApprovalChain ? (typeof job.jobApprovalChain === 'string' ? JSON.parse(job.jobApprovalChain) : job.jobApprovalChain) : null;
    if (Array.isArray(raw) && raw.length > 0) chain = raw;
  } catch {
    return null;
  }
  if (chain.length === 0) return null;
  const done = approvalStatusToTierIndex(job.jobApprovalStatus);
  if (done >= chain.length) return null; // already approved
  return { chain, currentIndex: done, currentTier: chain[done] };
}

/** Can this user approve the job's CURRENT tier? */
export async function canUserApproveJob(
  db: Record<string, any>,
  job: { jobApprovalChain?: string | null; jobApprovalStatus?: string | null; departmentId?: string | null; hiringTeam?: string | null },
  user: { role: string; userId: string },
): Promise<boolean> {
  const ctx = jobApprovalContext(job);
  if (!ctx || !ctx.currentTier) return false;
  const deptHeadId = ctx.currentTier.approverType === 'department_head'
    ? await resolveDepartmentHeadUserIdForJob(db, job.departmentId)
    : null;
  return canApproveAtApprovalTier(
    ctx.currentTier,
    user.role,
    user.userId,
    resolveJobHiringManagerId(job),
    deptHeadId,
  );
}

/** Notify every user who can act on the given tier (role lists / specific user / dept head). */
export async function notifyTierApprovers(
  db: Record<string, any>,
  tenantId: string,
  job: { id: string; title: string; departmentId?: string | null },
  tier: RequisitionApprovalTier,
): Promise<void> {
  try {
    const { createNotification } = await import('@/lib/notifications');
    const { roles, specificUserId } = rolesForApprovalTier(tier);
    const targets: Array<{ id: string }> = [];
    if (roles.length > 0) {
      const rows = await (db as any).user.findMany({
        where: { tenantId, role: { in: roles } },
        select: { id: true },
      });
      targets.push(...rows);
    }
    if (specificUserId) {
      const row = await (db as any).user.findUnique({ where: { id: specificUserId }, select: { id: true } });
      if (row) targets.push(row);
    }
    if (tier.approverType === 'department_head' && job.departmentId) {
      const headUserId = await resolveDepartmentHeadUserIdForJob(db, job.departmentId);
      if (headUserId && !targets.some(t => t.id === headUserId)) {
        targets.push({ id: headUserId });
      }
    }
    const tierLabel = tier.label || tier.approverType.replace(/_/g, ' ');
    for (const t of targets) {
      await createNotification({
        tenantId,
        userId: t.id,
        title: 'Job Approval Required',
        message: `Job posting "${job.title}" is waiting for your approval (${tierLabel}).`,
        type: 'info',
        category: 'recruitment',
        link: `/recruitment/${job.id}`,
      }).catch(() => null);
    }
  } catch {
    /* notification failures must never break the approval flow */
  }
}

/**
 * Submit a job for approval: freeze the configured chain, set status to
 * 'pending_approval' + jobApprovalStatus 'pending', and notify Tier 1.
 * Returns the update data to persist (caller writes it).
 */
export async function submitJobForApproval(
  db: Record<string, any>,
  tenantId: string,
  job: { id: string; title: string; departmentId?: string | null },
  config: JobApprovalWorkflowConfig,
): Promise<Record<string, unknown>> {
  const tiers = config.tiers.map((t, i) => ({ ...t, tier: i + 1 }));
  const data = {
    status: 'pending_approval',
    jobApprovalStatus: 'pending',
    jobApprovalChain: JSON.stringify(tiers),
    jobApprovalRemarks: null as string | null,
    jobApprovedAt: null as Date | null,
  };
  await notifyTierApprovers(db, tenantId, job, tiers[0]);
  return data;
}

/** Apply an approve/reject action and return the resulting update data. */
export async function applyJobApprovalAction(
  db: Record<string, any>,
  tenantId: string,
  job: { id: string; title: string; departmentId?: string | null; jobApprovalChain?: string | null; jobApprovalStatus?: string | null },
  action: 'approve' | 'reject',
  remarks: string | null,
  approverName: string,
): Promise<{ data: Record<string, unknown>; final: boolean }> {
  const ctx = jobApprovalContext(job);
  if (!ctx) throw new Error('Job is not awaiting approval');
  const total = ctx.chain.length;
  if (action === 'reject') {
    return {
      data: {
        jobApprovalStatus: 'rejected',
        jobApprovalRemarks: remarks,
      },
      final: true,
    };
  }
  const done = ctx.currentIndex + 1;
  const tierLabel = ctx.currentTier?.label || ctx.currentTier?.approverType || '';
  if (done >= total) {
    // Final tier — publish the job
    await (db as any).auditLog.create({
      data: {
        userId: null,
        action: 'JOB_APPROVED_FINAL',
        module: 'recruitment',
        details: `Job posting "${job.title}" approved by ${approverName}${remarks ? ` — ${remarks}` : ''}`,
      },
    }).catch(() => null);
    return {
      data: {
        status: 'open',
        jobApprovalStatus: 'approved',
        jobApprovalRemarks: remarks,
        jobApprovedAt: new Date(),
      },
      final: true,
    };
  }
  const nextStatus = approvalTierIndexToStatus(done, total);
  await notifyTierApprovers(db, tenantId, job, ctx.chain[done]);
  await (db as any).auditLog.create({
    data: {
      userId: null,
      action: 'JOB_APPROVAL_TIER',
      module: 'recruitment',
      details: `Job "${job.title}": ${tierLabel} approved by ${approverName}; next tier ${ctx.chain[done]?.label || ctx.chain[done]?.approverType}`,
    },
  }).catch(() => null);
  return {
    data: {
      jobApprovalStatus: nextStatus,
      jobApprovalRemarks: remarks,
    },
    final: false,
  };
}
