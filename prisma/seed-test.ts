/**
 * TEST ENVIRONMENT seed — ensures the STANDARD login accounts work on
 * test.3boxeshrms.com, using the SAME emails as production/demo:
 *
 *   superadmin@3boxeshrms.com   (super_admin)
 *   tenantadmin@3boxeshrms.com  (tenant_admin)
 *   hr@3boxeshrms.com           (hr_admin)
 *   employee@3boxeshrms.com     (employee)
 *
 * ⚠️  RUN THIS ONLY AGAINST THE TEST DATABASE — never the production one:
 *
 *   DATABASE_URL="<TEST_DB_URL>" npx tsx prisma/seed-test.ts
 *
 * Behavior (idempotent, non-destructive — existing tenants/users are kept):
 *   - For each standard user: if it exists, reset its password to the
 *     standard one and set status active. If missing, create it (with an
 *     Employee record) inside the demo tenant, creating that tenant
 *     (company/department/designations) only if it doesn't exist.
 *   - Seeds the 4 demo policies for the company only if none exist yet.
 */
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found');
}

// Safety net: refuse an obviously-production platform host (manual check —
// Neon/AWS hosts won't match this; it only catches someone pasting a URL
// that literally points at a 3boxeshrms.com database host).
if (/@[^/]*3boxeshrms\.com/i.test(connectionString) && !/@[^/]*(test|staging|dev)[^/]*\./i.test(connectionString)) {
  console.error('⛔ This connection string looks like a PRODUCTION database (non-test 3boxeshrms.com host).');
  console.error('   Aborting. Use the TEST database URL only.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'MarqAI@2026'; // same standard password as the prod/demo seeds
const TENANT_SLUGS = ['3boxes-hrms-demo', 'test-tenant']; // reuse these before creating new

interface StandardUser {
  email: string;
  name: string;
  role: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  designationTitle: string;
  designationLevel: number;
}

const STANDARD_USERS: StandardUser[] = [
  { email: 'superadmin@3boxeshrms.com', name: 'Super Admin', role: 'super_admin', firstName: 'Super', lastName: 'Admin', employeeCode: 'TQA001', designationTitle: 'Director', designationLevel: 1 },
  { email: 'tenantadmin@3boxeshrms.com', name: 'Tenant Admin', role: 'tenant_admin', firstName: 'Tenant', lastName: 'Admin', employeeCode: 'TQA002', designationTitle: 'Director', designationLevel: 1 },
  { email: 'hr@3boxeshrms.com', name: 'HR Manager', role: 'hr_admin', firstName: 'HR', lastName: 'Manager', employeeCode: 'TQA003', designationTitle: 'HR Manager', designationLevel: 3 },
  { email: 'employee@3boxeshrms.com', name: 'Test Employee', role: 'employee', firstName: 'Test', lastName: 'Employee', employeeCode: 'TQA004', designationTitle: 'Software Engineer', designationLevel: 4 },
];

function makeSimplePdf(title: string, lines: string[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let content = 'BT /F1 20 Tf 60 780 Td (' + esc(title) + ') Tj ET\n';
  let y = 740;
  for (const line of lines) {
    content += `BT /F1 11 Tf 60 ${y} Td (${esc(line)}) Tj ET\n`;
    y -= 20;
    if (y < 60) break;
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return 'data:application/pdf;base64,' + Buffer.from(pdf, 'latin1').toString('base64');
}

async function main() {
  const masked = connectionString!.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log('🌱 Ensuring STANDARD logins on the TEST database...');
  console.log('ℹ️  Database:', masked.substring(0, 70));

  const pwHash = await bcryptjs.hash(PASSWORD, 10);

  // ── Pass 1: check + reset password for users that already exist ──
  const missing: StandardUser[] = [];
  for (const u of STANDARD_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true, role: true, status: true } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { password: pwHash, status: 'active' } });
      console.log(`✓ EXISTS  ${u.email} (${existing.role}) — password reset to standard, status active`);
    } else {
      missing.push(u);
      console.log(`• MISSING ${u.email} — will create`);
    }
  }

  // ── Pass 2: create the missing users (needs a tenant home) ──
  if (missing.length > 0) {
    let tenant = null;
    for (const slug of TENANT_SLUGS) {
      tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (tenant) { console.log(`✓ Reusing existing tenant "${tenant.name}" (${slug})`); break; }
    }
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'QA Test Tenant', slug: 'test-tenant', plan: 'enterprise', currency: 'INR', timezone: 'Asia/Kolkata' },
      });
      console.log('✓ Created tenant "QA Test Tenant" (test-tenant)');
    }

    // Company: reuse the tenant's first company if present, else create
    let company = await prisma.company.findFirst({ where: { companyGroup: { tenantId: tenant.id } } });
    if (!company) {
      const group = await prisma.companyGroup.create({ data: { name: `${tenant.name} Group`, tenantId: tenant.id } });
      company = await prisma.company.create({
        data: { name: 'Test Company', code: 'TST', companyGroupId: group.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', status: 'active' },
      });
      console.log('✓ Created company "Test Company"');
    } else {
      console.log(`✓ Reusing existing company "${company.name}"`);
    }

    const department = await prisma.department.upsert({
      where: { id: (await prisma.department.findFirst({ where: { companyId: company.id }, select: { id: true } }))?.id ?? 'none' },
      update: {},
      create: { name: 'General', code: 'GEN', companyId: company.id },
    }).catch(async () => await prisma.department.create({ data: { name: 'General', code: 'GEN', companyId: company.id } }));

    for (const u of missing) {
      let designation = await prisma.designation.findFirst({
        where: { departmentId: department.id, title: u.designationTitle },
        select: { id: true },
      });
      if (!designation) {
        designation = await prisma.designation.create({
          data: { title: u.designationTitle, departmentId: department.id, level: u.designationLevel },
          select: { id: true },
        });
      }
      const user = await prisma.user.create({
        data: { email: u.email, password: pwHash, name: u.name, role: u.role, status: 'active', tenantId: tenant!.id },
      });
      await prisma.employee.create({
        data: {
          employeeId: u.employeeCode,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          userId: user.id,
          companyId: company.id,
          departmentId: department.id,
          designationId: designation.id,
          dateOfJoining: new Date('2026-01-05'),
        },
      }).catch(async (e: unknown) => {
        // employeeId collision with an old row — retry with a QA-prefixed code
        console.log(`  (employeeId ${u.employeeCode} taken — using QA-${u.employeeCode})`);
        return prisma.employee.create({
          data: {
            employeeId: `QA-${u.employeeCode}`,
            firstName: u.firstName, lastName: u.lastName, email: u.email,
            userId: user.id, companyId: company!.id, departmentId: department.id,
            designationId: designation!.id, dateOfJoining: new Date('2026-01-05'),
          },
        });
      });
      console.log(`✓ CREATED ${u.email} (${u.role})`);
    }
  }

  // ── Module flags (ALWAYS, even when all users already existed): provision
  // ALL modules enabled for the demo/test tenant, mirroring provisioning. ──
  const tenantForFlags = await prisma.tenant.findFirst({ where: { slug: { in: TENANT_SLUGS } } });
  if (tenantForFlags) {
    await enableModuleFlags(prisma, tenantForFlags.id);
  } else {
    console.log('• No demo/test tenant found — skipping module flags');
  }

  // ── Pass 3: ensure the 4 demo policies exist for the company ──
  const companyForPolicies = await prisma.company.findFirst({
    where: { companyGroup: { tenant: { slug: { in: TENANT_SLUGS } } } },
    include: { _count: { select: { policies: true } } },
  });
  if (companyForPolicies && companyForPolicies._count.policies === 0) {
    await seedPolicies(prisma, companyForPolicies.id);
  } else if (companyForPolicies) {
    console.log(`✓ Company already has ${companyForPolicies._count.policies} policy/policies — skipping policy seed`);
  }
  if (companyForPolicies) {
    console.log('─ Sample data for the QA tenant (HR/employee views):');
    await seedPeopleData(prisma, { id: companyForPolicies.id, code: companyForPolicies.code }, 'QAT');
  }

  // ── Pass 4: sample tenants — the same demo tenants the Super Admin sees on
  // the demo link (acme-global-demo, zenith-retail-demo, nova-tech-demo), so
  // the Tenants page on local/test shows a realistic list. Idempotent:
  // existing sample tenants only get their users' passwords ensured, module
  // flags enabled and policies added if missing. ──
  const SAMPLE_TENANTS = [
    { slug: 'acme-global-demo', name: 'Acme Global (Demo)', code: 'ACM', prefix: 'acme' },
    { slug: 'zenith-retail-demo', name: 'Zenith Retail (Demo)', code: 'ZRT', prefix: 'zenith' },
    { slug: 'nova-tech-demo', name: 'Nova Tech (Demo)', code: 'NVT', prefix: 'nova' },
  ];
  for (const s of SAMPLE_TENANTS) {
    await ensureSampleTenant(prisma, s, pwHash);
  }

  console.log('\n🎉 TEST logins ready (password for ALL: ' + PASSWORD + ')');
  console.log('   Login at https://test.3boxeshrms.com/login');
}

