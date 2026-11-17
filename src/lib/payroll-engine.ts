/**
 * Task 123 — Payroll Engine (India)
 *
 * Attendance-integrated salary processing:
 *   • Reads the company's PayrollSettings (processing mode, statutory config).
 *   • Reads each employee's SalaryStructure + SalaryComponents (gross target).
 *   • Aggregates the Attendance module rows for the month to derive
 *     Loss-of-Pay (LOP) days: absent = 1 LOP day, half_day = 0.5 LOP day.
 *     Days before the date of joining are never counted as LOP.
 *   • Prorates earnings by paidDays / employedDays for joiners / LOP months.
 *   • Applies statutory deductions: EPF (12% up to ₹15,000 wage ceiling),
 *     ESI (0.75% employee when gross ≤ ₹21,000), Professional Tax
 *     (state slabs — Telangana default), and TDS (Income tax) projected
 *     annually under the selected regime (NEW = FY 2026-27 slabs with
 *     ₹75,000 standard deduction + ₹12L rebate; OLD = legacy slabs with
 *     ₹50,000 standard deduction) + 4% health & education cess.
 *   • Idempotent: existing payroll rows are never duplicated (backfill only
 *     fills missing employee/month gaps).
 *
 * Used by:
 *   • POST /api/payroll/process                (manual / on-demand auto run)
 *   • GET  /api/cron/payroll-auto-process      (monthly auto run, vercel cron)
 *   • POST /api/payroll/marqai-setup           (structure seeding solver)
 */
import type { PrismaClient } from '@/generated/prisma/client';
import { deriveMissingAbsents } from '@/lib/payroll-absent-derivation';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollSettingsData {
  processingMode: string; // 'auto' | 'manual'
  autoProcessDay: number;
  lopEnabled: boolean;
  basicPct: number;
  hraPctOfBasic: number;
  conveyanceAmt: number;
  medicalAmt: number;
  pfEnabled: boolean;
  pfEmployeePct: number;
  pfEmployerPct: number;
  pfWageCeiling: number;
  esiEnabled: boolean;
  esiEmployeePct: number;
  esiEmployerPct: number;
  esiWageCeiling: number;
  ptEnabled: boolean;
  ptMode: string; // 'slab' | 'flat'
  ptState: string;
  ptMonthlyAmount: number;
  tdsEnabled: boolean;
  taxRegime: string; // 'NEW' | 'OLD'
  tdsMethod: string;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettingsData = {
  processingMode: 'manual',
  autoProcessDay: 1,
  lopEnabled: true,
  basicPct: 40,
  hraPctOfBasic: 40,
  conveyanceAmt: 1600,
  medicalAmt: 1250,
  pfEnabled: true,
  pfEmployeePct: 12,
  pfEmployerPct: 12,
  pfWageCeiling: 15000,
  esiEnabled: true,
  esiEmployeePct: 0.75,
  esiEmployerPct: 3.25,
  esiWageCeiling: 21000,
  ptEnabled: true,
  ptMode: 'slab',
  ptState: 'TELANGANA',
  ptMonthlyAmount: 200,
  tdsEnabled: true,
  taxRegime: 'NEW',
  tdsMethod: 'FLAT_ANNUAL',
};

export interface StructureComponent {
  name: string;
  type: string; // earning | deduction
  category: string;
  value: number; // monthly amount (INR) for earnings / fixed deductions
}

export interface SalaryStructureData {
  id: string;
  name: string;
  grossMonthly: number;
  components: StructureComponent[];
}

export interface AttendanceSummary {
  present: number;
  late: number;
  halfDay: number;
  onLeave: number;
  holiday: number;
  weekend: number;
  absent: number;
  noData: boolean;
}

export interface EmployeeMonthResult {
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  status: 'created' | 'skipped';
  reason?: string;
  gross?: number;
  net?: number;
  lopDays?: number;
  paidDays?: number;
  totalDays?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// India statutory helpers (FY 2026-27, AY 2027-28)
// ─────────────────────────────────────────────────────────────────────────────

/** New-regime slabs (in force from FY 2025-26, continued for FY 2026-27). */
const NEW_REGIME_SLABS: Array<{ from: number; to: number | null; rate: number }> = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400000, to: 800000, rate: 5 },
  { from: 800000, to: 1200000, rate: 10 },
  { from: 1200000, to: 1600000, rate: 15 },
  { from: 1600000, to: 2000000, rate: 20 },
  { from: 2000000, to: 2400000, rate: 25 },
  { from: 2400000, to: null, rate: 30 },
];

