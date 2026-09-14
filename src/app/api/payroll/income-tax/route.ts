import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import {
  computeIndiaTaxBothRegimes,
  calculateHRAExemption,
  financialYearFor,
  type AgeGroup,
  type FY,
} from '@/lib/payroll/india';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const {
      annualGrossIncome,
      ageGroup = 'BELOW_60',
      regime = 'NEW',
      financialYear,
      // Old regime deductions
      section80C = 0,
      section80D = 0,
      section80CCD = 0,
      section24b = 0,
      hraActual = 0,
      hraRentPaid = 0,
      hraIsMetro = false,
      basicSalary = 0,
      section80E = 0,
      section80G = 0,
      section80TTA = 0,
      otherDeductions = 0,
    } = body;

    if (!annualGrossIncome || annualGrossIncome <= 0) {
      return Response.json({ error: 'Annual gross income is required' }, { status: 400, headers: corsHeaders });
    }

    const fy: FY = financialYear && financialYear.includes('-') ? financialYear : financialYearFor(new Date().getMonth() + 1, new Date().getFullYear());

    // HRA exemption — least-of-three (Section 10(13A)); annualized
    const hraExemptionMonthly = calculateHRAExemption(hraActual / 12, basicSalary / 12, hraRentPaid / 12, hraIsMetro);
    const hraExemption = hraExemptionMonthly.exempt * 12;

    const both = computeIndiaTaxBothRegimes({
      annualGross: annualGrossIncome,
      ageGroup: ageGroup as AgeGroup,
      fy,
      oldDeductions: {
        section80C,
        section80D,
        section80CCD1B: section80CCD,
        section24b,
        hraExemption,
        section80E,
        section80G,
        section80TTA,
        otherExempt: otherDeductions,
      },
    });

    const selected = regime === 'OLD' ? both.oldRegime : both.newRegime;

    const result = {
      annualGrossIncome,
      ageGroup,
      selectedRegime: regime,
      financialYear: fy,
      newRegime: {
        standardDeduction: both.newRegime.totalDeductions,
        totalDeductions: both.newRegime.totalDeductions,
        taxableIncome: both.newRegime.taxableIncome,
        tax: both.newRegime.taxOnSlabs,
        rebate87A: both.newRegime.rebate87A,
        surcharge: both.newRegime.surcharge,
        marginalRelief: both.newRegime.marginalRelief,
        cess: both.newRegime.cess,
        totalTax: both.newRegime.totalTax,
        monthlyTDS: Math.round(both.newRegime.totalTax / 12),
        slabBreakdown: both.newRegime.slabBreakdown,
      },
      oldRegime: {
        standardDeduction: 50000,
        hraExemption,
        section80C: Math.min(section80C, 150000),
        section80D: Math.min(section80D, ageGroup === 'BELOW_60' ? 25000 : 50000),
        section80CCD: Math.min(section80CCD, 50000),
        section24b: Math.min(section24b, 200000),
        section80E,
        section80G,
        section80TTA: Math.min(section80TTA, 10000),
        otherDeductions,
        totalDeductions: both.oldRegime.totalDeductions,
        taxableIncome: both.oldRegime.taxableIncome,
        tax: both.oldRegime.taxOnSlabs,
        rebate87A: both.oldRegime.rebate87A,
        surcharge: both.oldRegime.surcharge,
        marginalRelief: both.oldRegime.marginalRelief,
        cess: both.oldRegime.cess,
        totalTax: both.oldRegime.totalTax,
        monthlyTDS: Math.round(both.oldRegime.totalTax / 12),
      },
      selected: {
        taxableIncome: selected.taxableIncome,
        totalTax: selected.totalTax,
        monthlyTDS: Math.round(selected.totalTax / 12),
        appliedDeductions: selected.totalDeductions,
      },
      comparison: {
        betterRegime: both.betterRegime,
        savings: both.savings,
      },
    };

    return Response.json({ data: result }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error calculating income tax:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

// GET: Fetch tax slab tables from database
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const taxSlabs = await db.taxSlabTable.findMany({
      include: { rateLines: { orderBy: { sequence: 'asc' } } },
      orderBy: { taxYear: 'desc' },
      take: 10,
    });

    return Response.json({ data: taxSlabs }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching tax slabs:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
