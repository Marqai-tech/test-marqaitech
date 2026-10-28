/**
 * ═══════════════════════════════════════════════════════════════════════
 * 3Boxes HRMS — INDIA STATUTORY PAYROLL ENGINE (single source of truth)
 * ═══════════════════════════════════════════════════════════════════════
 * All India-specific statutory computations live here so that payroll
 * processing, the CTC calculator, TDS projections and statutory report
 * generation all use the SAME rules.
 *
 * Covers:
 *  1. EPF        — 12% EE + 12% ER on Basic+DA, statutory wage ceiling
 *                  ₹15,000 (EPS split 8.33%, admin 0.5% min ₹500, EDLI 0.5%)
 *  2. ESIC       — 0.75% EE + 3.25% ER when gross ≤ ₹21,000 (₹25,000 PwD)
 *  3. PT         — state-wise slab tables (MH, KA, DL, TN, TG, GJ, WB, MP, UP, KL…)
 *  4. LWF        — state-wise employee/employer contributions + frequency
 *  5. TDS        — Old regime (FY 2024-25 & 2025-26, age groups) and New
 *                  default regime, 87A rebate, surcharge with marginal
 *                  relief, 4% health & education cess, HRA exemption
 *                  (least-of-three), monthly TDS projection with
 *                  Apr–Dec declared / Jan–Feb–Mar verified true-up.
 *  6. F&F India  — Gratuity (15/26, ₹20L cap), leave encashment exemption
 *                  (Sec 10(10AA) ₹25,00,000 cap), notice-period buy-out.
 *
 * Slab values are current as of FY 2025-26 (AY 2026-27). When the
 * government notifies changes, update the SLAB_* tables below — nothing
 * else in the codebase needs to change.
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. EPF — Employees' Provident Fund (EPF & MP Act, 1952)
// ─────────────────────────────────────────────────────────────────────────

export const EPF_WAGE_CEILING = 15000;      // ₹15,000/month statutory ceiling
export const EPF_EMPLOYEE_RATE = 0.12;
export const EPF_EMPLOYER_RATE = 0.12;
export const EPF_EPS_SHARE = 0.0833;        // of wage (capped) routed to pension
export const EPF_ADMIN_RATE = 0.005;        // EPF admin charges
export const EPF_ADMIN_MIN = 500;           // ₹500/month minimum (non-functional est. w/ ₹0 wage)
export const EDLI_ADMIN_RATE = 0.005;

export interface EPFResult {
  epfWage: number;          // wage on which 12% applies
  employeeShare: number;    // 12% EE
  employerShare: number;    // 12% ER (EPS + EPF)
  epsShare: number;         // 8.33% of epfWage → pension
  epfShare: number;         // remainder → EPF
  adminCharges: number;     // 0.5% (min ₹500)
  edliCharges: number;      // 0.5%
  capped: boolean;          // true if statutory ceiling applied
}

export function calculateEPF(
  basicDa: number,
  opts: { onActualBasic?: boolean; wageCeiling?: number; adminCharges?: boolean } = {}
): EPFResult {
  const { onActualBasic = false, wageCeiling = EPF_WAGE_CEILING, adminCharges = true } = opts;
  const wage = Math.max(0, basicDa);
  const epfWage = onActualBasic ? wage : Math.min(wage, wageCeiling);
  const capped = !onActualBasic && wage > wageCeiling;

  const employeeShare = round2(epfWage * EPF_EMPLOYEE_RATE);
  const employerTotal = epfWage * EPF_EMPLOYER_RATE;
  const epsShare = round2(Math.min(employerTotal * (EPF_EPS_SHARE / EPF_EMPLOYER_RATE), epfWage * EPF_EPS_SHARE));
  const epfShare = round2(employerTotal - epsShare);

  const adminChargesAmt = adminCharges ? Math.max(round2(wage * EPF_ADMIN_RATE), wage > 0 ? EPF_ADMIN_MIN : 0) : 0;
  const edliCharges = adminCharges ? round2(wage * EDLI_ADMIN_RATE) : 0;

  return {
    epfWage,
    employeeShare,
    employerShare: round2(employerTotal),
    epsShare,
    epfShare,
    adminCharges: adminChargesAmt,
    edliCharges,
    capped,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. ESIC — Employees' State Insurance (ESI Act, 1948)
// ─────────────────────────────────────────────────────────────────────────

export const ESI_WAGE_LIMIT = 21000;        // ₹21,000 gross/month (₹25,000 for PwD)
export const ESI_WAGE_LIMIT_PWD = 25000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;

export interface ESIResult {
  applicable: boolean;
  gross: number;
  employeeShare: number;
  employerShare: number;
  total: number;
}

/** ESIC shares are rounded UP to the next rupee as per ESIC portal practice. */
export function calculateESIC(grossMonthly: number, opts: { enabled?: boolean; wageLimit?: number; pwd?: boolean } = {}): ESIResult {
  const { enabled = true, wageLimit = ESI_WAGE_LIMIT, pwd = false } = opts;
  const gross = Math.max(0, grossMonthly);
  const limit = pwd ? Math.max(wageLimit, ESI_WAGE_LIMIT_PWD) : wageLimit;
  const applicable = enabled && gross <= limit;

  if (!applicable) return { applicable: false, gross, employeeShare: 0, employerShare: 0, total: 0 };

  const employeeShare = Math.ceil(gross * ESI_EMPLOYEE_RATE);
  const employerShare = Math.ceil(gross * ESI_EMPLOYER_RATE);
  return { applicable: true, gross, employeeShare, employerShare, total: employeeShare + employerShare };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Professional Tax — state-wise slabs (monthly unless noted)
// ─────────────────────────────────────────────────────────────────────────

export interface PTSlab { upTo: number; amount: number; femaleAmount?: number; specialMonths?: Record<number, number> }

/**
 * Representative PT slabs for major states. Amounts are ₹/month unless the
 * state is in PT_HALF_YEARLY_STATES (deducted June & December).
 * Configure per company via PayrollStatutoryConfig.ptState.
 */
export const PT_STATE_TABLES: Record<string, PTSlab[]> = {
  MH: [ // Maharashtra (max ₹2,500/yr → ₹200 × 11 + ₹300 Feb)
    { upTo: 7500, amount: 0, femaleAmount: 0 },
    { upTo: 10000, amount: 175, femaleAmount: 0, specialMonths: { 2: 175 } },
    { upTo: Infinity, amount: 200, femaleAmount: 200, specialMonths: { 2: 300 } },
  ],
  KA: [ // Karnataka (₹200 above ₹25,000)
    { upTo: 24999.99, amount: 0, femaleAmount: 0 },
    { upTo: Infinity, amount: 200, femaleAmount: 200, specialMonths: { 2: 300 } },
  ],
  TN: [ // Tamil Nadu — HALF-YEARLY June & December
    { upTo: 3500, amount: 0 },
    { upTo: 7500, amount: 45.5 },
    { upTo: 10000, amount: 90 },
    { upTo: 12500, amount: 137.5 },
    { upTo: Infinity, amount: 208.5 },
  ],
  TG: [ // Telangana
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 150, femaleAmount: 0 },
    { upTo: Infinity, amount: 200, femaleAmount: 200, specialMonths: { 2: 300 } },
  ],
  AP: [ // Andhra Pradesh
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 150 },
    { upTo: Infinity, amount: 200, specialMonths: { 2: 300 } },
  ],
  GJ: [ // Gujarat — HALF-YEARLY June & December (per half-year amounts)
    { upTo: 5999, amount: 0 },
    { upTo: 8999, amount: 42 },
    { upTo: 11999, amount: 84 },
    { upTo: Infinity, amount: 150 },
  ],
  WB: [ // West Bengal
    { upTo: 5000, amount: 0 },
    { upTo: 6500, amount: 45 },
    { upTo: 10000, amount: 90 },
    { upTo: 15000, amount: 110 },
    { upTo: 25000, amount: 130, specialMonths: { 2: 200 } },
    { upTo: 40000, amount: 150, specialMonths: { 2: 200 } },
    { upTo: Infinity, amount: 200, specialMonths: { 2: 200 } },
  ],
  MP: [ // Madhya Pradesh
    { upTo: 12500, amount: 0, femaleAmount: 0 },
    { upTo: 18750, amount: 125 },
    { upTo: Infinity, amount: 212, specialMonths: { 2: 212 } },
  ],
  KL: [ // Kerala — HALF-YEARLY June & December
    { upTo: 1999, amount: 0 },
    { upTo: 2999, amount: 10 },
    { upTo: 4999, amount: 15 },
    { upTo: 7499, amount: 30 },
    { upTo: 9999, amount: 45 },
    { upTo: 12499, amount: 60 },
    { upTo: Infinity, amount: 104 },
  ],
  DL: [ // Delhi
    { upTo: 10877, amount: 0 },
    { upTo: 21515, amount: 125, femaleAmount: 0 },
    { upTo: Infinity, amount: 200, femaleAmount: 200, specialMonths: { 2: 300 } },
  ],
  UP: [ // Uttar Pradesh
    { upTo: 12500, amount: 0 },
    { upTo: 18750, amount: 50 },
    { upTo: 25000, amount: 100 },
    { upTo: Infinity, amount: 200 },
  ],
};

