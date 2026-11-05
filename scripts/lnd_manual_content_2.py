#!/usr/bin/env python3
"""L&D Manual content - Chapters 6-10."""
import os

ASSETS = "/home/z/my-project/scripts/manual_assets/lnd"


def build():
    import lnd_manual_kit as kit
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer = (
        kit.h1, kit.h2, kit.h3, kit.body, kit.bullet, kit.steps,
        kit.callout, kit.nav, kit.img, kit.tbl, kit.spacer)

    # ================================================================ CH 6
    h1("6. Course Nomination & Approval")
    nav("Sidebar → Learning & Development → Course Requests   |   Route: /learning/requests")
    body("Not all training should be pushed top-down. The Course Requests page gives employees a "
         "structured way to ask for development, and gives supervisors and L&D administrators a "
         "budget-conscious approval queue. The page's subtitle captures the contract: employees "
         "request courses or HR assigns mandatory paths, and reviewers weigh budget and team "
         "priorities. Every request stores who asked, what for, how much it is expected to cost "
         "in rupees, and why — so approval decisions are auditable months later.")
    img(os.path.join(ASSETS, "05-lnd-requests.png"),
        "Exhibit 6-1: Course Nomination & Approval — request form and review queue")

    h2("6.1 Submitting a request (SOP)")
    steps([
        "Click <b>Request training</b> (visible to every signed-in user).",
        "Pick <b>Select a course from the catalog</b>, or type <b>Or an external course title</b> "
        "for training that is not in the catalog yet.",
        "Choose the request type: <b>Self nomination</b> or <b>Manager suggested</b>.",
        "Enter the <b>Expected cost (₹)</b> — this is the number your reviewer sees against budget.",
        "Explain the driver in the reason box: <i>\"Why do you need this training? (skill gap, "
        "project need, career goal…)\"</i>.",
        "Click <b>Submit request</b>. The toast confirms your supervisor / L&D admin will "
        "review it, and the reporting manager is notified automatically.",
    ])
    body("Requests appear instantly to the right reviewers: HR managers and administrators see "
         "company-wide requests, managers see their own and their direct reports'. Pending rows "
         "show the request type badge, the expected cost, and the reason text, so a reviewer can "
         "usually decide without a follow-up meeting.")

    h2("6.2 Approving or rejecting (SOP)")
    steps([
        "Open <b>Course Requests</b> and locate the pending row.",
        "Click <b>Approve & enrol</b> and optionally type an approval note.",
        "The platform auto-enrols the employee in the requested course (duplicates are skipped "
        "safely) and notifies them — the toast reads <i>\"Approved — employee auto-enrolled\"</i>.",
        "For unsuitable requests click <b>Reject</b> and enter a <b>Rejection reason</b>; the "
        "reason is stored and visible on the request row.",
    ])
    callout("Approval always creates the enrolment in the same action. There is no second step "
            "where an approver must remember to enrol someone — this removes the classic "
            "\"approved but never enrolled\" failure mode of spreadsheet processes.",
            title="One-click approval")

    # ================================================================ CH 7
    h1("7. Tracking, Completion & Certifications")
    nav("Sidebar → Learning & Development → Certifications   |   Route: /learning/certifications")
    body("Certifications are the module's proof of competence. When an approver records a passing "
         "result, the platform issues a digital certificate automatically — no template work, no "
         "manual emailing. Each certificate carries a unique financial-year number in the format "
         "<b>CERT-FY2627-NNNN</b> (the FY starts in April), the course title, the employee, the "
         "score, the issue date and a validity window. Non-compliance certificates are issued "
         "with lifetime validity; compliance certifications are valid for <b>12 months</b> so "
         "statutory re-certification can never be forgotten.")
    img(os.path.join(ASSETS, "06-lnd-certifications.png"),
        "Exhibit 7-1: Certifications & Renewals — KPI bands and certificate cards")

    h2("7.1 The six validity bands")
    body("The page opens with six KPI cards — <b>Total</b>, <b>Active</b>, <b>< 60 days</b>, "
         "<b>< 30 days</b>, <b>< 15 days</b> and <b>Expired</b> — and every certificate card "
         "wears a band badge matching the same vocabulary: <b>Valid</b>, <b>No expiry</b>, "
         "<b>Expiring < 60d</b>, <b>Expiring < 30d</b>, <b>Expiring < 15d</b> or "
         "<b>Expired</b>. Cards also show the days remaining (e.g. <i>345d left</i>) so urgency "
         "is always explicit. The daily compliance engine (Chapter 9 and Chapter 11) sends "
         "renewal alerts as each band is entered, escalating to the direct manager at the "
         "15-day mark.")
    tbl(
        ["Band", "Trigger", "What happens"],
        [
            ["Valid", "More than 60 days to expiry", "No action; card shows days remaining."],
            ["Expiring < 60d", "60 days or fewer remaining", "First renewal alert to the employee (once)."],
            ["Expiring < 30d", "30 days or fewer remaining", "Second renewal alert to the employee (once)."],
            ["Expiring < 15d", "15 days or fewer remaining", "Final alert, <b>escalated to the reporting manager</b>."],
            ["Expired", "Validity end date passed", "Status flips to expired automatically; renew to reactivate."],
            ["No expiry", "Lifetime certificate", "Never alerts; Renew is hidden."],
        ],
        [0.22, 0.34, 0.44],
        "Table 7-1: Certificate validity bands and alert behaviour",
    )

    h2("7.2 Renewing a certificate (SOP)")
    steps([
        "Open <b>Certifications</b> and filter attention to the amber and red band cards.",
        "Have the employee re-complete the assessment (assign the course again if needed).",
        "As an administrator, click <b>Renew</b> on the certificate card.",
        "The platform extends validity by 12 months (or the course's renewal period) from the "
        "later of the current expiry or today, resets the alert counters, and returns the "
        "certificate to <b>Valid</b>.",
    ])
    body("Renewal is deliberately a one-click administrative action rather than a new enrolment "
         "flow: the historical certificate, its number and its audit trail are preserved, and "
         "only the validity window moves. Employees can filter to their own certificates with "
         "the <b>mine</b> view, which is what the My Learning header count on the Hub reads from.")

    # ================================================================ CH 8
    h1("8. TNI — Skill Gaps from Performance Reviews")
    body("Training Needs Identification (TNI) is what makes this module a development system "
         "rather than a course player. The module reads completed performance reviews and, when "
         "a manager has rated a skill below the threshold or flagged it for improvement, "
         "creates a <b>Skill Gap</b> record for that employee. Each gap stores the skill name, "
         "the current level (e.g. <i>5/10</i>), the required level (threshold + 1), the source "
         "review, and — when the catalog contains a course whose <b>Skills covered</b> tags "
         "match — the auto-suggested course. Gaps then travel a visible lifecycle: "
         "<b>open → suggested → in training → closed</b>.")
    img(os.path.join(ASSETS, "wf-performance-loop.png"),
        "Exhibit 8-1: The performance-integration loop — review to skill rating, automatically")
    body("The loop in Exhibit 8-1 is the module's core promise to business leaders: training "
         "spend is aimed at measured gaps, and completion feeds back into the next review cycle. "
         "Managers see open gaps surfaced on the L&D Hub (<i>\"N open skill gap(s) — From "
         "performance reviews (TNI)\"</i>), and L&D administrators can generate gaps on demand "
         "after an appraisal cycle via the skill-gap API (<i>action: generate</i>).")

    h2("8.1 How gaps are generated")
    bullet("<b>Rating threshold</b> — any review skill rated below 6 out of 10 (configurable) "
           "becomes a gap, with current level recorded as \"rating/10\".")
    bullet("<b>Improvement flags</b> — the review's free-text improvements are scanned for "
           "phrases like \"needs improvement\", \"improve\", \"gap\" or \"weak\"; up to three "
           "flags per review become gaps.")
    bullet("<b>Duplicate protection</b> — an existing open, suggested or in-training gap for the "
           "same employee and skill is never duplicated.")
    bullet("<b>Auto-match</b> — the engine searches published courses whose skills tags overlap "
           "the gap; a match sets the gap to <i>suggested</i> with the course attached, "
           "otherwise it stays <i>open</i> for manual course selection.")

    h2("8.2 Acting on a gap (SOP)")
    steps([
        "Review the gap list (L&D Hub alert card, or the skill-gap API list view).",
        "Accept the auto-suggested course, or attach a different course to the gap.",
        "Enrol directly from the gap — the gap moves to <b>in training</b> and links the "
        "enrolment so completion can be traced back to the original review.",
        "When the employee passes, the gap closes automatically and the enrolment reference is "
        "stored on the gap record as evidence.",
    ])
    body("Development goals are first-class too: any enrolment can be linked to an employee's "
         "individual development plan (IDP) or an OKR through the <b>Link Goal</b> action, which "
         "stores the goal and OKR references on the enrolment. This is how a promotion-track "
         "path, a skill gap and a quarterly objective can all point at the same course and "
         "report progress through one record — the exact integration promised in the module's "
         "design brief.")

    # ================================================================ CH 9
    h1("9. Compliance Tracking & Policy Sign-Offs")
    nav("Sidebar → Learning & Development → Compliance Center   |   Route: /learning/compliance")
    body("The Compliance Center is the audit-facing half of the module. It answers three questions "
         "continuously: who is due for mandatory training, who has signed what, and can you prove "
         "both in one click. The header row shows <b>Overall compliance (all departments)</b> as "
         "a percentage plus the top departments with progress bars (e.g. Engineering 48%, Finance "
         "67%), computed live from the requirement matrix. An <b>Export audit report</b> button "
         "downloads a CSV with one row per employee and Complete/Overdue/N-A per requirement — "
         "the artefact most auditors ask for first.")
    img(os.path.join(ASSETS, "07-lnd-compliance.png"),
        "Exhibit 9-1: Compliance Center — compliance KPIs, requirement cards and the employee matrix")

    h2("9.1 Compliance tracks")
    body("A compliance requirement binds a category (POSH, cybersecurity, safety, data privacy, "
         "healthcare or other) to a catalog course and a frequency: one-time, annual, biannual "
         "or quarterly. The matrix below the cards shows every employee, their department, a "
         "check-mark column per requirement and a personal compliance percentage. The daily "
         "engine evaluates the cycle window per frequency — quarterly means the last three "
         "months, annual the last twelve — and any employee without a completed enrolment "
         "inside the window is marked overdue.")
    steps([
        "Click <b>New requirement</b>.",
        "Name it (e.g. <i>POSH Act Training 2026</i>), pick the <b>category</b> and "
        "<b>frequency</b>.",
        "Link the compliance course with <b>Link compliance course…</b>.",
        "Click <b>Create</b>, then use <b>Auto-assign now</b> on the card whenever you want to "
        "push it: the engine enrols all active employees as mandatory with a due date 30 days "
        "out and notifies them.",
    ])
    img(os.path.join(ASSETS, "wf-compliance-engine.png"),
        "Exhibit 9-2: The compliance engine — recurring auto-assignment above, the 60/30/15-day "
        "expiration ladder below")

    h2("9.2 Bulk policy sign-offs")
    body("The second tab, <b>Policy sign-offs</b>, handles legally binding acknowledgements that "
         "are not courses: codes of conduct, handbooks, policy updates. Pushing a campaign "
         "creates a pending acknowledgement for every active employee; each employee types "
         "their full name to sign, and the platform stores the signature name and timestamp. "
         "Campaign cards track <i>\"24/40 signed (60%) · due date\"</i> with a progress bar, a "
         "per-user <b>Sign now</b> action, a <b>Remind pending</b> broadcast, and <b>Close</b> "
         "for finalised campaigns. Because signatures are timestamped per employee per policy "
         "version, the campaign list itself is acceptable audit evidence.")
    img(os.path.join(ASSETS, "08-lnd-signoffs.png"),
        "Exhibit 9-3: Policy sign-offs tab — campaign progress, Sign now, Remind and Close actions")

    # ================================================================ CH 10
    h1("10. Analytics & ROI — Kirkpatrick Model")
    nav("Sidebar → Learning & Development → Analytics & ROI   |   Route: /learning/analytics")
    body("Training that cannot be measured will always be the first line item cut. The Analytics "
         "page therefore implements the Kirkpatrick four-level evaluation model end to end, "
         "topped with four headline KPIs: <b>Completion rate</b>, <b>Total enrolments</b>, "
         "<b>Training ROI</b> (with spend and headcount) and <b>Knowledge gain (L2)</b>. In the "
         "demo tenant the sample data yields a 64% completion rate, 39 enrolments, a 607% ROI "
         "on ₹1,88,400 of spend, and a +39.1 point knowledge gain — numbers that make an "
         "L&D budget conversation concrete.")
    img(os.path.join(ASSETS, "09-lnd-analytics.png"),
        "Exhibit 10-1: Training Analytics & ROI — Kirkpatrick levels, rollups and promotion readiness")
    img(os.path.join(ASSETS, "wf-kirkpatrick.png"),
        "Exhibit 10-2: What each Kirkpatrick level measures and how it is computed")

    h2("10.1 The four levels in practice")
    bullet("<b>Level 1 — Reaction.</b> Post-course feedback captured on completion: overall "
           "rating of five, instructor rating and content-relevance rating, plus promoter "
           "(4–5 star) and detractor (≤2 star) counts.")
    bullet("<b>Level 2 — Learning.</b> Paired pre-test and post-test averages with the percentage "
           "of employees who improved, computed only for enrolments that have both scores.")
    bullet("<b>Level 3 — Behavior.</b> The employee's performance-review skills rating in the 90 "
           "days before versus the 90 days after course completion, reported as a delta with "
           "the number of employees who improved. This is behaviour change measured in the "
           "organisation's own review instrument.")
    bullet("<b>Level 4 — Results.</b> Financial ROI: total spend is course cost plus learning "
           "hours valued at a ₹450/hour blended rate; estimated annual benefit applies a "
           "productivity uplift of 10% of salary per ten points of assessed improvement "
           "(capped at 15%) against a default ₹6,00,000 annual salary; ROI = (benefit − spend) "
           "÷ spend × 100. The exact formula string is printed under the card so finance can "
           "challenge the assumptions.")

    h2("10.2 Rollups and promotion readiness")
    body("Beneath the level cards, three rollup panels break the same data down by category, by "
         "department (percentage of that department's employees trained) and the top courses by "
         "completions and average rating. The <b>Promotion readiness</b> panel lists every "
         "promotion-track path with the count of employees eligible (all required courses "
         "complete) versus in progress — turning Chapter 4's career gates into a live talent "
         "pipeline view. Together these panels are what an HR leadership review needs; export "
         "them via browser print or screenshot for board packs.")
