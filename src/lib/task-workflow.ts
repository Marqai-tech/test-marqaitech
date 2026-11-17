/**
 * Task 128 — Task classification + delivery workflow step engine.
 * Task 135 — task-CREATED alerts: raising a task (web OR mobile — both hit the
 *            same POST /api/projects/[id]/tasks endpoint) now announces it to
 *            the assignee, the project manager, and the tenant admins with an
 *            in-app bell notification AND an email alert.
 *
 * workflowStep : testing → re_testing → production → delivery
 *   • Moving a task to `re_testing` sends it BACK to the current assignee
 *     (no reassignment prompt — "goes back to the assignee itself").
 *   • Moving to any OTHER step (testing / production / delivery) requires the
 *     assignee to be picked again — the API enforces this with a 400 when the
 *     caller does not supply `assignedToId`.
 */
import { sendTenantEmail } from '@/lib/notification-channels';
import { createNotification } from '@/lib/notifications';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

export const TASK_TYPES = ['customisation', 'rework', 'development', 'bug'] as const;
export const WORKFLOW_STEPS = ['testing', 're_testing', 'production', 'delivery'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const TASK_TYPE_LABELS: Record<string, string> = {
  customisation: 'Customisation',
  rework: 'Rework',
  development: 'Development',
  bug: 'Bug',
};

export const WORKFLOW_STEP_LABELS: Record<string, string> = {
  testing: 'Testing',
  re_testing: 'Re-testing',
  production: 'Production',
  delivery: 'Delivery',
};

export function isTaskType(v: unknown): v is TaskType {
  return typeof v === 'string' && (TASK_TYPES as readonly string[]).includes(v);
}

export function isWorkflowStep(v: unknown): v is WorkflowStep {
  return typeof v === 'string' && (WORKFLOW_STEPS as readonly string[]).includes(v);
}

export function isReTesting(v: unknown): boolean {
  return v === 're_testing';
}

type RecipientRole = 'assignee' | 'manager' | 'admin';

interface Recipient {
  userId?: string | null;
  email?: string | null;
  label: string;
  role: RecipientRole;
}

export interface TaskAlertResult {
  recipients: number;
  notifications: number;
  emails: number;
  errors: string[];
}

/**
 * Task 135 — resolve the alert recipients for a task event: the assignee
 * employee, the project manager employee, and the active tenant admins
 * (tenant DB User rows — single `name` field there, no first/last).
 * Never throws; lookup problems land in `result.errors`.
 */
async function resolveTaskRecipients(
  db: any,
  assigneeEmployeeId: string | null | undefined,
  managerEmployeeId: string | null | undefined,
  result: TaskAlertResult,
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  const empIds = Array.from(new Set([assigneeEmployeeId, managerEmployeeId].filter(Boolean) as string[]));
  let emps: any[] = [];
  if (empIds.length) {
    try {
      emps = await db.employee.findMany({
        where: { id: { in: empIds } },
        select: { id: true, firstName: true, lastName: true, email: true, userId: true },
      });
    } catch (e: any) {
      result.errors.push(`employee lookup: ${e?.message || e}`);
    }
    for (const empId of empIds) {
      const emp = emps.find((e: any) => e.id === empId);
      if (emp) {
        recipients.push({
          userId: emp.userId,
          email: emp.email,
          label: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Assignee',
          // When one person is both assignee and PM, the assignee wording wins.
          role: empId === assigneeEmployeeId ? 'assignee' : 'manager',
        });
      } else {
        result.errors.push(`employee ${empId} not found`);
      }
    }
  } else {
    result.errors.push('no employee ids (task unassigned, no PM)');
  }
  // Tenant admins (in the tenant DB — User rows live there).
  let admins: any[] = [];
  try {
    admins = await db.user.findMany({
      where: { role: { in: ['tenant_admin', 'ceo', 'admin', 'hr_admin'] }, status: 'active' },
      select: { id: true, email: true, name: true },
      take: 20,
    });
  } catch (e: any) {
    result.errors.push(`admin lookup: ${e?.message || e}`);
  }
  for (const a of admins) {
    recipients.push({
      userId: a.id,
      email: a.email,
      label: (a.name || '').trim() || 'Admin',
      role: 'admin',
    });
  }
  return recipients;
}

/** Dedupe (same person can be assignee + PM; multiple admins may share an email). */
function dedupeRecipients(recipients: Recipient[]): Recipient[] {
  const seenUsers = new Set<string>();
  const seenEmails = new Set<string>();
  return recipients.filter((r) => {
    if (r.userId && seenUsers.has(r.userId)) return false;
    if (!r.userId && r.email && seenEmails.has(r.email)) return false;
    if (r.userId) seenUsers.add(r.userId);
    if (r.email) seenEmails.add(r.email);
    return true;
  });
}

/** Shared task-board email template (same look as the Task 128 step alert). */
function taskBoardEmailHtml(headline: string, bodyHtml: string, link: string): string {
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="margin:0 0 12px;color:#0f172a;font-size:18px">${headline}</h2>
        <p style="margin:0 0 8px;color:#334155;font-size:14px">${bodyHtml}</p>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px">Please check the task board for details.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${link}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600">Open task board</a>
      </div>`;
}

/**
 * Fan the alert out: one bell notification + one email per unique recipient.
 * `contentFor` lets callers tailor the wording per recipient role (e.g. the
 * assignee sees "assigned to you"). Never throws.
 */
async function fanOutTaskAlert(
  db: any,
  tenantId: string | null | undefined,
  recipients: Recipient[],
  contentFor: (r: Recipient) => { title: string; message: string; emailSubject: string; emailHtml: string },
  link: string,
  result: TaskAlertResult,
): Promise<void> {
  const unique = dedupeRecipients(recipients);
  for (const r of unique) {
    const { title, message, emailSubject, emailHtml } = contentFor(r);
    if (r.userId) {
      try {
        const created = await createNotification({
          tenantId: tenantId as string,
          userId: r.userId,
          title,
          message,
          link,
          type: 'workflow',
          category: 'workflow',
        });
        if (created) result.notifications += 1;
        else result.errors.push(`notification create returned null for ${r.email || r.userId}`);
      } catch (e: any) {
        result.errors.push(`notification create: ${e?.message || e}`);
      }
    }
    if (r.email && r.email.includes('@')) {
      try {
        // REQ 5 — wrap the task-board card in the tenant-branded template.
        const brandedHtml = await buildBrandedEmailForTenant(tenantId as string, {
          title: emailSubject,
          bodyHtml: emailHtml,
        });
        const res = await sendTenantEmail(db, tenantId as string, { to: r.email, subject: emailSubject, html: brandedHtml });
        if (res?.success) result.emails += 1;
        else result.errors.push(`email to ${r.email}: ${res?.error || 'no channel'}`);
      } catch (e: any) {
        result.errors.push(`email to ${r.email}: ${e?.message || e}`);
      }
    }
  }
  result.recipients = unique.length;
}

/**
 * Task 135 — announce a freshly RAISED task (web or mobile) to the assignee,
 * the project manager, and the tenant admins: bell + email. Fully defensive —
 * a failure in any channel must never break the primary task creation.
 * Returns a diagnostic summary (surfaced in the POST response as `taskAlert`).
 */
export async function notifyTaskCreated(params: {
  db: any;
  tenantId?: string | null;
  projectId: string;
  projectName: string;
  taskName: string;
  taskId: string;
  priority?: string | null;
  assigneeEmployeeId?: string | null;
  managerEmployeeId?: string | null;
  actorName?: string | null;
}): Promise<TaskAlertResult> {
  const {
    db, tenantId, projectId, projectName, taskName, taskId,
    priority, assigneeEmployeeId, managerEmployeeId, actorName,
  } = params;
  const result: TaskAlertResult = { recipients: 0, notifications: 0, emails: 0, errors: [] };
  try {
    if (!tenantId) {
      result.errors.push('no tenantId');
      return result;
    }
    const link = `/projects/${projectId}?tab=board`;
    const prio = priority || 'medium';
    const actor = actorName ? ` by ${actorName}` : '';
    const recipients = await resolveTaskRecipients(db, assigneeEmployeeId, managerEmployeeId, result);
    const assigneeRecipient = recipients.find((r) => r.role === 'assignee');
    const assignedToLabel = assigneeRecipient?.label || (assigneeEmployeeId ? 'a teammate' : 'no one yet');
    const emailSubject = `[Task] "${taskName}" created on ${projectName}`;
    const emailHtml = taskBoardEmailHtml(
      'New task created',
      `<strong>${taskName}</strong> (${prio} priority) on <strong>${projectName}</strong> was created${actor} — assigned to <strong>${assignedToLabel}</strong>.`,
      link,
    );
    await fanOutTaskAlert(db, tenantId, recipients, (r) => {
      if (r.role === 'assignee') {
        return {
          title: 'New task assigned to you',
          message: `"${taskName}" (${prio} priority) on ${projectName} was created${actor} and assigned to you.`,
          emailSubject,
          emailHtml,
        };
      }
      return {
        title: 'New task created',
        message: `"${taskName}" (${prio} priority) on ${projectName} was created${actor} — assigned to ${assignedToLabel}.`,
        emailSubject,
        emailHtml,
      };
    }, link, result);
    console.log(`[task-workflow] task-created alert for task ${taskId}:`, JSON.stringify(result));
    return result;
  } catch (e: any) {
    console.error('[task-workflow] notifyTaskCreated failed (non-blocking):', e);
    result.errors.push(`fatal: ${e?.message || e}`);
    return result;
  }
}

/**
 * Fan out a workflow-step-change alert (in-app bell + email) to the assignee,
 * the project manager, and the tenant admins. Fully defensive — a failure in
 * any channel must never break the primary task update. Returns a diagnostic
 * summary (surfaced in the PATCH response as `stepAlert`).
 */
export async function notifyTaskStepChange(params: {
  db: any;
  tenantId?: string | null;
  projectId: string;
  projectName: string;
  taskName: string;
  taskId: string;
  fromStep: string | null;
  toStep: string;
  assigneeEmployeeId?: string | null;
  managerEmployeeId?: string | null;
  actorName?: string | null;
}): Promise<TaskAlertResult> {
  const {
    db, tenantId, projectId, projectName, taskName, taskId,
    fromStep, toStep, assigneeEmployeeId, managerEmployeeId, actorName,
  } = params;
  const result: TaskAlertResult = { recipients: 0, notifications: 0, emails: 0, errors: [] };
  try {
    if (!tenantId) {
      result.errors.push('no tenantId');
      return result;
    }
    const fromLabel = fromStep ? (WORKFLOW_STEP_LABELS[fromStep] || fromStep) : '—';
    const toLabel = WORKFLOW_STEP_LABELS[toStep] || toStep;
    const link = `/projects/${projectId}?tab=board`;
    const title = 'Task workflow step updated';
    const actor = actorName ? ` by ${actorName}` : '';
    const message = `"${taskName}" on ${projectName} moved ${fromLabel} → ${toLabel}${actor}.`;
    const emailSubject = `[Workflow] "${taskName}" moved to ${toLabel} — ${projectName}`;
    const emailHtml = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="margin:0 0 12px;color:#0f172a;font-size:18px">Task workflow step updated</h2>
        <p style="margin:0 0 8px;color:#334155;font-size:14px"><strong>${taskName}</strong> on <strong>${projectName}</strong> moved
          <strong style="color:#7c3aed">${fromLabel}</strong> → <strong style="color:#0d9488">${toLabel}</strong>${actor}.</p>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px">${isReTesting(toStep) ? 'The task has been sent back to the assignee for re-testing.' : 'Please check the task board for the current assignee of this step.'}</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${link}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600">Open task board</a>
      </div>`;

    // ── Resolve recipients + fan out ────────────────────────────────────
    const recipients = await resolveTaskRecipients(db, assigneeEmployeeId, managerEmployeeId, result);
    await fanOutTaskAlert(db, tenantId, recipients, () => ({ title, message, emailSubject, emailHtml }), link, result);
    console.log(`[task-workflow] step-change alert for task ${taskId} (${fromLabel} → ${toLabel}):`, JSON.stringify(result));
    return result;
  } catch (e: any) {
    console.error('[task-workflow] notifyTaskStepChange failed (non-blocking):', e);
    result.errors.push(`fatal: ${e?.message || e}`);
    return result;
  }
}
