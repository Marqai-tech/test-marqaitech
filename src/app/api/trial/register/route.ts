import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb, registerTenantDatabase } from '@/lib/tenant-db';
import { provisionTenantDatabase } from '@/lib/tenant-db-provision';
import { sendTenantEmail } from '@/lib/notification-channels';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * POST /api/trial/register
 * Public endpoint — companies register for a trial.
 *
 * This route AUTO-PROVISIONS the tenant:
 *   1. Validates required fields (BUG_004: includes Industry, Country,
 *      Contact Phone, Address, City, State, ZIP, Expected Employees)
 *   2. Idempotency check (BUG_020): if a registration with the same
 *      companyEmail was created within the last 5 minutes, return the
 *      existing one. Protects against refresh, double-click, back-button.
 *   3. Creates a TrialRegistration row (status='pending' initially)
 *   4. Creates the full tenant structure (Tenant, Company, User, Employee,
 *      roles) inside the SAME transaction
 *   5. AUTO-PROVISIONS a separate database for the tenant
 *      (CREATE DATABASE tenant_<slug> + schema push) — the per-tenant
 *      isolation feature
 *   6. Registers the new DB in TenantDatabase table so getDbForTenant()
 *      routes to it for all subsequent requests
 *   7. Sends a welcome email with login URL + temp password
 *   8. Updates TrialRegistration.status='approved', sets trialStart/trialEnd
 *   9. Returns loginUrl, loginEmail, tempPassword for the confirmation page
 *
 * If step 5 or 6 fails, the tenant is left in 'pending' status and the
 * caller (admin) can retry provisioning via /api/trial/approve. The
 * registration row remains so the user doesn't have to re-submit the form.
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
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

    // ─── 1. Validate required fields (BUG_004) ────────────────────
    // Original 5 mandatory fields:
    const missing: string[] = [];
    if (!companyName) missing.push('companyName');
    if (!companyCode) missing.push('companyCode');
    if (!companyEmail) missing.push('companyEmail');
    if (!contactName) missing.push('contactName');
    if (!contactEmail) missing.push('contactEmail');
    // BUG_004: newly-required fields per Product Owner
    if (!industry || industry.trim() === '') missing.push('industry');
    if (!country || country.trim() === '') missing.push('country');
    if (!contactPhone || contactPhone.trim() === '') missing.push('contactPhone');
    if (!address || address.trim() === '') missing.push('address');
    if (!city || city.trim() === '') missing.push('city');
    if (!state || state.trim() === '') missing.push('state');
    if (!zipCode || zipCode.trim() === '') missing.push('zipCode');
    if (!employeeCount) missing.push('employeeCount');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    // ─── 2. Normalize companyCode to slug-safe format ─────────────
    const slug = companyCode
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) {
      return NextResponse.json(
        { error: 'companyCode must contain at least one letter or digit' },
        { status: 400 },
      );
    }

    // ─── 3. Idempotency: check for very recent duplicate (BUG_020) ─
    // If the same companyEmail was registered in the last 5 minutes,
    // return the existing registration instead of creating a duplicate.
    // This protects against refresh, double-click, and back-button resubmits.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentExisting = await platformDb.trialRegistration.findFirst({
      where: {
        companyEmail: { equals: companyEmail, mode: 'insensitive' },
        createdAt: { gte: fiveMinAgo },
      },
      select: {
        id: true,
        companyCode: true,
        contactEmail: true,
        status: true,
        trialEnd: true,
        tempPassword: true,
      },
    });

    if (recentExisting) {
      console.log(`[TrialRegister] Idempotent re-submit detected for ${companyEmail} — returning existing registration ${recentExisting.id}`);
      return NextResponse.json({
        message: 'Trial registration already submitted. Your instance is being provisioned.',
        registrationId: recentExisting.id,
        companyCode: recentExisting.companyCode,
        autoApproved: recentExisting.status === 'approved',
        contactEmail: recentExisting.contactEmail,
        loginUrl: `https://${recentExisting.companyCode}.3boxeshrms.com/login`,
        loginEmail: recentExisting.contactEmail,
        tempPassword: recentExisting.status === 'approved' ? recentExisting.tempPassword : null,
        trialEnd: recentExisting.trialEnd,
        idempotent: true,
      }, { status: 200 });
    }

    // ─── 4. Check for slug / email conflicts (older than 5 min) ───
    const existingTenant = await platformDb.tenant.findFirst({
      where: { slug },
      select: { id: true, name: true },
    });
    if (existingTenant) {
      return NextResponse.json(
        { error: `Company code "${slug}" is already taken. Please choose a different one.` },
        { status: 409 },
      );
    }

    const existingRegByEmail = await platformDb.trialRegistration.findFirst({
      where: { companyEmail: { equals: companyEmail, mode: 'insensitive' } },
    });
    if (existingRegByEmail) {
      return NextResponse.json(
        { error: 'This company email is already registered for a trial.' },
        { status: 409 },
      );
    }

    const existingRegByContact = await platformDb.trialRegistration.findFirst({
      where: { contactEmail: { equals: contactEmail, mode: 'insensitive' } },
    });
    if (existingRegByContact) {
      return NextResponse.json(
        { error: 'This contact email is already registered for a trial.' },
        { status: 409 },
      );
    }

    // ─── 5. Generate temp password ─────────────────────────────────
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8-char alphanumeric
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const now = new Date();
    const trialDays = 15;
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    // ─── 6. Create TrialRegistration + tenant structure (transaction) ─
    const result = await platformDb.$transaction(async (tx: any) => {
      // 6a. TrialRegistration record
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
          employeeCount: Number(employeeCount) || 10,
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
          status: 'pending',
          trialDays,
          trialStart: null,
          trialEnd: null,
          tempPassword,
        },
      });

      // 6b. Create Tenant (status='trial' — login API allows this)
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
          subscriptionSeats: 10,
        },
      });

      // 6c. CompanyGroup
      const companyGroup = await tx.companyGroup.create({
        data: {
          name: companyName,
          tenantId: tenant.id,
          maxEmployees: Number(employeeCount) || 10,
        },
      });

      // 6d. Company
      // NOTE: DB schema has drifted from Prisma schema. DB requires `code`
      // NOT NULL (Prisma has it nullable) and `isActive` NOT NULL with
      // default true (Prisma doesn't know about it). We pass `code`
      // explicitly; `isActive` gets its DB default. Same for
      // currency/timezone/language — all have DB defaults.
      const company = await tx.company.create({
        data: {
          name: companyName,
          code: slug.toUpperCase(),
          companyGroupId: companyGroup.id,
          country: country || 'IN',
          currency: currency || 'INR',
          timezone: 'UTC',
          email: companyEmail,
          phone: companyPhone || null,
          website: companyWebsite || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          status: 'active',
          maxEmployees: Number(employeeCount) || 10,
        } as any,
      });

      // 6e. Default Department
      // DB has Department.code NOT NULL (Prisma has it nullable) — pass it.
      // isActive has DB default true — don't pass (Prisma doesn't know it).
      const department = await tx.department.create({
        data: {
          name: 'Administration',
          code: 'ADMIN',
          companyId: company.id,
          status: 'active',
        } as any,
      });

      // 6f. Default Designation
      // Designation requires departmentId (not companyId). level has DB default 1.
      const designationRow = await tx.designation.create({
        data: {
          title: designation || 'Administrator',
          departmentId: department.id,
          status: 'active',
        } as any,
      });

      // 6g. Default Branch (HQ)
      // DB has Branch.code NOT NULL — pass it. isActive has DB default true.
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
        } as any,
      });

      // 6h. tenant_admin user (stored in platform DB for fast auth lookup;
      //     the per-tenant DB will get its own copy via the schema push
      //     and subsequent data sync. The login API's two-phase lookup
      //     handles either source.)
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

      // 6i. Employee record for the admin
      // isManagement has DB default false — don't pass (Prisma doesn't know it).
      await tx.employee.create({
        data: {
          employeeId: `EMP-${slug.toUpperCase()}-001`,
          firstName: contactName.split(' ')[0] || contactName,
          lastName: contactName.split(' ').slice(1).join(' ') || '',
          email: contactEmail,
          phone: contactPhone || null,
          userId: user.id,
          departmentId: department.id,
          designationId: designationRow.id,
          branchId: branch.id,
          companyId: company.id,
          dateOfJoining: now,
          status: 'active',
        } as any,
      });

      // 6j. Standard tenant-level roles
      const standardTenantRoles = [
        { key: 'hr_admin', name: 'HR Administrator', description: 'HR operations', level: 3, isSystem: true },
        { key: 'finance_admin', name: 'Finance Administrator', description: 'Finance operations', level: 3, isSystem: true },
        { key: 'it_admin', name: 'IT Administrator', description: 'IT operations', level: 3, isSystem: true },
        { key: 'manager', name: 'Manager', description: 'Team management', level: 4, isSystem: true },
        { key: 'employee', name: 'Employee', description: 'Basic employee access', level: 5, isSystem: true },
        { key: 'recruiter', name: 'Recruiter', description: 'Recruitment operations', level: 4, isSystem: true },
      ];

      for (const roleDef of standardTenantRoles) {
        const existingRole = await tx.role.findFirst({
          where: { key: roleDef.key, tenantId: tenant.id, companyId: null },
        });
        if (!existingRole) {
          await tx.role.create({
            data: {
              name: roleDef.name,
              key: roleDef.key,
              description: roleDef.description,
              level: roleDef.level,
              isSystem: roleDef.isSystem,
              tenantId: tenant.id,
              companyId: null,
              status: 'active',
            },
          });
        }
      }

      // 6k. Role assignments for the admin user
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

      // 6l. Update the registration — but keep status='pending' until
      //     the DB provisioning succeeds (step 8 below).
      await tx.trialRegistration.update({
        where: { id: registration.id },
        data: {
          tenantId: tenant.id,
        },
      });

      return { registration, tenant, user, company };
    });

    // ─── 7. AUTO-PROVISION the tenant database ─────────────────────
    // This step runs OUTSIDE the transaction because CREATE DATABASE
    // cannot run inside a Postgres transaction block. If it fails, the
    // registration is left in 'pending' status — the admin can retry
    // via /api/trial/approve.
    let provisioningSucceeded = false;
    let provisioningError: string | null = null;
    try {
      console.log(`[TrialRegister] Auto-provisioning database for tenant "${slug}"...`);
      const provisionResult = await provisionTenantDatabase({ slug });

      // Register the new DB so getDbForTenant() can route to it
      await registerTenantDatabase({
        tenantId: result.tenant.id,
        connectionString: provisionResult.connectionString,
        directUrl: provisionResult.directConnectionString,
        databaseName: provisionResult.databaseName,
      });

      console.log(`[TrialRegister] ✅ Database "${provisionResult.databaseName}" provisioned and registered for tenant "${slug}"`);
      provisioningSucceeded = true;
    } catch (err: any) {
      provisioningError = err?.message || String(err);
      console.error(`[TrialRegister] ❌ Database provisioning failed for tenant "${slug}":`, err?.message || err);
      // Don't throw — we still want to mark the registration as 'pending'
      // and return a useful response so the user isn't left hanging.
    }

    // ─── 8. If provisioning succeeded, mark registration 'approved' ─
    if (provisioningSucceeded) {
      await platformDb.trialRegistration.update({
        where: { id: result.registration.id },
        data: {
          status: 'approved',
          trialStart: now,
          trialEnd,
          reviewedAt: now,
        },
      });

      // ─── 9. Send welcome email ────────────────────────────────────
      const loginUrl = `https://${slug}.3boxeshrms.com/login`;
      try {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,#065f46,#10b981);border-radius:14px 14px 0 0;padding:22px 28px;color:#fff">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.85">${companyName}</div>
    <div style="font-size:19px;font-weight:700;margin-top:4px">Welcome to 3Boxes HRMS — your trial is ready!</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:26px 28px;box-shadow:0 6px 24px rgba(15,23,42,.08)">
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">Hi ${contactName},</p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">Your 15-day free trial of <strong>3Boxes HRMS</strong> is ready. Here are your login details:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px">
      <tr><td style="font-size:12px;color:#64748b;padding:3px 0">Login URL</td><td style="font-size:14px;color:#0f172a;font-weight:600;padding:3px 0"><a href="${loginUrl}" style="color:#10b981;text-decoration:none">${loginUrl}</a></td></tr>
      <tr><td style="font-size:12px;color:#64748b;padding:3px 0">Email</td><td style="font-size:14px;color:#0f172a;font-weight:600;padding:3px 0">${contactEmail}</td></tr>
      <tr><td style="font-size:12px;color:#64748b;padding:3px 0">Temporary password</td><td style="font-size:14px;color:#0f172a;font-weight:600;padding:3px 0;font-family:monospace">${tempPassword}</td></tr>
      <tr><td style="font-size:12px;color:#64748b;padding:3px 0">Trial expires</td><td style="font-size:14px;color:#0f172a;font-weight:600;padding:3px 0">${trialEnd.toDateString()}</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
      <td><a href="${loginUrl}" style="display:inline-block;padding:12px 26px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Go to my trial login</a></td>
    </tr></table>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">Please change your password after your first login. If you didn't request this trial, you can safely ignore this email.</p>
    <div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:14px;font-size:11px;color:#94a3b8">Sent by ${companyName} via 3Boxes HRMS</div>
  </div>
</div>
</body></html>`;

        await sendTenantEmail(platformDb, result.tenant.id, {
          to: contactEmail,
          subject: `Welcome to 3Boxes HRMS — your trial is ready!`,
          html,
        });
        console.log(`[TrialRegister] Welcome email sent to ${contactEmail}`);
      } catch (emailErr) {
        console.error(`[TrialRegister] Welcome email failed (non-fatal):`, emailErr);
      }
    }

    // ─── 10. Build response ────────────────────────────────────────
    const loginUrl = `https://${slug}.3boxeshrms.com/login`;
    return NextResponse.json({
      message: provisioningSucceeded
        ? 'Trial registration successful! Your instance is ready.'
        : 'Trial registration submitted. Database provisioning is in progress — our team will complete it shortly.',
      registrationId: result.registration.id,
      companyCode: slug,
      autoApproved: provisioningSucceeded,
      contactEmail,
      loginUrl,
      loginEmail: contactEmail,
      tempPassword: provisioningSucceeded ? tempPassword : null,
      trialEnd: provisioningSucceeded ? trialEnd.toISOString() : null,
      provisioningError: provisioningSucceeded ? null : provisioningError,
    }, { status: provisioningSucceeded ? 201 : 202 });

  } catch (error: any) {
    console.error('[Trial Register] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit registration. Please try again.', details: error.message },
      { status: 500 },
    );
  }
}
