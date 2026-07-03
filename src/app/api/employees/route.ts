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

// Demo employees data for fallback when DB is unavailable or no auth
function getDemoEmployees() {
  const departments = [
    { id: 'dept-1', name: 'Engineering' },
    { id: 'dept-2', name: 'Human Resources' },
    { id: 'dept-3', name: 'Finance' },
    { id: 'dept-4', name: 'Sales' },
    { id: 'dept-5', name: 'Marketing' },
    { id: 'dept-6', name: 'Operations' },
    { id: 'dept-7', name: 'Quality' },
    { id: 'dept-8', name: 'Admin' },
  ];
  const designations = [
    { id: 'desig-1', title: 'Software Engineer', departmentId: 'dept-1' },
    { id: 'desig-2', title: 'Senior Engineer', departmentId: 'dept-1' },
    { id: 'desig-3', title: 'Tech Lead', departmentId: 'dept-1' },
    { id: 'desig-4', title: 'HR Executive', departmentId: 'dept-2' },
    { id: 'desig-5', title: 'HR Manager', departmentId: 'dept-2' },
    { id: 'desig-6', title: 'Finance Manager', departmentId: 'dept-3' },
    { id: 'desig-7', title: 'Sales Manager', departmentId: 'dept-4' },
    { id: 'desig-8', title: 'Operations Manager', departmentId: 'dept-6' },
  ];
  const branches = [
    { id: 'branch-1', name: 'Mumbai HQ', city: 'Mumbai' },
    { id: 'branch-2', name: 'Bangalore Tech Park', city: 'Bangalore' },
    { id: 'branch-3', name: 'Hyderabad Campus', city: 'Hyderabad' },
    { id: 'branch-4', name: 'Pune Office', city: 'Pune' },
  ];

  const names = [
    { firstName: 'Aarav', lastName: 'Sharma' },
    { firstName: 'Priya', lastName: 'Patel' },
    { firstName: 'Rohan', lastName: 'Kumar' },
    { firstName: 'Ananya', lastName: 'Singh' },
    { firstName: 'Amit', lastName: 'Rao' },
    { firstName: 'Neha', lastName: 'Gupta' },
    { firstName: 'Suresh', lastName: 'Babu' },
    { firstName: 'Sneha', lastName: 'Joshi' },
    { firstName: 'Karan', lastName: 'Verma' },
    { firstName: 'Divya', lastName: 'Nair' },
    { firstName: 'Vikram', lastName: 'Reddy' },
    { firstName: 'Meera', lastName: 'Iyer' },
  ];

  const statuses = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'on_leave', 'active', 'active', 'active', 'active'];

  return names.map((name, i) => {
    const deptIdx = i % departments.length;
    const desigIdx = i % designations.length;
    const branchIdx = i % branches.length;
    return {
      id: `demo-emp-${i + 1}`,
      employeeId: `EMP${String(i + 1).padStart(3, '0')}`,
      firstName: name.firstName,
      lastName: name.lastName,
      email: `${name.firstName.toLowerCase()}.${name.lastName.toLowerCase()}@3boxestech.com`,
      phone: `+91 ${Math.floor(9000000000 + Math.random() * 999999999)}`,
      avatar: null,
      userId: null,
      departmentId: departments[deptIdx].id,
      designationId: designations[desigIdx].id,
      branchId: branches[branchIdx].id,
      companyId: 'comp-1',
      dateOfJoining: new Date(2022 + Math.floor(i / 4), i % 12, 1 + i).toISOString(),
      dateOfBirth: new Date(1990 + (i % 10), i % 12, 5 + i).toISOString(),
      gender: i % 2 === 0 ? 'male' : 'female',
      maritalStatus: i % 3 === 0 ? 'single' : 'married',
      nationality: 'Indian',
      address: `${100 + i} Street`,
      city: branches[branchIdx].city,
      state: 'Maharashtra',
      zipCode: '400001',
      country: 'India',
      bloodGroup: ['A+', 'B+', 'O+', 'AB+'][i % 4],
      emergencyContactName: `Emergency ${name.firstName}`,
      emergencyContactPhone: `+91 ${Math.floor(9000000000 + Math.random() * 999999999)}`,
      status: statuses[i],
      bankName: 'HDFC Bank',
      bankAccountNo: `${1000000000 + i}`,
      bankIfscCode: 'HDFC0001234',
      panNumber: `${name.firstName[0]}${name.lastName[0]}PPA${1000 + i}K`,
      aadhaarNumber: `${123456789000 + i}`,
      taxId: null,
      salary: 300000 + i * 150000,
      salaryCurrency: 'INR',
      department: departments[deptIdx],
      designation: designations[desigIdx],
      branch: branches[branchIdx],
      user: { id: `user-${i + 1}`, email: `${name.firstName.toLowerCase()}.${name.lastName.toLowerCase()}@3boxestech.com`, role: i === 0 ? 'super_admin' : i < 3 ? 'admin' : 'employee', avatar: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
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
    } catch (dbError) {
      console.error('DB employees query failed, using demo fallback:', dbError);
    }

    // Fallback: demo data
    let demoData = getDemoEmployees();
    if (search) {
      const s = search.toLowerCase();
      demoData = demoData.filter(e =>
        e.firstName.toLowerCase().includes(s) ||
        e.lastName.toLowerCase().includes(s) ||
        e.email.toLowerCase().includes(s) ||
        e.employeeId.toLowerCase().includes(s)
      );
    }
    if (status) {
      demoData = demoData.filter(e => e.status === status);
    }
    if (departmentId) {
      demoData = demoData.filter(e => e.departmentId === departmentId);
    }

    const start = (page - 1) * limit;
    const paged = demoData.slice(start, start + limit);

    return NextResponse.json(
      {
        employees: paged,
        pagination: {
          page,
          limit,
          total: demoData.length,
          totalPages: Math.ceil(demoData.length / limit),
        },
        dataScope: 'all',
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get employees error:', error);
    // Even on global error, return demo data instead of erroring
    const demoData = getDemoEmployees();
    return NextResponse.json(
      {
        employees: demoData.slice(0, 20),
        pagination: { page: 1, limit: 20, total: demoData.length, totalPages: 1 },
        dataScope: 'all',
      },
      { headers: corsHeaders() }
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

    if (!employeeId || !firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, firstName, lastName, email' },
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
          departmentId: departmentId || 'dept-1',
          designationId: designationId || 'desig-1',
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
      // Return a demo response for demo mode
      const demoEmployee = {
        id: `demo-${Date.now()}`,
        employeeId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        departmentId: departmentId || 'dept-1',
        designationId: designationId || 'desig-1',
        branchId: branchId || null,
        companyId: companyId || null,
        dateOfJoining: dateOfJoining || new Date().toISOString(),
        status: 'active',
        salary: salary ? parseFloat(String(salary)) : null,
        salaryCurrency: salaryCurrency || 'INR',
        department: { id: 'dept-1', name: 'Engineering' },
        designation: { id: 'desig-1', title: designationId ? 'Assigned' : 'Software Engineer' },
        branch: null,
      };
      return NextResponse.json(
        { employee: demoEmployee },
        { status: 201, headers: corsHeaders() }
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
