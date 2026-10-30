/**
 * Public Offer Acceptance API — candidate self-service (token-based, no auth)
 *
 *   GET  /api/offers/accept/[token]   — fetch offer details for the acceptance page
 *   POST /api/offers/accept/[token]   — accept or decline
 *        body: { action: 'accept' | 'decline', signatureName?, comments? }
 *
 * The token (Offer.accessToken) is minted when HR marks the offer as 'sent'.
 * Accepting records the candidate's typed full name as an e-signature and
 * notifies tenant admins.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { sanitizeMultiLineText } from '@/lib/sanitize';

const PUBLIC_SELECT = {
  id: true,
  candidateName: true,
  candidateEmail: true,
  position: true,
  department: true,
  offeredSalary: true,
  offeredCurrency: true,
  offeredCTC: true,
  joiningDate: true,
  probationPeriod: true,
  reportingTo: true,
  status: true,
  generatedPdfUrl: true,
  sentAt: true,
  respondedAt: true,
  candidateSignature: true,
  candidateSignedAt: true,
  responseNotes: true,
};

/**
 * C-21: After loading the offer via Prisma, fetch the runtime-added
 * `offerLetterUrl` column (HR-uploaded softcopy PDF) via RAW SQL. The column
 * is added with ALTER TABLE IF NOT EXISTS at runtime, so it's not in the
 * Prisma schema. The candidate-portal offers page and this public acceptance
 * page both use this field to render a Download button when HR has uploaded
 * a softcopy.
 */
