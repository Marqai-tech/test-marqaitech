/**
 * BRD Figure 1.2 — Day 7 / 30 / 60 / 90 onboarding milestone follow-ups.
 *
 * The tenant's OnboardingTaskTemplate rows previously only covered
 * offsets −3…+14 (joining-week tasks). This module adds the four milestone
 * check-in templates and self-heals them into the tenant DB (idempotent —
 * safe to run on every cron sweep).
 *
 * Task generation needs no extra wiring: onboarding-cascade already expands
 * every active template at employee creation (dueDate = joining +
 * dueOffsetDays), and the onboarding-reminders cron already sweeps pending
 * tasks due within 2 days.
 */
type Tx = { $queryRawUnsafe: (q: string, ...p: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...p: any[]) => Promise<any> };

export interface MilestoneTemplate {
  name: string;
  task: string;
  category: string;
  dueOffsetDays: number;
  priority: 'low' | 'medium' | 'high';
}

export const MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  {
    name: 'Day 7 check-in — first-week feedback',
    task: 'Day 7 check-in: first-week feedback, ramp-up review and open questions with the new joiner (BRD Figure 1.2 milestone).',
    category: 'introduction',
    dueOffsetDays: 7,
    priority: 'high',
  },
  {
    name: 'Day 30 milestone — integration review',
    task: 'Day 30 milestone: 30-day integration and performance review — role clarity, initial deliverables, training progress.',
    category: 'general',
    dueOffsetDays: 30,
    priority: 'medium',
  },
  {
    name: 'Day 60 milestone — progress & training check',
    task: 'Day 60 milestone: 60-day progress review and training-completion check with the reporting manager.',
    category: 'training',
    dueOffsetDays: 60,
    priority: 'medium',
  },
  {
    name: 'Day 90 milestone — probation-end review & onboarding completion',
    task: 'Day 90 milestone: probation-end review, feedback from manager/buddy and onboarding completion sign-off (BRD Figure 1.2).',
    category: 'general',
    dueOffsetDays: 90,
    priority: 'high',
  },
];

/**
 * Insert any missing milestone template (idempotent per name). `tenantId`
 * falls back to the tenant DB's own Tenant row, then 'default-tenant' —
 * the same fallback the template API uses.
 */
export async function ensureMilestoneTemplates(db: Tx, tenantId?: string | null): Promise<number> {
  let resolvedTenantId = tenantId || null;
  if (!resolvedTenantId) {
    const rows = await db.$queryRawUnsafe(`SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[];
    resolvedTenantId = rows[0]?.id || 'default-tenant';
  }
  let added = 0;
  for (const t of MILESTONE_TEMPLATES) {
    const exists = await db.$queryRawUnsafe(
      `SELECT 1 FROM "OnboardingTaskTemplate" WHERE "name" = $1 LIMIT 1`, t.name,
    ).catch(() => []) as any[];
    if (exists.length) continue;
    const n = await db.$executeRawUnsafe(
      `INSERT INTO "OnboardingTaskTemplate"
         ("id","tenantId","name","task","category","dueOffsetDays","isActive","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())`,
      `ott-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resolvedTenantId, t.name, t.task, t.category, t.dueOffsetDays,
    ).catch(() => 0);
    added += Number(n || 0);
  }
  return added;
}

/**
 * Backfill: create the milestone TASKS for employees already in onboarding
 * (joined before the templates existed), so in-flight joiners also get their
 * Day 7/30/60/90 check-ins. dueDate = dateOfJoining + offset (a past date is
 * intentional — it surfaces as due/overdue exactly like the BRD follow-up).
 *
 * Skips employees who joined more than 180 days ago (historic noise) and
 * anyone who already has a task from the milestone template.
 */
export async function backfillMilestoneTasks(db: Tx): Promise<number> {
  // templateId per milestone template (idempotency key for the backfill)
  const templates = await db.$queryRawUnsafe(
    `SELECT "id","name","task","category","dueOffsetDays" FROM "OnboardingTaskTemplate"
     WHERE "name" LIKE 'Day %' AND "isActive" = true`,
  ).catch(() => []) as any[];
  if (!templates.length) return 0;

  const joiners = await db.$queryRawUnsafe(
    `SELECT e."id", e."dateOfJoining" FROM "Employee" e
     WHERE e."dateOfJoining" IS NOT NULL
       AND e."dateOfJoining" >= NOW() - INTERVAL '30 days'
       AND e."dateOfJoining" <= NOW() + INTERVAL '14 days'`,
  ).catch(() => []) as any[];
  // NOTE: previously this query required an existing OnboardingTask row per
  // employee (EXISTS ...) — but backfillMilestoneTasks is the ONLY creator of
  // OnboardingTask rows, so that filter excluded every brand-new joiner and
  // the progress dashboard stayed empty forever (chicken-and-egg). The window
  // above (joined ≤30d ago / joining ≤14d ahead) keeps historical employees
  // out; per-(employee, template) idempotency is handled inside the loop.
  if (!joiners.length) return 0;

  let created = 0;
  for (const emp of joiners) {
    const joining = new Date(emp.dateOfJoining);
    if (Number.isNaN(joining.getTime())) continue;
    for (const t of templates) {
      const exists = await db.$queryRawUnsafe(
        `SELECT 1 FROM "OnboardingTask" WHERE "employeeId" = $1 AND "templateId" = $2 LIMIT 1`,
        emp.id, t.id,
      ).catch(() => []) as any[];
      if (exists.length) continue;
      const due = new Date(joining);
      due.setDate(due.getDate() + Number(t.dueOffsetDays || 0));
      const n = await db.$executeRawUnsafe(
        `INSERT INTO "OnboardingTask"
           ("id","employeeId","task","category","status","dueDate","assignedBy","templateId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'pending',$5,'System (Day 7/30/60/90 milestones)',$6,NOW(),NOW())`,
        `ot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        emp.id, t.task, t.category || 'general', due, t.id,
      ).catch(() => 0);
      created += Number(n || 0);
    }
  }
  return created;
}