/** Old-regime slabs (unchanged since FY 2023-24). */
const OLD_REGIME_SLABS: Array<{ from: number; to: number | null; rate: number }> = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250000, to: 500000, rate: 5 },
  { from: 500000, to: 1000000, rate: 20 },
  { from: 1000000, to: null, rate: 30 },
];

const CESS_RATE = 4; // health & education cess on income tax

/**
 * Annual income tax for a taxable income under the selected regime.
 * Includes the 87A rebate (new regime: taxable ≤ ₹12,00,000 → nil;
 * old regime: taxable ≤ ₹5,00,000 → rebate up to ₹12,500) + 4% cess.
 */
export function computeIndiaTaxAnnual(taxableIncome: number, regime: 'NEW' | 'OLD'): number {
  if (taxableIncome <= 0) return 0;
  const slabs = regime === 'OLD' ? OLD_REGIME_SLABS : NEW_REGIME_SLABS;
  let tax = 0;
  for (const s of slabs) {
    if (taxableIncome <= s.from) break;
    const upper = s.to === null ? taxableIncome : Math.min(taxableIncome, s.to);
    tax += ((upper - s.from) * s.rate) / 100;
  }
  // Section 87A rebate
  if (regime === 'NEW') {
    if (taxableIncome <= 1200000) tax = 0;
  } else if (taxableIncome <= 500000) {
    tax = Math.max(0, tax - 12500);
  }
  tax += (tax * CESS_RATE) / 100;
  return Math.round(tax * 100) / 100;
}

/**
 * TDS for one month under the FLAT_ANNUAL method:
 * annual tax on (monthly gross × 12 − standard deduction) ÷ 12.
 * Standard deduction: ₹75,000 (new regime) / ₹50,000 (old regime).
 */
export function computeMonthlyTds(structureGross: number, regime: 'NEW' | 'OLD'): number {
  const stdDed = regime === 'OLD' ? 50000 : 75000;
  const taxable = Math.max(0, structureGross * 12 - stdDed);
  return Math.round((computeIndiaTaxAnnual(taxable, regime) / 12) * 100) / 100;
}

/**
 * Professional Tax by state (monthly slabs on gross salary).
 * Telangana / Andhra Pradesh: ≤ 15000 → 0; 15001–20000 → 150; > 20000 → 200.
 * Karnataka: ≥ 25000 → 200 (otherwise 0). Maharashtra: ≥ 7500 → 200.
 * Flat mode returns the configured monthly amount.
 */
export function computeProfessionalTax(gross: number, settings: PayrollSettingsData): number {
  if (!settings.ptEnabled) return 0;
  if (settings.ptMode === 'flat') return settings.ptMonthlyAmount;
  const grossR = Math.round(gross);
  switch (settings.ptState.toUpperCase()) {
    case 'TELANGANA':
    case 'ANDHRA_PRADESH':
    case 'AP':
      if (grossR <= 15000) return 0;
      if (grossR <= 20000) return 150;
      return 200;
    case 'KARNATAKA':
      return grossR >= 25000 ? 200 : 0;
    case 'MAHARASHTRA':
      return grossR >= 7500 ? 200 : 0;
    case 'TAMIL_NADU':
      return grossR >= 15000 ? 208 : 0;
    default:
      return grossR > 15000 ? settings.ptMonthlyAmount : 0;
  }
}

/** Round to 2 decimals, avoiding float drift. */
export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings resolver
// ─────────────────────────────────────────────────────────────────────────────

