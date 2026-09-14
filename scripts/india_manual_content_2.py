#!/usr/bin/env python3
"""Indian Payroll Manual — content part 2 (chapters 6-10)."""
import sys
sys.path.insert(0, "/home/z/my-project/scripts")
import india_manual_kit as k

ASSETS = "/home/z/my-project/scripts/manual_assets/india"


def build():
    # ════════════════════════ CHAPTER 6 ════════════════════════
    k.h1("6. Payroll Processing Workflow (Stage A / B / C)")
    k.body(
        "A compliant Indian payroll runs on a strict monthly rhythm. The module models the rhythm as three "
        "stages with a governance gate between review and payment. The diagram below is the reference flow; "
        "the SOP steps that follow use the exact screen names in the product. The run lifecycle is "
        "forward-only — OPEN → INPUT_COLLECTION → PROCESSING → REVIEW → APPROVED → ACCOUNTING → DISBURSED → "
        "CLOSED — and every transition is recorded on the run."
    )
    k.img(f"{ASSETS}/wf-payroll-cycle.png", "Figure 6-1 · The 3Boxes payroll cycle with the >5% variance governance gate", max_h=330)
    k.h2("6.1 Stage A — pre-payroll inputs (1st–20th)")
    k.steps([
        "Open <b>Payroll → Transactions → Adhoc Transaction</b> and record approved variable pay, one-time "
        "payments, reimbursements, loan recoveries and tax adjustments for the period. Inputs must be in "
        "APPROVED status to be picked up.",
        "Close attendance and leave for the month so Loss-of-Pay days are final; overtime approvals land "
        "here automatically from the Overtime page.",
        "Confirm HR records are current — new joinees prorated from their date of joining, exits stopped at "
        "their last working day, and any <b>Salary Arrears</b> (holds) released or explicitly carried forward.",
        "Open <b>Payroll Readiness</b> and run the pre-payroll validation. Resolve every missing payment "
        "method, missing salary basis and blocking hold until the readiness report is clean.",
    ])
    k.h2("6.2 Stage B — core processing")
    k.steps([
        "Create the run in <b>Payroll Processing</b>: pick the legal entity, period, pay date and run type "
        "(REGULAR for the monthly cycle; OFF-CYCLE, FINAL_SETTLEMENT or CORRECTION for exceptional runs).",
        "Press <b>Calculate</b>. The engine iterates active employees, applies the CTC template, then invokes "
        "the India statutory library for EPF, ESIC, PT, LWF and the TDS projection, and writes a transaction "
        "line per component. The run advances to PROCESSING.",
        "Spot-check three to five employees in the transaction lines: verify the EPF wage (capped or actual), "
        "the PT amount against the state slab, and the TDS line's formula trace (regime, FY, annual tax, "
        "months remaining).",
    ])
    k.img(f"{ASSETS}/09-processing.png", "Figure 6-2 · Payroll Processing — run lifecycle and calculation", max_h=280)
    k.h2("6.3 Stage C — review, approval and disbursement")
    k.steps([
        "In <b>Payroll Authorization</b> raise the CALCULATION_REVIEW approval. Separation of duties is "
        "enforced: the user who calculated the run cannot approve it.",
        "Open <b>Reports → Variance Report</b>, select the run and compare against the previous month. Every "
        "employee beyond the threshold is highlighted; press <b>Record Flagged as Review Items</b> to log "
        "the anomalies, and the payroll team plus Finance Head receive the variance notification.",
        "Obtain the DISBURSEMENT_APPROVAL. Only then generate the bank advice file (chapter 11) — the module "
        "does not prevent generating the file earlier, but governance treats a pre-approval file as a "
        "policy violation.",
        "Release payslips from <b>Payslips</b>, advance the run to DISBURSED and then CLOSED. Post-close "
        "changes require a <b>Payroll Lock Request</b> approved by a tenant or super admin, and every manual "
        "adjustment lands in the immutable audit log with a mandatory reason.",
    ])
    k.callout(
        "Cut-off discipline: inputs after the 20th belong to the next cycle unless a CORRECTION run is "
        "approved. This mirrors the 1st–20th pre-payroll window in the SOP diagram and keeps statutory "
        "registers stable.", title="Cut-off rule"
    )

    # ════════════════════════ CHAPTER 7 ════════════════════════
    k.h1("7. Approvals, Variance & Governance")
    k.body(
        "Payroll is the one module where a silent error costs real money and statutory penalties, so the "
        "module layers four controls on top of the calculation: separation of duties, month-over-month "
        "variance analysis, AI anomaly detection, and an audited lock. Together they implement the Stage C "
        "gate from the reference workflow: a payroll specialist reviews differences above 5%, the Finance "
        "Head approves, and only then does the bank transfer go out."
    )
    k.h2("7.1 Variance report")
    k.body(
        "The Variance Report tab compares the selected run with the immediately previous period for the same "
        "company, employee by employee. For each person it shows previous net, current net, the rupee delta "
        "and the percentage variance, sorted by magnitude. The threshold comes from the Statutory "
        "Configuration (default 5%). Rows beyond the threshold are flagged in red and the banner states the "
        "governance consequence. Pressing <b>Record Flagged as Review Items</b> writes one anomaly per "
        "flagged employee (type VARIANCE_THRESHOLD, severity scaled by the size of the deviation) and "
        "dispatches the payroll.variance.flagged notification to the payroll team and Finance Head with the "
        "top three variances in the message."
    )
    k.img(f"{ASSETS}/04-reports-variance-tab.png", "Figure 7-1 · Variance Report tab — threshold-driven review", max_h=280)
    k.h2("7.2 Separation of duties and approvals")
    k.tbl(
        ["Stage", "Approval", "Who cannot approve"],
        [
            ["PROCESSING → REVIEW", "CALCULATION_REVIEW", "The user who calculated the run"],
            ["REVIEW → APPROVED", "DISBURSEMENT_APPROVAL", "The requester; only tenant_admin / super_admin / finance_controller roles"],
            ["After CLOSED", "Payroll Lock Request", "The requester of the unlock; admin role required"],
        ],
        [0.30, 0.34, 0.36],
    )
    k.body(
        "Every approval records the approver, the timestamp, an optional note and a separation-of-duties "
        "snapshot taken at approval time, so a later role change cannot invalidate the audit trail. Rejection "
        "returns the run to PROCESSING with a reason, which is the correct loop when variance review finds a "
        "genuine error: fix the inputs, recalculate, and re-enter review."
    )
    k.h2("7.3 AI anomaly detection")
    k.body(
        "Independent of variance, the AI Insights page runs rule-based and statistical detectors across runs: "
        "net-pay spikes above 50% of the trailing three-month average, overtime spikes, gross drops above "
        "40%, zero-tax anomalies, duplicate bank accounts across employees, first-time components and "
        "minimum-wage breaches. Anomalies have their own acknowledge/investigate/resolve workflow so "
        "findings are dispositioned, not just displayed. Use variance as the monthly gate and AI insights as "
        "the continuous tripwire."

    )

    # ════════════════════════ CHAPTER 8 ════════════════════════
    k.h1("8. Statutory Reports & Filings (India Compliance Center)")
    k.body(
        "The India Compliance Center generates every recurring statutory output directly from payroll data. "
        "Each format card offers <b>Preview</b> (on-screen summary plus the first rows), <b>Download</b> "
        "(the filing-ready file) and <b>Mark Filed</b> (registers a ComplianceFiling record so the compliance "
        "calendar shows what was generated, when, and who acknowledged it). Formats fall back to the legacy "
        "payroll ledger for periods without a modern run, so history is never lost."
    )
    k.img(f"{ASSETS}/02-india-compliance-filings.png", "Figure 8-1 · Statutory Reports & Filings cards", max_h=300)
    k.h2("8.1 Format catalogue")
    k.tbl(
        ["Format", "File", "Contents", "Due"],
        [
            ["EPF ECR", ".txt", "UAN-wise # separated ECR: gross, EPF wage (capped), EPS/EDLI wages, EE 12%, ER EPS, ER EPF, NCP days", "15th of following month via EPFO portal"],
            ["EPF Form 5", ".csv", "Members who joined during the month: UAN, name, wages, date of joining", "With monthly ECR"],
            ["EPF Form 10", ".csv", "Members who exited during the month: UAN, name, wages, date of exit, reason", "With monthly ECR"],
            ["ESI return", ".csv", "IP-wise gross, EE 0.75%, ER 3.25%, total", "15th of following month via ESIC portal"],
            ["PT return", ".csv", "State-wise registered persons and PT deducted, with the state portal noted", "Varies by state (10th–20th typical)"],
            ["LWF return", ".csv", "State-wise employee and employer contributions with remittance frequency", "Jun/Dec for half-yearly states"],
            ["Form 24Q", ".json", "Quarterly salary TDS return structured for the NSDL RPU (deductor, deductee rows, challans placeholder) → produces the .fvu for TRACES", "Jul 31 / Oct 31 / Jan 31 / May 31"],
            ["Form 16", ".html", "Part A working sheet (per-employee PAN, gross, TDS) + Part B annexure skeleton for the annual certificate", "Issue by 15 June after FY end"],
        ],
        [0.13, 0.08, 0.51, 0.28],
    )
    k.h2("8.2 Operating procedure")
    k.steps([
        "Close the month's run (chapter 6) so the registers reflect final figures.",
        "In the India Compliance Center, set the month and year, then Preview each format and reconcile the "
        "summary chips (member counts, totals) against the Salary Register.",
        "Download the ECR text and upload it to the EPFO portal; download the ESI, PT and LWF summaries and "
        "file on the respective state portals; import the 24Q JSON into the TDS return preparation utility "
        "each quarter.",
        "Press <b>Mark Filed</b> after each portal acknowledgement so the filing trail is complete; the "
        "payroll.statutory.filing.due notification (chapter 12) reminds the team before due dates.",
        "For Form 16, use the annual format with month = March (or April) of the closing financial year, "
        "then replace Part A with the TRACES-downloaded official Part A before issuing to employees.",
    ])
    k.h2("8.3 Registers and salary register")
    k.body(
        "Beyond the filing formats, the Reports tab's Statutory section renders live PF, ESI, PT, TDS and "
        "LWF registers for any period — PT and LWF aggregated state-wise, TDS PAN-wise — directly from "
        "transaction lines. The Salary Register tab produces summary or detailed per-employee registers with "
        "every earning and deduction column, printable for the monthly payroll review sign-off."
    )

    # ════════════════════════ CHAPTER 9 ════════════════════════
    k.h1("9. Declaration & Proof Verification Workflow")
    k.body(
        "Indian payroll needs a governed annual loop between employees and payroll: employees declare "
        "investments at the start of the financial year, TDS runs on those declarations for most of the "
        "year, proofs arrive in the last quarter, and the final months true up. The module models the full "
        "loop with configurable window months and automatic TDS re-projection."
    )
    k.img(f"{ASSETS}/wf-declaration-tds.png", "Figure 9-1 · The April → January → February–March declaration-to-TDS loop", max_h=250)
    k.h2("9.1 The four phases")
    k.tbl(
        ["Phase", "Months (configurable)", "What happens"],
        [
            ["Declaration window", "April", "Employees elect Old/New regime and declare 80C (PPF, ELSS, LIC, home-loan principal), 80D self/parents, 80CCD NPS, 24(b) interest, HRA rent + metro status"],
            ["Provisional TDS", "April – December", "Engine projects annual tax on DECLARED figures and deducts the remaining-months share each run"],
            ["Proof window", "January", "Employees upload proofs per section; submission flips the declaration to PENDING_REVIEW; HR/Finance verify each section as VERIFIED, PARTIALLY_VERIFIED or REJECTED"],
            ["True-up", "February – March", "VERIFIED amounts replace declared amounts in the projection; shortfall spreads over remaining months; the regime is locked after verification"],
        ],
        [0.18, 0.18, 0.64],
    )
    k.h2("9.2 Operating procedure (HR/Finance)")
    k.steps([
        "In April open the window: announce it (the declaration.opened event notifies all employees) and "
        "confirm the window months in the Statutory Configuration.",
        "Review submitted declarations on the Income Tax page; APPROVED declarations are the ones the engine "
        "uses for the provisional projection.",
        "In January chase the closing reminder (declaration.closing event with days-left), then verify "
        "proofs: open each declaration, record per-section status and comments, and set the overall proof "
        "status. Verification locks the regime election for the year.",
        "Watch the true-up: February and March runs automatically deduct the corrected TDS; the employee is "
        "notified of the verification result either way (proof.verified / proof.rejected events).",
    ])
    k.callout(
        "Rejected proofs are not a dead end: the employee can re-submit valid proofs before the deadline. "
        "If nothing is re-submitted, TDS continues on the reduced (declared-less) basis, which is the "
        "statutorily correct outcome.", title="Rejections"
    )

    # ════════════════════════ CHAPTER 10 ════════════════════════
    k.h1("10. Full & Final (F&F) Settlement")
    k.body(
        "Separation pay in India has four statutory moving parts — pending salary to the last working day, "
        "gratuity, leave encashment and notice buy-out — plus recoveries, all gated by department "
        "clearance. The F&F Settlement page computes the statement automatically from the employee record "
        "and the separation, and the exit workflow notifies managers and HR when the statement is ready."
    )
    k.img(f"{ASSETS}/wf-ff-india.png", "Figure 10-1 · The separation flow with the clearance gate", max_h=300)
    k.h2("10.1 Components computed by the engine")
    k.tbl(
        ["Component", "Formula implemented", "Statutory reference"],
        [
            ["Pending salary", "Prorated earnings to the last working day", "Contractual"],
            ["Gratuity", "15/26 × last drawn Basic+DA × completed years; payable at ≥ 5 years; capped at ₹20,00,000 (establishments outside the Act use 15/30)", "Payment of Gratuity Act 1972, Sec 4(2), 10(10)"],
            ["Leave encashment", "Earned-leave balance × per-day rate; exempt up to ₹25,00,000, excess taxable and split in the statement", "Sec 10(10AA)"],
            ["Notice buy-out", "Shortfall days × (monthly salary ÷ 30), recovered from the settlement", "Contractual"],
            ["Recoveries", "Assets, loans, other dues, tax", "Employer policy"],
        ],
        [0.20, 0.55, 0.25],
    )
    k.body(
        "The API response includes the India computation panel: the gratuity formula string, years of "
        "service, whether the ₹20 lakh cap applied, the exempt/taxable encashment split and the buy-out "
        "derivation, so HR can explain every number to the departing employee. Net settlement is earnings "
        "(including gratuity) minus recoveries; payout waits for clearance sign-offs, and the F&F record "
        "carries the clearance flag and the last working date used."
    )
    k.img(f"{ASSETS}/08-fnf.png", "Figure 10-2 · F&F Settlement page", max_h=280)
    k.callout(
        "Gratuity eligibility is computed on completed years of continuous service between the date of "
        "joining and the last working date. Demo employees typically show ineligible (below 5 years) — that "
        "is correct behaviour, not a bug.", title="Reading the gratuity panel"
    )
