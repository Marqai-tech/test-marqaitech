import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import bcryptjs from 'bcryptjs';

/**
 * POST /api/admin/seed-marqai
 *
 * Seeds the database with MarqAI Tech Group data.
 * This endpoint is DISABLED after initial seeding for security.
 *
 * To re-enable temporarily, change SEED_ENABLED to true.
 * SECURITY: Requires a secret key to prevent unauthorized seeding.
 * Pass ?key=MARQAI_SEED_2026 in the URL.
 */

const SEED_ENABLED = false; // Set to true only when you need to (re-)seed

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    if (!SEED_ENABLED) {
      return NextResponse.json({ error: 'Seed endpoint is disabled. Set SEED_ENABLED=true in source code to re-enable.' }, { status: 403 });
    }

    // Security check - require a secret key
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (key !== 'MARQAI_SEED_2026') {
      return NextResponse.json({ error: 'Invalid seed key' }, { status: 403 });
    }

    const force = searchParams.get('force') === 'true';

    // Check if MarqAI tenant already exists
    const existing = await getPlatformDb().tenant.findUnique({
      where: { slug: 'marqaitechgroup' },
    });

    if (existing && !force) {
      return NextResponse.json({
        message: 'MarqAI Tech Group already seeded. Use ?force=true to re-seed.',
        tenantId: existing.id,
      });
    }

    // If force=true and tenant exists, clean up existing data
    if (existing) {
      console.log('[seed-marqai] Force re-seed: cleaning up existing data...');
      // Delete in reverse dependency order
      const existingGroup = await db.companyGroup.findFirst({
        where: { tenantId: existing.id },
      });
      if (existingGroup) {
        const existingCompanies = await db.company.findMany({
          where: { companyGroupId: existingGroup.id },
          select: { id: true },
        });
        const companyIds = existingCompanies.map(c => c.id);

        // Delete employees, branches, departments for each company
        for (const companyId of companyIds) {
          await db.employee.deleteMany({ where: { companyId } });
          await db.department.deleteMany({ where: { companyId } });
          await db.branch.deleteMany({ where: { companyId } });
        }
        await db.company.deleteMany({ where: { companyGroupId: existingGroup.id } });
        await db.companyGroup.deleteMany({ where: { id: existingGroup.id } });
      }
      // Delete users for this tenant (except super_admin from different tenant)
      await db.user.deleteMany({
        where: { tenantId: existing.id },
      });
      // Delete the tenant itself
      await getPlatformDb().tenant.delete({ where: { id: existing.id } });
      console.log('[seed-marqai] Cleanup complete, re-seeding...');
    }

    const hashedPassword = await bcryptjs.hash('MarqAI@2026', 12);

    // ==================== TENANT ====================
    const tenant = await getPlatformDb().tenant.create({
      data: {
        name: 'MarqAI Tech Group',
        slug: 'marqaitechgroup',
        domain: 'marqaitechgroup.3boxeshrms.com',
        plan: 'enterprise',
        status: 'active',
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        language: 'en',
        baseCurrency: 'INR',
        maxCompaniesAllowed: 10,
        aiFeedbackEnabled: true,
        resumeScoreThreshold: 0,
        talentPoolCrossCompanyEnabled: true,
        videoInterviewRetakeLimit: 2,
        videoRetentionDays: 90,
      },
    });

    // ==================== COMPANY GROUP ====================
    const companyGroup = await db.companyGroup.create({
      data: {
        name: 'MarqAI Tech Group',
        tenantId: tenant.id,
        employeeLimitMode: 'group_total',
        maxEmployees: 500,
        maxCompanies: 10,
      },
    });

    // ==================== COMPANIES (5) ====================
    const companiesData = [
      { name: 'MarqAI Tech Pvt Ltd', code: 'MTPL', city: 'Hyderabad', state: 'TS', email: 'info@marqaitech.com', website: 'https://marqaitech.com' },
      { name: 'MarqAI Solutions Pvt Ltd', code: 'MSPL', city: 'Hyderabad', state: 'TS', email: 'info@marqaisolutions.com', website: 'https://marqaisolutions.com' },
      { name: 'MarqAI Digital Pvt Ltd', code: 'MDPL', city: 'Bangalore', state: 'KA', email: 'info@marqaidigital.com', website: 'https://marqaidigital.com' },
      { name: 'MarqAI Innovations Pvt Ltd', code: 'MIPL', city: 'Chennai', state: 'TN', email: 'info@marqaiinnovations.com', website: 'https://marqaiinnovations.com' },
      { name: 'MarqAI Consulting Pvt Ltd', code: 'MCPL', city: 'Mumbai', state: 'MH', email: 'info@marqaiconsulting.com', website: 'https://marqaiconsulting.com' },
    ];

    const createdCompanies = [];
    const createdBranches = [];
    for (const c of companiesData) {
      const company = await db.company.create({
        data: {
          name: c.name, code: c.code, companyGroupId: companyGroup.id,
          country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
          city: c.city, state: c.state, email: c.email, website: c.website,
          status: 'active', maxEmployees: 100,
        },
      });
      createdCompanies.push(company);

      const branch = await db.branch.create({
        data: {
          name: `${c.name} - Head Office`, code: `${c.code}-HO`,
          companyId: company.id, city: c.city, state: c.state, country: 'IN', status: 'active',
        },
      });
      createdBranches.push(branch);
    }

    // ==================== DEPARTMENTS & DESIGNATIONS ====================
    const deptNames = ['Human Resources', 'Engineering', 'Finance', 'Operations', 'Sales & Marketing'];
    const designationDefs = [
      { title: 'CEO', dept: 'Human Resources' },
      { title: 'CTO', dept: 'Engineering' },
      { title: 'HR Manager', dept: 'Human Resources' },
      { title: 'Software Engineer', dept: 'Engineering' },
      { title: 'Senior Software Engineer', dept: 'Engineering' },
      { title: 'Team Lead', dept: 'Engineering' },
      { title: 'Finance Manager', dept: 'Finance' },
      { title: 'Sales Manager', dept: 'Sales & Marketing' },
    ];

    const allDepts: { id: string; name: string; companyIndex: number }[] = [];
    for (let i = 0; i < createdCompanies.length; i++) {
      for (const dn of deptNames) {
        const dept = await db.department.create({
          data: { name: dn, companyId: createdCompanies[i].id, branchId: createdBranches[i].id, status: 'active' },
        });
        allDepts.push({ id: dept.id, name: dept.name, companyIndex: i });
      }
    }

    // Designations require title + departmentId, so create per company
    const allDesignations: { id: string; title: string; companyIndex: number }[] = [];
    for (let i = 0; i < createdCompanies.length; i++) {
      for (const dd of designationDefs) {
        const dept = allDepts.find(d => d.companyIndex === i && d.name === dd.dept);
        if (dept) {
          const des = await db.designation.create({
            data: { title: dd.title, departmentId: dept.id, status: 'active' },
          });
          allDesignations.push({ id: des.id, title: dd.title, companyIndex: i });
        }
      }
    }

    // ==================== SUPER ADMIN ====================
    const superAdmin = await db.user.create({
      data: {
        email: 'superadmin@3boxeshrms.com', name: '3Boxes Super Admin',
        password: hashedPassword, role: 'super_admin', status: 'active', tenantId: tenant.id,
      },
    });

    // ==================== TENANT ADMIN ====================
    const tenantAdmin = await db.user.create({
      data: {
        email: 'admin@marqaitechgroup.com', name: 'MarqAI Tech Group Admin',
        password: hashedPassword, role: 'tenant_admin', status: 'active', tenantId: tenant.id,
      },
    });

    // ==================== HR ADMINS + EMPLOYEES ====================
    const hrEmails = ['hr@marqaitech.com', 'hr@marqaisolutions.com', 'hr@marqaidigital.com', 'hr@marqaiinnovations.com', 'hr@marqaiconsulting.com'];
    const empData = [
      { email: 'rajesh.kumar@marqaitech.com', firstName: 'Rajesh', lastName: 'Kumar', desName: 'Senior Software Engineer' },
      { email: 'priya.sharma@marqaisolutions.com', firstName: 'Priya', lastName: 'Sharma', desName: 'Software Engineer' },
      { email: 'amit.patel@marqaidigital.com', firstName: 'Amit', lastName: 'Patel', desName: 'Team Lead' },
      { email: 'sneha.reddy@marqaiinnovations.com', firstName: 'Sneha', lastName: 'Reddy', desName: 'Software Engineer' },
      { email: 'vikram.singh@marqaiconsulting.com', firstName: 'Vikram', lastName: 'Singh', desName: 'Finance Manager' },
    ];

    const createdUsers = [];
    for (let i = 0; i < createdCompanies.length; i++) {
      // HR Admin
      const hrDept = allDepts.find(d => d.companyIndex === i && d.name === 'Human Resources');
      const hrDes = allDesignations.find(d => d.companyIndex === i && d.title === 'HR Manager');

      const hrUser = await db.user.create({
        data: {
          email: hrEmails[i], name: `HR Admin - ${createdCompanies[i].name}`,
          password: hashedPassword, role: 'admin', status: 'active', tenantId: tenant.id,
        },
      });
      createdUsers.push(hrUser);

      if (hrDept && hrDes) {
        await db.employee.create({
          data: {
            userId: hrUser.id, companyId: createdCompanies[i].id, branchId: createdBranches[i].id,
            departmentId: hrDept.id, designationId: hrDes.id,
            employeeId: `EMP-${createdCompanies[i].code}-HR001`,
            firstName: 'HR', lastName: 'Admin', email: hrEmails[i],
            status: 'active', dateOfJoining: new Date(),
          },
        });
      }

      // Employee
      const emp = empData[i];
      const engDept = allDepts.find(d => d.companyIndex === i && d.name === 'Engineering') || allDepts.find(d => d.companyIndex === i && d.name === 'Finance');
      const empDes = allDesignations.find(d => d.companyIndex === i && d.title === emp.desName);

      const empUser = await db.user.create({
        data: {
          email: emp.email, name: `${emp.firstName} ${emp.lastName}`,
          password: hashedPassword, role: 'admin', status: 'active', tenantId: tenant.id,
        },
      });
      createdUsers.push(empUser);

      if (engDept && empDes) {
        await db.employee.create({
          data: {
            userId: empUser.id, companyId: createdCompanies[i].id, branchId: createdBranches[i].id,
            departmentId: engDept.id, designationId: empDes.id,
            employeeId: `EMP-${createdCompanies[i].code}-E001`,
            firstName: emp.firstName, lastName: emp.lastName, email: emp.email,
            status: 'active', dateOfJoining: new Date(),
          },
        });
      }
    }

    // ==================== SUBSCRIPTION PLAN ====================
    try {
      await getPlatformDb().subscriptionPlan.create({
        data: {
          id: 'plan-enterprise-marqai',
          name: 'Enterprise', price: 9999.00, currency: 'INR', billingCycle: 'monthly',
          features: JSON.stringify(['Unlimited Employees', 'Multi-Company', 'AI Features', 'Priority Support']),
          maxEmployees: 500, maxCompanies: 10,
        },
      });
    } catch { /* ignore if exists */ }

    return NextResponse.json({
      success: true,
      message: 'MarqAI Tech Group seeded successfully!',
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, domain: tenant.domain },
        companies: createdCompanies.map(c => ({ name: c.name, code: c.code })),
        users: {
          superAdmin: superAdmin.email,
          tenantAdmin: tenantAdmin.email,
          hrAdmins: hrEmails,
          employees: empData.map(e => e.email),
        },
        password: 'MarqAI@2026 (change after first login!)',
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Seed failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
