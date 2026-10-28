import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

// ─── Inline schema-sync for PerformanceReview table ───
// CREATE IF NOT EXISTS covers fresh DBs. The ALTER ... ADD COLUMN IF NOT
// EXISTS statements upgrade LEGACY tables that were created by older schema
// versions (missing the rating-breakdown / nullable-text columns → P2022) —
// all statements are additive and idempotent, safe on every tenant DB.
const PERF_REVIEW_SYNC_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PerformanceReview" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "reviewCycle" TEXT NOT NULL, "reviewPeriod" TEXT, "reviewerId" TEXT, "rating" DOUBLE PRECISION NOT NULL DEFAULT 0, "goalsRating" DOUBLE PRECISION NOT NULL DEFAULT 0, "skillsRating" DOUBLE PRECISION NOT NULL DEFAULT 0, "behaviorRating" DOUBLE PRECISION NOT NULL DEFAULT 0, "overallRating" DOUBLE PRECISION NOT NULL DEFAULT 0, "comments" TEXT, "strengths" TEXT, "improvements" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "reviewDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId")`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "reviewPeriod" TEXT`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "reviewerId" TEXT`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "goalsRating" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "skillsRating" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "behaviorRating" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "overallRating" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "comments" TEXT`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "strengths" TEXT`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "improvements" TEXT`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "reviewDate" TIMESTAMP(3)`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()`,
  `ALTER TABLE "PerformanceReview" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()`,
  // Legacy schemas required these obsolete fields and caused Prisma P2011.
  // They are no longer part of the current review model, so make only these
  // known legacy columns nullable instead of altering an arbitrary DB column.
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PerformanceReview' AND column_name='cycleId') THEN ALTER TABLE "PerformanceReview" ALTER COLUMN "cycleId" DROP NOT NULL; END IF; END $$`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PerformanceReview' AND column_name='revieweeId') THEN ALTER TABLE "PerformanceReview" ALTER COLUMN "revieweeId" DROP NOT NULL; END IF; END $$`,
  // The current Prisma model allows reviewerId to be null. Older databases
  // made it mandatory, which caused P2011 when the submitting HR user did not
  // have a linked Employee profile. Keep the legacy column, but align its
  // nullability with the current model.
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PerformanceReview' AND column_name='reviewerId') THEN ALTER TABLE "PerformanceReview" ALTER COLUMN "reviewerId" DROP NOT NULL; END IF; END $$`,
];

async function syncPerformanceReviewTable(db: { $executeRawUnsafe: (sql: string) => Promise<unknown> }): Promise<void> {
  try {
    for (const sql of PERF_REVIEW_SYNC_STATEMENTS) {
      try { await db.$executeRawUnsafe(sql); } catch { /* already exists */ }
    }
  } catch { /* non-fatal — never block the request on sync */ }
}

