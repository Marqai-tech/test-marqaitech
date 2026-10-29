/**
 * POST /api/candidate-portal/applications/[id]/withdraw
 *
 * GAP FIX #4: Candidate self-withdrawal endpoint — allows a candidate to
 * withdraw their own job application from the candidate portal.
 * Sets JobApplication.status to 'withdrawn' and notifies HR.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body;
    const candidateEmail = (decoded as any).email || '';

    // Sweep tenant DBs to find the application
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
    });

    let updated = false;
    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);

        // Verify this application belongs to the candidate
        const appRow = await db.$queryRawUnsafe(
          `SELECT "id", "candidateName", "candidateEmail", "status", "jobPostingId"
           FROM "JobApplication" WHERE "id" = $1 AND LOWER("candidateEmail") = LOWER($2) LIMIT 1`,
          id, candidateEmail,
        ).catch(() => []) as any[];

        if (!appRow[0]) continue;

        // Update status to 'withdrawn'
        await db.$executeRawUnsafe(
          `UPDATE "JobApplication" SET "status" = 'withdrawn', "updatedAt" = NOW() WHERE "id" = $1`,
          id,
        );

        // Notify HR about the withdrawal
        try {
          const hrUsers = await db.user.findMany({
            where: { role: { in: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'] }, status: 'active', tenantId: td.tenant.id },
            select: { id: true, email: true },
          }).catch(() => []);
          // Avoid hr@marqaitech.com per user instruction
          const safeHrUsers = hrUsers.filter(u => !u.email?.includes('hr@marqaitech'));

          for (const hr of safeHrUsers) {
            await createNotification({
              tenantId: td.tenant.id, userId: hr.id,
              title: 'Candidate Withdrawn Application',
              message: `${appRow[0].candidateName} has withdrawn their application. Reason: ${reason || 'No reason provided'}.`,
              type: 'warning', category: 'recruitment', link: '/recruitment',
            }).catch(() => null);
          }
        } catch {}

        // Audit log
        await db.auditLog.create({
          data: { userId: decoded.userId as string, action: 'CANDIDATE_WITHDREW_APPLICATION', module: 'recruitment',
            details: `Candidate ${candidateEmail} withdrew application ${id}. Reason: ${reason || 'N/A'}` },
        }).catch(() => null);

        updated = true;
        break;
      } catch { /* try next tenant */ }
    }

    if (!updated) {
      return NextResponse.json({ error: 'Application not found or not authorized' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ success: true, message: 'Application withdrawn successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateWithdraw] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
