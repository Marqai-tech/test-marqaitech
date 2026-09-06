import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Helper: safely convert Date/null/undefined to ISO string or empty string
function toISOStr(val: Date | string | null | undefined): string {
  if (!val) return '';
  try {
    return new Date(val).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// Helper: safely get string or empty string
function toStr(val: string | null | undefined): string {
  return val || '';
}

// GET - Fetch current user profile
export async function GET(request: Request) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    // Step 1: Fetch user — try the resolved DB first, then fall back to platform DB.
    let user = await db.user.findUnique({
      where: { id: decoded.userId as string },
      include: { tenant: true },
    }).catch(() => null);

    let userFoundInPlatformDb = false;

    if (!user) {
      user = await platformDb.user.findUnique({
        where: { id: decoded.userId as string },
        include: { tenant: true },
      }).catch(() => null);
      if (user) userFoundInPlatformDb = true;
    }

    if (!user) {
      const email = (decoded as any).email;
      if (email) {
        user = await db.user.findUnique({
          where: { email },
          include: { tenant: true },
        }).catch(() => null);
        if (!user) {
          user = await platformDb.user.findUnique({
            where: { email },
            include: { tenant: true },
          }).catch(() => null);
          if (user) userFoundInPlatformDb = true;
        }
      }
    }

    if (!user) {
      console.error('[Profile GET] User not found. decoded.userId:', decoded.userId, 'decoded.email:', (decoded as any).email);
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });
    }

    // Use the DB that found the user for subsequent queries
    const userDb = userFoundInPlatformDb ? platformDb : db;

    console.log('[Profile GET] User found:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      userFoundInPlatformDb,
      userDbIsPlatform: userDb === platformDb,
      dbIsPlatform: db === platformDb,
    });

    // ─── Inline schema-sync: ensure ALL Employee columns exist ───
    // The Prisma client expects ALL columns from the schema (including
    // employeeStatus, employeeType, personalEmail, reportingManagerId).
    // If any column is missing from the actual DB table, the query fails
    // with P2022 — which is silently caught by .catch(() => null), making
    // it look like the employee doesn't exist. We add the columns here.
    try {
      const syncStatements = [
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatar" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeType" TEXT NOT NULL DEFAULT 'full_time'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "nationality" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "city" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "state" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "zipCode" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "country" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "designationId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "dateOfJoining" TIMESTAMP(3)`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankName" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankIfscCode" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "panNumber" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "aadhaarNumber" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "taxId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salary" DOUBLE PRECISION`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryCurrency" TEXT NOT NULL DEFAULT 'INR'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "leavePolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "attendancePolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "travelPolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryStructureId" TEXT`,
      ];
      // Sync both userDb and platformDb (data might be in either)
      for (const sql of syncStatements) {
        try { await userDb.$executeRawUnsafe(sql); } catch { /* column exists */ }
        if (userDb !== platformDb) {
          try { await platformDb.$executeRawUnsafe(sql); } catch { /* column exists */ }
        }
      }
    } catch (syncErr) {
      console.warn('[Profile GET] Inline schema-sync failed (non-fatal):', syncErr);
    }

    // Step 2: Fetch employee data from the SAME DB that found the user.
    // NO platform DB fallback — tenant data must come from the tenant DB only.
    // (Golden Rule: super admin DB stores ONLY tenants, users, analytics —
    // never tenant data like employees, departments, etc.)
    let employeeData = null;
    try {
      let employee = null;

      // First, verify the Employee table exists via raw SQL
      try {
        const tableCheck = await userDb.$executeRawUnsafe(
          `CREATE TABLE IF NOT EXISTS "Employee" (
            "id" TEXT NOT NULL,
            "employeeId" TEXT NOT NULL,
            "firstName" TEXT NOT NULL,
            "lastName" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "personalEmail" TEXT,
            "phone" TEXT,
            "avatar" TEXT,
            "userId" TEXT,
            "departmentId" TEXT NOT NULL,
            "designationId" TEXT NOT NULL,
            "branchId" TEXT,
            "companyId" TEXT,
            "reportingManagerId" TEXT,
            "dateOfJoining" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
            "dateOfBirth" TIMESTAMP(3),
            "gender" TEXT,
            "maritalStatus" TEXT,
            "nationality" TEXT,
            "address" TEXT,
            "city" TEXT,
            "state" TEXT,
            "zipCode" TEXT,
            "country" TEXT,
            "bloodGroup" TEXT,
            "emergencyContactName" TEXT,
            "emergencyContactPhone" TEXT,
            "status" TEXT NOT NULL DEFAULT 'active',
            "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed',
            "employeeType" TEXT NOT NULL DEFAULT 'full_time',
            "bankName" TEXT,
            "bankAccountNo" TEXT,
            "bankIfscCode" TEXT,
            "panNumber" TEXT,
            "aadhaarNumber" TEXT,
            "taxId" TEXT,
            "salary" DOUBLE PRECISION,
            "salaryCurrency" TEXT NOT NULL DEFAULT 'INR',
            "leavePolicyId" TEXT,
            "attendancePolicyId" TEXT,
            "travelPolicyId" TEXT,
            "salaryStructureId" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
            CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
          )`
        );
        console.log('[Profile GET] Employee table check/created:', tableCheck);
      } catch (tableErr) {
        console.error('[Profile GET] Employee table check failed:', tableErr);
      }

      // Try by userId in userDb
      try {
        employee = await userDb.employee.findUnique({
          where: { userId: user.id },
        });
      } catch (err) {
        const errObj = err as { code?: string; message?: string };
        console.error('[Profile GET] Employee by userId FAILED:', errObj.code, errObj.message);

        // FALLBACK: Try raw SQL if Prisma fails
        if (!employee) {
          try {
            const rawResult = await userDb.$queryRawUnsafe(
              `SELECT * FROM "Employee" WHERE "userId" = $1 LIMIT 1`,
              user.id
            ) as any[];
            if (rawResult && rawResult.length > 0) {
              employee = rawResult[0];
              console.log('[Profile GET] Employee found via RAW SQL by userId:', employee?.firstname || employee?.firstname);
            }
          } catch (rawErr) {
            console.error('[Profile GET] Raw SQL by userId failed:', rawErr);
          }
        }
      }

      console.log('[Profile GET] Employee by userId in userDb:', employee ? `${employee.firstName || employee.firstname} ${employee.lastName || employee.lastname}` : 'NOT FOUND');

      // Try by email in userDb
      if (!employee && user.email) {
        try {
          employee = await userDb.employee.findFirst({
            where: { email: user.email },
          });
        } catch (err) {
          const errObj = err as { code?: string; message?: string };
          console.error('[Profile GET] Employee by email FAILED:', errObj.code, errObj.message);

          // FALLBACK: Try raw SQL
          try {
            const rawResult = await userDb.$queryRawUnsafe(
              `SELECT * FROM "Employee" WHERE "email" = $1 LIMIT 1`,
              user.email
            ) as any[];
            if (rawResult && rawResult.length > 0) {
              employee = rawResult[0];
              console.log('[Profile GET] Employee found via RAW SQL by email');
            }
          } catch (rawErr) {
            console.error('[Profile GET] Raw SQL by email failed:', rawErr);
          }
        }
        console.log('[Profile GET] Employee by email in userDb:', employee ? `${employee.firstName || employee.firstname} ${employee.lastName || employee.lastname}` : 'NOT FOUND');
      }

      if (employee) {
        // Fetch relations SEPARATELY from the SAME DB (no platform DB fallback)
        const empDb = userDb;
        let department = null, designation = null, branch = null;
        let dependents: any[] = [], qualifications: any[] = [], experiences: any[] = [], documents: any[] = [];

        if (employee.departmentId) {
          department = await empDb.department.findUnique({
            where: { id: employee.departmentId },
            select: { name: true },
          }).catch(() => null);
        }
        if (employee.designationId) {
          designation = await empDb.designation.findUnique({
            where: { id: employee.designationId },
            select: { title: true },
          }).catch(() => null);
        }
        if (employee.branchId) {
          branch = await empDb.branch.findUnique({
            where: { id: employee.branchId },
            select: { name: true },
          }).catch(() => null);
        }
        dependents = await empDb.dependent.findMany({ where: { employeeId: employee.id } }).catch(() => []);
        qualifications = await empDb.qualification.findMany({ where: { employeeId: employee.id } }).catch(() => []);
        experiences = await (empDb as any).experience?.findMany?.({ where: { employeeId: employee.id } }).catch(() => []) || [];
        documents = await empDb.document.findMany({
          where: { employeeId: employee.id },
          select: { id: true, name: true, type: true, status: true },
        }).catch(() => []);

        employeeData = {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          personalEmail: toStr((employee as any).personalEmail),
          employeeStatus: toStr((employee as any).employeeStatus),
          employeeType: toStr((employee as any).employeeType),
          phone: toStr(employee.phone),
          emergencyContactName: toStr(employee.emergencyContactName),
          emergencyContactPhone: toStr(employee.emergencyContactPhone),
          address: toStr(employee.address),
          city: toStr(employee.city),
          state: toStr(employee.state),
          zipCode: toStr(employee.zipCode),
          country: toStr(employee.country),
          dateOfBirth: toISOStr(employee.dateOfBirth),
          gender: toStr(employee.gender),
          maritalStatus: toStr(employee.maritalStatus),
          nationality: toStr(employee.nationality),
          bloodGroup: toStr(employee.bloodGroup),
          department: department?.name || '',
          designation: designation?.title || '',
          branch: branch?.name || '',
          dateOfJoining: toISOStr(employee.dateOfJoining),
          status: employee.status,
          bankName: toStr(employee.bankName),
          bankAccountNo: toStr(employee.bankAccountNo),
          bankIfscCode: toStr(employee.bankIfscCode),
          panNumber: toStr(employee.panNumber),
          aadhaarNumber: toStr(employee.aadhaarNumber),
          taxId: toStr(employee.taxId),
          salary: employee.salary,
          salaryCurrency: toStr(employee.salaryCurrency),
          leavePolicyId: toStr(employee.leavePolicyId),
          attendancePolicyId: toStr(employee.attendancePolicyId),
          travelPolicyId: toStr(employee.travelPolicyId),
          salaryStructureId: toStr(employee.salaryStructureId),
          dependents: dependents || [],
          qualifications: qualifications || [],
          experiences: experiences || [],
          documents: (documents || []).map((d: { id: string; name: string; type: string; status: string }) => ({ id: d.id, name: d.name, type: d.type, status: d.status })),
        };
      }
    } catch (empErr) {
      console.error('Get profile employee error (non-fatal):', empErr);
    }

    // Resolve tenant info (may be null for super_admin)
    let tenantInfo = null;
    if (user.tenant) {
      tenantInfo = {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
        currency: user.tenant.currency,
        timezone: user.tenant.timezone,
      };
    } else if (user.tenantId) {
      // Tenant relation wasn't included or failed — fetch it separately
      try {
        const tenant = await platformDb.tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, name: true, slug: true, plan: true, currency: true, timezone: true },
        });
        if (tenant) tenantInfo = tenant;
      } catch { /* non-critical */ }
    }

    console.log('[Profile GET] Final response:', {
      userId: user.id,
      hasEmployee: !!employeeData,
      employeeId: employeeData?.employeeId,
      employeeName: employeeData ? `${employeeData.firstName} ${employeeData.lastName}` : null,
      hasTenant: !!tenantInfo,
      userDbIsPlatform: userDb === platformDb,
      dbIsPlatform: db === platformDb,
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        tenant: tenantInfo,
        employee: employeeData,
        lastLogin: user.lastLogin ? toISOStr(user.lastLogin) : null,
        createdAt: user.createdAt ? toISOStr(user.createdAt) : null,
        _debug: {
          userFoundInPlatformDb,
          userDbIsPlatform: userDb === platformDb,
          dbIsPlatform: db === platformDb,
          hasEmployee: !!employeeData,
          employeeEmail: employeeData?.email,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get profile error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Get profile error stack:', errorStack);
    return NextResponse.json(
      { error: 'Internal server error', details: errorMsg },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// PATCH - Update current user profile
export async function PATCH(request: Request) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, avatar, phone, emergencyContactName, emergencyContactPhone, address, city, state, zipCode, country, dateOfBirth, gender, bloodGroup } = body;

    // Update user basic info (User model has: name, email, avatar — NO phone)
    const userUpdateData: Record<string, unknown> = {};
    if (name !== undefined) userUpdateData.name = name;
    if (avatar !== undefined) userUpdateData.avatar = avatar;

    // Try to update in the resolved DB first, then fall back to platform DB
    let updatedUser = null;
    try {
      updatedUser = await db.user.update({
        where: { id: decoded.userId as string },
        data: userUpdateData,
        include: { tenant: true, employee: true },
      });
    } catch {
      // User not found in tenant DB — try platform DB
      updatedUser = await platformDb.user.update({
        where: { id: decoded.userId as string },
        data: userUpdateData,
        include: { tenant: true, employee: true },
      });
    }

    // Update employee details if provided (Employee model has: phone, address, etc.)
    // NO platform DB fallback — employee data must be read/updated from the
    // tenant DB only (Golden Rule).
    const hasEmployeeUpdates = phone !== undefined || emergencyContactName !== undefined || emergencyContactPhone !== undefined || address !== undefined || city !== undefined || state !== undefined || zipCode !== undefined || country !== undefined || dateOfBirth !== undefined || gender !== undefined || bloodGroup !== undefined;

    if (hasEmployeeUpdates) {
      const employeeUpdateData: Record<string, unknown> = {};
      if (phone !== undefined) employeeUpdateData.phone = phone;
      if (emergencyContactName !== undefined) employeeUpdateData.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone !== undefined) employeeUpdateData.emergencyContactPhone = emergencyContactPhone;
      if (address !== undefined) employeeUpdateData.address = address;
      if (city !== undefined) employeeUpdateData.city = city;
      if (state !== undefined) employeeUpdateData.state = state;
      if (zipCode !== undefined) employeeUpdateData.zipCode = zipCode;
      if (country !== undefined) employeeUpdateData.country = country;
      if (dateOfBirth !== undefined) employeeUpdateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (gender !== undefined) employeeUpdateData.gender = gender;
      if (bloodGroup !== undefined) employeeUpdateData.bloodGroup = bloodGroup;

      // Find the employee record in the tenant DB ONLY (no platform DB fallback)
      let employeeRecord = null;

      if (updatedUser.employee) {
        employeeRecord = updatedUser.employee;
      } else {
        // Try by userId in tenant DB
        employeeRecord = await db.employee.findUnique({ where: { userId: updatedUser.id } }).catch(() => null);
        // Try by email in tenant DB
        if (!employeeRecord && updatedUser.email) {
          employeeRecord = await db.employee.findFirst({ where: { email: updatedUser.email } }).catch(() => null);
        }
      }

      if (employeeRecord) {
        // Update in the tenant DB ONLY (no platform DB fallback)
        await db.employee.update({
          where: { id: employeeRecord.id },
          data: employeeUpdateData,
        }).catch(() => null);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatar: updatedUser.avatar,
          role: updatedUser.role,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
