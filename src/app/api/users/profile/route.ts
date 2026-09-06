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
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });
    }

    // Use the DB that found the user for subsequent queries
    const userDb = userFoundInPlatformDb ? platformDb : db;

    // Step 2: Fetch employee data — try a SIMPLE query first (no includes).
    // If the query with includes fails (because related tables don't exist),
    // the whole thing returns null. So we fetch the employee record alone,
    // then fetch each relation separately with individual error handling.
    let employeeData = null;
    try {
      // Try to find the employee by userId in both DBs
      let employee = null;

      // Try by userId in userDb
      employee = await userDb.employee.findUnique({
        where: { userId: user.id },
      }).catch(() => null);

      // Try by userId in platform DB
      if (!employee && userDb !== platformDb) {
        employee = await platformDb.employee.findUnique({
          where: { userId: user.id },
        }).catch(() => null);
      }

      // Try by userId in resolved db
      if (!employee && userDb !== db) {
        employee = await db.employee.findUnique({
          where: { userId: user.id },
        }).catch(() => null);
      }

      // Try by email in all DBs
      if (!employee && user.email) {
        employee = await userDb.employee.findFirst({
          where: { email: user.email },
        }).catch(() => null);
        if (!employee) {
          employee = await platformDb.employee.findFirst({
            where: { email: user.email },
          }).catch(() => null);
        }
        if (!employee && db !== platformDb && db !== userDb) {
          employee = await db.employee.findFirst({
            where: { email: user.email },
          }).catch(() => null);
        }
      }

      if (employee) {
        // Now fetch relations SEPARATELY (each non-fatal)
        const empDb = userDb; // Use the DB that found the employee
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
          // If not found in empDb, try platform DB
          if (!designation && empDb !== platformDb) {
            designation = await platformDb.designation.findUnique({
              where: { id: employee.designationId },
              select: { title: true },
            }).catch(() => null);
          }
        }
        if (employee.branchId) {
          branch = await empDb.branch.findUnique({
            where: { id: employee.branchId },
            select: { name: true },
          }).catch(() => null);
        }
        // Fetch related data individually (non-fatal if tables don't exist)
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
          // Bank & Finance
          bankName: toStr(employee.bankName),
          bankAccountNo: toStr(employee.bankAccountNo),
          bankIfscCode: toStr(employee.bankIfscCode),
          panNumber: toStr(employee.panNumber),
          aadhaarNumber: toStr(employee.aadhaarNumber),
          taxId: toStr(employee.taxId),
          // Salary
          salary: employee.salary,
          salaryCurrency: toStr(employee.salaryCurrency),
          // Policies
          leavePolicyId: toStr(employee.leavePolicyId),
          attendancePolicyId: toStr(employee.attendancePolicyId),
          travelPolicyId: toStr(employee.travelPolicyId),
          salaryStructureId: toStr(employee.salaryStructureId),
          // Related data
          dependents: dependents || [],
          qualifications: qualifications || [],
          experiences: experiences || [],
          documents: (documents || []).map((d: { id: string; name: string; type: string; status: string }) => ({ id: d.id, name: d.name, type: d.type, status: d.status })),
        };
      }
    } catch (empErr) {
      console.error('Get profile employee error (non-fatal):', empErr);
      // Employee data is optional — continue without it
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
    // The employee may be linked via userId OR may have the same email as the user.
    // We try to find the employee in both DBs and update accordingly.
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

      // Find the employee record — try userId first, then email
      let employeeRecord = null;

      // Try by userId in resolved DB
      if (updatedUser.employee) {
        employeeRecord = updatedUser.employee;
      } else {
        // Try by userId in both DBs
        employeeRecord = await db.employee.findUnique({ where: { userId: updatedUser.id } }).catch(() => null);
        if (!employeeRecord) {
          employeeRecord = await platformDb.employee.findUnique({ where: { userId: updatedUser.id } }).catch(() => null);
        }
        // Try by email
        if (!employeeRecord && updatedUser.email) {
          employeeRecord = await db.employee.findFirst({ where: { email: updatedUser.email } }).catch(() => null);
          if (!employeeRecord) {
            employeeRecord = await platformDb.employee.findFirst({ where: { email: updatedUser.email } }).catch(() => null);
          }
        }
      }

      if (employeeRecord) {
        // Try updating in the resolved DB first
        await db.employee.update({
          where: { id: employeeRecord.id },
          data: employeeUpdateData,
        }).catch(async () => {
          // If that fails, try platform DB
          await platformDb.employee.update({
            where: { id: employeeRecord.id },
            data: employeeUpdateData,
          }).catch(() => null);
        });
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