/** States that deduct PT as a single half-yearly instalment (June + December). */
export const PT_HALF_YEARLY_STATES = new Set(['TN', 'GJ', 'KL']);

export interface PTResult {
  applicable: boolean;
  state: string | null;
  amount: number;      // for THIS month
  annualized: number;  // approximate annual total for reference
}

export function calculatePT(
  grossMonthly: number,
  stateCode: string | null | undefined,
  month: number,
  gender: string = 'male'
): PTResult {
  const state = (stateCode || '').toUpperCase();
  const table = PT_STATE_TABLES[state];
  if (!table) return { applicable: false, state: state || null, amount: 0, annualized: 0 };

  const female = (gender || '').toLowerCase().startsWith('f');
  const slab = table.find(s => grossMonthly <= s.upTo) || table[table.length - 1];
  let amount = female && slab.femaleAmount !== undefined ? slab.femaleAmount : slab.amount;

  const halfYearly = PT_HALF_YEARLY_STATES.has(state);
  if (halfYearly) {
    amount = month === 6 || month === 12 ? amount : 0;
  } else if (slab.specialMonths && slab.specialMonths[month] !== undefined) {
    amount = female && slab.femaleAmount !== undefined ? slab.femaleAmount : slab.specialMonths[month];
  }

  return {
    applicable: amount > 0,
    state,
    amount: Math.round(amount),
    annualized: Math.round(halfYearly ? amount * 2 : 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Labour Welfare Fund — state-wise (deducted monthly / June / December)
// ─────────────────────────────────────────────────────────────────────────

export interface LWFEntry { employee: number; employer: number; frequency: 'MONTHLY' | 'HALF_YEARLY' }

export const LWF_STATE_TABLES: Record<string, LWFEntry> = {
  MH: { employee: 12, employer: 36, frequency: 'HALF_YEARLY' },   // Jun & Dec
  KA: { employee: 20, employer: 40, frequency: 'MONTHLY' },
  TN: { employee: 20, employer: 20, frequency: 'MONTHLY' },
  TG: { employee: 2, employer: 5, frequency: 'MONTHLY' },
  GJ: { employee: 6, employer: 12, frequency: 'HALF_YEARLY' },
  MP: { employee: 25, employer: 75, frequency: 'MONTHLY' },
  DL: { employee: 0.75, employer: 7.5, frequency: 'HALF_YEARLY' }, // Delhi Labour & Welfare Board
  KL: { employee: 20, employer: 20, frequency: 'MONTHLY' },
  WB: { employee: 3, employer: 12, frequency: 'MONTHLY' },
  AP: { employee: 2, employer: 5, frequency: 'MONTHLY' },
};

export interface LWFResult {
  applicable: boolean;
  state: string | null;
  employeeAmount: number;
  employerAmount: number;
  frequency: string | null;
}

export function calculateLWF(stateCode: string | null | undefined, month: number): LWFResult {
  const state = (stateCode || '').toUpperCase();
  const entry = LWF_STATE_TABLES[state];
  if (!entry) return { applicable: false, state: state || null, employeeAmount: 0, employerAmount: 0, frequency: null };

  const dueThisMonth = entry.frequency === 'MONTHLY' || month === 6 || month === 12;
  if (!dueThisMonth) {
    return { applicable: true, state, employeeAmount: 0, employerAmount: 0, frequency: entry.frequency };
  }
  return {
    applicable: true,
    state,
    employeeAmount: entry.employee,
    employerAmount: entry.employer,
    frequency: entry.frequency,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. HRA exemption — Section 10(13A) least-of-three
// ─────────────────────────────────────────────────────────────────────────

export interface HRAExemptionResult {
  actualHRA: number;
  rentMinus10PctBasic: number;
  pctOfBasic: number;
  exempt: number;
  taxable: number;
  metroPercent: number;
}

export function calculateHRAExemption(
  actualHRA: number,
  basicDaMonthly: number,
  rentPaidMonthly: number,
  isMetro: boolean
): HRAExemptionResult {
  const pct = isMetro ? 0.50 : 0.40;
  const exempt = Math.max(0, Math.min(
    Math.max(0, actualHRA),
    Math.max(0, rentPaidMonthly - 0.10 * basicDaMonthly),
    pct * basicDaMonthly
  ));
  return {
    actualHRA: Math.max(0, actualHRA),
    rentMinus10PctBasic: Math.max(0, rentPaidMonthly - 0.10 * basicDaMonthly),
    pctOfBasic: pct * basicDaMonthly,
    exempt: round2(exempt),
    taxable: round2(Math.max(0, actualHRA - exempt)),
    metroPercent: pct,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Income Tax (TDS) — dual regime
// ─────────────────────────────────────────────────────────────────────────

export type Regime = 'OLD' | 'NEW';
export type AgeGroup = 'BELOW_60' | 'SENIOR' | 'ABOVE_80';

export const SUPPORTED_FY = ['2024-25', '2025-26'] as const;
export type FY = (typeof SUPPORTED_FY)[number];

const OLD_REGIME_SLABS: Record<AgeGroup, Array<{ limit: number; rate: number }>> = {
  BELOW_60: [{ limit: 250000, rate: 0 }, { limit: 500000, rate: 0.05 }, { limit: 1000000, rate: 0.20 }, { limit: Infinity, rate: 0.30 }],
  SENIOR:   [{ limit: 300000, rate: 0 }, { limit: 500000, rate: 0.05 }, { limit: 1000000, rate: 0.20 }, { limit: Infinity, rate: 0.30 }],
  ABOVE_80: [{ limit: 500000, rate: 0 }, { limit: 1000000, rate: 0.20 }, { limit: Infinity, rate: 0.30 }],
};

const NEW_REGIME_SLABS: Record<FY, Array<{ limit: number; rate: number }>> = {
  // FY 2024-25 (AY 2025-26) — ₹3L basic exemption, 87A rebate ₹25,000 up to ₹7L
  '2024-25': [
    { limit: 300000, rate: 0 }, { limit: 700000, rate: 0.05 }, { limit: 1000000, rate: 0.10 },
    { limit: 1200000, rate: 0.15 }, { limit: 1500000, rate: 0.20 }, { limit: Infinity, rate: 0.30 },
  ],
  // FY 2025-26 (AY 2026-27, Budget 2025) — ₹4L exemption, 87A rebate ₹60,000 up to ₹12L
  '2025-26': [
    { limit: 400000, rate: 0 }, { limit: 800000, rate: 0.05 }, { limit: 1200000, rate: 0.10 },
    { limit: 1600000, rate: 0.15 }, { limit: 2000000, rate: 0.20 }, { limit: 2400000, rate: 0.25 },
    { limit: Infinity, rate: 0.30 },
  ],
};

export const OLD_REGIME_STD_DEDUCTION = 50000;
export const NEW_REGIME_STD_DEDUCTION: Record<FY, number> = { '2024-25': 75000, '2025-26': 75000 };

const CESS_RATE = 0.04;

export interface OldRegimeDeductions {
  section80C?: number;      // cap ₹1,50,000
  section80D?: number;      // cap ₹25,000 (₹50,000 senior)
  section80CCD1B?: number;  // NPS extra — cap ₹50,000
  section80E?: number;      // education loan interest — no cap
  section80G?: number;      // donations — as declared
  section24b?: number;      // home loan interest — cap ₹2,00,000
  hraExemption?: number;    // from least-of-three
  professionalTax?: number; // state PT actually paid
  section80TTA?: number;    // savings interest — cap ₹10,000
  otherExempt?: number;     // LTA etc.
  standardDeduction?: number;
}

export interface TaxResult {
  regime: Regime;
  grossAnnual: number;
  totalDeductions: number;
  taxableIncome: number;
  taxOnSlabs: number;
  rebate87A: number;
  surcharge: number;
  marginalRelief: number;
  cess: number;
  totalTax: number;
  slabBreakdown: Array<{ from: number; to: number; rate: number; tax: number }>;
  fy: FY;
}

function slabTax(income: number, slabs: Array<{ limit: number; rate: number }>) {
  let tax = 0, remaining = income, prev = 0;
  const breakdown: Array<{ from: number; to: number; rate: number; tax: number }> = [];
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, slab.limit - prev);
    const sliceTax = slice * slab.rate;
    tax += sliceTax;
    breakdown.push({ from: prev + 1, to: slab.limit === Infinity ? Infinity : slab.limit, rate: slab.rate * 100, tax: round2(sliceTax) });
    remaining -= slice;
    prev = slab.limit;
  }
  return { tax: round2(tax), breakdown };
}

export function calculateOldRegimeTax(taxableIncome: number, ageGroup: AgeGroup = 'BELOW_60', fy: FY = '2025-26'): Omit<TaxResult, 'regime' | 'grossAnnual' | 'totalDeductions'> {
  const slabs = OLD_REGIME_SLABS[ageGroup] || OLD_REGIME_SLABS.BELOW_60;
  const { tax, breakdown } = slabTax(taxableIncome, slabs);
  // 87A rebate — old regime: ₹12,500 when total income ≤ ₹5,00,000
  let rebate = 0;
  if (taxableIncome <= 500000) rebate = Math.min(tax, 12500);
  const afterRebate = tax - rebate;

  const { surcharge, relief } = surchargeWithRelief(taxableIncome, afterRebate, 'OLD');

  const cess = round2((afterRebate + surcharge - relief) * CESS_RATE);
  const totalTax = Math.max(0, Math.round(afterRebate + surcharge - relief + cess));
  return {
    taxableIncome,
    taxOnSlabs: tax,
    rebate87A: rebate,
    surcharge,
    marginalRelief: relief,
    cess,
    totalTax,
    slabBreakdown: breakdown,
    fy,
  };
}

export function calculateNewRegimeTax(taxableIncome: number, fy: FY = '2025-26'): Omit<TaxResult, 'regime' | 'grossAnnual' | 'totalDeductions'> {
  const slabs = NEW_REGIME_SLABS[fy] || NEW_REGIME_SLABS['2025-26'];
  const { tax, breakdown } = slabTax(taxableIncome, slabs);
  // 87A rebate — new regime
  let rebate = 0;
  if (fy === '2025-26') {
    if (taxableIncome <= 1200000) rebate = Math.min(tax, 60000);
  } else {
    if (taxableIncome <= 700000) rebate = Math.min(tax, 25000);
  }
  const afterRebate = tax - rebate;

  const { surcharge, relief } = surchargeWithRelief(taxableIncome, afterRebate, 'NEW');

  const cess = round2((afterRebate + surcharge - relief) * CESS_RATE);
  const totalTax = Math.max(0, Math.round(afterRebate + surcharge - relief + cess));
  return {
    taxableIncome,
    taxOnSlabs: tax,
    rebate87A: rebate,
    surcharge,
    marginalRelief: relief,
    cess,
    totalTax,
    slabBreakdown: breakdown,
    fy,
  };
}

function surchargeWithRelief(income: number, taxAfterRebate: number, regime: Regime) {
  let rate = 0;
  if (income > 50000000) rate = regime === 'OLD' ? 0.37 : 0.25;
  else if (income > 20000000) rate = 0.25;
  else if (income > 10000000) rate = 0.15;
  else if (income > 5000000) rate = 0.10;
  const surcharge = round2(taxAfterRebate * rate);
  if (surcharge === 0) return { surcharge: 0, relief: 0 };

  // Marginal relief: tax + surcharge cannot exceed (income − threshold) + tax at threshold
  const slabs = regime === 'OLD' ? OLD_REGIME_SLABS.BELOW_60 : NEW_REGIME_SLABS['2025-26'];
  const thresholdBands: Array<[number, number]> = regime === 'OLD'
    ? [[5000000, 0.10], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]]
    : [[5000000, 0.10], [10000000, 0.15], [20000000, 0.25]];

  let relief = 0;
  for (const [threshold, thresholdRate] of thresholdBands) {
    if (income > threshold) {
      const excess = income - threshold;
      const taxAtThreshold = slabTax(threshold, slabs).tax;
      const totalAtThreshold = taxAtThreshold * (1 + thresholdRate);
      const totalNow = taxAfterRebate + surcharge;
      const maxAllowed = totalAtThreshold + excess;
      if (totalNow > maxAllowed) relief = round2(totalNow - maxAllowed);
      break;
    }
  }
  return { surcharge, relief: Math.min(relief, surcharge) };
}

/** Full India tax computation for one employee-year (both regimes computed). */
export function computeIndiaTaxBothRegimes(params: {
  annualGross: number;
  ageGroup?: AgeGroup;
  fy?: FY;
  oldDeductions?: OldRegimeDeductions;
}): { newRegime: TaxResult; oldRegime: TaxResult; betterRegime: Regime; savings: number } {
  const { annualGross, ageGroup = 'BELOW_60', fy = '2025-26', oldDeductions = {} } = params;

  // NEW regime: only standard deduction (₹75,000) — no chapter VI-A
  const newStd = NEW_REGIME_STD_DEDUCTION[fy];
  const newTaxable = Math.max(0, annualGross - newStd);
  const nr = calculateNewRegimeTax(newTaxable, fy);
  const newRegime: TaxResult = { regime: 'NEW', grossAnnual: annualGross, totalDeductions: newStd, ...nr };

  // OLD regime: std deduction + chapter VI-A + HRA + PT + LTA
  const d = oldDeductions;
  const capped: OldRegimeDeductions = {
    ...d,
    standardDeduction: OLD_REGIME_STD_DEDUCTION,
    section80C: Math.min(d.section80C || 0, 150000),
    section80D: Math.min(d.section80D || 0, ageGroup === 'BELOW_60' ? 25000 : 50000),
    section80CCD1B: Math.min(d.section80CCD1B || 0, 50000),
    section24b: Math.min(d.section24b || 0, 200000),
    section80TTA: Math.min(d.section80TTA || 0, 10000),
  };
  const oldTotal = Object.values(capped).reduce((s, v) => s + (Number(v) || 0), 0);
  const oldTaxable = Math.max(0, annualGross - oldTotal);
  const or = calculateOldRegimeTax(oldTaxable, ageGroup, fy);
  const oldRegime: TaxResult = { regime: 'OLD', grossAnnual: annualGross, totalDeductions: oldTotal, ...or };

  const betterRegime: Regime = newRegime.totalTax <= oldRegime.totalTax ? 'NEW' : 'OLD';
  return { newRegime, oldRegime, betterRegime, savings: Math.abs(newRegime.totalTax - oldRegime.totalTax) };
}

/** Pick the elected (or configured default) regime result from a both-regime computation. */
export function pickRegime(both: ReturnType<typeof computeIndiaTaxBothRegimes>, regime: Regime): TaxResult {
  return regime === 'OLD' ? both.oldRegime : both.newRegime;
}

// ─────────────────────────────────────────────────────────────────────────
// 6b. Monthly TDS projection (Apr → Mar India financial year)
// ─────────────────────────────────────────────────────────────────────────

export interface TDSProjectionInput {
  projectedAnnualGross: number;
  regime: Regime;
  ageGroup?: AgeGroup;
  fy?: FY;
  declaration?: OldRegimeDeductions;        // Apr–Dec: declared numbers
  verifiedDeductions?: OldRegimeDeductions; // Jan–Mar (post proof verification)
  monthsElapsed: number;                    // months already processed this FY (0-12)
  taxDeductedSoFar: number;                 // cumulative TDS already recovered
}

export interface TDSProjectionResult {
  annualTax: number;
  taxRemaining: number;
  monthsRemaining: number;
  monthlyTDS: number;
  appliedDeductions: 'DECLARED' | 'VERIFIED';
}

/**
 * Monthly TDS = (annual tax − tax recovered so far) ÷ remaining months.
 * From the proof-verification month onward, VERIFIED deductions replace
 * declared ones (Feb–Mar true-up); under-recovery spreads over remaining
 * months, over-recovery zeroes TDS (refund via ITR).
 */
export function projectMonthlyTDS(input: TDSProjectionInput): TDSProjectionResult {
  const { projectedAnnualGross, regime, ageGroup = 'BELOW_60', fy = '2025-26', declaration, verifiedDeductions, monthsElapsed, taxDeductedSoFar } = input;

  const isTrueUp = verifiedDeductions !== undefined && verifiedDeductions !== null;
  const deductions = isTrueUp ? { ...declaration, ...verifiedDeductions } : declaration;
  const both = computeIndiaTaxBothRegimes({ annualGross: projectedAnnualGross, ageGroup, fy, oldDeductions: deductions });
  const sel = pickRegime(both, regime);

  const monthsRemaining = Math.max(1, 12 - Math.min(12, Math.max(0, monthsElapsed)));
  const taxRemaining = Math.max(0, sel.totalTax - Math.max(0, taxDeductedSoFar));
  const monthlyTDS = Math.round(taxRemaining / monthsRemaining);

  return {
    annualTax: sel.totalTax,
    taxRemaining,
    monthsRemaining,
    monthlyTDS,
    appliedDeductions: isTrueUp ? 'VERIFIED' : 'DECLARED',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 7. F&F India helpers
// ─────────────────────────────────────────────────────────────────────────

export const GRATUITY_CAP = 2000000;              // ₹20 lakh
export const LEAVE_ENCASHMENT_EXEMPT_CAP = 2500000; // Sec 10(10AA) ₹25,00,000
export const GRATUITY_ELIGIBILITY_YEARS = 5;

/** Gratuity: 15/26 × last drawn (Basic+DA) × completed years. Establishments outside the Act use 15/30. */
export function calculateGratuity(
  lastDrawnBasicDa: number,
  yearsOfService: number,
  opts: { coveredByAct?: boolean } = {}
): { eligible: boolean; years: number; formula: string; raw: number; capped: boolean; amount: number } {
  const { coveredByAct = true } = opts;
  const completedYears = Math.floor(yearsOfService);
  const eligible = completedYears >= GRATUITY_ELIGIBILITY_YEARS;
  const divisor = coveredByAct ? 26 : 30;
  const raw = eligible ? (15 / divisor) * lastDrawnBasicDa * completedYears : 0;
  const capped = raw > GRATUITY_CAP;
  return {
    eligible,
    years: completedYears,
    formula: `15/${divisor} × ${round2(lastDrawnBasicDa)} × ${completedYears}`,
    raw: round2(raw),
    capped,
    amount: eligible ? Math.min(round2(raw), GRATUITY_CAP) : 0,
  };
}

/** Leave encashment: exempt up to ₹25,00,000 (Sec 10(10AA)), excess taxable. */
export function splitLeaveEncashmentTax(amount: number): { exempt: number; taxable: number; cap: number } {
  const exempt = Math.min(Math.max(0, amount), LEAVE_ENCASHMENT_EXEMPT_CAP);
  return { exempt: round2(exempt), taxable: round2(Math.max(0, amount - LEAVE_ENCASHMENT_EXEMPT_CAP)), cap: LEAVE_ENCASHMENT_EXEMPT_CAP };
}

/** Notice buy-out: shortfall days × (monthly salary / 30). */
export function calculateNoticeBuyout(monthlySalary: number, noticePeriodDays: number, noticeServedDays: number): { shortfallDays: number; buyoutAmount: number } {
  const shortfall = Math.max(0, noticePeriodDays - noticeServedDays);
  return { shortfallDays: shortfall, buyoutAmount: round2((monthlySalary / 30) * shortfall) };
}

// ─────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Map calendar month + year → India FY label, e.g. month 2/2026 → "2025-26". */
export function financialYearFor(month: number, year: number): FY {
  const fyStartYear = month >= 4 ? year : year - 1;
  const label = `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
  return (SUPPORTED_FY as readonly string[]).includes(label) ? (label as FY) : '2025-26';
}
