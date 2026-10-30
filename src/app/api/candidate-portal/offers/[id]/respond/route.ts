/**
 * Candidate Portal: Respond to an Offer
 *
 * POST /api/candidate-portal/offers/[id]/respond
 *
 * Body: { action: 'accept' | 'decline', signatureName?, comments?, signedCopyDataUrl? }
 *
 * The candidate is identified by their JWT email (decoded.email). The Offer
 * must exist AND its candidateEmail must match the JWT email — otherwise 403.
 * This prevents a candidate from accepting an offer that belongs to someone
 * else by guessing the offer id.
 *
 * On accept:
 *   - signatureName is REQUIRED (typed full name as e-signature)
 *   - signedCopyDataUrl is OPTIONAL — a base64 data URL of the signed offer
 *     letter the candidate uploaded. Stored on offer.signedPdfUrl.
 *   - offer.status → 'accepted'
 *   - offer.candidateSignature = signatureName
 *   - offer.candidateSignedAt = NOW()
 *   - offer.respondedAt = NOW()
 *   - offer.responseNotes = comments (if provided)
 *   - HR team notified via Notification Center (recruitment.offer.accepted)
 *   - JobApplication auto-flipped to 'hired' if offer is linked to one
 *
 * On decline:
 *   - comments are REQUIRED (per spec: decline must include a reason)
 *   - offer.status → 'rejected'
 *   - offer.respondedAt = NOW()
 *   - offer.responseNotes = comments
 *   - HR team notified (recruitment.offer.declined)
 *
 * Concurrency-safe: uses updateMany with a status guard so two simultaneous
 * responses can't both succeed (the second gets a 409).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { sanitizeMultiLineText } from '@/lib/sanitize';

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
    const { id } = await params;
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const candidateEmail = (decoded as Record<string, unknown>).email as string | undefined;
    if (!candidateEmail) {
      return NextResponse.json({ error: 'Candidate email not found in session' }, { status: 400, headers: corsHeaders() });
    }

    const body = await req.json();
    const { action, signatureName, comments, signedCopyDataUrl } = body;
    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'accept' && !String(signatureName || '').trim()) {
      return NextResponse.json({ error: 'Please type your full name to e-sign the offer.' }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'decline' && !String(comments || '').trim()) {
      return NextResponse.json({ error: 'A reason is required to decline the offer.' }, { status: 400, headers: corsHeaders() });
    }

    // Find the offer across all tenant DBs (offers live in the tenant DB).
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
    });

    let foundDb: unknown = null;
    let foundTenantId: string | null = null;
    let foundOffer: { id: string; candidateEmail: string; candidateName: string; position: string; status: string; jobApplicationId: string | null } | null = null;
    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);
        const rows = await db.$queryRawUnsafe(
          `SELECT "id", "candidateEmail", "candidateName", "position", "status", "jobApplicationId"
             FROM "Offer" WHERE "id" = $1 LIMIT 1`,
          id,
        ) as Array<{ id: string; candidateEmail: string; candidateName: string; position: string; status: string; jobApplicationId: string | null }>;
        if (rows[0]) {
          // Verify the offer belongs to THIS candidate (case-insensitive email match).
          if (!rows[0].candidateEmail || String(rows[0].candidateEmail).toLowerCase() !== String(candidateEmail).toLowerCase()) {
            return NextResponse.json({ error: 'This offer does not belong to your account.' }, { status: 403, headers: corsHeaders() });
          }
          foundDb = db;
          foundTenantId = td.tenant?.id || null;
          foundOffer = rows[0];
          break;
        }
      } catch { /* try next tenant */ }
    }

    if (!foundDb || !foundOffer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    // Status guard — only 'sent' (or 'approved' as a fallback) offers can be responded to.
    if (!['sent', 'approved'].includes(foundOffer.status)) {
      return NextResponse.json(
        { error: `This offer can no longer be responded to (current status: ${foundOffer.status}).` },
        { status: 400, headers: corsHeaders() },
      );
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const safeSignature = action === 'accept' ? sanitizeMultiLineText(String(signatureName).trim(), 120) : null;
    const safeComments = comments ? sanitizeMultiLineText(String(comments), 500) : null;
    const safeSignedCopy = (action === 'accept' && typeof signedCopyDataUrl === 'string' && signedCopyDataUrl.startsWith('data:'))
      ? signedCopyDataUrl.slice(0, 5 * 1024 * 1024) // cap at 5MB
      : null;

    // Atomic conditional update — reject if someone else already responded.
    let updated: Record<string, unknown>;
    type DbLike = {
      offer: {
        updateMany: (args: { where: { id: string; status: { in: string[] } }; data: Record<string, unknown> }) => Promise<{ count: number }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      };
    };
    const dbLike = foundDb as DbLike;
    try {
      const result = await dbLike.offer.updateMany({
        where: { id, status: { in: ['sent', 'approved'] } },
        data: {
          status: newStatus,
          respondedAt: new Date(),
          responseNotes: safeComments,
          ...(action === 'accept'
            ? {
                candidateSignature: safeSignature,
                candidateSignedAt: new Date(),
                ...(safeSignedCopy ? { signedPdfUrl: safeSignedCopy } : {}),
              }
            : {}),
        },
      });
      if (!result || result.count === 0) {
        return NextResponse.json(
          { error: 'This offer has already been responded to. Please refresh the page.' },
          { status: 409, headers: corsHeaders() },
        );
      }
      updated = { ...foundOffer, status: newStatus, respondedAt: new Date().toISOString() };
    } catch {
      // Fallback to unconditional update if updateMany not supported
      updated = await dbLike.offer.update({
        where: { id },
        data: {
          status: newStatus,
          respondedAt: new Date(),
          responseNotes: safeComments,
          ...(action === 'accept'
            ? { candidateSignature: safeSignature, candidateSignedAt: new Date(), ...(safeSignedCopy ? { signedPdfUrl: safeSignedCopy } : {}) }
            : {}),
        },
      });
    }

    // Auto-flip JobApplication to 'hired' on accept (if linked).
    if (action === 'accept' && foundOffer.jobApplicationId) {
      try {
        await (foundDb as { $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
          `UPDATE "JobApplication" SET "status" = 'hired', "updatedAt" = NOW() WHERE "id" = $1`,
          foundOffer.jobApplicationId,
        );
      } catch { /* non-fatal */ }
    }

    // Audit log
    try {
      await (foundDb as { auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).auditLog.create({
        data: {
          userId: null, // candidate-side action; no User id in tenant DB
          action: `OFFER_${action.toUpperCase()}_BY_CANDIDATE`,
          module: 'offers',
          details: `Candidate ${candidateEmail} ${action}ed offer ${id} via candidate portal.${safeComments ? ` Reason: ${safeComments}` : ''}`,
        },
      });
    } catch { /* non-fatal */ }

    // Notify HR team via Notification Center.
    if (foundTenantId) {
      try {
        const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
        const dbCasted = foundDb as Parameters<typeof resolveRoleRecipients>[0];
        const hrIds = await resolveRoleRecipients(dbCasted, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
        if (action === 'accept') {
          const itIds = await resolveRoleRecipients(dbCasted, ['it_admin', 'it_support', 'admin', 'system_admin'], 10);
          const recipients = Array.from(new Set([...hrIds, ...itIds])).map((uid) => ({ userId: uid }));
          await dispatchNotification({
            tenantId: foundTenantId,
            module: 'recruitment',
            eventKey: 'recruitment.offer.accepted',
            recipients,
            vars: {
              Candidate_Name: foundOffer.candidateName || '',
              Position: foundOffer.position || '',
            },
            entity: { type: 'offer', id, link: '/offers' },
          });
        } else {
          await dispatchNotification({
            tenantId: foundTenantId,
            module: 'recruitment',
            eventKey: 'recruitment.offer.declined',
            recipients: hrIds.map((uid) => ({ userId: uid })),
            vars: {
              Candidate_Name: foundOffer.candidateName || '',
              Position: foundOffer.position || '',
              Reason: safeComments || '—',
            },
            entity: { type: 'offer', id, link: '/offers' },
          });
        }
      } catch (e) {
        console.warn('[CandidateOffers POST] notification-center dispatch failed (non-fatal):', (e as Error).message);
      }
    }

    return NextResponse.json({
      message: action === 'accept' ? 'Offer accepted successfully!' : 'Offer declined. Thank you for your response.',
      offer: { id: updated.id, status: updated.status, respondedAt: updated.respondedAt },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateOffers POST] error:', error);
    return NextResponse.json({ error: 'Failed to record your response' }, { status: 500, headers: corsHeaders() });
  }
}
