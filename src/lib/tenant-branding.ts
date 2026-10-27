/**
 * Tenant branding resolution.
 *
 * Single source of truth for "what logo + colors does this tenant use?".
 * Used by email templates and any other UI surface that wants to apply
 * tenant-specific branding.
 *
 * Design:
 *   - getTenantBranding(tenantId?) returns { name, logo, primaryColor, accentColor, domain }
 *   - All fields have safe defaults so callers never have to null-check.
 *   - The Tenant table is queried directly (platform DB) — Tenant.logo is
 *     already a String? column holding a URL or data URL.
 *   - For brand colors: the Tenant table does NOT yet have brandColor /
 *     accentColor columns. We try to read them via $queryRawUnsafe (they
 *     will exist after the ALTER TABLE in ensureTenantBrandingColumns runs),
 *     and fall back to the platform default green gradient when null.
 *
 * Defaults (when tenant is null or fields are missing):
 *   name:          '3Boxes HRMS'
 *   logo:          '/images/logo-3boxes-hrms.png'  (already in /public)
 *   primaryColor:  '#065f46'  (emerald-800 — existing green gradient start)
 *   accentColor:   '#10b981'  (emerald-500 — existing green gradient end)
 *   domain:        ''  (caller supplies a default URL)
 *
 * Tenant isolation:
 *   This helper only reads from the Tenant table by id — it never mixes
 *   tenants. The same id always yields the same branding.
 */

import { getPlatformDb } from '@/lib/tenant-db';

export interface TenantBranding {
  /** Tenant display name (e.g. "Acme Corp"). Falls back to '3Boxes HRMS'. */
  name: string;
  /** Tenant logo URL or data URL. Falls back to a default platform asset. */
  logo: string | null;
  /** Primary brand color (hex). Used for email header gradient start. */
  primaryColor: string;
  /** Accent brand color (hex). Used for email header gradient end + buttons. */
  accentColor: string;
  /** Tenant domain (e.g. "acme.3boxeshrms.com") — empty when not set. */
  domain: string;
  /** The tenant id used to fetch this branding (null when no tenant). */
  tenantId: string | null;
}

/** Default branding used when no tenant is configured or all fields are missing. */
export const DEFAULT_TENANT_BRANDING: TenantBranding = {
  name: '3Boxes HRMS',
  logo: '/images/logo-3boxes-hrms.png',
  primaryColor: '#065f46',
  accentColor: '#10b981',
  domain: '',
  tenantId: null,
};

/** Cache tenant branding in-process for 60 seconds to avoid repeat DB hits. */
const brandingCache = new Map<string, { at: number; branding: TenantBranding }>();
const BRANDING_CACHE_MS = 60_000;

/** Track whether we've attempted the ALTER TABLE for brandColor columns. */
let brandingColumnsEnsured = false;

/**
 * Ensure the Tenant table has brandColor + accentColor TEXT columns.
 * Idempotent — runs once per process. Uses ALTER TABLE IF NOT EXISTS so it
 * never fails on subsequent calls. Mirrors the pattern in
 * employee-profile-columns.ts.
 */
