import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';

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
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const departmentId = searchParams.get('departmentId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    // Company scope — sent by the header CompanySwitcher for super_admin and
    // tenant_admin. null/undefined means "all companies in scope".
    const companyId = searchParams.get('companyId');
    // Tenant scope — only meaningful for super_admin (tenant_admin is already
    // scoped to their own tenantId in the JWT).
    const tenantId = searchParams.get('tenantId');

    // Try to authenticate, but don't block if no auth (demo mode)
    let userRole = 'employee';
    let userId: string | undefined;
    let isAuthed = false;

    try {
      const token = getTokenFromHeaders(request);
      if (token) {
        try {
          const decoded = await verifyToken(token);
          if (decoded) {
            userRole = (decoded.role as string) || 'employee';
            userId = decoded.userId as string;
            isAuthed = true;
          }
        } catch {
          // Token verification failed, continue in demo mode
        }
      }
    } catch {
      // Auth check failed entirely, continue in demo mode
    }

    let scope = 'all';
    try {
      if (isAuthed) {
        scope = getDataScope(userRole);
      }
    } catch {
      scope = 'all';
    }

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

      // ─── Company scope filter (from header CompanySwitcher) ───
      // When a companyId is provided, filter employees by that exact company.
      // This is the primary mechanism that makes the header dropdown actually
      // do something — previously the param was sent by the home page but
      // silently ignored here, so the dropdown appeared to be a no-op.
      if (companyId) {
        where.companyId = companyId;
      }

      // ─── Tenant scope filter (super_admin only) ───
      // For super_admin with no companyId selected, allow narrowing to a
      // specific tenant's companies. We resolve via the Company → CompanyGroup
      // → tenant relation so the filter is consistent with the hierarchy.
      if (!companyId && tenantId && userRole === 'super_admin') {
        where.company = { companyGroup: { tenantId } };
      }

      if (isAuthed) {
        if (scope === 'self' && userId) {
          where.userId = userId;
        } else if (scope === 'team' && userId) {
          const ownEmp = await prisma.employee.findFirst({
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
        prisma.employee.findMany({
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
        prisma.employee.count({ where }),
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
  try {
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
      const existingEmployee = await prisma.employee.findUnique({
        where: { employeeId },
      });
      if (existingEmployee) {
        return NextResponse.json(
          { error: 'Employee ID already exists' },
          { status: 409, headers: corsHeaders() }
        );
      }

      // Check for duplicate email
      const existingEmail = await prisma.employee.findFirst({
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
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { companyId: true },
        });
        if (branch) effectiveCompanyId = branch.companyId;
      }

      if (effectiveCompanyId) {
        const company = await prisma.company.findUnique({
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
            const countInCompany = await prisma.employee.count({
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
            const groupCompanyIds = await prisma.company.findMany({
              where: { companyGroupId: grp.id },
              select: { id: true },
            });
            const countInGroup = await prisma.employee.count({
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

      const employee = await prisma.employee.create({
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
          await prisma.auditLog.create({
            data: {
              userId: decodedUserId,
              action: 'CREATE_EMPLOYEE',
              module: 'employees',
              details: `Created employee ${employee.employeeId} - ${firstName} ${lastName}`,
            },
          });
        } catch { /* non-critical */ }
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
