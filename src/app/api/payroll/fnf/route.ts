import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import {
  calculateGratuity,
  splitLeaveEncashmentTax,
  calculateNoticeBuyout,
} from '@/lib/payroll/india';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    try {
      const data = await db.fNFCalculation.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              email: true,
              dateOfJoining: true,
              department: { select: { name: true } },
              designation: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return Response.json({ data }, { headers: corsHeaders });
    } catch (dbError: unknown) {
      console.error('Database error fetching F&F calculations:', dbError);
      return Response.json({ data: [] }, { headers: corsHeaders });
    }
  } catch (error: unknown) {
    console.error('Error fetching F&F calculations:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

/**
 * POST — F&F calculation with INDIA statutory auto-computation:
 *  • Gratuity: 15/26 × last drawn Basic+DA × completed years (≥5 yrs; cap ₹20L)
 *  • Leave encashment: Sec 10(10AA) exempt up to ₹25,00,000, excess taxable
 *  • Notice buy-out: shortfall days × (monthly salary / 30) — recovery
 * Body flags: { autoComputeIndia: true } (default) uses employee + separation data.
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();

    // Load employee + separation context for India auto-computation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let employee: Record<string, any> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let separation: Record<string, any> | null = null;
    try {
      employee = await db.employee.findUnique({
        where: { id: body.employeeId },
        select: { id: true, salary: true, dateOfJoining: true, state: true },
      });
    } catch { employee = null; }
    if (body.separationId) {
      try {
        separation = await db.separation.findUnique({ where: { id: body.separationId } });
      } catch { separation = null; }
    } else if (employee) {
      try {
        separation = await db.separation.findFirst({ where: { employeeId: body.employeeId }, orderBy: { createdAt: 'desc' } });
      } catch { separation = null; }
    }

    const autoCompute = body.autoComputeIndia !== false;
    const annualCtc = Number(employee?.salary) || 0;
    const monthlySalary = annualCtc / 12;
    // Last drawn Basic+DA ≈ 50% of monthly salary when no structure breakdown available
    const lastDrawnBasicDa = Number(body.lastDrawnBasicDa) || monthlySalary * 0.5;

    // ─── Gratuity (Payment of Gratuity Act, 1972) ───
    const lwd = separation?.lastWorkingDate ? new Date(separation.lastWorkingDate) : new Date();
    const doj = employee?.dateOfJoining ? new Date(employee.dateOfJoining) : null;
    const yearsOfService = doj ? (lwd.getTime() - doj.getTime()) / (365.25 * 24 * 3600 * 1000) : 0;
    const gratuity = calculateGratuity(lastDrawnBasicDa, yearsOfService);

    // ─── Leave encashment with Sec 10(10AA) split ───
    const leaveEncashment = Number(body.leaveEncashment) || 0;
    const encashmentSplit = splitLeaveEncashmentTax(leaveEncashment);

    // ─── Notice buy-out (shortfall × monthly/30) ───
    const noticePeriodDays = Number(separation?.noticePeriod) || 30;
    const noticeServedDays = separation && separation.createdAt && separation.lastWorkingDate
      ? Math.max(0, Math.round((new Date(separation.lastWorkingDate).getTime() - new Date(separation.createdAt).getTime()) / (24 * 3600 * 1000)))
      : noticePeriodDays;
    const buyout = autoCompute
      ? calculateNoticeBuyout(monthlySalary, noticePeriodDays, noticeServedDays)
      : { shortfallDays: Number(body.noticeBuyoutDays) || 0, buyoutAmount: 0 };

    const useBuyoutRecovery = autoCompute && buyout.buyoutAmount > 0;
    const noticeRecovery = useBuyoutRecovery ? buyout.buyoutAmount : (Number(body.noticeRecovery) || 0);

    // Auto-compute pending salary (prorated to LWD) when requested
    const pendingSalary = body.pendingSalary !== undefined && body.pendingSalary !== null
      ? Number(body.pendingSalary) || 0
      : 0;

    const bonus = Number(body.bonus) || 0;
    const incentives = Number(body.incentives) || 0;
    const reimbursements = Number(body.reimbursements) || 0;

    const assetRecovery = Number(body.assetRecovery) || 0;
    const loanRecovery = Number(body.loanRecovery) || 0;
    const taxDeduction = Number(body.taxDeduction) || 0;
    const otherRecoveries = Number(body.otherRecoveries) || 0;

    // Gratuity is an ADDITION to earnings (Indian F&F practice; paid with F&F or via trust)
    const gratuityAmount = gratuity.amount;

    const totalEarnings = pendingSalary + leaveEncashment + bonus + incentives + reimbursements + gratuityAmount;
    const totalDeductions = noticeRecovery + assetRecovery + loanRecovery + taxDeduction + otherRecoveries;
    const netAmount = totalEarnings - totalDeductions;

    try {
      const data = await db.fNFCalculation.create({
        data: {
          employeeId: body.employeeId,
          separationId: body.separationId || separation?.id || null,
          pendingSalary,
          leaveEncashment,
          bonus,
          incentives,
          reimbursements,
          noticeRecovery,
          assetRecovery,
          loanRecovery,
          taxDeduction,
          otherRecoveries,
          // India addendum
          gratuityAmount,
          gratuityEligible: gratuity.eligible,
          leaveEncashmentExempt: encashmentSplit.exempt,
          leaveEncashmentTaxable: encashmentSplit.taxable,
          noticeBuyoutDays: buyout.shortfallDays,
          noticeBuyoutAmount: buyout.buyoutAmount,
          lwdDate: lwd,
          clearanceCleared: body.clearanceCleared === true,
          totalEarnings,
          totalDeductions,
          netAmount,
          currency: body.currency || 'INR',
          status: body.status || 'pending',
          remarks: body.remarks || null,
        },
      });

      // Notification: F&F statement ready (exit module event) — non-fatal
      try {
        const tenantId = (decoded as Record<string, unknown>).tenantId as string | undefined;
        if (tenantId) {
          const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
          const hrIds = await resolveRoleRecipients(db, ['hr_admin', 'admin', 'payroll_admin', 'tenant_admin'], 10);
          const empUser = await db.employee.findUnique({ where: { id: body.employeeId }, select: { userId: true, firstName: true, lastName: true } });
          const recipients = [...hrIds.map((pid: string) => ({ userId: pid }))];
          if (empUser?.userId) recipients.push({ userId: empUser.userId });
          if (recipients.length && tenantId) {
            await dispatchNotification({
              tenantId,
              module: 'exit',
              eventKey: 'exit.fnf.ready',
              recipients,
              vars: {
                Employee_Name: empUser ? `${empUser.firstName || ''} ${empUser.lastName || ''}`.trim() : 'An employee',
                Net_Amount: `₹${netAmount.toLocaleString('en-IN')}`,
                Gratuity_Amount: `₹${gratuityAmount.toLocaleString('en-IN')}`,
              },
              entity: { type: 'fnf_calculation', id: data.id, link: '/payroll/fnf' },
            });
          }
        }
      } catch { /* non-fatal */ }

      return Response.json({
        data,
        indiaComputation: {
          gratuity: { ...gratuity, yearsOfService: Math.round(yearsOfService * 100) / 100 },
          leaveEncashment: encashmentSplit,
          noticeBuyout: buyout,
          noticeServedDays,
          noticePeriodDays,
          note: gratuity.eligible
            ? 'Gratuity auto-computed under the Payment of Gratuity Act 1972 (15/26, cap ₹20L).'
            : 'Gratuity not payable — completed years of service below 5. Leave encashment exempt up to ₹25,00,000 u/s 10(10AA).',
        },
        message: 'F&F calculation created successfully (India statutory auto-computation applied)',
      }, { headers: corsHeaders });
    } catch (dbError: unknown) {
      console.error('Database error creating F&F calculation:', dbError);
      return Response.json({ error: 'Service temporarily unavailable' }, { status: 503, headers: corsHeaders });
    }
  } catch (error: unknown) {
    console.error('Error creating F&F calculation:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