export async function ensureTenantBrandingColumns(): Promise<void> {
  if (brandingColumnsEnsured) return;
  brandingColumnsEnsured = true; // set first so we don't retry on failure
  try {
    const db = getPlatformDb();
    await db.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "brandColor" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "accentColor" TEXT`);
  } catch (err) {
    // Non-fatal: getTenantBranding will fall back to DEFAULT_TENANT_BRANDING.
    console.error('[tenant-branding] Failed to ALTER Tenant table for brandColor/accentColor:', err);
  }
}

/**
 * Resolve tenant branding from the platform DB.
 *
 * @param tenantId  The Tenant.id (cuid). Null/undefined → returns defaults.
 * @returns TenantBranding — always fully populated (no null checks needed).
 */
export async function getTenantBranding(tenantId: string | null | undefined): Promise<TenantBranding> {
  if (!tenantId) return { ...DEFAULT_TENANT_BRANDING };

  // Cache hit?
  const cached = brandingCache.get(tenantId);
  if (cached && Date.now() - cached.at < BRANDING_CACHE_MS) {
    return cached.branding;
  }

  try {
    // Make sure brandColor/accentColor columns exist (one-time ALTER).
    await ensureTenantBrandingColumns();

    const db = getPlatformDb();
    const rows = await db.$queryRawUnsafe(
      `SELECT "name", "logo", "domain", "brandColor", "accentColor" FROM "Tenant" WHERE "id" = $1 LIMIT 1`,
      tenantId,
    ) as Array<{ name: string | null; logo: string | null; domain: string | null; brandColor: string | null; accentColor: string | null }>;

    const row = rows[0];
    if (!row) {
      // Tenant not found — return defaults but tag with the requested id.
      const fallback = { ...DEFAULT_TENANT_BRANDING, tenantId };
      brandingCache.set(tenantId, { at: Date.now(), branding: fallback });
      return fallback;
    }

    const branding: TenantBranding = {
      name: (row.name && row.name.trim()) || DEFAULT_TENANT_BRANDING.name,
      logo: row.logo || DEFAULT_TENANT_BRANDING.logo,
      primaryColor: (row.brandColor && row.brandColor.trim()) || DEFAULT_TENANT_BRANDING.primaryColor,
      accentColor: (row.accentColor && row.accentColor.trim()) || DEFAULT_TENANT_BRANDING.accentColor,
      domain: row.domain || '',
      tenantId,
    };

    brandingCache.set(tenantId, { at: Date.now(), branding });
    return branding;
  } catch (err) {
    console.error('[tenant-branding] Failed to fetch tenant branding:', err);
    const fallback = { ...DEFAULT_TENANT_BRANDING, tenantId };
    return fallback;
  }
}

/**
 * Invalidate the in-process branding cache for a tenant (call after tenant
 * branding is updated). Mirrors the me-response-cache pattern.
 */
export function invalidateTenantBrandingCache(tenantId?: string | null): void {
  if (!tenantId) {
    brandingCache.clear();
    return;
  }
  brandingCache.delete(tenantId);
}

/**
 * Validate that a hex color string is safe to inject into an HTML email
 * (prevents style attribute injection). Returns the input if valid, else the
 * default primary color.
 */
export function safeHexColor(value: string | null | undefined, fallback: string = DEFAULT_TENANT_BRANDING.primaryColor): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return fallback;
}

/**
 * Lighten a hex color by mixing it with white. Used for subtle background
 * tints (e.g. footer band) when the primary is dark.
 */
export function lightenColor(hex: string, amount: number = 0.85): string {
  const safe = safeHexColor(hex);
  const clean = safe.startsWith('#') ? safe.slice(1) : safe;
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/**
 * REQ 5 — Build a tenant-branded email HTML document for callers outside the
 * notification-center dispatch path (e.g. OTP, birthday, suspicious-punch,
 * termination, transfer, probation). This is a thin wrapper around
 * `buildEmailHtml` that auto-fetches the tenant branding so callers don't
 * have to import both `getTenantBranding` and `buildEmailHtml`.
 *
 * Tenant isolation: `getTenantBranding(tenantId)` only reads from the Tenant
 * row matching this id — never crosses tenants. When tenantId is null/empty
 * or the tenant has no branding configured, DEFAULT_TENANT_BRANDING is used
 * (3Boxes HRMS green theme + default logo).
 *
 * Either `bodyText` (plain text, auto-split into paragraphs) OR `bodyHtml`
 * (pre-rendered HTML, used as-is) must be supplied.
 *
 * @returns branded HTML string suitable for `sendEmail` / `sendTenantEmail`.
 */
export async function buildBrandedEmailForTenant(
  tenantId: string | null | undefined,
  opts: {
    title: string;
    bodyText?: string;
    bodyHtml?: string;
    actionUrl?: string;
    expiresAt?: string;
  },
): Promise<string> {
  // Lazy import to avoid a circular dependency at module load time
  // (notification-render imports from tenant-branding).
  const { buildEmailHtml } = await import('@/lib/notification-render');
  const branding = await getTenantBranding(tenantId);
  return buildEmailHtml({
    title: opts.title,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    actionUrl: opts.actionUrl,
    expiresAt: opts.expiresAt,
    branding,
    companyName: branding.name,
  });
}
