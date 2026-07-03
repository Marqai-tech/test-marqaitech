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

const MODULE_DEFINITIONS = [
  { key: 'dashboard', name: 'Dashboard', category: 'Core HR', icon: 'LayoutDashboard', sortOrder: 1 },
  { key: 'employees', name: 'Employees', category: 'Core HR', icon: 'Users', sortOrder: 2 },
  { key: 'company', name: 'Company', category: 'Core HR', icon: 'Building2', sortOrder: 3 },
  { key: 'recruitment', name: 'Recruitment', category: 'Talent', icon: 'UserPlus', sortOrder: 4 },
  { key: 'requisitions', name: 'Requisitions', category: 'Talent', icon: 'ClipboardList', sortOrder: 5 },
  { key: 'offers', name: 'Offers', category: 'Talent', icon: 'FileText', sortOrder: 6 },
  { key: 'job_portal', name: 'Job Portal', category: 'Talent', icon: 'Globe', sortOrder: 7 },
  { key: 'ai_interview', name: 'AI Interview', category: 'Talent', icon: 'Bot', sortOrder: 8 },
  { key: 'onboarding', name: 'Onboarding', category: 'Lifecycle', icon: 'UserCheck', sortOrder: 9 },
  { key: 'preboarding', name: 'Preboarding', category: 'Lifecycle', icon: 'ClipboardCheck', sortOrder: 10 },
  { key: 'attendance', name: 'Attendance', category: 'Time', icon: 'Clock', sortOrder: 11 },
  { key: 'leave', name: 'Leave', category: 'Time', icon: 'CalendarOff', sortOrder: 12 },
  { key: 'timesheets', name: 'Timesheets', category: 'Time', icon: 'Timer', sortOrder: 13 },
  { key: 'payroll', name: 'Payroll', category: 'Compensation', icon: 'Banknote', sortOrder: 14 },
  { key: 'salary_structures', name: 'Salary Structures', category: 'Compensation', icon: 'Coins', sortOrder: 15 },
  { key: 'performance', name: 'Performance', category: 'Performance', icon: 'TrendingUp', sortOrder: 16 },
  { key: 'training', name: 'Training', category: 'Performance', icon: 'GraduationCap', sortOrder: 17 },
  { key: 'engagement', name: 'Engagement', category: 'Performance', icon: 'Heart', sortOrder: 18 },
  { key: 'succession', name: 'Succession', category: 'Performance', icon: 'ArrowUpRight', sortOrder: 19 },
  { key: 'projects', name: 'Projects', category: 'Operations', icon: 'FolderKanban', sortOrder: 20 },
  { key: 'travel', name: 'Travel', category: 'Operations', icon: 'Plane', sortOrder: 21 },
  { key: 'expenses', name: 'Expenses', category: 'Operations', icon: 'Receipt', sortOrder: 22 },
  { key: 'assets', name: 'Assets', category: 'Operations', icon: 'Monitor', sortOrder: 23 },
  { key: 'documents', name: 'Documents', category: 'Operations', icon: 'FileStack', sortOrder: 24 },
  { key: 'clients', name: 'Clients', category: 'External', icon: 'Handshake', sortOrder: 25 },
  { key: 'vendors', name: 'Vendors', category: 'External', icon: 'Truck', sortOrder: 26 },
  { key: 'helpdesk', name: 'Helpdesk', category: 'Support', icon: 'Headphones', sortOrder: 27 },
  { key: 'grievances', name: 'Grievances', category: 'Support', icon: 'AlertTriangle', sortOrder: 28 },
  { key: 'ai_assistant', name: 'AI Assistant', category: 'Support', icon: 'Sparkles', sortOrder: 29 },
  { key: 'docs', name: 'Documentation', category: 'Knowledge', icon: 'BookOpen', sortOrder: 30 },
  { key: 'workflows', name: 'Workflows', category: 'Governance', icon: 'GitBranch', sortOrder: 31 },
  { key: 'reports', name: 'Reports', category: 'Governance', icon: 'BarChart3', sortOrder: 32 },
  { key: 'settings', name: 'Settings', category: 'Governance', icon: 'Settings', sortOrder: 33 },
  { key: 'notifications', name: 'Notifications', category: 'Governance', icon: 'Bell', sortOrder: 34 },
  { key: 'super_admin', name: 'Super Admin', category: 'Admin', icon: 'Shield', sortOrder: 35 },
  { key: 'tenant_admin', name: 'Tenant Admin', category: 'Admin', icon: 'ShieldCheck', sortOrder: 36 },
  { key: 'ai_admin', name: 'AI Admin', category: 'Admin', icon: 'Brain', sortOrder: 37 },
];

const DEFAULT_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'];
const LIMITED_ACTION_MODULES = ['dashboard', 'notifications', 'docs'];
const ADMIN_ONLY_MODULES = ['super_admin', 'tenant_admin', 'ai_admin'];

