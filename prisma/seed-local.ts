/**
 * Local development seed — minimal login setup + Policies Acknowledgement demo data.
 *
 * Creates: tenant → company group → company → department → designations →
 * 3 users (HR + employee + admin) with linked employee records → 4 active
 * policies (Leave Policy carries a small generated PDF so the embedded viewer
 * can be tested).
 *
 * Run:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npx tsx prisma/seed-local.ts
 * Idempotent: wipes the previous local tenant before re-creating.
 */
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TENANT_SLUG = 'local-dev';
const PASSWORD = 'Test@123';

/** Build a small single-page PDF with the given title and lines (raw PDF bytes). */
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
  console.log('🌱 Seeding LOCAL DEV database...');

  // ── Clean previous local data ──
  // '3boxes-hrms-demo' is also removed if present — a failed run of the main
  // seed.ts leaves a partial tenant behind with colliding employeeId codes.
  // Order matters: Employee→Department has no DB cascade, so employees go
  // first; TrialRegistration.tenantId is SET NULL on a NOT NULL column, so
  // those rows go before the tenants too.
  await prisma.employee.deleteMany({
    where: { OR: [{ employeeId: { in: ['EMP001', 'EMP002', 'EMP003'] } }, { email: { endsWith: '@local.3boxeshrms.com' } }, { email: { endsWith: '@3boxeshrms.com' } }] },
  });
  await prisma.user.deleteMany({
    where: { OR: [{ email: { endsWith: '@local.3boxeshrms.com' } }, { email: { endsWith: '@3boxeshrms.com' } }] },
  });
  await prisma.trialRegistration.deleteMany({});
  await prisma.tenant.deleteMany({ where: { slug: { in: [TENANT_SLUG, '3boxes-hrms-demo'] } } });

  const tenant = await prisma.tenant.create({
    data: { name: 'Local Dev Tenant', slug: TENANT_SLUG, plan: 'enterprise', currency: 'INR', timezone: 'Asia/Kolkata' },
  });
  console.log('✓ Tenant');

  const pwHash = await bcryptjs.hash(PASSWORD, 10);

  const group = await prisma.companyGroup.create({
    data: { name: 'Local Dev Group', tenantId: tenant.id },
  });
  const company = await prisma.company.create({
    data: { name: 'Local Dev Company', code: 'LDC', companyGroupId: group.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', status: 'active' },
  });
  const department = await prisma.department.create({
    data: { name: 'General', code: 'GEN', companyId: company.id },
  });
  const desigHr = await prisma.designation.create({ data: { title: 'HR Manager', departmentId: department.id, level: 3 } });
  const desigEmp = await prisma.designation.create({ data: { title: 'Software Engineer', departmentId: department.id, level: 4 } });
  console.log('✓ Company / Department / Designations');

  const usersData = [
    { email: 'admin@local.3boxeshrms.com', name: 'Arjun Menon', role: 'super_admin', firstName: 'Arjun', lastName: 'Menon', designationId: desigHr.id, employeeCode: 'EMP001' },
    { email: 'hr@local.3boxeshrms.com', name: 'Divya Sharma', role: 'hr_admin', firstName: 'Divya', lastName: 'Sharma', designationId: desigHr.id, employeeCode: 'EMP002' },
    { email: 'employee@local.3boxeshrms.com', name: 'Keerthan Rao', role: 'employee', firstName: 'Keerthan', lastName: 'Rao', designationId: desigEmp.id, employeeCode: 'EMP003' },
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
        dateOfJoining: new Date('2025-04-01'),
      },
    });
    console.log(`✓ User + Employee: ${u.email} (${u.role})`);
  }

  // ── Policies per the requirement document examples ──
  const effective = new Date('2026-10-01');
  const policies = [
    {
      title: 'Leave Policy',
      category: 'leave',
      description: 'Framework for managing employee leave — annual, sick and casual leave rules.',
      version: '2.0',
      content: null,
      fileUrl: makeSimplePdf('Leave Policy — Version 2.0', [
        'Effective From: 01 October 2026',
        '',
        '1. Purpose',
        '   The Leave Policy provides a clear framework for managing employee leave.',
        '',
        '2. Types of Leave',
        '   2.1 Annual Leave - paid annual leave as per company policy.',
        '   2.2 Sick Leave - with valid medical certificate where required.',
        '',
        '3. Leave Application Process',
        '   Submit leave requests through the HRMS portal at least 2 days in advance.',
        '',
        '4. Approval',
        '   All leaves require reporting manager approval before availing.',
      ]),
      fileName: 'Leave_Policy_v2.0.pdf',
      fileSize: 1400,
      fileMimeType: 'application/pdf',
    },
    {
      title: 'Attendance Policy',
      category: 'attendance',
      description: 'Working hours, punch-in rules, late marks and regularisation process.',
      version: '1.5',
      content: 'Standard work week is Monday to Friday, 9:30 AM to 6:30 PM. Punch-in via the web portal or biometric device. Three late marks in a month equal one half-day. Missed punches must be regularised within 3 working days via the attendance page.',
    },
    {
      title: 'Employee Code of Conduct',
      category: 'code_of_conduct',
      description: 'Expected professional behaviour, workplace ethics and disciplinary process.',
      version: '1.0',
      content: 'Employees must maintain professional conduct, respect colleagues, protect company property and confidential information, and comply with all applicable laws. Violations are handled through the disciplinary process described in the employee handbook.',
    },
    {
      title: 'Work From Home Policy',
      category: 'work',
      description: 'Eligibility and guidelines for remote work arrangements.',
      version: '1.2',
      content: 'Hybrid employees may work from home up to 2 days per week with manager approval. Fully remote arrangements require HR and department head sign-off. Employees must be reachable during core hours (11 AM - 4 PM) and maintain a secure working environment.',
    },
  ];

  for (const p of policies) {
    await prisma.policy.create({
      data: {
        title: p.title,
        category: p.category,
        description: p.description,
        content: p.content ?? null,
        version: p.version,
        status: 'active',
        effectiveDate: effective,
        companyId: company.id,
        fileUrl: p.fileUrl ?? null,
        fileName: p.fileName ?? null,
        fileSize: p.fileSize ?? null,
        fileMimeType: p.fileMimeType ?? null,
      } as any,
    });
    console.log(`✓ Policy: ${p.title} v${p.version}`);
  }

  console.log('\n🎉 Local seed complete!');
  console.log('   Login at http://localhost:3000/login');
  console.log(`   Employee:  employee@local.3boxeshrms.com / ${PASSWORD}`);
  console.log(`   HR/Admin:  hr@local.3boxeshrms.com / ${PASSWORD}`);
  console.log(`   Super:     admin@local.3boxeshrms.com / ${PASSWORD}`);
  console.log('   4 active policies seeded — all pending acknowledgement for the employee.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
