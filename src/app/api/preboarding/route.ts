import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced, withSchemaSync } from '@/lib/schema-sync';
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

    // Ensure the PreboardingCandidate table exists (P0 fix for missing model)
    await ensureSchemaSynced();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const companyId = searchParams.get('companyId');
    const tenantId = searchParams.get('tenantId');

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    if (isSuperAdminWithoutScope(decoded, companyId, tenantId, request)) {
      return NextResponse.json({
        candidates: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      }, { headers: corsHeaders() });
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { candidateName: { contains: search, mode: 'insensitive' } },
        { candidateEmail: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [candidates, total] = await Promise.all([
      db.preboardingCandidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.preboardingCandidate.count({ where }),
    ]);

    // Compute stats
    const allCandidates = await db.preboardingCandidate.findMany({
      select: { status: true },
    });

    const stats = {
      total: allCandidates.length,
      documentCollection: allCandidates.filter(c => c.status === 'document_collection').length,
      bgvInProgress: allCandidates.filter(c => c.status === 'bgv').length,
      readyToJoin: allCandidates.filter(c => c.status === 'provisioning' || c.status === 'asset_request').length,
      joined: allCandidates.filter(c => c.status === 'joined').length,
    };

    return NextResponse.json(
      {
        candidates,
        stats,
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
    console.error('Get preboarding candidates error:', error);
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

    const body = await request.json();
    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      jobTitle,
      departmentId,
      offeredSalary,
      currency,
      offerDate,
      joiningDate,
      notes,
      offerId,
      jobApplicationId,
      status,
    } = body;

    // C-007 fix: Enforce HR/Admin role for preboarding creation
    const HR_ROLES_PRE_CREATE = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES_PRE_CREATE.includes((decoded.role as string) || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can create preboarding records' }, { status: 403, headers: corsHeaders() });
    }

    // C-007 fix: Verify offer is accepted before creating preboarding.
    // STAGE-GUARD (E2E audit): the offer check previously ran ONLY when the
    // caller passed offerId — omitting offerId allowed preboarding records for
    // ANY candidate (even a freshly registered applicant with no offer at
    // all). The guard is now unconditional: when offerId is omitted we resolve
    // the candidate's most recent application and its latest offer and still
    // require that offer to be 'accepted'. If no accepted offer exists the
    // request is refused and NOTHING is created.
    let effectiveOfferId: string | null = offerId || null;
    let effectiveJobApplicationId: string | null = jobApplicationId || null;
    try {
      if (effectiveOfferId) {
        const offerRow = await db.$queryRawUnsafe(
          `SELECT "status", "candidateEmail", "jobApplicationId" FROM "Offer" WHERE "id" = $1 LIMIT 1`, effectiveOfferId,
        ) as any[];
        if (!offerRow[0]) {
          return NextResponse.json({ error: 'Referenced offer not found' }, { status: 404, headers: corsHeaders() });
        }
        if (offerRow[0].status !== 'accepted') {
          return NextResponse.json({ error: 'Preboarding can only start from an accepted offer. Current offer status: ' + offerRow[0].status }, { status: 400, headers: corsHeaders() });
        }
        if (offerRow[0].candidateEmail && candidateEmail && offerRow[0].candidateEmail.toLowerCase() !== String(candidateEmail).toLowerCase()) {
          return NextResponse.json({ error: 'Candidate email does not match the accepted offer' }, { status: 400, headers: corsHeaders() });
        }
        effectiveJobApplicationId = effectiveJobApplicationId || offerRow[0].jobApplicationId || null;
      } else {
        // No offerId supplied — resolve from the candidate's application trail.
        if (!candidateEmail) {
          return NextResponse.json({ error: 'candidateEmail is required to initiate preboarding' }, { status: 400, headers: corsHeaders() });
        }
        const appRows = await db.$queryRawUnsafe(
          `SELECT "id", "status" FROM "JobApplication" WHERE LOWER("candidateEmail") = LOWER($1) ORDER BY "appliedDate" DESC LIMIT 1`,
          String(candidateEmail),
        ) as any[];
        if (!appRows[0]) {
          return NextResponse.json({ error: 'No job application found for this candidate — preboarding cannot start without an accepted offer.' }, { status: 400, headers: corsHeaders() });
        }
        effectiveJobApplicationId = effectiveJobApplicationId || appRows[0].id;
        const offRows = await db.$queryRawUnsafe(
          `SELECT "id", "status" FROM "Offer" WHERE "jobApplicationId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
          appRows[0].id,
        ) as any[];
        if (!offRows[0]) {
          return NextResponse.json({ error: 'No offer exists for this candidate — preboarding requires an accepted offer first.' }, { status: 400, headers: corsHeaders() });
        }
        if (offRows[0].status !== 'accepted') {
          return NextResponse.json({ error: 'Preboarding can only start from an accepted offer. Current offer status: ' + offRows[0].status }, { status: 400, headers: corsHeaders() });
        }
        effectiveOfferId = offRows[0].id;
        // Cross-check: the resolved offer must belong to the SAME candidate email.
        const offEmailRows = await db.$queryRawUnsafe(
          `SELECT "candidateEmail" FROM "Offer" WHERE "id" = $1 LIMIT 1`, effectiveOfferId,
        ) as any[];
        if (offEmailRows[0]?.candidateEmail && candidateEmail && offEmailRows[0].candidateEmail.toLowerCase() !== String(candidateEmail).toLowerCase()) {
          return NextResponse.json({ error: 'Candidate email does not match the accepted offer' }, { status: 400, headers: corsHeaders() });
        }
      }

      // Dedup: one live preboarding record per candidate email + accepted offer.
      const dupRows = await db.$queryRawUnsafe(
        `SELECT "id" FROM "PreboardingCandidate" WHERE LOWER("candidateEmail") = LOWER($1) AND "offerId" = $2 AND "cancelledAt" IS NULL LIMIT 1`,
        String(candidateEmail || ''), effectiveOfferId,
      ) as any[];
      if (dupRows[0]) {
        return NextResponse.json({ error: 'Preboarding has already been initiated for this candidate and offer', existingId: dupRows[0].id }, { status: 409, headers: corsHeaders() });
      }
    } catch (guardErr: unknown) {
      if (guardErr && typeof guardErr === 'object' && 'status' in guardErr) throw guardErr;
      // Infrastructure errors only (schema not synced yet) — the business
      // guards above always return directly.
      console.warn('[preboarding] guard lookup skipped:', guardErr instanceof Error ? guardErr.message : guardErr);
    }

    if (!candidateName || !candidateEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: candidateName, candidateEmail' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Ensure the PreboardingCandidate table exists before creating
    await ensureSchemaSynced();

    const candidate = await withSchemaSync(() =>
      db.preboardingCandidate.create({
        data: {
          candidateName,
          candidateEmail,
          candidatePhone: candidatePhone || null,
          jobTitle: jobTitle || null,
          departmentId: departmentId || null,
          offeredSalary: offeredSalary ? parseFloat(String(offeredSalary)) : null,
          currency: currency || 'INR',
          offerDate: offerDate ? new Date(offerDate) : new Date(),
          joiningDate: joiningDate ? new Date(joiningDate) : null,
          notes: notes || null,
          offerId: effectiveOfferId,
          jobApplicationId: effectiveJobApplicationId,
          status: status || 'offer_accepted',
          documentsUploaded: null,
          backgroundCheckStatus: 'pending',
          backgroundCheckNotes: null,
          hrVerified: false,
          accountProvisioned: false,
        },
      })
    );

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PREBOARDING_CANDIDATE',
        module: 'preboarding',
        details: `Created preboarding candidate: ${candidateName}`,
      },
    });

    return NextResponse.json(
      { candidate },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create preboarding candidate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
