import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { logProjectActivity, notifyEmployee } from '@/lib/project-events';
import { resolveProjectAccess } from '@/lib/project-rbac';
import { isTaskType, isWorkflowStep, isReTesting, notifyTaskStepChange, WORKFLOW_STEP_LABELS } from '@/lib/task-workflow';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET /api/projects/[id]/tasks/[taskId]
export async function GET(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id, taskId } = await params;

    const task = await db.projectTask.findUnique({
      where: { id: taskId },
      include: {
        milestone: { select: { id: true, name: true, sequence: true, approvalStatus: true } },
        sprint: { select: { id: true, name: true, status: true, sprintNumber: true } },
        dependsOn: { select: { id: true, name: true, status: true } },
        dependents: { select: { id: true, name: true, status: true } },
        _count: { select: { timesheets: true } },
      },
    });
    if (!task || task.projectId !== id) return NextResponse.json({ error: 'Task not found on this project' }, { status: 404, headers: corsHeaders() });

    const [loggedHours, assignee] = await Promise.all([
      db.timesheet.aggregate({ where: { projectTaskId: taskId }, _sum: { hours: true } }).catch(() => null),
      task.assignedToId
        ? db.employee.findUnique({ where: { id: task.assignedToId }, select: { id: true, firstName: true, lastName: true } }).catch(() => null)
        : Promise.resolve(null),
    ]);
    return NextResponse.json({ task: { ...task, assignedTo: assignee, loggedHours: loggedHours?._sum.hours || 0 } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT/PATCH /api/projects/[id]/tasks/[taskId]
// Editable: name, category, assignedToId, milestoneId, sprintId, plannedStart, plannedEnd,
//           estimatedHours, actualHours, priority, status, isBillable, description, storyPoints, dependsOnId,
//           taskType, workflowStep (Task 128)
// Special behavior:
//   - status → in_progress blocked when dependsOn task is not done (finish-to-start dependency)
//   - status → done stamps completedAt + progress recalculation + kanban card sync
//   - assignee change notifies the new assignee
//   - workflowStep → re_testing sends the task BACK to the current assignee;
//     any other step REQUIRES the assignee to be picked again (400 without it)
//   - every workflowStep change alerts assignee + project manager + admins
//     (in-app bell + email)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id, taskId } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit && !access.canLogTime) {
      return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });
    }

    const task = await db.projectTask.findUnique({ where: { id: taskId }, include: { dependsOn: { select: { id: true, name: true, status: true } } } });
    if (!task || task.projectId !== id) return NextResponse.json({ error: 'Task not found on this project' }, { status: 404, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.milestoneId !== undefined) data.milestoneId = body.milestoneId || null;
    if (body.sprintId !== undefined) data.sprintId = body.sprintId || null;
    if (body.storyPoints !== undefined) data.storyPoints = body.storyPoints === null ? null : Math.max(0, Number(body.storyPoints));
    if (body.plannedStart !== undefined) data.plannedStart = body.plannedStart ? new Date(body.plannedStart) : null;
    if (body.plannedEnd !== undefined) data.plannedEnd = body.plannedEnd ? new Date(body.plannedEnd) : null;
    if (body.estimatedHours !== undefined) data.estimatedHours = Number(body.estimatedHours) || 0;
    if (body.actualHours !== undefined) data.actualHours = Number(body.actualHours) || 0;
    if (body.priority !== undefined) {
      if (!['low', 'medium', 'high', 'critical'].includes(body.priority)) {
        return NextResponse.json({ error: 'priority must be low | medium | high | critical' }, { status: 400, headers: corsHeaders() });
      }
      data.priority = body.priority;
    }
    if (body.isBillable !== undefined) data.isBillable = !!body.isBillable;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;
    if (body.taskType !== undefined) {
      if (body.taskType !== null && body.taskType !== '' && !isTaskType(body.taskType)) {
        return NextResponse.json({ error: 'taskType must be customisation | rework | development | bug' }, { status: 400, headers: corsHeaders() });
      }
      data.taskType = body.taskType === '' ? null : body.taskType;
    }

    // ── Task 128: workflow-step transition with the assignee routing rule
    let stepChanged = false;
    if (body.workflowStep !== undefined) {
      if (body.workflowStep !== null && body.workflowStep !== '' && !isWorkflowStep(body.workflowStep)) {
        return NextResponse.json({ error: 'workflowStep must be testing | re_testing | production | delivery' }, { status: 400, headers: corsHeaders() });
      }
      const newStep = body.workflowStep === '' ? null : body.workflowStep;
      if (newStep && newStep !== task.workflowStep) {
        stepChanged = true;
        if (isReTesting(newStep)) {
          // Re-testing → the task goes BACK to the assignee itself. Only an
          // EXPLICIT assignee in the body can override (it defaults to the
          // current one anyway in the UI).
          if (body.assignedToId === undefined) data.assignedToId = task.assignedToId;
        } else {
          // Any other step → ask the assignee again (enforced server-side).
          const chosen = body.assignedToId !== undefined ? body.assignedToId : task.assignedToId;
          if (!chosen) {
            return NextResponse.json(
              { error: `Select the assignee for the "${WORKFLOW_STEP_LABELS[newStep]}" step — the assignee is asked again on every step change except re-testing.` },
              { status: 400, headers: corsHeaders() }
            );
          }
          if (body.assignedToId === undefined) data.assignedToId = chosen;
        }
      }
      data.workflowStep = newStep;
    }

    if (body.dependsOnId !== undefined) {
      if (body.dependsOnId === taskId) {
        return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400, headers: corsHeaders() });
      }
      if (body.dependsOnId) {
        const dep = await db.projectTask.findUnique({ where: { id: body.dependsOnId }, select: { id: true, projectId: true } });
        if (!dep || dep.projectId !== id) {
          return NextResponse.json({ error: 'Dependency task must belong to the same project' }, { status: 400, headers: corsHeaders() });
        }
        // cycle guard: walk up the dependency chain
        const cycle = await wouldCycle(db, taskId, body.dependsOnId);
        if (cycle) {
          return NextResponse.json({ error: 'This dependency would create a circular chain' }, { status: 400, headers: corsHeaders() });
        }
      }
      data.dependsOnId = body.dependsOnId || null;
    }

    // ── Status transition with finish-to-start dependency gating
    if (body.status !== undefined) {
      if (!['todo', 'in_progress', 'review', 'done', 'cancelled'].includes(body.status)) {
        return NextResponse.json({ error: 'status must be todo | in_progress | review | done | cancelled' }, { status: 400, headers: corsHeaders() });
      }
      if (['in_progress', 'review', 'done'].includes(body.status) && task.dependsOnId && task.dependsOn) {
        if (!['done', 'cancelled'].includes(task.dependsOn.status)) {
          return NextResponse.json(
            {
              error: `Dependency gate: "${task.dependsOn.name}" must be completed before this task can move to ${body.status.replace('_', ' ')} (finish-to-start).`,
              dependsOnTaskId: task.dependsOnId,
              dependsOnStatus: task.dependsOn.status,
            },
            { status: 409, headers: corsHeaders() }
          );
        }
      }
      data.status = body.status;
      if (body.status === 'done' && task.status !== 'done') data.completedAt = new Date();
      if (body.status !== 'done') data.completedAt = null;
    }

    const updated = await db.projectTask.update({ where: { id: taskId }, data });

    const actor = await employeeIdForUser(db, (decoded as any).userId);

    // ── Notify new assignee
    if (body.assignedToId !== undefined && body.assignedToId && body.assignedToId !== task.assignedToId) {
      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId: body.assignedToId,
        title: 'Task assigned to you',
        message: `"${updated.name}" (priority: ${updated.priority}${updated.plannedEnd ? `, due ${updated.plannedEnd}` : ''}) has been assigned to you.`,
        link: `/projects/${id}?tab=board`,
        type: 'workflow',
      });
    }

    // ── Task 128: step-change alert → assignee + project manager + admins
    // (in-app bell + email). The effective assignee is re-read from `updated`.
    let stepAlert: Awaited<ReturnType<typeof notifyTaskStepChange>> | null = null;
    if (stepChanged) {
      const projectRow = await db.project.findUnique({
        where: { id },
        select: { name: true, projectManagerId: true },
      }).catch(() => null);
      const actorEmp = await db.employee.findUnique({
        where: { userId: (decoded as any).userId },
        select: { firstName: true, lastName: true },
      }).catch(() => null);
      const alertResult = await notifyTaskStepChange({
        db,
        tenantId: (decoded as any).tenantId,
        projectId: id,
        projectName: projectRow?.name || 'Project',
        taskName: updated.name,
        taskId: updated.id,
        fromStep: task.workflowStep,
        toStep: updated.workflowStep as string,
        assigneeEmployeeId: updated.assignedToId,
        managerEmployeeId: projectRow?.projectManagerId || null,
        actorName: actorEmp ? `${actorEmp.firstName || ''} ${actorEmp.lastName || ''}`.trim() : null,
      });
      await logProjectActivity(db, id, {
        type: 'task_update',
        employeeId: actor,
        message: `Task "${updated.name}" workflow step: ${task.workflowStep ? (WORKFLOW_STEP_LABELS[task.workflowStep] || task.workflowStep) : '—'} → ${WORKFLOW_STEP_LABELS[updated.workflowStep as string] || updated.workflowStep}.`,
      });
      stepAlert = alertResult;
    }

    // ── Kanban sync: move the linked collaboration card
    if (body.status !== undefined) {
      await syncKanbanCard(db, taskId, updated.status).catch(() => null);
      if (body.status !== task.status) {
        await logProjectActivity(db, id, {
          type: 'task_update',
          employeeId: actor,
          message: `Task "${updated.name}" moved ${task.status.replace('_', ' ')} → ${body.status.replace('_', ' ')}.`,
        });
      }
    } else if (body.name !== undefined || body.assignedToId !== undefined) {
      await logProjectActivity(db, id, {
        type: 'task_update',
        employeeId: actor,
        message: `Task "${updated.name}" updated.`,
      });
    }

    // ── Progress recalculation when done-state changed
    if (body.status !== undefined) {
      await recalcProjectProgress(db, id).catch(() => null);
    }

    return NextResponse.json({ task: updated, ...(stepAlert ? { stepAlert } : {}) }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/projects/[id]/tasks/[taskId]
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id, taskId } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) {
      return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });
    }

    const task = await db.projectTask.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== id) return NextResponse.json({ error: 'Task not found on this project' }, { status: 404, headers: corsHeaders() });

    const logged = await db.timesheet.count({ where: { projectTaskId: taskId } });
    if (logged > 0) {
      // soft-cancel: preserve timesheet history
      await db.projectTask.update({ where: { id: taskId }, data: { status: 'cancelled' } });
      await syncKanbanCard(db, taskId, 'cancelled').catch(() => null);
      return NextResponse.json({ ok: true, cancelled: true, message: 'Task has logged time — it was cancelled (not deleted) to preserve timesheet history.' }, { headers: corsHeaders() });
    }

    await db.projectTask.delete({ where: { id: taskId } });
    await logProjectActivity(db, id, { type: 'task_update', message: `Task "${task.name}" deleted.` });
    await recalcProjectProgress(db, id).catch(() => null);
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── helpers ──────────────────────────────────────────────────────

