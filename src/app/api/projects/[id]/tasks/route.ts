import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectAccess } from '@/lib/project-rbac';
import { isTaskType, isWorkflowStep, notifyTaskCreated } from '@/lib/task-workflow';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    const where: Record<string, unknown> = { projectId: id };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tasks = await db.projectTask.findMany({
      where,
      include: {
        milestone: { select: { id: true, name: true, sequence: true, isPhase: true, approvalStatus: true } },
        sprint: { select: { id: true, name: true, sprintNumber: true, status: true } },
        dependsOn: { select: { id: true, name: true, status: true } },
        // Task 150 — the client who raised this issue (external tasks)
        client: { select: { id: true, name: true, code: true } },
        // Task 129 — attachment count for 📎 badges on web + mobile cards
        _count: { select: { attachments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // enrich assignees (ProjectTask stores assignedToId without a relation)
    const assigneeIds = Array.from(new Set(tasks.map((t: any) => t.assignedToId).filter(Boolean))) as string[];
    const assignees = assigneeIds.length
      ? await db.employee.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const assigneeMap = new Map(assignees.map((a: any) => [a.id, a]));
    const enriched = tasks.map((t: any) => ({
      ...t,
      assignedTo: assigneeMap.get(t.assignedToId) || null,
    }));

    return NextResponse.json({ tasks: enriched }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get project tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    // Verify project exists
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── Task 115 FIX (RBAC): creating tasks requires edit or log-time
    // access on THIS project (creator-stamped PM, members, allocations,
    // admins). Previously ANY authenticated tenant user could add tasks to
    // ANY project — even ones they were denied from viewing.
    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit && !access.canLogTime) {
      return NextResponse.json(
        { error: 'You do not have permission to add tasks to this project', access: 'denied' },
        { status: 403, headers: corsHeaders() }
      );
    }

    const body = await request.json();
    const {
      name, category, assignedToId, milestoneId,
      plannedStart, plannedEnd, estimatedHours, priority,
      isBillable, description, sprintId, storyPoints, dependsOnId,
      taskType, workflowStep,
      source, clientId,
    } = body;

    // ── Task 150: task origin validation. "external" = raised by a CLIENT
    // as an issue/ticket — requires the client to be set (and to exist in
    // this tenant); "internal" (default) = raised by the team.
    const taskSource = source === 'external' ? 'external' : 'internal';
    let clientLink: { id: string } | null = null;
    if (taskSource === 'external') {
      if (!clientId) {
        return NextResponse.json(
          { error: 'External tasks must specify the client who raised the issue' },
          { status: 400, headers: corsHeaders() }
        );
      }
      clientLink = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!clientLink) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 400, headers: corsHeaders() }
        );
      }
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ── Task 128: task classification + delivery workflow step validation.
    // Creation accepts any valid step; the "assignee asked again" rule is
    // enforced on step CHANGES (PATCH) — re_testing keeps the assignee.
    if (taskType !== undefined && taskType !== null && taskType !== '' && !isTaskType(taskType)) {
      return NextResponse.json(
        { error: 'taskType must be customisation | rework | development | bug' },
        { status: 400, headers: corsHeaders() }
      );
    }
    if (workflowStep !== undefined && workflowStep !== null && workflowStep !== '' && !isWorkflowStep(workflowStep)) {
      return NextResponse.json(
        { error: 'workflowStep must be testing | re_testing | production | delivery' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ── dependency validation (finish-to-start, same project, no cycles)
    if (dependsOnId) {
      if (dependsOnId === 'self') {
        return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400, headers: corsHeaders() });
      }
      const dep = await db.projectTask.findUnique({ where: { id: dependsOnId }, select: { id: true, projectId: true } });
      if (!dep || dep.projectId !== id) {
        return NextResponse.json({ error: 'Dependency task must belong to the same project' }, { status: 400, headers: corsHeaders() });
      }
    }

    const task = await db.projectTask.create({
      data: {
        projectId: id,
        name,
        category,
        assignedToId,
        milestoneId,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        estimatedHours: estimatedHours ?? 0,
        priority: priority || 'medium',
        status: 'todo',
        isBillable: isBillable ?? true,
        description,
        sprintId: sprintId || null,
        storyPoints: storyPoints === undefined || storyPoints === null || storyPoints === '' ? null : Math.max(0, Number(storyPoints)),
        dependsOnId: dependsOnId || null,
        taskType: taskType && isTaskType(taskType) ? taskType : null,
        workflowStep: workflowStep && isWorkflowStep(workflowStep) ? workflowStep : null,
        source: taskSource,
        clientId: taskSource === 'external' ? clientId : null,
      },
    });

    // ── Two-way kanban sync: if the project has a delivery board, mirror the task
    try {
      const project = await db.project.findUnique({ where: { id }, select: { workspaceBoardId: true } });
      if (project?.workspaceBoardId) {
        const count = await db.kanbanCard.count({ where: { boardId: project.workspaceBoardId } });
        await db.kanbanCard.create({
          data: {
            boardId: project.workspaceBoardId,
            title: name,
            description: description || null,
            column: 'To Do',
            priority: priority === 'critical' || priority === 'high' ? 'High' : priority === 'low' ? 'Low' : 'Medium',
            category: 'General',
            assignedToId: assignedToId || null,
            dueDate: plannedEnd ? new Date(plannedEnd) : null,
            order: count,
            projectTaskId: task.id,
          },
        });
      }
    } catch (cardErr) {
      console.error('Kanban card mirror failed (non-blocking):', cardErr);
    }

    // ── Task 135: announce the raised task (web OR mobile — both POST here)
    // to the assignee, the project manager and the tenant admins with a bell
    // notification AND an email alert. Replaces the old assignee-only silent
    // bell; diagnostics are surfaced in the response as `taskAlert`.
    let taskAlert: { recipients: number; notifications: number; emails: number; errors: string[] } | null = null;
    try {
      const decodedUser = decoded as any;
      const actorEmp = await db.employee
        .findUnique({ where: { userId: decodedUser.userId }, select: { firstName: true, lastName: true } })
        .catch(() => null);
      const actorName =
        `${actorEmp?.firstName || ''} ${actorEmp?.lastName || ''}`.trim() || decodedUser.email || 'A colleague';
      taskAlert = await notifyTaskCreated({
        db,
        tenantId: decodedUser.tenantId,
        projectId: id,
        projectName: (project as any)?.name || 'Project',
        taskName: name,
        taskId: task.id,
        priority: priority || 'medium',
        assigneeEmployeeId: assignedToId || null,
        managerEmployeeId: (project as any)?.projectManagerId || null,
        actorName,
      });
    } catch (alertErr) {
      console.error('Task-created alert failed (non-blocking):', alertErr);
    }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PROJECT_TASK',
        module: 'projects',
        details: `Created ${taskSource === 'external' ? 'EXTERNAL (client-raised)' : 'internal'} task "${name}" in project ${id}`,
      },
    });

    return NextResponse.json({ task, ...(taskAlert ? { taskAlert } : {}) }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create project task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
