import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isTestPlatformHost } from '@/lib/tenant-filter';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Tenant-scoped where clause for JobPosting (enforces REQ-SEC-CAND-05).
 * Chain: JobPosting → Department → Company → CompanyGroup → Tenant.
 * Super admins bypass. Test platform hosts (beta/QA) also bypass — the HR
 * user's JWT tenantId may point at a different tenant DB than the one the
 * data actually lives in (the test-marqaitech tenant DB), so the strict
 * tenant filter would 404 valid records. On test hosts we trust the DB
 * routing (getDb already routes to the correct test tenant DB) and skip
 * the per-row tenant chain check.
 */
function tenantJobPostingFilter(id: string, decoded: Record<string, any> | null, request?: Request) {
  if (!decoded) return { id };
  if (decoded.role === 'super_admin') return { id };
  // Test platform hosts (beta, localhost) — bypass tenant chain filter
  if (request) {
    const host = request.headers.get('x-tenant-domain') || request.headers.get('host') || '';
    if (isTestPlatformHost(host.split(':')[0])) return { id };
  }
  return {
    id,
    department: {
      company: {
        companyGroup: { tenantId: decoded.tenantId as string },
      },
    },
  };
}

/** Tenant-scoped where clause for JobApplication (via JobPosting → Department → ... → Tenant). */
function tenantApplicationFilter(id: string, decoded: Record<string, any> | null, request?: Request) {
  if (!decoded) return { id };
  if (decoded.role === 'super_admin') return { id };
  // Test platform hosts — bypass tenant chain filter (same reason as above)
  if (request) {
    const host = request.headers.get('x-tenant-domain') || request.headers.get('host') || '';
    if (isTestPlatformHost(host.split(':')[0])) return { id };
  }
  return {
    id,
    jobPosting: {
      department: {
        company: {
          companyGroup: { tenantId: decoded.tenantId as string },
        },
      },
    },
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
    const decodedRec = decoded as unknown as Record<string, any>;

    const { id } = await params;
    const jobPosting = await db.jobPosting.findFirst({
      where: tenantJobPostingFilter(id, decodedRec, request),
      include: {
        department: {
          select: { id: true, name: true },
        },
        applications: {
          orderBy: { appliedDate: 'desc' },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!jobPosting) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { jobPosting },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
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
    const decodedRec = decoded as unknown as Record<string, any>;

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      departmentId,
      position,
      location,
      type,
      experience,
      salary,
      description,
      requirements,
      closingDate,
      vacancies,
      interviewPlan,
      status,
    } = body;

    // Check if job posting exists AND belongs to caller's tenant
    const existing = await db.jobPosting.findFirst({
      where: tenantJobPostingFilter(id, decodedRec, request),
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // If moving to a new department, verify it's in the same tenant
    if (departmentId && departmentId !== existing.departmentId) {
      const newDept = await db.department.findFirst({
        where: {
          id: departmentId,
          company: {
            companyGroup: { tenantId: decodedRec.tenantId as string },
          },
        },
      });
      if (!newDept) {
        return NextResponse.json(
          { error: 'Target department not found in your tenant' },
          { status: 404, headers: corsHeaders() }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (position !== undefined) updateData.position = position;
    if (location !== undefined) updateData.location = location;
    if (type !== undefined) updateData.type = type;
    if (experience !== undefined) updateData.experience = experience;
    if (salary !== undefined) updateData.salary = salary;
    if (description !== undefined) updateData.description = description;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (vacancies !== undefined) updateData.vacancies = parseInt(String(vacancies)) || 1;
    if (closingDate !== undefined) updateData.closingDate = closingDate ? new Date(closingDate) : null;
    if (status !== undefined) updateData.status = status;
    if (interviewPlan !== undefined) {
      try {
        const parsed = typeof interviewPlan === 'string' ? JSON.parse(interviewPlan) : interviewPlan;
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((r: any, i: number) => !r?.name || !['technical', 'hr', 'ai', 'offline_panel'].includes(r?.type))) throw new Error('invalid');
        updateData.interviewPlan = JSON.stringify(parsed.map((r: any, i: number) => ({ sequence: i + 1, name: String(r.name).trim(), type: r.type })));
      } catch {
        return NextResponse.json({ error: 'Interview plan must be a valid non-empty JSON array with name and type for every round.' }, { status: 400, headers: corsHeaders() });
      }
    }

    const jobPosting = await db.jobPosting.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: { id: true, name: true },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_JOB_POSTING',
        module: 'recruitment',
        details: `Updated job posting: ${jobPosting.title}`,
      },
    });

    return NextResponse.json(
      { jobPosting },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Update job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
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
    const decodedRec = decoded as unknown as Record<string, any>;

    const { id } = await params;
    const body = await request.json();
    const { status, feedback, aiFeedbackDraft } = body;

    // Try to update as job posting first (tenant-scoped)
    const jobPosting = await db.jobPosting.findFirst({
      where: tenantJobPostingFilter(id, decodedRec, request),
    });
    if (jobPosting) {
      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;

      const updated = await db.jobPosting.update({
        where: { id },
        data: updateData,
        include: {
          department: {
            select: { id: true, name: true },
          },
        },
      });

      return NextResponse.json(
        { jobPosting: updated },
        { headers: corsHeaders() }
      );
    }

    // Try to update as application (tenant-scoped via jobPosting → department → company → group → tenant)
    const application = await db.jobApplication.findFirst({
      where: tenantApplicationFilter(id, decodedRec, request),
    });
    if (application) {
      // GAP FIX #10: Add 'withdrawn' and 'talent_pool' to valid statuses
      const validStatuses = ['applied', 'screening', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn', 'talent_pool'];
      if (status !== undefined && !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400, headers: corsHeaders() }
        );
      }

      // Phase 7 fix: Prevent invalid status transitions
      // Cannot jump directly to 'offered' or 'hired' without going through 'interview'
      if (status === 'offered' && !['interview', 'offered', 'hired'].includes(application.status)) {
        return NextResponse.json(
          { error: 'Cannot move to Offered without completing the Interview stage first. Current status: ' + application.status },
          { status: 400, headers: corsHeaders() }
        );
      }
      if (status === 'offered' && application.status === 'interview') {
        try {
          const planRows = await db.$queryRawUnsafe(
            `SELECT jp."interviewPlan" FROM "JobPosting" jp WHERE jp."id" = $1 LIMIT 1`,
            application.jobPostingId,
          ) as any[];
          const rawPlan = planRows[0]?.interviewPlan;
          if (rawPlan) {
            const plan = typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan;
            const requiredRounds = Array.isArray(plan) ? plan.length : 0;
            const completedRows = await db.$queryRawUnsafe(
              `SELECT "round", "status", "hrDecision" FROM "Interview" WHERE "jobApplicationId" = $1 AND "status" = 'completed' ORDER BY "round" ASC`,
              application.id,
            ) as any[];
            const completedRounds = new Set(completedRows.map((r: any) => Number(r.round || 1)));
            const missing = Array.from({ length: requiredRounds }, (_, i) => i + 1).filter((round) => !completedRounds.has(round));
            if (missing.length > 0) {
              return NextResponse.json({
                error: `Cannot move to Offered. Complete all configured interview rounds first. Missing rounds: ${missing.join(', ')}.`,
                code: 'INTERVIEW_PLAN_INCOMPLETE',
                missingRounds: missing,
              }, { status: 409, headers: corsHeaders() });
            }
          }
        } catch (e) {
          console.warn('[Recruitment PATCH] interview plan gate failed:', e instanceof Error ? e.message : e);
        }
      }
      if (status === 'hired' && !['offered', 'hired'].includes(application.status)) {
        return NextResponse.json(
          { error: 'Cannot move to Hired without an Offer first. Current status: ' + application.status },
          { status: 400, headers: corsHeaders() }
        );
      }

      // Task 166/167: idempotency — don't re-update DB if status is the same,
      // BUT still send the candidate email (the user might be re-triggering the
      // notification manually). Only skip the DB write, not the email.
      const isSameStatus = status !== undefined && status === application.status;
      if (isSameStatus) {
        // Skip the DB update but continue to the email notification below.
        // Set 'updated' to the existing application so the email code has the data.
        const updated = application;
        // Task 166/167: notify the candidate of status change (email)
        if (status !== undefined && updated.candidateEmail) {
          try {
            const { sendEmail } = await import('@/lib/email');
            const { sendTenantEmail } = await import('@/lib/notification-channels');
            const statusLabels: Record<string, string> = {
              screening: 'Under Screening',
              shortlisted: 'Shortlisted',
              interview: 'Selected for Interview',
              offered: 'Offer Extended',
              hired: 'Hired',
              rejected: 'Rejected',
            };
            const statusLabel = statusLabels[status] || status;
            let jobTitle = 'the position';
            try {
              const jobRows = await db.$queryRawUnsafe(
                `SELECT jp."title" FROM "JobPosting" jp
                 JOIN "JobApplication" ja ON ja."jobPostingId" = jp."id"
                 WHERE ja."id" = $1 LIMIT 1`, id,
              ) as any[];
              if (jobRows[0]?.title) jobTitle = jobRows[0].title;
            } catch {}

            const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#4f46e5;">Application Status Update</h2>
              <p>Dear ${updated.candidateName},</p>
              <p>Your application for <strong>${jobTitle}</strong> has been updated to: <strong>${statusLabel}</strong>.</p>
              ${status === 'rejected' ? '<p>We appreciate your interest and wish you the best in your job search.</p>' : ''}
              ${status === 'interview' ? '<p>Please watch for further communication regarding interview scheduling.</p>' : ''}
              ${status === 'offered' ? '<p>Congratulations! Please check your email for offer details.</p>' : ''}
              <p>Thank you for your interest in joining our team.</p>
              <p>Regards,<br/>HR Team</p>
            </div>`;
            let emailSent = false;
            let emailError = '';
            // Task 167: Use sendEmail FIRST — it has smart routing (SMTP for internal,
            // Resend for external). sendTenantEmail has circuit breakers that may be open.
            try {
              const emailRes = await sendEmail({
                to: updated.candidateEmail, subject: `Application Status Update: ${statusLabel}`, html,
              });
              emailSent = emailRes.success;
              emailError = emailRes.error || '';
            } catch (e) { emailError = e instanceof Error ? e.message : String(e); }
            if (!emailSent) {
              try {
                const fallbackRes = await sendTenantEmail(db, String(decoded.tenantId || ''), {
                  to: updated.candidateEmail, subject: `Application Status Update: ${statusLabel}`, html,
                });
                emailSent = fallbackRes.success;
                emailError = fallbackRes.error || '';
              } catch (e) { emailError = e instanceof Error ? e.message : String(e); }
            }
            console.log(`[Recruitment PATCH] Candidate email (re-send) to ${updated.candidateEmail}: ${emailSent ? 'SENT' : 'FAILED'} — ${emailError}`);
          } catch (emailErr) {
            console.warn('[Recruitment PATCH] Candidate email failed (non-fatal):', emailErr instanceof Error ? emailErr.message : emailErr);
          }
        }
        return NextResponse.json(
          { application, message: 'Status unchanged — notification re-sent' },
          { headers: corsHeaders() }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;
      // AI-generated rejection feedback stored as JSON in `notes` field
      // (REQ-STAT-05/06 — HR can review the AI draft before publishing)
      if (aiFeedbackDraft !== undefined) {
        updateData.notes = JSON.stringify({
          ...(application.notes ? tryParseNotes(application.notes) : {}),
          aiFeedbackDraft,
          aiFeedbackReviewed: false,
          aiFeedbackPublishedAt: null,
        });
      }
      if (feedback !== undefined) {
        // HR has approved + published the AI feedback
        updateData.notes = JSON.stringify({
          ...(application.notes ? tryParseNotes(application.notes) : {}),
          aiFeedback: feedback,
          aiFeedbackReviewed: true,
          aiFeedbackPublishedAt: new Date().toISOString(),
        });
      }

      const updated = await db.jobApplication.update({
        where: { id },
        data: updateData,
      });

      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'UPDATE_APPLICATION_STATUS',
          module: 'recruitment',
          details: `Updated application status for ${updated.candidateName} to ${status}`,
        },
      }).catch(() => null);

      // Task 166/167: notify the candidate of status change (email)
      if (status !== undefined && updated.candidateEmail) {
        try {
          const { sendEmail } = await import('@/lib/email');
          const { sendTenantEmail } = await import('@/lib/notification-channels');
          const statusLabels: Record<string, string> = {
            screening: 'Under Screening',
            shortlisted: 'Shortlisted',
            interview: 'Selected for Interview',
            offered: 'Offer Extended',
            hired: 'Hired',
            rejected: 'Rejected',
          };
          const statusLabel = statusLabels[status] || status;
          // Fetch the job title via RAW SQL (jobPosting variable might be null)
          let jobTitle = 'the position';
          try {
            const jobRows = await db.$queryRawUnsafe(
              `SELECT jp."title" FROM "JobPosting" jp
               JOIN "JobApplication" ja ON ja."jobPostingId" = jp."id"
               WHERE ja."id" = $1 LIMIT 1`, id,
            ) as any[];
            if (jobRows[0]?.title) jobTitle = jobRows[0].title;
          } catch {}

          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#4f46e5;">Application Status Update</h2>
            <p>Dear ${updated.candidateName},</p>
            <p>Your application for <strong>${jobTitle}</strong> has been updated to: <strong>${statusLabel}</strong>.</p>
            ${status === 'rejected' ? '<p>We appreciate your interest and wish you the best in your job search.</p>' : ''}
            ${status === 'interview' ? '<p>Please watch for further communication regarding interview scheduling.</p>' : ''}
            ${status === 'offered' ? '<p>Congratulations! Please check your email for offer details.</p>' : ''}
            <p>Thank you for your interest in joining our team.</p>
            <p>Regards,<br/>HR Team</p>
          </div>`;
          // Task 167: Use sendEmail FIRST — it has smart routing (SMTP for internal,
          // Resend for external). sendTenantEmail has circuit breakers that may be open.
          let emailSent = false;
          let emailError = '';
          try {
            const emailRes = await sendEmail({
              to: updated.candidateEmail,
              subject: `Application Status Update: ${statusLabel}`,
              html,
            });
            emailSent = emailRes.success;
            emailError = emailRes.error || '';
          } catch (e) {
            emailError = e instanceof Error ? e.message : String(e);
          }
          if (!emailSent) {
            // Fallback: sendTenantEmail (tenant SMTP → env SMTP → Resend)
            try {
              const fallbackRes = await sendTenantEmail(db, String(decoded.tenantId || ''), {
                to: updated.candidateEmail,
                subject: `Application Status Update: ${statusLabel}`,
                html,
              });
              emailSent = fallbackRes.success;
              emailError = fallbackRes.error || '';
            } catch (e) {
              emailError = e instanceof Error ? e.message : String(e);
            }
          }
          console.log(`[Recruitment PATCH] Candidate email to ${updated.candidateEmail}: ${emailSent ? 'SENT' : 'FAILED'} — ${emailError}`);
        } catch (emailErr) {
          console.warn('[Recruitment PATCH] Candidate email failed (non-fatal):', emailErr instanceof Error ? emailErr.message : emailErr);
        }
      }

      // C-23: Auto-sync referral status with the new application status.
      // Finds any Referral rows matching this candidate's email and advances
      // them to match (interviewed / offered / hired + bonus / rejected).
      if (status && updated.candidateEmail) {
        try {
          const { syncReferralStatus } = await import('@/lib/referral-sync');
          // Fetch the job title for the email body
          let jobTitle = 'the position';
          try {
            const jobRows = await db.$queryRawUnsafe(
              `SELECT jp."title" FROM "JobPosting" jp
               JOIN "JobApplication" ja ON ja."jobPostingId" = jp."id"
               WHERE ja."id" = $1 LIMIT 1`, id,
            ) as Array<{ title: string }>;
            if (jobRows[0]?.title) jobTitle = jobRows[0].title;
          } catch {}
          const origin = new URL(request.url).origin;
          await syncReferralStatus(db, String(decoded.tenantId || ''), updated.candidateEmail, status, jobTitle, { origin });
        } catch (e) {
          console.warn('[Recruitment PATCH] Referral sync failed (non-fatal):', e instanceof Error ? e.message : e);
        }
      }

      return NextResponse.json(
        { application: updated },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { error: 'Record not found' },
      { status: 404, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Patch recruitment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function tryParseNotes(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return { raw: s }; }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
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
    const decodedRec = decoded as unknown as Record<string, any>;

    const { id } = await params;

    // Check if job posting exists AND belongs to caller's tenant
    const existing = await db.jobPosting.findFirst({
      where: tenantJobPostingFilter(id, decodedRec, request),
      include: { _count: { select: { applications: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Delete associated applications first
    await db.jobApplication.deleteMany({
      where: { jobPostingId: id },
    });

    // Delete the job posting
    await db.jobPosting.delete({
      where: { id },
    });

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_JOB_POSTING',
        module: 'recruitment',
        details: `Deleted job posting: ${existing.title}`,
      },
    });

    return NextResponse.json(
      { message: 'Job posting deleted successfully' },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Delete job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
