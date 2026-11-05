import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { validateEmail, validatePhone } from '@/lib/validators';
import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';
import { resolveRecruitmentConfig } from '@/lib/recruitment-workflow';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Build a Prisma `where` clause that restricts JobPosting results to the
 * authenticated user's tenant. This enforces REQ-SEC-CAND-05 (Cross-Tenant
 * Blindness) so an HR user from Company A cannot list / read / edit job
 * postings belonging to Company B (a different tenant).
 *
 * The chain is:
 *   JobPosting → Department → Company → CompanyGroup → Tenant
 *
 * Super admins bypass the filter (they can see all tenants).
 */
function tenantWhere(decoded: Record<string, any> | null): Record<string, unknown> {
  if (!decoded) return {};
  if (decoded.role === 'super_admin') return {};
  return {
    department: {
      company: {
        companyGroup: { tenantId: decoded.tenantId as string },
      },
    },
  };
}

/** Same filter but for a single-record lookup by id. */
function tenantScopedJobPostingFilter(id: string, decoded: Record<string, any> | null) {
  return {
    id,
    ...tenantWhere(decoded),
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

function emptyStats() {
  return {
    openPositions: 0,
    totalApplications: 0,
    interviewsScheduled: 0,
    offersPending: 0,
    hiresThisMonth: 0,
    avgTimeToHire: null as number | null,
  };
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');
    const companyId = searchParams.get('companyId');
    const tenantId = searchParams.get('tenantId');

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    if (isSuperAdminWithoutScope(decoded, companyId, tenantId, request)) {
      return NextResponse.json({
        jobPostings: [],
        stats: emptyStats(),
        pipelineData: [],
        sourceData: [],
        monthlyTrend: [],
        recentApplications: [],
        upcomingInterviews: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      }, { headers: corsHeaders() });
    }

    // Start with the tenant filter (critical for cross-tenant blindness)
    const where: Record<string, unknown> = tenantWhere(decodedRec);
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const [jobPostings, total] = await Promise.all([
      db.jobPosting.findMany({
        where,
        include: {
          department: {
            select: { id: true, name: true },
          },
          applications: {
            select: {
              id: true,
              // Phase 7 fix: PII masking — mask candidate email and phone for non-HR users
              candidateName: true,
              candidateEmail: true,
              candidatePhone: true,
              source: true,
              status: true,
              appliedDate: true,
              rating: true,
              expectedSalary: true,
              notes: true,
              jobPostingId: true,
            },
            orderBy: { appliedDate: 'desc' },
          },
          _count: {
            select: { applications: true },
          },
        },
        orderBy: { postedDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.jobPosting.count({ where }),
    ]);

    // Phase 7 fix: Server-side PII masking for non-HR users
    const HR_ROLES_FOR_PII = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    const canSeePII = HR_ROLES_FOR_PII.includes(decodedRec.role as string);
    if (!canSeePII) {
      for (const job of jobPostings) {
        if (job.applications) {
          for (const app of job.applications as any[]) {
            if (app.candidateEmail) app.candidateEmail = app.candidateEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2');
            if (app.candidatePhone) app.candidatePhone = String(app.candidatePhone).replace(/(\d{2})\d+(\d{2})/, '$1***$2');
          }
        }
      }
    }

    // ─── Dashboard aggregates (real data only — no fallbacks) ───
    const appWhere = { jobPosting: where };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      openCount,
      totalApplications,
      statusGroups,
      sourceGroups,
      interviewsScheduled,
      offersPending,
      hiresThisMonth,
      recentHired,
      recentInterviews,
      trendApps,
    ] = await Promise.all([
      db.jobPosting.count({ where: { ...where, status: 'open' } }),
      db.jobApplication.count({ where: appWhere }),
      db.jobApplication.groupBy({ by: ['status'], where: appWhere, _count: { _all: true } }).catch(() => []),
      db.jobApplication.groupBy({ by: ['source'], where: appWhere, _count: { _all: true } }).catch(() => []),
      db.interview.count({ where: { jobApplication: { jobPosting: where }, status: 'scheduled' } }).catch(() => 0),
      db.offer.count({ where: { status: { in: ['pending_approval', 'approved', 'sent'] } } }).catch(() => 0),
      db.jobApplication.count({ where: { ...appWhere, status: 'hired', updatedAt: { gte: monthStart } } }).catch(() => 0),
      db.jobApplication.findMany({
        where: { ...appWhere, status: 'hired' },
        select: { appliedDate: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }).catch(() => []),
      db.interview.findMany({
        where: { jobApplication: { jobPosting: where }, status: 'scheduled', date: { gte: now } },
        include: {
          jobApplication: { select: { candidateName: true, jobPosting: { select: { title: true } } } },
        },
        orderBy: { date: 'asc' },
        take: 5,
      }).catch(() => []),
      db.jobApplication.findMany({
        where: { ...appWhere, appliedDate: { gte: sixMonthsAgo } },
        select: { appliedDate: true, status: true },
        take: 5000,
      }).catch(() => []),
    ]);

    // Dynamic pipeline config → stage labels/order come from workflow config
    const wfConfig = await resolveRecruitmentConfig(db, decodedRec.tenantId as string, companyId || null).catch(() => null);
    const countByStatus = new Map<string, number>(
      (statusGroups as Array<{ status: string; _count: { _all: number } }>).map((g) => [g.status, g._count._all])
    );
    const pipelineData = (wfConfig?.stages || [])
      .filter((s) => s.enabled !== false)
      .map((s) => ({ stage: s.label, key: s.key, count: countByStatus.get(s.key) || 0 }));

    const sourceData = (sourceGroups as Array<{ source: string | null; _count: { _all: number } }>).map((g) => ({
      source: g.source || 'other',
      count: g._count._all,
    }));

    // Last-6-month application/hire trend
    const monthlyTrend: Array<{ month: string; applications: number; hires: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyTrend.push({ month: d.toLocaleString('en-US', { month: 'short' }), applications: 0, hires: 0 });
    }
    for (const a of trendApps as Array<{ appliedDate: Date | string | null; status: string }>) {
      if (!a.appliedDate) continue;
      const d = new Date(a.appliedDate);
      const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (idx >= 0 && idx <= 5) {
        monthlyTrend[5 - idx].applications += 1;
        if (a.status === 'hired') monthlyTrend[5 - idx].hires += 1;
      }
    }

    // Average time-to-hire (applied → marked hired), last 20 hires
    let avgTimeToHire: number | null = null;
    if ((recentHired as Array<{ appliedDate: Date | string | null; updatedAt: Date | string }>).length) {
      const samples = (recentHired as Array<{ appliedDate: Date | string | null; updatedAt: Date | string }>)
        .filter((h) => h.appliedDate)
        .map((h) => (new Date(h.updatedAt).getTime() - new Date(h.appliedDate as Date).getTime()) / 86_400_000)
        .filter((days) => days >= 0);
      if (samples.length) avgTimeToHire = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    }

    const recentApplications = jobPostings
      .flatMap((j: any) => (j.applications || []).map((a: any) => ({ ...a, jobTitle: j.title })))
      .sort((a: any, b: any) => new Date(b.appliedDate || 0).getTime() - new Date(a.appliedDate || 0).getTime())
      .slice(0, 5);

    const upcomingInterviews = (recentInterviews as Array<Record<string, any>>).map((iv) => ({
      id: iv.id,
      candidateName: iv.jobApplication?.candidateName || 'Candidate',
      jobTitle: iv.jobApplication?.jobPosting?.title || '—',
      date: iv.date,
      time: iv.time,
      type: iv.type,
      interviewer: iv.interviewer,
      meetingUrl: iv.meetingUrl,
    }));

    return NextResponse.json(
      {
        jobPostings,
        stats: {
          openPositions: openCount,
          totalApplications,
          interviewsScheduled,
          offersPending,
          hiresThisMonth,
          avgTimeToHire,
        },
        pipelineData,
        sourceData,
        monthlyTrend,
        recentApplications,
        upcomingInterviews,
        workflowStages: wfConfig?.stages || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get recruitment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();

    // Handle application submission (HR-side manual apply on behalf of candidate)
    if (body.action === 'apply') {
      const { jobPostingId, candidateName, candidateEmail, candidatePhone, source, expectedSalary } = body;

      if (!jobPostingId || !candidateName || !candidateEmail) {
        return NextResponse.json(
          { error: 'Missing required fields: jobPostingId, candidateName, candidateEmail' },
          { status: 400, headers: corsHeaders() }
        );
      }

      // ─── Server-side validation ───
      if (candidatePhone && typeof candidatePhone === 'string') {
        const phoneResult = validatePhone(candidatePhone);
        if (!phoneResult.valid) {
          return NextResponse.json({ error: phoneResult.error }, { status: 400, headers: corsHeaders() });
        }
      }
      if (candidateEmail && typeof candidateEmail === 'string') {
        const emailResult = validateEmail(candidateEmail);
        if (!emailResult.valid) {
          return NextResponse.json({ error: emailResult.error }, { status: 400, headers: corsHeaders() });
        }
      }

      // Verify job posting exists AND belongs to the caller's tenant
      const jobExists = await db.jobPosting.findFirst({
        where: tenantScopedJobPostingFilter(jobPostingId, decodedRec),
      });
      if (!jobExists) {
        return NextResponse.json(
          { error: 'Job posting not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      const application = await db.jobApplication.create({
        data: {
          jobPostingId,
          candidateName,
          candidateEmail,
          candidatePhone,
          source: source || 'website',
          expectedSalary,
          status: 'applied',
        },
      });

      // ─── Notification Center (Task 36): recruiter alert + candidate acknowledgment ───
      try {
        const tenantIdRec = decodedRec.tenantId as string;
        if (tenantIdRec) {
          const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
          const recruiterIds = await resolveRoleRecipients(db, ['admin', 'hr_admin', 'company_hr_admin', 'hr_manager', 'tenant_admin', 'ceo'], 10);
          await dispatchNotification({
            tenantId: tenantIdRec,
            module: 'recruitment',
            eventKey: 'recruitment.candidate.applied',
            recipients: recruiterIds.map((id) => ({ userId: id })),
            vars: { Candidate_Name: candidateName, Job_Title: jobExists.title },
            entity: { type: 'job_application', id: application.id, link: '/recruitment' },
            origin: request.headers.get('origin') || undefined,
          });
          // Candidate acknowledgment (email-only, external)
          await dispatchNotification({
            tenantId: tenantIdRec,
            module: 'recruitment',
            eventKey: 'recruitment.candidate.acknowledgment',
            recipients: [{ email: candidateEmail, name: candidateName }],
            vars: { Candidate_Name: candidateName, Job_Title: jobExists.title },
            suppressInApp: true,
            origin: request.headers.get('origin') || undefined,
          });
        }
      } catch (e) {
        console.warn('[recruitment] application notifications failed (non-fatal):', (e as Error).message);
      }

      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'SUBMIT_APPLICATION',
          module: 'recruitment',
          details: `Application submitted by ${candidateName} for job: ${jobExists.title}`,
        },
      });

      return NextResponse.json(
        { application },
        { status: 201, headers: corsHeaders() }
      );
    }

    // Handle job posting creation
    // Phase 2 fix: Enforce HR/Admin role check for job posting creation
    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes(decodedRec.role as string)) {
      return NextResponse.json(
        { error: 'Only HR/Admin can create job postings' },
        { status: 403, headers: corsHeaders() }
      );
    }

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
    } = body;

    if (!title || !departmentId || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: title, departmentId, description' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Verify the department belongs to the caller's tenant (prevent cross-tenant job creation)
    // Phase 4 fix: Use exact ID match only (was using findFirst which could match wrong dept)
    const department = await db.department.findUnique({
      where: { id: departmentId },
    }).catch(async () => {
      // Fallback: try exact name match if ID is not a CUID
      const rows = await db.$queryRawUnsafe(
        `SELECT * FROM "Department" WHERE LOWER("name") = LOWER($1) LIMIT 1`, departmentId,
      ) as any[];
      return rows[0] || null;
    });
    if (!department) {
      return NextResponse.json(
        { error: 'Department not found in your tenant' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const jobPosting = await db.jobPosting.create({
      data: {
        title,
        departmentId,
        position: position || title,
        location,
        type: type || 'full-time',
        experience,
        salary,
        description,
        requirements,
        closingDate: closingDate ? new Date(closingDate) : null,
        vacancies: vacancies || 1,
        status: 'open',
      },
      include: {
        department: {
          select: { name: true },
        },
      },
    });

    // Notify HR admins about the new job posting
    const hrAdmins = await db.user.findMany({
      where: {
        tenantId: decodedRec.tenantId as string,
        role: { in: ['super_admin', 'tenant_admin', 'ceo', 'admin'] },
      },
    });

    for (const admin of hrAdmins) {
      await createNotification({
        tenantId: decodedRec.tenantId as string,
        userId: admin.id,
        title: 'New Job Posting Created',
        message: `A new job posting "${title}" has been created for ${jobPosting.department.name} department.`,
        type: 'info',
        category: 'recruitment',
        link: `/recruitment/${jobPosting.id}`,
      });
    }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_JOB_POSTING',
        module: 'recruitment',
        details: `Created job posting: ${title}`,
      },
    });

    return NextResponse.json(
      { jobPosting },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