async function ensureSampleTenant(
  prisma: PrismaClient,
  s: { slug: string; name: string; code: string; prefix: string },
  pwHash: string,
) {
  let tenant = await prisma.tenant.findUnique({ where: { slug: s.slug } });
  const usersSpec = [
    { email: `tenantadmin.${s.prefix}@3boxeshrms.com`, name: `${s.name} Tenant Admin`, role: 'tenant_admin', firstName: 'Tenant', lastName: 'Admin', employeeCode: `${s.code}001`, designationTitle: 'Director', designationLevel: 1 },
    { email: `hr.${s.prefix}@3boxeshrms.com`, name: `${s.name} HR`, role: 'hr_admin', firstName: 'HR', lastName: 'Manager', employeeCode: `${s.code}002`, designationTitle: 'HR Manager', designationLevel: 3 },
    { email: `employee.${s.prefix}@3boxeshrms.com`, name: `${s.name} Employee`, role: 'employee', firstName: 'Test', lastName: 'Employee', employeeCode: `${s.code}003`, designationTitle: 'Software Engineer', designationLevel: 4 },
  ];

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: s.name, slug: s.slug, plan: 'professional', currency: 'INR', timezone: 'Asia/Kolkata' },
    });
    const group = await prisma.companyGroup.create({ data: { name: `${s.name} Group`, tenantId: tenant.id } });
    const company = await prisma.company.create({
      data: { name: s.name.replace(' (Demo)', ''), code: s.code, companyGroupId: group.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', status: 'active' },
    });
    const department = await prisma.department.create({ data: { name: 'General', code: 'GEN', companyId: company.id } });
    for (const u of usersSpec) {
      const user = await prisma.user.create({
        data: { email: u.email, password: pwHash, name: u.name, role: u.role, status: 'active', tenantId: tenant.id },
      });
      const designation = await prisma.designation.create({
        data: { title: u.designationTitle, departmentId: department.id, level: u.designationLevel },
      });
      await prisma.employee.create({
        data: {
          employeeId: u.employeeCode,
          firstName: u.firstName, lastName: u.lastName, email: u.email,
          userId: user.id, companyId: company.id, departmentId: department.id,
          designationId: designation.id, dateOfJoining: new Date('2026-01-05'),
        },
      });
    }
    await enableModuleFlags(prisma, tenant.id);
    await seedPolicies(prisma, company.id);
    await seedPeopleData(prisma, { id: company.id, code: company.code }, s.code);
    console.log(`✓ Sample tenant created: ${s.slug} (3 users + sample data)`);
    return;
  }

  // Exists — ensure passwords, flags and policies without duplicating anything
  for (const u of usersSpec) {
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { password: pwHash, status: 'active' } });
    } else {
      console.log(`  (sample tenant ${s.slug}: missing user ${u.email} — create it in the super admin UI if needed)`);
    }
  }
  await enableModuleFlags(prisma, tenant.id);
  const company = await prisma.company.findFirst({ where: { companyGroup: { tenantId: tenant.id } }, include: { _count: { select: { policies: true } } } });
  if (company && company._count.policies === 0) await seedPolicies(prisma, company.id);
  if (company) await seedPeopleData(prisma, { id: company.id, code: company.code }, s.code);
  console.log(`✓ Sample tenant exists: ${s.slug} — passwords ensured, flags enabled`);
}

