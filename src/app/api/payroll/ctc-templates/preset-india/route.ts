import { getDb, getPlatformDb } from '@/lib/tenant-db';
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

/**
 * POST /api/payroll/ctc-templates/preset-india
 * Creates the standard Indian CTC architecture template:
 *   Basic 40-50% of CTC (base for PF & Gratuity) · HRA (metro/non-metro
 *   exemption logic applies at tax time) · Special Allowance (balancing
 *   plug, fully taxable) · Perquisites & Reimbursements (LTA, Fuel,
 *   Driver, Gadgets — non-taxable up to bills) · statutory mappings.
 * Body: { companyId, name?, basicPct?, hraPctOfBasic?, ctcType?, metro? }
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const userRole = (decoded as Record<string, unknown>).role as string;
    if (!['super_admin', 'tenant_admin', 'admin'].includes(userRole)) {
      return Response.json({ error: 'Only admins can create CTC templates' }, { status: 403, headers: corsHeaders });
    }

    const body = await request.json();
    const companyId = body.companyId;
    if (!companyId) return Response.json({ error: 'companyId is required' }, { status: 400, headers: corsHeaders });

    const basicPct = Number(body.basicPct) || 40;           // % of CTC (40–50 recommended)
    const hraPctOfBasic = Number(body.hraPctOfBasic) || 50; // metro 50 / non-metro 40
    const name = body.name || `India Standard CTC (Basic ${basicPct}% · HRA ${hraPctOfBasic}% Basic)`;

    const template = await db.cTCTemplate.create({
      data: {
        name,
        countryCode: 'IND',
        currencyCode: 'INR',
        ctcType: body.ctcType || 'ANNUAL',
        status: 'DRAFT',
        isDefault: body.makeDefault === true,
        basePayPct: basicPct,
        createdBy: (decoded as Record<string, unknown>).userId as string,
        companyId,
        componentMappings: {
          create: [
            // Core taxable earnings
            { componentName: 'BASIC', componentCategory: 'EARNING', allocationMethod: 'PERCENTAGE_OF_CTC', allocationValue: basicPct, calculationSequence: 1, isTaxable: true, frequency: 'MONTHLY', prorationRule: 'CALENDAR_DAYS' },
            { componentName: 'HRA', componentCategory: 'EARNING', allocationMethod: 'PERCENTAGE_OF_COMPONENT', baseComponentId: 'BASIC', allocationValue: hraPctOfBasic, calculationSequence: 2, isTaxable: true, taxExemptionLimit: 0, frequency: 'MONTHLY', prorationRule: 'CALENDAR_DAYS' },
            // Statutory allowances
            { componentName: 'DA', componentCategory: 'EARNING', allocationMethod: 'PERCENTAGE_OF_COMPONENT', baseComponentId: 'BASIC', allocationValue: 0, calculationSequence: 3, isTaxable: true, frequency: 'MONTHLY' },
            { componentName: 'CONVEYANCE', componentCategory: 'EARNING', allocationMethod: 'FIXED_AMOUNT', allocationValue: 1600, calculationSequence: 4, isTaxable: true, frequency: 'MONTHLY' },
            { componentName: 'MEDICAL', componentCategory: 'EARNING', allocationMethod: 'FIXED_AMOUNT', allocationValue: 1250, calculationSequence: 5, isTaxable: true, frequency: 'MONTHLY' },
            // Reimbursements — non-taxable up to bills submitted
            { componentName: 'LTA', componentCategory: 'REIMBURSEMENT', allocationMethod: 'FIXED_AMOUNT', allocationValue: 15000, calculationSequence: 6, isTaxable: false, frequency: 'ANNUAL' },
            { componentName: 'FUEL_REIMBURSEMENT', componentCategory: 'REIMBURSEMENT', allocationMethod: 'FIXED_AMOUNT', allocationValue: 0, calculationSequence: 7, isTaxable: false, frequency: 'MONTHLY' },
            { componentName: 'DRIVER_SALARY', componentCategory: 'REIMBURSEMENT', allocationMethod: 'FIXED_AMOUNT', allocationValue: 0, calculationSequence: 8, isTaxable: false, frequency: 'MONTHLY' },
            { componentName: 'GADGETS_REIMBURSEMENT', componentCategory: 'REIMBURSEMENT', allocationMethod: 'FIXED_AMOUNT', allocationValue: 0, calculationSequence: 9, isTaxable: false, frequency: 'ANNUAL' },
            { componentName: 'BOOKS_PERIODICALS', componentCategory: 'REIMBURSEMENT', allocationMethod: 'FIXED_AMOUNT', allocationValue: 0, calculationSequence: 10, isTaxable: false, frequency: 'ANNUAL' },
            // Employer statutory contributions (cost, not employee payout)
            { componentName: 'EPF_ER', componentCategory: 'EMPLOYER_CONTRIBUTION', allocationMethod: 'PERCENTAGE_OF_COMPONENT', baseComponentId: 'BASIC', allocationValue: 12, calculationSequence: 11, isStatutory: true, isTaxable: false, frequency: 'MONTHLY' },
            { componentName: 'ESI_ER', componentCategory: 'EMPLOYER_CONTRIBUTION', allocationMethod: 'PERCENTAGE_OF_CTC', allocationValue: 3.25, calculationSequence: 12, isStatutory: true, isTaxable: false, frequency: 'MONTHLY' },
            { componentName: 'GRATUITY_PROVISION', componentCategory: 'EMPLOYER_CONTRIBUTION', allocationMethod: 'PERCENTAGE_OF_COMPONENT', baseComponentId: 'BASIC', allocationValue: 4.81, calculationSequence: 13, isStatutory: true, isTaxable: false, frequency: 'MONTHLY' },
          ],
        },
      },
      include: { componentMappings: true },
    });

    return Response.json({
      data: template,
      message: `India CTC preset created: Basic ${basicPct}% of CTC, HRA ${hraPctOfBasic}% of Basic (metro exemption logic applies at tax time), Special Allowance balancing component auto-computed at run time, reimbursements non-taxable up to bills, employer EPF 12% + gratuity provision 4.81% mapped. Template is DRAFT — activate from the CTC Templates page.`,
    }, { status: 201, headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error creating India CTC preset:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
