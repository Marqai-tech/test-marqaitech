import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // Task 130: scope + release gating — employees see their own payslip only,
    // and only after the payroll manager released it.
    const scope = await resolveCompanyScope(request);
    if (!scope) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const payroll = await db.payroll.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            dateOfJoining: true,
            panNumber: true,
            aadhaarNumber: true,
            bankName: true,
            bankAccountNo: true,
            bankIfscCode: true,
            salary: true,
            companyId: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        },
      },
    });

    if (!payroll) return Response.json({ error: 'Payroll record not found' }, { status: 404, headers: corsHeaders });

    // ── Visibility gate (mirrors the payslip list scoping) ──
    if (scope.scope === 'self') {
      if (payroll.employee.userId !== scope.userId) {
        return Response.json({ error: 'Access denied' }, { status: 403, headers: corsHeaders });
      }
    } else if (scope.scope === 'team') {
      if (!scope.visibleEmployeeIds.includes(payroll.employeeId)) {
        return Response.json({ error: 'Access denied: not your direct report' }, { status: 403, headers: corsHeaders });
      }
    }

    // ── Release gate: staff/manager views require a released payslip ──
    if (scope.scope !== 'all' && !payroll.releasedAt) {
      return Response.json(
        { error: 'Payslip not released yet — it will be available once the payroll manager releases it' },
        { status: 403, headers: corsHeaders },
      );
    }

    // Real company header for the payslip (falls back to defaults)
    const company = payroll.employee.companyId
      ? await db.company.findUnique({ where: { id: payroll.employee.companyId }, select: { name: true, address: true, city: true, state: true, country: true, phone: true, email: true } })
      : null;
    const companyAddress = company
      ? [company.address, company.city, company.state, company.country].filter(Boolean).join(', ')
      : '';

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const payslipDetail = {
      payrollId: payroll.id,
      payslipNo: `PSL-${payroll.year}${String(payroll.month).padStart(2, '0')}-${payroll.employeeId}`,
      period: {
        month: payroll.month,
        year: payroll.year,
        monthName: monthNames[payroll.month - 1],
      },
      company: {
        name: company?.name || '3Boxes HRMS',
        address: companyAddress,
        phone: company?.phone || '',
        email: company?.email || '',
      },
      employee: {
        employeeId: payroll.employee.employeeId,
        name: `${payroll.employee.firstName} ${payroll.employee.lastName}`,
        email: payroll.employee.email,
        phone: payroll.employee.phone,
        department: payroll.employee.department?.name,
        designation: payroll.employee.designation?.title,
        dateOfJoining: payroll.employee.dateOfJoining,
        panNumber: payroll.employee.panNumber,
        aadhaarNumber: payroll.employee.aadhaarNumber,
        bankName: payroll.employee.bankName,
        bankAccountNo: payroll.employee.bankAccountNo,
        bankIfscCode: payroll.employee.bankIfscCode,
      },
      earnings: {
        basicSalary: payroll.basicSalary,
        hra: payroll.hra,
        da: payroll.da,
        conveyance: payroll.conveyance,
        medical: payroll.medical,
        otherAllowances: payroll.otherAllowances,
        grossSalary: payroll.grossSalary,
      },
      deductions: {
        pf: payroll.pf,
        esi: payroll.esi,
        tax: payroll.tax,
        professionalTax: payroll.professionalTax,
        otherDeductions: payroll.otherDeductions,
        totalDeductions: payroll.totalDeductions,
      },
      netPay: payroll.netSalary,
      currency: payroll.currency,
      status: payroll.status,
      paidDate: payroll.paidDate,
      paySlip: payroll.paySlip,
      // Task 130: release state surfaced to the clients
      releasedAt: payroll.releasedAt,
      released: !!payroll.releasedAt,
      // Task 123: attendance integration (days + LOP + processing mode)
      totalDays: payroll.totalDays || 0,
      paidDays: payroll.paidDays || 0,
      lopDays: payroll.lopDays || 0,
      attendance: (() => { try { return payroll.attendanceJson ? JSON.parse(payroll.attendanceJson) : null; } catch { return null; } })(),
      processingMode: payroll.processingMode,
      processedAt: payroll.processedAt,
      createdAt: payroll.createdAt,
      updatedAt: payroll.updatedAt,
    };

    return Response.json({ data: payslipDetail }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching payslip detail:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
