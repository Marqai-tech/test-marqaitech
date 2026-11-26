/**
 * POST /api/candidate-portal/interviews/[id]/respond
 *
 * Candidate responds to an interview invitation (Pt 11):
 *   - confirm:    Confirm attendance (= accept — LOCKED-5 auto-cancel spares
 *                 interviews whose candidateResponse = 'confirmed')
 *   - reschedule: Request a different date/time (with reason)
 *   - withdraw:   Withdraw application
 *
 * DB routing (LOCKED-5 fix): the interview may live in a dedicated tenant DB
 * OR in the shared platform DB (deployments with no TenantDatabase rows —
 * exactly the case where every confirm 404'd before this fix). We sweep the
 * tenant registry first, then fall back to getDb(request) — the same DB the
 * candidate dashboard reads, which is why the dashboard showed the interview
 * while this endpoint could not find it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { sendConfiguredEmail } from '@/lib/configured-email';

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

type PrismaDb = { $queryRawUnsafe: (...args: any[]) => Promise<any>; $executeRawUnsafe: (...args: any[]) => Promise<any> };

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
    const body = await req.json();
    const { action, reason } = body;

    if (!['confirm', 'reschedule', 'withdraw'].includes(action)) {
      return NextResponse.json({ error: 'Action must be: confirm, reschedule, or withdraw' }, { status: 400, headers: corsHeaders() });
    }

    const candidateEmail = (decoded as any).email || '';
    const candidateResponseMap: Record<string, string> = {
      confirm: 'confirmed',
      reschedule: 'reschedule_requested',
      withdraw: 'withdrawn',
    };

    /**
     * Try to record the candidate's response in one DB handle.
     * Returns true when the interview was found and updated.
     */
    const processDb = async (db: PrismaDb, tenantId: string): Promise<boolean> => {
      // Verify this interview belongs to the candidate
      const interviewRow = await db.$queryRawUnsafe(
        `SELECT i."id", ja."candidateEmail", ja."candidateName", jp."title" AS "jobTitle"
         FROM "Interview" i
         JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
         LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
         WHERE i."id" = $1 AND LOWER(ja."candidateEmail") = LOWER($2)
         LIMIT 1`,
        id, candidateEmail,
      ).catch(() => []) as any[];

      if (!interviewRow[0]) return false;

      // Ensure candidate response columns exist
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateResponse" TEXT`);
        await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateResponseReason" TEXT`);
        await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateRespondedAt" TIMESTAMP(3)`);
      } catch {}

      // Update the interview with the candidate's response
      await db.$executeRawUnsafe(
        `UPDATE "Interview" SET "candidateResponse" = $1, "candidateResponseReason" = $2, "candidateRespondedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $3`,
        candidateResponseMap[action], reason || null, id,
      );

      // If withdraw, update JobApplication status to 'withdrawn' (not 'rejected')
      if (action === 'withdraw') {
        try {
          const appId = await db.$queryRawUnsafe(
            `SELECT "jobApplicationId" FROM "Interview" WHERE "id" = $1 LIMIT 1`, id,
          ) as any[];
          if (appId[0]?.jobApplicationId) {
            await db.$executeRawUnsafe(
              `UPDATE "JobApplication" SET "status" = 'withdrawn', "updatedAt" = NOW() WHERE "id" = $1`,
              appId[0].jobApplicationId,
            );
          }
        } catch {}
      }

      // LOCKED-5: acknowledge the candidate's action by email.
      // - confirm → "Interview Accepted — You Are Confirmed"
      // - reschedule → acknowledgement that HR will send a new slot
      try {
        if (interviewRow[0]?.candidateEmail) {
          const ackDecision = action === 'confirm' ? 'accepted — you are confirmed' : 'reschedule requested';
          await sendConfiguredEmail({
            db: db as any, tenantId,
            module: 'recruitment', eventKey: 'recruitment.interview.candidate_decision',
            to: interviewRow[0].candidateEmail,
            toName: interviewRow[0].candidateName || undefined,
            vars: {
              Decision: ackDecision,
              Reason: action === 'reschedule'
                ? `${reason ? `Reason: ${reason}. ` : ''}The HR team will contact you with a new slot. Until a new slot is accepted, the current interview may be cancelled if it is not accepted in time.`
                : '',
              Job_Title: interviewRow[0].jobTitle || 'the position',
              Portal_Url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/candidate-portal/interviews`,
            },
            entityType: 'interview', entityId: id, entityLink: '/candidate-portal/interviews',
            status: action === 'confirm' ? 'approved' : 'warning',
          }).catch(() => null);
        }
      } catch {}

      // CRITICAL FIX #4: responseLabels kept outside the try blocks so the
      // audit-log expression below can always reference it.
      const responseLabels: Record<string, string> = {
        confirm: 'confirmed attendance',
        reschedule: 'requested reschedule',
        withdraw: 'withdrawn their application',
      };

      // Notify HR about the candidate's response
      try {
        // Tenant-scoped when we know the tenant (shared-mode platform DB holds
        // users of every tenant — never notify across tenants).
        const hrUsers = tenantId
          ? await db.$queryRawUnsafe(
              `SELECT "id", "email" FROM "User"
               WHERE "role" IN ('hr_admin', 'company_hr_admin', 'admin', 'tenant_admin') AND "status" = 'active' AND "tenantId" = $1`,
              tenantId,
            ).catch(() => []) as any[]
          : await db.$queryRawUnsafe(
              `SELECT "id", "email" FROM "User"
               WHERE "role" IN ('hr_admin', 'company_hr_admin', 'admin', 'tenant_admin') AND "status" = 'active'`,
            ).catch(() => []) as any[];
        // Avoid hr@gmail.com per user instruction
        const safeHrUsers = hrUsers.filter(u => !u.email?.includes('hr@marqaitech'));

        for (const hr of safeHrUsers) {
          await createNotification({
            tenantId, userId: hr.id,
            title: `Candidate ${responseLabels[action]}`,
            message: `${interviewRow[0].candidateName || 'A candidate'} has ${responseLabels[action]} for the interview (${interviewRow[0].jobTitle || 'position'})${reason ? `. Reason: ${reason}` : ''}.`,
            type: action === 'withdraw' ? 'warning' : 'info',
            category: 'recruitment', link: '/recruitment',
          }).catch(() => null);
        }
      } catch {}

      // Audit log — responseLabels is now in scope
      try {
        await (db as any).auditLog.create({
          data: { userId: decoded.userId as string, action: `CANDIDATE_INTERVIEW_${action.toUpperCase()}`, module: 'recruitment',
            details: `Candidate ${candidateEmail} ${responseLabels[action] || action} for interview ${id}` },
        }).catch(() => null);
      } catch {}

      return true;
    };

    let updated = false;
    let resolvedTenantId = '';

    // ─── 1. Dedicated tenant DB sweep (multi-DB deployments) ─────────────
    try {
      const tenantDbs = await platformDb.tenantDatabase.findMany({
        where: { isActive: true },
        select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
      });
      for (const td of tenantDbs) {
        if (!td.connectionString || !td.tenant?.slug) continue;
        try {
          const { getDbForTenant } = await import('@/lib/tenant-db');
          const db = await getDbForTenant(td.tenant.slug);
          if (await processDb(db as unknown as PrismaDb, td.tenant.id)) {
            updated = true;
            resolvedTenantId = td.tenant.id;
            break;
          }
        } catch { /* try next tenant */ }
      }
    } catch { /* registry read failed — fall through to shared DB */ }

    // ─── 2. Shared-mode fallback (platform DB via getDb(request)) ────────
    if (!updated) {
      try {
        const sharedDb = await getDb(req);
        // In shared mode the interview's application carries the owning
        // tenantId — resolve it so notifications/emails land in the right
        // tenant context.
        let sharedTenantId = (decoded as any).tenantId || '';
        if (!sharedTenantId) {
          try {
            const tRows = await sharedDb.$queryRawUnsafe(
              `SELECT ja."tenantId" FROM "Interview" i JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId" WHERE i."id" = $1 LIMIT 1`,
              id,
            ) as any[];
            sharedTenantId = tRows[0]?.tenantId || '';
          } catch {}
        }
        if (await processDb(sharedDb as unknown as PrismaDb, sharedTenantId)) {
          updated = true;
          resolvedTenantId = sharedTenantId;
        }
      } catch { /* final failure reported below */ }
    }

    if (!updated) {
      return NextResponse.json({ error: 'Interview not found or not authorized' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ success: true, message: `Response recorded: ${candidateResponseMap[action]}`, tenantId: resolvedTenantId || undefined }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateInterviewRespond] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
