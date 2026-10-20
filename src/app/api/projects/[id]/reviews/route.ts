import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { logProjectActivity, notifyEmployee } from '@/lib/project-events';
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

// GET /api/projects/[id]/reviews — post-mortem reviews (also drives appraisal sync)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canView) return NextResponse.json({ error: 'No access to this project' }, { status: 403, headers: corsHeaders() });

    const reviews = await db.projectReview.findMany({
      where: { projectId: id },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Per-member delivery metrics for the appraisal module
    const taskStats = await db.projectTask.groupBy({
      by: ['assignedToId'],
      where: { projectId: id, assignedToId: { not: null } },
      _count: { id: true },
      _sum: { storyPoints: true, estimatedHours: true },
    }).catch(() => []);
    const doneStats = await db.projectTask.groupBy({
      by: ['assignedToId'],
      where: { projectId: id, assignedToId: { not: null }, status: 'done' },
      _count: { id: true },
      _sum: { storyPoints: true },
    }).catch(() => []);
    const hoursByEmp = await db.timesheet.groupBy({
      by: ['employeeId'],
      where: { projectId: id },
      _sum: { hours: true },
    }).catch(() => []);

    const contributions = (taskStats || []).map((t: any) => {
      const done = (doneStats || []).find((d: any) => d.assignedToId === t.assignedToId);
      const hours = (hoursByEmp || []).find((h: any) => h.employeeId === t.assignedToId);
      return {
        employeeId: t.assignedToId,
        tasksAssigned: t._count.id,
        tasksCompleted: done?._count.id || 0,
        storyPoints: t._sum.storyPoints || 0,
        storyPointsDelivered: done?._sum.storyPoints || 0,
        estimatedHours: t._sum.estimatedHours || 0,
        hoursLogged: hours?._sum.hours || 0,
      };
    });

    return NextResponse.json({ reviews, contributions }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get reviews error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// POST /api/projects/[id]/reviews
// Body: { reviews: [{ employeeId, deliveryQuality, communication, speed, overall?, comments?, skillUpgradeSuggestion? }] }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const access = await resolveProjectAccess(decoded as any, id, db);
    if (!access.canEdit) return NextResponse.json({ error: 'You do not have edit access to this project' }, { status: 403, headers: corsHeaders() });

    const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true, projectManagerId: true, status: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });

    const reviewerEmployeeId = await employeeIdForUser(db, (decoded as any).userId);
    // Admins without an employee record may still record reviews on behalf of the project manager
    const fallbackReviewer = reviewerEmployeeId || project.projectManagerId || null;
    if (!fallbackReviewer) {
      return NextResponse.json({ error: 'No reviewer identity available (employee or project manager required)' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const rows = Array.isArray(body.reviews) ? body.reviews : [body];
    if (rows.length === 0 || !rows[0]?.employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400, headers: corsHeaders() });
    }

    const clamp = (v: unknown) => Math.max(1, Math.min(5, Number(v) || 3));
    const saved = [];
    for (const r of rows) {
      if (!r.employeeId) continue;
      const row = await db.projectReview.upsert({
        where: { projectId_employeeId: { projectId: id, employeeId: r.employeeId } },
        create: {
          projectId: id,
          employeeId: r.employeeId,
          reviewerEmployeeId: fallbackReviewer,
          reviewType: 'post_mortem',
          deliveryQuality: clamp(r.deliveryQuality),
          communication: clamp(r.communication),
          speed: clamp(r.speed),
          overall: r.overall ? clamp(r.overall) : null,
          comments: r.comments || null,
          skillUpgradeSuggestion: r.skillUpgradeSuggestion || null,
        },
        update: {
          deliveryQuality: clamp(r.deliveryQuality),
          communication: clamp(r.communication),
          speed: clamp(r.speed),
          overall: r.overall ? clamp(r.overall) : null,
          comments: r.comments || null,
          skillUpgradeSuggestion: r.skillUpgradeSuggestion || null,
          reviewerEmployeeId: fallbackReviewer,
        },
      });
      saved.push(row);

      // Skill level upgrade prompt → notify HR admins when a new skill was delivered
      if (r.skillUpgradeSuggestion) {
        const hrUsers = await db.user.findMany({ where: { role: { in: ['hr_admin', 'admin', 'tenant_admin'] } }, select: { id: true } }).catch(() => []);
        for (const u of (hrUsers || []).slice(0, 5)) {
          const { createNotification } = await import('@/lib/notifications');
          const emp = await db.employee.findUnique({ where: { id: r.employeeId }, select: { userId: true, firstName: true, lastName: true } });
          if (u.id && emp?.userId) {
            await createNotification({
              tenantId: (decoded as any).tenantId,
              userId: u.id,
              title: 'Skill profile update suggested',
              message: `Post-mortem for "${project.name}" suggests updating ${emp.firstName} ${emp.lastName}'s master skill profile: ${r.skillUpgradeSuggestion}`,
              link: `/employees/${r.employeeId}`,
              type: 'info',
              category: 'performance',
            }).catch(() => null);
          }
        }
      }

      await notifyEmployee(db, {
        tenantId: (decoded as any).tenantId,
        employeeId: r.employeeId,
        title: 'Project feedback recorded',
        message: `The project manager recorded your delivery review for "${project.name}" — it will feed into your appraisal.`,
        link: `/performance`,
      });
    }

    await logProjectActivity(db, id, { type: 'approval', employeeId: reviewerEmployeeId, message: `Post-mortem reviews recorded for ${saved.length} team member(s).` });

    return NextResponse.json({ reviews: saved }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Post reviews error:', error);
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
