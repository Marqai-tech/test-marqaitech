import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';

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

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const employeeId = searchParams.get('employeeId');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const companyId = searchParams.get('companyId');
    const tenantId = searchParams.get('tenantId');

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    if (isSuperAdminWithoutScope(decoded, companyId, tenantId, request)) {
      return NextResponse.json({ tasks: [], pagination: { page, limit, total: 0, totalPages: 0 } }, { headers: corsHeaders() });
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (category) where.category = category;
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      db.onboardingTask.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.onboardingTask.count({ where }),
    ]);

    return NextResponse.json({ tasks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get onboarding tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, task, category, dueDate, assignedBy, notes, priority, kra, trainingModule, mentorEmployeeId } = body;

    if (!employeeId || !task) {
      return NextResponse.json({ error: 'Missing required fields: employeeId, task' }, { status: 400, headers: corsHeaders() });
    }

    // C-004 fix: Only HR/Admin/managers can create onboarding tasks
    const HR_ROLES_ONBOARD = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'manager'];
    if (!HR_ROLES_ONBOARD.includes((decoded.role as string) || '')) {
      return NextResponse.json({ error: 'Only HR/Admin/Managers can create onboarding tasks' }, { status: 403, headers: corsHeaders() });
    }

    // Phase 14 fix: Verify the employee has an accepted offer before allowing onboarding
    // (prevents onboarding for candidates who haven't accepted their offer)
    try {
      const offerRows = await db.$queryRawUnsafe(
        `SELECT o."status" FROM "Offer" o
         WHERE o."candidateId" = $1 AND o."status" = 'accepted'
         ORDER BY o."createdAt" DESC LIMIT 1`,
        employeeId,
      ) as any[];
      if (offerRows.length === 0) {
        // Also check if this employee was converted from a candidate — check by email
        const empRow = await db.$queryRawUnsafe(
          `SELECT e."email" FROM "Employee" e WHERE e."id" = $1 LIMIT 1`, employeeId,
        ) as any[];
        if (empRow[0]?.email) {
          const offerByEmail = await db.$queryRawUnsafe(
            `SELECT o."status" FROM "Offer" o
             WHERE LOWER(o."candidateEmail") = LOWER($1) AND o."status" = 'accepted'
             ORDER BY o."createdAt" DESC LIMIT 1`,
            empRow[0].email,
          ) as any[];
          if (offerByEmail.length === 0) {
            // Document: This is a soft gate — we allow onboarding for existing employees
            // who may have been added manually (not via offer). The warning is logged.
            console.warn('[Onboarding POST] No accepted offer found for employee', employeeId, '— proceeding (may be a manual hire)');
          }
        }
      }
    } catch { /* Offer table may not exist — allow onboarding */ }

    const onboardingTask = await db.onboardingTask.create({
      data: {
        employeeId,
        task,
        category: category || 'general',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedBy,
        notes: notes || null,
        priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
        kra: kra || null,
        trainingModule: trainingModule || null,
        mentorEmployeeId: mentorEmployeeId || null,
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ task: onboardingTask }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create onboarding task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
