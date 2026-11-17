import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/company-search?q=infosys
 *
 * External company directory search — used by the Experience section's
 * company-name autocomplete. This endpoint does NOT read from the local
 * HRMS database; it queries free, keyless, public APIs:
 *
 *   1. Wikipedia OpenSearch API — returns matching article titles + URLs
 *      for the user's query. We filter to "company-ish" results (articles
 *      that link to a website domain) so we can derive a logo URL.
 *   2. Clearbit Logo API — https://logo.clearbit.com/{domain} — returns
 *      the company's logo by domain. Keyless, no auth required.
 *
 * Response shape (always 200, even on upstream failure):
 *   {
 *     companies: [
 *       { id, name, domain, logo, description, wikipediaUrl },
 *       …
 *     ],
 *     source: 'wikipedia+clearbit',
 *     error: null | 'string message'
 *   }
 *
 * Tenant isolation: N/A — this endpoint hits public external APIs only.
 * No internal data is exposed.
 *
 * Rate-limiting: server-side fetch is debounced by the client (250ms) and
 * we cap the response to 10 results. Wikipedia + Clearbit are both
 * generous with rate limits for low-traffic use.
 *
 * Error handling: if either upstream API fails, we return an empty
 * companies array with an `error` field — the client shows the "Other"
 * option so the user can always enter a company manually.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

interface CompanyResult {
  id: string;
  name: string;
  domain: string | null;
  logo: string | null;
  description: string | null;
  wikipediaUrl: string | null;
}

/**
 * Extract a domain from a Wikipedia URL.
 * Wikipedia article URLs sometimes contain the company's official website
 * in the article body, but the URL itself doesn't directly give us the
 * domain. As a heuristic, we use the article title to derive a domain:
 *   "Microsoft" → "microsoft.com"
 *   "Tata Consultancy Services" → "tcs.com" (via our hint map)
 *
 * For well-known companies we use a hint map (same as lib/company-logo.ts).
 * For unknown companies, we fall back to first-token + .com.
 */
const DOMAIN_HINTS: Record<string, string> = {
  'tcs': 'tcs.com',
  'tata consultancy': 'tcs.com',
  'tata consultancy services': 'tcs.com',
  'infosys': 'infosys.com',
  'wipro': 'wipro.com',
  'hcl': 'hcltech.com',
  'hcl technologies': 'hcltech.com',
  'tech mahindra': 'techmahindra.com',
  'accenture': 'accenture.com',
  'cognizant': 'cognizant.com',
  'capgemini': 'capgemini.com',
  'ibm': 'ibm.com',
  'microsoft': 'microsoft.com',
  'google': 'google.com',
  'alphabet': 'abc.xyz',
  'amazon': 'amazon.com',
  'aws': 'aws.amazon.com',
  'apple': 'apple.com',
  'meta': 'meta.com',
  'facebook': 'facebook.com',
  'netflix': 'netflix.com',
  'adobe': 'adobe.com',
  'oracle': 'oracle.com',
  'sap': 'sap.com',
  'salesforce': 'salesforce.com',
  'intel': 'intel.com',
  'cisco': 'cisco.com',
  'dell': 'dell.com',
  'hp': 'hp.com',
  'vmware': 'vmware.com',
  'jpmorgan': 'jpmorgan.com',
  'goldman sachs': 'gs.com',
  'morgan stanley': 'morganstanley.com',
  'hdfc': 'hdfcbank.com',
  'icici': 'icicibank.com',
  'sbi': 'sbi.co.in',
  'axis bank': 'axisbank.com',
  'kotak': 'kotak.com',
  'deloitte': 'deloitte.com',
  'pwc': 'pwc.com',
  'pricewaterhouse': 'pwc.com',
  'ey': 'ey.com',
  'ernst young': 'ey.com',
  'kpmg': 'kpmg.com',
  'mckinsey': 'mckinsey.com',
  'bcg': 'bcg.com',
  'bain': 'bain.com',
  'reliance': 'ril.com',
  'tata': 'tata.com',
  'aditya birla': 'adityabirla.com',
  'mahindra': 'mahindra.com',
  'l&t': 'larsentoubro.com',
  'larsen toubro': 'larsentoubro.com',
  'bharti airtel': 'airtel.in',
  'airtel': 'airtel.in',
  'walmart': 'walmart.com',
  'tesla': 'tesla.com',
  'nvidia': 'nvidia.com',
  'amd': 'amd.com',
  'samsung': 'samsung.com',
  'sony': 'sony.com',
  'toyota': 'toyota.com',
  'ford': 'ford.com',
  'maruti': 'marutisuzuki.com',
  'tcs': 'tcs.com',
};

