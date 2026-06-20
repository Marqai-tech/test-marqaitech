import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

/**
 * Combined middleware: i18n locale routing + tenant detection.
 *
 * 1. next-intl middleware runs first — detects locale from Accept-Language
 *    header or URL prefix, rewrites /es/login → /login with locale='es' in
 *    the request, and sets the `x-next-intl-locale` header.
 *
 * 2. Our tenant-detection logic runs on the (possibly rewritten) request —
 *    extracts the tenant slug from subdomain or ?tenant= query param, sets
 *    `x-tenant-slug` and `x-tenant-domain` headers for downstream use.
 *
 * 3. The combined response is returned with both locale + tenant context.
 */

const intlMiddleware = createMiddleware(routing)

function extractTenantSlug(request: NextRequest): string {
  // 1. ?tenant=xxx query param (explicit override — useful for testing)
  const fromQuery = request.nextUrl.searchParams.get('tenant')
  if (fromQuery) return fromQuery

  // 2. Subdomain extraction: <slug>.<root-domain>
  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase()
    if (sub && !['www', 'api', 'app', 'admin', 'mail', 'ftp'].includes(sub)) {
      return sub
    }
  }
  return ''
}

export default function middleware(request: NextRequest) {
  // 1. Run next-intl middleware first (handles locale detection + URL rewriting)
  const response = intlMiddleware(request)

  // 2. Add tenant headers to the response's request headers
  const tenantSlug = extractTenantSlug(request)
  const host = request.headers.get('host') || ''

  const requestHeaders = new Headers(request.headers)
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug)
  }
  requestHeaders.set('x-tenant-domain', host)

  // If intl middleware returned a NextResponse.next(), we can augment it
  // with our tenant headers. If it returned a rewrite/redirect, we still
  // want to add the tenant headers to the underlying request.
  if (response.headers) {
    // The response from intl middleware may include headers we want to keep
    // (e.g., Set-Cookie for locale preference). We just augment the request.
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
      headers: response.headers,
    })
  }

  return response
}

export const config = {
  // Run middleware on every page and API route except:
  //   - static assets (_next/static, _next/image, icons)
  //   - API routes (we don't want locale routing on /api/*)
  //   - service worker + manifest
  //   - Next 16 special files (icon-*, robots.txt, etc.)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-|robots.txt|sw.js|manifest.json|api).*)',
  ],
}
