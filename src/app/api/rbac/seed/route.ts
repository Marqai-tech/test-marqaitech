import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Default module definitions for the HRMS platform
const MODULE_DEFINITIONS = [
  // Core HR
  { key: 'dashboard', name: 'Dashboard', category: 'Core HR', icon: 'LayoutDashboard', sortOrder: 1 },
  { key: 'employees', name: 'Employees', category: 'Core HR', icon: 'Users', sortOrder: 2 },
  { key: 'company', name: 'Company', category: 'Core HR', icon: 'Building2', sortOrder: 3 },

  // Talent
  { key: 'recruitment', name: 'Recruitment', category: 'Talent', icon: 'UserPlus', sortOrder: 4 },
  { key: 'requisitions', name: 'Requisitions', category: 'Talent', icon: 'ClipboardList', sortOrder: 5 },
  { key: 'offers', name: 'Offers', category: 'Talent', icon: 'FileText', sortOrder: 6 },
  { key: 'job_portal', name: 'Job Portal', category: 'Talent', icon: 'Globe', sortOrder: 7 },
  { key: 'ai_interview', name: 'AI Interview', category: 'Talent', icon: 'Bot', sortOrder: 8 },

  // Lifecycle
  { key: 'onboarding', name: 'Onboarding', category: 'Lifecycle', icon: 'UserCheck', sortOrder: 9 },
  { key: 'preboarding', name: 'Preboarding', category: 'Lifecycle', icon: 'ClipboardCheck', sortOrder: 10 },

  // Time
  { key: 'attendance', name: 'Attendance', category: 'Time', icon: 'Clock', sortOrder: 11 },
  { key: 'leave', name: 'Leave', category: 'Time', icon: 'CalendarOff', sortOrder: 12 },
  { key: 'timesheets', name: 'Timesheets', category: 'Time', icon: 'Timer', sortOrder: 13 },

  // Compensation
  { key: 'payroll', name: 'Payroll', category: 'Compensation', icon: 'Banknote', sortOrder: 14 },
  { key: 'salary_structures', name: 'Salary Structures', category: 'Compensation', icon: 'Coins', sortOrder: 15 },

  // Performance
  { key: 'performance', name: 'Performance', category: 'Performance', icon: 'TrendingUp', sortOrder: 16 },
  { key: 'training', name: 'Training', category: 'Performance', icon: 'GraduationCap', sortOrder: 17 },
  { key: 'engagement', name: 'Engagement', category: 'Performance', icon: 'Heart', sortOrder: 18 },
  { key: 'succession', name: 'Succession', category: 'Performance', icon: 'ArrowUpRight', sortOrder: 19 },

  // Operations
  { key: 'projects', name: 'Projects', category: 'Operations', icon: 'FolderKanban', sortOrder: 20 },
  { key: 'travel', name: 'Travel', category: 'Operations', icon: 'Plane', sortOrder: 21 },
  { key: 'expenses', name: 'Expenses', category: 'Operations', icon: 'Receipt', sortOrder: 22 },
  { key: 'assets', name: 'Assets', category: 'Operations', icon: 'Monitor', sortOrder: 23 },
  { key: 'documents', name: 'Documents', category: 'Operations', icon: 'FileStack', sortOrder: 24 },

  // External
  { key: 'clients', name: 'Clients', category: 'External', icon: 'Handshake', sortOrder: 25 },
  { key: 'vendors', name: 'Vendors', category: 'External', icon: 'Truck', sortOrder: 26 },

  // Support
  { key: 'helpdesk', name: 'Helpdesk', category: 'Support', icon: 'Headphones', sortOrder: 27 },
  { key: 'grievances', name: 'Grievances', category: 'Support', icon: 'AlertTriangle', sortOrder: 28 },
  { key: 'ai_assistant', name: 'AI Assistant', category: 'Support', icon: 'Sparkles', sortOrder: 29 },

  // Knowledge
  { key: 'docs', name: 'Documentation', category: 'Knowledge', icon: 'BookOpen', sortOrder: 30 },

  // Governance
  { key: 'workflows', name: 'Workflows', category: 'Governance', icon: 'GitBranch', sortOrder: 31 },
  { key: 'reports', name: 'Reports', category: 'Governance', icon: 'BarChart3', sortOrder: 32 },
  { key: 'settings', name: 'Settings', category: 'Governance', icon: 'Settings', sortOrder: 33 },
  { key: 'notifications', name: 'Notifications', category: 'Governance', icon: 'Bell', sortOrder: 34 },

  // Admin
  { key: 'super_admin', name: 'Super Admin', category: 'Admin', icon: 'Shield', sortOrder: 35 },
  { key: 'tenant_admin', name: 'Tenant Admin', category: 'Admin', icon: 'ShieldCheck', sortOrder: 36 },
  { key: 'ai_admin', name: 'AI Admin', category: 'Admin', icon: 'Brain', sortOrder: 37 },
];

