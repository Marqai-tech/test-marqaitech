/**
 * Candidate Portal: Offer List + Respond API
 *
 *   GET   /api/candidate-portal/offers
 *         → lists all offers for the logged-in candidate (matched by email),
 *           across all tenant DBs
 *   POST  /api/candidate-portal/offers/[id]/respond
 *         → candidate records accept/decline + typed-name e-signature + optional
 *           signed-copy upload (base64 data URL)
 *
 * The candidate must be logged in (candidate_token). The candidate's email is
 * resolved from the JWT and used to scope the lookup — never trusts a body
 * field for the candidate identity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/candidate-portal/offers
 *
 * Returns offers for the logged-in candidate, scoped by email. The response
 * is the SAME shape as the public /api/offers/accept/[token] endpoint so the
 * candidate-portal UI can reuse the rendering logic.
 */
export async function GET(req: NextRequest) {
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ offers: [] }, { headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ offers: [] }, { headers: corsHeaders() });

    const candidateEmail = (decoded as Record<string, unknown>).email as string | undefined;
    if (!candidateEmail) return NextResponse.json({ offers: [] }, { headers: corsHeaders() });

    // Sweep all tenant DBs to find offers for this candidate email.
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true, name: true } } },
    });

    const allOffers: Array<Record<string, unknown>> = [];
    let companyName: string | null = null;
    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);
        const offers = await db.$queryRawUnsafe(
          `SELECT o."id", o."candidateName", o."candidateEmail", o."position", o."department",
                  o."offeredSalary", o."offeredCurrency", o."offeredCTC", o."joiningDate",
                  o."probationPeriod", o."reportingTo", o."status", o."generatedPdfUrl",
                  o."offerLetterUrl",
                  o."accessToken", o."respondedAt", o."candidateSignature", o."candidateSignedAt",
                  o."responseNotes", o."signedPdfUrl", o."sentAt", o."createdAt"
             FROM "Offer" o
            WHERE LOWER(o."candidateEmail") = LOWER($1)
              AND o."status" IN ('sent', 'accepted', 'rejected')
            ORDER BY o."createdAt" DESC`,
          candidateEmail,
        ).catch(() => []) as Array<Record<string, unknown>>;
        if (offers.length > 0) {
          // Pull the company name from the tenant for branding.
          if (!companyName) {
            try {
              const companyRows = await db.$queryRawUnsafe(
                `SELECT "name" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1`,
              ).catch(() => []) as Array<{ name?: string }>;
              companyName = companyRows[0]?.name || td.tenant?.name || null;
            } catch { companyName = td.tenant?.name || null; }
          }
          for (const o of offers) {
            allOffers.push({
              ...o,
              tenantName: td.tenant?.name || null,
              tenantSlug: td.tenant?.slug || null,
              companyName,
            });
          }
        }
      } catch { /* try next tenant */ }
    }

    return NextResponse.json({ offers: allOffers, companyName }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateOffers GET] error:', error);
    return NextResponse.json({ offers: [] }, { headers: corsHeaders() });
  }
}
