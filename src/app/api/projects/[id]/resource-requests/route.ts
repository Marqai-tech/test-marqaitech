import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { matchEmployeesForRequirement, parseSkillRequirements } from '@/lib/skill-matching';
import { resolveProjectWorkflowConfig } from '@/lib/project-workflow';
import { logProjectActivity, notifyEmployee, checkOverAllocation } from '@/lib/project-events';

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

// GET /api/projects/[id]/resource-requests
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id }, select: { id: true, companyId: true, name: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const requirements = await db.projectRoleRequirement.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });

    // live allocations for context
    const allocations = await db.projectAllocation.findMany({
      where: { projectId: id, status: { in: ['active', 'soft'] } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: { select: { title: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const parsed = requirements.map((r: any) => ({
      ...r,
      requiredSkillsParsed: parseSkillRequirements(r.requiredSkills),
      matchedEmployeesParsed: safeParse(r.matchedEmployees),
    }));

    return NextResponse.json({ requirements: parsed, allocations }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get resource requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/resource-requests
// Body: { title, count?, requiredSkills?: [{skill, level, minYears}], estimatedHours?, allocationPct?,
//         startDate?, endDate?, priority?, match?: boolean }
// When match=true → runs algorithmic matchmaking and caches the top candidates.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const role = (decoded as any).role;
    if (!['tenant_admin', 'super_admin', 'admin', 'manager'].includes(role)) {
      // project managers may also raise resource requests
      const myEmp = await db.employee.findUnique({ where: { userId: (decoded as any).userId }, select: { id: true } }).catch(() => null);
      const isPM = myEmp && (project.projectManagerId === myEmp.id || project.deliveryManagerId === myEmp.id);
      if (!isPM) return NextResponse.json({ error: 'Only project managers or admins can raise resource requests' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    if (!body.title || !String(body.title).trim()) {
      return NextResponse.json({ error: 'Role title is required (e.g. "2 Senior Developers")' }, { status: 400, headers: corsHeaders() });
    }

    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, project.companyId);

    const requirement = await db.projectRoleRequirement.create({
      data: {
        projectId: id,
        title: String(body.title).trim(),
        count,
        requiredSkills: body.requiredSkills ? JSON.stringify(body.requiredSkills) : null,
        estimatedHours: Number(body.estimatedHours) || 0,
        allocationPct: body.allocationPct ? Math.max(1, Math.min(100, Number(body.allocationPct))) : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        priority: ['low', 'medium', 'high', 'critical'].includes(body.priority) ? body.priority : 'medium',
        status: 'open',
        notes: body.notes || null,
      },
    });

    // Run matchmaking immediately
    const candidates = await matchEmployeesForRequirement(
      db,
      {
        requiredSkills: body.requiredSkills,
        startDate: body.startDate,
        endDate: body.endDate,
        allocationPct: body.allocationPct ?? null,
        companyId: project.companyId,
        departmentId: project.departmentId,
      },
      {
        thresholdPct: config.capacity.overAllocationThresholdPct,
        limit: 20,
      }
    );
    await db.projectRoleRequirement.update({
      where: { id: requirement.id },
      data: { matchedEmployees: JSON.stringify(candidates) },
    });

    const actor = await employeeIdForUser(db, (decoded as any).userId);
    await logProjectActivity(db, id, {
      type: 'allocation',
      employeeId: actor,
      message: `Resource request raised: ${count} × "${requirement.title}" — ${candidates.length} candidate(s) matched from live employee profiles.`,
    });

    return NextResponse.json({ requirement: { ...requirement, matchedEmployeesParsed: candidates }, candidates }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create resource request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH /api/projects/[id]/resource-requests
// Actions:
//   { requirementId, action: 'soft_reserve', employeeId, allocationPct?, startDate?, endDate? }
//       → creates a SOFT (bench) ProjectAllocation blocking the availability indicator
//   { requirementId, action: 'allocate', employeeId, ... } → full active allocation + over-allocation check
//   { requirementId, action: 'rematch' }  → re-run matchmaking
//   { requirementId, action: 'cancel' }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const role = (decoded as any).role;
    if (!['tenant_admin', 'super_admin', 'admin', 'manager'].includes(role)) {
      const myEmp = await db.employee.findUnique({ where: { userId: (decoded as any).userId }, select: { id: true } }).catch(() => null);
      const isPM = myEmp && (project.projectManagerId === myEmp.id || project.deliveryManagerId === myEmp.id);
      if (!isPM) return NextResponse.json({ error: 'Not authorized to manage project resources' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { requirementId, action } = body;
    if (!requirementId || !action) return NextResponse.json({ error: 'requirementId and action are required' }, { status: 400, headers: corsHeaders() });

    const reqRow = await db.projectRoleRequirement.findUnique({ where: { id: requirementId } });
    if (!reqRow || reqRow.projectId !== id) return NextResponse.json({ error: 'Requirement not found on this project' }, { status: 404, headers: corsHeaders() });

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, project.companyId);
    const actor = await employeeIdForUser(db, (decoded as any).userId);

    if (action === 'rematch') {
      const candidates = await matchEmployeesForRequirement(db, {
        requiredSkills: reqRow.requiredSkills,
        startDate: reqRow.startDate,
        endDate: reqRow.endDate,
        allocationPct: reqRow.allocationPct,
        companyId: project.companyId,
        departmentId: project.departmentId,
      }, { thresholdPct: config.capacity.overAllocationThresholdPct, limit: 20 });
      await db.projectRoleRequirement.update({ where: { id: requirementId }, data: { matchedEmployees: JSON.stringify(candidates) } });
      return NextResponse.json({ candidates }, { headers: corsHeaders() });
    }

    if (action === 'cancel') {
      await db.projectRoleRequirement.update({ where: { id: requirementId }, data: { status: 'cancelled' } });
      return NextResponse.json({ ok: true }, { headers: corsHeaders() });
    }

    const employeeId: string = body.employeeId;
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required for reserve/allocate' }, { status: 400, headers: corsHeaders() });
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, userId: true } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });

    const allocationPct = Math.max(1, Math.min(100, Number(body.allocationPct ?? reqRow.allocationPct ?? 100)));
    const startDate = body.startDate ? new Date(body.startDate) : (reqRow.startDate ? new Date(reqRow.startDate) : new Date());
    const endDate = body.endDate ? new Date(body.endDate) : (reqRow.endDate ? new Date(reqRow.endDate) : null);

    if (action === 'soft_reserve') {
      // SOFT ALLOCATION: provisionally reserve (bench) without a hard commitment
      const existing = await db.projectAllocation.findFirst({ where: { projectId: id, employeeId, status: { in: ['active', 'soft'] } } });
      if (existing) return NextResponse.json({ error: 'This employee already has an allocation on this project' }, { status: 409, headers: corsHeaders() });

      const alloc = await db.projectAllocation.create({
        data: {
          projectId: id,
          employeeId,
          role: reqRow.title,
          allocationPct,
          startDate,
          endDate,
          billingStatus: 'non_billable',
          status: 'soft',
        },
      });
      const remaining = Math.max(0, reqRow.count - 1);
      await db.projectRoleRequirement.update({
        where: { id: requirementId },
        data: { status: remaining === 0 ? 'soft_reserved' : reqRow.status, notes: `${employee.firstName} ${employee.lastName} soft-reserved`.slice(0, 500) },
      });
      await logProjectActivity(db, id, {
        type: 'allocation',
        employeeId: actor,
        message: `${employee.firstName} ${employee.lastName} soft-reserved (bench) for "${reqRow.title}" at ${allocationPct}% — availability blocked until kickoff.`,
      });
      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId,
        title: 'Provisional project reservation',
        message: `You have been soft-reserved for "${reqRow.title}" on project "${project.name}" (${allocationPct}%). This may be confirmed or released at kickoff.`,
        link: `/projects/${id}`,
      });
      await checkOverAllocation(db, { tenantId: (decoded as any).tenantId, employeeId, thresholdPct: config.capacity.overAllocationThresholdPct });
      return NextResponse.json({ allocation: alloc }, { status: 201, headers: corsHeaders() });
    }

    if (action === 'allocate') {
      const existing = await db.projectAllocation.findFirst({ where: { projectId: id, employeeId, status: { in: ['active', 'soft'] } } });
      if (existing) {
        const upgraded = await db.projectAllocation.update({
          where: { id: existing.id },
          data: { status: 'active', allocationPct, role: reqRow.title, startDate, endDate, timesheetApprover: project.projectManagerId },
        });
        await db.projectRoleRequirement.update({ where: { id: requirementId }, data: { status: 'filled' } });
        await logProjectActivity(db, id, { type: 'allocation', employeeId: actor, message: `${employee.firstName} ${employee.lastName} confirmed as "${reqRow.title}" at ${allocationPct}%.` });
        return NextResponse.json({ allocation: upgraded }, { headers: corsHeaders() });
      }
      const alloc = await db.projectAllocation.create({
        data: {
          projectId: id,
          employeeId,
          role: reqRow.title,
          allocationPct,
          startDate,
          endDate,
          billingStatus: 'billable',
          status: 'active',
          timesheetApprover: project.projectManagerId,
        },
      });
      // ensure RBAC membership
      await db.projectMember.upsert({
        where: { projectId_employeeId: { projectId: id, employeeId } },
        create: { projectId: id, employeeId, role: 'member', assignedBy: actor || 'system' },
        update: {},
      }).catch(() => null);
      await db.projectRoleRequirement.update({ where: { id: requirementId }, data: { status: 'filled' } });
      await logProjectActivity(db, id, { type: 'allocation', employeeId: actor, message: `${employee.firstName} ${employee.lastName} allocated as "${reqRow.title}" at ${allocationPct}%.` });
      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId,
        title: 'New project allocation',
        message: `You have been allocated to "${project.name}" as ${reqRow.title} (${allocationPct}%) from ${startDate.toISOString().slice(0, 10)}.`,
        link: `/projects/${id}`,
      });
      await checkOverAllocation(db, { tenantId: (decoded as any).tenantId, employeeId, thresholdPct: config.capacity.overAllocationThresholdPct });
      return NextResponse.json({ allocation: alloc }, { status: 201, headers: corsHeaders() });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('Update resource request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/projects/[id]/resource-requests?requirementId=
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (!['tenant_admin', 'super_admin', 'admin', 'manager'].includes((decoded as any).role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const requirementId = searchParams.get('requirementId');
    if (!requirementId) return NextResponse.json({ error: 'requirementId query param is required' }, { status: 400, headers: corsHeaders() });

    const reqRow = await db.projectRoleRequirement.findUnique({ where: { id: requirementId } });
    if (!reqRow || reqRow.projectId !== id) return NextResponse.json({ error: 'Requirement not found on this project' }, { status: 404, headers: corsHeaders() });
    await db.projectRoleRequirement.delete({ where: { id: requirementId } });
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete resource request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

function safeParse(s: unknown): any {
  if (!s) return null;
  if (Array.isArray(s)) return s;
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
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
