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

// Demo employee data for fallback when DB is unavailable or ID is from demo data
function getDemoEmployeeById(id: string) {
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

  // Find demo employee by ID pattern (demo-emp-N) or by direct index
  let idx = -1;
  if (id.startsWith('demo-emp-')) {
    idx = parseInt(id.replace('demo-emp-', '')) - 1;
  } else {
    // Try to find by index from any numeric ID pattern
    const numMatch = id.match(/(\d+)/);
    if (numMatch) idx = parseInt(numMatch[1]) - 1;
  }

  if (idx < 0 || idx >= names.length) return null;

  const deptIdx = idx % departments.length;
  const desigIdx = idx % designations.length;
  const branchIdx = idx % branches.length;
  const name = names[idx];

  return {
    id: `demo-emp-${idx + 1}`,
    employeeId: `EMP${String(idx + 1).padStart(3, '0')}`,
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
    dateOfJoining: new Date(2022 + Math.floor(idx / 4), idx % 12, 1 + idx).toISOString(),
    dateOfBirth: new Date(1990 + (idx % 10), idx % 12, 5 + idx).toISOString(),
    gender: idx % 2 === 0 ? 'male' : 'female',
    maritalStatus: idx % 3 === 0 ? 'single' : 'married',
    nationality: 'Indian',
    address: `${100 + idx} Street`,
    city: branches[branchIdx].city,
    state: 'Maharashtra',
    zipCode: '400001',
    country: 'India',
    bloodGroup: ['A+', 'B+', 'O+', 'AB+'][idx % 4],
    emergencyContactName: `Emergency ${name.firstName}`,
    emergencyContactPhone: `+91 ${Math.floor(9000000000 + Math.random() * 999999999)}`,
    status: idx === 7 ? 'on_leave' : 'active',
    bankName: 'HDFC Bank',
    bankAccountNo: `${1000000000 + idx}`,
    bankIfscCode: 'HDFC0001234',
    panNumber: `${name.firstName[0]}${name.lastName[0]}PPA${1000 + idx}K`,
    aadhaarNumber: `${123456789000 + idx}`,
    taxId: null,
    salary: 300000 + idx * 150000,
    salaryCurrency: 'INR',
    department: departments[deptIdx],
    designation: designations[desigIdx],
    branch: branches[branchIdx],
    user: { id: `user-${idx + 1}`, email: `${name.firstName.toLowerCase()}.${name.lastName.toLowerCase()}@3boxestech.com`, role: idx === 0 ? 'super_admin' : idx < 3 ? 'admin' : 'employee', avatar: null },
    leaveBalances: [
      { id: `lb-${idx + 1}-1`, total: 24, used: 5 + idx, remaining: 19 - idx, year: 2025, leaveType: { id: 'lt-1', name: 'Casual Leave', code: 'CL' } },
      { id: `lb-${idx + 1}-2`, total: 15, used: 2 + idx, remaining: 13 - idx, year: 2025, leaveType: { id: 'lt-2', name: 'Sick Leave', code: 'SL' } },
    ],
    dependents: idx % 3 === 0 ? [
      { id: `dep-${idx + 1}-1`, name: `${name.firstName}'s Spouse`, relation: 'spouse', dateOfBirth: new Date(1992, 5, 10).toISOString(), gender: idx % 2 === 0 ? 'female' : 'male' },
    ] : [],
    qualifications: [
      { id: `qual-${idx + 1}-1`, degree: 'B.Tech', institution: 'IIT Mumbai', year: 2012 + idx, percentage: 75 + idx },
    ],
    experiences: [
      { id: `exp-${idx + 1}-1`, company: 'Previous Corp', designation: 'Associate', startDate: new Date(2015, 0, 1).toISOString(), endDate: new Date(2022, 0, 1).toISOString(), isCurrent: false },
    ],
    skills: [
      { id: `skill-${idx + 1}-1`, skill: idx % 2 === 0 ? 'JavaScript' : 'Python', level: 'intermediate', yearsOfExp: 3 + idx },
      { id: `skill-${idx + 1}-2`, skill: idx % 2 === 0 ? 'React' : 'Django', level: 'advanced', yearsOfExp: 2 + idx },
    ],
    documents: [],
    assetAssignments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try database first
    try {
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

      if (employee) {
        return NextResponse.json(
          { employee },
          { headers: corsHeaders() }
        );
      }
    } catch (dbError) {
      console.error('DB employee query failed:', dbError);
    }

    // Demo fallback: if ID matches demo pattern or DB is unavailable
    const demoEmployee = getDemoEmployeeById(id);
    if (demoEmployee) {
      return NextResponse.json(
        { employee: demoEmployee },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { error: 'Employee not found' },
      { status: 404, headers: corsHeaders() }
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
    const { id } = await params;
    const body = await request.json();

    // Try database update
    try {
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
        firstName, lastName, email, phone, departmentId, designationId,
        branchId, companyId, dateOfJoining, dateOfBirth, gender, maritalStatus,
        nationality, address, city, state, zipCode, country, bloodGroup,
        emergencyContactName, emergencyContactPhone, bankName, bankAccountNo,
        bankIfscCode, panNumber, aadhaarNumber, taxId, salary, salaryCurrency,
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

      // Try audit log (non-critical)
      try {
        const token = getTokenFromHeaders(request);
        if (token) {
          const decoded = await verifyToken(token);
          if (decoded) {
            await prisma.auditLog.create({
              data: {
                userId: decoded.userId as string,
                action: 'UPDATE_EMPLOYEE',
                module: 'employees',
                details: `Updated employee ${employee.employeeId}`,
              },
            });
          }
        }
      } catch { /* non-critical */ }

      return NextResponse.json(
        { employee },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('DB employee update failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to update employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
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
    const { id } = await params;

    try {
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

      // Try audit log (non-critical)
      try {
        const token = getTokenFromHeaders(request);
        if (token) {
          const decoded = await verifyToken(token);
          if (decoded) {
            await prisma.auditLog.create({
              data: {
                userId: decoded.userId as string,
                action: 'DELETE_EMPLOYEE',
                module: 'employees',
                details: `Soft deleted (terminated) employee ${employee.employeeId}`,
              },
            });
          }
        }
      } catch { /* non-critical */ }

      return NextResponse.json(
        { message: 'Employee terminated successfully', employee },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('DB employee delete failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
