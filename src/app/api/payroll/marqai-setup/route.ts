import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import {
  buildEarnings, solveGrossForNet, resolvePayrollSettings, r2,
  computeMonthlyTds, computeProfessionalTax,
} from '@/lib/payroll-engine';
import type { PayrollSettingsData } from '@/lib/payroll-engine';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

// ─── India payroll component masters (aligned with prisma/seed-payroll.ts codes) ───
const INDIA_COMPONENTS = [
  { code: 'BASIC', name: 'Basic Salary', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'PERCENTAGE', defaultValue: 40, percentageBase: 'GROSS', isTaxable: true, taxTreatment: 'FULLY_TAXABLE' },
  { code: 'HRA', name: 'House Rent Allowance', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'PERCENTAGE', defaultValue: 16, percentageBase: 'BASIC', isTaxable: true, taxTreatment: 'PARTIALLY_TAXABLE', exemptionSection: '10(13A)' },
  { code: 'DA', name: 'Dearness Allowance', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'PERCENTAGE', defaultValue: 0, percentageBase: 'BASIC', isTaxable: true, taxTreatment: 'FULLY_TAXABLE' },
  { code: 'CONV', name: 'Conveyance Allowance', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'FLAT_AMOUNT', defaultValue: 1600, isTaxable: true, taxTreatment: 'FULLY_TAXABLE' },
  { code: 'MED', name: 'Medical Allowance', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'FLAT_AMOUNT', defaultValue: 1250, isTaxable: true, taxTreatment: 'PARTIALLY_TAXABLE', exemptionSection: '80D' },
  { code: 'SA', name: 'Special Allowance', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'FORMULA', isTaxable: true, taxTreatment: 'FULLY_TAXABLE', defaultValue: 0 },
  { code: 'BONUS', name: 'Performance Bonus', componentType: 'EARNING', componentCategory: 'NORMAL', calculationType: 'MANUAL_ENTRY', isTaxable: true, taxTreatment: 'FULLY_TAXABLE', paymentFrequency: 'ANNUAL' },
  { code: 'EPF_EE', name: 'EPF - Employee Contribution', componentType: 'EMPLOYEE_CONTRIB', componentCategory: 'STATUTORY', calculationType: 'PERCENTAGE', defaultValue: 12, percentageBase: 'BASIC', isTaxable: false, taxTreatment: 'EXEMPT' },
  { code: 'EPF_ER', name: 'EPF - Employer Contribution', componentType: 'EMPLOYER_CONTRIB', componentCategory: 'STATUTORY', calculationType: 'PERCENTAGE', defaultValue: 12, percentageBase: 'BASIC', isTaxable: false, taxTreatment: 'EXEMPT', affectsNet: false },
  { code: 'ESI_EE', name: 'ESI - Employee Contribution', componentType: 'EMPLOYEE_CONTRIB', componentCategory: 'STATUTORY', calculationType: 'PERCENTAGE', defaultValue: 0.75, percentageBase: 'GROSS', isTaxable: false, taxTreatment: 'EXEMPT' },
  { code: 'ESI_ER', name: 'ESI - Employer Contribution', componentType: 'EMPLOYER_CONTRIB', componentCategory: 'STATUTORY', calculationType: 'PERCENTAGE', defaultValue: 3.25, percentageBase: 'GROSS', isTaxable: false, taxTreatment: 'EXEMPT', affectsNet: false },
  { code: 'PT', name: 'Professional Tax', componentType: 'DEDUCTION', componentCategory: 'STATUTORY', calculationType: 'SLAB_BASED', isTaxable: false, taxTreatment: 'EXEMPT' },
  { code: 'TDS', name: 'Tax Deducted at Source (Income Tax)', componentType: 'DEDUCTION', componentCategory: 'STATUTORY', calculationType: 'SLAB_BASED', isTaxable: false, taxTreatment: 'EXEMPT' },
  { code: 'LWF_EE', name: 'Labour Welfare Fund - Employee', componentType: 'EMPLOYEE_CONTRIB', componentCategory: 'STATUTORY', calculationType: 'FLAT_AMOUNT', defaultValue: 0, isTaxable: false, taxTreatment: 'EXEMPT', paymentFrequency: 'ANNUAL' },
];

