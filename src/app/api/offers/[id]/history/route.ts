import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/offers/[id]/history
 *
 * Returns the full audit timeline for a single offer:
 *   - AuditLog rows where module='offers' AND details LIKE '%<offerId>%'
 *   - OfferApproval rows (one per workflow level) showing approval status,
 *     comments, actedByUserId, approvedAt/rejectedAt
 *
 * Combined into a single sorted timeline (newest first).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId as string;
    const { id: offerId } = await params;

    // 1. Fetch AuditLog rows — search for the offerId in the details field.
    // Use ILIKE so any audit log mentioning this offer ID is returned.
    const auditRows = await db.$queryRawUnsafe(
      `SELECT a."id", a."userId", a."action", a."module", a."details", a."createdAt",
              u."name" AS "userName", u."email" AS "userEmail"
       FROM "AuditLog" a
       LEFT JOIN "User" u ON u."id" = a."userId"
       WHERE a."module" = 'offers'
         AND (a."details" ILIKE $1 OR a."details" ILIKE $2)
       ORDER BY a."createdAt" DESC
       LIMIT 200`,
      `%${offerId}%`,
      `%offer ${offerId.slice(0, 12)}%`, // catch older logs that used truncated IDs
    ).catch(() => []) as any[];

    // 2. Fetch OfferApproval rows — the per-level approval trail
    const approvalRows = await db.$queryRawUnsafe(
      `SELECT a."id", a."level", a."approverRole", a."approverUserId", a."status",
              a."comments", a."approvedAt", a."rejectedAt", a."dueDate",
              a."actedByUserId", a."createdAt", a."updatedAt",
              u."name" AS "actedByName", u."email" AS "actedByEmail"
       FROM "OfferApproval" a
       LEFT JOIN "User" u ON u."id" = a."actedByUserId"
       WHERE a."offerId" = $1
       ORDER BY a."level" ASC`,
      offerId,
    ).catch(() => []) as any[];

    // 3. Combine into a single timeline
    type TimelineEvent = {
      id: string;
      type: 'audit' | 'approval';
      action: string;
      label: string;
      user?: string;
      userEmail?: string;
      details?: string;
      comments?: string;
      level?: number;
      approverRole?: string;
      status?: string;
      timestamp: string;
    };

    const timeline: TimelineEvent[] = [];

    for (const a of auditRows) {
      timeline.push({
        id: a.id,
        type: 'audit',
        action: a.action,
        label: actionLabel(a.action),
        user: a.userName || 'System',
        userEmail: a.userEmail,
        details: a.details,
        timestamp: a.createdAt,
      });
    }

    for (const a of approvalRows) {
      timeline.push({
        id: a.id,
        type: 'approval',
        action: `LEVEL_${a.level}_${(a.status || 'pending').toUpperCase()}`,
        label: `Level ${a.level} ${approvalStatusLabel(a.status)} — ${a.approverRole}`,
        user: a.actedByName || (a.approverUserId ? 'Approver' : 'Pending'),
        userEmail: a.actedByEmail,
        comments: a.comments,
        level: a.level,
        approverRole: a.approverRole,
        status: a.status,
        timestamp: a.approvedAt || a.rejectedAt || a.createdAt,
      });
    }

    // Sort newest first
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      offerId,
      events: timeline,
      count: timeline.length,
      approvalLevels: approvalRows.length,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    CREATE_OFFER: 'Offer Created',
    UPDATE_OFFER_STATUS: 'Offer Status Updated',
    UPDATE_OFFER: 'Offer Updated',
    DELETE_OFFER: 'Offer Deleted',
    OFFER_SUBMIT_APPROVAL: 'Submitted for Approval',
    OFFER_APPROVE: 'Approved',
    OFFER_REJECT: 'Rejected',
    OFFER_SEND_BACK: 'Sent Back for Changes',
    OFFER_SEND: 'Offer Sent to Candidate',
    OFFER_ACCEPTED: 'Candidate Accepted',
    OFFER_DECLINED: 'Candidate Declined',
    OFFER_VIEWED: 'Candidate Viewed Offer',
    OFFER_DOWNLOADED: 'Candidate Downloaded PDF',
    OFFER_CANCELLED: 'Offer Cancelled',
    OFFER_CONVERTED: 'Converted to Employee',
    OFFER_PDF_GENERATED: 'PDF Generated',
    UPDATE_OFFER_PERMISSIONS: 'Permissions Updated',
    UPDATE_OFFER_WORKFLOW_CONFIG: 'Workflow Config Updated',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function approvalStatusLabel(status?: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    sent_back: 'Sent Back',
  };
  return map[status || ''] || (status || 'Unknown').replace(/_/g, ' ');
}
