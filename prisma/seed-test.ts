/**
 * TEST ENVIRONMENT seed — accounts for test.3boxeshrms.com
 *
 * ⚠️  RUN THIS ONLY AGAINST THE TEST DATABASE — never the production one.
 * Get the test DB URL from Vercel → (test/preview deployment) → Settings →
 * Environment Variables → POSTGRES_PRISMA_URL or DATABASE_URL, then run:
 *
 *   DATABASE_URL="<TEST_DB_URL>" npx tsx prisma/seed-test.ts
 *
 * Creates one test tenant with all roles + 4 active policies (so the
 * Policies Acknowledgement feature is testable). Idempotent — wipes only
 * its own tenant ('test-tenant') before re-creating.
 */
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found');
}

// Safety: refuse the obvious production platform host by name — a manual check,
// not a guarantee. Always double-check the URL before running.
if (/@[^/]*3boxeshrms\.com/i.test(connectionString) && !/@[^/]*(test|staging|dev)[^/]*\./i.test(connectionString)) {
  console.error('⛔ This connection string looks like a PRODUCTION database (non-test 3boxeshrms.com host).');
  console.error('   Aborting. Use the TEST database URL only.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TENANT_SLUG = 'test-tenant';
const PASSWORD = 'Test@123';

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
  console.log('🌱 Seeding TEST accounts...');
  console.log('ℹ️  Database:', masked.substring(0, 70));

  // ── Cleanup: ONLY this seed's own data (FK-safe order) ──
  const oldUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@test.3boxeshrms.com' } },
    select: { id: true },
  });
  for (const u of oldUsers) {
    await prisma.employee.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => null);
  }
  await prisma.tenant.deleteMany({ where: { slug: TENANT_SLUG } });
  await prisma.trialRegistration.deleteMany({ where: { tenant: { slug: TENANT_SLUG } } }).catch(() => null);

  const tenant = await prisma.tenant.create({
    data: { name: 'QA Test Tenant', slug: TENANT_SLUG, plan: 'enterprise', currency: 'INR', timezone: 'Asia/Kolkata' },
  });

  const group = await prisma.companyGroup.create({ data: { name: 'QA Test Group', tenantId: tenant.id } });
  const company = await prisma.company.create({
    data: { name: 'QA Test Company', code: 'QAT', companyGroupId: group.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', status: 'active' },
  });
  const department = await prisma.department.create({ data: { name: 'General', code: 'GEN', companyId: company.id } });
  const desigAdmin = await prisma.designation.create({ data: { title: 'Director', departmentId: department.id, level: 1 } });
  const desigHr = await prisma.designation.create({ data: { title: 'HR Manager', departmentId: department.id, level: 3 } });
  const desigEmp = await prisma.designation.create({ data: { title: 'Software Engineer', departmentId: department.id, level: 4 } });
  console.log('✓ Tenant / Company / Department');

  const pwHash = await bcryptjs.hash(PASSWORD, 10);
  const usersData = [
    { email: 'superadmin@test.3boxeshrms.com', name: 'QA Super Admin', role: 'super_admin', firstName: 'QA', lastName: 'Super', designationId: desigAdmin.id, employeeCode: 'QA001' },
    { email: 'tenantadmin@test.3boxeshrms.com', name: 'QA Tenant Admin', role: 'tenant_admin', firstName: 'QA', lastName: 'TenantAdmin', designationId: desigAdmin.id, employeeCode: 'QA002' },
    { email: 'hr@test.3boxeshrms.com', name: 'QA HR Manager', role: 'hr_admin', firstName: 'QA', lastName: 'HR', designationId: desigHr.id, employeeCode: 'QA003' },
    { email: 'employee@test.3boxeshrms.com', name: 'QA Employee', role: 'employee', firstName: 'QA', lastName: 'Employee', designationId: desigEmp.id, employeeCode: 'QA004' },
  ];

  for (const u of usersData) {
    const user = await prisma.user.create({
      data: { email: u.email, password: pwHash, name: u.name, role: u.role, status: 'active', tenantId: tenant.id },
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
        designationId: u.designationId,
        dateOfJoining: new Date('2026-01-05'),
      },
    });
    console.log(`✓ ${u.role.padEnd(12)} ${u.email}`);
  }

  // ── Policies for the Policies Acknowledgement feature ──
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
        version: p.version, status: 'active', effectiveDate: effective, companyId: company.id,
        fileUrl: p.fileUrl, fileName: p.fileName, fileMimeType: p.fileMimeType,
      } as any,
    });
    console.log(`✓ Policy: ${p.title} v${p.version}`);
  }

  console.log('\n🎉 TEST seed complete!');
  console.log('   Login at https://test.3boxeshrms.com/login  (after this code is deployed there)');
  console.log(`   ALL roles use password: ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
