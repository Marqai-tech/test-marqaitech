/**
 * Add the local biometric integration test employee without resetting local data.
 *
 * Run with the local development database configured:
 *   npx tsx prisma/seed-biometric-local.ts
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

// Next.js loads its environment files automatically, but standalone tsx seed
// scripts do not. Prefer local overrides, then fall back to the project .env.
dotenv.config({ path: ['.env.local', '.env'] });

const allowedLocalHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal', 'postgres', 'db']);
const databaseCandidates = [
  process.env.LOCAL_TEST_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRES_PRISMA_URL,
].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
const connectionString = databaseCandidates.find((candidate) => {
  try {
    return allowedLocalHosts.has(new URL(candidate).hostname.toLowerCase());
  } catch {
    return false;
  }
});
if (!connectionString) {
  throw new Error('Set LOCAL_TEST_DATABASE_URL in .env.local to a local PostgreSQL URL (localhost/127.0.0.1). Remote database URLs are ignored.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }),
});

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'local-dev' }, select: { id: true } });
  if (!tenant) throw new Error('Local dev tenant "local-dev" was not found. Set up the local test company first.');

  const company = await prisma.company.findFirst({
    where: { companyGroup: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!company) throw new Error('The local dev tenant has no company. Set up the local test company first.');

  const department = await prisma.department.findFirst({
    where: { companyId: company.id },
    select: { id: true },
  });
  if (!department) throw new Error('The local dev company has no department. Set up the local test company first.');

  const designation = await prisma.designation.findFirst({
    where: { departmentId: department.id },
    select: { id: true },
  });
  if (!designation) throw new Error('The local dev company has no designation. Set up the local test company first.');

  const existing = await prisma.employee.findUnique({
    where: { employeeId: 'MARQ010' },
    select: { id: true, companyId: true },
  });
  if (existing && existing.companyId !== company.id) {
    throw new Error('Employee code MARQ010 already belongs to another company; no changes were made.');
  }

  await prisma.employee.upsert({
    where: { employeeId: 'MARQ010' },
    create: {
      employeeId: 'MARQ010',
      firstName: 'Manoj',
      lastName: 'Test',
      email: 'manoj.biometric@local.3boxeshrms.com',
      companyId: company.id,
      departmentId: department.id,
      designationId: designation.id,
      dateOfJoining: new Date('2026-01-05'),
    },
    update: {
      firstName: 'Manoj',
      lastName: 'Test',
      email: 'manoj.biometric@local.3boxeshrms.com',
      companyId: company.id,
      departmentId: department.id,
      designationId: designation.id,
    },
  });

  console.log('✓ Local biometric test employee is ready: Manoj Test (MARQ010)');
}

main()
  .catch((error: unknown) => {
    console.error('Local biometric test employee setup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
