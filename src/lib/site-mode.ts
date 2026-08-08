/**
 * Site Mode Detection — LIVE vs DEMO
 *
 * Centralized utility for determining whether the current request/page is
 * running on the LIVE production platform or the DEMO showcase site.
 *
 * GOLDEN RULES:
 *   1. 3boxeshrms.com (platform root) → LIVE
 *   2. *.3boxeshrms.com (tenant subdomains, e.g. marqaitechgroup.3boxeshrms.com) → LIVE
 *   3. nexus-hrms-mu.vercel.app (and other demo Vercel URLs) → DEMO
 *   4. localhost → LIVE (local development is treated as live)
 *
 * On LIVE mode:
 *   - Only real/live data is shown
 *   - All seed/auto-seed endpoints are BLOCKED
 *   - No dummy/sample data in any module or form
 *   - Exception: company masters and policies (structural/config data)
 *
 * On DEMO mode:
 *   - Full sample/dummy data available for all roles and modules
 *   - Auto-seeding is enabled
 *   - Demo credentials are shown on the login page
 *   - Completely independent of the production platform
 */

// ─── Demo domain list (must match middleware.ts & tenant-db.ts) ────────
const DEMO_DOMAINS = [
  'nexus-hrms-mu.vercel.app',
  'nexus-hrms.vercel.app',
  '3boxes-hrms.vercel.app',
  '3boxeshrms.vercel.app',
  '3boxes-hrms-mu.vercel.app',
];

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '3boxeshrms.com';

// ─── Server-side detection ─────────────────────────────────────────────

export type SiteMode = 'live' | 'demo';

/**
 * Detect the site mode from a Request object (server-side).
 * Uses x-tenant-domain header (set by middleware) or falls back to host header.
 *
 * Returns 'demo' for demo domains, 'live' for everything else.
 */
export function getSiteMode(request: Request): SiteMode {
  const host = request.headers.get('x-tenant-domain') || request.headers.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase();

  if (DEMO_DOMAINS.includes(hostname)) {
    return 'demo';
  }

  // Any *.vercel.app that isn't the root platform → treat as demo
  // (matches middleware's fallback behavior)
  if (hostname.endsWith('.vercel.app') && !hostname.includes('3boxeshrms.com')) {
    return 'demo';
  }

  // Everything else is LIVE:
  // - 3boxeshrms.com (platform root)
  // - *.3boxeshrms.com (tenant subdomains)
  // - localhost / custom domains
  return 'live';
}

/**
 * Check if the current request is in LIVE mode (server-side).
 * LIVE = production platform with real data only.
 */
export function isLiveMode(request: Request): boolean {
  return getSiteMode(request) === 'live';
}

/**
 * Check if the current request is in DEMO mode (server-side).
 * DEMO = showcase site with sample/dummy data.
 */
export function isDemoMode(request: Request): boolean {
  return getSiteMode(request) === 'demo';
}

// ─── Client-side detection ─────────────────────────────────────────────

/**
 * Detect the site mode from the browser's current hostname (client-side).
 * Safe to call in useEffect or event handlers.
 *
 * Returns 'demo' for demo domains, 'live' for everything else.
 */
export function getClientSiteMode(): SiteMode {
  if (typeof window === 'undefined') return 'live'; // SSR default

  const hostname = window.location.hostname.toLowerCase();

  if (DEMO_DOMAINS.includes(hostname)) {
    return 'demo';
  }

  // Any *.vercel.app that isn't the root platform → treat as demo
  if (hostname.endsWith('.vercel.app') && !hostname.includes('3boxeshrms.com')) {
    return 'demo';
  }

  return 'live';
}

/**
 * Check if the browser is on a LIVE site (client-side).
 */
export function isClientLiveMode(): boolean {
  return getClientSiteMode() === 'live';
}

/**
 * Check if the browser is on a DEMO site (client-side).
 */
export function isClientDemoMode(): boolean {
  return getClientSiteMode() === 'demo';
}

/**
 * Check if a tenant slug corresponds to the demo tenant.
 * The demo tenant (3boxes-hrms-demo) is the ONLY tenant that
 * should have dummy/sample data on the LIVE platform.
 */
export function isDemoTenant(slug: string): boolean {
  return slug === '3boxes-hrms-demo';
}

/**
 * Check if a tenant slug is a production (non-demo) tenant.
 * These tenants should NEVER have dummy/sample data.
 */
export function isProductionTenant(slug: string): boolean {
  return !!slug && slug !== '3boxes-hrms-demo';
}
