import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { PT_STATE_TABLES, LWF_STATE_TABLES } from '@/lib/payroll/india';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** India statutory configuration for a company (single row per company, auto-created on first GET). */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    let companyId: string | null = searchParams.get('companyId');
    if (!companyId) {
      const firstCompany = await db.company.findFirst({ select: { id: true } });
      companyId = firstCompany?.id || null;
    }
    if (!companyId) return Response.json({ error: 'companyId is required (no companies found)' }, { status: 400, headers: corsHeaders });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    let config = null;
    try {
      config = await dbAny.payrollStatutoryConfig.findUnique({ where: { companyId } });
    } catch {
      return Response.json({ error: 'PayrollStatutoryConfig table not available — run schema sync first' }, { status: 503, headers: corsHeaders });
    }
    if (!config) {
      // Auto-provision with statutory defaults
      config = await dbAny.payrollStatutoryConfig.create({ data: { companyId } });
    }

    return Response.json({
      data: config,
      reference: {
        ptStates: Object.keys(PT_STATE_TABLES),
        lwfStates: Object.keys(LWF_STATE_TABLES),
        notes: {
          EPF: '12% EE + 12% ER on Basic+DA. Statutory ceiling ₹15,000/month (EPS share 8.33% of wage). Set pfOnActualBasic=true to contribute on full Basic+DA.',
          ESIC: '0.75% EE + 3.25% ER when gross ≤ ₹21,000/month (₹25,000 for persons with disability).',
          PT: 'State slabs — e.g. Maharashtra max ₹2,500/yr (₹300 in Feb); Karnataka ₹200/month above ₹25,000.',
          LWF: 'Half-yearly states remit in June & December.',
          TDS: 'New regime is the default; employees elect OLD via the Income Tax Declaration. Verified proofs drive the Feb–Mar true-up.',
        },
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching statutory config:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const userRole = (decoded as Record<string, unknown>).role as string;
    if (!['super_admin', 'tenant_admin', 'admin'].includes(userRole)) {
      return Response.json({ error: 'Only admins can update statutory configuration' }, { status: 403, headers: corsHeaders });
    }

    const body = await request.json();
    if (!body.companyId) return Response.json({ error: 'companyId is required' }, { status: 400, headers: corsHeaders });

    const updatable = {
      ptState: body.ptState,
      lwfState: body.lwfState,
      pfOnActualBasic: body.pfOnActualBasic,
      pfWageCeiling: body.pfWageCeiling,
      pfAdminCharges: body.pfAdminCharges,
      esiEnabled: body.esiEnabled,
      esiWageLimit: body.esiWageLimit,
      tdsRegimeDefault: body.tdsRegimeDefault,
      declarationWindowMonth: body.declarationWindowMonth,
      proofWindowMonth: body.proofWindowMonth,
      proofDeadlineMonth: body.proofDeadlineMonth,
      tdsAdjustFromMonth: body.tdsAdjustFromMonth,
      varianceThresholdPct: body.varianceThresholdPct,
      notes: body.notes,
      updatedBy: (decoded as Record<string, unknown>).userId as string,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clean = Object.fromEntries(Object.entries(updatable).filter(([, v]) => v !== undefined && v !== null && v !== ''));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    const existing = await dbAny.payrollStatutoryConfig.findUnique({ where: { companyId: body.companyId } });
    const config = existing
      ? await dbAny.payrollStatutoryConfig.update({ where: { companyId: body.companyId }, data: clean })
      : await dbAny.payrollStatutoryConfig.create({ data: { companyId: body.companyId, ...clean } });

    return Response.json({ data: config, message: 'India statutory configuration saved' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error saving statutory config:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
