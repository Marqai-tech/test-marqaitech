#!/usr/bin/env node
/* Task 166 — provision the standard COMPANY RBAC roles in the MarqAI tenant:
 *   super_admin, tenant_admin, hr_admin, finance_admin, payroll_admin,
 *   manager, travel_admin, crm_admin, employee
 * (ceo already exists in prod.)
 *
 * ONLY creates what is missing:
 *  - roles: create-if-missing (never deletes, never renames)
 *  - role permissions: built ONLY for roles that currently have none
 *  - user assignments: backfilled to mirror each user's CURRENT User.role
 *    (so the RBAC "User Access" tab reflects reality without changing access)
 * Idempotent: safe to re-run. */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

const PLATFORM = fs.readFileSync('/home/z/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='))
  .slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim();

/* Permission matrices (moduleKey → actions; '*' = every action the module has) */
const ROLE_DEFS = [
  {
    key: 'super_admin', name: 'Super Administrator', level: 0, isSystem: true, global: true,
    description: 'Full system access across all tenants — manages platform configuration, RBAC, audit logs, and all tenant operations',
    matrix: { '*': ['*'] },
  },
  {
    key: 'tenant_admin', name: 'Tenant Administrator', level: 1, isSystem: true,
    description: 'Full access within their tenant — manages company RBAC, organization settings, and all HR operations',
    matrix: { '*': ['*'] }, excludeModules: ['super_admin', 'ai_admin'],
  },
  {
    key: 'hr_admin', name: 'HR Manager / HR Admin', level: 2, isSystem: true,
    description: 'Manages all HR operations including recruitment, onboarding, employee lifecycle, leave, attendance, performance, training, and HR policies',
    matrix: {
      dashboard: ['*'], employees: ['*'], company: ['*'], recruitment: ['*'], requisitions: ['*'],
      offers: ['*'], job_portal: ['*'], ai_interview: ['*'], onboarding: ['*'], preboarding: ['*'],
      attendance: ['*'], leave: ['*'], performance: ['*'], training: ['*'], engagement: ['*'],
      succession: ['*'], separation: ['*'], documents: ['*'], helpdesk: ['*'], grievances: ['*'],
      settings: ['*'], reports: ['*'], notifications: ['*'], workflows: ['*'], insurance: ['*'],
      timesheets: ['view', 'create', 'edit', 'export'], payroll: ['view', 'create', 'edit', 'export'],
      salary_structures: ['view', 'create', 'edit', 'export'], assets: ['view', 'create', 'edit', 'export'],
      ai_assistant: ['view', 'create', 'edit', 'export'], docs: ['view', 'create', 'edit', 'export'],
    },
  },
  {
    key: 'finance_admin', name: 'Finance Manager / Finance Admin', level: 2, isSystem: true,
    description: 'Manages payroll, salary structures, expenses, invoices, accounts, loans, claims, and financial reporting',
    matrix: {
      dashboard: ['*'], payroll: ['*'], salary_structures: ['*'], expenses: ['*'], invoices: ['*'],
      accounts: ['*'], loans: ['*'], claims: ['*'], timesheets: ['*'], reports: ['*'], settings: ['*'],
      employees: ['view', 'create', 'edit', 'export'], company: ['view', 'create', 'edit', 'export'],
      attendance: ['view', 'create', 'edit', 'export'], leave: ['view', 'create', 'edit', 'export'],
      documents: ['view', 'create', 'edit', 'export'], notifications: ['view', 'create', 'edit', 'export'],
      travel: ['view', 'create', 'edit', 'export'],
    },
  },
  {
    key: 'payroll_admin', name: 'Payroll Admin', level: 3, isSystem: false,
    description: 'Runs payroll operations — payroll processing, salary structures, loans, claims, payslips, timesheets, and payroll reports',
    matrix: {
      dashboard: ['view'], payroll: ['*'], salary_structures: ['*'], loans: ['*'], claims: ['*'],
      timesheets: ['view', 'create', 'edit', 'export'], reports: ['view', 'create', 'edit', 'export'],
      employees: ['view'], attendance: ['view'], leave: ['view'], documents: ['view'],
      notifications: ['view'], settings: ['view'],
    },
  },
  {
    key: 'manager', name: 'Manager', level: 3, isSystem: true,
    description: 'Manages team operations — view employees, approve leaves/expenses/travel, manage performance reviews, and assign tasks',
    matrix: {
      dashboard: ['view', 'create', 'edit', 'approve'], employees: ['view', 'create', 'edit', 'approve'],
      attendance: ['view', 'create', 'edit', 'approve'], leave: ['view', 'create', 'edit', 'approve'],
      timesheets: ['view', 'create', 'edit', 'approve'], performance: ['view', 'create', 'edit', 'approve'],
      training: ['view', 'create', 'edit', 'approve'], engagement: ['view', 'create', 'edit', 'approve'],
      succession: ['view', 'create', 'edit', 'approve'], expenses: ['view', 'create', 'edit', 'approve'],
      travel: ['view', 'create', 'edit', 'approve'], projects: ['view', 'create', 'edit', 'approve'],
      reports: ['view', 'create', 'edit', 'approve'],
      payroll: ['view'], salary_structures: ['view'], company: ['view'], recruitment: ['view'],
      onboarding: ['view'], documents: ['view'], notifications: ['view'], helpdesk: ['view'],
    },
  },
  {
    key: 'travel_admin', name: 'Travel Admin', level: 3, isSystem: true,
    description: 'Manages travel requests, approvals, policies, and travel expense settlements',
    matrix: {
      dashboard: ['*'], travel: ['*'], expenses: ['*'], reports: ['*'], settings: ['*'],
      docs: ['*'], notifications: ['*'],
      employees: ['view', 'create', 'edit'], company: ['view', 'create', 'edit'], documents: ['view', 'create', 'edit'],
    },
  },
  {
    key: 'crm_admin', name: 'CRM Admin', level: 3, isSystem: true,
    description: 'Manages clients, vendors, CRM operations, and external relationship management',
    matrix: {
      dashboard: ['*'], clients: ['*'], vendors: ['*'], crm: ['*'], reports: ['*'], settings: ['*'],
      docs: ['*'], notifications: ['*'],
      employees: ['view', 'create', 'edit'], expenses: ['view', 'create', 'edit'],
      invoices: ['view', 'create', 'edit'], accounts: ['view', 'create', 'edit'], documents: ['view', 'create', 'edit'],
    },
  },
  {
    key: 'employee', name: 'Employee', level: 4, isSystem: true,
    description: 'Self-service access — view own profile, apply leave/expenses/travel, submit timesheets, access helpdesk and documents',
    matrix: {
      dashboard: ['view'], company: ['view'], insurance: ['view'], helpdesk: ['view'],
      grievances: ['view'], documents: ['view'], notifications: ['view'], docs: ['view'],
      leave: ['view', 'create'], attendance: ['view', 'create'], timesheets: ['view', 'create'],
      expenses: ['view', 'create'], travel: ['view', 'create'], training: ['view', 'create'],
      assets: ['view', 'create'], performance: ['view', 'create'],
    },
  },
];

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.id AS tenant_id, t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const t = tenants.find((x) => /marqai/i.test(x.slug));
  if (!t) throw new Error('marqai tenant not found');
  const db = neon(t.cs);
  console.log('== Tenant:', t.slug, t.tenant_id, '==');

  // 0) module + permission catalogue
  const modules = await db.query(`SELECT id, key FROM "Module"`);
  const permissions = await db.query(`SELECT id, "moduleId", action FROM "Permission"`);
  const modMap = new Map(modules.map((m) => [m.key, m]));
  const permMap = new Map(); // moduleId -> [{id, action}]
  for (const p of permissions) {
    if (!permMap.has(p.moduleId)) permMap.set(p.moduleId, []);
    permMap.get(p.moduleId).push({ id: p.id, action: p.action });
  }
  console.log('0) modules:', modules.length, '| permissions:', permissions.length);

  // 1) create-if-missing roles
  const roleIds = {};
  for (const def of ROLE_DEFS) {
    const tenantId = def.global ? null : t.tenant_id;
    const existing = await db.query(
      `SELECT id FROM "Role" WHERE key = $1 AND "tenantId" IS NOT DISTINCT FROM $2 LIMIT 1`,
      [def.key, tenantId]
    );
    if (existing.length) {
      roleIds[def.key] = existing[0].id;
      console.log('1) role exists:', def.key, existing[0].id);
    } else {
      const ins = await db.query(
        `INSERT INTO "Role" (id, name, key, description, "isSystem", level, "tenantId", status, "createdAt", "updatedAt")
         VALUES ('role_t166_' || floor(random() * 1000000000)::text, $1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
         RETURNING id`,
        [def.name, def.key, def.description, def.isSystem, def.level, tenantId]
      );
      roleIds[def.key] = ins[0].id;
      console.log('1) role CREATED:', def.key, ins[0].id);
    }
  }

  // 2) build permissions ONLY for roles that have none
  let rpCreated = 0;
  for (const def of ROLE_DEFS) {
    const roleId = roleIds[def.key];
    const count = await db.query(`SELECT count(*)::int AS n FROM "RolePermission" WHERE "roleId" = $1`, [roleId]);
    if (count[0].n > 0) {
      console.log('2) role', def.key, 'already has', count[0].n, 'permissions — skipped');
      continue;
    }
    for (const [modKey, actions] of Object.entries(def.matrix)) {
      const targets = modKey === '*' ? [...modMap.keys()] : modMap.has(modKey) ? [modKey] : [];
      if (modKey !== '*' && targets.length === 0) { console.log('   WARN: module missing for', def.key, modKey); continue; }
      for (const mk of targets) {
        if (def.excludeModules && def.excludeModules.includes(mk)) continue;
        const mod = modMap.get(mk);
        const perms = permMap.get(mod.id) || [];
        for (const perm of perms) {
          if (!(actions.includes('*') || actions.includes(perm.action))) continue;
          try {
            await db.query(`INSERT INTO "RolePermission" (id, "roleId", "permissionId", granted, "createdAt", "updatedAt") VALUES ('rp_t166_' || floor(random() * 1000000000)::text, $1, $2, true, NOW(), NOW())`, [roleId, perm.id]);
            rpCreated++;
          } catch (e) { if (!/duplicate|unique/i.test(e.message)) console.log('   INSERT WARN:', e.message.slice(0, 120)); }
        }
      }
    }
    console.log('2) role', def.key, 'permissions built (+' + rpCreated + ' total so far)');
  }

  // 3) backfill user assignments to mirror CURRENT User.role (no access change)
  const keyToRole = {}; // app role key -> roleId (map legacy keys)
  const legacyMap = { company_hr_admin: 'hr_admin', hrhead: 'hr_admin', recruitmenthead: 'hr_admin', finance: 'finance_admin', it_admin: 'hr_admin', recruiter: 'hr_admin', admin: 'admin' };
  for (const def of ROLE_DEFS) keyToRole[def.key] = roleIds[def.key];
  const ceoRole = await db.query(`SELECT id FROM "Role" WHERE key = 'ceo' AND ("tenantId" = $1 OR "tenantId" IS NULL) ORDER BY ("tenantId" = $1) DESC LIMIT 1`, [t.tenant_id]);
  if (ceoRole.length) keyToRole['ceo'] = ceoRole[0].id;

  const users = await db.query(`SELECT id, role FROM "User"`);
  let assignmentsCreated = 0;
  for (const u of users) {
    const targetKey = legacyMap[u.role] || u.role;
    const roleId = keyToRole[targetKey];
    if (!roleId) { console.log('3) WARN no role record for user role', u.role); continue; }
    const existing = await db.query(`SELECT id FROM "UserRoleAssignment" WHERE "userId" = $1 AND "roleId" = $2 LIMIT 1`, [u.id, roleId]);
    if (existing.length) continue;
    await db.query(
      `INSERT INTO "UserRoleAssignment" (id, "userId", "roleId", "companyId", "assignedBy", "createdAt", "updatedAt")
       VALUES ('ura_t166_' || floor(random() * 1000000000)::text, $1, $2, NULL, NULL, NOW(), NOW())`,
      [u.id, roleId]
    );
    assignmentsCreated++;
  }
  console.log('3) user assignments backfilled:', assignmentsCreated);

  // 4) verify
  const verify = await db.query(`
    SELECT r.key, r.name, count(DISTINCT rp.id)::int AS perms, count(DISTINCT ura.id)::int AS users
    FROM "Role" r
    LEFT JOIN "RolePermission" rp ON rp."roleId" = r.id
    LEFT JOIN "UserRoleAssignment" ura ON ura."roleId" = r.id
    GROUP BY r.key, r.name, r.level ORDER BY r.level, r.name`);
  console.log('4) VERIFY (role → permissions, users):');
  for (const r of verify) console.log(`   ${r.key.padEnd(14)} perms=${String(r.perms).padStart(4)} users=${r.users}`);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
