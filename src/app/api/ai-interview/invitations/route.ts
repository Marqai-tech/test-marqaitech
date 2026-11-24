import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { randomBytes } from 'crypto';
import { sendEmail } from '@/lib/email';

// GET /api/ai-interview/invitations — List invitations
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const setId = searchParams.get('setId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (setId) where.setId = setId;
    if (status) where.status = status;

    const [invitations, total] = await Promise.all([
      db.interviewInvitation.findMany({
        where,
        include: {
          set: { select: { id: true, title: true, roleTitle: true, interviewMode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.interviewInvitation.count({ where }),
    ]);

    return NextResponse.json({ data: invitations, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: unknown) {
    console.error('Invitations GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
  }
}

// POST /api/ai-interview/invitations — Create invitation(s), supports bulk
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const { setId, candidates } = body;

    if (!setId) {
      return NextResponse.json({ error: 'setId is required' }, { status: 400 });
    }

    // Verify set exists and is active
    const set = await db.interviewSet.findUnique({ where: { id: setId } });
    if (!set) {
      return NextResponse.json({ error: 'Interview set not found' }, { status: 404 });
    }
    if (set.status !== 'active') {
      return NextResponse.json({ error: 'Interview set must be active to send invitations' }, { status: 400 });
    }

    // Support single or bulk creation
    const candidateList: Array<{ email: string; name: string }> = [];
    if (candidates && Array.isArray(candidates)) {
      candidateList.push(...candidates);
    } else if (body.candidateEmail && body.candidateName) {
      candidateList.push({ email: body.candidateEmail, name: body.candidateName });
    } else {
      return NextResponse.json({ error: 'candidates array or candidateEmail/candidateName is required' }, { status: 400 });
    }

    const invitations = [];
    for (const candidate of candidateList) {
      if (!candidate.email || !candidate.name) continue;

      const token = randomBytes(32).toString('hex');
      const invitationUrl = `/interview/${token}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

      const invitation = await db.interviewInvitation.create({
        data: {
          setId,
          candidateEmail: candidate.email,
          candidateName: candidate.name,
          invitationToken: token,
          invitationUrl,
          status: 'pending',
          expiresAt,
        },
      });

      invitations.push(invitation);
    }

    // Send invitation emails (best-effort — email failure must NOT fail the request)
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const origin = new URL(req.url).origin;
    const roleLabel = set.title || set.roleTitle || 'AI Interview';
    for (const invitation of invitations) {
      const interviewUrl = `${origin}/interview/${invitation.invitationToken}`;
      const expiryText = invitation.expiresAt
        ? new Date(invitation.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';
      const candidateName = escapeHtml(invitation.candidateName);
      const safeRoleLabel = escapeHtml(roleLabel);
      try {
        const result = await sendEmail({
          to: invitation.candidateEmail,
          subject: `AI Interview Invitation — ${roleLabel}`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;background:#f6faf9;padding:24px;">
              <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <div style="background:#0d9488;padding:20px 24px;">
                  <h1 style="color:#ffffff;font-size:18px;margin:0;">3Boxes HRMS</h1>
                </div>
                <div style="padding:24px;color:#1f2937;font-size:14px;line-height:1.6;">
                  <p>Hi ${candidateName},</p>
                  <p>You have been invited to complete an <strong>AI-powered interview</strong> for the <strong>${safeRoleLabel}</strong> position.</p>
                  <p style="text-align:center;margin:28px 0;">
                    <a href="${interviewUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;">Start Your Interview</a>
                  </p>
                  <p>This invitation expires on <strong>${expiryText}</strong> — it is valid for 7 days from today, so please complete the interview before then.</p>
                  <p style="color:#6b7280;font-size:12px;">If the button above doesn't work, copy and paste this link into your browser:<br />
                    <a href="${interviewUrl}" style="color:#0d9488;">${interviewUrl}</a></p>
                  <p style="color:#6b7280;font-size:12px;margin-bottom:0;">Good luck!</p>
                </div>
              </div>
            </div>`,
        });
        if (result.success) {
          try {
            await db.interviewInvitation.update({ where: { id: invitation.id }, data: { emailDeliveryStatus: 'sent' } });
          } catch { /* status update is non-critical */ }
        } else {
          console.warn(`[Invitations] Email send failed for ${invitation.candidateEmail}: ${result.error || 'unknown error'}`);
          try {
            await db.interviewInvitation.update({ where: { id: invitation.id }, data: { emailDeliveryStatus: 'failed' } });
          } catch { /* status update is non-critical */ }
        }
      } catch (emailErr) {
        console.warn(`[Invitations] Email send error for ${invitation.candidateEmail}:`, emailErr);
        try {
          await db.interviewInvitation.update({ where: { id: invitation.id }, data: { emailDeliveryStatus: 'failed' } });
        } catch { /* status update is non-critical */ }
      }
    }

    return NextResponse.json({ data: invitations, count: invitations.length }, { status: 201 });
  } catch (error: unknown) {
    console.error('Invitations POST error:', error);
    return NextResponse.json({ error: 'Failed to create invitations' }, { status: 500 });
  }
}