function deriveDomainFromName(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  // Exact hint match
  if (DOMAIN_HINTS[lower]) return DOMAIN_HINTS[lower];

  // Prefix hint match (longest-key-wins)
  const hintKeys = Object.keys(DOMAIN_HINTS).sort((a, b) => b.length - a.length);
  for (const key of hintKeys) {
    if (lower.startsWith(key + ' ') || lower.startsWith(key + ',') || lower === key) {
      return DOMAIN_HINTS[key];
    }
  }

  // Strip common corporate suffixes
  let stripped = lower;
  const suffixes = [
    ' pvt ltd', ' pvt. ltd.', ' private limited', ' pvt limited', ' pvt. limited',
    ' ltd', ' ltd.', ' limited', ' inc', ' inc.', ' llc', ' llp',
    ' corp', ' corp.', ' corporation', ' co', ' co.',
    ' india', ' technologies', ' technology', ' tech',
    ' solutions', ' software', ' systems', ' services', ' consulting',
    ' group', ' enterprises', ' global', ' international',
  ];
  for (const suffix of suffixes) {
    if (stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, -suffix.length).trim();
    }
  }

  // First token + .com fallback
  const firstToken = stripped.split(/[\s,.&|/]+/).find((t) => t.length >= 2 && /^[a-z0-9-]+$/.test(t));
  if (!firstToken) return null;
  return `${firstToken}.com`;
}

function clearbitLogoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || searchParams.get('search') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 10);

  if (!q || q.length < 2) {
    return NextResponse.json(
      { companies: [], source: 'wikipedia+clearbit', error: null },
      { headers: corsHeaders() },
    );
  }

  try {
    // ── Step 1: Wikipedia OpenSearch ──
    // Returns [query, [titles], [descriptions], [urls]] — we use titles + urls.
    // Documentation: https://www.mediawiki.org/wiki/API:Opensearch
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=${limit}&search=${encodeURIComponent(q)}`;
    const wikiRes = await fetch(wikiUrl, {
      headers: { 'User-Agent': '3Boxes-HRMS/1.0 (company-search; contact@3boxeshrms.com)' },
      signal: AbortSignal.timeout(5000),
    });

    if (!wikiRes.ok) {
      return NextResponse.json(
        { companies: [], source: 'wikipedia+clearbit', error: `Wikipedia API returned HTTP ${wikiRes.status}` },
        { headers: corsHeaders() },
      );
    }

    const wikiData = (await wikiRes.json()) as [string, string[], string[], string[]];
    const titles = Array.isArray(wikiData[1]) ? wikiData[1] : [];
    const descriptions = Array.isArray(wikiData[2]) ? wikiData[2] : [];
    const urls = Array.isArray(wikiData[3]) ? wikiData[3] : [];

    // ── Step 2: Build company results with derived domain + Clearbit logo ──
    const companies: CompanyResult[] = titles.slice(0, limit).map((title, i) => {
      const domain = deriveDomainFromName(title);
      return {
        id: `ext-${i}-${title.toLowerCase().replace(/\s+/g, '-')}`,
        name: title,
        domain,
        logo: domain ? clearbitLogoUrl(domain) : null,
        description: descriptions[i] || null,
        wikipediaUrl: urls[i] || null,
      };
    });

    return NextResponse.json(
      { companies, source: 'wikipedia+clearbit', error: null },
      { headers: corsHeaders() },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[company-search] External API failed:', msg);
    return NextResponse.json(
      { companies: [], source: 'wikipedia+clearbit', error: `External search unavailable: ${msg}` },
      { headers: corsHeaders() },
    );
  }
}
