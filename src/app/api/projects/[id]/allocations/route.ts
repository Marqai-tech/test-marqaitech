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
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const allocations = await prisma.projectAllocation.findMany({
      where: { projectId: id },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeId: true,
            email: true, department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ allocations }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get project allocations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const {
      employeeId, role, allocationPct, startDate, endDate,
      billingStatus, billingRate, internalCostRate,
      timesheetApprover, clientApprover,
    } = body;

    if (!employeeId || !startDate) {
      return NextResponse.json(
        { error: 'Missing required fields: employeeId, startDate' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Verify employee exists
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }

    const allocation = await prisma.projectAllocation.create({
      data: {
        projectId: id,
        employeeId,
        role,
        allocationPct: allocationPct ?? 100,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        billingStatus: billingStatus || 'billable',
        billingRate: billingRate ?? 0,
        internalCostRate: internalCostRate ?? 0,
        timesheetApprover,
        clientApprover,
        status: 'active',
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PROJECT_ALLOCATION',
        module: 'projects',
        details: `Allocated employee ${employeeId} to project ${id} at ${allocationPct || 100}%`,
      },
    });

    return NextResponse.json({ allocation }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create project allocation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
