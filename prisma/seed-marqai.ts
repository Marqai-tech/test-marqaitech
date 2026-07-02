/**
 * 3Boxes HRMS - Marq AI Tech Group Seed Script
 *
 * Seeds the database with:
 *   - 1 Tenant: "Marq AI Tech Group" (slug: marqaitechgroup)
 *   - 1 Company Group: "Marq AI Tech Group"
 *   - 4 Companies:
 *       1) MARQ AI TECH PVT LTD
 *       2) 3 BOXES LUXURY CURATIONS
 *       3) 3 BOXES CONSULTING SERVICES
 *       4) 3 BOXES TECHNOLOGIES
 *   - Users: 1 super_admin, 1 tenant_admin (NO sample employees)
 *   - Basic master data: branches, departments, designations per company
 *
 * HR admins of each company will add their own employees and data.
 *
 * Usage: npx tsx prisma/seed-marqai.ts
 * 
 * Git Branch: marqai-tech-group
 * Last Updated: 2026-07-02
 */

import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found. Set POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL');
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

// ==================== COMPANY CONFIGURATION ====================
const TENANT_CONFIG = {
  name: 'Marq AI Tech Group',
  slug: 'marqaitechgroup',
  domain: 'marqaitechgroup.3boxeshrms.com',
  plan: 'enterprise' as const,
  country: 'IN',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  language: 'en',
  baseCurrency: 'INR',
  maxCompaniesAllowed: 10,
};

const COMPANIES = [
  { name: 'MARQ AI TECH PVT LTD', code: 'MATPL', city: 'Hyderabad', state: 'TS', email: 'info@marqaitech.com', website: 'https://marqaitech.com' },
  { name: '3 BOXES LUXURY CURATIONS', code: '3BLC', city: 'Hyderabad', state: 'TS', email: 'info@3boxesluxury.com', website: 'https://3boxesluxury.com' },
  { name: '3 BOXES CONSULTING SERVICES', code: '3BCS', city: 'Bangalore', state: 'KA', email: 'info@3boxesconsulting.com', website: 'https://3boxesconsulting.com' },
  { name: '3 BOXES TECHNOLOGIES', code: '3BT', city: 'Chennai', state: 'TN', email: 'info@3boxestechnologies.com', website: 'https://3boxestechnologies.com' },
];

// Basic departments per company (HR will add more as needed)
const DEPARTMENTS = ['Human Resources', 'Finance', 'Operations'];

// Basic designations per department
const DESIGNATIONS = [
  { title: 'CEO', deptName: 'Human Resources', level: 10 },
  { title: 'HR Manager', deptName: 'Human Resources', level: 5 },
  { title: 'Finance Manager', deptName: 'Finance', level: 5 },
  { title: 'Operations Manager', deptName: 'Operations', level: 5 },
];

const DEFAULT_PASSWORD = 'MarqAI@2026';

async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(12);
  return bcryptjs.hash(password, salt);
}