async function fetchOfferLetterUrl(db: unknown, offerId: string): Promise<string | null> {
  try {
    const rows = await (db as { $queryRawUnsafe: (sql: string, ...params: unknown[]) => Promise<Array<{ offerLetterUrl?: string | null }>> }).$queryRawUnsafe(
      `SELECT "offerLetterUrl" FROM "Offer" WHERE "id" = $1 LIMIT 1`,
      offerId,
    );
    return rows[0]?.offerLetterUrl || null;
  } catch {
    return null; // column may not exist yet
  }
}

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb(_req);
  try {
    const { token } = await params;
    const offer = await (db as any).offer?.findUnique({ where: { accessToken: token }, select: PUBLIC_SELECT });
    if (!offer) return NextResponse.json({ error: 'Offer link is invalid or has expired' }, { status: 404, headers: corsHeaders() });

    // Tenant branding
    let companyName: string | null = null;
    try {
      const company = await (db as any).company?.findFirst({ select: { name: true } });
      companyName = company?.name || null;
    } catch { /* ignore */ }

    // C-21: surface the HR-uploaded offer-letter softcopy URL (if any) so the
    // public acceptance page can render a Download button.
    const offerLetterUrl = await fetchOfferLetterUrl(db, offer.id);
    if (offerLetterUrl) {
      (offer as { offerLetterUrl?: string | null }).offerLetterUrl = offerLetterUrl;
    }

    return NextResponse.json({ offer, companyName }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Offer accept GET error:', error);
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb(req);
  try {
    const { token } = await params;
    const body = await req.json();
    const action = String(body.action || '');
    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400, headers: corsHeaders() });
    }

    const offer = await (db as any).offer?.findUnique({ where: { accessToken: token } });
    if (!offer) return NextResponse.json({ error: 'Offer link is invalid or has expired' }, { status: 404, headers: corsHeaders() });
    if (!['sent', 'approved'].includes(offer.status)) {
      return NextResponse.json({ error: `This offer can no longer be responded to (current status: ${offer.status})` }, { status: 400, headers: corsHeaders() });
    }
    if (action === 'accept' && !String(body.signatureName || '').trim()) {
      return NextResponse.json({ error: 'Please type your full name to sign the offer' }, { status: 400, headers: corsHeaders() });
    }

    // C-014 fix: Require a decline reason when declining
    if (action === 'decline' && !String(body.comments || '').trim()) {
      return NextResponse.json({ error: 'A decline reason is required. Please tell us why you are declining this offer.' }, { status: 400, headers: corsHeaders() });
    }

    // C-010 fix: Concurrency-safe update — only update if status is still 'sent' or 'approved'
    const comments = body.comments ? sanitizeMultiLineText(String(body.comments), 500) : null;
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const updateData: Record<string, unknown> = {
      status: newStatus,
      respondedAt: new Date(),
    };
    if (comments) updateData.responseNotes = comments;
    if (action === 'accept') {
      updateData.candidateSignature = sanitizeMultiLineText(String(body.signatureName).trim(), 120);
      updateData.candidateSignedAt = new Date();
      updateData.esignProvider = 'internal_self_service';
    }

    // C-010 fix: Atomic conditional update — reject if someone else already responded
    let updated;
    try {
      updated = await (db as any).offer?.updateMany({
        where: { id: offer.id, status: { in: ['sent', 'approved'] } },
        data: updateData,
      });
      if (!updated || updated.count === 0) {
        return NextResponse.json({ error: 'This offer has already been responded to. Please refresh the page.' }, { status: 409, headers: corsHeaders() });
      }
    } catch {
      // Fallback to unconditional update if updateMany not supported
      updated = await (db as any).offer.update({ where: { id: offer.id }, data: updateData });
    }

    // Task 167: if the candidate accepts, automatically set the JobApplication status to 'hired'
    if (action === 'accept') {
      try {
        // Check if the Offer has a jobApplicationId
        const offerRows = await db.$queryRawUnsafe(
          `SELECT "jobApplicationId" FROM "Offer" WHERE "id" = $1 LIMIT 1`,
          offer.id,
        ) as any[];
        const jobAppId = offerRows[0]?.jobApplicationId;
        if (jobAppId) {
          await db.$executeRawUnsafe(
            `UPDATE "JobApplication" SET "status" = 'hired', "updatedAt" = NOW() WHERE "id" = $1`,
            jobAppId,
          );
          console.log(`[Offer Accept] JobApplication ${jobAppId} status set to 'hired'`);
        }
      } catch (e) {
        console.warn('[Offer Accept] Failed to update JobApplication status to hired (non-fatal):', e instanceof Error ? e.message : e);
      }
    }

    // Notify tenant admins + HR
    try {
      const admins = await (db as any).user.findMany({
        where: { role: { in: ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'] }, status: 'active' },
        select: { id: true },
        take: 20,
      });
      const label = action === 'accept' ? 'accepted' : 'declined';
      for (const a of admins) {
        try {
          await (db as any).notification.create({
            data: {
              userId: a.id,
              title: `Offer ${label} — ${updated.candidateName}`,
              message: `${updated.candidateName} has ${label} the offer for the ${updated.position} position.${comments ? `\n\nCandidate comments: ${comments}` : ''}`,
              type: action === 'accept' ? 'success' : 'warning',
              category: 'recruitment',
              link: '/offers',
              isRead: false,
              isEmailSent: false,
            },
          }).catch(() => null);
        } catch { /* non-critical */ }
      }
    } catch { /* non-critical */ }

    // ─── Notification Center (Task 36): offer accepted → recruiter/HR + IT provisioning ───
    try {
      const { getPlatformDb } = await import('@/lib/tenant-db');
      const platformDbAcc = getPlatformDb();
      const slugAcc = _req.headers.get('x-tenant-slug') || new URL(_req.url).searchParams.get('tenant') || '';
      const tenantAcc = slugAcc ? await platformDbAcc.tenant.findUnique({ where: { slug: slugAcc }, select: { id: true } }) : null;
      if (tenantAcc?.id) {
        const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
        if (action === 'accept') {
          const hrIds = await resolveRoleRecipients(db, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
          const itIds = await resolveRoleRecipients(db, ['it_admin', 'it_support', 'admin', 'system_admin'], 10);
          await dispatchNotification({
            tenantId: tenantAcc.id,
            module: 'recruitment',
            eventKey: 'recruitment.offer.accepted',
            recipients: Array.from(new Set([...hrIds, ...itIds])).map((uid) => ({ userId: uid })),
            vars: {
              Candidate_Name: updated.candidateName || '',
              Position: updated.position || '',
              Department: updated.department || '—',
              Joining_Date: updated.joiningDate ? new Date(updated.joiningDate).toLocaleDateString('en-IN') : 'TBD',
            },
            entity: { type: 'offer', id: updated.id, link: '/offers' },
            origin: new URL(_req.url).origin,
          });
        } else {
          const hrIds = await resolveRoleRecipients(db, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
          await dispatchNotification({
            tenantId: tenantAcc.id,
            module: 'recruitment',
            eventKey: 'recruitment.offer.declined',
            recipients: hrIds.map((uid) => ({ userId: uid })),
            vars: {
              Candidate_Name: updated.candidateName || '',
              Position: updated.position || '',
              Reason: comments || '—',
            },
            entity: { type: 'offer', id: updated.id, link: '/offers' },
            origin: new URL(_req.url).origin,
          });
        }
      }
    } catch { /* non-critical */ }

    return NextResponse.json({
      message: action === 'accept' ? 'Offer accepted. Welcome aboard!' : 'Offer declined. Thank you for your response.',
      offer: {
        id: updated.id, status: updated.status, respondedAt: updated.respondedAt,
        candidateSignature: updated.candidateSignature, candidateSignedAt: updated.candidateSignedAt,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Offer accept POST error:', error);
    return NextResponse.json({ error: 'Failed to record your response' }, { status: 500, headers: corsHeaders() });
  }
}