/**
 * Rich sample data so HR/employee screens don't look empty:
 * extra employees, leave types + balances, this month's attendance,
 * and announcements (global — created only if none exist anywhere).
 */
async function seedPeopleData(prisma: PrismaClient, company: { id: string; code: string | null }, employeeCodePrefix: string) {
  const department = await prisma.department.findFirst({ where: { companyId: company.id }, select: { id: true } });
  if (!department) return;

  // 1. Six extra employees (no user accounts — just directory records for HR)
  const extras: { employeeId: string; firstName: string; lastName: string; designationTitle: string }[] = [
    { employeeId: `${employeeCodePrefix}004`, firstName: 'Ravi', lastName: 'Kumar', designationTitle: 'Software Engineer' },
    { employeeId: `${employeeCodePrefix}005`, firstName: 'Priya', lastName: 'Nair', designationTitle: 'QA Engineer' },
    { employeeId: `${employeeCodePrefix}006`, firstName: 'Amit', lastName: 'Sharma', designationTitle: 'Business Analyst' },
    { employeeId: `${employeeCodePrefix}007`, firstName: 'Sneha', lastName: 'Reddy', designationTitle: 'UI Designer' },
    { employeeId: `${employeeCodePrefix}008`, firstName: 'Vikram', lastName: 'Singh', designationTitle: 'DevOps Engineer' },
    { employeeId: `${employeeCodePrefix}009`, firstName: 'Anita', lastName: 'Joseph', designationTitle: 'HR Executive' },
  ];
  let empCreated = 0;
  for (const e of extras) {
    const exists = await prisma.employee.findUnique({ where: { employeeId: e.employeeId } }).catch(() => null);
    if (exists) continue;
    let designation = await prisma.designation.findFirst({ where: { departmentId: department.id, title: e.designationTitle }, select: { id: true } });
    if (!designation) designation = await prisma.designation.create({ data: { title: e.designationTitle, departmentId: department.id, level: 4 }, select: { id: true } });
    await prisma.employee.create({
      data: {
        employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName,
        email: `${e.employeeId.toLowerCase()}@3boxeshrms.com`,
        companyId: company.id, departmentId: department.id, designationId: designation.id,
        dateOfJoining: new Date('2026-02-01'),
      },
    });
    empCreated++;
  }
  if (empCreated) console.log(`  ✓ ${empCreated} extra employees created`);

  // 2. Leave types (code is globally unique — prefix with company code)
  const year = new Date().getFullYear();
  const leaveTypes: { name: string; code: string; defaultDays: number; carryForward: boolean; maxCarryForward: number }[] = [
    { name: 'Casual Leave', code: `${company.code || 'CMP'}-CAS`, defaultDays: 12, carryForward: true, maxCarryForward: 3 },
    { name: 'Sick Leave', code: `${company.code || 'CMP'}-SCK`, defaultDays: 10, carryForward: false, maxCarryForward: 0 },
    { name: 'Earned Leave', code: `${company.code || 'CMP'}-ERN`, defaultDays: 15, carryForward: true, maxCarryForward: 5 },
  ];
  const createdTypes: { id: string; name: string; defaultDays: number; carryForward: boolean; maxCarryForward: number }[] = [];
  let ltCreated = 0;
  for (const lt of leaveTypes) {
    let type = await prisma.leaveType.findFirst({ where: { companyId: company.id, name: lt.name }, select: { id: true, name: true, defaultDays: true, carryForward: true, maxCarryForward: true } });
    if (!type) {
      type = await prisma.leaveType.create({
        data: { name: lt.name, code: lt.code, description: `${lt.name} as per company policy`, defaultDays: lt.defaultDays, isPaid: true, carryForward: lt.carryForward, maxCarryForward: lt.maxCarryForward, status: 'active', companyId: company.id },
        select: { id: true, name: true, defaultDays: true, carryForward: true, maxCarryForward: true },
      });
      ltCreated++;
    }
    createdTypes.push(type);
  }
  if (ltCreated) console.log(`  ✓ ${ltCreated} leave types created`);

  // 3. Leave balances for all employees of the company (current year)
  const employees = await prisma.employee.findMany({ where: { companyId: company.id }, select: { id: true } });
  let balCreated = 0;
  for (const emp of employees) {
    for (const lt of createdTypes) {
      const exists = await prisma.leaveBalance.findFirst({ where: { employeeId: emp.id, leaveTypeId: lt.id, year }, select: { id: true } });
      if (exists) continue;
      const used = Math.floor(Math.random() * 4);
      await prisma.leaveBalance.create({
        data: { employeeId: emp.id, leaveTypeId: lt.id, year, total: lt.defaultDays, used, remaining: lt.defaultDays - used, carryForward: lt.carryForward ? Math.min(2, lt.maxCarryForward) : 0 },
      });
      balCreated++;
    }
  }
  if (balCreated) console.log(`  ✓ ${balCreated} leave balances created`);

  // 4. This month's attendance for user-linked employees (drives the Home attendance rate)
  const userEmployees = await prisma.employee.findMany({
    where: { companyId: company.id, userId: { not: null } },
    select: { id: true, firstName: true },
  });
  const monthStart = new Date(year, new Date().getMonth(), 1);
  const today = new Date();
  let attCreated = 0;
  for (const emp of userEmployees) {
    const already = await prisma.attendance.findFirst({ where: { employeeId: emp.id, date: { gte: monthStart } }, select: { id: true } });
    if (already) continue;
    for (let d = 1; d <= today.getDate(); d++) {
      const date = new Date(year, today.getMonth(), d, 9, 30, 0);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue; // weekend
      if (d > 18) continue; // ~19 working days
      const late = d % 7 === 3;
      const checkIn = new Date(year, today.getMonth(), d, late ? 10 : 9, late ? 25 : 30, 0);
      const checkOut = new Date(year, today.getMonth(), d, 18, 30, 0);
      await prisma.attendance.create({
        data: { employeeId: emp.id, date, checkIn, checkOut, status: late ? 'late' : 'present', workHours: 8 },
      });
      attCreated++;
    }
  }
  if (attCreated) console.log(`  ✓ ${attCreated} attendance records created`);

  // 5. Announcements (global table — seed only if there are none at all)
  const annCount = await prisma.announcement.count();
  if (annCount === 0) {
    await prisma.announcement.createMany({
      data: [
        { title: 'Welcome to 3Boxes HRMS', content: 'Explore your self-service dashboard — leave, attendance, payslips and more.', priority: 'normal' },
        { title: 'New Policies Published', content: 'Leave, Attendance, Code of Conduct and WFH policies are now available. Please review and acknowledge.', priority: 'important' },
      ],
    });
    console.log('  ✓ 2 announcements created');
  }
}

