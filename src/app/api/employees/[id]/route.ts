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

// Shared include config for employee queries
const employeeInclude = {
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
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    console.log(`[Employee GET] Looking up employee with id/employeeId: ${id}`);

    try {
      // Strategy 1: Try findUnique by database id (CUID)
      let employee = await prisma.employee.findUnique({
        where: { id },
        include: employeeInclude,
      });

      // Strategy 2: If not found, try findUnique by employeeId (e.g. "EMP001")
      if (!employee) {
        console.log(`[Employee GET] Not found by id, trying employeeId: ${id}`);
        employee = await prisma.employee.findUnique({
          where: { employeeId: id },
          include: employeeInclude,
        });
      }

      // Strategy 3: If still not found, try a broader search by email or name
      if (!employee) {
        console.log(`[Employee GET] Not found by employeeId either, trying email search: ${id}`);
        employee = await prisma.employee.findFirst({
          where: { email: { equals: id, mode: 'insensitive' } },
          include: employeeInclude,
        });
      }

      if (employee) {
        console.log(`[Employee GET] Found employee: ${employee.employeeId} (${employee.firstName} ${employee.lastName})`);
        return NextResponse.json(
          { employee },
          { headers: corsHeaders() }
        );
      }

      // All strategies exhausted — employee genuinely not found
      console.log(`[Employee GET] Employee not found after all lookup strategies for: ${id}`);
      return NextResponse.json(
        { error: 'Employee not found', code: 'NOT_FOUND', searchedId: id },
        { status: 404, headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('[Employee GET] DB query failed:', dbError);
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.', code: 'DB_UNAVAILABLE' },
        { status: 503, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee GET] Unexpected error:', error);
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
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    const body = await request.json();

    try {
      // Try to find employee by id first, then by employeeId
      let existingEmployee = await prisma.employee.findUnique({ where: { id } });
      if (!existingEmployee) {
        existingEmployee = await prisma.employee.findUnique({ where: { employeeId: id } });
      }

      if (!existingEmployee) {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      const actualId = existingEmployee.id; // Use the real DB id for updates

      const {
        firstName, lastName, email, phone, departmentId, designationId,
        branchId, companyId, dateOfJoining, dateOfBirth, gender, maritalStatus,
        nationality, address, city, state, zipCode, country, bloodGroup,
        emergencyContactName, emergencyContactPhone, bankName, bankAccountNo,
        bankIfscCode, panNumber, aadhaarNumber, taxId, salary, salaryCurrency,
        status, role,
      } = body;

      const updateData: Record<string, unknown> = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (departmentId !== undefined) updateData.departmentId = departmentId || undefined;
      if (designationId !== undefined) updateData.designationId = designationId || undefined;
      if (branchId !== undefined) updateData.branchId = branchId || null;
      if (companyId !== undefined) updateData.companyId = companyId || null;
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
        where: { id: actualId },
        data: updateData,
        include: {
          department: true,
          designation: true,
          branch: true,
          user: { select: { id: true, email: true, role: true, avatar: true } },
        },
      });

      // ─── Update User role if provided ───
      // The role field lives on the User model, not Employee.
      // When editing an employee's role, we need to update the linked User account.
      if (role !== undefined && employee.userId) {
        try {
          const effectiveRole = role || 'employee';
          console.log(`[Employee PUT] Updating role for user ${employee.userId} to: ${effectiveRole}`);
          await prisma.user.update({
            where: { id: employee.userId },
            data: { role: effectiveRole },
          });

          // Also update UserRoleAssignment if a Role record exists
          const roleRecord = await prisma.role.findFirst({
            where: {
              OR: [
                { key: effectiveRole },
                { name: { equals: effectiveRole, mode: 'insensitive' } },
              ],
            },
          });
          if (roleRecord) {
            // Delete existing role assignments for this user and create new one
            await prisma.userRoleAssignment.deleteMany({
              where: { userId: employee.userId },
            });
            await prisma.userRoleAssignment.create({
              data: {
                userId: employee.userId,
                roleId: roleRecord.id,
                companyId: employee.companyId || null,
              },
            });
          }

          // Re-fetch employee with updated user role for the response
          const updatedEmployee = await prisma.employee.findUnique({
            where: { id: actualId },
            include: {
              department: true,
              designation: true,
              branch: true,
              user: { select: { id: true, email: true, role: true, avatar: true } },
            },
          });
          if (updatedEmployee) {
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
                      details: `Updated employee ${employee.employeeId} (role: ${effectiveRole})`,
                    },
                  });
                }
              }
            } catch { /* non-critical */ }

            return NextResponse.json({ employee: updatedEmployee }, { headers: corsHeaders() });
          }
        } catch (roleUpdateErr) {
          console.error('[Employee PUT] Failed to update user role (non-critical):', roleUpdateErr);
          // Don't fail the whole request — the employee was already updated successfully
        }
      }

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
      console.error('[Employee PUT] DB update failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to update employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee PUT] Unexpected error:', error);
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
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    try {
      // Try to find employee by id first, then by employeeId
      let existingEmployee = await prisma.employee.findUnique({ where: { id } });
      if (!existingEmployee) {
        existingEmployee = await prisma.employee.findUnique({ where: { employeeId: id } });
      }

      if (!existingEmployee) {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      const actualId = existingEmployee.id;

      // Soft delete - set status to terminated
      const employee = await prisma.employee.update({
        where: { id: actualId },
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
      console.error('[Employee DELETE] DB delete failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee DELETE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
