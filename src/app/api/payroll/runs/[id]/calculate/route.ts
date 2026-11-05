import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import {
  calculateEPF,
  calculateESIC,
  calculatePT,
  calculateLWF,
  financialYearFor,
  projectMonthlyTDS,
  type Regime,
  type OldRegimeDeductions,
} from '@/lib/payroll/india';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** Statutory deduction component names that are ALWAYS engine-computed (never template-sourced). */
const ENGINE_STATUTORY_CODES = ['EPF', 'PF', 'ESI', 'ESIC', 'PT', 'PROFESSIONAL_TAX', 'TDS', 'INCOME_TAX', 'LWF'];

function isEngineStatutory(code: string): boolean {
  const c = code.toUpperCase();
  return ENGINE_STATUTORY_CODES.some(s => c === s || c.startsWith(s + '_') || c.startsWith(s + ' ') || c === s.replace(/_/g, ' '));
}

function ageGroupFor(dob: Date | null): 'BELOW_60' | 'SENIOR' | 'ABOVE_80' {
  if (!dob) return 'BELOW_60';
  const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age >= 80) return 'ABOVE_80';
  if (age >= 60) return 'SENIOR';
  return 'BELOW_60';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // 1. Get the payroll run
    let payrollRun;
    try {
      payrollRun = await db.payrollRun.findUnique({ where: { id } });
    } catch (dbError: unknown) {
      console.error('PayrollRun table not available:', dbError);
      return Response.json({ error: 'Payroll run not found' }, { status: 404, headers: corsHeaders });
    }

    if (!payrollRun) return Response.json({ error: 'Payroll run not found' }, { status: 404, headers: corsHeaders });

    if (!['OPEN', 'INPUT_COLLECTION'].includes(payrollRun.runStatus)) {
      return Response.json({ error: 'Payroll run must be in OPEN or INPUT_COLLECTION status to calculate' }, { status: 400, headers: corsHeaders });
    }

    // 2. Get all active employees for the legal entity
    const activeEmployees = await db.employee.findMany({
      where: {
        status: 'active',
        companyId: payrollRun.companyId || undefined,
      },
      include: {
        designation: true,
        department: true,
      },
    });

    // Probation employees become payroll-eligible only after confirmation and
    // from the approved effective date. Existing confirmed employees without a
    // probation review remain eligible for backwards compatibility.
    const [periodYear, periodMonth] = String(payrollRun.payrollPeriod).split('-').map(Number);
    const periodEnd = new Date(Date.UTC(periodYear, periodMonth, 0, 23, 59, 59, 999));
    const confirmedReviews = await db.performanceReview.findMany({
      where: { reviewCycle: 'Probation', status: 'completed', employeeId: { in: activeEmployees.map(e => e.id) } },
      select: { employeeId: true, comments: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => []);
    const confirmationDateByEmployee = new Map<string, Date>();
    for (const review of confirmedReviews) {
      if (confirmationDateByEmployee.has(review.employeeId)) continue;
      try {
        const data = review.comments?.startsWith('{') ? JSON.parse(review.comments) : {};
        if (data.decision === 'confirm' && data.payrollEligible !== false) {
          confirmationDateByEmployee.set(review.employeeId, new Date(data.payrollEligibilityDate || data.effectiveDate || review.updatedAt));
        }
      } catch { /* malformed historical review: employee status remains the fallback */ }
    }
    const employees = activeEmployees.filter(employee => {
      if ((employee.employeeStatus || '').toLowerCase() === 'probation') return false;
      const eligibleFrom = confirmationDateByEmployee.get(employee.id);
      return !eligibleFrom || eligibleFrom <= periodEnd;
    });

    if (employees.length === 0) {
      return Response.json({ error: 'No active employees found for this payroll run' }, { status: 400, headers: corsHeaders });
    }

    // 3. Get payroll components
    const components = await db.payrollComponent.findMany({
      where: { isActive: true },
      orderBy: { componentType: 'asc' },
    });

    // 4. Get CTC templates for the country
    const ctcTemplates = await db.cTCTemplate.findMany({
      where: {
        countryCode: 'IND',
        status: 'ACTIVE',
      },
      include: { componentMappings: { orderBy: { calculationSequence: 'asc' } } },
    });

    // 5. Get payroll inputs for this run
    let payrollInputs: Awaited<ReturnType<typeof db.payrollInput.findMany>> = [];
    try {
      payrollInputs = await db.payrollInput.findMany({
        where: {
          payrollRunId: id,
          approvalStatus: 'APPROVED',
        },
      });
    } catch (dbError: unknown) {
      console.error('PayrollInput table not available, using empty inputs:', dbError);
      payrollInputs = [];
    }

    // 5b. India statutory configuration for this company (PT/LWF state, PF ceiling policy, TDS regime)
    let statutoryCfg: {
      ptState?: string | null; lwfState?: string | null;
      pfOnActualBasic?: boolean; pfWageCeiling?: number; pfAdminCharges?: boolean;
      esiEnabled?: boolean; esiWageLimit?: number;
      tdsRegimeDefault?: string; varianceThresholdPct?: number;
    } = {};
    if (payrollRun.companyId) {
      try {
        const cfg = await (db as unknown as { payrollStatutoryConfig: { findUnique: (a: object) => Promise<Record<string, unknown> | null> } })
          .payrollStatutoryConfig.findUnique({ where: { companyId: payrollRun.companyId } });
        if (cfg) statutoryCfg = cfg;
      } catch {
        // Model not yet migrated on this DB — fall back to statutory defaults
        statutoryCfg = {};
      }
    }

    // Resolve PT/LWF state: config → employee.state → company.state
    let companyState: string | null = null;
    if (payrollRun.companyId) {
      try {
        const comp = await db.company.findUnique({ where: { id: payrollRun.companyId }, select: { state: true } });
        companyState = comp?.state || null;
      } catch { companyState = null; }
    }

    // 5c. Income-tax declarations + cumulative TDS for the projection (India FY of this run)
    const [runYear, runMonth] = payrollRun.payrollPeriod.split('-').map(Number);
    const fy = financialYearFor(runMonth, runYear);
    const monthsElapsed = runMonth >= 4 ? runMonth - 4 : runMonth + 8; // Apr=0 … Mar=11

    interface Decl { employeeId: string; regimeType: string; totalDeductions: number; hra_ExemptionCalc: number; proofStatus: string; sectionProofStatus: string | null }
    let declarations: Decl[] = [];
    try {
      declarations = await (db.incomeTaxDeclaration.findMany({
        where: { financialYear: fy },
        select: { employeeId: true, regimeType: true, totalDeductions: true, hra_ExemptionCalc: true, proofStatus: true, sectionProofStatus: true },
      }) as unknown as Promise<Decl[]>);
    } catch { declarations = []; }

    // Cumulative TDS already deducted this FY (previous runs, same period prefix)
    let priorTds = new Map<string, number>();
    try {
      const fyRuns = await db.payrollRun.findMany({
        where: { payrollPeriod: { startsWith: fy.split('-')[0] } },
        select: { id: true },
      });
      const fyRunIds = fyRuns.filter(r => r.id !== id).map(r => r.id);
      if (fyRunIds.length) {
        const tdsLines = await db.payrollTransactionLine.findMany({
          where: { payrollRunId: { in: fyRunIds }, componentCode: { in: ['TDS', 'INCOME_TAX'] }, isReversal: false },
          select: { employeeId: true, finalAmount: true },
        });
        priorTds = tdsLines.reduce((m, l) => { m.set(l.employeeId, (m.get(l.employeeId) || 0) + l.finalAmount); return m; }, new Map<string, number>());
      }
    } catch { priorTds = new Map(); }

    // 6. Delete existing transaction lines for this run
    try {
      await db.payrollTransactionLine.deleteMany({ where: { payrollRunId: id } });
    } catch (dbError: unknown) {
      console.error('PayrollTransactionLine table not available, skipping delete:', dbError);
    }

    // 7. Calculate payroll for each employee
    let totalGrossPay = 0;
    let totalDeductions = 0;
    let totalNetPay = 0;
    let totalEmployerContrib = 0;
    let statutoryFlagCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactionLines: any[] = [];

    for (const employee of employees) {
      const employeeGrossPay: Record<string, number> = {};
      const employeeDeductions: Record<string, number> = {};
      const employeeEmployerContrib: Record<string, number> = {};
      const componentAmounts: Record<string, number> = {};
      const statutoryTrace: Record<string, unknown> = {};

      const monthlySalary = (employee.salary || 0) / 12;
      const basicSalary = monthlySalary;

      // Find employee-specific inputs
      const empInputs = payrollInputs.filter(i => i.employeeId === employee.id);

      // Calculate using CTC template component mappings if available
      const activeTemplate = ctcTemplates.find(t => t.isDefault) || ctcTemplates[0];

      if (activeTemplate) {
        for (const mapping of activeTemplate.componentMappings) {
          let amount = 0;

          switch (mapping.allocationMethod) {
            case 'PERCENTAGE_OF_CTC': {
              const ctcAnnual = employee.salary || 0;
              amount = (ctcAnnual * mapping.allocationValue) / 100 / 12;
              break;
            }
            case 'FIXED_AMOUNT': {
              amount = mapping.allocationValue / (mapping.frequency === 'ANNUAL' ? 12 : 1);
              break;
            }
            case 'PERCENTAGE_OF_COMPONENT': {
              // Base resolved by component NAME (e.g. 'BASIC') — set by earlier mappings in sequence
              const baseKey = (mapping.baseComponentId || '').toUpperCase();
              const baseAmount = componentAmounts[baseKey] ?? componentAmounts[mapping.baseComponentId || ''] ?? basicSalary;
              amount = (baseAmount * mapping.allocationValue) / 100;
              break;
            }
            default:
              amount = 0;
          }

          // Apply min/max limits
          if (mapping.minAmount !== null && mapping.minAmount !== undefined) {
            amount = Math.max(amount, mapping.minAmount);
          }
          if (mapping.maxAmount !== null && mapping.maxAmount !== undefined) {
            amount = Math.min(amount, mapping.maxAmount);
          }

          componentAmounts[mapping.id] = amount;
          // Also key by NAME so later PERCENTAGE_OF_COMPONENT mappings can reference it
          componentAmounts[mapping.componentName.toUpperCase().replace(/\s+/g, '_')] = amount;

          if (mapping.componentCategory === 'EARNING' || mapping.componentCategory === 'REIMBURSEMENT') {
            employeeGrossPay[mapping.componentName] = amount;
          } else if (mapping.componentCategory === 'DEDUCTION' && !isEngineStatutory(mapping.componentName)) {
            employeeDeductions[mapping.componentName] = amount;
          } else if (mapping.componentCategory === 'EMPLOYER_CONTRIBUTION' && !isEngineStatutory(mapping.componentName)) {
            employeeEmployerContrib[mapping.componentName] = amount;
          }
        }
      } else {
        // Default India earning structure when no template: Basic 40% / HRA 20% / DA 10% / balancing Special Allowance
        employeeGrossPay['BASIC'] = Math.round(basicSalary * 0.4);
        employeeGrossPay['HRA'] = Math.round(basicSalary * 0.2);
        employeeGrossPay['DA'] = Math.round(basicSalary * 0.1);
        employeeGrossPay['CONVEYANCE'] = 1600;
        employeeGrossPay['MEDICAL'] = 1250;
        const assigned = Object.values(employeeGrossPay).reduce((a, b) => a + b, 0);
        employeeGrossPay['SPECIAL_ALLOWANCE'] = Math.max(0, Math.round(basicSalary - assigned));
      }

      // Apply employee-specific inputs
      for (const input of empInputs) {
        if (input.inputValueNumeric !== null && input.inputValueNumeric !== undefined) {
          if (['VARIABLE_PAY', 'ONE_TIME', 'OVERTIME', 'REIMBURSEMENT'].includes(input.inputType)) {
            employeeGrossPay[input.componentCode] = (employeeGrossPay[input.componentCode] || 0) + input.inputValueNumeric;
          } else if (['LOAN', 'TAX_ADJ', 'INVESTMENT'].includes(input.inputType)) {
            employeeDeductions[input.componentCode] = (employeeDeductions[input.componentCode] || 0) + input.inputValueNumeric;
          }
        }
      }

      // ─── INDIA STATUTORY ENGINE (authoritative for PF / ESI / PT / LWF / TDS) ───
      const earningsTotal = Object.values(employeeGrossPay).reduce((a, b) => a + b, 0);
      const basicDa = (employeeGrossPay['BASIC'] || 0) + (employeeGrossPay['DA'] || 0) || basicSalary;
      const ptState = statutoryCfg.ptState || employee.state || companyState;
      const lwfState = statutoryCfg.lwfState || employee.state || companyState;
      const ageGroup = ageGroupFor(employee.dateOfBirth);
      const regime = ((declarations.find(d => d.employeeId === employee.id)?.regimeType || statutoryCfg.tdsRegimeDefault || 'NEW').toUpperCase()) as Regime;

      // EPF — 12% EE/ER with statutory ceiling (or actual Basic when opted)
      const pf = calculateEPF(basicDa, {
        onActualBasic: statutoryCfg.pfOnActualBasic || false,
        wageCeiling: statutoryCfg.pfWageCeiling || 15000,
        adminCharges: statutoryCfg.pfAdminCharges !== false,
      });
      if (pf.employeeShare > 0 || pf.employerShare > 0) {
        employeeDeductions['EPF_EE'] = pf.employeeShare;
        employeeEmployerContrib['EPF_ER'] = pf.employerShare;
        statutoryTrace['EPF'] = { epfWage: pf.epfWage, ee: pf.employeeShare, er: pf.employerShare, eps: pf.epsShare, epf: pf.epfShare, admin: pf.adminCharges, edli: pf.edliCharges, capped: pf.capped, basis: statutoryCfg.pfOnActualBasic ? 'ACTUAL_BASIC' : 'STATUTORY_CEILING_15000' };
        if (pf.adminCharges > 0) employeeEmployerContrib['EPF_ADMIN'] = pf.adminCharges;
        if (pf.edliCharges > 0) employeeEmployerContrib['EDLI_ADMIN'] = pf.edliCharges;
        statutoryFlagCount++;
      }

      // ESIC — 0.75% EE / 3.25% ER when gross ≤ wage limit
      const esi = calculateESIC(earningsTotal, { enabled: statutoryCfg.esiEnabled !== false, wageLimit: statutoryCfg.esiWageLimit || 21000 });
      if (esi.applicable) {
        employeeDeductions['ESI_EE'] = esi.employeeShare;
        employeeEmployerContrib['ESI_ER'] = esi.employerShare;
        statutoryTrace['ESI'] = { gross: esi.gross, ee: esi.employeeShare, er: esi.employerShare, wageLimit: statutoryCfg.esiWageLimit || 21000 };
        statutoryFlagCount++;
      }

      // Professional Tax — state slabs
      const pt = calculatePT(earningsTotal, ptState, runMonth, employee.gender || 'male');
      if (pt.amount > 0) {
        employeeDeductions['PT'] = pt.amount;
        statutoryTrace['PT'] = { state: pt.state, amount: pt.amount, gross: Math.round(earningsTotal) };
        statutoryFlagCount++;
      }

      // Labour Welfare Fund — state table (monthly or Jun/Dec half-yearly)
      const lwf = calculateLWF(lwfState, runMonth);
      if (lwf.employeeAmount > 0 || lwf.employerAmount > 0) {
        if (lwf.employeeAmount > 0) employeeDeductions['LWF_EE'] = lwf.employeeAmount;
        if (lwf.employerAmount > 0) employeeEmployerContrib['LWF_ER'] = lwf.employerAmount;
        statutoryTrace['LWF'] = { state: lwf.state, ee: lwf.employeeAmount, er: lwf.employerAmount, frequency: lwf.frequency };
        statutoryFlagCount++;
      }

      // TDS — annual projection on remaining months, verified deductions in true-up window
      const decl = declarations.find(d => d.employeeId === employee.id);
      const oldDeductions: OldRegimeDeductions | undefined = decl
        ? {
            section80C: (decl.totalDeductions || 0) - (decl.hra_ExemptionCalc || 0),
            hraExemption: decl.hra_ExemptionCalc || 0,
          }
        : undefined;
      const verified = decl && decl.proofStatus === 'VERIFIED' ? { section80C: Math.max(0, (decl.totalDeductions || 0) - (decl.hra_ExemptionCalc || 0)) } : undefined;
      try {
        const tds = projectMonthlyTDS({
          projectedAnnualGross: (employee.salary || earningsTotal * 12),
          regime,
          ageGroup,
          fy,
          declaration: oldDeductions,
          verifiedDeductions: verified,
          monthsElapsed,
          taxDeductedSoFar: priorTds.get(employee.id) || 0,
        });
        if (tds.monthlyTDS > 0) {
          employeeDeductions['TDS'] = tds.monthlyTDS;
          statutoryFlagCount++;
        }
        statutoryTrace['TDS'] = { regime, fy, annualTax: tds.annualTax, recoveredSoFar: priorTds.get(employee.id) || 0, thisMonth: tds.monthlyTDS, monthsRemaining: tds.monthsRemaining, deductions: tds.appliedDeductions };
      } catch (tdsErr) {
        console.error('TDS projection failed for', employee.id, tdsErr);
      }

      // Calculate totals for this employee
      const grossTotal = Object.values(employeeGrossPay).reduce((a, b) => a + b, 0);
      const deductionTotal = Object.values(employeeDeductions).reduce((a, b) => a + b, 0);
      const employerContribTotal = Object.values(employeeEmployerContrib).reduce((a, b) => a + b, 0);
      const netPay = grossTotal - deductionTotal;

      // Create transaction lines for earnings
      for (const [compName, amount] of Object.entries(employeeGrossPay)) {
        const component = components.find(c => c.name === compName || c.code === compName);
        transactionLines.push({
          payrollRunId: id,
          employeeId: employee.id,
          componentId: component?.id || null,
          componentCode: compName.toUpperCase().replace(/\s+/g, '_'),
          componentType: 'EARNING',
          componentCategory: component?.componentCategory || 'NORMAL',
          calculatedAmount: amount,
          finalAmount: amount,
          currencyCode: payrollRun.currencyCode,
          ytdAmount: 0,
          mtdAmount: amount,
          prorationFactor: 1.0,
        });
      }

      // Create transaction lines for deductions
      for (const [compName, amount] of Object.entries(employeeDeductions)) {
        const component = components.find(c => c.name === compName || c.code === compName);
        const statutory = isEngineStatutory(compName);
        transactionLines.push({
          payrollRunId: id,
          employeeId: employee.id,
          componentId: component?.id || null,
          componentCode: compName.toUpperCase().replace(/\s+/g, '_'),
          componentType: 'DEDUCTION',
          componentCategory: statutory ? 'STATUTORY' : (component?.componentCategory || 'NORMAL'),
          calculatedAmount: amount,
          finalAmount: amount,
          currencyCode: payrollRun.currencyCode,
          ytdAmount: 0,
          mtdAmount: amount,
          prorationFactor: 1.0,
          formulaTrace: statutory ? JSON.stringify(statutoryTrace[compName.split('_')[0]] || statutoryTrace[compName] || {}) : undefined,
          statutoryReference: statutory ? 'INDIA_ENGINE' : undefined,
        });
      }

      // Create transaction lines for employer contribution
      for (const [compName, amount] of Object.entries(employeeEmployerContrib)) {
        const component = components.find(c => c.name === compName || c.code === compName);
        transactionLines.push({
          payrollRunId: id,
          employeeId: employee.id,
          componentId: component?.id || null,
          componentCode: compName.toUpperCase().replace(/\s+/g, '_'),
          componentType: 'EMPLOYER_CONTRIB',
          componentCategory: 'STATUTORY',
          calculatedAmount: amount,
          finalAmount: amount,
          currencyCode: payrollRun.currencyCode,
          ytdAmount: 0,
          mtdAmount: amount,
          prorationFactor: 1.0,
          formulaTrace: JSON.stringify(statutoryTrace[compName.split('_')[0]] || {}),
          statutoryReference: 'INDIA_ENGINE',
        });
      }

      totalGrossPay += grossTotal;
      totalDeductions += deductionTotal;
      totalNetPay += netPay;
      totalEmployerContrib += employerContribTotal;
    }

    // 8. Create all transaction lines in batch
    try {
      await db.payrollTransactionLine.createMany({ data: transactionLines });
    } catch (dbError: unknown) {
      console.error('PayrollTransactionLine table not available, skipping createMany:', dbError);
    }

    // 9. Update payroll run totals and advance status to PROCESSING
    let updatedRun = null;
    try {
      updatedRun = await db.payrollRun.update({
        where: { id },
        data: {
          totalEmployees: employees.length,
          totalGrossPay,
          totalDeductions,
          totalNetPay,
          totalEmployerContrib,
          runStatus: 'PROCESSING',
        },
      });
    } catch (dbError: unknown) {
      console.error('PayrollRun table not available, skipping update:', dbError);
    }

    return Response.json({
      data: {
        run: updatedRun,
        summary: {
          totalEmployees: employees.length,
          totalGrossPay,
          totalDeductions,
          totalNetPay,
          totalEmployerContrib,
          transactionLinesCreated: transactionLines.length,
          engine: 'INDIA_STATUTORY_V2',
          statutoryFlags: statutoryFlagCount,
          fy,
        },
      },
      message: 'Payroll calculation completed successfully (India statutory engine v2)',
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error calculating payroll:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