async function wouldCycle(db: any, taskId: string, newDependsOnId: string): Promise<boolean> {
  const seen = new Set<string>([taskId]);
  let cursor = newDependsOnId;
  let guard = 0;
  while (cursor && guard < 500) {
    guard++;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const t = await db.projectTask.findUnique({ where: { id: cursor }, select: { dependsOnId: true } });
    cursor = t?.dependsOnId || null as any;
  }
  return false;
}

/** Move any linked collaboration KanbanCard to the matching column + sync status back. */
async function syncKanbanCard(db: any, projectTaskId: string, status: string) {
  const { statusToKanbanColumn } = await import('@/lib/project-events');
  const cards = await db.kanbanCard.findMany({ where: { projectTaskId, isActive: true } });
  for (const card of cards) {
    await db.kanbanCard.update({ where: { id: card.id }, data: { column: statusToKanbanColumn(status) } });
  }
}

async function recalcProjectProgress(db: any, projectId: string) {
  const [total, done] = await Promise.all([
    db.projectTask.count({ where: { projectId, status: { not: 'cancelled' } } }),
    db.projectTask.count({ where: { projectId, status: 'done' } }),
  ]);
  if (total === 0) return;
  const progress = Math.round((done / total) * 100);
  await db.project.update({ where: { id: projectId }, data: { progress } });
}

async function employeeIdForUser(db: any, userId?: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const emp = await db.employee.findUnique({ where: { userId }, select: { id: true } });
    return emp?.id || null;
  } catch {
    return null;
  }
}
