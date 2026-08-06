import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';
import { getEmployeeCompanyFilter, getCompanyFilter, getAuthInfo, resolveCompanyScope } from '@/lib/companyScope';
import { checkTenantStatusOrBlock } from '@/lib/tenant-guard';

function generateRandomPassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

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

export async function GET(request: Request) {
  const db = await getDb(request);

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const departmentId = searchParams.get('departmentId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    // Tenant scope — only meaningful for super_admin (tenant_admin is already
    // scoped to their own tenantId in the JWT).
    const tenantId = searchParams.get('tenantId');

    // ─── Resolve company scope via utility ───
    // resolveCompanyScope() handles:
    //  - JWT auth
    //  - Reading ?companyId= from the URL (CompanySwitcher) for admins
    //  - Enforcing own-company for non-admins
    // Returns null if auth fails entirely.
    const scopeResult = await resolveCompanyScope(request);

    // Allow unauthenticated (demo mode) access with 'all' scope
    const isAuthed = scopeResult !== null;
    const userRole = scopeResult?.role || 'employee';
    const userId = scopeResult?.userId;
    const scope = scopeResult?.scope || 'all';

    // Try database query
    try {
      const where: Record<string, unknown> = {};
      if (departmentId) where.departmentId = departmentId;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ];
      }

      // ─── Company scope filter ───
      // resolveCompanyScope already reads ?companyId= from the URL for admins
      // and enforces own-company for non-admins. scopeResult.companyId is:
      //   - A specific ID when an admin selected a company in CompanySwitcher,
      //     or when a non-admin is scoped to their own company.
      //   - null when an admin has no company selected (sees all).
      if (scopeResult?.companyId) {
        where.companyId = scopeResult.companyId;
      }

      // ─── Tenant scope filter (super_admin only) ───
      // For super_admin with no companyId selected, allow narrowing to a
      // specific tenant's companies. Employee has no `company` relation —
      // only a bare companyId field, so we must resolve company IDs first.
      if (!scopeResult?.companyId && tenantId && userRole === 'super_admin') {
        const tenantGroups = await db.companyGroup.findMany({
          where: { tenantId },
          select: { id: true },
        });
        const groupIds = tenantGroups.map(g => g.id);
        if (groupIds.length > 0) {
          const tenantCompanies = await db.company.findMany({
            where: { companyGroupId: { in: groupIds } },
            select: { id: true },
          });
          const companyIds = tenantCompanies.map(c => c.id);
          if (companyIds.length > 0) {
            where.companyId = { in: companyIds };
          } else {
            where.id = '__never__';
          }
        } else {
          where.id = '__never__';
        }
      }

      // ─── Self / team / admin scope enforcement ───
      if (isAuthed) {
        if (scope === 'self' && userId) {
          where.userId = userId;
        } else if (scope === 'team' && userId) {
          const ownEmp = await db.employee.findFirst({
            where: { userId, status: 'active' },
            select: { departmentId: true },
          });
          if (ownEmp) {
            where.departmentId = ownEmp.departmentId;
          }
        } else if (userRole === 'admin') {
          where.user = { role: { not: 'super_admin' } };
        }
      }

      const [employees, total] = await Promise.all([
        db.employee.findMany({
          where,
          include: {
            department: true,
            designation: true,
            branch: true,
            user: {
              select: { id: true, email: true, role: true, avatar: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.employee.count({ where }),
      ]);

      if (employees.length > 0 || total > 0) {
        return NextResponse.json(
          {
            employees,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
            dataScope: isAuthed ? scope : 'all',
          },
          { headers: corsHeaders() }
        );
      }
      // DB returned 0 results — return empty list (no demo fallback)
      return NextResponse.json(
        {
          employees: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          dataScope: isAuthed ? scope : 'all',
        },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('DB employees query failed:', dbError);
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.', code: 'DB_UNAVAILABLE' },
        { status: 503, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('Get employees error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    // ─── Tenant status guard: block writes for suspended/inactive tenants ───
    const tenantBlock = await checkTenantStatusOrBlock(request, corsHeaders);
    if (tenantBlock) return tenantBlock;

    // Try auth but allow demo mode
    let isAuthed = false;
    let decodedUserId: string | undefined;

    const token = getTokenFromHeaders(request);
    if (token) {
      try {
        const decoded = await verifyToken(token);
        if (decoded) {
          isAuthed = true;
          decodedUserId = decoded.userId as string;
          const userRole = (decoded.role as string) || 'employee';
          const scope = getDataScope(userRole);
          if (scope === 'self') {
            return NextResponse.json(
              { error: 'You do not have permission to create employees' },
              { status: 403, headers: corsHeaders() }
            );
          }
        }
      } catch {
        // Continue in demo mode
      }
    }

    const body = await request.json();
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      designationId,
      branchId,
      companyId,
      dateOfJoining,
      dateOfBirth,
      gender,
      maritalStatus,
      nationality,
      address,
      city,
      state,
      zipCode,
      country,
      bloodGroup,
      emergencyContactName,
      emergencyContactPhone,
      bankName,
      bankAccountNo,
      bankIfscCode,
      panNumber,
      aadhaarNumber,
      taxId,
      salary,
      salaryCurrency,
      userId,
      role,
      avatar,
    } = body;

    if (!employeeId || !firstName || !lastName || !email || !departmentId || !designationId) {
      // Build specific list of missing fields for user-friendly error
      const missingFields: string[] = [];
      if (!employeeId) missingFields.push('Employee ID');
      if (!firstName) missingFields.push('First Name');
      if (!lastName) missingFields.push('Last Name');
      if (!email) missingFields.push('Email');
      if (!departmentId) missingFields.push('Department');
      if (!designationId) missingFields.push('Designation');
      return NextResponse.json(
        { error: `Please fill in the required fields: ${missingFields.join(', ')}`, missingFields },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Try to create in database
    try {
      // Check for duplicate employeeId
      const existingEmployee = await db.employee.findUnique({
        where: { employeeId },
      });
      if (existingEmployee) {
        return NextResponse.json(
          { error: 'Employee ID already exists' },
          { status: 409, headers: corsHeaders() }
        );
      }

      // Check for duplicate email
      const existingEmail = await db.employee.findFirst({
        where: { email },
      });
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Employee with this email already exists' },
          { status: 409, headers: corsHeaders() }
        );
      }

      // ─── Multi-tenancy: enforce group company employee strength limit ───
      //
      // If the new employee is being attached to a company that belongs to a
      // CompanyGroup with a `maxEmployees` barrier set, we need to verify the
      // barrier won't be breached.
      //
      // Two modes (group.employeeLimitMode):
      //   - 'per_company'  -> maxEmployees applies to EACH company in the group
      //   - 'group_total'  -> maxEmployees applies to the SUM across all companies
      //
      // If the company is not provided but a branch is, we'll resolve the
      // company from the branch.
      let effectiveCompanyId: string | null = companyId || null;
      if (!effectiveCompanyId && branchId) {
        const branch = await db.branch.findUnique({
          where: { id: branchId },
          select: { companyId: true },
        });
        if (branch) effectiveCompanyId = branch.companyId;
      }

      if (effectiveCompanyId) {
        const company = await db.company.findUnique({
          where: { id: effectiveCompanyId },
          select: {
            id: true,
            name: true,
            companyGroupId: true,
            companyGroup: {
              select: {
                id: true,
                name: true,
                employeeLimitMode: true,
                maxEmployees: true,
              },
            },
          },
        });

        if (company?.companyGroup && company.companyGroup.maxEmployees !== null && company.companyGroup.maxEmployees > 0) {
          const grp = company.companyGroup;
          if (grp.employeeLimitMode === 'per_company') {
            const countInCompany = await db.employee.count({
              where: { companyId: effectiveCompanyId, status: 'active' },
            });
            if (countInCompany >= grp.maxEmployees) {
              return NextResponse.json(
                {
                  error: `Employee strength barrier reached. Company "${company.name}" already has ${countInCompany} active employee(s); the group "${grp.name}" caps each company at ${grp.maxEmployees}. Ask the super admin to raise the limit.`,
                  code: 'EMPLOYEE_STRENGTH_LIMIT_REACHED',
                  mode: 'per_company',
                  limit: grp.maxEmployees,
                  current: countInCompany,
                  companyName: company.name,
                  groupName: grp.name,
                },
                { status: 403, headers: corsHeaders() }
              );
            }
          } else {
            // group_total mode
            const groupCompanyIds = await db.company.findMany({
              where: { companyGroupId: grp.id },
              select: { id: true },
            });
            const countInGroup = await db.employee.count({
              where: {
                companyId: { in: groupCompanyIds.map((c) => c.id) },
                status: 'active',
              },
            });
            if (countInGroup >= grp.maxEmployees) {
              return NextResponse.json(
                {
                  error: `Employee strength barrier reached. Group company "${grp.name}" already has ${countInGroup} active employee(s) across all its companies; the cap is ${grp.maxEmployees}. Ask the super admin to raise the limit.`,
                  code: 'EMPLOYEE_STRENGTH_LIMIT_REACHED',
                  mode: 'group_total',
                  limit: grp.maxEmployees,
                  current: countInGroup,
                  groupName: grp.name,
                },
                { status: 403, headers: corsHeaders() }
              );
            }
          }
        }
      }

      const employee = await db.employee.create({
        data: {
          employeeId,
          firstName,
          lastName,
          email,
          phone: phone || null,
          departmentId: departmentId,
          designationId: designationId,
          branchId: branchId || null,
          companyId: companyId || null,
          dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,
          maritalStatus: maritalStatus || null,
          nationality: nationality || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          country: country || null,
          bloodGroup: bloodGroup || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          bankName: bankName || null,
          bankAccountNo: bankAccountNo || null,
          bankIfscCode: bankIfscCode || null,
          panNumber: panNumber || null,
          aadhaarNumber: aadhaarNumber || null,
          taxId: taxId || null,
          salary: salary ? parseFloat(String(salary)) : null,
          salaryCurrency: salaryCurrency || 'INR',
          userId: userId || null,
          avatar: avatar || null,
          status: 'active',
        },
        include: {
          department: true,
          designation: true,
          branch: true,
        },
      });

      if (isAuthed && decodedUserId) {
        try {
          await db.auditLog.create({
            data: {
              userId: decodedUserId,
              action: 'CREATE_EMPLOYEE',
              module: 'employees',
              details: `Created employee ${employee.employeeId} - ${firstName} ${lastName}`,
            },
          });
        } catch { /* non-critical */ }
      }

      // ─── Role-based User account creation ───
      // After the employee is created, also create (or update) a User account
      // with the specified role so that role-based module access is applied.
      // Wrapped in try/catch so a failure here does NOT fail the whole request.
      try {
        const effectiveRole = role || 'employee';

        // Resolve tenantId from the authenticated admin user
        let adminTenantId: string | undefined;
        if (isAuthed && decodedUserId) {
          const adminUser = await db.user.findUnique({
            where: { id: decodedUserId },
            select: { tenantId: true },
          });
          adminTenantId = adminUser?.tenantId;
        }

        if (adminTenantId) {
          // Check if a User with this email already exists
          const existingUser = await db.user.findUnique({
            where: { email },
          });

          let userIdForEmployee: string;

          if (existingUser) {
            // Update existing user's role
            await db.user.update({
              where: { id: existingUser.id },
              data: { role: effectiveRole },
            });
            userIdForEmployee = existingUser.id;
          } else {
            // Create a new User account
            const randomPassword = generateRandomPassword();
            const hashedPwd = await hashPassword(randomPassword);

            const newUser = await db.user.create({
              data: {
                email,
                name: `${firstName} ${lastName}`,
                role: effectiveRole,
                tenantId: adminTenantId,
                password: hashedPwd,
                status: 'active',
              },
            });
            userIdForEmployee = newUser.id;
          }

          // Link the User to the Employee by setting userId
          await db.employee.update({
            where: { id: employee.id },
            data: { userId: userIdForEmployee },
          });

          // Create EmployeeCompanyMapping for the primary company (if companyId is provided)
          const effectiveCompanyId = companyId || null;
          if (effectiveCompanyId) {
            try {
              await db.employeeCompanyMapping.create({
                data: {
                  employeeId: employee.id,
                  companyId: effectiveCompanyId,
                  employeeCode: employeeId,
                  departmentId: departmentId || null,
                  designationId: designationId || null,
                  branchId: branchId || null,
                  isPrimary: true,
                  status: 'active',
                  dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
                },
              });
            } catch (mappingErr) {
              console.error('Failed to create EmployeeCompanyMapping (non-critical):', mappingErr);
            }
          }

          // Create UserRoleAssignment linking the user to the appropriate Role
          try {
            const roleRecord = await db.role.findFirst({
              where: {
                OR: [
                  { key: effectiveRole },
                  { name: { equals: effectiveRole, mode: 'insensitive' } },
                ],
              },
            });

            if (roleRecord) {
              // Check if this assignment already exists to avoid unique constraint violation
              const existingAssignment = await db.userRoleAssignment.findFirst({
                where: {
                  userId: userIdForEmployee,
                  roleId: roleRecord.id,
                  companyId: effectiveCompanyId || null,
                },
              });

              if (!existingAssignment) {
                await db.userRoleAssignment.create({
                  data: {
                    userId: userIdForEmployee,
                    roleId: roleRecord.id,
                    companyId: effectiveCompanyId || null,
                    assignedBy: decodedUserId || null,
                  },
                });
              }
            }
          } catch (roleAssignErr) {
            console.error('Failed to create UserRoleAssignment (non-critical):', roleAssignErr);
          }
        }
      } catch (userCreationErr) {
        console.error('Failed to create/update User account for employee (non-critical):', userCreationErr);
      }

      return NextResponse.json(
        { employee },
        { status: 201, headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('DB create employee failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to create employee. Please try again.' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('Create employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
