import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const departmentId = searchParams.get('departmentId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

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

    return NextResponse.json(
      {
        employees,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
    );
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
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
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

    if (!employeeId || !firstName || !lastName || !email || !departmentId || !designationId || !dateOfJoining) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, firstName, lastName, email, departmentId, designationId, dateOfJoining' },
        { status: 400, headers: corsHeaders() }
      );
    }

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

    const employee = await prisma.employee.create({
      data: {
        employeeId,
        firstName,
        lastName,
        email,
        phone,
        departmentId,
        designationId,
        branchId,
        companyId,
        dateOfJoining: new Date(dateOfJoining),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
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
        salaryCurrency: salaryCurrency || 'USD',
        userId,
        status: 'active',
      },
      include: {
        department: true,
        designation: true,
        branch: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_EMPLOYEE',
        module: 'employees',
        details: `Created employee ${employee.employeeId} - ${firstName} ${lastName}`,
      },
    });

    return NextResponse.json(
      { employee },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
