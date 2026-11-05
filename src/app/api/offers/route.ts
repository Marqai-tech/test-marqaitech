import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';

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

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const candidateId = searchParams.get('candidateId');
    const jobPostingId = searchParams.get('jobPostingId');
    const companyId = searchParams.get('companyId');
    const tenantId = searchParams.get('tenantId');

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    if (isSuperAdminWithoutScope(decoded, companyId, tenantId, request)) {
      return NextResponse.json({
        offers: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      }, { headers: corsHeaders() });
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (candidateId) where.candidateId = candidateId;
    if (jobPostingId) where.jobPostingId = jobPostingId;

    const [offers, total] = await Promise.all([
      db.offer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.offer.count({ where }),
    ]);

    return NextResponse.json(
      { offers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get offers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
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

    // Phase 13 fix: Only HR/Admin can create offers
    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded.role as string) || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can create offers' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const {
      candidateId, jobPostingId, candidateName, candidateEmail,
      position, department, offeredSalary, offeredCurrency,
      offeredCTC, salaryBreakdown, joiningDate, probationPeriod,
      reportingTo, jobApplicationId, // Task 167: link to JobApplication
      offerLetterUrl, // HR-uploaded softcopy of the offer letter (PDF data URL or external URL)
    } = body;

    if (!candidateId || !candidateName || !candidateEmail || !position || !offeredSalary || !joiningDate) {
      return NextResponse.json(
        { error: 'Missing required fields: candidateId, candidateName, candidateEmail, position, offeredSalary, joiningDate' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // C-22: Only allow creating an offer for a candidate whose JobApplication
    // status is 'offered'. This prevents HR from creating offers for candidates
    // who haven't gone through the interview → offered pipeline yet. The HR
    // Decision 'offer' action (which sets status='offered' AND creates the
    // draft offer in one call via interview-decision.ts) is exempt because it
    // sets the status first, then creates the offer.
    //
    // We skip this check when jobApplicationId is NOT provided (the offer
    // might be for an external candidate with no application record).
    if (jobApplicationId) {
      try {
        const appRows = await db.$queryRawUnsafe(
          `SELECT "status" FROM "JobApplication" WHERE "id" = $1 LIMIT 1`,
          jobApplicationId,
        ) as Array<{ status: string }>;
        if (appRows[0] && appRows[0].status !== 'offered') {
          return NextResponse.json(
            { error: `Cannot create an offer for this candidate — their application status is '${appRows[0].status}'. Only candidates with status 'offered' can receive an offer. Use the HR Decision 'Offer' action on the Interviews page to move them to 'offered' status first.` },
            { status: 400, headers: corsHeaders() }
          );
        }
        if (!appRows[0]) {
          // Application not found — block (fail safe, not fail open)
          return NextResponse.json(
            { error: 'The referenced job application was not found. Cannot create an offer for a non-existent application.' },
            { status: 400, headers: corsHeaders() }
          );
        }
      } catch (e) {
        // C-25 FIX: fail SAFE — block the offer creation if the status check
        // query fails. Previously the catch block allowed the offer through
        // (fail open), which let HR create offers on non-offered applications
        // when the SQL query threw an error.
        console.warn('[Offers POST] JobApplication status check FAILED — blocking offer creation (fail safe):', e instanceof Error ? e.message : e);
        return NextResponse.json(
          { error: 'Could not verify the candidate\'s application status. Please try again. If the problem persists, ensure the candidate\'s application exists and is in \'offered\' status.' },
          { status: 400, headers: corsHeaders() }
        );
      }
    }

    // Task 167: ensure jobApplicationId column exists on Offer at runtime
    if (jobApplicationId) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "jobApplicationId" TEXT`);
      } catch { /* already exists */ }
    }

    // C-21: ensure offerLetterUrl column exists on Offer at runtime. HR can
    // upload a softcopy of the offer letter (PDF) when creating or updating
    // an offer; the candidate downloads it from the portal / offer-acceptance
    // page after they e-sign.
    if (offerLetterUrl) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "offerLetterUrl" TEXT`);
      } catch { /* already exists */ }
    }

    const offer = await db.offer.create({
      data: {
        candidateId,
        jobPostingId,
        candidateName,
        candidateEmail,
        position,
        department,
        offeredSalary,
        offeredCurrency: offeredCurrency || 'INR',
        offeredCTC,
        salaryBreakdown,
        joiningDate: new Date(joiningDate),
        probationPeriod: probationPeriod ?? 90,
        reportingTo,
        status: 'draft',
      },
    }).catch(async (err) => {
      // RAW SQL fallback
      console.warn('[Offers POST] Prisma failed, trying RAW SQL:', err instanceof Error ? err.message : err);
      const id = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "Offer" ("id", "candidateId", "jobPostingId", "candidateName", "candidateEmail",
          "position", "department", "offeredSalary", "offeredCurrency", "offeredCTC", "salaryBreakdown",
          "joiningDate", "probationPeriod", "reportingTo", "status", "jobApplicationId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft', $15, NOW(), NOW())`,
        id, candidateId, jobPostingId || null, candidateName, candidateEmail,
        position, department || null, offeredSalary, offeredCurrency || 'INR', offeredCTC || null,
        salaryBreakdown || null, new Date(joiningDate), probationPeriod ?? 90, reportingTo || null,
        jobApplicationId || null,
      );
      return { id, ...body, status: 'draft' };
    });

    // Task 167: if jobApplicationId was provided, write it to the Offer row
    if (jobApplicationId && (offer as any).id) {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Offer" SET "jobApplicationId" = $1 WHERE "id" = $2`,
          jobApplicationId, (offer as any).id,
        );
      } catch { /* non-fatal */ }
    }

    // C-21: if an offer-letter softcopy was uploaded, persist it on the row.
    // Stored as a data URL (base64) or an external URL string.
    if (offerLetterUrl && (offer as any).id) {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Offer" SET "offerLetterUrl" = $1 WHERE "id" = $2`,
          String(offerLetterUrl).slice(0, 10 * 1024 * 1024), // cap at 10MB data URL
          (offer as any).id,
        );
      } catch (e) {
        console.warn('[Offers POST] Failed to persist offerLetterUrl:', e instanceof Error ? e.message : e);
      }
    }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_OFFER',
        module: 'offers',
        details: `Created offer for ${candidateName} - ${position}`,
      },
    });

    return NextResponse.json({ offer }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