async function main() {
  console.log('🌱 Seeding Marq AI Tech Group...');
  console.log('ℹ️  Using connection string prefix:', connectionString?.substring(0, 30) + '...');

  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // ==================== TENANT ====================
  console.log('\n📋 Creating Tenant: Marq AI Tech Group...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_CONFIG.slug },
    update: {
      name: TENANT_CONFIG.name,
      domain: TENANT_CONFIG.domain,
    },
    create: {
      name: TENANT_CONFIG.name,
      slug: TENANT_CONFIG.slug,
      domain: TENANT_CONFIG.domain,
      plan: TENANT_CONFIG.plan,
      status: 'active',
      country: TENANT_CONFIG.country,
      currency: TENANT_CONFIG.currency,
      timezone: TENANT_CONFIG.timezone,
      language: TENANT_CONFIG.language,
      baseCurrency: TENANT_CONFIG.baseCurrency,
      maxCompaniesAllowed: TENANT_CONFIG.maxCompaniesAllowed,
      aiFeedbackEnabled: true,
      resumeScoreThreshold: 0,
      talentPoolCrossCompanyEnabled: true,
      videoInterviewRetakeLimit: 2,
      videoRetentionDays: 90,
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ==================== COMPANY GROUP ====================
  console.log('\n📋 Creating Company Group...');
  const companyGroup = await prisma.companyGroup.upsert({
    where: { id: `cg-marqai-${tenant.id}` },
    update: {},
    create: {
      id: `cg-marqai-${tenant.id}`,
      name: 'Marq AI Tech Group',
      tenantId: tenant.id,
      employeeLimitMode: 'group_total',
      maxEmployees: 500,
      maxCompanies: 10,
    },
  });
  console.log(`  ✓ CompanyGroup: ${companyGroup.name}`);

  // ==================== COMPANIES (4) ====================
  console.log('\n📋 Creating 4 Companies...');
  const createdCompanies = [];
  for (const comp of COMPANIES) {
    // Try to find existing by name within the group
    const existing = await prisma.company.findFirst({
      where: { name: comp.name, companyGroupId: companyGroup.id },
    });
    
    if (existing) {
      console.log(`  ✓ Company already exists: ${comp.name} (${comp.code})`);
      createdCompanies.push(existing);
    } else {
      const created = await prisma.company.create({
        data: {
          name: comp.name,
          code: comp.code,
          companyGroupId: companyGroup.id,
          country: 'IN',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          city: comp.city,
          state: comp.state,
          email: comp.email,
          website: comp.website,
          status: 'active',
          maxEmployees: 100,
        },
      });
      createdCompanies.push(created);
      console.log(`  ✓ Company: ${created.name} (${created.code})`);
    }
  }

  // ==================== BRANCHES ====================
  console.log('\n📋 Creating Branches...');
  const branches = [];
  for (const company of createdCompanies) {
    const existing = await prisma.branch.findFirst({
      where: { companyId: company.id, name: `${company.name} - Head Office` },
    });
    if (existing) {
      branches.push(existing);
      console.log(`  ✓ Branch exists: ${existing.name}`);
    } else {
      const branch = await prisma.branch.create({
        data: {
          name: `${company.name} - Head Office`,
          code: `${company.code}-HO`,
          companyId: company.id,
          city: company.city || 'Hyderabad',
          state: company.state || 'TS',
          country: 'IN',
          status: 'active',
        },
      });
      branches.push(branch);
      console.log(`  ✓ Branch: ${branch.name}`);
    }
  }

  // ==================== DEPARTMENTS ====================
  console.log('\n📋 Creating Basic Departments...');
  const departments = [];
  for (let i = 0; i < createdCompanies.length; i++) {
    const company = createdCompanies[i];
    const branch = branches[i];
    for (const deptName of DEPARTMENTS) {
      const existing = await prisma.department.findFirst({
        where: { name: deptName, companyId: company.id, branchId: branch.id },
      });
      if (existing) {
        departments.push({ ...existing, companyIndex: i });
      } else {
        const dept = await prisma.department.create({
          data: {
            name: deptName,
            companyId: company.id,
            branchId: branch.id,
            status: 'active',
          },
        });
        departments.push({ ...dept, companyIndex: i });
      }
    }
    console.log(`  ✓ ${company.code}: ${DEPARTMENTS.join(', ')}`);
  }
  console.log(`  Total: ${departments.length} departments`);

  // ==================== DESIGNATIONS ====================
  console.log('\n📋 Creating Basic Designations...');
  let desCount = 0;
  for (const template of DESIGNATIONS) {
    const matchingDepts = departments.filter(d => d.name === template.deptName);
    for (const dept of matchingDepts) {
      const existing = await prisma.designation.findFirst({
        where: { title: template.title, departmentId: dept.id },
      });
      if (!existing) {
        await prisma.designation.create({
          data: {
            title: template.title,
            departmentId: dept.id,
            level: template.level,
            status: 'active',
          },
        });
        desCount++;
      }
    }
  }
  console.log(`  ✓ Created ${desCount} new designations (basic set for HR to build upon)`);

  // ==================== SUPER ADMIN USER ====================
  console.log('\n📋 Creating Super Admin user...');
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@3boxeshrms.com' },
    update: { password: hashedPassword },
    create: {
      email: 'superadmin@3boxeshrms.com',
      name: '3Boxes Super Admin',
      password: hashedPassword,
      role: 'super_admin',
      status: 'active',
      tenantId: tenant.id,
    },
  });
  console.log(`  ✓ Super Admin: ${superAdmin.email}`);

  // ==================== TENANT ADMIN USER ====================
  console.log('\n📋 Creating Tenant Admin user...');
  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'admin@marqaitechgroup.com' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@marqaitechgroup.com',
      name: 'Marq AI Tech Group Admin',
      password: hashedPassword,
      role: 'tenant_admin',
      status: 'active',
      tenantId: tenant.id,
    },
  });
  console.log(`  ✓ Tenant Admin: ${tenantAdmin.email}`);

  // ==================== COMPANY HR ADMINS ====================
  console.log('\n📋 Creating Company HR Admin users...');
  const hrAdminData = [
    { email: 'admin@marqaitech.com', name: 'Admin - MARQ AI TECH', firstName: 'Admin', lastName: 'MARQ AI TECH', companyCode: 'MATPL' },
    { email: 'admin@3boxesluxury.com', name: 'Admin - 3 BOXES LUXURY', firstName: 'Admin', lastName: '3 BOXES LUXURY', companyCode: '3BLC' },
    { email: 'admin@3boxesconsulting.com', name: 'Admin - 3 BOXES CONSULTING', firstName: 'Admin', lastName: '3 BOXES CONSULTING', companyCode: '3BCS' },
    { email: 'admin@3boxestechnologies.com', name: 'Admin - 3 BOXES TECH', firstName: 'Admin', lastName: '3 BOXES TECH', companyCode: '3BT' },
  ];

  for (const hr of hrAdminData) {
    const company = createdCompanies.find(c => c.code === hr.companyCode);
    if (!company) { console.log(`  ⚠ Company not found: ${hr.companyCode}`); continue; }
    
    const branch = branches.find(b => b.companyId === company.id);
    const hrDept = departments.find(d => d.companyIndex === createdCompanies.indexOf(company) && d.name === 'Human Resources');
    const hrDes = await prisma.designation.findFirst({
      where: { title: 'HR Manager', department: { companyId: company.id } },
    });

    const hrAdmin = await prisma.user.upsert({
      where: { email: hr.email },
      update: { password: hashedPassword, name: hr.name, tenantId: tenant.id },
      create: {
        email: hr.email,
        name: hr.name,
        password: hashedPassword,
        role: 'company_hr_admin',
        status: 'active',
        tenantId: tenant.id,
      },
    });

    // Create employee record
    if (branch && hrDept && hrDes) {
      await prisma.employee.upsert({
        where: { userId: hrAdmin.id },
        update: {
          companyId: company.id,
          branchId: branch.id,
          departmentId: hrDept.id,
          designationId: hrDes.id,
          email: hr.email,
        },
        create: {
          userId: hrAdmin.id,
          companyId: company.id,
          branchId: branch.id,
          departmentId: hrDept.id,
          designationId: hrDes.id,
          employeeId: `ADM-${hr.companyCode}-001`,
          firstName: hr.firstName,
          lastName: hr.lastName,
          email: hr.email,
          status: 'active',
          dateOfJoining: new Date(),
        },
      });
    }
    console.log(`  ✓ HR Admin: ${hr.email} → ${company.name}`);
  }

  // ==================== SUMMARY ====================
  console.log('\n========================================');
  console.log('  ✅ Marq AI Tech Group Seed Complete!');
  console.log('========================================');
  console.log('');
  console.log('  🏢 Tenant: Marq AI Tech Group');
  console.log('  🌐 Domain: marqaitechgroup.3boxeshrms.com');
  console.log('');
  console.log('  🏢 Group Companies:');
  COMPANIES.forEach((c, i) => console.log(`     ${i + 1}. ${c.name} (${c.code})`));
  console.log('');
  console.log('  📧 Login Credentials (all passwords: MarqAI@2026):');
  console.log('');
  console.log('  🔑 Super Admin:');
  console.log('     superadmin@3boxeshrms.com');
  console.log('');
  console.log('  🔑 Tenant Admin (access to all 4 companies):');
  console.log('     admin@marqaitechgroup.com');
  console.log('');
  console.log('  🔑 Company HR Admins:');
  console.log('     admin@marqaitech.com → MARQ AI TECH PVT LTD');
  console.log('     admin@3boxesluxury.com → 3 BOXES LUXURY CURATIONS');
  console.log('     admin@3boxesconsulting.com → 3 BOXES CONSULTING SERVICES');
  console.log('     admin@3boxestechnologies.com → 3 BOXES TECHNOLOGIES');
  console.log('');
  console.log('  ⚠️  No sample employees created - HR admins will add their own data');
  console.log('  ⚠️  Change all passwords after first login!');
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  });
