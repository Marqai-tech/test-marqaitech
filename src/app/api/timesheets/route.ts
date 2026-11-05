import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced, withSchemaSync } from '@/lib/schema-sync';
import { resolveProjectWorkflowConfig } from '@/lib/project-workflow';
import { notifyEmployee, logProjectActivity } from '@/lib/project-events';

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

// ─── GET /api/timesheets ──────────────────────────────────────────
// List timesheets with filters. Supports projectId (FK), status, employeeId,
// date range, invoiced, locked.
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    await ensureSchemaSynced();

    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');
    const projectId = searchParams.get('projectId');
    const projectTaskId = searchParams.get('projectTaskId');
    const invoiced = searchParams.get('invoiced');
    const locked = searchParams.get('locked');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // ── ?context=1 — pre-population context for the timesheet form:
    // the employee's active allocations, their project tasks (with sprint/phase),
    // and the current ACTIVE sprint per agile project. Powers "timesheet lines are
    // pre-populated with the Current Active Sprint and User Stories assigned to them".
    if (searchParams.get('context') === '1') {
      const empId = employeeId || (await employeeIdForUser(db, (decoded as any).userId));
      if (!empId) return NextResponse.json({ allocations: [], projects: [] }, { headers: corsHeaders() });
      const allocations = await db.projectAllocation.findMany({
        where: { employeeId: empId, status: { in: ['active', 'soft'] } },
        include: { project: { select: { id: true, name: true, code: true, methodology: true, status: true } } },
      }).catch(() => []);
      const projectIds = allocations.map((a: any) => a.projectId);
      const tasks = projectIds.length
        ? await db.projectTask.findMany({
            where: { projectId: { in: projectIds }, status: { in: ['todo', 'in_progress', 'review'] }, OR: [{ assignedToId: empId }, { assignedToId: null }] },
            include: {
              sprint: { select: { id: true, name: true, sprintNumber: true, status: true } },
              milestone: { select: { id: true, name: true, sequence: true, isPhase: true, approvalStatus: true } },
            },
            take: 300,
          }).catch(() => [])
        : [];
      const activeSprints = projectIds.length
        ? await db.sprint.findMany({ where: { projectId: { in: projectIds }, status: 'active' } }).catch(() => [])
        : [];
      return NextResponse.json(
        {
          allocations,
          tasks: tasks.map((t: any) => ({
            id: t.id, projectId: t.projectId, name: t.name, status: t.status, storyPoints: t.storyPoints,
            sprint: t.sprint, phase: t.milestone?.isPhase ? { id: t.milestone.id, name: t.milestone.name, sequence: t.milestone.sequence, approvalStatus: t.milestone.approvalStatus } : null,
          })),
          activeSprints: activeSprints.map((s: any) => ({ id: s.id, projectId: s.projectId, name: s.name, sprintNumber: s.sprintNumber, startDate: s.startDate, endDate: s.endDate })),
        },
        { headers: corsHeaders() }
      );
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (projectId) where.projectId = projectId;
    if (projectTaskId) where.projectTaskId = projectTaskId;
    if (invoiced !== null && invoiced !== undefined && invoiced !== '') where.invoiced = invoiced === 'true';
    if (locked !== null && locked !== undefined && locked !== '') where.locked = locked === 'true';
    if (dateFrom || dateTo) {
      const d: Record<string, unknown> = {};
      if (dateFrom) d.gte = new Date(dateFrom);
      if (dateTo) d.lte = new Date(dateTo);
      where.date = d;
    }

    const [timesheets, total] = await Promise.all([
      withSchemaSync(() =>
        db.timesheet.findMany({
          where,
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } },
            project: { select: { id: true, name: true, code: true, currency: true, billingType: true } },
            projectTask: { select: { id: true, name: true, status: true } },
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        })
      ),
      withSchemaSync(() => db.timesheet.count({ where })),
    ]);

    return NextResponse.json({ timesheets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get timesheets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── POST /api/timesheets ─────────────────────────────────────────
// Create a timesheet entry. Now accepts projectId / projectTaskId (FKs) and
// keeps backward compat with the old `project` / `task` free-text fields.
// If projectId is provided, we hydrate the legacy `project` text field with
// the project's name automatically.
//
// NOTE: The previous @@unique([employeeId, date]) constraint is GONE —
// employees can now log time against multiple projects on the same day.
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    await ensureSchemaSynced();

    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, date, projectId, projectTaskId, project, task, hours, description, status } = body;

    if (!employeeId || !date || hours === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders() });
    }

    // ── WATERFALL PHASE GATING: employees cannot log time to a task in phase N
    // while the previous sequential phase has not been formally approved/closed.
    let projectRow: any = null;
    if (projectId) {
      projectRow = await db.project.findUnique({ where: { id: projectId } });
      if (!projectRow) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }
    if (projectTaskId) {
      const taskRow = await db.projectTask.findUnique({
        where: { id: projectTaskId },
        include: { milestone: { select: { id: true, name: true, sequence: true, isPhase: true, approvalStatus: true } } },
      });
      if (taskRow && taskRow.projectId !== projectId) {
        return NextResponse.json({ error: 'Task does not belong to the selected project' }, { status: 400, headers: corsHeaders() });
      }
      const phase = taskRow?.milestone;
      if (phase?.isPhase && (phase.sequence ?? 0) > 1) {
        const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, projectRow?.companyId);
        if (config.timesheets.enforceWaterfallPhaseGating) {
          const prevPhase = await db.projectMilestone.findFirst({
            where: { projectId: taskRow!.projectId, isPhase: true, sequence: (phase.sequence ?? 0) - 1 },
          });
          if (prevPhase && prevPhase.approvalStatus !== 'approved') {
            return NextResponse.json(
              { error: `Phase gate: time cannot be logged to "${phase.name}" while the previous phase "${prevPhase.name}" has not been formally approved and closed by the project manager.` },
              { status: 409, headers: corsHeaders() }
            );
          }
        }
      }
    }

    // If projectId is provided, look up the project name for the legacy `project` text column
    let projectText = project;
    let taskText = task;
    if (projectId && !projectText) {
      projectText = projectRow?.name;
    }
    if (projectTaskId && !taskText) {
      const t = await db.projectTask.findUnique({ where: { id: projectTaskId }, select: { name: true } });
      if (t) taskText = t.name;
    }

    const timesheet = await withSchemaSync(() =>
      db.timesheet.create({
        data: {
          employeeId,
          date: new Date(date),
          projectId: projectId || null,
          projectTaskId: projectTaskId || null,
          projectText: projectText || null,
          taskText: taskText || null,
          hours: parseFloat(hours),
          description,
          status: status || 'submitted',
        },
        include: {
          employee: { select: { firstName: true, lastName: true, employeeId: true } },
          project: { select: { id: true, name: true, code: true } },
          projectTask: { select: { id: true, name: true } },
        },
      })
    );

    // ── MANAGER APPROVAL ROUTING: notify the configured approver for this project
    if ((status || 'submitted') === 'submitted' && projectId) {
      try {
        const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, projectRow?.companyId);
        let approverEmployeeId: string | null = null;
        if (config.timesheets.approvalMode === 'allocation_approver') {
          const alloc = await db.projectAllocation.findFirst({
            where: { projectId, employeeId, status: { in: ['active', 'soft'] } },
            select: { timesheetApprover: true },
          });
          approverEmployeeId = alloc?.timesheetApprover || projectRow?.projectManagerId || null;
        } else if (config.timesheets.approvalMode === 'project_manager') {
          approverEmployeeId = projectRow?.projectManagerId || null;
        } // hr_admin → role-based approval via the existing PATCH (no single approver to ping)
        if (approverEmployeeId) {
          await notifyEmployee(db, {
            tenantId: (decoded as any).tenantId,
            employeeId: approverEmployeeId,
            title: 'Timesheet awaiting approval',
            message: `${timesheet.employee?.firstName || 'A team member'} logged ${timesheet.hours}h on "${timesheet.project?.name || projectText}" (${new Date(date).toISOString().slice(0, 10)}).`,
            link: `/timesheets`,
            type: 'workflow',
          });
          await logProjectActivity(db, projectId, {
            type: 'timesheet',
            employeeId,
            message: `${timesheet.hours}h logged${timesheet.projectTask?.name ? ` against "${timesheet.projectTask.name}"` : ''}.`,
          });
        }
      } catch (e) {
        console.error('Timesheet approval routing failed (non-blocking):', e);
      }
    }

    return NextResponse.json({ timesheet }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create timesheet error:', error);
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
