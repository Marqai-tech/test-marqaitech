/**
 * READ-ONLY inspection: why is the Collaboration module not visible/enabled
 * for the EMPLOYEE role on the demo tenant?
 *
 * Checks:
 *  A. Platform DB: FeatureFlag rows (module_*) for the demo tenant — is
 *     module_collaboration present and enabled? (tenant-level visibility gate)
 *  B. Tenant DB (tenant_3boxes-hrms-demo): Module table — does a 'collaboration'
 *     module row exist? Are there Permission rows for it?
 *  C. Tenant DB: Role table (employee/manager roles) + RolePermission rows
 *     granted for collaboration + UserRoleAssignment for the test employee
 *     (Bala Mukherjee).
 *  D. Tenant DB: count of EmailMessage rows scoped to Bala (expected inbox
 *     content once the module is enabled).
 *
 * Usage: node scripts/inspect-collab-employee-access.js
 */
const { neon } = require('@neondatabase/serverless');

const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const USER = 'neondb_owner';
const PASS = 'npg_pxZd8woKe4WB';
const PLATFORM_CS = `postgresql://${USER}:${PASS}@${HOST}/neondb?sslmode=require`;
const DEMO_SLUG = '3boxes-hrms-demo';
const DEMO_DB = `tenant_${DEMO_SLUG}`;
const demoSql = neon(`postgresql://${USER}:${PASS}@${HOST}/${DEMO_DB}?sslmode=require`);
const platformSql = neon(PLATFORM_CS);

const log = (...a) => console.log('[inspect]', ...a);

async function main() {
  // ── A. Tenant + module flags ──
  const tenants = await platformSql`
    SELECT "id", "name", "slug" FROM "Tenant"
    WHERE "slug" = ${DEMO_SLUG} LIMIT 1`;
  if (!tenants.length) { log('ERROR: demo tenant not found'); process.exit(1); }
  const tenant = tenants[0];
  log(`Tenant: ${tenant.name} (${tenant.slug}) id=${tenant.id}`);

  const flags = await platformSql`
    SELECT "key", "label", "enabled", "source"
    FROM "FeatureFlag"
    WHERE "tenantId" = ${tenant.id} AND "key" LIKE 'module_%'
    ORDER BY "key" ASC`;
  log(`\nA. module_* FeatureFlags for demo tenant (${flags.length}):`);
  for (const f of flags) log(`   ${f.key.padEnd(30)} enabled=${f.enabled} source=${f.source}`);
  const collab = flags.find(f => f.key === 'module_collaboration');
  log(`   => module_collaboration ${collab ? `PRESENT (enabled=${collab.enabled})` : 'MISSING'}`);

  // ── B. RBAC Module + Permission rows in tenant DB ──
  log('\nB. Tenant DB "Module" rows (key, name):');
  const mods = await demoSql`SELECT "id", "key", "name" FROM "Module" ORDER BY "sortOrder" ASC`;
  for (const m of mods) log(`   ${m.key.padEnd(22)} ${m.name}`);
  const collabMod = mods.find(m => m.key === 'collaboration' || m.key === 'collaboration_module');
  log(`   => collaboration module row ${collabMod ? `PRESENT (id=${collabMod.id})` : 'MISSING'}`);

  if (collabMod) {
    const perms = await demoSql`
      SELECT p."id", p."action", p."name"
      FROM "Permission" p WHERE p."moduleId" = ${collabMod.id}
      ORDER BY p."action" ASC`;
    log(`   Permission rows for collaboration module: ${perms.length}`);
    for (const p of perms) log(`     - ${p.action} (${p.name})`);
  }

  // ── C. Roles + employee role permissions ──
  log('\nC. Tenant DB "Role" rows:');
  const roles = await demoSql`SELECT "id", "key", "name", "level", "isSystem" FROM "Role" ORDER BY "level" ASC`;
  for (const r of roles) log(`   level=${r.level} ${r.key.padEnd(15)} ${r.name} isSystem=${r.isSystem}`);

  const empRole = roles.find(r => r.key === 'employee');
  if (empRole && collabMod) {
    const rp = await demoSql`
      SELECT rp."granted", p."action"
      FROM "RolePermission" rp
      JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE rp."roleId" = ${empRole.id} AND p."moduleId" = ${collabMod.id}`;
    log(`   => RolePermission rows for EMPLOYEE role x collaboration module: ${rp.length}`);
    for (const x of rp) log(`     - action=${x.action} granted=${x.granted}`);
  } else {
    log('   => (skipped: missing employee role or collaboration module row)');
  }

  // What DOES the employee role have permissions for? (top-level summary)
  if (empRole) {
    const granted = await demoSql`
      SELECT m."key" AS module, COUNT(*)::int AS n
      FROM "RolePermission" rp
      JOIN "Permission" p ON p."id" = rp."permissionId"
      JOIN "Module" m ON m."id" = p."moduleId"
      WHERE rp."roleId" = ${empRole.id} AND rp."granted" = true
      GROUP BY m."key" ORDER BY m."key" ASC`;
    log(`   Modules with >=1 granted permission for EMPLOYEE role: ${granted.length}`);
    log(`   ${granted.map(g => `${g.module}(${g.n})`).join(', ')}`);
  }

  // Bala's user + role assignments
  const bala = await demoSql`
    SELECT u."id", u."email", u."role", e."id" AS emp_id, e."firstName", e."lastName"
    FROM "User" u LEFT JOIN "Employee" e ON e."userId" = u."id"
    WHERE u."email" = 'bala.mukherjee@innovatech.demo' LIMIT 1`;
  if (bala.length) {
    const b = bala[0];
    log(`\n   Test employee: ${b.firstName} ${b.lastName} <${b.email}> userRole=${b.role} employeeId=${b.emp_id}`);
    const assigns = await demoSql`
      SELECT r."key" AS role FROM "UserRoleAssignment" ua
      JOIN "Role" r ON r."id" = ua."roleId"
      WHERE ua."userId" = ${b.id}`;
    log(`   UserRoleAssignment roles: ${assigns.length ? assigns.map(a => a.role).join(', ') : '(none)'}`);
    if (b.emp_id) {
      const inbox = await demoSql`
        SELECT COUNT(*)::int AS n FROM "EmailMessage"
        WHERE "toEmployeeId" = ${b.emp_id} AND "isActive" = true`;
      log(`   EmailMessage rows addressed to Bala: ${inbox[0].n}`);
    }
  } else {
    log('\n   Test employee Bala not found');
  }

  log('\nDone (read-only — no data changed).');
}

main().catch((e) => { console.error(e); process.exit(1); });