/**
 * GET /api/employees/probation
 *
 * Returns probation review records. We store probation reviews as
 * PerformanceReview entries with reviewCycle='Probation'. This avoids
 * creating a separate Probation table while keeping the data model clean.
 *
 * Query params:
 *   ?employeeId=<id>  — filter by employee
 *   ?status=<status>  — filter by status (pending, in_progress, completed)
 *   ?page=<n>         — pagination (default 1)
 *   ?limit=<n>        — page size (default 20)
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');

    // ─── Inline schema-sync for PerformanceReview table ───
    // Ensures the table + ALL model columns exist (fixes P2022 on tenant DBs
    // that haven't been synced, and upgrades legacy table shapes).
    await syncPerformanceReviewTable(db);

    const where: Record<string, unknown> = {
      reviewCycle: 'Probation',
    };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    // ─── Use raw SQL for maximum compatibility across tenant DBs ───
    // Previously this used db.performanceReview.findMany() which can fail
    // silently on tenant DBs where the Prisma client hasn't been regenerated
    // with the latest schema. Raw SQL is more reliable.
    let reviews: any[] = [];
    let total = 0;
    try {
      // Build raw SQL query
      const conditions: string[] = [`pr."reviewCycle" = 'Probation'`];
      const params: unknown[] = [];
      if (employeeId) {
        params.push(employeeId);
        conditions.push(`pr."employeeId" = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`pr."status" = $${params.length}`);
      }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Count total
      try {
        const countRows = await db.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS count FROM "PerformanceReview" pr ${whereClause}`,
          ...params,
        ) as any[];
        total = countRows?.[0]?.count || 0;
      } catch (countErr) {
        console.error('[Probation GET] count failed:', countErr);
        total = 0;
      }

      // Fetch rows with employee join
      const offset = (page - 1) * limit;
      const queryParams = [...params, limit, offset];
      reviews = await db.$queryRawUnsafe(
        `SELECT pr.*,
           e."firstName" AS "empFirstName",
           e."lastName"  AS "empLastName",
           e."employeeId" AS "empCode",
           e."dateOfJoining" AS "empDateOfJoining",
           e."avatar" AS "empAvatar",
           d."name" AS "deptName",
           des."title" AS "desgTitle"
         FROM "PerformanceReview" pr
         LEFT JOIN "Employee" e ON e."id" = pr."employeeId"
         LEFT JOIN "Department" d ON d."id" = e."departmentId"
         LEFT JOIN "Designation" des ON des."id" = e."designationId"
         ${whereClause}
         ORDER BY pr."createdAt" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...queryParams,
      ) as any[];
    } catch (queryErr) {
      const errObj = queryErr as { code?: string; message?: string };
      console.error('[Probation GET] query failed:', errObj);
      // If the table doesn't exist or query fails, return empty list instead of erroring
      return NextResponse.json({
        probations: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        _debug: { error: errObj.message, code: errObj.code },
      }, { headers: corsHeaders() });
    }

    // Map PerformanceReview records to the probation shape expected by the UI
    const probations = reviews.map(r => {
      const review = (r as any);
      // Parse comments as JSON if it looks like JSON (we store the full form as JSON)
      let probationData: any = {};
      try {
        if (review.comments && review.comments.startsWith('{')) {
          probationData = JSON.parse(review.comments);
        }
      } catch { /* not JSON — treat as plain comment */ }

      // Build employee name from the joined employee columns
      const empFirstName = review.empFirstName || review.employee?.firstName || '';
      const empLastName = review.empLastName || review.employee?.lastName || '';
      const employeeName = `${empFirstName} ${empLastName}`.trim() || 'Unknown';
      const employeeCode = review.empCode || review.employee?.employeeId || '—';
      const departmentName = review.deptName || review.employee?.department?.name || '—';
      const designationTitle = review.desgTitle || review.employee?.designation?.title || '—';

      // Calculate probation end date from start date + period + extension
      let endDate: string | null = null;
      const startDateStr = probationData.probationStartDate || null;
      if (startDateStr && probationData.probationPeriod) {
        try {
          const start = new Date(startDateStr);
          const end = new Date(start);
          end.setMonth(end.getMonth() + Number(probationData.probationPeriod) + Number(probationData.extensionPeriod || 0));
          endDate = end.toISOString();
        } catch { /* invalid date */ }
      }

      return {
        id: review.id,
        employeeId: review.employeeId,
        employee: review.employee || (empFirstName ? {
          id: review.employeeId,
          firstName: empFirstName,
          lastName: empLastName,
          employeeId: employeeCode,
          avatar: review.empAvatar,
          department: { name: departmentName },
          designation: { title: designationTitle },
        } : null),
        // UI-expected fields (ProbationRecord interface)
        employeeName,
        employeeCode,
        startDate: startDateStr,
        endDate,
        probationPeriod: Number(probationData.probationPeriod) || 0,
        // Probation-specific fields (stored in comments JSON)
        probationStartDate: probationData.probationStartDate || null,
        extensionPeriod: probationData.extensionPeriod || 0,
        performanceRating: probationData.performanceRating || review.overallRating || 0,
        reviewComments: probationData.reviewComments || '',
        kpiStatus: probationData.kpiStatus || 'pending',
        decision: probationData.decision || 'pending',
        effectiveDate: probationData.effectiveDate || null,
        confirmationLetter: probationData.confirmationLetter || null,
        payrollEligible: probationData.payrollEligible === true,
        payrollEligibilityDate: probationData.payrollEligibilityDate || null,
        statusHistory: Array.isArray(probationData.statusHistory) ? probationData.statusHistory : [],
        notificationHistory: Array.isArray(probationData.notificationHistory) ? probationData.notificationHistory : [],
        // Workflow fields
        workflowStage: probationData.workflowStage || 'hr_review',
        hrDecision: probationData.hrDecision || null,
        hrComments: probationData.hrComments || '',
        hrActionDate: probationData.hrActionDate || null,
        mdAction: probationData.mdAction || null,
        mdComments: probationData.mdComments || '',
        mdActionDate: probationData.mdActionDate || null,
        autoCreated: probationData.autoCreated || false,
        // Extra fields for richer display
        department: departmentName,
        designation: designationTitle,
        // Standard review fields
        status: review.status,
        reviewDate: review.reviewDate,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      };
    });

    return NextResponse.json(
      { probations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get probations error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * POST /api/employees/probation
 *
 * Creates a probation review record. We store this as a PerformanceReview
 * with reviewCycle='Probation'. The full probation form data (probationStartDate,
 * probationPeriod, extensionPeriod, performanceRating, reviewComments, kpiStatus,
 * decision, effectiveDate, confirmationLetter) is serialized as JSON in the
 * `comments` field so it can be retrieved later.
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      employeeId,
      probationStartDate,
      probationPeriod,
      extensionPeriod,
      performanceRating,
      reviewComments,
      kpiStatus,
      decision,
      effectiveDate,
      confirmationLetter,
    } = body;

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── Task 65 BUG FIX: prevent duplicate probation reviews ───
    // Check if an active (non-archived) probation review already exists for
    // this employee. If so, reject with a clear validation message.
    const existingReview = await db.performanceReview.findFirst({
      where: {
        employeeId,
        reviewCycle: 'Probation',
        status: { in: ['pending', 'approved', 'active', 'in_progress'] }, // NOT rejected/archived/completed
      },
      select: { id: true, status: true, createdAt: true },
    }).catch(() => null);
    if (existingReview) {
      return NextResponse.json(
        { error: `An active probation review already exists for this employee (status: ${existingReview.status}, created: ${new Date(existingReview.createdAt).toLocaleDateString()}). Please resolve or archive the existing review before submitting a new one.` },
        { status: 409, headers: corsHeaders() }
      );
    }

    // ─── Task 65 BUG FIX: block normal review for confirmed employees ───
    // If the employee's status is 'confirmed' (probation completed), they
    // should not be eligible for another normal probation review.
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeId: true, employeeStatus: true, status: true, firstName: true, lastName: true, dateOfJoining: true, userId: true, email: true, department: { select: { name: true } } },
    }).catch(() => null);
    if (!employee) {
      // QA P2011 hardening: a bogus employeeId used to fall through to the
      // create and explode as a DB-level error. Fail fast with a clear message.
      return NextResponse.json(
        { error: 'Employee not found for this probation review. Please select a valid employee and try again.' },
        { status: 400, headers: corsHeaders() }
      );
    }
    if (!probationStartDate || !probationPeriod) {
      return NextResponse.json({ error: 'Probation start date and probation period are required.' }, { status: 400, headers: corsHeaders() });
    }
    const { validateEffectiveDate, appendProbationHistory } = await import('@/lib/probation-workflow');
    const effectiveDateError = validateEffectiveDate(effectiveDate, employee.dateOfJoining);
    if (effectiveDateError) {
      return NextResponse.json({ error: effectiveDateError }, { status: 400, headers: corsHeaders() });
    }
    const empStatus = employee.employeeStatus || employee.status;
    if (empStatus === 'confirmed' && decision !== 'extend' && decision !== 'terminate') {
      return NextResponse.json(
        { error: `${employee.firstName} ${employee.lastName} has already completed probation (status: confirmed). A normal probation review cannot be submitted for confirmed employees. Use "Extend" or "Terminate" if you need to take action.` },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── Task 65: sanitize free-text fields (reviewComments, etc.) ───
    const { sanitizeMultiLineText } = await import('@/lib/sanitize');
    const cleanReviewComments = sanitizeMultiLineText(reviewComments, 5000);

    // ─── Inline schema-sync for PerformanceReview table ───
    await syncPerformanceReviewTable(db);

    // Serialize the full probation form data as JSON in the comments field
    // so we can retrieve all probation-specific fields later
    const probationPayload: Record<string, unknown> = {
      probationStartDate,
      probationPeriod,
      extensionPeriod: extensionPeriod || 0,
      performanceRating: performanceRating || 0,
      reviewComments: cleanReviewComments || '',
      kpiStatus: kpiStatus || 'pending',
      decision: decision || 'pending',
      effectiveDate: effectiveDate || null,
      confirmationLetter: confirmationLetter || null,
      workflowStage: 'hr_review',
      tierIndex: 1,
    };
    appendProbationHistory(probationPayload, {
      action: 'submitted', actorId: String(decoded.userId), actorRole: String(decoded.role || 'employee'),
      comments: cleanReviewComments, fromStatus: 'draft', toStatus: 'pending',
    });
    const probationData = JSON.stringify(probationPayload);

    // Map decision → submitted status
    // When an employee/manager submits a probation review, it goes to HR/Admin
    // for approval. The status is always 'pending' on submission.
    // HR/Admin can then approve (confirm), extend, or reject via the [id] route.
    const status = 'pending'; // Always pending on submission — goes to HR for review

    // Preserve the submitting HR user's Employee id when one exists. The
    // current model makes reviewerId optional, so a valid HR/User account can
    // submit even when it has not been linked to an Employee profile yet.
    const reviewerEmployee = await db.employee.findFirst({
      where: { userId: String(decoded.userId) },
      select: { id: true },
    }).catch(() => null);

    // Null-safe create data: every NOT NULL column gets an explicit, typed
    // value so Prisma never sends NULL where the DB forbids it (QA P2011 fix).
    const createData = {
      employeeId,
      reviewCycle: 'Probation',
      reviewPeriod: probationPeriod ? `Probation (${probationPeriod} months)` : 'Probation',
      reviewerId: reviewerEmployee?.id || null,
      rating: Number(performanceRating) || 0,
      overallRating: Number(performanceRating) || 0,
      comments: probationData,
      strengths: null,
      improvements: null,
      status, // 'pending' — submitted for HR review
      reviewDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    };

    let review;
    try {
      review = await db.performanceReview.create({
        data: createData,
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeId: true },
          },
        },
      });
    } catch (createErrRaw) {
      const createErr = createErrRaw as { code?: string; message?: string; meta?: { field_name?: string; fields?: string[] } };
      console.error('[Probation POST] create failed:', createErr);
      // Retry only after the explicit, allow-listed schema sync above. Never
      // drop NOT NULL from an arbitrary column based on an exception string.
      let healed = false;
      try {
        if (createErr.code === 'P2011') {
          await syncPerformanceReviewTable(db);
          healed = true;
        } else if (createErr.code === 'P2021' || createErr.code === 'P2022' || createErr.code === 'P2023') {
          await syncPerformanceReviewTable(db);
          healed = true;
        }
      } catch (healErr) {
        console.error('[Probation POST] self-heal failed:', healErr);
      }
      if (!healed) {
        if (createErr.code === 'P2003') {
          return NextResponse.json({ error: 'The selected employee or reviewer account is not valid for this tenant. Please refresh the employee list and try again.' }, { status: 400, headers: corsHeaders() });
        }
        return NextResponse.json({ error: 'The probation review could not be saved because required review data is missing. Please verify the employee, dates, and review period.' }, { status: 400, headers: corsHeaders() });
      }
      try {
        review = await db.performanceReview.create({
          data: createData,
          include: {
            employee: {
              select: { firstName: true, lastName: true, employeeId: true },
            },
          },
        });
      } catch (retryError) {
        console.error('[Probation POST] create retry failed:', retryError);
        return NextResponse.json({ error: 'The probation review could not be saved. Please verify all required employee, date, period, rating, and comment fields.' }, { status: 400, headers: corsHeaders() });
      }
    }

    // Log to audit
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'CREATE_PROBATION_REVIEW',
          module: 'employees',
          details: `Created probation review for ${(review as any).employee?.firstName} ${(review as any).employee?.lastName} - Decision: ${decision}`,
        },
      });
    } catch { /* non-critical */ }

    /* local notification delivery retained alongside the shared dispatcher */
    // Probation Review Submitted → notify Employee + HR
    // (For extend/terminate/confirm, the [id] route handles the follow-up
    // notifications to MD/Employee. Here we just notify that the review
    // was submitted.)
    try {
      const { createNotification } = await import('@/lib/notifications');
      const { resolveRoleRecipients } = await import('@/lib/notification-center');
      const { sendTenantEmail } = await import('@/lib/notification-channels');
      const { ensureWorkflowConfig, resolveTierApprovers } = await import('@/lib/approverResolve');
      const empName = `${(review as any).employee?.firstName || ''} ${(review as any).employee?.lastName || ''}`.trim();
      const tenantId = (decoded as any).tenantId as string;
      const appOrigin = new URL(request.url).origin;
      const submittingUser = await db.user.findUnique({ where: { id: String(decoded.userId) }, select: { name: true, email: true } }).catch(() => null);
      const probationEnd = new Date(probationStartDate);
      probationEnd.setMonth(probationEnd.getMonth() + Number(probationPeriod || 0));
      const deliveryHistory: Array<Record<string, unknown>> = [];

      // Notify the employee
      if (employee && employee.id) {
        if (employee.userId) {
          await createNotification({
            tenantId,
            userId: employee.userId,
            title: 'Probation Review Submitted',
            message: `Your probation review has been submitted. Decision: ${decision || 'pending'}. HR will review and process it shortly.`,
            type: 'info',
            category: 'performance',
            link: '/employees/probation',
          }).catch(() => null);
        }
        const employeeEmailResult = employee.email ? await sendTenantEmail(db, tenantId, {
          to: employee.email,
          subject: 'Probation Review Submitted',
          html: `<p>Your probation review has been submitted and is pending HR review.</p>`,
        }).catch((error) => ({ success: false, error: error instanceof Error ? error.message : 'Email delivery failed' })) : null;
        deliveryHistory.push({ event: 'probation_submitted_employee', recipientUserId: employee.userId, recipientEmail: employee.email, inAppStatus: employee.userId ? 'sent' : 'skipped', emailStatus: employeeEmailResult?.success ? 'sent' : employee.email ? 'failed' : 'skipped', emailError: employeeEmailResult?.error || null, at: new Date().toISOString() });
      }

      // Notify the configured first-tier HR approver(s). Fall back to active
      // HR administrators only when the tenant has no resolvable assignment.
      const workflow = await ensureWorkflowConfig(db as Record<string, any>, request, 'probation_confirmation').catch(() => null);
      const assigned = workflow?.tiers?.[0]
        ? await resolveTierApprovers(db as Record<string, any>, workflow.tiers[0], employeeId).catch(() => null)
        : null;
      const submitterIsHr = ['admin', 'company_hr_admin', 'hr_admin', 'tenant_admin', 'super_admin'].includes(String(decoded.role || '').toLowerCase());
      const hrRecipients = submitterIsHr
        ? [String(decoded.userId)]
        : assigned?.userIds?.length
          ? assigned.userIds
          : await resolveRoleRecipients(db, ['admin', 'company_hr_admin', 'hr_admin', 'tenant_admin']);
      for (const userId of hrRecipients) {
        await createNotification({
          tenantId,
          userId,
          title: 'Action Required – Probation Review Pending',
          message: `Probation review for ${empName} (${employee.employeeId}) is waiting for HR action. Probation ends ${probationEnd.toLocaleDateString('en-IN')}. Status: Pending HR Review.`,
          type: 'info',
          category: 'performance',
          link: '/employees/probation',
        }).catch(() => null);
        const hrUser = await db.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null);
        const hrEmailResult = hrUser?.email ? await sendTenantEmail(db, tenantId, {
          to: hrUser.email,
          subject: userId === String(decoded.userId) ? `Probation Review Submitted — ${empName}` : `Action Required – Probation Review Pending`,
          html: `<p>Hi,</p><p>A probation review has been submitted${userId === String(decoded.userId) ? ' successfully' : ' and requires your review'}.</p><p><strong>Employee:</strong> ${empName}<br/><strong>Employee ID:</strong> ${employee.employeeId}<br/><strong>Department:</strong> ${employee.department?.name || '—'}<br/><strong>Probation End Date:</strong> ${probationEnd.toLocaleDateString('en-IN')}<br/><strong>Submitted By:</strong> ${submittingUser?.name || 'HR'}<br/><strong>Submitted On:</strong> ${new Date().toLocaleString('en-IN')}<br/><strong>Status:</strong> Pending HR Review</p><p><a href="${appOrigin}/employees/probation">View Probation Review</a></p>`,
        }).catch((error) => ({ success: false, error: error instanceof Error ? error.message : 'Email delivery failed' })) : null;
        deliveryHistory.push({ event: 'probation_submitted_hr', recipientUserId: userId, recipientEmail: hrUser?.email || null, inAppStatus: 'sent', emailStatus: hrEmailResult?.success ? 'sent' : hrUser?.email ? 'failed' : 'skipped', emailError: hrEmailResult?.error || null, at: new Date().toISOString() });
      }
      probationPayload.notificationHistory = deliveryHistory;
      await db.performanceReview.update({ where: { id: (review as any).id }, data: { comments: JSON.stringify(probationPayload) } }).catch(() => null);
    } catch { /* non-critical */ }
    // ─── Task 93 spec: employee status changes ONLY when the authorized
    // workflow action succeeds (final tier decision), never at submission.
    // The recommended decision ('terminate' etc.) is stored in the review
    // JSON and applied by the PATCH approval chain. A submission-time
    // audit entry documents the recommendation. ───
    if (decision === 'terminate' && employee) {
      try {
        await db.auditLog.create({
          data: {
            userId: decoded.userId as string,
            action: 'PROBATION_TERMINATE_RECOMMENDED',
            module: 'employees',
            details: `Probation review for ${employee.firstName} ${employee.lastName} recommends termination. Employee status will change only after the approval chain authorizes it.`,
          },
        });
      } catch { /* non-critical */ }
    }

    // ─── Task 93: Probation Review — Notification & Email Workflow ───
    // (1) Assigned HR (workflow tier 1 approvers, OTHER than the submitting
    //     HR user) get "Action Required – Probation Review Pending"
    //     (in-app + email via the Notification Center).
    // (2) The employee gets a "review submitted and under review" heads-up
    //     (unless employee-facing submission updates are disabled).
    // (3) The submitting HR user gets an in-app submission confirmation.
    // All dispatches are duplicate-guarded and recorded in
    // NotificationDelivery (audit trail).
    try {
      const { dispatchProbationEvent, resolveProbationTierRecipients, fmtDateTime } = await import('@/lib/probation-notify');
      const { loadWorkflowConfig } = await import('@/lib/approverResolve');
      const tenantId = (decoded as any).tenantId as string;
      const submitterId = (decoded as { userId?: string | null }).userId || null;
      const empName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
      const empCode = (review as any).employee?.employeeId || '—';
      const submittedOn = fmtDateTime(new Date());

      const wfCfg = await loadWorkflowConfig(db as Record<string, any>, request, 'probation_confirmation').catch(() => null);

      // (1) Assigned HR reviewers — tier 1 of the configured chain
      const hrRecipients = await resolveProbationTierRecipients(
        db as Record<string, any>, wfCfg?.tiers, 1, employeeId,
      );
      await dispatchProbationEvent({
        db: db as Record<string, any>,
        tenantId,
        eventKey: 'probation.review_submitted',
        reviewId: (review as any).id,
        employee: {
          id: employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeId: empCode,
        },
        recipients: hrRecipients,
        excludeUserIds: [submitterId], // spec: only if the recipient is a DIFFERENT HR user
        vars: {
          Probation_End_Date: probationStartDate ? fmtDateTime(probationStartDate).split(',')[0] : '—',
          Submitted_By: (decoded as any).name || 'HR',
          Submitted_On: submittedOn,
          Review_Status: 'Pending HR Review',
        },
        origin: request.headers.get('origin') || undefined,
      });

      // (2) Employee heads-up (unless disabled in the workflow configuration)
      const empUser = await db.employee.findUnique({
        where: { id: employeeId },
        select: { userId: true },
      }).catch(() => null);
      if (empUser?.userId) {
        await dispatchProbationEvent({
          db: db as Record<string, any>,
          tenantId,
          eventKey: 'probation.submitted_employee',
          reviewId: (review as any).id,
          employee: {
            id: employeeId,
            userId: empUser.userId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeId: empCode,
          },
          vars: {
            Submitted_By: (decoded as any).name || 'HR',
            Submitted_On: submittedOn,
            Review_Status: 'under review',
          },
          origin: request.headers.get('origin') || undefined,
        });
      }

      // (3) Submission confirmation to the submitting HR user (in-app)
      if (submitterId) {
        await dispatchProbationEvent({
          db: db as Record<string, any>,
          tenantId,
          eventKey: 'probation.submission_ack',
          reviewId: (review as any).id,
          employee: {
            id: employeeId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeId: empCode,
          },
          recipients: [{ userId: submitterId }],
          vars: {
            Submitted_On: submittedOn,
          },
          origin: request.headers.get('origin') || undefined,
        });
      }
      void empName;
    } catch (notifyErr) {
      console.warn('[Probation POST] notification dispatch failed (non-critical):', notifyErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Probation review submitted successfully. It has been sent to HR/Admin for approval.',
        probation: {
          id: (review as any).id,
          employeeId,
          probationStartDate,
          probationPeriod,
          extensionPeriod: extensionPeriod || 0,
          performanceRating: performanceRating || 0,
          reviewComments: reviewComments || '',
          kpiStatus: kpiStatus || 'pending',
          decision: decision || 'pending',
          effectiveDate,
          confirmationLetter,
          status: (review as any).status,
          createdAt: (review as any).createdAt,
        },
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create probation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}
