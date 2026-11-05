import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';

/**
 * Task 130 — Payslip release gate.
 *
 * The payroll manager (tenant admin / CEO / HR admin / admin) releases a
 * month's payslips; only then can employees download them (web + mobile PDF).
 *
 * POST /api/payroll/payslips/release
 *   body: { month: 10, year: 2026, action?: 'release' | 'revoke' }
 *
 * - action 'release' (default): stamps releasedAt/releasedById on every
 *   processed/paid payslip of that month for the selected company scope.
 * - action 'revoke': clears the stamps (payslips become non-downloadable
 *   again — used to pull back a mistaken release before pay day).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Payroll-head roles — the same set that governs payroll setup/processing. */
const PAYROLL_MANAGER_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    if (scope.scope !== 'all' || !PAYROLL_MANAGER_ROLES.includes(scope.role)) {
      return NextResponse.json(
        { error: 'Only the payroll manager can release payslips' },
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await request.json().catch(() => ({}));
    const month = parseInt(String(body?.month ?? ''), 10);
    const year = parseInt(String(body?.year ?? ''), 10);
    const action = body?.action === 'revoke' ? 'revoke' : 'release';

    if (!month || month < 1 || month > 12 || !year || year < 2000 || year > 2200) {
      return NextResponse.json(
        { error: 'A valid month and year are required to release payslips' },
        { status: 400, headers: corsHeaders },
      );
    }

    const where: Record<string, unknown> = {
      month,
      year,
      status: { in: ['processed', 'paid'] },
    };
    if (scope.companyId) {
      where.employee = { companyId: scope.companyId };
    }

    const data =
      action === 'release'
        ? { releasedAt: new Date(), releasedById: String(scope.userId || '') }
        : { releasedAt: null, releasedById: null };

    const result = await db.payroll.updateMany({ where, data });

    return NextResponse.json({
      data: {
        action,
        month,
        year,
        matched: result.count,
        releasedAt: data.releasedAt,
      },
      message:
        action === 'release'
          ? `${result.count} payslip${result.count === 1 ? '' : 's'} released — employees can now download them`
          : `${result.count} payslip${result.count === 1 ? '' : 's'} pulled back — downloads are locked again`,
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error releasing payslips:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : String(error)) },
      { status: 500, headers: corsHeaders },
    );
  }
}