// ─── India statutory configuration (EPF / ESI / PT / IT) ───
function statutoryRows(): Array<Record<string, unknown>> {
  return [
    {
      componentCode: 'EPF_EE', componentName: 'Employees Provident Fund', authorityName: 'Employees Provident Fund Organisation', authorityCode: 'EPFO',
      partyType: 'BOTH', calculationBasis: 'SPECIFIC_COMPONENT', ratePercentage: 12, wageCeiling: 15000,
      remittanceFrequency: 'MONTHLY', remittanceDueDay: 15, filingFrequency: 'MONTHLY', filingFormat: 'ECR', isChallanRequired: true, challanFormat: 'ECR',
    },
    {
      componentCode: 'ESI_EE', componentName: 'Employee State Insurance', authorityName: 'Employees State Insurance Corporation', authorityCode: 'ESIC',
      partyType: 'BOTH', calculationBasis: 'GROSS_PAY', ratePercentage: 0.75, wageCeiling: 21000,
      remittanceFrequency: 'MONTHLY', remittanceDueDay: 15, filingFrequency: 'HALF_YEARLY', filingFormat: 'ESIC-RETURN',
    },
    {
      componentCode: 'PT', componentName: 'Professional Tax (Telangana)', authorityName: 'Commercial Tax Department, Telangana', authorityCode: 'CTS-TG',
      partyType: 'EMPLOYEE', calculationBasis: 'SLAB_BASED',
      remittanceFrequency: 'MONTHLY', remittanceDueDay: 10, filingFrequency: 'MONTHLY', filingFormat: 'PT-RETURN',
    },
    {
      componentCode: 'TDS', componentName: 'Income Tax (TDS on Salaries) — Sec 192', authorityName: 'Income Tax Department', authorityCode: 'ITD',
      partyType: 'EMPLOYEE', calculationBasis: 'SLAB_BASED',
      remittanceFrequency: 'MONTHLY', remittanceDueDay: 7, filingFrequency: 'QUARTERLY', filingFormat: '24Q', isChallanRequired: true, challanFormat: 'ITNS-281',
    },
  ];
}

// ─── India tax slabs FY 2026-27 (AY 2027-28) ───
const NEW_REGIME_LINES = [
  { sequence: 1, incomeFrom: 0, incomeTo: 400000, ratePercentage: 0, cessRate: 4 },
  { sequence: 2, incomeFrom: 400000, incomeTo: 800000, ratePercentage: 5, cessRate: 4 },
  { sequence: 3, incomeFrom: 800000, incomeTo: 1200000, ratePercentage: 10, cessRate: 4 },
  { sequence: 4, incomeFrom: 1200000, incomeTo: 1600000, ratePercentage: 15, cessRate: 4 },
  { sequence: 5, incomeFrom: 1600000, incomeTo: 2000000, ratePercentage: 20, cessRate: 4 },
  { sequence: 6, incomeFrom: 2000000, incomeTo: 2400000, ratePercentage: 25, cessRate: 4 },
  { sequence: 7, incomeFrom: 2400000, incomeTo: null, ratePercentage: 30, cessRate: 4 },
];

const OLD_REGIME_LINES = [
  { sequence: 1, incomeFrom: 0, incomeTo: 250000, ratePercentage: 0, cessRate: 4 },
  { sequence: 2, incomeFrom: 250000, incomeTo: 500000, ratePercentage: 5, cessRate: 4 },
  { sequence: 3, incomeFrom: 500000, incomeTo: 1000000, ratePercentage: 20, cessRate: 4 },
  { sequence: 4, incomeFrom: 1000000, incomeTo: null, ratePercentage: 30, cessRate: 4 },
];

// ─── MarqAI Tech Group salary assignments (Task 123) ───
// key: match token (email local-part or full name contains), gross target
// (vardhani is solved for a ₹1,00,000 ON-HAND target below)
const MARQAI_ASSIGNMENTS: Array<{ keys: string[]; label: string; gross?: number; netTarget?: number }> = [
  { keys: ['mallesh'], label: 'Mallesh', gross: 15000 },
  { keys: ['madhuri'], label: 'Madhuri', gross: 15000 },
  { keys: ['manoj'], label: 'Manoj', gross: 20000 },
  { keys: ['shiraj', 'siraj'], label: 'Shiraj', gross: 25000 },
  { keys: ['amrutha'], label: 'Amrutha', gross: 15000 },
  { keys: ['syed'], label: 'Syed', gross: 15000 },
  { keys: ['bharath'], label: 'Bharath', gross: 15000 },
  { keys: ['divya'], label: 'Divya', gross: 25000 },
  { keys: ['vardhani'], label: 'Vardhani', netTarget: 100000 },
];