// 3 standard roles only
const SYSTEM_ROLES = [
  { key: 'super_admin', name: 'Super Administrator', description: 'Full system access across all tenants — manages platform configuration, RBAC, audit logs, and all tenant operations', level: 0, isSystem: true, tenantId: null as string | null },
  { key: 'tenant_admin', name: 'Tenant Administrator', description: 'Full access within their tenant — manages company RBAC, organization settings, and all HR operations', level: 1, isSystem: true, tenantId: null as string | null },
  { key: 'admin', name: 'Administrator', description: 'Company-level admin access — manages all employees, HR operations, payroll, recruitment, onboarding, IT assets, finance, and compliance within their company', level: 2, isSystem: true },
];

// Admin gets full access to all non-super-admin modules
const ADMIN_MODULES = ['dashboard', 'employees', 'company', 'recruitment', 'requisitions', 'offers', 'job_portal', 'ai_interview', 'onboarding', 'preboarding', 'attendance', 'leave', 'timesheets', 'payroll', 'salary_structures', 'performance', 'training', 'engagement', 'succession', 'documents', 'helpdesk', 'grievances', 'ai_assistant', 'docs', 'workflows', 'reports', 'notifications', 'settings', 'assets', 'projects', 'travel', 'expenses', 'clients', 'vendors', 'invoices', 'accounts', 'crm', 'it_admin_module', 'separation'];
const ADMIN_FULL_ACTIONS_MODULES = ['employees', 'company', 'recruitment', 'requisitions', 'offers', 'onboarding', 'preboarding', 'payroll', 'salary_structures', 'attendance', 'leave', 'performance', 'training', 'engagement', 'helpdesk', 'grievances', 'documents', 'settings', 'assets', 'workflows', 'projects', 'expenses', 'travel', 'reports', 'separation', 'succession'];

async function seedRBACData(userId?: string) {
  let modulesCreated = 0, permissionsCreated = 0, rolesCreated = 0, rolePermissionsCreated = 0, userRoleAssignmentsCreated = 0;

  // Step 1: Create/update modules and permissions
  for (const modDef of MODULE_DEFINITIONS) {
    const existingModule = await prisma.module.findUnique({ where: { key: modDef.key } });
    if (!existingModule) {
      const createdModule = await prisma.module.create({ data: { key: modDef.key, name: modDef.name, category: modDef.category, icon: modDef.icon, sortOrder: modDef.sortOrder } });
      const actions = LIMITED_ACTION_MODULES.includes(modDef.key) ? ['view'] : DEFAULT_ACTIONS;
      for (const action of actions) {
        await prisma.permission.create({ data: { moduleId: createdModule.id, action, description: `${action} ${modDef.name.toLowerCase()}` } });
        permissionsCreated++;
      }
      modulesCreated++;
    }
  }

  // Step 2: Create standard roles — remove any non-standard roles
  // First, delete all existing roles that are NOT in the standard 3
  const standardKeys = SYSTEM_ROLES.map(r => r.key);
  const nonStandardRoles = await prisma.role.findMany({
    where: { key: { notIn: standardKeys } }
  });
  for (const role of nonStandardRoles) {
    // Delete role permissions and user assignments first (cascade should handle this)
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
  }

  const createdRoles: Record<string, string> = {};
  for (const roleDef of SYSTEM_ROLES) {
    let existingRole;
    if (roleDef.tenantId === null) {
      existingRole = await prisma.role.findFirst({ where: { key: roleDef.key, tenantId: null, companyId: null } });
    } else {
      const tenants = await prisma.tenant.findMany({ take: 1 });
      if (tenants.length === 0) continue;
      existingRole = await prisma.role.findFirst({ where: { key: roleDef.key, tenantId: tenants[0].id, companyId: null } });
    }
    if (!existingRole) {
      let roleTenantId = roleDef.tenantId;
      if (roleTenantId === null && roleDef.key !== 'super_admin' && roleDef.key !== 'tenant_admin') {
        const tenants = await prisma.tenant.findMany({ take: 1 });
        roleTenantId = tenants.length > 0 ? tenants[0].id : null;
      }
      const role = await prisma.role.create({ data: { name: roleDef.name, key: roleDef.key, description: roleDef.description, isSystem: roleDef.isSystem, level: roleDef.level, tenantId: roleTenantId, status: 'active', createdBy: userId || null } });
      createdRoles[roleDef.key] = role.id;
      rolesCreated++;
    } else {
      // Update existing role with current name/description
      await prisma.role.update({
        where: { id: existingRole.id },
        data: { name: roleDef.name, description: roleDef.description, level: roleDef.level, isSystem: roleDef.isSystem }
      });
      createdRoles[roleDef.key] = existingRole.id;
    }
  }

  // Step 3: Assign permissions to roles
  const allModules = await prisma.module.findMany({ include: { permissions: true } });
  const moduleMap = new Map(allModules.map((m) => [m.key, m]));

  const assignPermissions = async (roleId: string, moduleKeys: string[], allowedActions?: string[]) => {
    // Clear existing permissions first for clean slate
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    
    for (const moduleKey of moduleKeys) {
      const mod = moduleMap.get(moduleKey);
      if (!mod) continue;
      for (const perm of mod.permissions) {
        if (allowedActions && !allowedActions.includes(perm.action)) continue;
        try {
          await prisma.rolePermission.create({ data: { roleId, permissionId: perm.id, granted: true } });
          rolePermissionsCreated++;
        } catch { /* skip duplicates */ }
      }
    }
  };

  // super_admin: ALL modules, ALL actions
  if (createdRoles.super_admin) await assignPermissions(createdRoles.super_admin, MODULE_DEFINITIONS.map((m) => m.key));
  
  // tenant_admin: All except super_admin/tenant_admin/ai_admin modules
  if (createdRoles.tenant_admin) await assignPermissions(createdRoles.tenant_admin, MODULE_DEFINITIONS.filter((m) => !ADMIN_ONLY_MODULES.includes(m.key)).map((m) => m.key));
  
  // admin: Full actions on core admin modules, view+create+edit+export on secondary modules
  if (createdRoles.admin) {
    await assignPermissions(createdRoles.admin, ADMIN_FULL_ACTIONS_MODULES, ['view', 'create', 'edit', 'delete', 'export', 'approve']);
    const adminViewOnlyModules = ADMIN_MODULES.filter((m) => !ADMIN_FULL_ACTIONS_MODULES.includes(m));
    // Re-add with limited actions (since we cleared all, we need to add these separately)
    for (const moduleKey of adminViewOnlyModules) {
      const mod = moduleMap.get(moduleKey);
      if (!mod) continue;
      for (const perm of mod.permissions) {
        if (!['view', 'create', 'edit', 'export'].includes(perm.action)) continue;
        try {
          await prisma.rolePermission.create({ data: { roleId: createdRoles.admin, permissionId: perm.id, granted: true } });
          rolePermissionsCreated++;
        } catch { /* skip duplicates */ }
      }
    }
  }

  // Step 4: Migrate users to the new 3-role system
  const roleKeyMap: Record<string, string> = {
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

  const users = await prisma.user.findMany();
  for (const user of users) {
    const newRoleKey = roleKeyMap[user.role];
    if (!newRoleKey || !createdRoles[newRoleKey]) continue;
    
    // Update User.role field to new role
    await prisma.user.update({
      where: { id: user.id },
      data: { role: newRoleKey }
    });

    // Remove existing role assignments
    await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });

    // Create new role assignment
    const companies = await prisma.company.findMany({ take: 1 });
    try {
      await prisma.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: createdRoles[newRoleKey],
          companyId: companies.length > 0 && newRoleKey !== 'super_admin' && newRoleKey !== 'tenant_admin' ? companies[0].id : null,
          assignedBy: userId || null
        }
      });
      userRoleAssignmentsCreated++;
    } catch { /* skip */ }
  }

  return { modulesCreated, permissionsCreated, rolesCreated, rolePermissionsCreated, userRoleAssignmentsCreated, nonStandardRolesRemoved: nonStandardRoles.length };
}

