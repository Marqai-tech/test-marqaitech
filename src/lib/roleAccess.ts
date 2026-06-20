// ============================================================================
// Role-Based Access Control Configuration for HRMS Application
// ============================================================================

/**
 * Role hierarchy level — lower number = higher privilege.
 * Used for comparison logic where needed.
 */
export const ROLE_LEVELS: Record<string, number> = {
  super_admin: 0,
  tenant_admin: 1,
  hr_admin: 2,
  manager: 3,
  employee: 4,
  recruiter: 2,
  finance: 2,
  it_admin: 2,
};

/**
 * Module access by role — defines which roles can access each module.
 * This is the centralized access control configuration for sidebar and page-level guards.
 */
export const MODULE_ACCESS: Record<string, string[]> = {
  dashboard: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee', 'recruiter', 'finance', 'it_admin'],
  employees: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'],
  company: ['super_admin', 'tenant_admin', 'hr_admin'],
  recruitment: ['super_admin', 'tenant_admin', 'hr_admin', 'recruiter', 'manager'],
  onboarding: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'],
  attendance: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  leave: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  payroll: ['super_admin', 'tenant_admin', 'hr_admin', 'finance'],
  performance: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  training: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  engagement: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'],
  reports: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'finance'],
  settings: ['super_admin', 'tenant_admin', 'hr_admin'],
  docs: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  helpdesk: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  assets: ['super_admin', 'tenant_admin', 'hr_admin', 'it_admin'],
  projects: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'],
  invoices: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'finance'],
  expenses: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  travel: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  separation: ['super_admin', 'tenant_admin', 'hr_admin'],
  grievances: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'],
  super_admin: ['super_admin'],
  tenant_admin: ['super_admin', 'tenant_admin'],
  rbac: ['super_admin', 'tenant_admin'],
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
    description: 'Full system access across all tenants and modules',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'all',
  },
  tenant_admin: {
    label: 'Tenant Admin',
    description: 'Full access within their tenant',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'all',
  },
  hr_admin: {
    label: 'HR Admin',
    description: 'All employee information, but not super admin details',
    dashboardAccess: 'full',
    employeeAccess: 'all',
    reportAccess: 'all',
    settingsAccess: 'module',
  },
  manager: {
    label: 'Manager',
    description: 'Own info and direct reportees only',
    dashboardAccess: 'team',
    employeeAccess: 'team',
    reportAccess: 'team',
    settingsAccess: 'none',
  },
  employee: {
    label: 'Employee',
    description: 'Self-service access — own information only',
    dashboardAccess: 'self',
    employeeAccess: 'self',
    reportAccess: 'self',
    settingsAccess: 'none',
  },
  recruiter: {
    label: 'Recruiter',
    description: 'Recruitment module access',
    dashboardAccess: 'team',
    employeeAccess: 'team',
    reportAccess: 'team',
    settingsAccess: 'none',
  },
  finance: {
    label: 'Finance',
    description: 'Payroll and financial reports access',
    dashboardAccess: 'full',
    employeeAccess: 'team',
    reportAccess: 'all',
    settingsAccess: 'module',
  },
  it_admin: {
    label: 'IT Admin',
    description: 'IT and asset management access',
    dashboardAccess: 'team',
    employeeAccess: 'team',
    reportAccess: 'team',
    settingsAccess: 'module',
  },
};

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
  if (['super_admin', 'tenant_admin'].includes(role)) return 'all';
  if (role === 'hr_admin') return 'all';
  if (role === 'finance') return 'all';
  if (['manager', 'recruiter', 'it_admin'].includes(role)) return 'team';
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
  return ['super_admin', 'hr_admin', 'tenant_admin'].includes(role);
}

/**
 * Check if a role can access statutory reports.
 */
export function canAccessStatutoryReports(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'hr_admin', 'finance'].includes(role);
}

/**
 * Check if a role can access AI reports.
 */
export function canAccessAIReports(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'hr_admin'].includes(role);
}

/**
 * Check if a role can see the full employee list (all departments).
 */
export function canSeeAllEmployees(role: string): boolean {
  return ['super_admin', 'tenant_admin', 'hr_admin'].includes(role);
}
