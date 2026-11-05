import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
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

// GET /api/projects/[id]/activity?limit=50&type=
// Collaboration & updates feed (self-service status reports + documentation notes)
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
    const limit = Math.min(200, Number(searchParams.get('limit')) || 50);
    const type = searchParams.get('type');

    const activities = await db.projectActivity.findMany({
      where: { projectId: id, ...(type ? { type } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ activities }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/activity — team members post status updates / notes
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const body = await request.json();
    const message = String(body.message || '').trim();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400, headers: corsHeaders() });

    const employee = await db.employee.findUnique({ where: { userId: (decoded as any).userId }, select: { id: true } }).catch(() => null);

    const activity = await db.projectActivity.create({
      data: {
        projectId: id,
        type: ['comment', 'status_report'].includes(body.type) ? body.type : 'comment',
        message: message.slice(0, 2000),
        employeeId: employee?.id || null,
        meta: body.meta ? JSON.stringify(body.meta).slice(0, 2000) : null,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ activity }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Post activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
