import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveProjectWorkflowConfig, resolveTierApprover, ProjectApprovalTier } from '@/lib/project-workflow';
import { logProjectActivity, notifyEmployee, notifyProjectMembers } from '@/lib/project-events';
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

// GET /api/projects/[id]/stage-gate — all approval steps for this project
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const steps = await db.projectApprovalStep.findMany({ where: { projectId: id }, orderBy: [{ gateType: 'asc' }, { level: 'asc' }] });

    const myEmployeeId = await employeeIdForUser(db, (decoded as any).userId);
    const withDecidable = await Promise.all(steps.map(async (s: any) => ({
      ...s,
      canDecide: s.status === 'pending' ? await canDecideStep(db, s, myEmployeeId, (decoded as any).role) : false,
    })));

    return NextResponse.json({ steps: withDecidable }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get stage gates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/stage-gate
// Route a deliverable/milestone through the configured approval chain.
// Body: { entityType: 'milestone'|'task'|'deliverable', entityId?, name?, notes? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const body = await request.json();
    const entityType = body.entityType || 'deliverable';
    if (!['milestone', 'task', 'deliverable'].includes(entityType)) {
      return NextResponse.json({ error: 'entityType must be milestone | task | deliverable' }, { status: 400, headers: corsHeaders() });
    }

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, project.companyId);
    if (!config.stageGates.enabled) {
      return NextResponse.json({ error: 'Stage-gate reviews are disabled in the workflow configuration' }, { status: 409, headers: corsHeaders() });
    }

    let entityName = body.name || 'Deliverable';
    if (entityType === 'milestone' && body.entityId) {
      const ms = await db.projectMilestone.findUnique({ where: { id: body.entityId } });
      if (!ms || ms.projectId !== id) return NextResponse.json({ error: 'Milestone not found on this project' }, { status: 404, headers: corsHeaders() });
      entityName = ms.name;
      await db.projectMilestone.update({ where: { id: body.entityId }, data: { approvalStatus: 'pending' } });
    }
    if (entityType === 'task' && body.entityId) {
      const t = await db.projectTask.findUnique({ where: { id: body.entityId } });
      if (!t || t.projectId !== id) return NextResponse.json({ error: 'Task not found on this project' }, { status: 404, headers: corsHeaders() });
      entityName = t.name;
    }

    const tiers: ProjectApprovalTier[] = config.stageGates.chain.length
      ? config.stageGates.chain
      : [{ tier: 1, approverType: 'reporting_manager', label: 'Team Lead Review' }, { tier: 2, approverType: 'project_sponsor', label: 'Project Sponsor Approval' }];

    const projRef = {
      projectManagerId: project.projectManagerId,
      deliveryManagerId: project.deliveryManagerId,
      departmentId: project.departmentId,
      executiveSponsor: project.executiveSponsor,
    };

    let level = 1;
    const created = [];
    for (const tier of tiers) {
      const resolved = await resolveTierApprover(db, projRef, tier);
      const step = await db.projectApprovalStep.create({
        data: {
          projectId: id,
          gateType: 'stage_gate',
          entityType,
          entityId: body.entityId || null,
          level: level++,
          name: tier.label || `Gate Tier ${tier.tier}`,
          approverType: tier.approverType,
          approverValue: resolved.employeeId || tier.approverValue || null,
          status: 'pending',
        },
      });
      created.push(step);
    }

    if (created[0]?.approverValue) {
      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId: created[0].approverValue,
        title: 'Stage-gate review requested',
        message: `"${entityName}" on project "${project.name}" was submitted for stage-gate review (Tier 1: ${created[0].name}).`,
        link: `/projects/${id}?tab=approvals`,
        type: 'workflow',
      });
    }

    const actor = await employeeIdForUser(db, (decoded as any).userId);
    await logProjectActivity(db, id, {
      type: 'approval',
      employeeId: actor,
      message: `Stage-gate review submitted for ${entityType} "${entityName}" — routed through ${created.length} approval tier(s).`,
    });

    return NextResponse.json({ steps: created }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create stage gate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH /api/projects/[id]/stage-gate — decide { stepId, action: 'approve'|'reject', comments? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const body = await request.json();
    const { stepId, action, comments } = body;
    if (!stepId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'stepId and action (approve|reject) are required' }, { status: 400, headers: corsHeaders() });
    }

    const step = await db.projectApprovalStep.findUnique({ where: { id: stepId } });
    if (!step || step.projectId !== id) return NextResponse.json({ error: 'Approval step not found on this project' }, { status: 404, headers: corsHeaders() });
    if (step.status !== 'pending') return NextResponse.json({ error: `This step is already ${step.status}` }, { status: 409, headers: corsHeaders() });

    const myEmployeeId = await employeeIdForUser(db, (decoded as any).userId);
    const canDecide = await canDecideStep(db, step, myEmployeeId, (decoded as any).role);
    if (!canDecide) return NextResponse.json({ error: 'You are not the assigned approver for this gate tier' }, { status: 403, headers: corsHeaders() });

    const project = await db.project.findUnique({ where: { id } });
    await db.projectApprovalStep.update({
      where: { id: stepId },
      data: { status: action === 'approve' ? 'approved' : 'rejected', decidedBy: (decoded as any).userId, decidedAt: new Date(), comments: comments || null },
    });

    if (action === 'reject') {
      await db.projectApprovalStep.updateMany({ where: { projectId: id, gateType: step.gateType, entityType: step.entityType, entityId: step.entityId, status: 'pending' }, data: { status: 'skipped' } });
      if (step.entityType === 'milestone' && step.entityId) {
        await db.projectMilestone.update({ where: { id: step.entityId }, data: { approvalStatus: 'rejected' } }).catch(() => null);
      }
      await logProjectActivity(db, id, { type: 'approval', message: `Stage-gate "${step.name}" rejected: ${comments || 'no comments'}.` });
      return NextResponse.json({ ok: true, status: 'rejected' }, { headers: corsHeaders() });
    }

    const next = await db.projectApprovalStep.findFirst({
      where: { projectId: id, gateType: step.gateType, entityType: step.entityType, entityId: step.entityId, status: 'pending', level: { gt: step.level } },
      orderBy: { level: 'asc' },
    });

    if (next) {
      if (next.approverValue) {
        await notifyEmployee(db, {
          tenantId: (decoded as any).tenantId,
          employeeId: next.approverValue,
          title: 'Stage-gate review requested',
          message: `"${step.entityType}" cleared "${step.name}" and now needs your review (Tier ${next.level}: ${next.name}).`,
          link: `/projects/${id}?tab=approvals`,
          type: 'workflow',
        });
      }
      await logProjectActivity(db, id, { type: 'approval', message: `Stage-gate tier ${step.level} approved. Next: ${next.name}.` });
      return NextResponse.json({ ok: true, advancedTo: next.level }, { headers: corsHeaders() });
    }

    // Final gate approved
    if (step.entityType === 'milestone' && step.entityId) {
      await db.projectMilestone.update({ where: { id: step.entityId }, data: { approvalStatus: 'approved', actualDate: new Date() } }).catch(() => null);
    }
    await logProjectActivity(db, id, { type: 'approval', message: `Stage-gate chain COMPLETE for ${step.entityType} "${step.name || step.entityType}" — all tiers approved.` });
    if (project) {
      await notifyProjectMembers(db, {
        tenantId: (decoded as any).tenantId, projectId: id, projectName: project.name,
        title: 'Stage gate approved',
        message: `A deliverable on "${project.name}" cleared all ${step.level} approval tier(s).`,
        link: `/projects/${id}?tab=approvals`,
      });
    }
    return NextResponse.json({ ok: true, status: 'approved', chainComplete: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Decide stage gate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

async function canDecideStep(db: any, step: any, myEmployeeId: string | null, role: string): Promise<boolean> {
  if (['tenant_admin', 'ceo', 'super_admin'].includes(role)) return true;
  switch (step.approverType) {
    case 'reporting_manager':
    case 'department_head':
    case 'specific_employee':
    case 'project_sponsor':
      return !!myEmployeeId && step.approverValue === myEmployeeId;
    case 'hr_admin':
      return ['hr_admin', 'admin'].includes(role);
    case 'tenant_admin': case 'ceo':
      return ['tenant_admin', 'ceo', 'admin'].includes(role);
    default:
      return false;
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