export async function GET() {
  try {
    const result = await seedRBACData();
    return NextResponse.json({ success: true, message: 'RBAC data seeded successfully with 3 standard roles', data: result }, { headers: corsHeaders() });
  } catch (error) {
    console.error('RBAC seed error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTableMissing = errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('table') || errorMessage.includes('Invalid');
    return NextResponse.json(
      { 
        error: 'Failed to seed RBAC data', 
        details: errorMessage,
        tableMissing: isTableMissing,
        hint: isTableMissing 
          ? 'RBAC tables are missing from the database. Please redeploy the application (push to main branch) so that "prisma db push" runs during the build and creates the required tables. Also ensure POSTGRES_PRISMA_URL environment variable is set in Vercel.'
          : undefined
      }, 
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const user = await prisma.user.findUnique({ where: { id: decoded.userId as string } });
    if (!user || (user.role !== 'super_admin' && user.role !== 'tenant_admin')) return NextResponse.json({ error: 'Only administrators can seed RBAC data' }, { status: 403, headers: corsHeaders() });
    
    const result = await seedRBACData(user.id);
    return NextResponse.json({ success: true, message: 'RBAC data seeded successfully with 3 standard roles', data: result }, { headers: corsHeaders() });
  } catch (error) {
    console.error('RBAC seed error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTableMissing = errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('table') || errorMessage.includes('Invalid');
    return NextResponse.json(
      { 
        error: 'Failed to seed RBAC data', 
        details: errorMessage,
        tableMissing: isTableMissing,
        hint: isTableMissing 
          ? 'RBAC tables are missing from the database. Please redeploy the application (push to main branch) so that "prisma db push" runs during the build and creates the required tables.'
          : undefined
      }, 
      { status: 500, headers: corsHeaders() }
    );
  }
}
