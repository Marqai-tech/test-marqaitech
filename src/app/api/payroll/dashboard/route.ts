import prisma from '@/lib/prisma';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

    const currentPeriod = `${year}-${String(month).padStart(2, '0')}`;

    // 1. Current month payroll run metrics
    const currentRuns = await prisma.payrollRun.findMany({
      where: {
        payrollPeriod: currentPeriod,
        ...(companyId ? { companyId } : {}),
      },
    });

    const totalGrossPay = currentRuns.reduce((s, r) => s + r.totalGrossPay, 0);
    const totalDeductions = currentRuns.reduce((s, r) => s + r.totalDeductions, 0);
    const totalNetPay = currentRuns.reduce((s, r) => s + r.totalNetPay, 0);
    const totalEmployerContrib = currentRuns.reduce((s, r) => s + r.totalEmployerContrib, 0);
    const totalEmployeesProcessed = currentRuns.reduce((s, r) => s + r.totalEmployees, 0);

    // 2. Pending approvals count
    const pendingApprovals = await prisma.payrollRun.count({
      where: {
        runStatus: 'REVIEW',
        ...(companyId ? { companyId } : {}),
      },
    });

    // 3. Active payroll holds count
    const activeHolds = await prisma.payrollHold.count({
      where: { status: 'active' },
    });

    // 4. Recent payroll runs (last 5)
    const recentRuns = await prisma.payrollRun.findMany({
      where: { ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 5. Monthly trend (last 6 months)
    const monthlyTrend: { period: string; grossPay: number; deductions: number; netPay: number; employerContrib: number; employees: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const trendMonth = month - i;
      let tYear = year;
      let tMonth = trendMonth;
      if (tMonth <= 0) {
        tMonth = 12 + tMonth;
        tYear--;
      }
      const period = `${tYear}-${String(tMonth).padStart(2, '0')}`;
      const runs = await prisma.payrollRun.findMany({
        where: { payrollPeriod: period, ...(companyId ? { companyId } : {}) },
      });
      monthlyTrend.push({
        period,
        grossPay: runs.reduce((s, r) => s + r.totalGrossPay, 0),
        deductions: runs.reduce((s, r) => s + r.totalDeductions, 0),
        netPay: runs.reduce((s, r) => s + r.totalNetPay, 0),
        employerContrib: runs.reduce((s, r) => s + r.totalEmployerContrib, 0),
        employees: runs.reduce((s, r) => s + r.totalEmployees, 0),
      });
    }

    // 6. Department-wise salary breakdown
    const departments = await prisma.department.findMany({
      where: { ...(companyId ? { companyId } : {}), status: 'active' },
      include: { employees: { where: { status: 'active' }, select: { id: true, salary: true } } },
    });

    const departmentBreakdown = departments.map(dept => ({
      departmentId: dept.id,
      departmentName: dept.name,
      headcount: dept.employees.length,
      totalSalary: dept.employees.reduce((s, e) => s + (e.salary || 0), 0),
      avgSalary: dept.employees.length > 0
        ? dept.employees.reduce((s, e) => s + (e.salary || 0), 0) / dept.employees.length
        : 0,
    })).sort((a, b) => b.totalSalary - a.totalSalary);

    // 7. Total active employees
    const totalActiveEmployees = await prisma.employee.count({
      where: {
        status: 'active',
        ...(companyId ? { department: { companyId } } : {}),
      },
    });

    return Response.json({
      currentPeriod,
      metrics: {
        totalEmployeesProcessed,
        totalActiveEmployees,
        totalGrossPay,
        totalDeductions,
        totalNetPay,
        totalEmployerContrib,
        pendingApprovals,
        activeHolds,
      },
      recentRuns,
      monthlyTrend,
      departmentBreakdown,
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching payroll dashboard:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
