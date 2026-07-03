import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/leave/balance
 * Returns the authenticated employee's leave balances for the current year.
 * If the user is a manager/HR/admin and an `employeeId` query param is supplied,
 * that employee's balances are returned instead (subject to basic authorization).
 *
 * Response shape:
 * {
 *   balances: Array<{
 *     id, leaveTypeId, leaveType: { id, name, code, color? },
 *     year, total, used, remaining, carryForward
 *   }>,
 *   summary: { totalAllocated, totalUsed, totalRemaining }
 * }
 */
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
    const requestedEmployeeId = searchParams.get('employeeId');
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    // Resolve target employee
    let employeeId: string | undefined = requestedEmployeeId || undefined;

    if (!employeeId) {
      // Resolve from authenticated user
      const employee = await prisma.employee.findFirst({
        where: { userId: decoded.userId as string },
        select: { id: true },
      });
      if (!employee) {
        return NextResponse.json(
          { balances: [], summary: { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 } },
          { headers: corsHeaders() }
        );
      }
      employeeId = employee.id;
    } else {
      // If requesting on behalf of another employee, ensure the caller has a
      // privileged role. This is a coarse check — finer permissions can be
      // layered on top via the RBAC tables.
      const callerRole = (decoded.role as string) || '';
      const privileged = ['super_admin', 'tenant_admin', 'admin'].includes(
        callerRole
      );
      if (!privileged) {
        // Non-privileged users can only view their own balance
        const self = await prisma.employee.findFirst({
          where: { userId: decoded.userId as string },
          select: { id: true },
        });
        if (!self || self.id !== requestedEmployeeId) {
          return NextResponse.json(
            { error: 'Forbidden' },
            { status: 403, headers: corsHeaders() }
          );
        }
        employeeId = self.id;
      }
    }

    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { leaveType: { name: 'asc' } },
    });

    // If no balance records exist yet for this year, fall back to listing all
    // active leave types with zeroed-out balances. This gives the UI something
    // sensible to render for new employees.
    let result = balances;
    if (balances.length === 0) {
      const leaveTypes = await prisma.leaveType.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          name: true,
          code: true,
          defaultDays: true,
        },
        orderBy: { name: 'asc' },
      });
      result = leaveTypes.map((lt) => ({
        id: `synthetic-${lt.id}`,
        leaveTypeId: lt.id,
        leaveType: { id: lt.id, name: lt.name, code: lt.code },
        year,
        total: lt.defaultDays || 0,
        used: 0,
        remaining: lt.defaultDays || 0,
        carryForward: 0,
        synthetic: true,
      })) as typeof balances;
    }

    const summary = result.reduce(
      (acc, b) => {
        acc.totalAllocated += b.total || 0;
        acc.totalUsed += b.used || 0;
        acc.totalRemaining += b.remaining || 0;
        return acc;
      },
      { totalAllocated: 0, totalUsed: 0, totalRemaining: 0 }
    );

    return NextResponse.json(
      {
        balances: result.map((b) => ({
          id: b.id,
          leaveTypeId: b.leaveTypeId,
          leaveType: b.leaveType,
          year: b.year,
          total: b.total,
          used: b.used,
          remaining: b.remaining,
          carryForward: b.carryForward,
        })),
        summary,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('GET /api/leave/balance error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leave balance' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
