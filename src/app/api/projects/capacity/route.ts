import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { computeCapacity, wouldExceedCapacity } from '@/lib/capacity';
import { resolveProjectWorkflowConfig } from '@/lib/project-workflow';
import { logProjectActivity } from '@/lib/project-events';

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

// GET /api/projects/capacity?employeeIds=a,b,c&from=2026-09-01&to=2026-10-01[&projectId=][&companyId=]
// Live availability: allocations + approved leaves + holidays + weekly contract hours.
// No employeeIds → all active employees of the company (or project's company).
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const companyIdParam = searchParams.get('companyId');
    const employeeIdsParam = searchParams.get('employeeIds');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const from = fromParam ? new Date(fromParam) : new Date();
    const to = toParam ? new Date(toParam) : new Date(Date.now() + 6 * 7 * 24 * 3600 * 1000); // default 6 weeks

    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, companyIdParam);

    let employeeIds: string[] = [];
    if (employeeIdsParam) {
      employeeIds = employeeIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
      const emps = await db.employee.findMany({ where: { companyId: project.companyId, status: { not: 'terminated' } }, select: { id: true } });
      employeeIds = emps.map((e: any) => e.id);
    } else {
      const emps = await db.employee.findMany({
        where: { status: { not: 'terminated' }, ...(companyIdParam ? { companyId: companyIdParam } : {}) },
        select: { id: true },
        take: 200,
      });
      employeeIds = emps.map((e: any) => e.id);
    }

    if (employeeIds.length === 0) {
      return NextResponse.json({ ...emptyResult(from, to), thresholdPct: config.capacity.overAllocationThresholdPct }, { headers: corsHeaders() });
    }

    const capacity = await computeCapacity(db, employeeIds, from, to, {
      thresholdPct: config.capacity.overAllocationThresholdPct,
      includeSoft: config.capacity.includeSoftAllocations,
    });

    return NextResponse.json({ ...capacity, config: config.capacity }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Capacity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/capacity
// { employeeId, startDate, endDate, allocationPct } → pre-check whether an assignment would
// over-allocate (used by the planner before soft-booking). Also supports
// { action: 'acknowledge_backup', projectId, employeeId } → manager acknowledges hand-off.
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();

    if (body.action === 'acknowledge_backup') {
      const { projectId, employeeId } = body;
      if (!projectId || !employeeId) return NextResponse.json({ error: 'projectId and employeeId are required' }, { status: 400, headers: corsHeaders() });
      const actor = await employeeIdForUser(db, (decoded as any).userId);
      await logProjectActivity(db, projectId, {
        type: 'capacity',
        employeeId: actor,
        message: `Backup hand-off acknowledged — temporary coverage arranged for the absent team member.`,
        meta: { employeeId },
      });
      return NextResponse.json({ ok: true }, { headers: corsHeaders() });
    }

    const { employeeId, startDate, endDate, allocationPct, thresholdPct } = body;
    if (!employeeId || !startDate) {
      return NextResponse.json({ error: 'employeeId and startDate are required' }, { status: 400, headers: corsHeaders() });
    }
    const config = await resolveProjectWorkflowConfig(db, (decoded as any).tenantId, body.companyId || null);
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 30 * 24 * 3600 * 1000);
    const check = await wouldExceedCapacity(
      db,
      employeeId,
      start,
      end,
      Number(allocationPct) || 100,
      { thresholdPct: thresholdPct ?? config.capacity.overAllocationThresholdPct }
    );
    return NextResponse.json(check, { headers: corsHeaders() });
  } catch (error) {
    console.error('Capacity check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

function emptyResult(from: Date, to: Date) {
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    employees: [],
    alerts: [],
  };
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
