/**
 * Project Delivery Workflow — event side-effects.
 *
 *  - logProjectActivity       : append to the project activity/collaboration feed
 *  - notifyEmployee(s)        : bell notifications (via platform prisma, needs User link)
 *  - createProjectWorkspace   : AUTOMATED TRIGGER on intake approval — centralizes the
 *                               project into a collaboration chat room + kanban board
 *                               (seeded from project tasks, linked for two-way sync)
 *  - notifyProjectMembers     : on approval/status changes
 *  - runBackupHandoffCheck    : extended-leave prompt for managers to assign backups
 *
 * All helpers are defensive: a failure in a side-effect must never break the
 * primary operation, so everything swallows + logs its own errors.
 */

import { createNotification } from '@/lib/notifications';

type AnyDb = any;

export async function logProjectActivity(
  db: AnyDb,
  projectId: string,
  data: { type: string; message: string; employeeId?: string | null; meta?: unknown }
): Promise<void> {
  try {
    await db.projectActivity.create({
      data: {
        projectId,
        type: data.type,
        message: data.message,
        employeeId: data.employeeId || null,
        meta: data.meta ? JSON.stringify(data.meta).slice(0, 4000) : null,
      },
    });
  } catch (e) {
    console.error('logProjectActivity failed:', e);
  }
}

/** Resolve an employee's platform user id (for bell notifications). */
export async function employeeUserId(db: AnyDb, employeeId: string): Promise<string | null> {
  try {
    const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    return emp?.userId || null;
  } catch {
    return null;
  }
}

export async function notifyEmployee(
  db: AnyDb,
  params: { tenantId?: string | null; employeeId: string; title: string; message: string; link?: string; type?: string; category?: string }
): Promise<void> {
  try {
    const userId = await employeeUserId(db, params.employeeId);
    if (!userId || !params.tenantId) return;
    await createNotification({
      tenantId: params.tenantId,
      userId,
      title: params.title,
      message: params.message,
      link: params.link,
      type: (params.type as any) || 'info',
      category: (params.category as any) || 'workflow',
    });
  } catch (e) {
    console.error('notifyEmployee failed:', e);
  }
}

export async function notifyProjectMembers(
  db: AnyDb,
  params: {
    tenantId?: string | null;
    projectId: string;
    projectName: string;
    title: string;
    message: string;
    link?: string;
    excludeEmployeeIds?: string[];
    category?: string;
  }
): Promise<number> {
  try {
    const [allocs, members] = await Promise.all([
      db.projectAllocation.findMany({
        where: { projectId: params.projectId, status: { in: ['active', 'soft'] } },
        select: { employeeId: true },
      }),
      db.projectMember.findMany({ where: { projectId: params.projectId }, select: { employeeId: true } }),
    ]);
    const ids = new Set<string>();
    for (const a of allocs || []) ids.add(a.employeeId);
    for (const m of members || []) if (m.employeeId) ids.add(m.employeeId);
    for (const ex of params.excludeEmployeeIds || []) ids.delete(ex);

    let sent = 0;
    for (const employeeId of ids) {
      await notifyEmployee(db, {
        tenantId: params.tenantId,
        employeeId,
        title: params.title,
        message: params.message,
        link: params.link || `/projects/${params.projectId}`,
        category: params.category || 'workflow',
      });
      sent++;
    }
    return sent;
  } catch (e) {
    console.error('notifyProjectMembers failed:', e);
    return 0;
  }
}

/**
 * AUTOMATED TRIGGER (on intake approval): create the centralized project
 * workspace — a collaboration chat room (roomType 'project') + a kanban
 * delivery board seeded from the project's tasks (two-way linked via
 * KanbanCard.projectTaskId). Idempotent: skips when already linked.
 */
