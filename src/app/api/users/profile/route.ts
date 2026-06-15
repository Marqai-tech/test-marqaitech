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

// GET - Fetch current user profile
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
      include: {
        tenant: true,
        employee: {
          include: {
            department: true,
            designation: true,
            branch: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          plan: user.tenant.plan,
          currency: user.tenant.currency,
          timezone: user.tenant.timezone,
        },
        employee: user.employee
          ? {
              id: user.employee.id,
              employeeId: user.employee.employeeId,
              firstName: user.employee.firstName,
              lastName: user.employee.lastName,
              email: user.employee.email,
              phone: user.employee.phone || '',
              emergencyContactName: user.employee.emergencyContactName || '',
              emergencyContactPhone: user.employee.emergencyContactPhone || '',
              address: user.employee.address || '',
              city: user.employee.city || '',
              state: user.employee.state || '',
              zipCode: user.employee.zipCode || '',
              country: user.employee.country || '',
              dateOfBirth: user.employee.dateOfBirth,
              gender: user.employee.gender || '',
              bloodGroup: user.employee.bloodGroup || '',
              department: user.employee.department?.name || '',
              designation: user.employee.designation?.name || '',
              branch: user.employee.branch?.name || '',
              dateOfJoining: user.employee.dateOfJoining,
              status: user.employee.status,
            }
          : null,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// PATCH - Update current user profile
export async function PATCH(request: Request) {
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

    const updatedUser = await prisma.user.update({
      where: { id: decoded.userId as string },
      data: userUpdateData,
      include: { tenant: true, employee: true },
    });

    // Update employee details if provided (Employee model has: phone, address, etc.)
    const hasEmployeeUpdates = phone !== undefined || emergencyContactName !== undefined || emergencyContactPhone !== undefined || address !== undefined || city !== undefined || state !== undefined || zipCode !== undefined || country !== undefined || dateOfBirth !== undefined || gender !== undefined || bloodGroup !== undefined;

    if (updatedUser.employee && hasEmployeeUpdates) {
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

      await prisma.employee.update({
        where: { id: updatedUser.employee.id },
        data: employeeUpdateData,
      });
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
