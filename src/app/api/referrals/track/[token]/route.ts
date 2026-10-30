import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { ensureSchemaSynced, withSchemaSync } from '@/lib/schema-sync';

/**
 * GET /api/referrals/track/[token]
 *
 * Public (no-auth) endpoint that is hit every time someone opens a
 * trackable referral link (the URL an employee shares on WhatsApp /
 * LinkedIn / etc.).
 *
 * Behaviour:
 *   1. Look up the Referral by its `trackToken`.
 *   2. If found → increment `clickCount` and 302-redirect to
 *      `/careers?ref=<token>&jobId=<jobPostingId>` so the candidate
 *      lands on the careers page with the referral token already in
 *      the query string. The careers page stores it in form state and
 *      passes it to /api/public/apply, which marks the referral as
 *      `applied` once the candidate actually submits.
 *   3. If not found → redirect to /careers with no params (graceful
 *      fallback — broken link should never show a 404 to a candidate).
 *
 * No CORS preflight needed: this is a navigational GET, not an XHR.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Use the request origin for redirects (matches the domain the user
  // is browsing on). Falls back to env var, then localhost.
  const requestOrigin = (() => {
    try { return new URL(req.url).origin; } catch { return ''; }
  })();
  const baseUrl = requestOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const { token } = await params;

    if (!token || typeof token !== 'string') {
      return NextResponse.redirect(new URL('/careers', baseUrl));
    }

    // C-23 FIX: db was NEVER declared in the original code — the
    // `db.referral.update(...)` call at line 42 threw a ReferenceError
    // that was silently swallowed by `.catch(() => null)`, so clickCount
    // never incremented and the referral was never found. Now we properly
    // resolve the tenant DB from the request.
    const db = await getDb(req);
    await ensureSchemaSynced();

    // Find + atomic increment in a single UPDATE so concurrent clicks
    // don't get lost (Prisma's update() with {increment: {clickCount: 1}}
    // compiles to `UPDATE ... SET clickCount = clickCount + 1`).
    const referral = await withSchemaSync(() =>
      db.referral.update({
        where: { trackToken: token },
        data: { clickCount: { increment: 1 } },
        select: { id: true, jobPostingId: true, trackToken: true },
      })
    ).catch((e) => {
      console.warn('[Referrals track] update failed:', e instanceof Error ? e.message : e);
      return null;
    });

    if (!referral) {
      // Token not found — still send the visitor to the careers page
      // so they don't see a hard 404. No ?ref= param means no referral
      // attribution will happen on apply.
      return NextResponse.redirect(new URL('/careers', baseUrl));
    }

    // Build the destination URL: /careers?ref=<token>&jobId=<jobPostingId>
    const dest = new URL('/careers', baseUrl);
    dest.searchParams.set('ref', referral.trackToken);
    if (referral.jobPostingId) {
      dest.searchParams.set('jobId', referral.jobPostingId);
    }

    // 302 (temporary) so search engines don't cache the redirect target
    // — important for SEO because we want Google to index /careers,
    // not the tracking URL.
    return NextResponse.redirect(dest, 302);
  } catch (error) {
    console.error('Referrals track GET error:', error);
    // Last-ditch: send to /careers even on error.
    return NextResponse.redirect(new URL('/careers', baseUrl));
  }
}
