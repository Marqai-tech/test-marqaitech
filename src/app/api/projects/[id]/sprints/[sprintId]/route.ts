import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { logProjectActivity, notifyProjectMembers } from '@/lib/project-events';
import { resolveProjectAccess } from '@/lib/project-rbac';

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

// PATCH /api/projects/[id]/sprints/[sprintId]
// Body: { action: 'start' | 'complete' | 'update', name?, goal?, startDate?, endDate?,
//         moveIncomplete?: 'backlog' | 'next' | 'keep', committedPoints? }
//
// complete → computes velocity (completedPoints = Σ storyPoints of done tasks),
//            records say-do data, optionally sweeps incomplete stories to backlog/next sprint.
// start    → enforces one active sprint per project (pod capacity lock).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sprintId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id, sprintId } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const sprint = await db.sprint.findUnique({ where: { id: sprintId }, include: { tasks: { select: { id: true, status: true, storyPoints: true, name: true } } } });
    if (!sprint || sprint.projectId !== id) return NextResponse.json({ error: 'Sprint not found on this project' }, { status: 404, headers: corsHeaders() });

    const body = await request.json();
    const action = body.action || 'update';
    const actor = await employeeIdForUser(db, (decoded as any).userId);

    if (action === 'start') {
      if (sprint.status === 'completed') return NextResponse.json({ error: 'This sprint is already completed' }, { status: 409, headers: corsHeaders() });
      const activeCount = await db.sprint.count({ where: { projectId: id, status: 'active', id: { not: sprintId } } });
      if (activeCount > 0) {
        return NextResponse.json({ error: 'Another sprint is already active — complete it before starting this one (pod capacity lock)' }, { status: 409, headers: corsHeaders() });
      }
      const committed = sprint.tasks.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
      const updated = await db.sprint.update({
        where: { id: sprintId },
        data: { status: 'active', committedPoints: committed || sprint.committedPoints },
      });
      await logProjectActivity(db, id, { type: 'task_update', employeeId: actor, message: `Sprint ${sprint.sprintNumber} "${sprint.name}" STARTED — ${committed} story points committed.` });
      await notifyProjectMembers(db, {
        tenantId: (decoded as any).tenantId, projectId: id, projectName: sprint.name,
        title: `Sprint ${sprint.sprintNumber} started`,
        message: `Sprint "${sprint.name}" is now active (${committed} points committed). Timesheet entries will pre-fill this sprint.`,
        link: `/project-management/sprints?projectId=${id}`,
      });
      return NextResponse.json({ sprint: updated }, { headers: corsHeaders() });
    }

    if (action === 'complete') {
      const completedPoints = sprint.tasks.filter((t: any) => t.status === 'done').reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
      const committedPoints = sprint.tasks.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0) || sprint.committedPoints;

      // Sweep incomplete stories
      const move = body.moveIncomplete || 'backlog';
      const incomplete = sprint.tasks.filter((t: any) => !['done', 'cancelled'].includes(t.status));
      let movedCount = 0;
      if (incomplete.length > 0 && move !== 'keep') {
        let targetSprintId: string | null = null;
        if (move === 'next') {
          const next = await db.sprint.findFirst({ where: { projectId: id, sprintNumber: sprint.sprintNumber + 1 } });
          targetSprintId = next?.id || null;
        }
        for (const t of incomplete) {
          await db.projectTask.update({ where: { id: t.id }, data: { sprintId: targetSprintId } });
          movedCount++;
        }
      }

      const updated = await db.sprint.update({
        where: { id: sprintId },
        data: { status: 'completed', completedPoints, committedPoints, closedAt: new Date() },
      });

      const sayDo = committedPoints > 0 ? Math.round((completedPoints / committedPoints) * 100) : null;
      await logProjectActivity(db, id, {
        type: 'task_update',
        employeeId: actor,
        message: `Sprint ${sprint.sprintNumber} "${sprint.name}" COMPLETED — velocity ${completedPoints}/${committedPoints} pts${sayDo !== null ? ` (say-do ${sayDo}%)` : ''}${movedCount ? `, ${movedCount} incomplete story/stories ${move === 'next' ? 'moved to next sprint' : 'returned to backlog'}` : ''}.`,
      });
      await notifyProjectMembers(db, {
        tenantId: (decoded as any).tenantId, projectId: id, projectName: sprint.name,
        title: `Sprint ${sprint.sprintNumber} completed`,
        message: `Sprint "${sprint.name}" closed with ${completedPoints} of ${committedPoints} story points delivered.`,
        link: `/project-management/sprints?projectId=${id}`,
      });
      return NextResponse.json({ sprint: updated, completedPoints, committedPoints, sayDoRatio: sayDo, movedIncomplete: movedCount }, { headers: corsHeaders() });
    }

    // plain update
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.goal !== undefined) data.goal = body.goal;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
    if (body.committedPoints !== undefined) data.committedPoints = Number(body.committedPoints) || 0;
    const updated = await db.sprint.update({ where: { id: sprintId }, data });
    return NextResponse.json({ sprint: updated }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update sprint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/projects/[id]/sprints/[sprintId] — only planned sprints with no tasks
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sprintId: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id, sprintId } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const sprint = await db.sprint.findUnique({ where: { id: sprintId }, include: { _count: { select: { tasks: true } } } });
    if (!sprint || sprint.projectId !== id) return NextResponse.json({ error: 'Sprint not found on this project' }, { status: 404, headers: corsHeaders() });
    if (sprint.status !== 'planned') return NextResponse.json({ error: 'Only planned sprints can be deleted' }, { status: 409, headers: corsHeaders() });
    if (sprint._count.tasks > 0) return NextResponse.json({ error: 'Sprint still has tasks — move them first' }, { status: 409, headers: corsHeaders() });

    await db.sprint.delete({ where: { id: sprintId } });
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete sprint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
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