async function enableModuleFlags(prisma: PrismaClient, tenantId: string) {
  const MODULE_KEYS = ['dashboard', 'employees', 'company', 'recruitment', 'onboarding', 'attendance', 'leave', 'payroll', 'salary_structures', 'performance', 'training', 'learning', 'engagement', 'reports', 'settings', 'docs', 'helpdesk', 'assets', 'projects', 'invoices', 'expenses', 'travel', 'accounts', 'crm', 'it_admin_module', 'separation', 'grievances', 'workflows', 'timesheets', 'documents', 'ai_assistant', 'notifications', 'collaboration', 'requisitions'];
  let created = 0, updated = 0;
  for (const key of MODULE_KEYS) {
    const existing = await prisma.featureFlag.findFirst({ where: { tenantId, key: `module_${key}` }, select: { id: true } });
    if (existing) {
      await prisma.featureFlag.update({ where: { id: existing.id }, data: { enabled: true } });
      updated++;
    } else {
      await prisma.featureFlag.create({
        data: { tenantId, key: `module_${key}`, label: `Module: ${key}`, enabled: true, source: 'platform_default' },
      });
      created++;
    }
  }
  console.log(`  module flags: ${created} created, ${updated} updated (all enabled)`);
}

async function seedPolicies(prisma: PrismaClient, companyId: string) {
  const effective = new Date('2026-10-01');
  const policies = [
    { title: 'Leave Policy', category: 'leave', version: '2.0', description: 'Framework for managing employee leave.', content: null as string | null,
      fileUrl: makeSimplePdf('Leave Policy — Version 2.0', ['Effective From: 01 October 2026', '', '1. Purpose', '   Clear framework for managing employee leave.', '', '2. Types of Leave', '   Annual / Sick / Casual leave rules.']),
      fileName: 'Leave_Policy_v2.0.pdf', fileMimeType: 'application/pdf' },
    { title: 'Attendance Policy', category: 'attendance', version: '1.5', description: 'Working hours and regularisation process.', content: 'Work week Mon-Fri, 9:30 AM to 6:30 PM. Regularise missed punches within 3 working days.', fileUrl: null, fileName: null, fileMimeType: null },
    { title: 'Employee Code of Conduct', category: 'code_of_conduct', version: '1.0', description: 'Expected professional behaviour.', content: 'Maintain professional conduct, protect company property and confidential information.', fileUrl: null, fileName: null, fileMimeType: null },
    { title: 'Work From Home Policy', category: 'work', version: '1.2', description: 'Remote work guidelines.', content: 'Up to 2 WFH days per week with manager approval; reachable during core hours.', fileUrl: null, fileName: null, fileMimeType: null },
  ];
  for (const p of policies) {
    await prisma.policy.create({
      data: {
        title: p.title, category: p.category, description: p.description, content: p.content,
        version: p.version, status: 'active', effectiveDate: effective, companyId,
        fileUrl: p.fileUrl, fileName: p.fileName, fileMimeType: p.fileMimeType,
      } as any,
    });
  }
  console.log(`  ✓ 4 policies seeded`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
