import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

    const body = await request.json();
    const {
      name, category, assignedToId, milestoneId,
      plannedStart, plannedEnd, estimatedHours, priority,
      isBillable, description, sprintId, storyPoints, dependsOnId,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
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

    // notify assignee
    if (assignedToId) {
      try {
        const decodedUser = decoded as any;
        const emp = await db.employee.findUnique({ where: { id: assignedToId }, select: { userId: true } });
        if (emp?.userId && decodedUser?.tenantId) {
          const { createNotification } = await import('@/lib/notifications');
          await createNotification({
            tenantId: decodedUser.tenantId,
            userId: emp.userId,
            title: 'Task assigned to you',
            message: `"${name}" (priority: ${priority || 'medium'}) has been assigned to you.`,
            link: `/projects/${id}?tab=board`,
            type: 'workflow',
          });
        }
      } catch { /* non-blocking */ }
    }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PROJECT_TASK',
        module: 'projects',
        details: `Created task "${name}" in project ${id}`,
      },
    });

    return NextResponse.json({ task }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create project task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
