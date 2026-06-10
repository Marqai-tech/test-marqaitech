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
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const companyId = searchParams.get('companyId');
    const departmentId = searchParams.get('departmentId');
    const mode = searchParams.get('mode') || 'summary'; // summary | detailed

    if (!month || !year) {
      return Response.json({ error: 'month and year are required' }, { status: 400, headers: corsHeaders });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Build employee filter
    const employeeWhere: Record<string, unknown> = {};
    if (departmentId) {
      employeeWhere.departmentId = departmentId;
    } else if (companyId) {
      employeeWhere.department = { companyId };
    }

    // Fetch payroll records for the given period
    const payrolls = await prisma.payroll.findMany({
      where: { month: monthNum, year: yearNum },
      include: {
        employee: {
          include: {
            department: { select: { name: true, id: true, companyId: true } },
            designation: { select: { title: true } },
          },
        },
      },
    });

    // Also try payroll run transaction lines for richer data
    const periodStr = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    let payrollRuns: { id: string }[] = [];
    try {
      payrollRuns = await prisma.payrollRun.findMany({
        where: {
          payrollPeriod: periodStr,
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true },
      });
    } catch (prismaError: unknown) {
      console.warn('PayrollRun table not available, skipping:', prismaError instanceof Error ? prismaError.message : String(prismaError));
      payrollRuns = [];
    }

    const runIds = payrollRuns.map(r => r.id);

    // Get transaction lines if payroll runs exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let transactionLines: any[] = [];
    if (runIds.length > 0) {
      try {
        const tlWhere: Record<string, unknown> = {
          payrollRunId: { in: runIds },
          isReversal: false,
        };
        if (departmentId) {
          tlWhere.employee = { departmentId };
        } else if (companyId) {
          tlWhere.employee = { department: { companyId } };
        }

        transactionLines = await prisma.payrollTransactionLine.findMany({
          where: tlWhere,
          include: {
            employee: {
              include: {
                department: { select: { name: true, id: true, companyId: true } },
                designation: { select: { title: true } },
              },
            },
            component: { select: { code: true, name: true, componentType: true } },
          },
        });
      } catch (prismaError: unknown) {
        console.warn('PayrollTransactionLine table not available, skipping:', prismaError instanceof Error ? prismaError.message : String(prismaError));
        transactionLines = [];
      }
    }

    // Build salary register data
    const registerMap: Record<string, {
      employeeId: string;
      name: string;
      empCode: string;
      department: string;
      designation: string;
      earnings: Record<string, number>;
      deductions: Record<string, number>;
      employerContrib: Record<string, number>;
      grossPay: number;
      totalDeductions: number;
      netPay: number;
      totalEmployerContrib: number;
    }> = {};

    // If we have transaction lines, use those (more detailed)
    if (transactionLines.length > 0) {
      for (const line of transactionLines) {
        const emp = line.employee;
        if (!emp) continue;

        if (!registerMap[emp.id]) {
          registerMap[emp.id] = {
            employeeId: emp.id,
            name: `${emp.firstName} ${emp.lastName}`,
            empCode: emp.employeeId,
            department: emp.department?.name || '—',
            designation: emp.designation?.title || '—',
            earnings: {},
            deductions: {},
            employerContrib: {},
            grossPay: 0,
            totalDeductions: 0,
            netPay: 0,
            totalEmployerContrib: 0,
          };
        }

        const reg = registerMap[emp.id];
        const compCode = line.componentCode || (line.component?.code) || 'UNKNOWN';
        const compName = line.component?.name || compCode;
        const label = mode === 'detailed' ? `${compName} (${compCode})` : compCode;

        if (line.componentType === 'EARNING') {
          reg.earnings[label] = (reg.earnings[label] || 0) + line.finalAmount;
          reg.grossPay += line.finalAmount;
        } else if (line.componentType === 'DEDUCTION' || line.componentType === 'EMPLOYEE_CONTRIB') {
          reg.deductions[label] = (reg.deductions[label] || 0) + line.finalAmount;
          reg.totalDeductions += line.finalAmount;
        } else if (line.componentType === 'EMPLOYER_CONTRIB') {
          reg.employerContrib[label] = (reg.employerContrib[label] || 0) + line.finalAmount;
          reg.totalEmployerContrib += line.finalAmount;
        }
      }

      // Calculate net pay
      for (const reg of Object.values(registerMap)) {
        reg.netPay = reg.grossPay - reg.totalDeductions;
      }
    } else {
      // Fall back to Payroll model data
      for (const payroll of payrolls) {
        const emp = payroll.employee;
        // Apply department/company filter
        if (departmentId && emp.departmentId !== departmentId) continue;
        if (companyId && emp.department?.companyId !== companyId) continue;

        registerMap[emp.id] = {
          employeeId: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          empCode: emp.employeeId,
          department: emp.department?.name || '—',
          designation: emp.designation?.title || '—',
          earnings: {
            'Basic Salary': payroll.basicSalary,
            'HRA': payroll.hra,
            'DA': payroll.da,
            'Conveyance': payroll.conveyance,
            'Medical': payroll.medical,
            'Other Allowances': payroll.otherAllowances,
          },
          deductions: {
            'PF': payroll.pf,
            'ESI': payroll.esi,
            'Tax': payroll.tax,
            'Professional Tax': payroll.professionalTax,
            'Other Deductions': payroll.otherDeductions,
          },
          employerContrib: {},
          grossPay: payroll.grossSalary,
          totalDeductions: payroll.totalDeductions,
          netPay: payroll.netSalary,
          totalEmployerContrib: 0,
        };
      }
    }

    const registerData = Object.values(registerMap).sort((a, b) => a.name.localeCompare(b.name));

    // Summary totals
    const summary = {
      totalEmployees: registerData.length,
      totalGrossPay: registerData.reduce((s, r) => s + r.grossPay, 0),
      totalDeductions: registerData.reduce((s, r) => s + r.totalDeductions, 0),
      totalNetPay: registerData.reduce((s, r) => s + r.netPay, 0),
      totalEmployerContrib: registerData.reduce((s, r) => s + r.totalEmployerContrib, 0),
    };

    return Response.json({
      data: registerData,
      summary,
      period: periodStr,
      mode,
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error generating salary register:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
