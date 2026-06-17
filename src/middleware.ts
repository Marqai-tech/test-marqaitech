import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Tenant-aware middleware.
 *
 * Multi-tenancy in this HRMS works at TWO levels:
 *
 *   1. ROW-LEVEL SCOPING (already enforced in the API layer):
 *      Every authenticated API request reads `tenantId` from the JWT and
 *      scopes all DB queries to that tenant. This means a tenant_admin can
 *      never see another tenant's data, regardless of which hostname they
 *      log in from.
 *
 *   2. HOSTNAME-BASED TENANT DETECTION (this middleware):
 *      When a candidate opens `acme.3boxeshrms.com/careers` (or a tenant's
 *      own custom domain like `careers.acme.com`), we want to auto-detect
 *      the tenant from the hostname and surface it as a request header so
 *      public pages and APIs can pre-filter to that tenant.
 *
 * The middleware sets two headers on every request:
 *   - `x-tenant-slug`:   the tenant slug inferred from the hostname (or empty)
 *   - `x-tenant-domain`: the full hostname (for logging / debugging)
 *
 * Public pages (like /careers) and public APIs (like /api/public/jobs) can
 * read these headers to auto-scope their results, even before any JWT is
 * presented. Authenticated APIs continue to use the JWT's tenantId for
 * authorization — these headers are ONLY a UX hint for public surfaces.
 *
 * The hostname → tenant mapping is intentionally simple: it looks for a
 * `?tenant=<slug>` query param first (highest priority), then checks the
 * first subdomain segment (e.g. `acme.app.com` → `acme`). The actual
 * resolution to a real tenant in the DB happens in the API route — the
 * middleware just passes along the hint.
 */
function extractTenantSlug(request: NextRequest): string {
  // 1. ?tenant=xxx query param (explicit override — useful for testing)
  const fromQuery = request.nextUrl.searchParams.get('tenant')
  if (fromQuery) return fromQuery

  // 2. Subdomain extraction: <slug>.<root-domain>
  //    Examples:
  //      acme.3boxeshrms.com        → acme
  //      acme-staffing.3boxeshrms.com → acme-staffing
  //      careers.acme.com            → acme       (only first subdomain used)
  //      localhost / 3boxeshrms.com  → ''         (no subdomain)
  const host = request.headers.get('host') || ''
  // Strip port
  const hostname = host.split(':')[0]
  // Split on dots
  const parts = hostname.split('.')
  // Need at least 3 parts (subdomain.domain.tld) to have a subdomain
  // For 2-part hosts like `3boxeshrms.com` or `localhost`, there's no subdomain
  if (parts.length >= 3) {
    // Skip well-known non-tenant subdomains
    const sub = parts[0].toLowerCase()
    if (sub && !['www', 'api', 'app', 'admin', 'mail', 'ftp'].includes(sub)) {
      return sub
    }
  }
  return ''
}

export default function middleware(request: NextRequest) {
  const tenantSlug = extractTenantSlug(request)
  const host = request.headers.get('host') || ''

  // Clone the request and add tenant headers. These are read by:
  //   - /api/public/jobs (auto-filters by tenantSlug if present)
  //   - /careers page (auto-scopes job listings)
  //   - /login page (pre-fills the tenant field — future enhancement)
  const requestHeaders = new Headers(request.headers)
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug)
  }
  requestHeaders.set('x-tenant-domain', host)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  // Run middleware on every page and API route except static assets.
  // We intentionally include `careers` and `api` here so the tenant headers
  // are available to the public careers page and the public jobs API.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|robots.txt|sw.js|manifest.json).*)'],
}
