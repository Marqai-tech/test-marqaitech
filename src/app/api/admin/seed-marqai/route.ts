import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcryptjs from 'bcryptjs';

/**
 * POST /api/admin/seed-marqai
 *
 * Seeds the database with MarqAI Tech Group data.
 * This is a one-time setup endpoint for production deployment.
 *
 * SECURITY: Requires a secret key to prevent unauthorized seeding.
 * Pass ?key=MARQAI_SEED_2026 in the URL.
 */
export async function POST(request: Request) {
  try {
    // Security check - require a secret key
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (key !== 'MARQAI_SEED_2026') {
      return NextResponse.json({ error: 'Invalid seed key' }, { status: 403 });
    }

    // Check if MarqAI tenant already exists
    const existing = await prisma.tenant.findUnique({
      where: { slug: 'marqaitechgroup' },
    });
    if (existing) {
      return NextResponse.json({
        message: 'MarqAI Tech Group already seeded',
        tenantId: existing.id,
      });
    }

    const hashedPassword = await bcryptjs.hash('MarqAI@2026', 12);

    // ==================== TENANT ====================
    const tenant = await prisma.tenant.create({
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
    const companyGroup = await prisma.companyGroup.create({
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
      const company = await prisma.company.create({
        data: {
          name: c.name, code: c.code, companyGroupId: companyGroup.id,
          country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
          city: c.city, state: c.state, email: c.email, website: c.website,
          status: 'active', maxEmployees: 100,
        },
      });
      createdCompanies.push(company);

      const branch = await prisma.branch.create({
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
        const dept = await prisma.department.create({
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
          const des = await prisma.designation.create({
            data: { title: dd.title, departmentId: dept.id, status: 'active' },
          });
          allDesignations.push({ id: des.id, title: dd.title, companyIndex: i });
        }
      }
    }

    // ==================== SUPER ADMIN ====================
    const superAdmin = await prisma.user.create({
      data: {
        email: 'superadmin@3boxeshrms.com', name: '3Boxes Super Admin',
        password: hashedPassword, role: 'super_admin', status: 'active', tenantId: tenant.id,
      },
    });

    // ==================== TENANT ADMIN ====================
    const tenantAdmin = await prisma.user.create({
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

      const hrUser = await prisma.user.create({
        data: {
          email: hrEmails[i], name: `HR Admin - ${createdCompanies[i].name}`,
          password: hashedPassword, role: 'company_hr_admin', status: 'active', tenantId: tenant.id,
        },
      });
      createdUsers.push(hrUser);

      if (hrDept && hrDes) {
        await prisma.employee.create({
          data: {
            userId: hrUser.id, companyId: createdCompanies[i].id, branchId: createdBranches[i].id,
            departmentId: hrDept.id, designationId: hrDes.id,
            employeeId: `EMP-${createdCompanies[i].code}-HR001`,
            firstName: 'HR', lastName: 'Admin', status: 'active', joiningDate: new Date(),
          },
        });
      }

      // Employee
      const emp = empData[i];
      const engDept = allDepts.find(d => d.companyIndex === i && d.name === 'Engineering') || allDepts.find(d => d.companyIndex === i && d.name === 'Finance');
      const empDes = allDesignations.find(d => d.companyIndex === i && d.title === emp.desName);

      const empUser = await prisma.user.create({
        data: {
          email: emp.email, name: `${emp.firstName} ${emp.lastName}`,
          password: hashedPassword, role: 'employee', status: 'active', tenantId: tenant.id,
        },
      });
      createdUsers.push(empUser);

      if (engDept && empDes) {
        await prisma.employee.create({
          data: {
            userId: empUser.id, companyId: createdCompanies[i].id, branchId: createdBranches[i].id,
            departmentId: engDept.id, designationId: empDes.id,
            employeeId: `EMP-${createdCompanies[i].code}-E001`,
            firstName: emp.firstName, lastName: emp.lastName, status: 'active', joiningDate: new Date(),
          },
        });
      }
    }

    // ==================== SUBSCRIPTION PLAN ====================
    try {
      await prisma.subscriptionPlan.create({
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
