import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectWorkflowConfig, resolveTierApprover, ProjectApprovalTier } from '@/lib/project-workflow';
import { createProjectWorkspace, notifyProjectMembers, notifyEmployee, logProjectActivity } from '@/lib/project-events';

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

// ─── GET: intake status + approval chain ──────────────────────────
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      select: {
        id: true, name: true, status: true, intakeStatus: true, methodology: true,
        businessObjective: true, executiveSponsor: true, targetCompletionDate: true,
        submittedAt: true, approvedAt: true, approvedBy: true,
        workspaceRoomId: true, workspaceBoardId: true, costCenter: true, travelBudgetRequired: true,
        projectManagerId: true,
      },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    let myEmployeeId: string | null = employeeId || null;
    if (!myEmployeeId && (decoded as any).userId) {
      const emp = await db.employee.findUnique({ where: { userId: (decoded as any).userId }, select: { id: true } }).catch(() => null);
      myEmployeeId = emp?.id || null;
    }

    const [steps, sponsorEmployee, pmEmployee] = await Promise.all([
      db.projectApprovalStep.findMany({ where: { projectId: id, gateType: 'intake' }, orderBy: { level: 'asc' } }),
      project.executiveSponsor
        ? db.employee.findUnique({ where: { id: project.executiveSponsor }, select: { id: true, firstName: true, lastName: true } }).catch(() => null)
        : Promise.resolve(null),
      project.projectManagerId
        ? db.employee.findUnique({ where: { id: project.projectManagerId }, select: { id: true, firstName: true, lastName: true } }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const pendingStep = (steps || []).find((s: any) => s.status === 'pending');
    const canDecide = pendingStep ? await userCanDecideStep(db, pendingStep, myEmployeeId, (decoded as any).role) : false;

    return NextResponse.json({
      intake: { ...project, approvalSteps: steps, projectManager: pmEmployee, sponsorEmployee },
      myEmployeeId,
      canDecide,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get intake error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── POST: submit intake for approval ─────────────────────────────
// Body: { methodology, businessObjective, executiveSponsor?, targetCompletionDate, costCenter?, travelBudgetRequired? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    if (project.intakeStatus === 'approved') {
      return NextResponse.json({ error: 'This project has already been approved' }, { status: 409, headers: corsHeaders() });
    }

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, project.companyId);
    const body = await request.json();

    const methodology = body.methodology || project.methodology;
    if (!methodology || !['agile', 'waterfall'].includes(methodology)) {
      return NextResponse.json({ error: 'A delivery methodology (Agile/Scrum or Waterfall) must be selected during project creation' }, { status: 400, headers: corsHeaders() });
    }

    const businessObjective = body.businessObjective ?? project.businessObjective;
    const executiveSponsor = body.executiveSponsor ?? project.executiveSponsor;
    const targetCompletionDate = body.targetCompletionDate ?? (project.targetCompletionDate ? project.targetCompletionDate.toISOString() : null);

    if (config.intake.requireBusinessObjective && !String(businessObjective || '').trim()) {
      return NextResponse.json({ error: 'Business objective is required for intake submission' }, { status: 400, headers: corsHeaders() });
    }
    if (config.intake.requireExecutiveSponsor && !String(executiveSponsor || '').trim()) {
      return NextResponse.json({ error: 'Executive sponsor is required for intake submission' }, { status: 400, headers: corsHeaders() });
    }
    if (config.intake.requireTargetCompletionDate && !targetCompletionDate) {
      return NextResponse.json({ error: 'Target completion date is required for intake submission' }, { status: 400, headers: corsHeaders() });
    }

    // Persist intake fields on the project
    await db.project.update({
      where: { id },
      data: {
        methodology,
        businessObjective: businessObjective || null,
        executiveSponsor: executiveSponsor || null,
        targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
        costCenter: body.costCenter ?? project.costCenter,
        travelBudgetRequired: typeof body.travelBudgetRequired === 'boolean' ? body.travelBudgetRequired : project.travelBudgetRequired,
        intakeStatus: 'submitted',
        submittedAt: new Date(),
      },
    });

    // Build the approval chain (skip if config says no approval needed)
    const actorEmployee = await employeeIdForUser(db, (decoded as any).userId);
    if (config.intake.requireApproval) {
      // resolve approvers for every tier
      const tiers: ProjectApprovalTier[] = config.intake.chain.length
        ? config.intake.chain
        : [{ tier: 1, approverType: 'tenant_admin', label: 'Administrator Approval' }];

      const projRef = {
        projectManagerId: project.projectManagerId,
        deliveryManagerId: project.deliveryManagerId,
        departmentId: project.departmentId,
        executiveSponsor: executiveSponsor || null,
      };

      let level = 1;
      const created: any[] = [];
      for (const tier of tiers) {
        const resolved = await resolveTierApprover(db, projRef, tier);
        const step = await db.projectApprovalStep.create({
          data: {
            projectId: id,
            gateType: 'intake',
            entityType: 'project',
            entityId: id,
            level: level++,
            name: tier.label || `Approval Tier ${tier.tier}`,
            approverType: tier.approverType,
            approverValue: resolved.employeeId || tier.approverValue || null,
            status: 'pending',
          },
        });
        created.push(step);
      }

      // Notify first approver
      const first = created[0];
      if (first?.approverValue) {
        await notifyEmployee(db, {
          tenantId: (decoded as any).tenantId,
          employeeId: first.approverValue,
          title: 'Project intake awaiting your approval',
          message: `"${project.name}" has been submitted for initiation and needs your review (Tier ${first.level}).`,
          link: `/projects/${id}?tab=approvals`,
          type: 'workflow',
        });
      }
    } else {
      // No approval required → auto-approve immediately
      await db.project.update({
        where: { id },
        data: { intakeStatus: 'approved', approvedAt: new Date(), approvedBy: actorEmployee || 'auto' },
      });
      await activateProject(db, { ...project, methodology, executiveSponsor }, decoded, actorEmployee);
    }

    await logProjectActivity(db, id, {
      type: 'approval',
      employeeId: actorEmployee,
      message: `Project intake submitted for approval (methodology: ${methodology === 'agile' ? 'Agile/Scrum' : 'Waterfall'}).`,
    });

    const updated = await db.project.findUnique({
      where: { id },
      include: { approvalSteps: { orderBy: { level: 'asc' } } },
    });

    return NextResponse.json({ project: { ...(updated as any), approvalSteps: (updated as any)?.approvalSteps } }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Submit intake error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── PATCH: decide on the current pending intake step ─────────────
// Body: { action: 'approve' | 'reject', comments?, stepId? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const body = await request.json();
    const action = body.action;
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400, headers: corsHeaders() });
    }

    const myEmployeeId = await employeeIdForUser(db, (decoded as any).userId);
    const role = (decoded as any).role;

    const steps = await db.projectApprovalStep.findMany({
      where: { projectId: id, gateType: 'intake' },
      orderBy: { level: 'asc' },
    });
    const pending = steps.find((s: any) => s.status === 'pending');
    if (!pending) {
      return NextResponse.json({ error: 'No pending intake approval step for this project' }, { status: 409, headers: corsHeaders() });
    }

    const canDecide = await userCanDecideStep(db, pending, myEmployeeId, role);
    if (!canDecide) {
      return NextResponse.json({ error: 'You are not the assigned approver for the current intake tier' }, { status: 403, headers: corsHeaders() });
    }

    const actorEmployee = myEmployeeId;
    if (action === 'reject') {
      await db.projectApprovalStep.update({ where: { id: pending.id }, data: { status: 'rejected', decidedBy: (decoded as any).userId, decidedAt: new Date(), comments: body.comments || null } });
      await db.projectApprovalStep.updateMany({ where: { projectId: id, gateType: 'intake', status: 'pending' }, data: { status: 'skipped' } });
      await db.project.update({ where: { id }, data: { intakeStatus: 'rejected' } });
      await logProjectActivity(db, id, { type: 'approval', employeeId: actorEmployee, message: `Intake rejected at tier ${pending.level}: ${body.comments || 'no comments'}.` });
      await notifyProjectMembers(db, {
        tenantId: (decoded as any).tenantId, projectId: id, projectName: project.name,
        title: 'Project intake rejected',
        message: `"${project.name}" was rejected at "${pending.name}": ${body.comments || 'no comments'}.`,
      });
      return NextResponse.json({ ok: true, intakeStatus: 'rejected' }, { headers: corsHeaders() });
    }

    // Approve this step
    await db.projectApprovalStep.update({ where: { id: pending.id }, data: { status: 'approved', decidedBy: (decoded as any).userId, decidedAt: new Date(), comments: body.comments || null } });

    const next = steps.find((s: any) => s.level > pending.level && s.status === 'pending');
    if (next) {
      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId: next.approverValue as string,
        title: 'Project intake awaiting your approval',
        message: `"${project.name}" cleared "${pending.name}" and now needs your review (Tier ${next.level}).`,
        link: `/projects/${id}?tab=approvals`,
        type: 'workflow',
      });
      await logProjectActivity(db, id, { type: 'approval', employeeId: actorEmployee, message: `Intake tier ${pending.level} approved by ${role}. Next: ${next.name}.` });
      return NextResponse.json({ ok: true, advancedTo: next.level }, { headers: corsHeaders() });
    }

    // ── FINAL APPROVAL → AUTOMATED TRIGGER
    await db.project.update({ where: { id }, data: { intakeStatus: 'approved', approvedAt: new Date(), approvedBy: (decoded as any).userId } });
    const ws = await activateProject(db, project, decoded, actorEmployee);

    return NextResponse.json({ ok: true, intakeStatus: 'approved', workspace: ws }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Decide intake error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/** Final approval side-effects: activate + workspace + notifications. */
async function activateProject(db: any, project: any, decoded: any, actorEmployee: string | null) {
  const ws = await createProjectWorkspace(db, project, actorEmployee);

  await db.project.update({
    where: { id: project.id },
    data: {
      status: project.status === 'draft' ? 'active' : project.status,
      // legacy projects keep their status; only drafts move to active
    },
  }).catch(() => null);

  await logProjectActivity(db, project.id, {
    type: 'workspace',
    employeeId: actorEmployee,
    message: `Project approved — centralized workspace created (chat room + delivery board). Team members notified.`,
    meta: { roomId: ws.roomId, boardId: ws.boardId },
  });

  const count = await notifyProjectMembers(db, {
    tenantId: (decoded as any).tenantId,
    projectId: project.id,
    projectName: project.name,
    title: 'You have been assigned to a new project',
    message: `"${project.name}" is now active. A project workspace (chat + delivery board) has been created.`,
    link: `/projects/${project.id}`,
  });

  return { ...ws, notifiedMembers: count };
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

/** Can this user decide the given pending step? */
async function userCanDecideStep(db: any, step: any, myEmployeeId: string | null, role: string): Promise<boolean> {
  if (['tenant_admin', 'super_admin'].includes(role)) return true; // admin override
  switch (step.approverType) {
    case 'reporting_manager':
    case 'department_head':
    case 'specific_employee':
    case 'project_sponsor':
      return !!myEmployeeId && step.approverValue === myEmployeeId;
    case 'hr_admin':
      return ['hr_admin', 'admin'].includes(role);
    case 'tenant_admin':
      return ['tenant_admin', 'admin'].includes(role);
    default:
      return false;
  }
}
