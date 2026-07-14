/**
 * Company-Scoped Data Visibility Utility
 *
 * Ensures that non-admin users can only see data belonging to their own company.
 * Admin roles (super_admin, tenant_admin, admin) can see all data or filter by
 * a specific company via the CompanySwitcher.
 *
 * Usage in API routes:
 *   const { companyId, scope } = await resolveCompanyScope(request);
 *   if (scope === 'self') {
 *     where.employee = { companyId };
 *   }
 *
 * Or simpler:
 *   const filter = await getCompanyFilter(request);
 *   // filter = { companyId: 'xxx' } for non-admins
 *   // filter = {} for admins (no restriction)
 *   // filter = { companyId: 'yyy' } for admins who selected a specific company
 */

import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';

export interface CompanyScopeResult {
  /** The authenticated user's ID */
  userId: string;
  /** The user's role */
  role: string;
  /** Data scope: 'all' = see everything, 'self' = own company only */
  scope: 'all' | 'team' | 'self';
  /** The company ID to filter by. null means "all companies" (admin with no specific company selected) */
  companyId: string | null;
  /** The user's own company ID (from their Employee record) */
  ownCompanyId: string | null;
  /** The user's tenant ID */
  tenantId: string | null;
}

/**
 * Resolve the company scope for an authenticated request.
 *
 * This is the primary function that API routes should call to determine
 * how to filter their data queries.
 *
 * Logic:
 * 1. Authenticate the request via JWT
 * 2. Determine the user's role and data scope
 * 3. For admins (scope === 'all'):
 *    - Check for a `companyId` query param (from CompanySwitcher)
 *    - If provided, use it as the filter
 *    - If not, return null (see all companies)
 * 4. For non-admins (scope === 'self' or 'team'):
 *    - Resolve the user's own company from their Employee record
 *    - Always filter by that company
 *
 * Returns null if authentication fails (caller should return 401).
 */
export async function resolveCompanyScope(request: Request): Promise<CompanyScopeResult | null> {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return null;

    const decoded = await verifyToken(token);
    if (!decoded) return null;

    const userId = decoded.userId as string;
    const role = (decoded.role as string) || 'employee';
    const scope = getDataScope(role);
    const tenantId = (decoded.tenantId as string) || null;

    // Resolve the user's own company from their Employee record
    let ownCompanyId: string | null = null;
    const employee = await prisma.employee.findFirst({
      where: { userId, status: 'active' },
      select: { companyId: true, id: true },
    });
    if (employee?.companyId) {
      ownCompanyId = employee.companyId;
    } else if (employee?.id) {
      // Try to get companyId from EmployeeCompanyMapping
      const primaryMapping = await prisma.employeeCompanyMapping.findFirst({
        where: { employeeId: employee.id, isPrimary: true },
        select: { companyId: true },
      });
      if (primaryMapping) {
        ownCompanyId = primaryMapping.companyId;
      } else {
        // Try any mapping
        const anyMapping = await prisma.employeeCompanyMapping.findFirst({
          where: { employeeId: employee.id },
          select: { companyId: true },
        });
        if (anyMapping) {
          ownCompanyId = anyMapping.companyId;
        }
      }
    }

    // For admins: check for companyId query param from CompanySwitcher
    let companyId: string | null = null;

    if (scope === 'all') {
      // Admin users: use the companyId from the CompanySwitcher if provided
      const { searchParams } = new URL(request.url);
      const queryCompanyId = searchParams.get('companyId');
      if (queryCompanyId) {
        companyId = queryCompanyId;
      }
      // If no companyId provided, admin sees all (companyId stays null)
    } else {
      // Non-admin users: always filter by their own company
      companyId = ownCompanyId;
    }

    return { userId, role, scope, companyId, ownCompanyId, tenantId };
  } catch (error) {
    console.error('[companyScope] Error resolving company scope:', error);
    return null;
  }
}

/**
 * Simplified helper: get the Prisma where clause filter for company-scoped queries.
 *
 * Returns an object that can be spread into a Prisma `where` clause.
 *
 * For models with a direct `companyId` field (Department, Branch, Holiday, Policy, etc.):
 *   const filter = await getCompanyFilter(request);
 *   db.department.findMany({ where: { ...filter, status: 'active' } })
 *
 * For models accessed through Employee (Attendance, LeaveRequest, etc.):
 *   const filter = await getEmployeeCompanyFilter(request);
 *   db.attendance.findMany({ where: { employee: { ...filter } } })
 *
 * Returns null if authentication fails.
 */
export async function getCompanyFilter(request: Request): Promise<Record<string, unknown> | null> {
  const scope = await resolveCompanyScope(request);
  if (!scope) return null;
  if (scope.scope === 'all' && !scope.companyId) {
    // Admin with no specific company selected - see all
    return {};
  }
  if (scope.companyId) {
    return { companyId: scope.companyId };
  }
  // Non-admin without a company - shouldn't happen but return empty to be safe
  return {};
}

/**
 * Get company filter for models accessed through Employee relation.
 * Use this for Attendance, LeaveRequest, ExpenseClaim, etc.
 *
 * Usage:
 *   const empFilter = await getEmployeeCompanyFilter(request);
 *   db.attendance.findMany({ where: { employee: empFilter } })
 *
 * Returns null if authentication fails.
 */
export async function getEmployeeCompanyFilter(request: Request): Promise<Record<string, unknown> | null> {
  const scope = await resolveCompanyScope(request);
  if (!scope) return null;
  if (scope.scope === 'all' && !scope.companyId) {
    // Admin with no specific company selected - see all
    return {};
  }
  if (scope.scope === 'self' && scope.userId) {
    // Employee: only see own records
    return { userId: scope.userId };
  }
  if (scope.companyId) {
    return { companyId: scope.companyId };
  }
  return {};
}

/**
 * Get the company filter for Designation model (accessed through Department → Company).
 * Designations belong to Departments which belong to Companies.
 *
 * Usage:
 *   const filter = await getDesignationCompanyFilter(request);
 *   db.designation.findMany({ where: { department: filter } })
 *
 * Returns null if authentication fails.
 */
export async function getDesignationCompanyFilter(request: Request): Promise<Record<string, unknown> | null> {
  const scope = await resolveCompanyScope(request);
  if (!scope) return null;
  if (scope.scope === 'all' && !scope.companyId) {
    return {};
  }
  if (scope.companyId) {
    return { companyId: scope.companyId };
  }
  return {};
}

/**
 * Quick auth check - returns user info or null.
 * Useful for routes that need authentication but not company scoping.
 */
export async function getAuthInfo(request: Request): Promise<{ userId: string; role: string; tenantId: string | null } | null> {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return null;
    const decoded = await verifyToken(token);
    if (!decoded) return null;
    return {
      userId: decoded.userId as string,
      role: (decoded.role as string) || 'employee',
      tenantId: (decoded.tenantId as string) || null,
    };
  } catch {
    return null;
  }
}
