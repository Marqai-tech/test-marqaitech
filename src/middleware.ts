import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Combined middleware: i18n locale detection + tenant detection.
 *
 * IMPORTANT: We intentionally do NOT use next-intl's createMiddleware here.
 *
 * Why: next-intl's middleware expects the app to be structured under
 * `app/[locale]/`. With `localePrefix: 'as-needed'`, it rewrites
 * `/login` → `/en/login` INTERNALLY (server-side). Since our app uses
 * `app/login/`, `app/(dashboard)/`, etc. — with NO `[locale]` segment —
 * the rewritten path `/en/login` doesn't match any route, and Next.js
 * returns 404 for EVERY page. This was the root cause of the
 * 2026-06-21 production outage on 3boxes-hrms-mu.vercel.app.
 *
 * Fix: implement locale detection OURSELVES. We:
 *   1. Read NEXT_LOCALE cookie (set when user explicitly switches locale)
 *   2. Fall back to Accept-Language header
 *   3. Fall back to default locale ('en')
 *   4. Set the `x-next-intl-locale` request header so next-intl's
 *      `getLocale()` and `getMessages()` in layout.tsx work correctly.
 *   5. Set the NEXT_LOCALE cookie if not already set (so future requests
 *      remember the user's locale).
 *
 * We ALSO keep the existing tenant-detection logic (subdomain / ?tenant= query).
 *
 * No URL rewriting happens — `/login` stays `/login`, `/dashboard` stays
 * `/dashboard`. Locale is a runtime concept, not a URL structure.
 *
 * PRODUCTION (Vercel): Subdomain routing works like this:
 *   - 3boxeshrms.com          → main site (super admin login)
 *   - marqaitechgroup.3boxeshrms.com → tenant "marqaitechgroup" login
 *   - *.3boxeshrms.com        → any tenant subdomain
 */

const LOCALES = ['en', 'es', 'fr', 'de', 'hi', 'ar'] as const;
const DEFAULT_LOCALE = 'en';

// Root domain for multi-tenant subdomain resolution
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '3boxeshrms.com';

// Subdomains that should NOT be treated as tenant slugs
const RESERVED_SUBDOMAINS = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'localhost', 'staging', 'dev', 'test'];

// API routes that need tenant context headers (x-tenant-slug, x-tenant-domain)
const TENANT_AWARE_API_PREFIXES = [
  '/api/auth/',
  '/api/public/',
  '/api/rbac/',
  '/api/fix-tenant',
  '/api/trial/',
];

function isSupportedLocale(loc: string | undefined | null): loc is typeof LOCALES[number] {
  return !!loc && (LOCALES as readonly string[]).includes(loc);
}

function detectLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;

  const acceptLang = request.headers.get('accept-language') || '';
  const candidates = acceptLang
    .split(',')
    .map((part) => part.trim().split(';')[0].toLowerCase())
    .map((tag) => tag.split('-')[0]);
  for (const lang of candidates) {
    if (isSupportedLocale(lang)) return lang;
  }

  return DEFAULT_LOCALE;
}

function extractTenantSlug(request: NextRequest): string {
  const fromQuery = request.nextUrl.searchParams.get('tenant');
  if (fromQuery) return fromQuery;

  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.replace(`.${ROOT_DOMAIN}`, '').toLowerCase();
    if (sub && !RESERVED_SUBDOMAINS.includes(sub)) return sub;
  }

  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    if (sub && !RESERVED_SUBDOMAINS.includes(sub)) return sub;
  }

  return '';
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith('/api/');

  // For API routes: only process those that need tenant context
  if (isApiRoute) {
    const needsTenantContext = TENANT_AWARE_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
    if (!needsTenantContext) {
      // Skip middleware for most API routes (performance)
      return NextResponse.next();
    }
  }

  // 1. Detect locale
  const locale = detectLocale(request);

  // 2. Extract tenant slug
  const tenantSlug = extractTenantSlug(request);
  const host = request.headers.get('host') || '';

  // 3. Build augmented request headers
  const requestHeaders = new Headers(request.headers);
  if (!isApiRoute) {
    requestHeaders.set('x-next-intl-locale', locale);
  }
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }
  requestHeaders.set('x-tenant-domain', host);

  // 4. Continue with the SAME URL + augmented headers
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // 5. Persist locale cookie (non-API only)
  if (!isApiRoute) {
    const existingCookie = request.cookies.get('NEXT_LOCALE')?.value;
    if (existingCookie !== locale) {
      response.cookies.set('NEXT_LOCALE', locale, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return response;
}

export const config = {
  // Run middleware on every page route and selected API routes.
  // Static assets, images, service worker, manifest are excluded.
  // Most API routes skip through quickly for performance.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-|robots.txt|sw.js|manifest.json).*)',
  ],
}
