import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

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
 * DEBUG endpoint — traces the exact query logic used by /api/employees/credentials
 * so we can see why employees are not being returned.
 * This endpoint should be removed after debugging.
 */
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const debug: Record<string, unknown> = {};

    // 1. Check user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
      select: { id: true, role: true, tenantId: true, email: true },
    });
    debug.user = user;
    debug.decodedToken = { userId: decoded.userId, role: decoded.role, tenantId: (decoded as Record<string, unknown>).tenantId };

    if (!user) {
      debug.error = 'User not found';
      return NextResponse.json(debug, { headers: corsHeaders() });
    }

    // 2. Total employees in DB (no filter)
    const totalEmployees = await prisma.employee.count();
    debug.totalEmployeesInDB = totalEmployees;

    // 3. Employees with companyId set
    const employeesWithCompanyId = await prisma.employee.findMany({
      where: { companyId: { not: null } },
      select: { id: true, employeeId: true, firstName: true, lastName: true, companyId: true, departmentId: true, status: true },
      take: 10,
    });
    debug.employeesWithCompanyId = employeesWithCompanyId;
    debug.employeesWithCompanyIdCount = await prisma.employee.count({ where: { companyId: { not: null } } });

    // 4. Employees with NULL companyId
    const employeesNullCompanyId = await prisma.employee.findMany({
      where: { companyId: null },
      select: { id: true, employeeId: true, firstName: true, lastName: true, companyId: true, departmentId: true, status: true },
      take: 10,
    });
    debug.employeesNullCompanyId = employeesNullCompanyId;
    debug.employeesNullCompanyIdCount = await prisma.employee.count({ where: { companyId: null } });

    // 5. Check tenant's companies
    if (user.tenantId) {
      const tenantCompanyGroups = await prisma.companyGroup.findMany({
        where: { tenantId: user.tenantId },
        select: { id: true, name: true, tenantId: true, companies: { select: { id: true, name: true } } },
      });
      debug.tenantCompanyGroups = tenantCompanyGroups;

      const tenantCompanyIds = await prisma.company.findMany({
        where: { companyGroup: { tenantId: user.tenantId } },
        select: { id: true, name: true },
      });
      debug.tenantCompanyIds = tenantCompanyIds;
      debug.tenantCompanyIdsList = tenantCompanyIds.map(c => c.id);

      // 6. Check departments under those companies
      const companyIds = tenantCompanyIds.map(c => c.id);
      if (companyIds.length > 0) {
        const deptsUnderTenant = await prisma.department.findMany({
          where: { companyId: { in: companyIds } },
          select: { id: true, name: true, companyId: true },
          take: 20,
        });
        debug.departmentsUnderTenantCompanies = deptsUnderTenant;

        // 7. Try the NEW query (companyId IN or department.companyId IN)
        const employeesViaNewQuery = await prisma.employee.findMany({
          where: {
            OR: [
              { companyId: { in: companyIds } },
              { department: { companyId: { in: companyIds } } },
            ],
          },
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            email: true, companyId: true, departmentId: true, status: true,
            department: { select: { name: true, companyId: true } },
          },
          take: 20,
        });
        debug.employeesViaNewQuery = employeesViaNewQuery;
        debug.employeesViaNewQueryCount = await prisma.employee.count({
          where: {
            OR: [
              { companyId: { in: companyIds } },
              { department: { companyId: { in: companyIds } } },
            ],
          },
        });

        // 8. Try the OLD deep relation query
        const employeesViaOldQuery = await prisma.employee.findMany({
          where: {
            department: { company: { companyGroup: { tenantId: user.tenantId } } },
          },
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            email: true, companyId: true, departmentId: true, status: true,
          },
          take: 20,
        });
        debug.employeesViaOldQuery = employeesViaOldQuery;
        debug.employeesViaOldQueryCount = await prisma.employee.count({
          where: {
            department: { company: { companyGroup: { tenantId: user.tenantId } } },
          },
        });
      } else {
        debug.warning = 'No companies found for this tenant!';
      }

      // 9. Try simpler approach: just get ALL employees and check their data
      const allEmployeesSample = await prisma.employee.findMany({
        take: 10,
        select: {
          id: true, employeeId: true, firstName: true, lastName: true,
          email: true, companyId: true, departmentId: true, status: true,
          department: { select: { id: true, name: true, companyId: true, company: { select: { id: true, name: true, companyGroupId: true, companyGroup: { select: { id: true, name: true, tenantId: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      debug.allEmployeesSample = allEmployeesSample;

    } else {
      debug.warning = 'User has no tenantId!';
      // For super_admin with no tenantId, just show all
      const allEmployees = await prisma.employee.findMany({
        take: 20,
        select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, companyId: true, departmentId: true, status: true },
      });
      debug.allEmployees = allEmployees;
    }

    return NextResponse.json(debug, { headers: corsHeaders() });
  } catch (error) {
    console.error('[DEBUG Credentials] Error:', error);
    return NextResponse.json({
      error: 'Debug query failed',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 10) : undefined,
    }, { status: 500, headers: corsHeaders() });
  }
}