function matchEmployee(emp: { firstName: string | null; lastName: string | null; email: string | null }, keys: string[]): boolean {
  const email = (emp.email || '').toLowerCase().split('@')[0];
  const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
  return keys.some((k) => email.includes(k) || fullName.includes(k));
}

/**
 * POST /api/payroll/marqai-setup
 * Idempotent bootstrap for the MarqAI Tech Group tenant:
 *   1. India PayrollComponent masters (BASIC/HRA/…/EPF/ESI/PT/TDS)
 *   2. StatutoryComponent configuration (EPFO, ESIC, PT-Telangana, IT-192)
 *   3. TaxSlabTable masters — NEW + OLD regime, FY 2026-27 (AY 2027-28)
 *   4. Company PayrollSettings (auto processing, Telangana PT, NEW regime,
 *      PF + ESI DISABLED — Task 124: MarqAI employees must have NO PF and
 *      NO ESI deductions on their payslips)
 *   5. Salary structures for the 9 employees (vardhani re-solved for ₹1L
 *      on-hand under the PF/ESI-exempt configuration → gross ₹1,00,200)
 *   6. Employee.salary + salaryStructureId assignment
 *   7. Cleanup of superseded MarqAI structures no longer assigned
 *
 * Body (optional): { pfEnabled?: boolean, esiEnabled?: boolean } — defaults
 * to false/false per the Task 124 directive (no PF/ESI for MarqAI).
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const role = (decoded as Record<string, unknown>).role as string;
    if (!ADMIN_ROLES.includes(role)) {
      return Response.json({ error: 'Only HR/Admin can run payroll setup' }, { status: 403, headers: corsHeaders });
    }

    const scope = await resolveCompanyScope(request);
    if (!scope || !scope.companyId) {
      return Response.json({ error: 'Select a company context first' }, { status: 400, headers: corsHeaders });
    }
    const companyId = scope.companyId;

    const log: string[] = [];

    // ── 1. PayrollComponent masters (idempotent upsert on code+country) ──
    const componentMap = new Map<string, string>();
    for (const comp of INDIA_COMPONENTS) {
      const row = await db.payrollComponent.upsert({
        where: { code_countryCode: { code: comp.code, countryCode: 'IND' } },
        update: {
          name: comp.name, componentType: comp.componentType, componentCategory: comp.componentCategory,
          calculationType: comp.calculationType, defaultValue: comp.defaultValue ?? null,
          percentageBase: comp.percentageBase ?? null, isTaxable: comp.isTaxable,
          taxTreatment: comp.taxTreatment, exemptionSection: comp.exemptionSection ?? null,
          paymentFrequency: comp.paymentFrequency ?? 'MONTHLY', affectsNet: comp.affectsNet ?? true,
          isActive: true,
        },
        create: { ...comp, countryCode: 'IND' } as never,
      });
      componentMap.set(comp.code, row.id);
    }
    log.push(`components: ${INDIA_COMPONENTS.length} India masters ensured`);

    // ── 2. StatutoryComponent configuration ──
    let statutoryCount = 0;
    for (const sc of statutoryRows()) {
      const componentId = componentMap.get(sc.componentCode as string);
      if (!componentId) continue;
      const existing = await db.statutoryComponent.findFirst({
        where: { componentCode: sc.componentCode as string, countryCode: 'IND' },
      });
      if (existing) {
        await db.statutoryComponent.update({ where: { id: existing.id }, data: { ...sc, componentId, countryCode: 'IND' } as never });
      } else {
        await db.statutoryComponent.create({ data: { ...sc, componentId, countryCode: 'IND' } as never });
      }
      statutoryCount += 1;
    }
    log.push(`statutory: ${statutoryCount} authority configurations ensured`);

    // ── 3. Tax slab tables (NEW + OLD regime, FY 2026-27) ──
    const slabTables: Array<{ name: string; regimeType: string; lines: typeof NEW_REGIME_LINES }> = [
      { name: 'India — New Regime (FY 2026-27, AY 2027-28) · Std Ded ₹75,000 · 87A rebate ≤ ₹12L', regimeType: 'NEW', lines: NEW_REGIME_LINES },
      { name: 'India — Old Regime (FY 2026-27, AY 2027-28) · Std Ded ₹50,000 · 87A rebate ≤ ₹5L', regimeType: 'OLD', lines: OLD_REGIME_LINES },
    ];
    for (const t of slabTables) {
      const existing = await db.taxSlabTable.findFirst({
        where: { countryCode: 'IND', taxYear: 'FY 2026-27', regimeType: t.regimeType },
        include: { rateLines: true },
      });
      if (existing) {
        if (existing.rateLines.length === 0) {
          for (const line of t.lines) {
            await db.taxSlabRateLine.create({ data: { ...line, slabTableId: existing.id } as never });
          }
        }
      } else {
        await db.taxSlabTable.create({
          data: {
            name: t.name, countryCode: 'IND', taxYear: 'FY 2026-27', regimeType: t.regimeType,
            filingStatus: 'SINGLE', companyId: null,
            rateLines: { create: t.lines as never },
          },
        });
      }
    }
    log.push('tax slabs: NEW + OLD regime tables ensured for FY 2026-27');

    // ── 4. Company PayrollSettings (Task 124: PF/ESI OFF for MarqAI) ──
    const body = await request.json().catch(() => ({}));
    const pfEnabled = body?.pfEnabled === true;   // default OFF — no PF for MarqAI employees
    const esiEnabled = body?.esiEnabled === true; // default OFF — no ESI for MarqAI employees
    const currentSettings = await resolvePayrollSettings(db, companyId);
    await db.payrollSettings.upsert({
      where: { companyId },
      update: {
        processingMode: 'auto', ptState: 'TELANGANA', taxRegime: 'NEW',
        pfEnabled, esiEnabled,
        updatedBy: (decoded as Record<string, unknown>).userId as string,
      },
      create: {
        ...currentSettings, companyId, processingMode: 'auto',
        pfEnabled, esiEnabled,
        updatedBy: (decoded as Record<string, unknown>).userId as string,
      },
    });
    // Re-read so the structure solver below uses the effective statutory config
    const settings = await resolvePayrollSettings(db, companyId);
    log.push(`payroll settings: ensured (mode=auto, LOP on, PT Telangana, NEW regime, PF ${pfEnabled ? 'ON' : 'OFF'}, ESI ${esiEnabled ? 'ON' : 'OFF'})`);

    // ── 5+6. Salary structures + employee assignment ──
    const employees = await db.employee.findMany({
      where: { companyId, status: 'active' },
      select: { id: true, firstName: true, lastName: true, email: true, salary: true, salaryStructureId: true },
    });

    const results: Array<{ label: string; employee: string; gross: number; net: number; structure: string; action: string }> = [];
    const structureCache = new Map<string, string>(); // cacheKey → structureId

    for (const assignment of MARQAI_ASSIGNMENTS) {
      const matched = employees.filter((e) => matchEmployee(e, assignment.keys));
      if (matched.length === 0) {
        results.push({ label: assignment.label, employee: 'NOT FOUND', gross: 0, net: 0, structure: '-', action: 'error: no matching active employee' });
        continue;
      }
      const employee = matched[0];

      // Solve gross (vardhani: hit the ₹1,00,000 on-hand target)
      const gross = assignment.gross ?? solveGrossForNet(assignment.netTarget as number, settings);
      const earnings = buildEarnings(gross, settings);
      const basic = earnings[0].value;

      // Statutory deduction component values for this band (informational — the
      // engine recomputes per month with attendance proration). PF/ESI respect
      // the company toggles (Task 124: both OFF for MarqAI).
      const pfValue = settings.pfEnabled ? r2((Math.min(basic, settings.pfWageCeiling) * settings.pfEmployeePct) / 100) : 0;
      const esiValue = settings.esiEnabled && gross <= settings.esiWageCeiling ? r2((gross * settings.esiEmployeePct) / 100) : 0;
      const regime = settings.taxRegime === 'OLD' ? 'OLD' : 'NEW';
      const stdDed = regime === 'OLD' ? 50000 : 75000;
      const taxable = Math.max(0, gross * 12 - stdDed);
      const tdsValue = computeMonthlyTds(gross, regime as 'NEW' | 'OLD');
      const ptValue = computeProfessionalTax(gross, settings);

      const cacheKey = `${gross}`;
      let structureId = structureCache.get(cacheKey);
      if (!structureId) {
        const name = assignment.netTarget
          ? `MarqAI — ₹${assignment.netTarget.toLocaleString('en-IN')}/month on-hand (Gross ₹${Math.round(gross).toLocaleString('en-IN')})`
          : `MarqAI — ₹${gross.toLocaleString('en-IN')}/month`;
        const componentsData = [
          ...earnings.map((c, i) => ({
            name: c.name, type: 'earning',
            category: c.name.startsWith('Basic') ? 'basic' : c.name.startsWith('House') ? 'hra' : c.name.startsWith('Conveyance') ? 'allowance' : c.name.startsWith('Medical') ? 'allowance' : 'allowance',
            calculationType: 'fixed', value: c.value, sortOrder: i,
            isTaxable: true, isStatutory: false,
          })),
          // PF / ESI structure rows are only embedded when enabled for the
          // company (Task 124: OFF for MarqAI — payslips must show no PF/ESI)
          ...(settings.pfEnabled ? [{ name: 'EPF - Employee', type: 'deduction', category: 'pf', calculationType: 'percentage', value: settings.pfEmployeePct, percentageOf: 'Basic Salary', sortOrder: 10, isTaxable: false, isStatutory: true }] : []),
          ...(settings.esiEnabled ? [{ name: 'ESI - Employee', type: 'deduction', category: 'esi', calculationType: 'percentage', value: settings.esiEmployeePct, percentageOf: 'Gross Salary', sortOrder: 11, isTaxable: false, isStatutory: true }] : []),
          { name: 'Professional Tax', type: 'deduction', category: 'tax', calculationType: 'fixed', value: ptValue, sortOrder: 12, isTaxable: false, isStatutory: true },
          { name: 'TDS (Income Tax)', type: 'deduction', category: 'tax', calculationType: 'fixed', value: tdsValue, sortOrder: 13, isTaxable: false, isStatutory: true },
        ];
        const existingStruct = await db.salaryStructure.findFirst({ where: { companyId, name } });
        if (existingStruct) {
          structureId = existingStruct.id;
          await db.salaryComponent.deleteMany({ where: { salaryStructureId: structureId } });
          await db.salaryComponent.createMany({ data: componentsData.map((c) => ({ ...c, salaryStructureId: structureId })) as never });
        } else {
          const created = await db.salaryStructure.create({
            data: { name, companyId, country: 'IN', currency: 'INR', description: 'Created by Task 123 payroll setup', status: 'active', components: { create: componentsData as never } },
          });
          structureId = created.id;
        }
        structureCache.set(cacheKey, structureId);
      }

      const before = employee.salary;
      await db.employee.update({
        where: { id: employee.id },
        data: { salary: gross, salaryCurrency: 'INR', salaryStructureId: structureId },
      });

      // quick preview net at full attendance
      const pf = pfValue;
      const net = r2(gross - pf - esiValue - tdsValue - ptValue);
      results.push({
        label: assignment.label,
        employee: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
        gross: r2(gross),
        net,
        structure: (await db.salaryStructure.findUnique({ where: { id: structureId }, select: { name: true } }))?.name || '',
        action: before === gross ? 'updated (same salary)' : `salary ${before ?? 0} → ${Math.round(gross)}`,
      });
    }

    // ── 7. Cleanup superseded MarqAI structures (no active employee attached) ──
    // Re-solving (e.g. vardhani's gross changes when PF/ESI toggles change)
    // creates new structures — drop the ones nobody references anymore.
    const attachedIds = new Set(
      (await db.employee.findMany({
        where: { companyId, salaryStructureId: { not: null } },
        select: { salaryStructureId: true },
      })).map((e) => e.salaryStructureId as string),
    );
    const marqaiStructures = await db.salaryStructure.findMany({
      where: { companyId, name: { startsWith: 'MarqAI' } },
      select: { id: true, name: true },
    });
    const stale = marqaiStructures.filter((s) => !attachedIds.has(s.id));
    for (const s of stale) {
      await db.salaryComponent.deleteMany({ where: { salaryStructureId: s.id } });
      await db.salaryStructure.delete({ where: { id: s.id } });
    }
    if (stale.length > 0) log.push(`cleanup: removed ${stale.length} superseded structure(s) (${stale.map((s) => s.name).join(', ')})`);

    await db.auditLog.create({
      data: {
        userId: (decoded as Record<string, unknown>).userId as string,
        action: 'PAYROLL_SETUP_MARQAI',
        module: 'payroll',
        details: `Payroll setup: ${INDIA_COMPONENTS.length} components, ${statutoryCount} statutory configs, 2 tax slab tables, ${results.length} salary structures/assignments, PF ${pfEnabled ? 'ON' : 'OFF'}, ESI ${esiEnabled ? 'ON' : 'OFF'}, ${stale.length} stale structures removed`,
      },
    });

    return Response.json({ data: { log, results } }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('MarqAI payroll setup error:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
