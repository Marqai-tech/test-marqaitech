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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        designation: true,
        branch: true,
        user: {
          select: { id: true, email: true, role: true, avatar: true },
        },
        leaveBalances: {
          include: { leaveType: true },
        },
        dependents: true,
        qualifications: true,
        experiences: true,
        skills: true,
        documents: true,
        assetAssignments: {
          include: { asset: true },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { employee },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();

    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
    });

    if (!existingEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const {
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
      status,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (designationId !== undefined) updateData.designationId = designationId;
    if (branchId !== undefined) updateData.branchId = branchId;
    if (companyId !== undefined) updateData.companyId = companyId;
    if (dateOfJoining !== undefined) updateData.dateOfJoining = new Date(dateOfJoining);
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (gender !== undefined) updateData.gender = gender;
    if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (country !== undefined) updateData.country = country;
    if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (bankAccountNo !== undefined) updateData.bankAccountNo = bankAccountNo;
    if (bankIfscCode !== undefined) updateData.bankIfscCode = bankIfscCode;
    if (panNumber !== undefined) updateData.panNumber = panNumber;
    if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber;
    if (taxId !== undefined) updateData.taxId = taxId;
    if (salary !== undefined) updateData.salary = salary;
    if (salaryCurrency !== undefined) updateData.salaryCurrency = salaryCurrency;
    if (status !== undefined) updateData.status = status;

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: true,
        designation: true,
        branch: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_EMPLOYEE',
        module: 'employees',
        details: `Updated employee ${employee.employeeId}`,
      },
    });

    return NextResponse.json(
      { employee },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
    });

    if (!existingEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Soft delete - set status to terminated
    const employee = await prisma.employee.update({
      where: { id },
      data: { status: 'terminated' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_EMPLOYEE',
        module: 'employees',
        details: `Soft deleted (terminated) employee ${employee.employeeId}`,
      },
    });

    return NextResponse.json(
      { message: 'Employee terminated successfully', employee },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
