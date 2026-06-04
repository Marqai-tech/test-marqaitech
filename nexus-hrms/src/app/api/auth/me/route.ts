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
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders() }
      );
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
              department: user.employee.department,
              designation: user.employee.designation,
              branch: user.employee.branch,
              status: user.employee.status,
              salary: user.employee.salary,
            }
          : null,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
