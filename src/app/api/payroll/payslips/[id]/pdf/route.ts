import { NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { buildPayslipPdf } from '@/lib/payslip-pdf';

/**
 * Task 130 — Official payslip PDF download (released MARQAI format, with logo).
 *
 * GET /api/payroll/payslips/[id]/pdf
 *
 * Release gate:
 * - employees (scope 'self'): only their OWN payslip AND only after the
 *   payroll manager released it (releasedAt set) → otherwise 403.
 * - managers (scope 'team'): released payslips of their direct reports only.
 * - payroll managers / admins (scope 'all'): always allowed (they must be
 *   able to verify the document BEFORE releasing it).
 *
 * Response: application/pdf (Content-Disposition: attachment).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

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
            city: true,
            dateOfJoining: true,
            status: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
            companyId: true,
          },
        },
      },
    });

    if (!payroll) {
      return Response.json({ error: 'Payroll record not found' }, { status: 404, headers: corsHeaders });
    }

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

    // ── Release gate: employees / managers can only download RELEASED payslips ──
    const isPayrollManager = scope.scope === 'all';
    if (!isPayrollManager && !payroll.releasedAt) {
      return Response.json(
        { error: 'Payslip not released yet — it will be available for download once the payroll manager releases it' },
        { status: 403, headers: corsHeaders },
      );
    }

    // Only finalized payslips carry official figures
    if (!['processed', 'paid'].includes(payroll.status)) {
      return Response.json(
        { error: 'Payslip is not finalized yet (still in draft)' },
        { status: 403, headers: corsHeaders },
      );
    }

    // ── Company header data ──
    const company = payroll.employee.companyId
      ? await db.company.findUnique({
          where: { id: payroll.employee.companyId },
          select: { name: true, address: true, city: true, state: true, zipCode: true, logo: true },
        })
      : null;

    // Logo: remote JPEG logo is fetched; the MarqAI mark is embedded and
    // resolved by company name inside the PDF builder. PNGs are rejected —
    // jsPDF's RGBA-PNG path inflates the PDF (~1 MB) when a TTF is embedded.
    let logoB64: string | null = null;
    if (company?.logo && /^https?:\/\//.test(company.logo) && /\.jpe?g(\?|$)/i.test(company.logo)) {
      try {
        const res = await fetch(company.logo);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 1_500_000) logoB64 = buf.toString('base64');
        }
      } catch { /* keep the fallback */ }
    }

    const location =
      payroll.employee.city ||
      payroll.employee.branch?.name ||
      company?.city ||
      '—';

    const pdfBuffer = await buildPayslipPdf({
      monthName: monthNames[payroll.month - 1] || String(payroll.month),
      year: payroll.year,
      company: {
        name: company?.name || '3Boxes HRMS',
        address: company?.address,
        city: company?.city,
        state: company?.state,
        zipCode: company?.zipCode,
      },
      logoB64,
      employee: {
        name: `${payroll.employee.firstName} ${payroll.employee.lastName}`.trim(),
        employeeCode: payroll.employee.employeeId,
        designation: payroll.employee.designation?.title,
        department: payroll.employee.department?.name,
        dateOfJoining: payroll.employee.dateOfJoining,
        location,
      },
      earnings: [
        { label: 'Basic Salary', amount: payroll.basicSalary },
        { label: 'HRA', amount: payroll.hra },
        { label: 'Dearness Allowance', amount: payroll.da },
        { label: 'Conveyance Allowance', amount: payroll.conveyance },
        { label: 'Medical Allowance', amount: payroll.medical },
        { label: 'Other Allowances', amount: payroll.otherAllowances },
      ],
      deductions: [
        { label: 'Provident Fund', amount: payroll.pf },
        { label: 'ESI', amount: payroll.esi },
        { label: 'Income Tax', amount: payroll.tax },
        { label: 'Professional Tax', amount: payroll.professionalTax },
        { label: 'Loss of Pay', amount: payroll.lopDeduction },
        { label: 'Other Deductions', amount: payroll.otherDeductions },
      ],
      totalEarnings: payroll.grossSalary,
      totalDeductions: payroll.totalDeductions,
      netPay: payroll.netSalary,
      effectiveWorkDays: payroll.paidDays || 0,
      daysInMonth: payroll.totalDays || 0,
      currency: payroll.currency,
    });

    const fileName = `Payslip-${monthNames[payroll.month - 1]}-${payroll.year}-${(payroll.employee.employeeId || 'employee').replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Error generating payslip PDF:', error);
    return Response.json(
      { error: (error instanceof Error ? error.message : String(error)) },
      { status: 500, headers: corsHeaders },
    );
  }
}
