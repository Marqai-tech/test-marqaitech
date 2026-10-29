/**
 * Candidate Portal — Quick Apply (one-click apply for suggested jobs)
 *
 * POST /api/candidate-portal/quick-apply
 *   body: { jobPostingId }
 *   headers: Authorization: Bearer <candidate JWT>
 *
 * Lets a logged-in candidate apply to a suggested job in ONE click —
 * no modal, no further form filling. We pull their name, email, phone,
 * and resume data URL from their most recent job application and submit
 * a new application for the requested jobPostingId.
 *
 * This is the "Apply" button on the matching-jobs section of the candidate
 * dashboard. The candidate already uploaded their resume when they applied
 * to their first job, so we reuse it — they don't have to re-upload or
 * re-type anything.
 *
 * Returns:
 *   201 → { success, application }
 *   409 → already applied to this job
 *   404 → job posting not found or not open
 *   400 → candidate has no prior application (so we have no resume to reuse)
 */
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { requireCandidate, ok, fail, OPTIONS, parseBody } from '@/lib/candidate-auth';

export { OPTIONS };

export async function POST(request: Request) {
  const db = await getDb(request);
  const { candidate, response } = await requireCandidate(request);
  if (!candidate) return response;

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON body', 400);
  const { jobPostingId } = body;
  if (!jobPostingId || typeof jobPostingId !== 'string') {
    return fail('jobPostingId is required', 400);
  }

  // 1. Verify the job posting exists and is open
  const job = await db.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: {
      id: true,
      title: true,
      status: true,
      department: {
        select: {
          id: true,
          name: true,
          company: {
            select: {
              id: true,
              name: true,
              companyGroup: {
                select: { tenant: { select: { id: true, name: true, slug: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!job) return fail('Job posting not found', 404);
  if (job.status !== 'open') {
    return fail('This job is no longer accepting applications', 410);
  }

  // 2. Idempotency: prevent duplicate applications
  const existing = await db.jobApplication.findFirst({
    where: {
      jobPostingId,
      candidateEmail: { equals: candidate.email, mode: 'insensitive' },
    },
    select: { id: true, appliedDate: true },
  });
  if (existing) {
    return fail("You've already applied for this position.", 409);
  }

  // 3. Pull candidate info + resume from their most recent prior application.
  //    If they have no prior applications, we can't auto-apply because we
  //    don't have their resume on file — they need to use the full apply
  //    flow on /careers first.
  const priorApp = await db.jobApplication.findFirst({
    where: {
      candidateEmail: { equals: candidate.email, mode: 'insensitive' },
    },
    orderBy: { appliedDate: 'desc' },
    select: {
      candidateName: true,
      candidateEmail: true,
      candidatePhone: true,
      resume: true,
      expectedSalary: true,
    },
  });
  if (!priorApp || !priorApp.resume) {
    return fail(
      'We need your resume on file to quick-apply. Please apply to your first job via the careers page to upload your resume, then quick-apply will be available for all other jobs.',
      400,
    );
  }

  // 4. Create the new application, reusing the candidate's stored info
  const application = await db.jobApplication.create({
    data: {
      jobPostingId,
      candidateName: priorApp.candidateName,
      candidateEmail: candidate.email.toLowerCase(),
      candidatePhone: priorApp.candidatePhone,
      // Copy the resume data URL so the hiring team can review it for this
      // application too. The same resume is used because the candidate is
      // reusing their existing resume — they can re-upload a fresh one later
      // from the dashboard if needed.
      resume: priorApp.resume,
      expectedSalary: priorApp.expectedSalary,
      source: 'candidate_portal_quick_apply',
      status: 'applied',
      notes: 'Quick-applied from candidate portal matching jobs section',
    },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      status: true,
      appliedDate: true,
    },
  });

  // 5. Parse the resume and create a ResumeParse row (best-effort, non-blocking)
  //    so the candidate's dashboard shows insights + the recruiter sees the
  //    structured profile for this application too.
  try {
    // Reuse the latest ResumeParse row from the prior application if available —
    // avoids re-running the (potentially expensive) parse pipeline.
    const existingParse = await db.resumeParse.findFirst({
      where: {
        jobApplication: { candidateEmail: { equals: candidate.email, mode: 'insensitive' } },
      },
      orderBy: { createdAt: 'desc' },
      select: { rawText: true, language: true, parsedData: true, confidence: true, sourceFormat: true, parseError: true },
    });
    if (existingParse) {
      await db.resumeParse.create({
        data: {
          jobApplicationId: application.id,
          rawText: existingParse.rawText,
          language: existingParse.language,
          parsedData: existingParse.parsedData,
          confidence: existingParse.confidence,
          sourceFormat: existingParse.sourceFormat,
          parseError: existingParse.parseError,
        },
      });
    } else if (priorApp.resume.startsWith('data:')) {
      // No prior parse row — parse from scratch.
      const { parseResumeFromDataUrl } = await import('@/lib/resume-parser');
      const result = await parseResumeFromDataUrl(priorApp.resume);
      await db.resumeParse.create({
        data: {
          jobApplicationId: application.id,
          rawText: result.rawText.slice(0, 100_000),
          language: result.language || 'en',
          parsedData: JSON.stringify(result.parsed),
          confidence: result.confidence,
          sourceFormat: result.sourceFormat,
          parseError: result.parseError || null,
        },
      });
    }
  } catch (parseErr) {
    console.error('[quick-apply] resume parse failed (non-fatal):', parseErr);
  }

  // 6. Audit + notification (best-effort, non-blocking)
  // GAP FIX #2: Use dispatchNotification instead of raw createMany — sends email + delivery log
  try {
    const tenantId = job.department?.company?.companyGroup?.tenant?.id;
    if (tenantId) {
      const tenantAdmins = await db.user.findMany({
        where: { tenantId, role: { in: ['tenant_admin', 'ceo', 'hr_admin', 'company_hr_admin', 'admin', 'recruiter'] }, status: 'active' },
        select: { id: true, email: true },
      }).catch(() => []);
      // Avoid hr@marqaitech.com per user instruction
      const safeAdmins = tenantAdmins.filter(u => !u.email?.includes('hr@marqaitech'));

      if (safeAdmins.length > 0) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        await dispatchNotification({
          tenantId,
          module: 'recruitment',
          eventKey: 'recruitment.candidate.applied',
          recipients: safeAdmins.map(u => ({ userId: u.id })),
          vars: {
            Candidate_Name: application.candidateName || 'A candidate',
            Job_Title: job.title,
            Application_Date: new Date().toLocaleDateString('en-IN'),
          },
          entity: { type: 'job_application', id: application.id, link: '/recruitment' },
        }).catch(() => null);
      }

      // Send candidate acknowledgment email
      if (application.candidateEmail) {
        try {
          const { dispatchNotification } = await import('@/lib/notification-center');
          await dispatchNotification({
            tenantId,
            module: 'recruitment',
            eventKey: 'recruitment.candidate.acknowledgment',
            recipients: [{ name: application.candidateName, email: application.candidateEmail }],
            vars: {
              Candidate_Name: application.candidateName || 'Candidate',
              Job_Title: job.title,
              Application_Date: new Date().toLocaleDateString('en-IN'),
            },
            entity: { type: 'job_application', id: application.id, link: '/careers' },
            suppressInApp: true,
          }).catch(() => null);
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    /* non-fatal */
  }

  return ok({
    success: true,
    application,
    message: `Applied to "${job.title}" successfully! We'll be in touch.`,
  }, 201);
}