// Default permission actions per module
const DEFAULT_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'];

// Modules that only need limited actions (view only for employees)
const LIMITED_ACTION_MODULES = ['dashboard', 'notifications', 'docs'];

// Admin-only modules (not accessible to tenant_admin and below by default)
const ADMIN_ONLY_MODULES = ['super_admin', 'tenant_admin', 'ai_admin'];

// System role definitions
const SYSTEM_ROLES = [
  {
    key: 'super_admin',
    name: 'Super Administrator',
    description: 'Full system access across all tenants',
    level: 0,
    isSystem: true,
    tenantId: null,
  },
  {
    key: 'tenant_admin',
    name: 'Tenant Administrator',
    description: 'Full access within their tenant',
    level: 1,
    isSystem: true,
  },
  {
    key: 'hr_admin',
    name: 'HR Administrator',
    description: 'HR management access within their tenant',
    level: 2,
    isSystem: true,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Team management access',
    level: 3,
    isSystem: true,
  },
  {
    key: 'employee',
    name: 'Employee',
    description: 'Basic employee self-service access',
    level: 4,
    isSystem: true,
  },
  {
    key: 'recruiter',
    name: 'Recruiter',
    description: 'Recruitment module access',
    level: 2,
    isSystem: true,
  },
  {
    key: 'candidate',
    name: 'Candidate',
    description: 'Job portal and interview access',
    level: 5,
    isSystem: true,
  },
];

// HR-relevant modules for hr_admin role
const HR_ADMIN_MODULES = [
  'dashboard', 'employees', 'company', 'recruitment', 'requisitions', 'offers',
  'job_portal', 'ai_interview', 'onboarding', 'preboarding', 'attendance',
  'leave', 'timesheets', 'payroll', 'salary_structures', 'performance',
  'training', 'engagement', 'documents', 'helpdesk', 'grievances',
  'ai_assistant', 'docs', 'workflows', 'reports', 'notifications',
];

// Manager-accessible modules
const MANAGER_MODULES = [
  'dashboard', 'employees', 'recruitment', 'onboarding', 'attendance',
  'leave', 'timesheets', 'performance', 'training', 'engagement',
  'documents', 'helpdesk', 'ai_assistant', 'docs', 'notifications',
  'projects',
];

// Employee-accessible modules (mostly view + limited create/edit)
const EMPLOYEE_MODULES = [
  'dashboard', 'employees', 'leave', 'attendance', 'timesheets',
  'documents', 'helpdesk', 'ai_assistant', 'docs', 'notifications',
  'expenses', 'travel', 'training',
];

// Recruiter modules
const RECRUITER_MODULES = [
  'dashboard', 'recruitment', 'requisitions', 'offers', 'job_portal',
  'ai_interview', 'employees', 'docs', 'notifications', 'ai_assistant',
];

