import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

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
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              avatar: true,
            },
          },
          leaveType: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return NextResponse.json(
      {
        leaveRequests,
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
    console.error('Get leave requests error:', error);
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
    const { employeeId, leaveTypeId, startDate, endDate, reason, halfDay } = body;

    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, leaveTypeId, startDate, endDate' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        halfDay: halfDay || false,
        status: 'pending',
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
        leaveType: true,
      },
    });

    // Notify HR admins about the leave request
    const hrAdmins = await prisma.user.findMany({
      where: {
        tenantId: decoded.tenantId as string,
        role: { in: ['super_admin', 'tenant_admin', 'hr_admin'] },
      },
    });

    for (const admin of hrAdmins) {
      await createNotification({
        tenantId: decoded.tenantId as string,
        userId: admin.id,
        title: 'New Leave Request',
        message: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} has submitted a ${leaveRequest.leaveType.name} leave request from ${startDate} to ${endDate}.`,
        type: 'workflow',
        category: 'leave',
        link: `/leave/${leaveRequest.id}`,
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_LEAVE_REQUEST',
        module: 'leave',
        details: `Created leave request for employee ${employeeId}`,
      },
    });

    return NextResponse.json(
      { leaveRequest },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
