/**
 * RBAC Cleanup Script - Reduce to 3 roles only: super_admin, tenant_admin, admin
 *
 * All other roles (hr_admin, finance_admin, it_admin, manager, employee, recruiter, candidate, etc.)
 * are migrated to admin. Users with legacy roles are mapped via LEGACY_ROLE_MAP in src/lib/roleAccess.ts.
 *
 * NOTE: This one-off cleanup was already executed against the platform and tenant
 * databases in an earlier task (see worklog.md). The original body of this script
 * was lost to a truncated write, so only this stub remains. Do not re-run blindly.
 */
export {};
