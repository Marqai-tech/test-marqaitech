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
        status: { in: ['pending', 'approved', 'active'] }, // NOT rejected/archived
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
      select: { id: true, employeeStatus: true, status: true, firstName: true, lastName: true },
    }).catch(() => null);
    if (!employee) {
      // QA P2011 hardening: a bogus employeeId used to fall through to the
      // create and explode as a DB-level error. Fail fast with a clear message.
      return NextResponse.json(
        { error: 'Employee not found for this probation review. Please select a valid employee and try again.' },
        { status: 400, headers: corsHeaders() }
      );
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
    const probationData = JSON.stringify({
      probationStartDate,
      probationPeriod,
      extensionPeriod: extensionPeriod || 0,
      performanceRating: performanceRating || 0,
      reviewComments: cleanReviewComments || '',
      kpiStatus: kpiStatus || 'pending',
      decision: decision || 'pending',
      effectiveDate: effectiveDate || null,
      confirmationLetter: confirmationLetter || null,
    });

    // Map decision → submitted status
    // When an employee/manager submits a probation review, it goes to HR/Admin
    // for approval. The status is always 'pending' on submission.
    // HR/Admin can then approve (confirm), extend, or reject via the [id] route.
    let status = 'pending'; // Always pending on submission — goes to HR for review

    // Null-safe create data: every NOT NULL column gets an explicit, typed
    // value so Prisma never sends NULL where the DB forbids it (QA P2011 fix).
    const createData = {
      employeeId,
      reviewCycle: 'Probation',
      reviewPeriod: probationPeriod ? `Probation (${probationPeriod} months)` : 'Probation',
      reviewerId: (decoded as { userId?: string | null }).userId || null,
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
      // ─── QA P2011 self-heal ───
      // Null constraint violation is typically caused by a LEGACY NOT NULL
      // column the current Prisma model no longer knows about (e.g. cycleId
      // from the old schema). Relax that column and retry once so the review
      // saves instead of erroring. Missing table/column (P2021/P2022/P2023)
      // is healed by re-running the additive schema sync.
      let healed = false;
      try {
        if (createErr.code === 'P2011') {
          const fieldName = createErr.meta?.field_name
            || (createErr.meta?.fields && createErr.meta.fields[0])
            || (/fields?: \(`([^`]+)`\)/.exec(createErr.message || '')?.[1] ?? null);
          const REQUIRED_FIELDS = new Set(['id', 'employeeId', 'reviewCycle']);
          if (fieldName && !REQUIRED_FIELDS.has(fieldName)) {
            const safeCol = fieldName.replace(/"/g, '');
            await db.$executeRawUnsafe(`ALTER TABLE "PerformanceReview" ALTER COLUMN "${safeCol}" DROP NOT NULL`);
            console.warn(`[Probation POST] self-heal: dropped NOT NULL on PerformanceReview."${safeCol}" (legacy column) — retrying save`);
            healed = true;
          }
        } else if (createErr.code === 'P2021' || createErr.code === 'P2022' || createErr.code === 'P2023') {
          await syncPerformanceReviewTable(db);
          healed = true;
        }
      } catch (healErr) {
        console.error('[Probation POST] self-heal failed:', healErr);
      }
      if (!healed) {
        throw new Error(`Failed to save probation review: ${createErr.message || 'Unknown error'} (Code: ${createErr.code || 'N/A'})`);
      }
      review = await db.performanceReview.create({
        data: createData,
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeId: true },
          },
        },
      });
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

    // ─── Task 65 FIX: update Employee status when terminated via probation ───
    // When an employee is marked as Terminated through the probation review,
    // the employee's status should be updated to 'terminated' consistently
    // across the system (Employee List, Dashboard, etc.).
    if (decision === 'terminate' && employee) {
      try {
        await db.employee.update({
          where: { id: employeeId },
          data: { status: 'terminated', employeeStatus: 'terminated' },
        });
        console.log(`[Probation POST] Employee ${employeeId} status updated to 'terminated' via probation review`);
      } catch (statusErr) {
        console.warn('[Probation POST] Failed to update employee status to terminated:', statusErr);
      }
    }

    // ─── Task 65: send notifications based on decision ───
    // Probation Review Submitted → notify Employee + HR
    // (For extend/terminate/confirm, the [id] route handles the follow-up
    // notifications to MD/Employee. Here we just notify that the review
    // was submitted.)
    try {
      const { createNotification } = await import('@/lib/notifications');
      const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
      const empName = `${(review as any).employee?.firstName || ''} ${(review as any).employee?.lastName || ''}`.trim();
      const tenantId = (decoded as any).tenantId as string;

      // Notify the employee
      if (employee && employee.id) {
        // Get employee.userId for notification
        const empUser = await db.employee.findUnique({
          where: { id: employeeId },
          select: { userId: true },
        }).catch(() => null);
        if (empUser?.userId) {
          await createNotification({
            tenantId,
            userId: empUser.userId,
            title: 'Probation Review Submitted',
            message: `Your probation review has been submitted. Decision: ${decision || 'pending'}. HR will review and process it shortly.`,
            type: 'info',
            category: 'employees',
            link: '/employees/probation',
          }).catch(() => null);
        }
      }

      // Notify HR admins
      const hrRecipients = await resolveRoleRecipients(db, tenantId, ['admin', 'hr_admin', 'tenant_admin']);
      for (const r of hrRecipients) {
        await createNotification({
          tenantId,
          userId: r.userId,
          title: 'Probation Review Submitted',
          message: `A probation review has been submitted for ${empName}. Decision: ${decision || 'pending'}. Please review.`,
          type: 'info',
          category: 'employees',
          link: '/employees/probation',
        }).catch(() => null);
      }
    } catch { /* non-critical */ }

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
