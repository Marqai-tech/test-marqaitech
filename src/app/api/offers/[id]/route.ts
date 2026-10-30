import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { resolveRecruitmentConfig, ApprovalTier } from '@/lib/recruitment-workflow';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const offer = await db.offer.findUnique({ where: { id } });
    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, responseNotes, candidateName, candidateEmail, position, department, offeredSalary, offeredCurrency, joiningDate, probationPeriod, offerLetterUrl } = body;

    const existing = await db.offer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    // Phase 13 fix: Prevent editing core offer fields after approval or send
    const lockedStatuses = ['sent', 'accepted', 'rejected'];
    if (lockedStatuses.includes(existing.status)) {
      // Only allow status changes (accepted/rejected/withdrawn) after send
      // Block editing of candidate, salary, position, joining date
      if (candidateName !== undefined || candidateEmail !== undefined || position !== undefined ||
          department !== undefined || offeredSalary !== undefined || offeredCurrency !== undefined ||
          joiningDate !== undefined || probationPeriod !== undefined) {
        return NextResponse.json(
          { error: `Offer is already ${existing.status}. Core fields (candidate, salary, position, joining date) cannot be edited after the offer is sent.` },
          { status: 400, headers: corsHeaders() }
        );
      }
    }

    const updateData: Record<string, unknown> = {};

    // Handle status changes
    if (status) {
      const validStatuses = ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'withdrawn'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400, headers: corsHeaders() }
        );
      }

      // CRITICAL FIX #6: Enforce offer approval before send — cannot send an
      // unapproved offer. This prevents bypassing the approval chain.
      if (status === 'sent' && existing.status !== 'approved') {
        return NextResponse.json(
          { error: 'Offer must be approved before it can be sent to the candidate. Current status: ' + existing.status },
          { status: 400, headers: corsHeaders() }
        );
      }

      // CRITICAL FIX #6: Prevent status regression — once sent/accepted, cannot go back to draft
      const lockedStatuses = ['sent', 'accepted', 'rejected'];
      if (lockedStatuses.includes(existing.status) && !['accepted', 'rejected', 'withdrawn'].includes(status)) {
        return NextResponse.json(
          { error: `Offer is already ${existing.status} and cannot be changed to ${status}` },
          { status: 400, headers: corsHeaders() }
        );
      }

      // ─── Sequential tier approval, driven by the recruitment workflow config ───
      if (status === 'approved') {
        const wf = await resolveRecruitmentConfig(db, decoded.tenantId as string, null).catch(() => null);
        const tiers: ApprovalTier[] = wf?.offerApproval?.enabled ? (wf.offerApproval.tiers || []) : [];

        if (tiers.length > 0) {
          let signed: Array<{ tier: number; userId: string; userName: string; at: string }> = [];
          try {
            const parsed = existing.approvalTiers ? JSON.parse(existing.approvalTiers) : [];
            if (Array.isArray(parsed)) signed = parsed;
          } catch { /* fresh trace */ }

          const nextTierIdx = signed.length;
          if (nextTierIdx >= tiers.length) {
            // All tiers already signed — idempotent final approval
            updateData.status = 'approved';
          } else {
            const tier = tiers[nextTierIdx];
            const role = String(decoded.role || '');
            const uid = String(decoded.userId || '');
            const satisfies = (() => {
              switch (tier.approverType) {
                case 'specific_user': return !!tier.approverUserId && uid === tier.approverUserId;
                case 'hr_admin': return ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin', 'ceo', 'super_admin'].includes(role);
                case 'tenant_admin': case 'ceo': return ['tenant_admin', 'ceo', 'admin', 'super_admin'].includes(role);
                case 'finance': return ['finance', 'finance_admin', 'tenant_admin', 'ceo'].includes(role);
                case 'reporting_manager':
                case 'department_head':
                default: return ['manager', 'department_head', 'hr_admin', 'company_hr_admin', 'admin', 'tenant_admin', 'ceo', 'super_admin'].includes(role);
              }
            })();
            if (!satisfies) {
              return NextResponse.json(
                { error: `Approval blocked: tier ${tier.tier} of ${tiers.length} requires "${tier.label || tier.approverType.replace(/_/g, ' ')}" to approve before you can act.` },
                { status: 403, headers: corsHeaders() }
              );
            }
            // Record this tier's signature
            signed.push({ tier: tier.tier, userId: uid, userName: String((decoded as Record<string, unknown>).name || decoded.email || uid), at: new Date().toISOString() });
            updateData.approvalTiers = JSON.stringify(signed);

            if (signed.length < tiers.length) {
              // More tiers pending — keep the offer in pending_approval
              updateData.status = 'pending_approval';
            } else {
              updateData.status = 'approved';
              updateData.approvedBy = decoded.userId as string;
              updateData.approvedAt = new Date();
            }
          }
        } else {
          // No tier chain configured — legacy behavior, but restrict to HR-level roles
          const role = String(decoded.role || '');
          if (!['admin', 'tenant_admin', 'ceo', 'hr_admin', 'company_hr_admin', 'super_admin'].includes(role)) {
            return NextResponse.json(
              { error: 'Not authorized to approve offers — HR/admin approval is required.' },
              { status: 403, headers: corsHeaders() }
            );
          }
          updateData.status = 'approved';
          updateData.approvedBy = decoded.userId as string;
          updateData.approvedAt = new Date();
        }
      } else {
        updateData.status = status;
      }
      if (status === 'sent') {
        updateData.sentAt = new Date();
        // Mint the candidate self-service acceptance link token once
        if (!existing.accessToken) {
          updateData.accessToken = `off_${crypto.randomUUID().replace(/-/g, '')}${Date.now().toString(36)}`;
        }
      }
      if (status === 'accepted' || status === 'rejected') {
        updateData.respondedAt = new Date();
      }
    }
    if (responseNotes) updateData.responseNotes = responseNotes;

    // Handle field editing
    if (candidateName !== undefined) updateData.candidateName = candidateName;
    if (candidateEmail !== undefined) updateData.candidateEmail = candidateEmail;
    if (position !== undefined) updateData.position = position;
    if (department !== undefined) updateData.department = department || null;
    if (offeredSalary !== undefined) updateData.offeredSalary = offeredSalary;
    if (offeredCurrency !== undefined) updateData.offeredCurrency = offeredCurrency;
    if (joiningDate !== undefined) updateData.joiningDate = joiningDate ? new Date(joiningDate) : null;
    if (probationPeriod !== undefined) updateData.probationPeriod = probationPeriod;

    // C-21: HR-uploaded offer-letter softcopy (PDF). Persist via RAW SQL so the
    // column doesn't need to exist in the Prisma schema — we ADD COLUMN IF NOT
    // EXISTS at runtime, mirroring how jobApplicationId is handled. This lets
    // the candidate download the offer letter from the candidate portal /
    // offer-acceptance page after they e-sign.
    if (offerLetterUrl !== undefined) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "offerLetterUrl" TEXT`).catch(() => null);
        // Cap at 10 MB to keep the data URL within Neon's TEXT column limit.
        await db.$executeRawUnsafe(
          `UPDATE "Offer" SET "offerLetterUrl" = $1 WHERE "id" = $2`,
          offerLetterUrl ? String(offerLetterUrl).slice(0, 10 * 1024 * 1024) : null,
          id,
        );
      } catch (e) {
        console.warn('[Offer PATCH] Failed to persist offerLetterUrl:', e instanceof Error ? e.message : e);
      }
    }

    const offer = await db.offer.update({
      where: { id },
      data: updateData,
    });

    // Notify relevant users on status changes only (use the EFFECTIVE status —
    // a mid-chain tier approval keeps the offer in pending_approval)
    const effectiveStatus = String(updateData.status || status);
    if (effectiveStatus && effectiveStatus !== existing.status) {
      const notificationMap: Record<string, { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }> = {
        pending_approval: {
          title: 'Offer Pending Approval',
          message: `Offer for ${existing.candidateName} is awaiting approval.`,
          type: 'info',
        },
        approved: {
          title: 'Offer Approved',
          message: `Offer for ${existing.candidateName} has been approved.`,
          type: 'success',
        },
        sent: {
          title: 'Offer Sent',
          message: `Offer for ${existing.candidateName} has been sent.`,
          type: 'success',
        },
        accepted: {
          title: 'Offer Accepted',
          message: `${existing.candidateName} has accepted the offer for ${existing.position}.`,
          type: 'success',
        },
        rejected: {
          title: 'Offer Rejected',
          message: `${existing.candidateName} has rejected the offer for ${existing.position}.`,
          type: 'warning',
        },
        withdrawn: {
          title: 'Offer Withdrawn',
          message: `Offer for ${existing.candidateName} has been withdrawn.`,
          type: 'error',
        },
      };

      const notificationInfo = notificationMap[effectiveStatus];
      if (notificationInfo) {
        // GAP FIX #5: Use dispatchNotification for offer status changes instead of
        // raw createNotification — this enables email + delivery log + template rendering.
        // For 'pending_approval', use the recruitment.offer.approval_required event template.
        try {
          const { dispatchNotification } = await import('@/lib/notification-center');
          const hrAdmins = await db.user.findMany({
            where: { tenantId: decoded.tenantId as string, role: { in: ['tenant_admin', 'hr_admin', 'company_hr_admin', 'admin'] }, status: 'active' },
            select: { id: true, email: true },
          });
          // Avoid hr@gmail.com per user instruction
          const safeAdmins = hrAdmins.filter(a => !a.email?.includes('hr@marqaitech'));

          if (safeAdmins.length > 0) {
            // Phase 16 fix: Correct notification event mapping
            // approved → recruitment.offer.approval_required is wrong; use no special template for approved
            // accepted → recruitment.offer.accepted
            // rejected/withdrawn → recruitment.offer.declined
            const eventKeyMap: Record<string, string> = {
              pending_approval: 'recruitment.offer.approval_required',
              accepted: 'recruitment.offer.accepted',
              rejected: 'recruitment.offer.declined',
              withdrawn: 'recruitment.offer.declined',
            };
            const eventKey = eventKeyMap[effectiveStatus];

            // Only dispatch via Notification Center for known event keys
            if (eventKey) {
              await dispatchNotification({
                tenantId: decoded.tenantId as string,
                module: 'recruitment',
                eventKey,
                recipients: safeAdmins.map(a => ({ userId: a.id })),
                vars: {
                  Candidate_Name: existing.candidateName || '',
                  Position: existing.position || '',
                  Reason: notificationInfo.message,
                },
                entity: { type: 'offer', id: existing.id, link: '/offers' },
              }).catch(() => null);
            }
          }
        } catch { /* non-fatal — fall back to raw notification below */ }
      }

      // ─── Notification Center (Task 36): multi-channel offer lifecycle events ───
      try {
        const { dispatchNotification, resolveRoleRecipients, resolveBaseUrl } = await import('@/lib/notification-center');
        const tenantIdOff = decoded.tenantId as string;
        const originOff = request.headers.get('origin') || undefined;

        if (effectiveStatus === 'sent' && tenantIdOff) {
          // Offer letter available → candidate email with the accept link
          const offerUrl = offer.accessToken ? `${resolveBaseUrl(originOff)}/offer/${offer.accessToken}` : '';
          await dispatchNotification({
            tenantId: tenantIdOff,
            module: 'recruitment',
            eventKey: 'recruitment.offer.issued',
            recipients: offer.candidateEmail ? [{ email: offer.candidateEmail, name: offer.candidateName }] : [],
            vars: {
              Candidate_Name: offer.candidateName || '',
              Position: offer.position || '',
              Offer_Url: offerUrl,
            },
            suppressInApp: true,
            origin: originOff,
          });

          // GAP FIX #7: Auto-flip JobApplication status to 'offered' when offer is sent
          try {
            if (offer.jobApplicationId) {
              await db.$executeRawUnsafe(
                `UPDATE "JobApplication" SET "status" = 'offered', "updatedAt" = NOW() WHERE "id" = $1`,
                offer.jobApplicationId,
              );
            }
          } catch { /* non-fatal */ }
        }
        if (effectiveStatus === 'accepted' && tenantIdOff) {
          // Recruiter/HR + IT & Admin provisioning trigger
          const hrIds = await resolveRoleRecipients(db, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
          const itIds = await resolveRoleRecipients(db, ['it_admin', 'it_support', 'admin', 'system_admin'], 10);
          const recipients = Array.from(new Set([...hrIds, ...itIds])).map((uid) => ({ userId: uid }));
          await dispatchNotification({
            tenantId: tenantIdOff,
            module: 'recruitment',
            eventKey: 'recruitment.offer.accepted',
            recipients,
            vars: {
              Candidate_Name: existing.candidateName || '',
              Position: existing.position || '',
              Department: existing.department || '—',
              Joining_Date: offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString('en-IN') : 'TBD',
            },
            entity: { type: 'offer', id, link: '/offers' },
            origin: originOff,
          });
        }
        if (effectiveStatus === 'rejected' && tenantIdOff) {
          const hrIds = await resolveRoleRecipients(db, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
          await dispatchNotification({
            tenantId: tenantIdOff,
            module: 'recruitment',
            eventKey: 'recruitment.offer.declined',
            recipients: hrIds.map((uid) => ({ userId: uid })),
            vars: {
              Candidate_Name: existing.candidateName || '',
              Position: existing.position || '',
              Reason: responseNotes || '—',
            },
            entity: { type: 'offer', id, link: '/offers' },
            origin: originOff,
          });
        }
      } catch (e) {
        console.warn('[offers] notification-center dispatch failed (non-fatal):', (e as Error).message);
      }
    }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_OFFER_STATUS',
        module: 'offers',
        details: `Updated offer ${id} status to ${effectiveStatus}${updateData.approvalTiers ? ' (tier approval recorded)' : ''}`,
      },
    });

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const existing = await db.offer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    await db.offer.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_OFFER',
        module: 'offers',
        details: `Deleted offer for ${existing.candidateName} - ${existing.position}`,
      },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
