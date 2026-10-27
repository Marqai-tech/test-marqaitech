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

// GET /api/projects/[id]/milestones
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const milestones = await db.projectMilestone.findMany({ where: { projectId: id }, orderBy: [{ sequence: 'asc' }, { plannedDate: 'asc' }] });
    return NextResponse.json({ milestones }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get milestones error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/milestones
// Body: { name, plannedDate, sequence?, isPhase?, budgetCap?, billingAmount? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const body = await request.json();
    if (!body.name || !body.plannedDate) {
      return NextResponse.json({ error: 'name and plannedDate are required' }, { status: 400, headers: corsHeaders() });
    }

    const milestone = await db.projectMilestone.create({
      data: {
        projectId: id,
        name: String(body.name).trim(),
        plannedDate: new Date(body.plannedDate),
        sequence: body.sequence ? Number(body.sequence) : null,
        isPhase: !!body.isPhase,
        budgetCap: body.budgetCap !== undefined && body.budgetCap !== null && body.budgetCap !== '' ? Number(body.budgetCap) : null,
        billingAmount: body.billingAmount ? Number(body.billingAmount) : null,
      },
    });

    const actor = await employeeIdForUser(db, (decoded as any).userId);
    await logProjectActivity(db, id, {
      type: 'milestone',
      employeeId: actor,
      message: `${body.isPhase ? 'Phase' : 'Milestone'} "${milestone.name}" planned for ${String(body.plannedDate).slice(0, 10)}${milestone.budgetCap ? ` (budget cap ${milestone.budgetCap})` : ''}.`,
    });

    return NextResponse.json({ milestone }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create milestone error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH /api/projects/[id]/milestones  { milestoneId, name?, plannedDate?, sequence?, budgetCap?, approvalStatus?, completionPct? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const body = await request.json();
    const milestoneId = body.milestoneId;
    if (!milestoneId) return NextResponse.json({ error: 'milestoneId is required' }, { status: 400, headers: corsHeaders() });

    const existing = await db.projectMilestone.findUnique({ where: { id: milestoneId } });
    if (!existing || existing.projectId !== id) return NextResponse.json({ error: 'Milestone not found on this project' }, { status: 404, headers: corsHeaders() });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.plannedDate !== undefined) data.plannedDate = new Date(body.plannedDate);
    if (body.sequence !== undefined) data.sequence = body.sequence ? Number(body.sequence) : null;
    if (body.isPhase !== undefined) data.isPhase = !!body.isPhase;
    if (body.budgetCap !== undefined) data.budgetCap = body.budgetCap === null || body.budgetCap === '' ? null : Number(body.budgetCap);
    if (body.completionPct !== undefined) data.completionPct = Math.max(0, Math.min(100, Number(body.completionPct)));
    if (body.approvalStatus !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(body.approvalStatus)) {
        return NextResponse.json({ error: 'approvalStatus must be pending | approved | rejected' }, { status: 400, headers: corsHeaders() });
      }
      data.approvalStatus = body.approvalStatus;
      if (body.approvalStatus === 'approved' && !existing.actualDate) data.actualDate = new Date();
      if (body.approvalStatus !== 'approved') data.actualDate = null;
    }

    const milestone = await db.projectMilestone.update({ where: { id: milestoneId }, data });
    return NextResponse.json({ milestone }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update milestone error:', error);
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
