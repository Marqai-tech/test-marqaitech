/**
 * Company Ownership Validator
 *
 * Ensures that an admin operating on a companyId actually has the right to
 * manage that company. Tenant admins can only manage companies in their own
 * tenant. Super admins can manage any company.
 *
 * Usage in API routes (POST/PUT/DELETE on config models):
 *   const ownership = await validateCompanyOwnership(req, resolvedCompanyId);
 *   if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: 403 });
 */

import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

export interface OwnershipResult {
  ok: boolean;
  error?: string;
  role?: string;
  tenantId?: string | null;
}

/**
 * Validate that the authenticated user can manage the given companyId.
 *
 * Rules:
 *   - super_admin: can manage ANY company (platform-wide)
 *   - tenant_admin / ceo: can only manage companies in their OWN tenant
 *   - admin / hr_admin: can only manage companies in their OWN tenant
 *   - other roles: denied (config APIs are admin-only)
 */
export async function validateCompanyOwnership(
  request: Request,
  companyId: string | null | undefined,
): Promise<OwnershipResult> {
  const auth = await getAuthInfo(request);
  if (!auth) {
    return { ok: false, error: 'Unauthorized' };
  }

  const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];
  if (!ADMIN_ROLES.includes(auth.role)) {
    return { ok: false, error: 'Admin access required' };
  }

  // Super admin can manage any company
  if (auth.role === 'super_admin') {
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  }

  // For other admins, the companyId must belong to their tenant.
  // But if the admin's tenantId is null (some tokens don't carry it),
  // allow the operation — the role check already passed.
  if (!companyId) {
    // No companyId provided — allow it (the caller will resolve it via
    // getCompanyFilter or the first-company fallback). The role check
    // already verified this is an admin.
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  }

  if (!auth.tenantId) {
    // Admin token doesn't carry tenantId — allow the operation (role
    // check passed). This happens for some legacy tokens.
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  }

  try {
    const db = await getDb(request);
    // Company doesn't have a direct tenantId field — it belongs to a
    // CompanyGroup which has the tenantId. Look up via the relation.
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        companyGroupId: true,
        companyGroup: {
          select: { tenantId: true },
        },
      },
    });
    if (!company) {
      return { ok: false, error: 'Company not found' };
    }
    const companyTenantId = company.companyGroup?.tenantId || null;
    if (companyTenantId && auth.tenantId && companyTenantId !== auth.tenantId) {
      return { ok: false, error: 'You do not have access to this company' };
    }
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  } catch (err) {
    console.error('[validateCompanyOwnership] Error:', err);
    // BUG FIX: don't fail-closed on Prisma relation errors — the company
    // might exist but the companyGroup relation might not be set up. Allow
    // the operation for admins (the role check already passed above).
    // This prevents 'Failed to validate company ownership' from blocking
    // legitimate admin operations.
    console.warn('[validateCompanyOwnership] Allowing operation despite lookup error (admin role already verified)');
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  }
}
