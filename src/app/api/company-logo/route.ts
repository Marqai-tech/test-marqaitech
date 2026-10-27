import { NextResponse } from 'next/server';
import { extractDomainFromCompanyName, getLogoProviderUrl, LOGO_PROVIDERS, DEFAULT_COMPANY_LOGO_DATA_URL } from '@/lib/company-logo';

/**
 * GET /api/company-logo?name=<company-name>[&provider=0|1|2]
 *
 * Resolves a company logo from a free-text company name. Flow:
 *   1. Extract domain via DOMAIN_HINTS map / heuristic.
 *   2. If domain cannot be resolved → return the default placeholder SVG.
 *   3. Otherwise, fetch the i-th provider URL (default 0 = Clearbit).
 *      - If the provider returns a 200 image → 302 redirect (browser caches).
 *      - If 404 / error → return JSON `{ tried: i+1, total: N, next: i+1 }`
 *        so the client can fall through to the next provider by calling
 *        the same endpoint with `?provider=i+1`.
 *   4. If all providers exhausted → return the default placeholder SVG.
 *
 * All providers are keyless (Clearbit Autologo, DuckDuckGo Icons, Google S2).
 *
 * Browser cache: 1 day. Future enhancement: Redis cache for the resolved
 * URL to avoid repeated outbound HTTP on every render.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').trim();
  const providerIdx = Math.max(0, Math.min(LOGO_PROVIDERS.length - 1, parseInt(searchParams.get('provider') || '0', 10) || 0));

  if (!name) {
    // No name supplied — return the placeholder SVG directly.
    return new NextResponse(DEFAULT_COMPANY_LOGO_DATA_URL, {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'image/svg+xml' },
    });
  }

  const domain = extractDomainFromCompanyName(name);
  if (!domain) {
    // Could not resolve a domain — return placeholder.
    return new NextResponse(DEFAULT_COMPANY_LOGO_DATA_URL, {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'image/svg+xml' },
    });
  }

  const providerUrl = getLogoProviderUrl(domain, providerIdx);
  if (!providerUrl) {
    // All providers exhausted — return placeholder.
    return new NextResponse(DEFAULT_COMPANY_LOGO_DATA_URL, {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'image/svg+xml' },
    });
  }

  // REQ 3 improvement: auto-fallback through remaining providers in this
  // single request. The original design returned 202 + {next: i+1} so the
  // client could retry, but in practice the client's retry added latency
  // and the 202 broke direct <img src="/api/company-logo?name=..."> usage.
  // Now we walk through providers server-side and return the first 200
  // image we find. If all fail, return the placeholder SVG.
  for (let idx = providerIdx; idx < LOGO_PROVIDERS.length; idx++) {
    const url = getLogoProviderUrl(domain, idx);
    if (!url) continue;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s per provider
      const probe = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': '3Boxes-HRMS-LogoProxy/1.0' },
      });
      clearTimeout(timeout);

      if (probe.ok) {
        const contentType = probe.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const bytes = await probe.arrayBuffer();
          return new NextResponse(bytes, {
            status: 200,
            headers: {
              ...corsHeaders(),
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
            },
          });
        }
      }
      // Non-200 or non-image — try next provider
    } catch {
      // Network error / timeout — try next provider
    }
  }

  // All providers exhausted — return placeholder SVG.
  return new NextResponse(DEFAULT_COMPANY_LOGO_DATA_URL, {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'image/svg+xml' },
  });
}