/** Read the company's PayrollSettings, creating defaults on first access. */
export async function resolvePayrollSettings(db: PrismaClient, companyId: string): Promise<PayrollSettingsData> {
  const row = await db.payrollSettings.findUnique({ where: { companyId } });
  if (row) {
    return {
      processingMode: row.processingMode,
      autoProcessDay: row.autoProcessDay,
      lopEnabled: row.lopEnabled,
      basicPct: row.basicPct,
      hraPctOfBasic: row.hraPctOfBasic,
      conveyanceAmt: row.conveyanceAmt,
      medicalAmt: row.medicalAmt,
      pfEnabled: row.pfEnabled,
      pfEmployeePct: row.pfEmployeePct,
      pfEmployerPct: row.pfEmployerPct,
      pfWageCeiling: row.pfWageCeiling,
      esiEnabled: row.esiEnabled,
      esiEmployeePct: row.esiEmployeePct,
      esiEmployerPct: row.esiEmployerPct,
      esiWageCeiling: row.esiWageCeiling,
      ptEnabled: row.ptEnabled,
      ptMode: row.ptMode,
      ptState: row.ptState,
      ptMonthlyAmount: row.ptMonthlyAmount,
      tdsEnabled: row.tdsEnabled,
      taxRegime: row.taxRegime,
      tdsMethod: row.tdsMethod,
    };
  }
  return { ...DEFAULT_PAYROLL_SETTINGS };
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the monthly earning component breakdown for a target gross salary.
 * BASIC = basicPct% of gross, HRA = hraPctOfBasic% of BASIC, then fixed
 * conveyance + medical, and Special Allowance as the balancing figure so the
 * components always sum exactly to the gross.
 */
export function buildEarnings(gross: number, settings: PayrollSettingsData): Array<{ name: string; value: number }> {
  const basic = r2((gross * settings.basicPct) / 100);
  const hra = r2((basic * settings.hraPctOfBasic) / 100);
  const conveyance = Math.min(settings.conveyanceAmt, Math.max(0, gross - basic - hra));
  const medical = Math.min(settings.medicalAmt, Math.max(0, gross - basic - hra - conveyance));
  const special = r2(gross - basic - hra - conveyance - medical);
  const parts = [
    { name: 'Basic Salary', value: basic },
    { name: 'House Rent Allowance', value: hra },
  ];
  if (conveyance > 0) parts.push({ name: 'Conveyance Allowance', value: r2(conveyance) });
  if (medical > 0) parts.push({ name: 'Medical Allowance', value: r2(medical) });
  if (special > 0) parts.push({ name: 'Special Allowance', value: special });
  return parts;
}

/**
 * Solve for the monthly gross needed to produce a target ON-HAND (net) salary
 * under the current statutory configuration. Binary search on gross; net(g)
 * = g − PF − PT − TDS (esi not applicable above the wage ceiling; for g≤ceiling
 * the search still converges because esi is monotonic in g).
 */
export function solveGrossForNet(targetNet: number, settings: PayrollSettingsData): number {
  const net = (g: number): number => {
    const earnings = buildEarnings(g, settings);
    const basic = earnings[0].value;
    const pf = settings.pfEnabled ? r2((Math.min(basic, settings.pfWageCeiling) * settings.pfEmployeePct) / 100) : 0;
    const esi = settings.esiEnabled && g <= settings.esiWageCeiling ? r2((g * settings.esiEmployeePct) / 100) : 0;
    const pt = computeProfessionalTax(g, settings);
    const tds = settings.tdsEnabled ? computeMonthlyTds(g, settings.taxRegime === 'OLD' ? 'OLD' : 'NEW') : 0;
    return r2(g - pf - esi - pt - tds);
  };
  let lo = targetNet;
  let hi = targetNet * 1.6;
  // expand upper bound until net(hi) ≥ target
  let guard = 0;
  while (net(hi) < targetNet && guard++ < 64) hi *= 1.4;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (net(mid) < targetNet) lo = mid;
    else hi = mid;
  }
  // Round to the MINIMAL whole rupee whose net ≥ target (avoids float overshoot)
  let gross = Math.max(targetNet, Math.ceil(hi));
  while (net(gross) < targetNet) gross += 1;
  while (gross - 1 >= targetNet && net(gross - 1) >= targetNet) gross -= 1;
  return gross;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance → LOP
// ─────────────────────────────────────────────────────────────────────────────

export function monthWindow(month: number, year: number): { start: Date; end: Date; daysInMonth: number } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // exclusive
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);
  return { start, end, daysInMonth };
}

export function daysBetweenInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

/**
 * Aggregate attendance rows for the month into a summary + LOP days.
 * LOP = absent × 1 + half_day × 0.5 (when lopEnabled). Missing attendance
 * data is NOT treated as LOP (no data ≠ absence) — flagged via noData.
 */
