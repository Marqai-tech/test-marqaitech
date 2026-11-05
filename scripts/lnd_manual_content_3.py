#!/usr/bin/env python3
"""L&D Manual content - Chapters 11-15."""


def build():
    import lnd_manual_kit as kit
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer = (
        kit.h1, kit.h2, kit.h3, kit.body, kit.bullet, kit.steps,
        kit.callout, kit.nav, kit.img, kit.tbl, kit.spacer)

    # ================================================================ CH 11
    h1("11. Notifications & Automation")
    body("The L&D module plugs into the platform's multi-channel notification center (module "
         "key: <i>learning</i>). Four events cover the lifecycle, and every event supports the "
         "standard four channels — in-app, email, SMS and Slack/Teams webhooks — with editable "
         "subject and body templates that use the same double-brace placeholders as the rest of "
         "the platform, e.g. <b>{{Course_Name}}</b>, <b>{{Due_Date}}</b>, <b>{{Recipient_Name}}"
         "</b>. Tenant administrators can override any template in the notification console "
         "(<i>Notifications → Templates & Rules</i>) without code changes.")
    tbl(
        ["Event", "Fires when", "Primary recipients"],
        [
            ["learning.training.assigned", "A new assignment or approved request creates enrolments; "
             "also used for compliance reminders.", "Enrolled employee (up to 60 per push)"],
            ["learning.compliance.reminder", "Daily cron: certificate renewal bands, overdue mandatory "
             "enrolments, and sign-off reminders.", "Employee; manager on 15-day escalation"],
            ["learning.training.completed", "An enrolment is completed with a passing score.",
             "Employee and reporting manager"],
            ["learning.manager.completion_report", "Manager-level completion summaries.",
             "Reporting manager"],
        ],
        [0.28, 0.44, 0.28],
        "Table 11-1: Learning notification events and their triggers",
    )
    body("Beyond notifications, three automations run without any user involvement. First, the "
         "duplicate-proof enrolment engine (one enrolment per employee per course) makes bulk "
         "assignment idempotent. Second, the auto-issue chain on passing: certificate created, "
         "matching skill gap closed, employee and manager notified. Third, the daily compliance "
         "cron at 03:00 UTC which scans active certificates for the 60/30/15-day bands, marks "
         "expired certificates, and nudges overdue mandatory enrolments.")

    h2("11.1 The compliance cron in detail")
    bullet("<b>Deduped alerts.</b> Each certificate stores which alert thresholds have already "
           "fired (a JSON map of 60/30/15 timestamps), so employees receive exactly one alert "
           "per band — renewal resets the map.")
    bullet("<b>Escalation.</b> When a certificate enters the 15-day band, the alert is marked "
           "\"ESCALATED to manager\" and the direct reporting manager is added as recipient.")
    bullet("<b>Auto-expiry.</b> Certificates past their validity date flip to expired "
           "automatically; the renewal action of Chapter 7 brings them back.")
    bullet("<b>Overdue nudges.</b> Mandatory enrolments past their due date remind the employee "
           "each run until completed or expired.")

    # ================================================================ CH 12
    h1("12. Roles & Permissions Matrix")
    body("Access follows the platform's five standard roles. Two internal role groups drive the "
         "UI: <b>administrators</b> (super admin, tenant admin, admin, HR manager) unlock the "
         "management consoles, and <b>approvers</b> (administrators plus managers) unlock "
         "assignment, approval and result-recording actions. The module itself is visible to "
         "all five roles, subject to the tenant's module whitelist. Use the matrix below when "
         "setting up role assignments or investigating a \"button missing\" report.")
    tbl(
        ["Capability", "Employee", "Manager", "HR Mgr", "Admin"],
        [
            ["View My Learning & own certificates", "Yes", "Yes", "Yes", "Yes"],
            ["Request training / nominate courses", "Yes", "Yes", "Yes", "Yes"],
            ["Sign policy acknowledgements", "Yes", "Yes", "Yes", "Yes"],
            ["Approve / reject course requests", "No", "Yes (team)", "Yes (all)", "Yes (all)"],
            ["Assign training (individual / dept / company)", "No", "Yes", "Yes", "Yes"],
            ["Record assessment results", "No", "Yes", "Yes", "Yes"],
            ["Create / edit courses and paths", "No", "No", "Yes", "Yes"],
            ["Delete courses and paths", "No", "No", "No", "Yes"],
            ["Renew certificates", "No", "No", "Yes", "Yes"],
            ["Create compliance requirements / auto-assign", "No", "No", "Yes", "Yes"],
            ["Push policy sign-off campaigns / remind / close", "No", "No", "Yes", "Yes"],
            ["Export audit report (CSV)", "No", "No", "Yes (view)", "Yes"],
            ["View company-wide analytics & ROI", "No", "Team view", "Yes", "Yes"],
        ],
        [0.46, 0.13, 0.15, 0.13, 0.13],
        "Table 12-1: L&D permission matrix by role",
        center_cols=[1, 2, 3, 4],
    )
    callout("\"Yes (team)\" means a manager sees and acts on their own requests and their direct "
            "reports' only; company-wide queues are reserved for HR managers and admins. The "
            "server enforces this scoping on every API call, not just in the UI.",
            title="Scope notes")

    # ================================================================ CH 13
    h1("13. SOP Quick Reference")
    body("This chapter condenses the procedures of Chapters 2–9 into three role playbooks. Each "
         "line is an action in the UI, in order, and can be used as a desk aid or onboarding "
         "cheat-sheet for the module. Times assume the demo tenant's seeded catalog; a live "
         "tenant's steps are identical.")

    h2("13.1 L&D administrator playbook")
    steps([
        "<b>Build the catalog:</b> Course Catalog → New Course → fields + modules → Publish course. "
        "Tag skills accurately; set realistic passing scores and rupee costs.",
        "<b>Structure journeys:</b> Learning Paths → New Path → add courses in order → mark "
        "promotion tracks with a target role.",
        "<b>Define mandates:</b> Compliance Center → New requirement → category + frequency + "
        "linked course → Auto-assign now each cycle.",
        "<b>Push policies:</b> Compliance Center → Policy sign-offs → Push policy for signature → "
        "monitor signed percentage → Remind pending → Close.",
        "<b>Clear queues:</b> Hub alert cards → Course Requests approvals; generate TNI gaps after "
        "each appraisal cycle; enrol or assign from suggested gaps.",
        "<b>Keep certifications healthy:</b> Certifications → work the <60/<30/<15-day "
        "bands → Renew after re-assessment.",
        "<b>Prove it:</b> Compliance Center → Export audit report before every audit or management "
        "review; Analytics & ROI for the Kirkpatrick story.",
    ])

    h2("13.2 Manager playbook")
    steps([
        "<b>Identify:</b> after each performance review, note skills rated below the bar — the TNI "
        "engine turns them into suggested courses automatically.",
        "<b>Nominate:</b> Course Requests → Request training → Manager suggested → cost + reason.",
        "<b>Approve:</b> Course Requests → review team requests → Approve & enrol (or Reject "
        "with a reason).",
        "<b>Assign:</b> Assignments & Enrolment → Assign training → team individuals → due "
        "date + Mandatory.",
        "<b>Close the loop:</b> record results from the tracking table; watch your completion "
        "report notifications; use Link Goal to tie enrolments to IDPs/OKRs.",
        "<b>Escalation partner:</b> respond to 15-day certificate escalations — either the "
        "employee re-certifies now, or you schedule the retake.",
    ])

    h2("13.3 Employee playbook")
    steps([
        "<b>Check in:</b> L&D Hub → My Learning → Start/Continue the nearest-due course.",
        "<b>Grow:</b> browse the Course Catalog; Request training with a cost estimate and reason "
        "when you find something valuable.",
        "<b>Complete:</b> finish modules, take the assessment, view your result via the tracking "
        "table or your certificate.",
        "<b>Stay compliant:</b> complete POSH / cybersecurity / safety before their due dates; "
        "renewal alerts arrive at 60, 30 and 15 days.",
        "<b>Sign:</b> Compliance Center → Policy sign-offs → Sign now by typing your full name — "
        "your acknowledgement is timestamped.",
    ])

    # ================================================================ CH 14
    h1("14. FAQ & Troubleshooting")
    h3("Q1. Why can I not see the Assign training button?")
    body("Assignment, approval and result recording are approver actions — administrators, HR "
         "managers and managers. If you are an employee, request training instead via Course "
         "Requests; if you are a manager and still cannot see it, ask your tenant admin to "
         "check your role assignment and the tenant's module whitelist for "
         "<i>learning</i>.")
    h3("Q2. An employee was assigned a course twice — is that a bug?")
    body("No. Enrolments are deduplicated by the platform: one employee holds at most one "
         "enrolment per course. Re-assigning skips the existing enrolment and the toast's "
         "\"created vs notified\" counts reflect that. The employee simply keeps their current "
         "progress.")
    h3("Q3. Why did a certificate get 12-month validity while another is lifetime?")
    body("Validity follows the course type at completion time: compliance courses (POSH, "
         "cybersecurity, safety, data privacy or other statutory content) issue 12-month "
         "certificates so statutory re-certification recurs; all other courses issue lifetime "
         "certificates. The Renew action extends a certificate by 12 months from the later of "
         "its expiry or today.")
    h3("Q4. The renewal alert fired twice for the same certificate.")
    body("The daily cron deduplicates per threshold band via the certificate's reminder map, so "
         "one alert per band is the expected behaviour. If you re-created a certificate or "
         "renewed it, counters reset by design. Persistent duplicates usually indicate two "
         "certificates for the same course (e.g. one from an earlier cycle) — revoke the stale "
         "one from the certifications API or renew only the current one.")
    h3("Q5. My assessment was recorded as failed but the employee answered correctly.")
    body("The pass mark is the course's <b>Passing score %</b> (default 60). Check the course "
         "edit form; if the threshold was set unusually high (e.g. 90), lower it and record the "
         "result again — attempts are logged, so the history remains visible.")
    h3("Q6. Can employees record their own scores?")
    body("No. Result recording is deliberately approver-only to keep assessments honest. "
         "Employees control progress (Start/Continue), and approvers control the verdict. The "
         "server rejects self-recording even if the endpoint is called directly.")
    h3("Q7. How do I train the whole company at once?")
    body("Use <b>Assign training</b> → assignee type <b>company</b>: every active employee in "
         "the selected company context is enrolled (duplicates skipped). For recurring "
         "statutory training prefer a compliance requirement with <b>Auto-assign now</b>, which "
         "also sets a mandatory 30-day due date and keeps the audit matrix updated.")
    h3("Q8. Where does the ROI number come from?")
    body("Level 4 uses the formula printed under the card: spend = course cost + learning hours "
         "× ₹450/hour blended rate; benefit = a productivity uplift of 10% of salary per ten "
         "points of assessed improvement, capped at 15%, on a default ₹6,00,000 annual salary; "
         "ROI% = (benefit − spend) ÷ spend × 100. Treat it as a directional business case and "
         "recalibrate the blended rate with finance if your cost base differs.")
    h3("Q9. Policy sign-off says \"Your signature pending\" — what must I do?")
    body("Open Compliance Center → Policy sign-offs and click <b>Sign now</b> on the campaign "
         "card, then type your full name exactly as your legal signature. The platform stores "
         "the typed name and timestamp as a legally binding acknowledgement for that policy "
         "version.")
    h3("Q10. Why is a skill gap not suggesting any course?")
    body("Auto-matching compares the gap's skill with each published course's <b>Skills "
         "covered</b> tags. If no course shares the tag, the gap stays <i>open</i>. Either add "
         "the skill tag to a suitable course (Catalog → Edit) or attach a course to the gap "
         "manually before enrolling.")
    h3("Q11. Do learning paths track a single progress percentage?")
    body("Progress is tracked per course enrolment; the path card shows the aggregate "
         "percentage across its enrolments. Employees complete the sequence course by course, "
         "and optional courses never block path completion in the promotion-readiness count.")
    h3("Q12. What happens to enrolments when a course is deleted?")
    body("Deleting a course cascades: all of its enrolments and their certificates are removed. "
         "That is why the confirm dialog names the course explicitly. For retirements, prefer "
         "editing the course's status to archived so history is preserved.")

    # ================================================================ CH 15
    h1("15. Glossary")
    tbl(
        ["Term", "Meaning in 3Boxes HRMS L&D"],
        [
            ["Blended rate", "The per-hour cost used to value learning time in ROI (₹450/hour by "
             "default), combining course cost with employee hours spent."],
            ["Compliance requirement", "A recurring mandate (one-time/annual/biannual/quarterly) "
             "binding a category such as POSH to a catalog course."],
            ["Compliance track", "The requirement card + matrix view that shows who is complete, "
             "overdue or not applicable per mandate."],
            ["Content hub", "The course-level collection of videos, documents, quizzes, live "
             "sessions, external links and on-the-job tasks."],
            ["Course module", "One unit of course content, defined as type|title|minutes in the "
             "catalog form (video, document, quiz, link, live_session, on_job)."],
            ["Enrolment", "The single employee-course record carrying progress, due date, scores, "
             "feedback and result; unique per employee per course."],
            ["Enrolment source", "Why the enrolment exists: assigned, self, request, "
             "manager_recommendation or compliance_auto."],
            ["Escalation (15-day)", "The final renewal alert band; the direct reporting manager is "
             "added as recipient alongside the employee."],
            ["IDP / OKR link", "Optional references stored on an enrolment tying it to an "
             "employee's development plan or a company objective."],
            ["Kirkpatrick model", "Four-level training evaluation: Reaction, Learning, Behavior, "
             "Results — implemented on the Analytics page."],
            ["Level 3 (Behavior)", "Skills-rating comparison in the 90 days before vs after "
             "completion, from performance reviews."],
            ["Passing score", "The percentage at or above which an assessment passes (default "
             "60%)."],
            ["Policy sign-off", "A bulk digital-signature campaign; acknowledgements are typed "
             "signatures with timestamps per employee per version."],
            ["Promotion-gate course", "A course flagged as mandatory for a career ladder; "
             "promotion tracks surface eligibility from its completion."],
            ["Promotion readiness", "Analytics panel counting employees eligible (all required "
             "path courses complete) vs in progress per track."],
            ["Renewal band", "The 60/30/15-day windows before certificate expiry that trigger "
             "deduplicated alerts."],
            ["Skill gap (TNI)", "A record of a skill shortfall with current/required level, source "
             "review and suggested course; lifecycle open → suggested → in training → closed."],
            ["TNI", "Training Needs Identification — deriving training demand from performance "
             "reviews, supervisor feedback and compliance mandates."],
            ["Training request", "An employee's nomination for a catalog or external course, with "
             "expected cost and reason, pending approval."],
            ["Validity window", "A certificate's validFrom–validUntil range; 12 months for "
             "compliance courses, lifetime otherwise."],
        ],
        [0.26, 0.74],
        "Table 15-1: L&D glossary",
    )
    body("For platform-wide terms — tenants, roles, approval tiers, notification channels — "
         "refer to the core 3Boxes HRMS documentation set. The notification console's template "
         "editor documents every placeholder available to learning events, and the compliance "
         "export format is stable for downstream GRC tooling. Together with this manual, those "
         "references complete the operating picture for a production-ready learning "
         "organisation.")
