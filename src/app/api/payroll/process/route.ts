import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { processPayrollForCompany } from '@/lib/payroll-engine';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

const PAYROLL_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

/**
 * Task 123 — Salary processing endpoint (attendance-integrated).
 *
 * POST /api/payroll/process
 * Body:
 *   month?, year?       target period (default = previous month)
 *   currentMonth?       process the running month instead of the previous one
 *   backfill?           fill every missing month from earliest DOJ → target
 *   employeeIds?        limit to specific employees
 *   force?              recompute over existing rows
 *   mode?               'auto' | 'manual' (default: company PayrollSettings)
 *
 * The payroll head (HR/tenant admin) triggers this from Payroll Settings —
 * with mode=auto the same behaviour runs monthly via
 * /api/cron/payroll-auto-process.
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const role = (decoded as Record<string, unknown>).role as string;
    if (!PAYROLL_ROLES.includes(role)) {
      return Response.json({ error: 'Only payroll admins can process salary' }, { status: 403, headers: corsHeaders });
    }

    const scope = await resolveCompanyScope(request);
    if (!scope || !scope.companyId) {
      return Response.json({ error: 'Select a company context first' }, { status: 400, headers: corsHeaders });
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === 'auto' || body.mode === 'manual' ? body.mode : undefined;

    const result = await processPayrollForCompany(db, {
      companyId: scope.companyId,
      month: body.month ? Number(body.month) : undefined,
      year: body.year ? Number(body.year) : undefined,
      currentMonth: Boolean(body.currentMonth),
      backfill: body.backfill !== false, // default ON — fills this + past months
      employeeIds: Array.isArray(body.employeeIds) ? body.employeeIds : undefined,
      force: Boolean(body.force),
      processingMode: mode,
      processedBy: (decoded as Record<string, unknown>).userId as string,
    });

    await db.auditLog.create({
      data: {
        userId: (decoded as Record<string, unknown>).userId as string,
        action: result.mode === 'auto' ? 'PAYROLL_AUTO_PROCESS' : 'PAYROLL_MANUAL_PROCESS',
        module: 'payroll',
        details: `Processed salary for ${result.targetPeriod} (backfill) — created ${result.created}, skipped ${result.skipped}, failed ${result.failed}, gross ₹${result.totalGross}, net ₹${result.totalNet}`,
      },
    });

    return Response.json({ data: result, message: `Salary processed: ${result.created} payslip(s) created, ${result.skipped} skipped` }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Process payroll error:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

/** GET: preview what would be processed (settings + employee count). */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const scope = await resolveCompanyScope(request);
    if (!scope || !scope.companyId) return Response.json({ error: 'Select a company context first' }, { status: 400, headers: corsHeaders });

    const settings = await db.payrollSettings.findUnique({ where: { companyId: scope.companyId } });
    const employeeCount = await db.employee.count({
      where: { companyId: scope.companyId, status: 'active', OR: [{ salaryStructureId: { not: null } }, { salary: { gt: 0 } }] },
    });
    const processedCount = await db.payroll.count({
      where: { employee: { companyId: scope.companyId }, status: { in: ['processed', 'paid'] } },
    });

    return Response.json({
      data: {
        settings,
        employees: employeeCount,
        existingPayslips: processedCount,
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Payroll process preview error:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
