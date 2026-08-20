/**
 * superAdminGuard.ts — Shared helper to enforce the GOLDEN RULE
 *
 * When super_admin is logged in on the LIVE site (3boxeshrms.com) with no
 * tenant or company selected, getDb(request) returns the platform DB which
 * contains seed/demo data. This helper provides a consistent way to detect
 * that situation so each API route can return an empty response instead of
 * leaking seed data.
 *
 * Usage:
 *   import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';
 *   ...
 *   if (isSuperAdminWithoutScope(decoded, effectiveCompanyId)) {
 *     return NextResponse.json({ /* empty shape *\/ }, { headers: corsHeaders });
 *   }
 */

/**
 * Returns true when the caller is a super_admin who has NOT selected a
 * specific tenant or company in the CompanySwitcher. In this state the
 * request would read from the platform DB (which holds seed data) — so
 * routes should return an empty response instead.
 *
 * @param decoded      The decoded JWT payload (from verifyToken)
 * @param companyId    The ?companyId= query param (or null/empty)
 * @param tenantId     The ?tenantId= query param (or null/empty) — optional
 */
export function isSuperAdminWithoutScope(
  decoded: { role?: string } | null,
  companyId?: string | null,
  tenantId?: string | null,
): boolean {
  if (!decoded) return false;
  if (decoded.role !== 'super_admin') return false;
  const hasCompany = companyId && companyId.trim() !== '';
  const hasTenant = tenantId && tenantId.trim() !== '';
  return !hasCompany && !hasTenant;
}
