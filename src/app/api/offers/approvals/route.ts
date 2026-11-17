import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/offers/approvals
 *   Query: ?status=pending|approved|rejected|sent_back  (default: pending)
 *
 *   Returns the approval queue for the current user's tenant. When the
 *   caller is HR/admin, returns all pending approvals. When the caller
 *   is a non-admin approver (e.g. finance, ceo), returns only approvals
 *   where they are the assigned approver or where their role matches.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId as string;
    const role = ((decoded as any).role as string) || '';
    const userId = (decoded as any).userId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'pending';
    const offerId = url.searchParams.get('offerId');

    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];

    let sql = `SELECT a.*, o."candidateName", o."candidateEmail", o."position", o."department",
                       o."offeredSalary", o."offeredCurrency", o."joiningDate", o."status" AS "offerStatus"
                FROM "OfferApproval" a
                LEFT JOIN "Offer" o ON o."id" = a."offerId"
                WHERE a."tenantId" = $1`;
    const params: any[] = [tenantId];
    let pIdx = 2;

    if (statusFilter && statusFilter !== 'all') {
      sql += ` AND a."status" = $${pIdx++}`;
      params.push(statusFilter);
    }
    if (offerId) {
      sql += ` AND a."offerId" = $${pIdx++}`;
      params.push(offerId);
    }
    // Non-admin callers see only their own approvals (matched by role or userId)
    if (!HR_ROLES.includes(role)) {
      sql += ` AND (a."approverRole" = $${pIdx} OR a."approverUserId" = $${pIdx + 1})`;
      params.push(role, userId);
      pIdx += 2;
    }
    sql += ` ORDER BY a."createdAt" DESC LIMIT 200`;

    let rows: any[] = [];
    try {
      rows = await db.$queryRawUnsafe(sql, ...params) as any[];
    } catch (e) {
      // table doesn't exist yet — return empty
      console.warn('[Approvals GET] query failed (table may not exist):', e instanceof Error ? e.message : e);
    }

    return NextResponse.json({ approvals: rows, count: rows.length }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get approvals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * POST /api/offers/approvals
 *   Body: { approvalId, action: 'approve' | 'reject' | 'send_back', comments? }
 *
 *   Updates an OfferApproval row and:
 *     - On 'approve': marks current level approved; if it was the last
 *       pending level, marks the Offer as 'approved' (ready to send).
 *     - On 'reject': marks current level rejected; sets Offer status
 *       to 'rejected'.
 *     - On 'send_back': marks current level as 'sent_back' (returns
 *       to HR for revision); sets Offer status back to 'draft'.
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId as string;
    const userId = (decoded as any).userId as string;
    const role = ((decoded as any).role as string) || '';
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const { approvalId, action, comments } = body;
    if (!approvalId || !action) {
      return NextResponse.json({ error: 'approvalId and action are required' }, { status: 400, headers: corsHeaders() });
    }
    if (!['approve', 'reject', 'send_back'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject, or send_back' }, { status: 400, headers: corsHeaders() });
    }
    if ((action === 'reject' || action === 'send_back') && !comments?.trim()) {
      return NextResponse.json({ error: 'comments are required when rejecting or sending back' }, { status: 400, headers: corsHeaders() });
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

    // Fetch the approval row
    const rows = await db.$queryRawUnsafe(
      `SELECT * FROM "OfferApproval" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
      approvalId, tenantId,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Approval record not found' }, { status: 404, headers: corsHeaders() });
    }

    const approval = rows[0];
    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `This approval has already been ${approval.status}` }, { status: 409, headers: corsHeaders() });
    }

    // Permission check: caller must match the assigned approver role or userId
    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];
    const isAssigned = approval.approverUserId === userId || approval.approverRole === role || HR_ROLES.includes(role);
    if (!isAssigned) {
      return NextResponse.json({ error: 'You are not authorized to act on this approval' }, { status: 403, headers: corsHeaders() });
    }

    // Update the approval row
    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'sent_back';
    const tsCol = action === 'approve' ? '"approvedAt"' : '"rejectedAt"';
    await db.$executeRawUnsafe(
      `UPDATE "OfferApproval" SET "status" = $3, "comments" = $4, ${tsCol} = NOW(), "actedByUserId" = $5, "updatedAt" = NOW()
       WHERE "id" = $1 AND "tenantId" = $2`,
      approvalId, tenantId, newStatus, comments || null, userId,
    );

    // Update the Offer status based on action
    if (action === 'approve') {
      // Check if there are more pending approvals for this offer
      const pending = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "count" FROM "OfferApproval"
         WHERE "offerId" = $1 AND "tenantId" = $2 AND "status" = 'pending'`,
        approval.offerId, tenantId,
      ).catch(() => [{ count: 0 }]) as any[];

      const pendingCount = pending[0]?.count || 0;
      const newOfferStatus = pendingCount === 0 ? 'approved' : 'pending_approval';
      // FIX: previously passed 3 args ($1, $2, $3) but the SQL only had $1 and $3.
      // Prisma's $executeRawUnsafe positional params must be contiguous starting
      // at $1 — when we skip $2 the call silently no-ops. Use only 2 params here.
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "status" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
        approval.offerId, newOfferStatus,
      ).catch((e) => {
        console.warn('[Approvals POST] Failed to update offer status to', newOfferStatus, ':', e instanceof Error ? e.message : e);
      });
    } else if (action === 'reject') {
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "status" = 'rejected', "updatedAt" = NOW() WHERE "id" = $1`,
        approval.offerId,
      ).catch(() => {});
    } else if (action === 'send_back') {
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "status" = 'draft', "updatedAt" = NOW() WHERE "id" = $1`,
        approval.offerId,
      ).catch(() => {});
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId,
          action: `OFFER_${action.toUpperCase()}`,
          module: 'offers',
          details: `${action} offer ${approval.offerId} at level ${approval.level}${comments ? ` — ${comments}` : ''}`,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      approvalId,
      action,
      newStatus,
      offerId: approval.offerId,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Approve/reject offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
