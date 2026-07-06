import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * POST /api/trial/register
 * Public endpoint — companies register for a trial.
 * Now includes: selectedModules, companyLogo, employeeDataJson
 * Auto-approves and creates full tenant structure immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyName,
      companyCode,
      companyEmail,
      companyPhone,
      companyWebsite,
      industry,
      country,
      currency,
      employeeCount,
      contactName,
      contactEmail,
      contactPhone,
      designation,
      address,
      city,
      state,
      zipCode,
      selectedModules,
      companyLogo,
      employeeDataJson,
    } = body;

    // Validate required fields
    if (!companyName || !companyCode || !companyEmail || !contactName || !contactEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: companyName, companyCode, companyEmail, contactName, contactEmail' },
        { status: 400 }
      );
    }

    // Normalize companyCode to slug-safe format
    const slug = companyCode
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if companyCode/slug already exists as a tenant
    const existingTenant = await db.tenant.findFirst({
      where: { slug },
    });
    if (existingTenant) {
      return NextResponse.json(
        { error: `Company code "${slug}" is already taken. Please choose a different one.` },
        { status: 409 }
      );
    }

    // Check if companyEmail already registered
    const existingRegByEmail = await db.trialRegistration.findFirst({
      where: { companyEmail },
    });
    if (existingRegByEmail) {
      return NextResponse.json(
        { error: 'This company email is already registered for a trial.' },
        { status: 409 }
      );
    }

    // Check if contactEmail already registered
    const existingRegByContact = await db.trialRegistration.findFirst({
      where: { contactEmail },
    });
    if (existingRegByContact) {
      return NextResponse.json(
        { error: 'This contact email is already registered for a trial.' },
        { status: 409 }
      );
    }

    // Generate temp password
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8-char alphanumeric
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const now = new Date();
    const trialDays = 15;
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    // Create the full tenant structure in a transaction
    const result = await db.$transaction(async (tx: any) => {
      // 1. Create the trial registration record
      const registration = await tx.trialRegistration.create({
        data: {
          companyName,
          companyCode: slug,
          companyEmail,
          companyPhone: companyPhone || null,
          companyWebsite: companyWebsite || null,
          industry: industry || null,
          country: country || 'IN',
          currency: currency || 'INR',
          employeeCount: employeeCount || 10,
          contactName,
          contactEmail,
          contactPhone: contactPhone || null,
          designation: designation || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          selectedModules: selectedModules ? selectedModules.join(',') : null,
          companyLogo: companyLogo || null,
          employeeDataJson: employeeDataJson || null,
          status: 'approved',
          trialDays,
          trialStart: now,
          trialEnd,
          tempPassword,
        },
      });

      // 2. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
          domain: `${slug}.3boxeshrms.com`,
          plan: 'starter',
          status: 'trial',
          country: country || 'IN',
          currency: currency || 'INR',
          language: 'en',
          subscriptionSeats: employeeCount || 10,
          logo: companyLogo || null,
        },
      });

      // 3. Create Company Group
      const companyGroup = await tx.companyGroup.create({
        data: {
          name: companyName,
          tenantId: tenant.id,
          maxEmployees: employeeCount || 10,
        },
      });

      // 4. Create Company
      const company = await tx.company.create({
        data: {
          name: companyName,
          code: slug.toUpperCase(),
          companyGroupId: companyGroup.id,
          country: country || 'IN',
          currency: currency || 'INR',
          email: companyEmail,
          phone: companyPhone || null,
          website: companyWebsite || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          status: 'active',
          maxEmployees: employeeCount || 10,
        },
      });

      // 5. Create Department (default)
      const department = await tx.department.create({
        data: {
          name: 'Administration',
          companyId: company.id,
          status: 'active',
        },
      });

      // 6. Create Designation (default)
      const designationRecord = await tx.designation.create({
        data: {
          title: designation || 'Administrator',
          companyId: company.id,
        },
      });

      // 7. Create Branch (default - HQ)
      const branch = await tx.branch.create({
        data: {
          name: 'Head Office',
          code: 'HO',
          companyId: company.id,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          country: country || 'IN',
          status: 'active',
        },
      });

      // 8. Create the tenant_admin user
      const user = await tx.user.create({
        data: {
          email: contactEmail,
          password: hashedPassword,
          name: contactName,
          tenantId: tenant.id,
          role: 'tenant_admin',
          status: 'active',
        },
      });

      // 9. Create Employee record for the admin
      await tx.employee.create({
        data: {
          employeeId: `EMP-${slug.toUpperCase()}-001`,
          firstName: contactName.split(' ')[0] || contactName,
          lastName: contactName.split(' ').slice(1).join(' ') || '',
          email: contactEmail,
          phone: contactPhone || null,
          userId: user.id,
          departmentId: department.id,
          designationId: designationRecord.id,
          branchId: branch.id,
          companyId: company.id,
          dateOfJoining: now,
          status: 'active',
        },
      });

      // 10. Create tenant-level role assignments
      const tenantAdminRole = await tx.role.findFirst({ where: { key: 'tenant_admin' } });
      const adminRole = await tx.role.findFirst({ where: { key: 'admin' } });

      if (tenantAdminRole) {
        await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: tenantAdminRole.id,
            companyId: company.id,
          },
        });
      }

      if (adminRole) {
        await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: adminRole.id,
            companyId: company.id,
          },
        });
      }

      // 11. Update the registration with tenant link
      await tx.trialRegistration.update({
        where: { id: registration.id },
        data: { tenantId: tenant.id },
      });

      // 12. If sample employee data was provided, create those employees
      if (employeeDataJson) {
        try {
          const employees = JSON.parse(employeeDataJson);
          for (const emp of employees.slice(0, 5)) {
            const empUser = await tx.user.create({
              data: {
                email: emp.Email || emp.email || `emp${employees.indexOf(emp) + 2}@${companyEmail.split('@')[1]}`,
                password: hashedPassword,
                name: `${emp.FirstName || emp.firstName || 'Employee'} ${emp.LastName || emp.lastName || ''}`.trim(),
                tenantId: tenant.id,
                role: 'employee',
                status: 'active',
              },
            });

            await tx.employee.create({
              data: {
                employeeId: emp.EmployeeId || emp.employeeId || `EMP-${slug.toUpperCase()}-${String(employees.indexOf(emp) + 2).padStart(3, '0')}`,
                firstName: emp.FirstName || emp.firstName || 'Employee',
                lastName: emp.LastName || emp.lastName || '',
                email: empUser.email,
                phone: emp.Phone || emp.phone || null,
                userId: empUser.id,
                departmentId: department.id,
                designationId: designationRecord.id,
                branchId: branch.id,
                companyId: company.id,
                dateOfJoining: emp.DateOfJoining ? new Date(emp.DateOfJoining) : now,
                status: 'active',
              },
            });
          }
        } catch (e) {
          console.error('[Trial Register] Failed to parse/create sample employees:', e);
          // Non-critical, don't fail the registration
        }
      }

      return { tenant, user, company, tempPassword, registration, companyCode: slug };
    });

    return NextResponse.json({
      message: 'Trial registration successful! Your trial has been auto-approved.',
      registrationId: result.registration.id,
      companyCode: result.companyCode,
      autoApproved: true,
      loginEmail: contactEmail,
      tempPassword: result.tempPassword,
      loginUrl: `https://${result.companyCode}.3boxeshrms.com/login`,
      trialEnd: trialEnd.toISOString(),
    }, { status: 201 });

  } catch (error: any) {
    console.error('[Trial Register] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit registration. Please try again.', details: error.message },
      { status: 500 }
    );
  }
}
