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
    let currentRuns: any[] = [];
    try {
      currentRuns = await prisma.payrollRun.findMany({
        where: {
          payrollPeriod: currentPeriod,
          ...(companyId ? { companyId } : {}),
        },
      });
    } catch {
      // PayrollRun table doesn't exist yet, return empty data
    }

    const totalGrossPay = currentRuns.reduce((s: number, r: any) => s + r.totalGrossPay, 0);
    const totalDeductions = currentRuns.reduce((s: number, r: any) => s + r.totalDeductions, 0);
    const totalNetPay = currentRuns.reduce((s: number, r: any) => s + r.totalNetPay, 0);
    const totalEmployerContrib = currentRuns.reduce((s: number, r: any) => s + r.totalEmployerContrib, 0);
    const totalEmployeesProcessed = currentRuns.reduce((s: number, r: any) => s + r.totalEmployees, 0);

    // 2. Pending approvals count
    let pendingApprovals = 0;
    try {
      pendingApprovals = await prisma.payrollRun.count({
        where: {
          runStatus: 'REVIEW',
          ...(companyId ? { companyId } : {}),
        },
      });
    } catch {
      // PayrollRun table doesn't exist yet, return 0
    }

    // 3. Active payroll holds count
    let activeHolds = 0;
    try {
      activeHolds = await prisma.payrollHold.count({
        where: { status: 'active' },
      });
    } catch {
      // PayrollHold table doesn't exist yet, return 0
    }

    // 4. Recent payroll runs (last 5)
    let recentRuns: any[] = [];
    try {
      recentRuns = await prisma.payrollRun.findMany({
        where: { ...(companyId ? { companyId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } catch {
      // PayrollRun table doesn't exist yet, return empty array
    }

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
      let runs: any[] = [];
      try {
        runs = await prisma.payrollRun.findMany({
          where: { payrollPeriod: period, ...(companyId ? { companyId } : {}) },
        });
      } catch {
        // PayrollRun table doesn't exist yet, skip this period
      }
      monthlyTrend.push({
        period,
        grossPay: runs.reduce((s: number, r: any) => s + r.totalGrossPay, 0),
        deductions: runs.reduce((s: number, r: any) => s + r.totalDeductions, 0),
        netPay: runs.reduce((s: number, r: any) => s + r.totalNetPay, 0),
        employerContrib: runs.reduce((s: number, r: any) => s + r.totalEmployerContrib, 0),
        employees: runs.reduce((s: number, r: any) => s + r.totalEmployees, 0),
      });
    }

    // 6. Department-wise salary breakdown
    let departments: any[] = [];
    try {
      departments = await prisma.department.findMany({
        where: { ...(companyId ? { companyId } : {}), status: 'active' },
        include: { employees: { where: { status: 'active' }, select: { id: true, salary: true } } },
      });
    } catch {
      // Department table doesn't exist yet, return empty breakdown
    }

    const departmentBreakdown = departments.map((dept: any) => ({
      departmentId: dept.id,
      departmentName: dept.name,
      headcount: dept.employees.length,
      totalSalary: dept.employees.reduce((s: number, e: any) => s + (e.salary || 0), 0),
      avgSalary: dept.employees.length > 0
        ? dept.employees.reduce((s: number, e: any) => s + (e.salary || 0), 0) / dept.employees.length
        : 0,
    })).sort((a: any, b: any) => b.totalSalary - a.totalSalary);

    // 7. Total active employees
    let totalActiveEmployees = 0;
    try {
      totalActiveEmployees = await prisma.employee.count({
        where: {
          status: 'active',
          ...(companyId ? { department: { companyId } } : {}),
        },
      });
    } catch {
      // Employee table doesn't exist yet, return 0
    }

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
