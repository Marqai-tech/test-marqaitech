import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

/**
 * POST /api/offers/[id]/submit-approval
 *
 *   Submits a draft offer for approval. Creates one OfferApproval row
 *   per level in the tenant's workflow config, then sets the Offer
 *   status to 'pending_approval'.
 *
 *   The first level's approver becomes the "current pending approver".
 *   Subsequent levels remain 'pending' until the previous level is
 *   approved (handled by POST /api/offers/approvals).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded as any).role || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can submit offers for approval' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    const userId = (decoded as any).userId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const { id: offerId } = await params;

    // Verify the offer exists and is in 'draft' status
    const offerRows = await db.$queryRawUnsafe(
      `SELECT "id", "status", "candidateName", "position", "offeredSalary" FROM "Offer" WHERE "id" = $1 LIMIT 1`,
      offerId,
    ).catch(() => []) as any[];

    if (offerRows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }
    if (offerRows[0].status !== 'draft') {
      return NextResponse.json({ error: `Offer must be in draft status to submit (current: ${offerRows[0].status})` }, { status: 400, headers: corsHeaders() });
    }

    // Load workflow config
    const wfRows = await db.$queryRawUnsafe(
      `SELECT "approvalRequired", "levels", "rules" FROM "OfferWorkflowConfig" WHERE "tenantId" = $1 LIMIT 1`,
      tenantId,
    ).catch(() => []) as any[];

    const approvalRequired = wfRows[0]?.approvalRequired ?? true;
    const levels = wfRows[0]?.levels ? safeParse(wfRows[0].levels, []) : [];

    // If approval is not required, auto-approve
    if (!approvalRequired || levels.length === 0) {
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "status" = 'approved', "approvedBy" = $2, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
        offerId, userId,
      ).catch(() => {});
      return NextResponse.json({
        success: true,
        offerId,
        status: 'approved',
        message: 'Offer auto-approved (approval not required)',
      }, { headers: corsHeaders() });
    }

    // Ensure table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfferApproval" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "offerId" TEXT NOT NULL,
        "level" INTEGER NOT NULL,
        "approverRole" TEXT NOT NULL,
        "approverUserId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "comments" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectedAt" TIMESTAMP(3),
        "dueDate" TIMESTAMP(3),
        "actedByUserId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "OfferApproval_pkey" PRIMARY KEY ("id")
      )`);
    } catch {}

    // Compute due date per level using rules.approvalReminderDays
    const rules = wfRows[0]?.rules ? safeParse(wfRows[0].rules, {}) : {};
    const reminderDays = Number(rules.approvalReminderDays) || 2;

    // Delete any prior approvals for this offer (in case of resubmission)
    await db.$executeRawUnsafe(
      `DELETE FROM "OfferApproval" WHERE "offerId" = $1 AND "tenantId" = $2`,
      offerId, tenantId,
    ).catch(() => {});

    // Create one OfferApproval row per level
    const createdApprovals: any[] = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const approvalId = `oapp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const dueDate = new Date(Date.now() + reminderDays * 86400000);
      // First level is 'pending' (actionable now); subsequent levels stay 'pending' too —
      // the approvals POST handler promotes the offer to 'approved' only when count(pending)=0.
      await db.$executeRawUnsafe(
        `INSERT INTO "OfferApproval" ("id", "tenantId", "offerId", "level", "approverRole", "approverUserId", "status", "dueDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), NOW())`,
        approvalId, tenantId, offerId,
        level.tier || (i + 1),
        level.approverType || 'hr_admin',
        level.approverUserId || null,
        dueDate,
      );
      createdApprovals.push({ id: approvalId, level: level.tier || (i + 1), approverRole: level.approverType, dueDate });
    }

    // Update offer status to pending_approval
    await db.$executeRawUnsafe(
      `UPDATE "Offer" SET "status" = 'pending_approval', "updatedAt" = NOW() WHERE "id" = $1`,
      offerId,
    ).catch(() => {});

    // Audit log
    try {
      await db.auditLog.create({
        data: { userId, action: 'OFFER_SUBMIT_APPROVAL', module: 'offers',
          details: `Submitted offer ${offerId} for approval — ${levels.length} levels` },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      offerId,
      status: 'pending_approval',
      approvals: createdApprovals,
      levels: levels.length,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Submit offer for approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
