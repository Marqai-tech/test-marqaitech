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

  // For other admins, the companyId must belong to their tenant
  if (!companyId) {
    return { ok: false, error: 'companyId is required' };
  }

  if (!auth.tenantId) {
    return { ok: false, error: 'Tenant context not found in session' };
  }

  try {
    const db = await getDb(request);
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, tenantId: true },
    });
    if (!company) {
      return { ok: false, error: 'Company not found' };
    }
    if (company.tenantId && company.tenantId !== auth.tenantId) {
      return { ok: false, error: 'You do not have access to this company' };
    }
    return { ok: true, role: auth.role, tenantId: auth.tenantId };
  } catch (err) {
    console.error('[validateCompanyOwnership] Error:', err);
    // On error, deny (fail-closed for security)
    return { ok: false, error: 'Failed to validate company ownership' };
  }
}
