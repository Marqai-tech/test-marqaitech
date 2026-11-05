#!/usr/bin/env python3
"""Indian Payroll Manual — content part 3 (chapters 11-15)."""
import sys
sys.path.insert(0, "/home/z/my-project/scripts")
import india_manual_kit as k

ASSETS = "/home/z/my-project/scripts/manual_assets/india"


def build():
    # ════════════════════════ CHAPTER 11 ════════════════════════
    k.h1("11. Bank Integration & Advice Files")
    k.body(
        "Salary disbursement should never involve hand-edited spreadsheets. The Bank File Generation page "
        "produces the salary advice directly from an approved run's transaction lines, with per-employee net "
        "pay resolved against the employee's primary salary account. Files carry a trailer and a SHA-256 "
        "checksum so the bank's copy can be verified against the generated copy and manual tampering is "
        "detectable. An optional encode toggle base64-encodes the stored content for safer archival inside "
        "the platform."
    )
    k.h2("11.1 Supported formats")
    k.tbl(
        ["Format", "Use", "Layout"],
        [
            ["NACH", "National Automated Clearing House debit files", "HDR / DTL / TRL records with account, IFSC, amount and currency per record"],
            ["NEFT", "Immediate salary credit via NEFT", "Beneficiary name, account, IFSC, amount, payment and remitter references"],
            ["HDFC", "HDFC corporate portal bulk upload", "Debit account, beneficiary, account no, IFSC, amount, narration, location code, reference"],
            ["ICICI", "ICICI corporate portal bulk upload", "Sr no, beneficiary, account no, IFSC, amount, payment date, remarks, payee email/mobile"],
            ["SBI", "SBI corporate portal bulk upload", "Debit account, beneficiary, account no, IFSC, amount, mode (NEFT), purpose, reference"],
            ["Custom", "Any other bank / in-house format", "JSON rows: employee, account, IFSC, net pay, currency"],
        ],
        [0.12, 0.34, 0.54],
    )
    k.h2("11.2 Procedure")
    k.steps([
        "Confirm the run has passed variance review and holds DISBURSEMENT_APPROVAL.",
        "Open <b>Payroll → Transactions → Bank File Generation</b>, select the run and the bank format, and "
        "enter the corporate debit account for bank formats.",
        "Generate, then download and verify the trailer: record count and total amount must match the "
        "approval; the checksum line is the integrity proof for the bank upload.",
        "Upload to the corporate portal and record the bank acknowledgement on the file record (status moves "
        "generated → submitted → acknowledged).",
        "The payroll.bankfile.ready notification has already reached Finance with the period, bank, record "
        "count and total — reconcile it with the portal acknowledgement.",
    ])
    k.img(f"{ASSETS}/05-bank-files.png", "Figure 11-1 · Bank File Generation with bank-specific advice formats", max_h=280)
    k.callout(
        "Employees missing an account number or IFSC are skipped and reported in the generation summary — "
        "fix the payment method and regenerate rather than editing the file.", title="Missing bank details"
    )

    # ════════════════════════ CHAPTER 12 ════════════════════════
    k.h1("12. Payroll Notifications & Escalation")
    k.body(
        "Payroll participates in the platform-wide multi-channel notification system (in-app, email, SMS and "
        "Slack/Teams webhooks). Events are templates with {{placeholder}} variables that tenant admins can "
        "customise per module from the Notification Center, and approval-type events carry actionable "
        "Approve/Reject links valid in email and chat without opening the HRMS. Unactioned approval "
        "notifications escalate after the configured 48 hours to the configured next-level role."
    )
    k.h2("12.1 Payroll event catalogue")
    k.tbl(
        ["Event", "Recipients", "Trigger"],
        [
            ["payroll.declaration.opened", "All employees", "Declaration window opens (April)"],
            ["payroll.declaration.closing", "Employees pending", "Window closing reminder with days left"],
            ["payroll.declaration.submitted", "Payroll team", "Employee submits a declaration"],
            ["payroll.proof.verified / rejected", "The employee", "HR/Finance verification outcome"],
            ["payroll.payslip.ready", "Each employee", "Payslip released for the period"],
            ["payroll.variance.flagged", "Payroll team + Finance Head", "Net-pay variance beyond threshold with top variances in the message"],
            ["payroll.bankfile.ready", "Finance Head + payroll", "Bank advice file generated (period, bank, records, total)"],
            ["payroll.data.conflict", "Payroll + HR admins", "Conflicting payroll data detected (e.g. unpaid leave not synced)"],
            ["payroll.statutory.filing.due", "Payroll + compliance", "EPF/ESI/PT/LWF/24Q filing approaching due date"],
            ["exit.fnf.ready", "HR + payroll + the employee", "F&F statement computed and ready for clearance"],
        ],
        [0.30, 0.28, 0.42],
    )
    k.h2("12.2 Customising templates")
    k.body(
        "Open <b>Governance → Workflows → Notification Center</b> and select the Payroll module chip. Every "
        "event exposes its channels, subject and body per channel, the placeholder chips available "
        "(Employee_Name, Pay_Period, Net_Pay, Total_Amount, Variance_Detail and so on), whether the message "
        "is actionable, and the escalation hours and role. Edits are tenant-level overrides over the global "
        "seed and can be reset to defaults at any time. The delivery log shows every channel attempt with "
        "status and error, which is the first place to look when a notification reportedly did not arrive."
    )

    # ════════════════════════ CHAPTER 13 ════════════════════════
    k.h1("13. Multi-Country Configuration Notes")
    k.body(
        "The payroll module is country-aware by design: CTC templates, paycode masters, statutory components, "
        "tax slab tables and compliance obligations all carry a country code, and payroll definitions carry "
        "pay frequency, cut-off and payment day per country. Today two engines are implemented end to end — "
        "IND (this manual) and USA (FICA, 401(k), federal income tax) — while GBR and SGP are selectable at "
        "the configuration layer for templates and CTC planning ahead of their calculation packs."
    )
    k.h2("13.1 What is per country")
    k.tbl(
        ["Layer", "Scope", "Example"],
        [
            ["Currency & FX", "CurrencyConfig + ExchangeRate per legal entity", "Base INR with USD/GBP rates for group consolidation"],
            ["CTC templates", "One per country per company", "IND template with EPF/gratuity provision; USA template with 401(k) employer match"],
            ["Statutory components", "Authority, rates, ceilings, filing format, challan", "EPF (EPFO, ECR, D+15) vs Social Security (IRS, Form 941)"],
            ["Tax slab tables", "Tax year + regime + filing status", "India FY 2025-26 NEW/OLD; US federal single filer"],
            ["Compliance obligations", "Filing calendar with penalties and reminders", "24Q quarterly; ECR monthly"],
            ["Data residency", "Region enforcement on storage", "DPDP Act 2023 (India) alignment"],
        ],
        [0.22, 0.36, 0.42],
    )
    k.h2("13.2 Adding a country safely")
    k.body(
        "Treat the India implementation as the template for expansion. Add the statutory tables to the "
        "engine library, seed the country's paycode master and statutory components with authorities and "
        "filing formats, create the first CTC template in DRAFT, register the compliance obligations, and "
        "only then activate processing for pilot employees. The tenant country catalogue (twenty countries) "
        "governs what tenants may enable; the calculation engines decide what actually computes. Never leave "
        "a country selectable in payroll processing without its engine — the readiness validation and the "
        "statutory registers will surface the gap."
    )

    # ════════════════════════ CHAPTER 14 ════════════════════════
    k.h1("14. FAQ & Troubleshooting")
    k.tbl(
        ["Symptom / question", "Answer"],
        [
            ["TDS line looks too high", "Open the line's formula trace: it shows regime, financial year, annual tax, recovered-so-far and months remaining. September deducts 1/7 of the annual tax — a large monthly figure on a high CTC is expected. Also check whether the employee's declaration is APPROVED; without one the projection assumes zero old-regime deductions"],
            ["EPF is ₹1,800 but Basic is much higher", "The statutory ceiling (₹15,000) is applied. Tick 'On actual Basic' in the Statutory Configuration only if your establishment contributes on full Basic+DA"],
            ["No PT/LWF deducted", "The employee's state (or the pinned company state) has no slab for that gross, or the month is not a remittance month for a half-yearly state (LWF Maharashtra only Jun/Dec; PT TN/GJ/KL only Jun/Dec)"],
            ["ESIC missing for a low-paid employee", "ESIC evaluates the month's actual gross. A bonus month can push gross above ₹21,000 and legitimately exclude the employee for that month"],
            ["Variance flags everyone after a structure change", "Expected. Record the review items, attach the structure-change reference in the approval note, and obtain Finance Head approval before the bank file"],
            ["Bank file skipped some employees", "Those employees lack account number or IFSC on their primary payment method. Fix the record and regenerate"],
            ["Calculation button refuses to run", "Runs calculate only in OPEN or INPUT_COLLECTION. Use a CORRECTION run for a processed period, or unlock via an approved Payroll Lock Request after closure"],
            ["Form 16 shows estimates", "The generated Form 16 is the working sheet (Part A pre-fill + Part B skeleton). The official Part A comes from TRACES after Q4 24Q is processed"],
            ["Where are the admin charges for PF?", "As separate EMPLOYER_CONTRIB lines (EPF_ADMIN, EDLI_ADMIN) when admin charges are enabled in the Statutory Configuration"],
            ["Gratuity shows zero for a leaver", "Completed service below 5 years, or Basic+DA not derivable. The computation panel states the reason; gratuity is statutory only at ≥ 5 years"],
        ],
        [0.34, 0.66],
    )

    # ════════════════════════ CHAPTER 15 ════════════════════════
    k.h1("15. Glossary")
    k.tbl(
        ["Term", "Meaning"],
        [
            ["CTC", "Cost to Company — the total annual employer cost of an employee, split into earnings, reimbursements and employer contributions"],
            ["Basic", "The core wage component that forms the base for PF and gratuity calculations"],
            ["HRA", "House Rent Allowance — partially exempt under Section 10(13A) using the least-of-three test"],
            ["Special Allowance", "The balancing component that absorbs the remainder of CTC; fully taxable"],
            ["EPF / EPS / EDLI", "Employees' Provident Fund scheme, the pension scheme funded from the employer share, and the deposit-linked insurance scheme"],
            ["Statutory wage ceiling", "The ₹15,000 monthly wage cap on which EPF contributions are computed unless the employer opts for actual Basic"],
            ["ESIC", "Employees' State Insurance Corporation — health insurance contributions at 0.75% (EE) + 3.25% (ER) for gross ≤ ₹21,000"],
            ["PT", "Professional Tax — a state-level tax on employment with state-specific slabs"],
            ["LWF", "Labour Welfare Fund — state-level welfare contributions, monthly or half-yearly (June/December)"],
            ["TDS", "Tax Deducted at Source — monthly income tax withholding under Section 192"],
            ["Regime (Old / New)", "The two concurrent personal-income-tax structures; New is the statutory default, Old keeps deductions"],
            ["87A rebate", "Rebate that nullifies tax for lower total incomes (₹60,000 up to ₹12L new regime FY 2025-26)"],
            ["Cess", "The 4% health and education cess applied on tax plus surcharge"],
            ["Surcharge with marginal relief", "Additional tax on high incomes, capped so the incremental tax never exceeds the income above the threshold"],
            ["ECR", "Electronic Challan-cum-Return — the monthly UAN-wise EPF filing format"],
            ["Form 24Q", "The quarterly e-TDS return for salaries filed via the NSDL utility / TRACES"],
            ["Form 16", "The annual TDS certificate for employees: Part A (TRACES) + Part B (annexure)"],
            ["F&F", "Full and Final settlement — the final pay statement covering pending salary, gratuity, encashment, buy-out and recoveries"],
            ["Gratuity", "15/26 × last drawn Basic+DA × completed years, payable at five or more years of service, capped at ₹20 lakh"],
            ["Leave encashment exemption", "Section 10(10AA) exemption up to ₹25,00,000 on earned-leave encashment at exit"],
            ["Notice buy-out", "Recovery for un served notice days at monthly salary ÷ 30 per day"],
            ["Variance threshold", "The configured month-over-month net-pay change (default 5%) that requires review and Finance Head approval"],
            ["SoD", "Separation of Duties — the preparer of a payroll run can never be its approver"],
            ["Payroll Lock Request", "The audited, approved workflow required to reopen a CLOSED payroll run"],
            ["Formula trace", "The per-line JSON audit record showing exactly how a statutory amount was computed"],
        ],
        [0.28, 0.72],
    )
