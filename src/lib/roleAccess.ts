// ============================================================================
// Role-Based Access Control Configuration for HRMS Application
// ============================================================================
//
// Standard Roles (3):
//   1. super_admin  (level 0) - Platform-level full access
//   2. tenant_admin (level 1) - Tenant-level full access
//   3. admin        (level 2) - Company-level admin access (HR, Finance, IT combined)
//
// All other roles (hr_admin, finance_admin, it_admin, manager, employee,
// recruiter, candidate, etc.) have been consolidated into these 3 roles.
// The "admin" role replaces hr_admin, finance_admin, it_admin, and manager
// for company-level administration needs.
//

/**
 * Role hierarchy level — lower number = higher privilege.
 * Used for comparison logic where needed.
 */
export const ROLE_LEVELS: Record<string, number> = {
  super_admin: 0,
  tenant_admin: 1,
  admin: 2,
};

/**
 * Module access by role — defines which roles can access each module.
 * This is the centralized access control configuration for sidebar and page-level guards.
 */
export const MODULE_ACCESS: Record<string, string[]> = {
  dashboard: ['super_admin', 'tenant_admin', 'admin'],
  employees: ['super_admin', 'tenant_admin', 'admin'],
  company: ['super_admin', 'tenant_admin', 'admin'],
  recruitment: ['super_admin', 'tenant_admin', 'admin'],
  onboarding: ['super_admin', 'tenant_admin', 'admin'],
  attendance: ['super_admin', 'tenant_admin', 'admin'],
  leave: ['super_admin', 'tenant_admin', 'admin'],
  payroll: ['super_admin', 'tenant_admin', 'admin'],
  salary_structures: ['super_admin', 'tenant_admin', 'admin'],
  performance: ['super_admin', 'tenant_admin', 'admin'],
  training: ['super_admin', 'tenant_admin', 'admin'],
  engagement: ['super_admin', 'tenant_admin', 'admin'],
  reports: ['super_admin', 'tenant_admin', 'admin'],
  settings: ['super_admin', 'tenant_admin', 'admin'],
  docs: ['super_admin', 'tenant_admin', 'admin'],
  helpdesk: ['super_admin', 'tenant_admin', 'admin'],
  assets: ['super_admin', 'tenant_admin', 'admin'],
  projects: ['super_admin', 'tenant_admin', 'admin'],
  invoices: ['super_admin', 'tenant_admin', 'admin'],
  expenses: ['super_admin', 'tenant_admin', 'admin'],
  travel: ['super_admin', 'tenant_admin', 'admin'],
  accounts: ['super_admin', 'tenant_admin', 'admin'],
  crm: ['super_admin', 'tenant_admin', 'admin'],
  it_admin_module: ['super_admin', 'tenant_admin', 'admin'],
  separation: ['super_admin', 'tenant_admin', 'admin'],
  grievances: ['super_admin', 'tenant_admin', 'admin'],
  super_admin: ['super_admin'],
  tenant_admin_module: ['super_admin', 'tenant_admin'],
  rbac: ['super_admin', 'tenant_admin'],
  workflows: ['super_admin', 'tenant_admin', 'admin'],
  timesheets: ['super_admin', 'tenant_admin', 'admin'],
  documents: ['super_admin', 'tenant_admin', 'admin'],
  ai_assistant: ['super_admin', 'tenant_admin', 'admin'],
  notifications: ['super_admin', 'tenant_admin', 'admin'],
  requisitions: ['super_admin', 'tenant_admin', 'admin'],
  offers: ['super_admin', 'tenant_admin', 'admin'],
  job_portal: ['super_admin', 'tenant_admin', 'admin'],
  ai_interview: ['super_admin', 'tenant_admin', 'admin'],
  preboarding: ['super_admin', 'tenant_admin', 'admin'],
  succession: ['super_admin', 'tenant_admin', 'admin'],
  clients: ['super_admin', 'tenant_admin', 'admin'],
  vendors: ['super_admin', 'tenant_admin', 'admin'],
  ai_admin: ['super_admin'],
  governance: ['super_admin', 'tenant_admin', 'admin'],
};

/**
 * Detailed access specifications per role.
 * Controls what data scope each role can see across modules.
 */
export const ROLE_ACCESS_DETAILS: Record<string, {
  label: string;
  description: string;
  dashboardAccess: 'full' | 'team' | 'self';
  employeeAccess: 'all' | 'team' | 'self';
  reportAccess: 'all' | 'team' | 'self' | 'none';
  settingsAccess: 'all' | 'module' | 'none';
}> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full system access across all tenants and modules — manages platform configuration, RBAC, audit logs, and all tenant operations',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'all',
  },
  tenant_admin: {
    label: 'Tenant Admin',
    description: 'Full access within their tenant — manages company RBAC, organization settings, and all HR operations',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'all',
  },
  admin: {
    label: 'Admin',
    description: 'Company-level admin access — manages all employees, HR operations, payroll, recruitment, onboarding, IT assets, finance, and compliance within their company',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'module',
  },
};

/**
 * Tenant-specific module whitelist.
 * Controls which modules are visible for specific tenants.
 * Keys are tenant slugs (from subdomain), values are arrays of allowed nav section keys.
 * Tenants NOT listed here see ALL modules (default behavior).
 *
 * This is used to gradually roll out modules — only enabled modules appear
 * in the sidebar. Once a module is fully implemented and tested for a tenant,
 * it can be added to their whitelist.
 *
 * To disable tenant filtering for a tenant, simply remove them from this map
 * or add all module keys to their array.
 */
