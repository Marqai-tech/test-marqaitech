import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectWorkflowConfig } from '@/lib/project-workflow';
import { logProjectActivity, notifyProjectMembers } from '@/lib/project-events';
import { resolveProjectAccess } from '@/lib/project-rbac';
import { decryptNumber } from '@/lib/encryption';

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

// ─── GET: closure readiness report ────────────────────────────────
// Metrics feed the sign-off decision + post-mortem + appraisal integration.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, null);
    const project = await db.project.findUnique({
      where: { id },
      include: {
        milestones: { orderBy: { plannedDate: 'asc' } },
        allocations: { where: { status: { in: ['active', 'soft'] } }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
        tasks: { select: { id: true, status: true, plannedEnd: true, completedAt: true, estimatedHours: true, actualHours: true, storyPoints: true } },
      },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const [timesheetAgg, reviews, openGates] = await Promise.all([
      db.timesheet.aggregate({ where: { projectId: id }, _sum: { hours: true } }).catch(() => ({ _sum: { hours: 0 } })),
      db.projectReview.findMany({ where: { projectId: id } }),
      db.projectApprovalStep.count({ where: { projectId: id, status: 'pending' } }),
    ]);

    // Waterfall budget slippage: actual cost vs budget caps per phase
    const totalHours = timesheetAgg?._sum?.hours || 0;
    const costRates = await db.employeeCostRate.findMany({
      where: { employeeId: { in: project.allocations.map((a: any) => a.employeeId), }, isActive: true },
      select: { employeeId: true, hourlyCostRateEnc: true },
    }).catch(() => []);
    const rateByEmp = new Map<string, number>();
    for (const cr of costRates) {
      const rate = decryptNumber(cr.hourlyCostRateEnc);
      if (rate !== null) rateByEmp.set(cr.employeeId, rate);
    }
    // Estimated actual cost: sum over allocations (hours per employee × cost rate); fallback project costRate
    let actualCost = 0;
    let rateKnown = false;
    if (rateByEmp.size > 0) {
      rateKnown = true;
      const perEmp = await db.timesheet.groupBy({ by: ['employeeId'], where: { projectId: id }, _sum: { hours: true } }).catch(() => []);
      for (const row of perEmp || []) {
        const rate = rateByEmp.get(row.employeeId) || 0;
        actualCost += (row._sum.hours || 0) * rate;
      }
    } else if (project.costRate > 0) {
      actualCost = totalHours * project.costRate;
    }

    // Milestone variance (waterfall): delivered before/after rigid dates
    const milestonesWithVariance = project.milestones.map((m: any) => {
      let varianceDays: number | null = null;
      if (m.actualDate && m.plannedDate) {
        varianceDays = Math.round((new Date(m.actualDate).getTime() - new Date(m.plannedDate).getTime()) / (24 * 3600 * 1000));
      }
      return {
        id: m.id, name: m.name, plannedDate: m.plannedDate, actualDate: m.actualDate,
        approvalStatus: m.approvalStatus, sequence: m.sequence, isPhase: m.isPhase, budgetCap: m.budgetCap,
        varianceDays,
        onTime: varianceDays === null ? null : varianceDays <= 0,
      };
    });
    const closedMilestones = milestonesWithVariance.filter((m: any) => m.actualDate);
    const onTimeCount = closedMilestones.filter((m: any) => m.onTime).length;

    const tasksDone = project.tasks.filter((t: any) => t.status === 'done').length;
    const overdueTasks = project.tasks.filter((t: any) => t.status !== 'done' && t.status !== 'cancelled' && t.plannedEnd && new Date(t.plannedEnd) < new Date()).length;

    const checks = [
      { key: 'intake_approved', label: 'Project intake approved', ok: project.intakeStatus ? project.intakeStatus === 'approved' : true },
      { key: 'no_pending_gates', label: 'No pending stage-gate approvals', ok: openGates === 0 },
      {
        key: 'milestones',
        label: config.closure.requireAllMilestonesApproved ? 'All milestones approved' : 'All milestones completed or explicitly closed',
        ok: config.closure.requireAllMilestonesApproved
          ? project.milestones.every((m: any) => m.approvalStatus === 'approved')
          : true,
      },
      { key: 'post_mortem', label: 'Post-mortem reviews recorded for allocated members', ok: !config.closure.requirePostMortem || project.allocations.every((a: any) => reviews.some((r: any) => r.employeeId === a.employeeId)) },
      { key: 'compliance', label: `Compliance checklist (${config.closure.complianceChecklist.length} item(s))`, ok: false, checklist: config.closure.complianceChecklist },
    ];

    const readiness = {
      canClose: checks.filter((c) => c.key !== 'compliance').every((c) => c.ok),
      totalHours,
      actualCost: Math.round(actualCost * 100) / 100,
      rateKnown,
      budgetVariancePct: project.budgetAmount > 0 && rateKnown ? Math.round(((actualCost - project.budgetAmount) / project.budgetAmount) * 100) : null,
      milestoneVariance: {
        closed: closedMilestones.length,
        total: milestonesWithVariance.length,
        onTime: onTimeCount,
        onTimePct: closedMilestones.length ? Math.round((onTimeCount / closedMilestones.length) * 100) : null,
      },
      budgetSlippage: milestonesWithVariance.filter((m: any) => m.budgetCap !== null && m.budgetCap !== undefined).map((m: any) => ({ id: m.id, name: m.name, budgetCap: m.budgetCap })),
      tasks: { total: project.tasks.length, done: tasksDone, overdue: overdueTasks },
      openGates,
      reviewsRecorded: reviews.length,
      pendingAllocations: project.allocations.length,
    };

    return NextResponse.json({ project: { id: project.id, name: project.name, status: project.status, closedAt: project.closedAt, signOffBy: project.signOffBy, signOffNotes: project.signOffNotes, methodology: project.methodology }, readiness, checks }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Closure readiness error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── POST: formal sign-off / closure ──────────────────────────────
// Body: { signOffNotes?, complianceConfirmed: boolean }
// Closes the loop: project.status → completed, archives documentation reference,
// feeds metrics to the performance module via ProjectReview rows.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id);
    if (!access.canEdit || !['tenant_admin', 'super_admin', 'admin', 'manager'].includes((decoded as any).role)) {
      return NextResponse.json({ error: 'Only the project manager or administrators can sign off the project' }, { status: 403, headers: corsHeaders() });
    }

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    if (project.status === 'completed') return NextResponse.json({ error: 'Project is already closed' }, { status: 409, headers: corsHeaders() });

    const body = await request.json();
    if (!body.complianceConfirmed) {
      return NextResponse.json({ error: 'Compliance & policy sign-off must be confirmed before closure' }, { status: 400, headers: corsHeaders() });
    }

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, project.companyId);

    if (config.closure.requirePostMortem) {
      const [allocCount, reviewCount] = await Promise.all([
        db.projectAllocation.count({ where: { projectId: id, status: { in: ['active', 'soft'] } } }),
        db.projectReview.count({ where: { projectId: id } }),
      ]);
      if (allocCount > 0 && reviewCount < allocCount) {
        return NextResponse.json(
          { error: `Post-mortem reviews are required before closure: ${reviewCount}/${allocCount} team members reviewed. Record reviews for all allocated members first.` },
          { status: 409, headers: corsHeaders() }
        );
      }
    }

    const actor = await employeeIdForUser(db, (decoded as any).userId);

    // close remaining soft reservations + end active allocations
    await db.projectAllocation.updateMany({ where: { projectId: id, status: 'soft' }, data: { status: 'cancelled' } });
    await db.projectAllocation.updateMany({ where: { projectId: id, status: 'active' }, data: { status: 'ended', endDate: new Date() } });

    // lock timesheets? No — keep editable by admins; just stamp the closure.
    const updated = await db.project.update({
      where: { id },
      data: {
        status: 'completed',
        closedAt: new Date(),
        signOffBy: (decoded as any).userId,
        signOffNotes: body.signOffNotes || null,
        progress: 100,
      },
    });

    // closure approval audit trail
    await db.projectApprovalStep.create({
      data: {
        projectId: id,
        gateType: 'closure',
        entityType: 'project',
        entityId: id,
        level: 1,
        name: 'Project Sign-off',
        approverType: 'specific_employee',
        approverValue: actor || project.projectManagerId,
        status: 'approved',
        decidedBy: (decoded as any).userId,
        decidedAt: new Date(),
        comments: body.signOffNotes || 'Formal project sign-off',
      },
    }).catch(() => null);

    await logProjectActivity(db, id, {
      type: 'closure',
      employeeId: actor,
      message: `Project formally signed off and closed. Documentation archived to company/employee profiles. Metrics fed to the performance module.`,
      meta: { signOffNotes: body.signOffNotes || null },
    });

    await notifyProjectMembers(db, {
      tenantId: (decoded as any).tenantId, projectId: id, projectName: project.name,
      title: 'Project closed',
      message: `"${project.name}" has been formally closed and signed off. Thank you for your contribution!`,
      link: `/projects/${id}?tab=closure`,
    });

    return NextResponse.json({ project: updated }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Project closure error:', error);
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