export function summarizeAttendance(
  rows: Array<{ status: string }>,
  employedDays: number,
  lopEnabled: boolean,
): { summary: AttendanceSummary; lopDays: number } {
  const summary: AttendanceSummary = {
    present: 0, late: 0, halfDay: 0, onLeave: 0, holiday: 0, weekend: 0, absent: 0,
    noData: rows.length === 0,
  };
  for (const row of rows) {
    switch ((row.status || '').toLowerCase()) {
      case 'present': summary.present += 1; break;
      case 'late': summary.late += 1; break;
      case 'half_day': summary.halfDay += 1; break;
      case 'on_leave': summary.onLeave += 1; break;
      case 'holiday': summary.holiday += 1; break;
      case 'weekend': summary.weekend += 1; break;
      case 'absent': summary.absent += 1; break;
      default: break;
    }
  }
  const rawLop = summary.absent + summary.halfDay * 0.5;
  const lopDays = lopEnabled ? Math.min(rawLop, employedDays) : 0;
  return { summary, lopDays: r2(lopDays) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-employee month computation
// ─────────────────────────────────────────────────────────────────────────────

interface EngineEmployee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  dateOfJoining: Date;
  salary: number | null;
  salaryCurrency?: string | null;
  salaryStructure?: {
    id: string;
    components: Array<{ name: string; type: string; category: string; value: number; calculationType: string }>;
  } | null;
}

export interface ComputeEmployeeMonthOptions {
  month: number;
  year: number;
  settings: PayrollSettingsData;
  processingMode: 'auto' | 'manual';
  processedBy?: string;
}

/**
 * Compute one employee's payroll for a month from their salary structure +
 * attendance. Returns null when the employee has no structure/salary or the
 * month predates their joining.
 */
export async function computeEmployeeMonth(
  db: PrismaClient,
  employee: EngineEmployee,
  opts: ComputeEmployeeMonthOptions,
): Promise<Omit<EmployeeMonthResult, 'status'> & { data?: Record<string, unknown> } | null> {
  const { month, year, settings } = opts;
  const { start, end, daysInMonth } = monthWindow(month, year);

  const doj = new Date(employee.dateOfJoining);
  const dojDay = Date.UTC(doj.getFullYear(), doj.getMonth(), doj.getDate());
  const monthEnd = new Date(end.getTime() - 1); // last millisecond of month
  if (dojDay > monthEnd.getTime()) return null; // joined after this month

  // Gross target: structure gross (sum of earning components) or employee.salary
  let structureGross = 0;
  const structureComponents = (employee.salaryStructure?.components || [])
    .filter((c) => c.type === 'earning')
    .map((c) => ({ name: c.name, value: c.value }));
  for (const c of structureComponents) structureGross += c.value;
  if (structureGross <= 0 && employee.salary && employee.salary > 0) {
    structureGross = employee.salary;
  }
  if (structureGross <= 0) return null; // no salary defined — cannot process

  // Employed window within the month
  const windowStart = dojDay > start.getTime() ? new Date(dojDay) : start;
  const employedDays = daysBetweenInclusive(windowStart, monthEnd);

  // Attendance → LOP (only rows within the employed window)
  const attendanceRows = await db.attendance.findMany({
    where: { employeeId: employee.id, date: { gte: windowStart, lte: monthEnd } },
    select: { status: true },
  });
  const { summary, lopDays } = summarizeAttendance(attendanceRows, employedDays, settings.lopEnabled);
  const paidDays = r2(Math.max(0, employedDays - lopDays));
  // Task 125 — FIXED-GROSS payslip presentation (user directive): the gross on
  // a payslip must stay at the structure gross, so earnings are prorated ONLY
  // for the joiner window (DOJ mid-month → employedDays < daysInMonth). Loss
  // of Pay is no longer taken out of the earnings — it is presented as its own
  // deduction line (lopDeduction) at the monthly daily rate. Net pay is
  // unchanged versus the previous paid-days proration:
  //   G×(E−lop)/D  ≡  G×E/D − G×lop/D
  const employedFactor = daysInMonth > 0 ? employedDays / daysInMonth : 1;

  // Earnings (prorated by the employment window only — gross stays fixed)
  const basicComponent = structureComponents.length > 0
    ? structureComponents
    : buildEarnings(structureGross, settings);
  const earned = basicComponent.map((c) => ({ name: c.name, full: c.value, value: r2(c.value * employedFactor) }));
  const grossEarned = r2(earned.reduce((s, c) => s + c.value, 0));
  const basicEarned = earned[0]?.value ?? 0;

  // Statutory deductions
  const pfWage = Math.min(basicEarned, settings.pfWageCeiling);
  const pf = settings.pfEnabled ? r2((pfWage * settings.pfEmployeePct) / 100) : 0;
  const esiEligible = settings.esiEnabled && structureGross <= settings.esiWageCeiling;
  const esi = esiEligible ? r2((grossEarned * settings.esiEmployeePct) / 100) : 0;
  const pt = computeProfessionalTax(structureGross, settings);
  const regime = settings.taxRegime === 'OLD' ? 'OLD' : 'NEW';
  const tax = settings.tdsEnabled ? computeMonthlyTds(structureGross, regime) : 0;
  const professionalTax = pt;
  // Loss of Pay (Task 125): explicit deduction line — full-structure gross ×
  // LOP days ÷ calendar days. lopDays is already 0 when lopEnabled is off.
  const lopDeduction = daysInMonth > 0 ? r2((structureGross * lopDays) / daysInMonth) : 0;

  const totalDeductions = r2(pf + esi + tax + professionalTax + lopDeduction);
  const netSalary = r2(grossEarned - totalDeductions);

  // Map earning components into the Payroll model columns
  const findComp = (needle: string): number => {
    const hit = earned.find((c) => c.name.toLowerCase().includes(needle));
    return hit ? hit.value : 0;
  };
  const basicSalary = findComp('basic');
  const hra = findComp('house rent') || findComp('hra');
  const da = findComp('dearness') || findComp('da ');
  const conveyance = findComp('conveyance');
  const medical = findComp('medical');
  const otherAllowances = r2(earned
    .filter((c) => !['basic', 'house rent', 'hra', 'dearness', 'da ', 'conveyance', 'medical']
      .some((n) => c.name.toLowerCase().includes(n)))
    .reduce((s, c) => s + c.value, 0));

  const data = {
    employeeId: employee.id,
    month,
    year,
    basicSalary,
    hra,
    da,
    conveyance,
    medical,
    otherAllowances,
    grossSalary: grossEarned,
    pf,
    esi,
    tax,
    professionalTax,
    otherDeductions: 0,
    lopDeduction,
    totalDeductions,
    netSalary,
    currency: employee.salaryCurrency || 'INR',
    status: 'processed' as const,
    totalDays: employedDays,
    paidDays,
    lopDays,
    attendanceJson: JSON.stringify(summary),
    processingMode: opts.processingMode,
    processedBy: opts.processedBy || null,
    processedAt: new Date(),
  };

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
    month,
    year,
    gross: grossEarned,
    net: netSalary,
    lopDays,
    paidDays,
    totalDays: employedDays,
    data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Company-level processing (backfill capable)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessCompanyOptions {
  companyId: string;
  month?: number; // target month (default: previous month; or current if currentMonth=true)
  year?: number;
  currentMonth?: boolean; // process the running month instead of the previous one
  backfill?: boolean; // fill every missing month from earliest DOJ to target
  employeeIds?: string[];
  force?: boolean; // recompute even if a row already exists (overwrites)
  processingMode?: 'auto' | 'manual';
  processedBy?: string;
}

export interface ProcessCompanyResult {
  companyId: string;
  targetPeriod: string;
  mode: 'auto' | 'manual';
  created: number;
  skipped: number;
  failed: number;
  totalGross: number;
  totalNet: number;
  details: EmployeeMonthResult[];
  monthsCovered: string[];
}

/**
 * Process payroll for one company. In backfill mode every missing month from
 * the earliest joining date (capped at the FY boundary of the target) through
 * the target month is filled; otherwise only the target month is processed.
 * Existing rows are skipped unless force=true.
 */
export async function processPayrollForCompany(
  db: PrismaClient,
  opts: ProcessCompanyOptions,
): Promise<ProcessCompanyResult> {
  const settings = await resolvePayrollSettings(db, opts.companyId);
  const mode: 'auto' | 'manual' = opts.processingMode || (settings.processingMode === 'auto' ? 'auto' : 'manual');

  const now = new Date();
  let targetMonth = opts.month;
  let targetYear = opts.year;
  if (!targetMonth || !targetYear) {
    if (opts.currentMonth) {
      targetMonth = now.getUTCMonth() + 1;
      targetYear = now.getUTCFullYear();
    } else {
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      targetMonth = prev.getUTCMonth() + 1;
      targetYear = prev.getUTCFullYear();
    }
  }

  // Employee scope: active employees of the company (optionally filtered)
  const empWhere: Record<string, unknown> = {
    companyId: opts.companyId,
    status: 'active',
    OR: [{ salaryStructureId: { not: null } }, { salary: { gt: 0 } }],
  };
  if (opts.employeeIds && opts.employeeIds.length > 0) empWhere.id = { in: opts.employeeIds };

  const employees = await db.employee.findMany({
    where: empWhere,
    select: {
      id: true, firstName: true, lastName: true, dateOfJoining: true,
      salary: true, salaryCurrency: true, salaryStructureId: true,
    },
    orderBy: { dateOfJoining: 'asc' },
  });

  // Attach structures (no Prisma relation on Employee.salaryStructureId — scalar FK)
  const structureIds = [...new Set(employees.map((e) => e.salaryStructureId).filter(Boolean))] as string[];
  const structures = structureIds.length > 0
    ? await db.salaryStructure.findMany({
        where: { id: { in: structureIds } },
        include: { components: { where: { status: 'active' }, orderBy: { sortOrder: 'asc' } } },
      })
    : [];
  const structureMap = new Map(structures.map((s) => [s.id, s]));

  // Build the month list: backfill (from earliest DOJ) → target
  const months: Array<{ month: number; year: number }> = [];
  const pushMonth = (m: number, y: number) => months.push({ month: m, year: y });
  if (opts.backfill && employees.length > 0) {
    const earliestDoj = employees.reduce((min, e) => (new Date(e.dateOfJoining) < min ? new Date(e.dateOfJoining) : min), new Date(employees[0].dateOfJoining));
    let y = earliestDoj.getUTCFullYear();
    let m = earliestDoj.getUTCMonth() + 1;
    while (y < targetYear! || (y === targetYear! && m <= targetMonth!)) {
      pushMonth(m, y);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  } else {
    pushMonth(targetMonth!, targetYear!);
  }

  const details: EmployeeMonthResult[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let totalGross = 0;
  let totalNet = 0;

  // Task 127 — before computing, derive missing ABSENT rows for every month
  // being processed (past working days with no punch row, no approved leave).
  // Without this, days after the last manual backfill silently become paid
  // days and LOP under-counts. Gated: only when attendance is actively used.
  for (const { month, year } of months) {
    try {
      await deriveMissingAbsents(db, { companyId: opts.companyId, month, year });
    } catch (e) {
      console.error('[payroll] absent derivation failed (non-fatal):', e instanceof Error ? e.message : e);
    }
  }

  for (const { month, year } of months) {
    for (const employee of employees) {
      try {
        const existing = await db.payroll.findUnique({
          where: { employeeId_month_year: { employeeId: employee.id, month, year } },
          select: { id: true, status: true },
        });
        if (existing && !opts.force) {
          skipped += 1;
          details.push({
            employeeId: employee.id,
            employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
            month, year, status: 'skipped', reason: 'already exists',
          });
          continue;
        }

        const structure = employee.salaryStructureId ? structureMap.get(employee.salaryStructureId) : null;
        const computed = await computeEmployeeMonth(
          db,
          { ...employee, salaryStructure: structure ? { id: structure.id, components: structure.components } : null },
          { month, year, settings, processingMode: mode, processedBy: opts.processedBy },
        );
        if (!computed || !computed.data) {
          skipped += 1;
          details.push({
            employeeId: employee.id,
            employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
            month, year, status: 'skipped',
            reason: 'no salary structure / before joining',
          });
          continue;
        }

        if (existing && opts.force) {
          await db.payroll.update({ where: { id: existing.id }, data: computed.data });
        } else {
          await db.payroll.create({ data: computed.data as never });
        }
        created += 1;
        totalGross += computed.gross || 0;
        totalNet += computed.net || 0;
        details.push({
          employeeId: employee.id,
          employeeName: computed.employeeName,
          month, year, status: 'created',
          gross: computed.gross, net: computed.net,
          lopDays: computed.lopDays, paidDays: computed.paidDays, totalDays: computed.totalDays,
        });
      } catch (err) {
        failed += 1;
        details.push({
          employeeId: employee.id,
          employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
          month, year, status: 'skipped',
          reason: `error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return {
    companyId: opts.companyId,
    targetPeriod: `${targetYear!}-${String(targetMonth!).padStart(2, '0')}`,
    mode,
    created,
    skipped,
    failed,
    totalGross: r2(totalGross),
    totalNet: r2(totalNet),
    details,
    monthsCovered: months.map(({ month, year }) => `${year}-${String(month).padStart(2, '0')}`),
  };
}