export const TENANT_MODULE_WHITELIST: Record<string, string[]> = {
  'marqaitechgroup': [
    // Tenant / platform management
    'super-admin',
    'tenant',
    // Core HR
    'company',
    'employee',
    // Time & Leave
    'leave',
    'attendance',
    // Compensation
    'payroll',
    // Talent
    'recruitment',
    'onboarding',
    'preboarding',
    // Operations
    'project',
    // Support & Intelligence
    'support',
    'collaboration',
    // Governance
    'governance',
  ],
};

/**
 * Dynamic module overrides from the database (set by super admin UI).
 * This map is populated at runtime by the tenantModuleStore.
 * When a tenant has DB-based module flags, this takes precedence
 * over the hardcoded TENANT_MODULE_WHITELIST.
 *
 * Key = tenantSlug, Value = Set of enabled module keys.
 * If a tenant is in this map, ONLY the modules in the Set are visible.
 * If a tenant is NOT in this map, falls back to TENANT_MODULE_WHITELIST.
 */
let _dbModuleOverrides: Record<string, Set<string>> = {};

/**
 * Update the runtime DB module overrides (called from tenantModuleStore).
 */
export function setDbModuleOverrides(overrides: Record<string, Set<string>>) {
  _dbModuleOverrides = overrides;
}

/**
 * Get the current DB module overrides (for reading in hooks).
 */
export function getDbModuleOverrides(): Record<string, Set<string>> {
  return _dbModuleOverrides;
}

/**
 * Check if a nav section key is enabled for a specific tenant.
 * Resolution order:
 *   1. DB-based overrides (set by super admin via Module Management UI)
 *   2. Hardcoded TENANT_MODULE_WHITELIST (fallback for tenants not yet migrated)
 *   3. No restrictions = all modules visible
 */
export function isModuleEnabledForTenant(tenantSlug: string, moduleKey: string): boolean {
  // 1. Check DB overrides first (dynamic, set by super admin UI)
  const dbOverride = _dbModuleOverrides[tenantSlug];
  if (dbOverride) return dbOverride.has(moduleKey);

  // 2. Fallback to hardcoded whitelist
  const whitelist = TENANT_MODULE_WHITELIST[tenantSlug];
  if (!whitelist) return true; // No whitelist = all modules visible
  return whitelist.includes(moduleKey);
}

/**
 * Check if a role can access a module.
 * Super admin always returns true.
 */
export function canRoleAccessModule(role: string, moduleKey: string): boolean {
  if (role === 'super_admin') return true;
  const allowed = MODULE_ACCESS[moduleKey];
  return allowed ? allowed.includes(role) : false;
}

/**
 * Get the data scope for a role — determines how much data a role can see.
 * - 'all': Full access to all records
 * - 'team': Access to own + team/reportees
 * - 'self': Access to own records only
 */
export function getDataScope(role: string): 'all' | 'team' | 'self' {
  if (['super_admin', 'tenant_admin', 'admin'].includes(role)) return 'all';
  return 'self';
}

/**
 * Get the dashboard access level for a role.
 */
export function getDashboardAccess(role: string): 'full' | 'team' | 'self' {
  const details = ROLE_ACCESS_DETAILS[role];
  return details?.dashboardAccess || 'self';
}

/**
 * Get the report access level for a role.
 */
export function getReportAccess(role: string): 'all' | 'team' | 'self' | 'none' {
  const details = ROLE_ACCESS_DETAILS[role];
  return details?.reportAccess || 'self';
}

/**
 * Get the employee access level for a role.
 */
export function getEmployeeAccess(role: string): 'all' | 'team' | 'self' {
  const details = ROLE_ACCESS_DETAILS[role];
  return details?.employeeAccess || 'self';
}

/**
 * Filter sidebar navigation items based on role.
 * Returns the list of module keys the role can see.
 */
export function getAccessibleModules(role: string): string[] {
  if (role === 'super_admin') return Object.keys(MODULE_ACCESS);
  const accessible: string[] = [];
  for (const [moduleKey, allowedRoles] of Object.entries(MODULE_ACCESS)) {
    if (allowedRoles.includes(role)) {
      accessible.push(moduleKey);
    }
  }
  return accessible;
}

/**
 * Check if a role can create/edit content in the docs module.
 */
export function canManageDocs(role: string): boolean {
  return ['super_admin', 'admin', 'tenant_admin'].includes(role);
}

/**
 * Check if a role can access statutory reports.
 */
export function canAccessStatutoryReports(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'admin'].includes(role);
}

/**
 * Check if a role can access AI reports.
 */
export function canAccessAIReports(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'admin'].includes(role);
}

/**
 * Check if a role can see the full employee list (all departments).
 */
export function canSeeAllEmployees(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'admin'].includes(role);
}

/**
 * Legacy role migration map — maps old role keys to the new 3-role system.
 * Used for migrating existing users and role assignments.
 */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  super_admin: 'super_admin',
  tenant_admin: 'tenant_admin',
  hr_admin: 'admin',
  company_hr_admin: 'admin',
  finance_admin: 'admin',
  finance: 'admin',
  it_admin: 'admin',
  manager: 'admin',
  employee: 'admin',
  recruiter: 'admin',
  candidate: 'admin',
  job_seeker: 'admin',
  admin: 'admin',
  hrhead: 'admin',
  recruitmenthead: 'admin',
};

/**
 * Get the new role for a legacy role key.
 */
export function migrateRole(legacyRole: string): string {
  return LEGACY_ROLE_MAP[legacyRole] || 'admin';
}
