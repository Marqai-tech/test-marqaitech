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
 * PRODUCTION (Hostinger): Subdomain routing works like this:
 *   - 3boxeshrms.com          → main site (super admin login)
 *   - marqaitechgroup.3boxeshrms.com → tenant "marqaitechgroup" login
 *   - *.3boxeshrms.com        → any tenant subdomain
 */

const LOCALES = ['en', 'es', 'fr', 'de', 'hi', 'ar'] as const;
const DEFAULT_LOCALE = 'en';

// Root domain for multi-tenant subdomain resolution
// In production on Hostinger, this will be '3boxeshrms.com'
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '3boxeshrms.com';

// Subdomains that should NOT be treated as tenant slugs
const RESERVED_SUBDOMAINS = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'localhost', 'staging', 'dev', 'test'];

function isSupportedLocale(loc: string | undefined | null): loc is typeof LOCALES[number] {
  return !!loc && (LOCALES as readonly string[]).includes(loc);
}

function detectLocale(request: NextRequest): string {
  // 1. NEXT_LOCALE cookie (user has explicitly chosen a locale)
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Accept-Language header (browser preference)
  const acceptLang = request.headers.get('accept-language') || '';
  const candidates = acceptLang
    .split(',')
    .map((part) => part.trim().split(';')[0].toLowerCase())
    .map((tag) => tag.split('-')[0]); // 'en-US' → 'en'
  for (const lang of candidates) {
    if (isSupportedLocale(lang)) {
      return lang;
    }
  }

  // 3. Default
  return DEFAULT_LOCALE;
}

function extractTenantSlug(request: NextRequest): string {
  // 1. ?tenant=xxx query param (explicit override — useful for testing)
  const fromQuery = request.nextUrl.searchParams.get('tenant');
  if (fromQuery) return fromQuery;

  // 2. Subdomain extraction: <slug>.<root-domain>
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0]; // strip port

  // Check if this is a subdomain of our root domain
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.replace(`.${ROOT_DOMAIN}`, '').toLowerCase();
    if (sub && !RESERVED_SUBDOMAINS.includes(sub)) {
      return sub;
    }
  }

  // 3. Generic subdomain extraction (for Vercel preview, localhost with port, etc.)
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    if (sub && !RESERVED_SUBDOMAINS.includes(sub)) {
      return sub;
    }
  }

  return '';
}

export function middleware(request: NextRequest) {
  // 1. Detect locale (cookie → Accept-Language → default)
  const locale = detectLocale(request);

  // 2. Extract tenant slug (subdomain or ?tenant=)
  const tenantSlug = extractTenantSlug(request);
  const host = request.headers.get('host') || '';

  // 3. Build augmented request headers
  const requestHeaders = new Headers(request.headers);
  // next-intl's getLocale() reads this header (set by next-intl middleware
  // normally; we set it ourselves since we're not using their middleware).
  requestHeaders.set('x-next-intl-locale', locale);
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }
  requestHeaders.set('x-tenant-domain', host);

  // 4. Continue with the SAME URL (no rewriting!) + augmented headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 5. Persist locale as a cookie so future requests remember it
  const existingCookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (existingCookie !== locale) {
    response.cookies.set('NEXT_LOCALE', locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return response;
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
