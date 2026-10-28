#!/usr/bin/env python3
"""Indian Payroll Manual — content part 1 (chapters 1-5)."""
import sys
sys.path.insert(0, "/home/z/my-project/scripts")
import india_manual_kit as k

ASSETS = "/home/z/my-project/scripts/manual_assets/india"


def build():
    # ════════════════════════ CHAPTER 1 ════════════════════════
    k.h1("1. Introduction & Module Architecture")
    k.body(
        "This manual documents how the 3Boxes HRMS Payroll module is built, how it is configured for the "
        "Indian statutory environment, and the standard operating procedures for running a compliant monthly "
        "payroll cycle from end to end. It is written for payroll specialists, HR administrators, finance "
        "controllers and tenant administrators who configure or operate payroll. Every screen referenced here "
        "is available in the product under the Payroll section of the sidebar, and the India-specific console "
        "is the <b>India Compliance Center</b>. All procedures apply equally to the demo environment used for "
        "training and to production tenants; the only difference is data."
    )
    k.body(
        "The module is a dual-generation architecture. The <b>processing engine</b> (Payroll Run) is the "
        "governed path: a run is created for a legal entity and period, employee-level transaction lines are "
        "computed by the statutory engine, the run advances through a forward-only lifecycle (OPEN → "
        "INPUT_COLLECTION → PROCESSING → REVIEW → APPROVED → ACCOUNTING → DISBURSED → CLOSED), and every "
        "disbursement is released only after review and approval. The <b>legacy flat ledger</b> (per "
        "employee/month payroll records) remains for self-service payslips and quick entries, and statutory "
        "report generation falls back to it when a period has no modern run. New implementations should use "
        "the Payroll Run path exclusively; the legacy path exists for continuity of simple tenants."
    )
    k.h2("1.1 What the statutory engine covers")
    k.body(
        "All India-specific computation lives in a single engine library, so processing, the CTC calculator, "
        "TDS projections and statutory filings always agree. The engine computes EPF (employee and employer "
        "shares with the ₹15,000 statutory wage ceiling or actual Basic when opted, EPS split at 8.33%, EPF "
        "admin charges and EDLI), ESIC (0.75% employee and 3.25% employer when gross salary is at or below "
        "₹21,000), Professional Tax from state-wise slab tables for eleven states including half-yearly "
        "states such as Tamil Nadu, Gujarat and Kerala, Labour Welfare Fund contributions by state with "
        "June/December remittance for half-yearly states, and Income Tax (TDS) under both the old regime and "
        "the new default regime with FY 2024-25 and FY 2025-26 slabs, Section 87A rebate, surcharge with "
        "marginal relief and the 4% health and education cess. Separation maths (gratuity, leave encashment "
        "exemption cap, notice buy-out) is part of the same library, guaranteeing that the Full & Final "
        "statement matches the payroll engine."
    )
    k.h2("1.2 Module map at a glance")
    k.tbl(
        ["Area", "Pages", "Purpose"],
        [
            ["Dashboards", "Payroll Dashboard, Group Dashboard", "Lifecycle KPIs, seed tools, group liability in base currency"],
            ["Masters", "Salary Types, Paycodes, Salary Structures (CTC), Cost Centers, CTC Calculator, Statutory Components, Income Tax Slabs, Gratuity, Currency & FX", "Country-scoped configuration of every earning, deduction and statutory rule"],
            ["Transactions", "Inputs, Readiness, Processing, Authorization, Overtime, Advance, F&F, Bank Files, Payslips, Secondment, AI Insights", "Run the monthly cycle, handle exceptions and disburse"],
            ["Reports", "Reports & Dashboard (Salary Register, Statutory, Variance, Standard, Dashboard), India Compliance Center", "Registers, filing-ready statutory formats, variance governance, India console"],
        ],
        [0.14, 0.44, 0.42],
    )
    k.callout(
        "Navigation tip: the India Compliance Center lives under Payroll → Reports → India Compliance Center. "
        "It consolidates statutory configuration, all eight filing formats, the declaration/proof cycle and "
        "variance governance in one console.", title="Where is everything?"
    )
    k.h2("1.3 The monthly cycle in one paragraph")
    k.body(
        "Between the 1st and the 20th, pre-payroll inputs converge on the payroll engine: HR records new "
        "joinees and exits, attendance and leave produce Loss-of-Pay days, and finance submits variable pay "
        "and bonuses. The readiness validation gate confirms every employee has a salary basis, payment "
        "method and no blocking holds. Calculation then produces transaction lines per employee: earnings "
        "from the CTC template, statutory deductions from the engine, a TDS projection from declarations, and "
        "net pay. The payroll specialist reviews the variance report against the previous month; any employee "
        "whose net pay moved more than the configured threshold (default 5%) is flagged for review and "
        "requires Finance Head approval before the bank advice file can be released. After disbursement, "
        "payslips are released, statutory registers and filing formats are generated, and the run is closed "
        "under an audited lock."
    )

    # ════════════════════════ CHAPTER 2 ════════════════════════
    k.h1("2. Core Payroll & CTC Configuration")
    k.body(
        "Indian Cost to Company architecture divides the package into taxable, tax-exempt and statutory "
        "layers. The 3Boxes CTC Template system expresses this as an ordered list of component mappings, "
        "each with an allocation method (percentage of CTC, fixed amount, percentage of another "
        "component, or formula) plus minimum/maximum limits, frequency and proration rules. Payroll "
        "processing evaluates mappings in sequence, so components that reference earlier components (for "
        "example HRA as a percentage of Basic) resolve automatically."
    )
    k.h2("2.1 The standard component plan")
    k.tbl(
        ["Component", "Typical allocation", "Tax treatment", "Notes"],
        [
            ["Basic", "40–50% of CTC", "Fully taxable", "Base for PF and gratuity; keep within the recommended band so statutory wages stay meaningful"],
            ["HRA", "40% (non-metro) / 50% (metro) of Basic", "Exempt u/s 10(13A) least-of-three", "Exemption is computed at tax time from rent paid, not from the template"],
            ["Dearness Allowance", "0–10% of Basic", "Fully taxable", "Included in PF wage when paid"],
            ["Conveyance", "Fixed ₹1,600", "Fully taxable", "Legacy planning figure; keep or repurpose as allowance"],
            ["Medical", "Fixed ₹1,250", "Fully taxable", "Legacy planning figure; modern practice folds this into Special Allowance"],
            ["Special Allowance", "Balancing plug", "Fully taxable", "Computed as the remainder of CTC at run time when the template leaves it unallocated"],
            ["LTA", "Annual fixed", "Exempt u/s 10(5) up to bills", "Reimbursement category, non-taxable up to eligible travel evidence"],
            ["Fuel / Driver / Gadgets / Books", "As opted", "Non-taxable up to bills", "Perquisites & reimbursements; set fixed monthly/annual values per band"],
            ["EPF Employer 12%", "12% of Basic(+DA)", "Employer cost", "Statutory mapping; the engine recomputes the exact liability"],
            ["Gratuity Provision", "4.81% of Basic", "Employer cost", "Actuarial-style provision for the year-end gratuity liability"],
        ],
        [0.20, 0.24, 0.26, 0.30],
    )
    k.h2("2.2 Applying the India preset")
    k.body(
        "Rather than building every template from scratch, use the preset. On the Salary Structure Master "
        "(CTC Templates) page, administrators will find an <b>Apply India Preset</b> action. It creates a "
        "DRAFT template for the selected company with thirteen mappings — the full earning stack above plus "
        "reimbursements and the employer statutory contributions — using Basic at 40% of CTC and HRA at 50% "
        "of Basic by default. The preset is deliberately created in DRAFT status so an administrator can "
        "adjust the percentages for the organisation's pay bands, then activate it and optionally make it "
        "the default for payroll processing. The processing engine picks the default active IND template "
        "first, then the first active IND template."
    )
    k.nav("Payroll → Masters → Salary Structure Master → Apply India Preset")
    k.img(f"{ASSETS}/06-ctc-templates-preset.png", "Figure 2-1 · CTC Templates with the Apply India Preset action", max_h=280)
    k.h2("2.3 Special Allowance as the balancing component")
    k.body(
        "The Special Allowance is the plug that absorbs whatever remains of CTC after the planned components. "
        "In the processing engine, when a template is applied the assigned amounts are summed and the "
        "unallocated remainder is written as SPECIAL_ALLOWANCE for that employee for that month, so the gross "
        "always reconciles to the monthly CTC. Because it is fully taxable, the sizing of Basic and HRA "
        "directly drives the employee's tax efficiency: higher Basic raises PF and gratuity bases and HRA "
        "capacity, while a larger Special Allowance raises taxable income. This trade-off is why the "
        "recommended Basic band is 40–50% of CTC."
    )
    k.h2("2.4 Country scoping of templates")
    k.body(
        "Every CTC template carries a country code (IND, USA, GBR, SGP are offered in the UI) and a currency. "
        "Templates are evaluated only for the run's country: an India run (currency INR) resolves IND "
        "templates. When multiple companies exist in a tenant, create one template per company or one group "
        "template; the run selects by country first and then by default flag. Keep at most one default per "
        "country to avoid ambiguous selection."
    )

    # ════════════════════════ CHAPTER 3 ════════════════════════
    k.h1("3. India Statutory Configuration")
    k.body(
        "The India Compliance Center opens with the Statutory Configuration card — one row per company that "
        "drives every downstream computation. The first time the page is opened for a company, the "
        "configuration is auto-provisioned with statutory defaults (EPF ceiling ₹15,000, ESIC wage limit "
        "₹21,000, New Regime default, declaration window in April, proof window in January, TDS true-up from "
        "February, variance threshold 5%). Administrators should review each field once during setup; the "
        "engine reads this record for every payroll run."
    )
    k.img(f"{ASSETS}/01-india-compliance-config.png", "Figure 3-1 · Statutory Configuration card (Apex Services Ltd, Maharashtra)", max_h=300)
    k.h2("3.1 Field-by-field reference")
    k.tbl(
        ["Field", "What it controls", "Guidance"],
        [
            ["Professional Tax State", "Which state's PT slab table applies", "Defaults to the employee's state, then the company's state; pin it when the entire workforce is in one state"],
            ["LWF State", "Which state's LWF rates and remittance frequency apply", "Half-yearly states (e.g. Maharashtra) remit June & December; monthly states deduct each month"],
            ["EPF Wage Ceiling", "Wage cap for the 12% computation", "₹15,000 statutory; tick 'On actual Basic' only if your establishment contributes on full Basic+DA"],
            ["EPF Admin Charges", "Adds 0.5% EPF admin (min ₹500) + 0.5% EDLI", "Enabled by default; disable only if you remit admin charges outside payroll"],
            ["ESIC Wage Limit", "Eligibility ceiling for ESI coverage", "₹21,000 standard; raise to ₹25,000 only for persons-with-disability coverage policies"],
            ["Default TDS Regime", "Regime for employees who have not elected", "New Regime is the statutory default from FY 2023-24 onward"],
            ["Declaration Window (month)", "When employees file regime + investment declarations", "April per standard Indian practice"],
            ["Proof Window / True-up (months)", "When proofs are verified and when TDS re-projection starts", "January proof deadline, February true-up per the Feb–Mar adjustment rule"],
            ["Variance Threshold (%)", "Net-pay change that triggers review + approval", "5% default per governance policy; raise only with a documented finance policy"],
        ],
        [0.24, 0.36, 0.40],
    )
    k.h2("3.2 State tables shipped with the engine")
    k.body(
        "Professional Tax slabs are shipped for Maharashtra, Karnataka, Tamil Nadu, Telangana, Andhra "
        "Pradesh, Gujarat, West Bengal, Madhya Pradesh, Kerala, Delhi and Uttar Pradesh, including the "
        "female-employee exemptions where they exist and the February higher-deduction months (for example "
        "Maharashtra ₹300 in February, capping the year at ₹2,500). Half-yearly states deduct in June and "
        "December only. LWF rates ship for the same states with the correct frequency flag. The tables are "
        "representative of current notifications; when a state revises its slabs, update the engine's PT/LWF "
        "tables — no other configuration changes are required. For states outside the shipped set, the "
        "engine skips PT/LWF for that employee and the gap is visible in the statutory registers."
    )
    k.callout(
        "The configuration applies to every payroll run for the company, but state fallback is per employee: "
        "an employee with a different home state uses that state's slabs unless the company pinned a state. "
        "This supports multi-state workforces within one legal entity.", title="Multi-state workforces"
    )

    # ════════════════════════ CHAPTER 4 ════════════════════════
    k.h1("4. Statutory Deduction Rules Reference")
    k.body(
        "This chapter is the calculation reference the engine implements. Rates below are as notified for FY "
        "2025-26; when the government changes a ceiling or rate, update the engine library and this table "
        "together. Each rule includes the employer cost items that appear as separate transaction lines, so "
        "the payroll cost report reconciles to the statutory challans."
    )
    k.h2("4.1 EPF — Employees' Provident Fund")
    k.tbl(
        ["Item", "Rule implemented"],
        [
            ["Employee share", "12% of Basic + DA, on the capped wage (min(Basic+DA, ₹15,000)) by default, or full Basic+DA when 'On actual Basic' is opted"],
            ["Employer share", "12% of the same wage, split ₹8.33% EPS (pension, capped at the EPS wage) and the balance to EPF"],
            ["Admin charges", "0.5% of wages, minimum ₹500 per month when the wage is positive (configurable)"],
            ["EDLI admin", "0.5% of wages (configurable)"],
            ["Ceiling effect", "At the ₹15,000 ceiling the maximum employee share is ₹1,800 and the employer share ₹1,800"],
            ["Reference line", "Transaction lines carry statutoryReference INDIA_ENGINE and a formula trace with the wage used"],
        ],
        [0.24, 0.76],
    )
    k.h2("4.2 ESIC — Employees' State Insurance")
    k.body(
        "ESIC applies when the month's gross salary is at or below the configured wage limit (₹21,000 "
        "standard). The employee contributes 0.75% of gross and the employer 3.25%, both rounded up to the "
        "next rupee as per ESIC portal practice. Eligibility is evaluated per month on the actual gross for "
        "that month, so an employee crossing the limit in a bonus month naturally falls out of coverage for "
        "that month and returns the next month. When the limit is not met, the engine simply emits no ESI "
        "lines, and the ESI register for the period excludes the employee."
    )
    k.h2("4.3 Professional Tax and LWF")
    k.body(
        "Professional Tax uses the state slab tables described in chapter 3. The engine picks the slab by "
        "the month's gross, applies gender exemptions where notified, switches to the special February "
        "amount where the state has one, and returns zero for non-remittance months in half-yearly states. "
        "LWF works the same way with its own state table: monthly states deduct every month (for example "
        "Karnataka ₹20 employee / ₹40 employer), and half-yearly states such as Maharashtra deduct ₹12/₹36 "
        "only in June and December. Both amounts appear as statutory deduction lines (PT, LWF_EE) and "
        "employer contribution lines (LWF_ER), which is what the PT and LWF returns aggregate."
    )
    k.h2("4.4 Worked example (Maharashtra, ₹12L CTC)")
    k.tbl(
        ["Line", "Basis", "Amount (₹)"],
        [
            ["Basic (40% of CTC)", "12,00,000 / 12 × 40%", "40,000.00"],
            ["HRA (50% of Basic)", "40,000 × 50%", "20,000.00"],
            ["Special Allowance", "Remainder after fixed components", "≈ 17,150.00"],
            ["EPF employee", "min(40,000, 15,000) × 12%", "1,800.00"],
            ["EPF employer (EPS+EPF)", "1,500 wage × 12% split", "1,800.00 (+ admin/EDLI)"],
            ["ESIC", "Gross > 21,000 → not applicable", "0.00"],
            ["PT (Maharashtra)", "Slab > 10,000, non-February", "200.00"],
            ["LWF (Maharashtra)", "Half-yearly; only June/December", "12.00 (Jun & Dec)"],
            ["TDS", "Annual projection ÷ remaining months", "varies by regime & declarations"],
        ],
        [0.34, 0.42, 0.24],
    )
    k.img(f"{ASSETS}/10-statutory-components.png", "Figure 4-1 · Statutory Components master", max_h=280)

    # ════════════════════════ CHAPTER 5 ════════════════════════
    k.h1("5. Income Tax (TDS) — Dual Regime Engine")
    k.body(
        "India taxes salary under two concurrent regimes. The <b>New Regime</b> is the default: lower slab "
        "rates but almost no deductions. The <b>Old Regime</b> keeps the deduction ecosystem (80C, 80D, HRA, "
        "home-loan interest) at higher rates. The engine computes both every time and reports which is "
        "better, and the payroll engine applies the employee's elected regime from their declaration — or "
        "the company default when no declaration exists."
    )
    k.h2("5.1 FY 2025-26 slab structure")
    k.tbl(
        ["Annual income band", "New Regime rate", "Old Regime rate (<60 yrs)"],
        [
            ["Up to ₹4,00,000 / ₹2,50,000", "0%", "0%"],
            ["Next band to ₹8,00,000 / ₹5,00,000", "5%", "5%"],
            ["Next band to ₹12,00,000 / ₹10,00,000", "10%", "20%"],
            ["Next band to ₹16,00,000", "15%", "30%"],
            ["Next band to ₹20,00,000", "20%", "30%"],
            ["Next band to ₹24,00,000", "25%", "30%"],
            ["Above ₹24,00,000", "30%", "30%"],
        ],
        [0.40, 0.28, 0.32], center_cols=[1, 2],
    )
    k.body(
        "The new regime applies a ₹75,000 standard deduction and a Section 87A rebate of up to ₹60,000, "
        "which makes total income up to ₹12,00,000 tax-free. The old regime applies a ₹50,000 standard "
        "deduction, the chapter VI-A deductions (80C capped at ₹1,50,000, 80D capped at ₹25,000 or ₹50,000 "
        "for senior citizens, 80CCD(1B) NPS at ₹50,000, 24(b) home-loan interest at ₹2,00,000, 80E education "
        "loan without cap) and an 87A rebate of ₹12,500 up to ₹5,00,000 total income. Surcharge applies at "
        "10/15/25% (new regime, capped at 25%) or 10/15/25/37% (old regime) with marginal relief so that tax "
        "plus surcharge never exceeds the excess over the threshold, and the 4% health and education cess "
        "applies on the subtotal in both regimes."
    )
    k.h2("5.2 HRA exemption — least of three")
    k.body(
        "For old-regime employees the exempt slice of HRA is the minimum of: (a) actual HRA received, "
        "(b) rent paid minus 10% of Basic+DA, and (c) 50% of Basic+DA for metro cities (Mumbai, Delhi, "
        "Kolkata, Chennai) or 40% for non-metro. The declaration captures rent paid and metro status; the "
        "engine annualises the monthly exemption and feeds it into the old-regime computation. If rent paid "
        "is below 10% of Basic the exemption is zero and the whole HRA is taxable — the calculator shows "
        "this instantly so employees can adjust before the proof window closes."
    )
    k.h2("5.3 Monthly TDS projection")
    k.body(
        "Payroll never deducts the annual tax in one month. The engine projects the annual gross, computes "
        "the annual tax under the elected regime, subtracts the tax already recovered in the financial year "
        "across previous runs, and divides the remainder by the months left (April = 12 months, September = "
        "7, January = 3, February–March = 1). From the true-up month the projection switches from declared "
        "to verified deduction figures, so any shortfall after proof verification is automatically spread "
        "over the remaining pay periods; over-recovery simply zeroes the remaining months and the employee "
        "claims the refund in their return. Every TDS line carries a formula trace with the regime, financial "
        "year, annual tax, amount recovered so far and months remaining for audit."
    )
    k.img(f"{ASSETS}/07-income-tax.png", "Figure 5-1 · Income Tax page — dual-regime calculator and declarations", max_h=280)
    k.callout(
        "Worked check: gross ₹28.4L annual under the new regime → taxable ₹27.65L after standard deduction "
        "→ slab tax ₹4,09,500 → +4% cess ≈ ₹4,25,880 → September run deducts ₹4,25,880 ÷ 7 ≈ ₹60,840/month. "
        "The engine's figure for the demo employee was ₹60,981 — the small difference is exact rounding of "
        "the monthly gross.", title="Sanity-checking the TDS line"
    )
