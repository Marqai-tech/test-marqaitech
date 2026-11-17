import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced, withSchemaSync } from '@/lib/schema-sync';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/referrals/[id]
 *
 * Returns the full detail of a single referral. The caller must be
 * the referral's referrer OR a super_admin / hr_admin / tenant_admin
 * (HR needs to manage referral payouts).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(req);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const db = await getDb(req);
    await ensureSchemaSynced();

    const { id } = await params;

    const referral = await withSchemaSync(() =>
      db.referral.findUnique({
        where: { id },
        include: {
          jobPosting: {
            select: { id: true, title: true, location: true, type: true, status: true },
          },
          referrerEmployee: {
            select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
          },
        },
      })
    );

    if (!referral) {
      return NextResponse.json(
        { error: 'Referral not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Authorization: referrer or HR/admin roles only.
    const role = String(decoded.role || '').toLowerCase();
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(role);
    // Need to look up the employee for this user to compare IDs.
    const callerEmployee = await db.employee.findFirst({
      where: { userId: decoded.userId as string },
      select: { id: true },
    });
    const isOwner = callerEmployee?.id === referral.referrerEmployeeId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to view this referral' },
        { status: 403, headers: corsHeaders() }
      );
    }

    return NextResponse.json({ referral }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Referral GET [id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * PATCH /api/referrals/[id]
 *
 * Updates a referral's status and/or bonus fields. Used by HR/Admins
 * to advance referrals through the funnel:
 *   pending → applied → interviewed → offered → hired → bonus_paid
 *
 * Body (any subset of):
 *   - status: string
 *   - bonusAmount: number
 *   - bonusCurrency: string
 *   - hiredAt: ISO string (auto-set when status → 'hired')
 *   - bonusPaidAt: ISO string (auto-set when status → 'bonus_paid')
 *   - notes: string
 *
 * Authorization: referrer (limited fields: notes only) or HR/admin (full).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(req);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const db = await getDb(req);
    await ensureSchemaSynced();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await withSchemaSync(() =>
      db.referral.findUnique({
        where: { id },
        select: {
          id: true,
          referrerEmployeeId: true,
          status: true,
          hiredAt: true,
          bonusPaidAt: true,
          bonusAmount: true,
          bonusCurrency: true,
        },
      })
    );
    if (!existing) {
      return NextResponse.json(
        { error: 'Referral not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const role = String(decoded.role || '').toLowerCase();
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(role);
    const callerEmployee = await db.employee.findFirst({
      where: { userId: decoded.userId as string },
      select: { id: true },
    });
    const isOwner = callerEmployee?.id === existing.referrerEmployeeId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to update this referral' },
        { status: 403, headers: corsHeaders() }
      );
    }

    const VALID_STATUSES = [
      'pending',
      'applied',
      'interviewed',
      'offered',
      'hired',
      'rejected',
      'bonus_paid',
    ];

    // Build the update payload defensively — only accept fields the
    // caller is allowed to touch.
    const data: Record<string, unknown> = {};

    if (typeof body.notes === 'string') {
      data.notes = body.notes;
    }

    // Status transitions + bonus fields are HR/admin-only. Employees
    // can edit notes on their own referrals but not advance the status
    // (would let them mark their own referrals as 'bonus_paid').
    if (isAdmin) {
      if (typeof body.status === 'string') {
        if (!VALID_STATUSES.includes(body.status)) {
          return NextResponse.json(
            { error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}` },
            { status: 400, headers: corsHeaders() }
          );
        }
        data.status = body.status;

        // Auto-set lifecycle timestamps when crossing into hired/bonus_paid.
        if (body.status === 'hired' && !existing.hiredAt) {
          data.hiredAt = new Date();
        }
        // C-23: auto-set bonus to 5000 when marking as hired (if not already set)
        if (body.status === 'hired' && (existing.bonusAmount === null || existing.bonusAmount === undefined)) {
          data.bonusAmount = 5000;
          data.bonusCurrency = 'INR';
        }
        if (body.status === 'bonus_paid' && !existing.bonusPaidAt) {
          data.bonusPaidAt = new Date();
        }
      }

      if (body.bonusAmount !== undefined && body.bonusAmount !== null && body.bonusAmount !== '') {
        const parsed = typeof body.bonusAmount === 'number'
          ? body.bonusAmount
          : parseFloat(String(body.bonusAmount));
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
          return NextResponse.json(
            { error: 'bonusAmount must be a finite number' },
            { status: 400, headers: corsHeaders() }
          );
        }
        data.bonusAmount = parsed;
      }

      if (typeof body.bonusCurrency === 'string' && body.bonusCurrency.trim()) {
        data.bonusCurrency = body.bonusCurrency.trim().toUpperCase();
      }

      if (body.hiredAt !== undefined) {
        data.hiredAt = body.hiredAt ? new Date(body.hiredAt) : null;
      }
      if (body.bonusPaidAt !== undefined) {
        data.bonusPaidAt = body.bonusPaidAt ? new Date(body.bonusPaidAt) : null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields supplied' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const updated = await withSchemaSync(() =>
      db.referral.update({
        where: { id },
        data,
        include: {
          jobPosting: { select: { id: true, title: true } },
          referrerEmployee: {
            select: { id: true, firstName: true, lastName: true, employeeId: true },
          },
        },
      })
    );

    // Best-effort audit log.
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'UPDATE_REFERRAL',
          module: 'referrals',
          details: `Updated referral ${id}: ${Object.keys(data).join(', ')}`,
        },
      });
    } catch {
      // Non-fatal
    }

    // GAP FIX #3: Notify the referring employee when their referral status changes
    try {
      if (decoded.tenantId && updated.referrerEmployee?.id) {
        // Find the user linked to the referring employee
        const referrerUser = await db.user.findFirst({
          where: { employeeId: updated.referrerEmployee.id, status: 'active' },
          select: { id: true, email: true },
        }).catch(() => null);

        if (referrerUser) {
          const { dispatchNotification } = await import('@/lib/notification-center');
          const isHired = updated.status === 'hired';
          await dispatchNotification({
            tenantId: decoded.tenantId as string,
            module: 'recruitment',
            eventKey: isHired ? 'recruitment.referral.hired' : 'recruitment.referral.status_changed',
            recipients: [{ userId: referrerUser.id }],
            vars: {
              Referrer_Name: `${updated.referrerEmployee?.firstName || ''} ${updated.referrerEmployee?.lastName || ''}`.trim(),
              Candidate_Name: updated.candidateName,
              Job_Title: updated.jobPosting?.title || 'a position',
              Status: updated.status,
            },
            entity: { type: 'referral', id: updated.id, link: '/referrals' },
          }).catch(() => null);
        }
      }
    } catch { /* non-fatal */ }

    // C-23: Send candidate email when HR directly changes the referral status.
    // - On reject: candidate gets a rejection email.
    // - On shortlist (interviewed from pending): candidate gets a shortlist
    //   email with the apply link (trackable referral URL → /careers).
    if (isAdmin && body.status && body.status !== existing.status) {
      try {
        const { sendEmail } = await import('@/lib/email');
        const { sendTenantEmail } = await import('@/lib/notification-channels');
        const origin = (() => { try { return new URL(req.url).origin; } catch { return ''; } })();
        const candidateEmail = updated.candidateEmail;
        const candidateName = updated.candidateName;
        const jobTitle = updated.jobPosting?.title || 'the position';

        if (body.status === 'rejected' && candidateEmail) {
          const subject = `Application Update — ${candidateName} — ${jobTitle}`;
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#ef4444;">Application Update</h2>
            <p>Dear ${candidateName},</p>
            <p>Thank you for your interest in the <strong>${jobTitle}</strong> position and for applying through our referral program.</p>
            <p>While we appreciate your time, we are unable to proceed with your application at this time.</p>
            <p>We wish you the best in your job search.</p>
            <p>Regards,<br/>HR Team</p>
          </div>`;
          let sent = false;
          try { const r = await sendEmail({ to: candidateEmail, subject, html }); sent = r.success; } catch {}
          if (!sent) { try { await sendTenantEmail(db, String(decoded.tenantId || ''), { to: candidateEmail, subject, html }); } catch {} }
          console.log(`[Referral PATCH] Rejection email to ${candidateEmail}: ${sent ? 'SENT' : 'FAILED'}`);
        }

        if (body.status === 'interviewed' && existing.status === 'pending' && candidateEmail) {
          const applyUrl = `${origin}/api/referrals/track/${updated.trackToken}`;
          const subject = `You've been shortlisted: ${candidateName} — ${jobTitle}`;
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#10b981;">You've been shortlisted!</h2>
            <p>Dear ${candidateName},</p>
            <p>Good news! You have been shortlisted for the <strong>${jobTitle}</strong> position through our employee referral program.</p>
            <p>To proceed with your application, please click the link below to formally apply and create your candidate portal account:</p>
            <p><a href="${applyUrl}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Apply Now</a></p>
            <p>Regards,<br/>HR Team</p>
          </div>`;
          let sent = false;
          try { const r = await sendEmail({ to: candidateEmail, subject, html }); sent = r.success; } catch {}
          if (!sent) { try { await sendTenantEmail(db, String(decoded.tenantId || ''), { to: candidateEmail, subject, html }); } catch {} }
          console.log(`[Referral PATCH] Shortlist+apply email to ${candidateEmail}: ${sent ? 'SENT' : 'FAILED'}`);
        }
      } catch (e) {
        console.warn('[Referral PATCH] Candidate email failed (non-fatal):', e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ referral: updated }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Referral PATCH [id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * DELETE /api/referrals/[id]
 *
 * Soft delete is NOT implemented on the Referral model — we hard-delete.
 * Only the referrer (while status='pending') or HR/admin may delete.
 * Once a referral has advanced past 'pending', only admins can delete it
 * (audit/compliance reasons — you don't want a referrer deleting a record
 * that's tied to a payout).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(req);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const db = await getDb(req);
    await ensureSchemaSynced();

    const { id } = await params;

    const existing = await withSchemaSync(() =>
      db.referral.findUnique({
        where: { id },
        select: { id: true, referrerEmployeeId: true, status: true },
      })
    );
    if (!existing) {
      return NextResponse.json(
        { error: 'Referral not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const role = String(decoded.role || '').toLowerCase();
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(role);
    const callerEmployee = await db.employee.findFirst({
      where: { userId: decoded.userId as string },
      select: { id: true },
    });
    const isOwner = callerEmployee?.id === existing.referrerEmployeeId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this referral' },
        { status: 403, headers: corsHeaders() }
      );
    }

    // Employees may only delete their OWN referrals that are still pending.
    if (isOwner && !isAdmin && existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'You can only delete referrals that are still pending. Contact HR to remove advanced referrals.' },
        { status: 400, headers: corsHeaders() }
      );
    }

    await withSchemaSync(() => db.referral.delete({ where: { id } }));

    // Best-effort audit log.
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'DELETE_REFERRAL',
          module: 'referrals',
          details: `Deleted referral ${id} (was status=${existing.status})`,
        },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json(
      { success: true, id },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Referral DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