// Candidate modules
const CANDIDATE_MODULES = [
  'job_portal', 'ai_interview', 'docs', 'notifications',
];

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    // Only super_admin can seed RBAC data
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
    });

    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super administrators can seed RBAC data' },
        { status: 403, headers: corsHeaders() }
      );
    }

    let modulesCreated = 0;
    let permissionsCreated = 0;
    let rolesCreated = 0;
    let rolePermissionsCreated = 0;

    // Step 1: Create or update modules
    for (const modDef of MODULE_DEFINITIONS) {
      const existingModule = await prisma.module.findUnique({
        where: { key: modDef.key },
      });

      if (!existingModule) {
        const createdModule = await prisma.module.create({
          data: {
            key: modDef.key,
            name: modDef.name,
            category: modDef.category,
            icon: modDef.icon,
            sortOrder: modDef.sortOrder,
          },
        });

        // Create permissions for this module
        const actions = LIMITED_ACTION_MODULES.includes(modDef.key)
          ? ['view']
          : DEFAULT_ACTIONS;

        for (const action of actions) {
          await prisma.permission.create({
            data: {
              moduleId: createdModule.id,
              action,
              description: `${action} ${modDef.name.toLowerCase()}`,
            },
          });
          permissionsCreated++;
        }
        modulesCreated++;
      }
    }

    // Step 2: Create system roles
    const createdRoles: Record<string, string> = {};

    for (const roleDef of SYSTEM_ROLES) {
      // Check if role already exists (by key and null tenantId for super_admin, or just key for others)
      const existingRole = await prisma.role.findFirst({
        where: {
          key: roleDef.key,
          tenantId: roleDef.tenantId === null ? null : undefined,
        },
      });

      if (!existingRole) {
        const role = await prisma.role.create({
          data: {
            name: roleDef.name,
            key: roleDef.key,
            description: roleDef.description,
            isSystem: roleDef.isSystem,
            level: roleDef.level,
            tenantId: roleDef.tenantId,
            status: 'active',
            createdBy: user.id,
          },
        });
        createdRoles[roleDef.key] = role.id;
        rolesCreated++;
      } else {
        createdRoles[roleDef.key] = existingRole.id;
      }
    }

    // Step 3: Assign permissions to roles
    const allModules = await prisma.module.findMany({
      include: { permissions: true },
    });

    const moduleMap = new Map(allModules.map((m) => [m.key, m]));

    // Helper: assign permissions for a set of module keys to a role
    const assignPermissions = async (
      roleId: string,
      moduleKeys: string[],
      allowedActions?: string[]
    ): Promise<void> => {
      for (const moduleKey of moduleKeys) {
        const mod = moduleMap.get(moduleKey);
        if (!mod) continue;

        for (const perm of mod.permissions) {
          if (allowedActions && !allowedActions.includes(perm.action)) continue;

          // Check if already exists
          const existing = await prisma.rolePermission.findUnique({
            where: {
              roleId_permissionId: {
                roleId,
                permissionId: perm.id,
              },
            },
          });

          if (!existing) {
            await prisma.rolePermission.create({
              data: {
                roleId,
                permissionId: perm.id,
                granted: true,
              },
            });
            rolePermissionsCreated++;
          }
        }
      }
    };

    // super_admin gets ALL permissions
    if (createdRoles.super_admin) {
      await assignPermissions(createdRoles.super_admin, MODULE_DEFINITIONS.map((m) => m.key));
    }

    // tenant_admin gets all permissions except super_admin/tenant_admin/ai_admin modules
    if (createdRoles.tenant_admin) {
      const tenantAdminModules = MODULE_DEFINITIONS
        .filter((m) => !ADMIN_ONLY_MODULES.includes(m.key))
        .map((m) => m.key);
      await assignPermissions(createdRoles.tenant_admin, tenantAdminModules);
    }

    // hr_admin gets HR-relevant permissions
    if (createdRoles.hr_admin) {
      await assignPermissions(createdRoles.hr_admin, HR_ADMIN_MODULES);
    }

    // manager gets manager-accessible permissions (view, create, edit only - no delete/export/approve for most)
    if (createdRoles.manager) {
      await assignPermissions(
        createdRoles.manager,
        MANAGER_MODULES,
        ['view', 'create', 'edit', 'approve']
      );
    }

    // employee gets basic permissions (mostly view, some create/edit)
    if (createdRoles.employee) {
      // For most modules, employee only gets view
      const viewOnlyModules = EMPLOYEE_MODULES.filter(
        (m) => !['leave', 'expenses', 'travel', 'timesheets', 'helpdesk', 'training'].includes(m)
      );
      await assignPermissions(createdRoles.employee, viewOnlyModules, ['view']);

      // For these modules, employee can also create/edit
      const selfServiceModules = ['leave', 'expenses', 'travel', 'timesheets', 'helpdesk', 'training'];
      await assignPermissions(
        createdRoles.employee,
        selfServiceModules,
        ['view', 'create', 'edit']
      );
    }

    // recruiter gets recruitment-related permissions
    if (createdRoles.recruiter) {
      await assignPermissions(
        createdRoles.recruiter,
        RECRUITER_MODULES,
        ['view', 'create', 'edit', 'export']
      );
    }

    // candidate gets candidate-accessible permissions (view only)
    if (createdRoles.candidate) {
      await assignPermissions(createdRoles.candidate, CANDIDATE_MODULES, ['view', 'create']);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'RBAC data seeded successfully',
        data: {
          modulesCreated,
          permissionsCreated,
          rolesCreated,
          rolePermissionsCreated,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('RBAC seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed RBAC data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