export async function createProjectWorkspace(
  db: AnyDb,
  project: {
    id: string; name: string; companyId: string; methodology?: string | null;
    projectManagerId?: string | null; deliveryManagerId?: string | null;
    workspaceRoomId?: string | null; workspaceBoardId?: string | null;
  },
  actorEmployeeId?: string | null
): Promise<{ roomId: string | null; boardId: string | null }> {
  const result = { roomId: project.workspaceRoomId || null, boardId: project.workspaceBoardId || null };

  // ── Chat room
  if (!result.roomId) {
    try {
      const room = await db.chatRoom.create({
        data: {
          name: `${project.name} — Workspace`,
          roomType: 'project',
          companyId: project.companyId,
          projectId: project.id,
          createdBy: actorEmployeeId || project.projectManagerId || project.deliveryManagerId || 'system',
          description: `Central workspace for project "${project.name}". Status updates, documentation and delivery discussion.`,
          isActive: true,
        },
      });
      result.roomId = room.id;

      // Add active members to the room (ChatRoomMember is keyed by platform userId)
      const memberIds = await projectMemberEmployeeIds(db, project.id);
      if (memberIds.length > 0) {
        const emps = await db.employee.findMany({
          where: { id: { in: memberIds }, userId: { not: null } },
          select: { userId: true },
        }).catch(() => []);
        for (const emp of emps || []) {
          if (!emp.userId) continue;
          await db.chatRoomMember.create({ data: { roomId: room.id, userId: emp.userId, role: 'member' } }).catch(() => null);
        }
      }
    } catch (e) {
      console.error('createProjectWorkspace chat room failed:', e);
    }
  }

  // ── Kanban delivery board
  if (!result.boardId) {
    try {
      const creatorId = project.projectManagerId || project.deliveryManagerId || (await firstEmployee(db));
      const board = await db.kanbanBoard.create({
        data: {
          name: `${project.name} — Delivery Board`,
          description: `Auto-created delivery board for project "${project.name}" (${project.methodology === 'agile' ? 'Agile/Scrum' : 'Waterfall'}).`,
          companyId: project.companyId,
          projectId: project.id,
          createdById: creatorId || 'system',
          columns: 'Backlog,To Do,In Progress,Review,Done',
          isActive: true,
        },
      });
      result.boardId = board.id;

      // Seed cards from existing tasks (two-way sync via projectTaskId)
      const tasks = await db.projectTask.findMany({
        where: { projectId: project.id, status: { not: 'cancelled' } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      let order = 0;
      for (const t of tasks) {
        await db.kanbanCard.create({
          data: {
            boardId: board.id,
            title: t.name,
            description: t.description || null,
            column: statusToKanbanColumn(t.status),
            priority: priorityToKanban(t.priority),
            category: 'General',
            assignedToId: t.assignedToId || null,
            dueDate: t.plannedEnd || null,
            order: order++,
            projectTaskId: t.id,
          },
        }).catch(() => null);
      }
    } catch (e) {
      console.error('createProjectWorkspace kanban board failed:', e);
    }
  }

  if (result.roomId || result.boardId) {
    await db.project.update({
      where: { id: project.id },
      data: { workspaceRoomId: result.roomId, workspaceBoardId: result.boardId },
    }).catch(() => null);
  }

  return result;
}

/** Task status → kanban column name (default board layout). */
export function statusToKanbanColumn(status: string): string {
  switch (status) {
    case 'todo': return 'To Do';
    case 'in_progress': return 'In Progress';
    case 'review': return 'Review';
    case 'done': return 'Done';
    default: return 'Backlog';
  }
}

export function kanbanColumnToStatus(column: string): string | null {
  const c = (column || '').toLowerCase().trim();
  if (c.includes('backlog')) return 'todo';
  if (c.includes('to do') || c === 'todo') return 'todo';
  if (c.includes('progress')) return 'in_progress';
  if (c.includes('review')) return 'review';
  if (c.includes('done') || c.includes('complete')) return 'done';
  return null;
}

function priorityToKanban(priority: string): string {
  if (priority === 'critical' || priority === 'high') return 'High';
  if (priority === 'low') return 'Low';
  return 'Medium';
}

async function projectMemberEmployeeIds(db: AnyDb, projectId: string): Promise<string[]> {
  try {
    const rows = await db.projectMember.findMany({ where: { projectId }, select: { employeeId: true } });
    return (rows || []).map((r: any) => r.employeeId).filter(Boolean);
  } catch {
    return [];
  }
}

async function firstEmployee(db: AnyDb): Promise<string | null> {
  try {
    const e = await db.employee.findFirst({ where: { status: 'active' }, select: { id: true } });
    return e?.id || null;
  } catch {
    return null;
  }
}

/**
 * BACKUP HAND-OFF: when an employee's approved leave spans >= N working days,
 * notify the project managers of every active project the employee is
 * allocated to, prompting them to assign a temporary backup.
 */
export async function runBackupHandoffCheck(
  db: AnyDb,
  params: { tenantId?: string | null; employeeId: string; leaveStartDate: Date | string; leaveEndDate: Date | string; minWorkingDays: number }
): Promise<number> {
  try {
    const { computeWorkingDays } = await import('@/lib/working-days');
    const walk = computeWorkingDays(params.leaveStartDate, params.leaveEndDate);
    const workingDays = walk?.workingDays ?? 0;
    if (workingDays < params.minWorkingDays) return 0;

    const emp = await db.employee.findUnique({
      where: { id: params.employeeId },
      select: { firstName: true, lastName: true },
    });
    const name = emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'An employee';

    const allocs = await db.projectAllocation.findMany({
      where: { employeeId: params.employeeId, status: 'active' },
      include: { project: { select: { id: true, name: true, projectManagerId: true, deliveryManagerId: true } } },
    });

    const notified = new Set<string>();
    for (const a of allocs || []) {
      const mgrId = a.project?.projectManagerId || a.project?.deliveryManagerId;
      if (!mgrId || notified.has(mgrId)) continue;
      notified.add(mgrId);
      await notifyEmployee(db, {
        tenantId: params.tenantId,
        employeeId: mgrId,
        title: 'Backup hand-off required',
        message: `${name} will be on extended leave (${params.leaveStartDate} → ${params.leaveEndDate}, ${workingDays} working days) while allocated to "${a.project.name}". Please assign a temporary project backup.`,
        link: `/projects/${a.project.id}`,
        type: 'warning',
        category: 'alert',
      });
      await logProjectActivity(db, a.project.id, {
        type: 'capacity',
        message: `Extended leave detected for ${name} (${workingDays} working days) — backup hand-off suggested.`,
        meta: { employeeId: params.employeeId, leaveStartDate: params.leaveStartDate, leaveEndDate: params.leaveEndDate },
      });
    }
    return notified.size;
  } catch (e) {
    console.error('runBackupHandoffCheck failed:', e);
    return 0;
  }
}

/**
 * OVER-ALLOCATION ALERT: after any allocation change, notify managers when an
 * employee's combined allocation % exceeds the configured threshold.
 */
export async function checkOverAllocation(
  db: AnyDb,
  params: { tenantId?: string | null; employeeId: string; thresholdPct: number }
): Promise<boolean> {
  try {
    const allocs = await db.projectAllocation.findMany({
      where: { employeeId: params.employeeId, status: { in: ['active', 'soft'] } },
      include: { project: { select: { id: true, name: true, projectManagerId: true, deliveryManagerId: true } } },
    });
    const totalPct = (allocs || []).reduce((s: number, a: any) => s + (a.allocationPct ?? 100), 0);
    if (totalPct <= params.thresholdPct) return false;

    const emp = await db.employee.findUnique({
      where: { id: params.employeeId },
      select: { firstName: true, lastName: true },
    });
    const name = emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Employee';

    const managers = new Set<string>();
    for (const a of allocs || []) {
      for (const m of [a.project?.projectManagerId, a.project?.deliveryManagerId]) {
        if (m) managers.add(m);
      }
    }
    for (const mgrId of managers) {
      await notifyEmployee(db, {
        tenantId: params.tenantId,
        employeeId: mgrId,
        title: 'Over-allocation alert',
        message: `${name} is now allocated to ${totalPct}% across ${allocs.length} project(s) (threshold ${params.thresholdPct}%). Review their tasks on the Task Board.`,
        link: `/project-management/tasks`,
        type: 'warning',
        category: 'alert',
      });
    }
    return true;
  } catch (e) {
    console.error('checkOverAllocation failed:', e);
    return false;
  }
}
