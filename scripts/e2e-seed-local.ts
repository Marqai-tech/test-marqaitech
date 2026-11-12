/**
 * E2E seed — adds manager / ceo / finance users (with linked employee records)
 * to the tenant created by prisma/seed-local.ts. Idempotent: skips users that
 * already exist.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npx tsx scripts/e2e-seed-local.ts
 */
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('No database connection string found');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Test@123';

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'local-dev' } });
  if (!tenant) throw new Error('local-dev tenant not found — run prisma/seed-local.ts first');

  const group = await prisma.companyGroup.findFirst({ where: { tenantId: tenant.id } });
  const company = await prisma.company.findFirst({
    where: group ? { companyGroupId: group.id, name: 'Local Dev Company' } : { name: 'Local Dev Company' },
  });
  if (!company) throw new Error('Local Dev Company not found');

  const department = await prisma.department.findFirst({ where: { companyId: company.id } });
  if (!department) throw new Error('Department not found');

  const desigMgr = await prisma.designation.findFirst({ where: { departmentId: department.id, title: 'HR Manager' } }) ||
    (await prisma.designation.create({ data: { title: 'Engineering Manager', departmentId: department.id, level: 3 } }));
  const desigExec = await prisma.designation.findFirst({ where: { departmentId: department.id, title: 'Software Engineer' } }) ||
    (await prisma.designation.create({ data: { title: 'Chief Executive Officer', departmentId: department.id, level: 1 } }));

  const pwHash = await bcryptjs.hash(PASSWORD, 10);

  const usersData = [
    { email: 'manager@local.3boxeshrms.com', name: 'Ravi Kumar', role: 'manager', firstName: 'Ravi', lastName: 'Kumar', designationId: desigMgr?.id, employeeCode: 'EMP004' },
    { email: 'ceo@local.3boxeshrms.com', name: 'Priya Nair', role: 'ceo', firstName: 'Priya', lastName: 'Nair', designationId: desigExec?.id, employeeCode: 'EMP005' },
    { email: 'finance@local.3boxeshrms.com', name: 'Suresh Iyer', role: 'finance_admin', firstName: 'Suresh', lastName: 'Iyer', designationId: desigMgr?.id, employeeCode: 'EMP006' },
  ];

  for (const u of usersData) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`• already exists: ${u.email} (${u.role})`);
      continue;
    }
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
        designationId: u.designationId ?? null,
        dateOfJoining: new Date('2025-04-01'),
      },
    });
    console.log(`✓ User + Employee: ${u.email} (${u.role})`);
  }

  console.log('\n🎉 E2E seed complete. All passwords: Test@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
