import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { logProjectActivity } from '@/lib/project-events';
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

// GET /api/projects/[id]/sprints[?sprintId=&view=burndown]
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');
    const sprintId = searchParams.get('sprintId');

    const sprints = await db.sprint.findMany({
      where: { projectId: id },
      orderBy: { sprintNumber: 'asc' },
      include: {
        _count: { select: { tasks: true } },
        tasks: { select: { id: true, status: true, storyPoints: true, name: true, assignedToId: true } },
      },
    });

    const enriched = sprints.map((s: any) => {
      const committed = s.tasks.reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0);
      const completed = s.tasks.filter((t: any) => t.status === 'done').reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0);
      return {
        id: s.id, name: s.name, goal: s.goal, sprintNumber: s.sprintNumber,
        startDate: s.startDate, endDate: s.endDate, status: s.status,
        committedPoints: s.committedPoints || committed, completedPoints: s.status === 'completed' ? (s.completedPoints || completed) : completed,
        taskCount: s._count.tasks,
        tasksByStatus: {
          todo: s.tasks.filter((t: any) => t.status === 'todo').length,
          in_progress: s.tasks.filter((t: any) => t.status === 'in_progress').length,
          review: s.tasks.filter((t: any) => t.status === 'review').length,
          done: s.tasks.filter((t: any) => t.status === 'done').length,
        },
      };
    });

    // Say-do ratio across completed sprints (agile performance metric)
    const completedSprints = enriched.filter((s: any) => s.status === 'completed');
    const sayDoRatio = completedSprints.length
      ? Math.round((completedSprints.reduce((sum: number, s: any) => sum + (s.committedPoints ? (s.completedPoints / s.committedPoints) : 0), 0) / completedSprints.length) * 100)
      : null;
    const avgVelocity = completedSprints.length
      ? Math.round(completedSprints.reduce((sum: number, s: any) => sum + s.completedPoints, 0) / completedSprints.length)
      : null;

    // ── Burndown for one sprint: ideal vs remaining story points by day
    let burndown = null;
    if (view === 'burndown' && sprintId) {
      const sprint = sprints.find((s: any) => s.id === sprintId);
      if (sprint) {
        const start = new Date(sprint.startDate);
        const end = new Date(Math.min(new Date(sprint.endDate).getTime(), Date.now()));
        const sprintTasks = sprint.tasks || [];
        const totalPoints = sprintTasks.reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0) || sprint.committedPoints || 0;
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 3600 * 1000)));
        const totalDays = Math.max(1, Math.ceil((new Date(sprint.endDate).getTime() - start.getTime()) / (24 * 3600 * 1000)));

        // hours logged per day on sprint tasks (timesheet-driven actual burn)
        const hoursByDay = await db.timesheet.groupBy({
          by: ['date'],
          where: { projectTaskId: { in: sprintTasks.map((t: any) => t.id) }, date: { gte: start, lte: end } },
          _sum: { hours: true },
        }).catch(() => []);
        const hoursMap = new Map<string, number>();
        for (const h of hoursByDay || []) hoursMap.set(new Date(h.date).toISOString().slice(0, 10), h._sum.hours || 0);

        const points = [];
        let cumulativeHours = 0;
        for (let i = 0; i <= days; i++) {
          const day = new Date(start.getTime() + i * 24 * 3600 * 1000);
          const dayStr = day.toISOString().slice(0, 10);
          cumulativeHours += hoursMap.get(dayStr) || 0;
          // Story-point burn approximated proportionally to hours logged vs total sprint hours
          const totalPlannedHours = Math.max(1, sprintTasks.reduce((s2: number, t: any) => s2 + 8, 0));
          const burnedPoints = totalPoints > 0 ? Math.min(totalPoints, (cumulativeHours / totalPlannedHours) * totalPoints) : 0;
          points.push({
            date: dayStr,
            ideal: Math.round((totalPoints - (totalPoints / totalDays) * i) * 10) / 10,
            remaining: Math.round((totalPoints - burnedPoints) * 10) / 10,
            hoursLogged: hoursMap.get(dayStr) || 0,
          });
        }
        burndown = { sprintId, totalPoints, points };
      }
    }

    return NextResponse.json({ sprints: enriched, metrics: { sayDoRatio, avgVelocity, completedSprints: completedSprints.length } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get sprints error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/sprints { name, goal?, startDate, endDate, sprintNumber? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true, methodology: true, sprintDuration: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    if (project.methodology && project.methodology !== 'agile') {
      return NextResponse.json({ error: 'Sprints are only available for Agile/Scrum projects. This project uses the Waterfall delivery framework.' }, { status: 409, headers: corsHeaders() });
    }

    const body = await request.json();
    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'name, startDate and endDate are required' }, { status: 400, headers: corsHeaders() });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (endDate <= startDate) {
      return NextResponse.json({ error: 'Sprint end date must be after the start date' }, { status: 400, headers: corsHeaders() });
    }

    const last = await db.sprint.findFirst({ where: { projectId: id }, orderBy: { sprintNumber: 'desc' } });
    const sprintNumber = Number(body.sprintNumber) || (last?.sprintNumber || 0) + 1;

    // guard: only one ACTIVE sprint at a time per project (pod capacity locking)
    if (body.status === 'active') {
      const activeCount = await db.sprint.count({ where: { projectId: id, status: 'active' } });
      if (activeCount > 0) {
        return NextResponse.json({ error: 'An active sprint already exists on this project — complete it before starting another' }, { status: 409, headers: corsHeaders() });
      }
    }

    const sprint = await db.sprint.create({
      data: {
        projectId: id,
        name: String(body.name).trim(),
        goal: body.goal || null,
        sprintNumber,
        startDate,
        endDate,
        status: body.status === 'active' ? 'active' : 'planned',
        committedPoints: Number(body.committedPoints) || 0,
      },
    });

    const actor = await employeeIdForUser(db, (decoded as any).userId);
    await logProjectActivity(db, id, { type: 'task_update', employeeId: actor, message: `Sprint ${sprintNumber} "${sprint.name}" created (${body.startDate} → ${body.endDate}).` });

    return NextResponse.json({ sprint }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create sprint error:', error);
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
