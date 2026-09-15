#!/usr/bin/env python3
"""L&D Manual content - Chapters 1-5."""
import os

ASSETS = "/home/z/my-project/scripts/manual_assets/lnd"


def build():
    import lnd_manual_kit as kit
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer = (
        kit.h1, kit.h2, kit.h3, kit.body, kit.bullet, kit.steps,
        kit.callout, kit.nav, kit.img, kit.tbl, kit.spacer)

    # ================================================================ CH 1
    h1("1. Introduction & Module Architecture")
    body("The Learning & Development (L&D) module is 3Boxes HRMS's digital engine for employee "
         "upskilling, compliance training and professional growth. It replaces the familiar "
         "spreadsheet-plus-email training process with a single automated workflow: skill gaps "
         "are identified from performance reviews, courses are nominated and approved, enrolments "
         "are created with deadlines, delivery and assessments are tracked live, digital "
         "certificates are issued automatically on passing, and the entire cycle is measured "
         "through the Kirkpatrick four-level evaluation model ending in a financial ROI figure. "
         "Because every step writes an auditable record, the module also doubles as the company's "
         "compliance evidence trail for POSH, cybersecurity and safety mandates.")
    body("The module lives in the main sidebar under the <b>Learning & Development</b> section "
         "and is organised into eight pages: <b>L&D Hub</b>, <b>Course Catalog</b>, <b>Learning "
         "Paths</b>, <b>Assignments & Enrolment</b>, <b>Course Requests</b>, <b>Certifications</b>, "
         "<b>Compliance Center</b> and <b>Analytics & ROI</b>. Every employee in the organisation "
         "can see the section; the pages themselves adapt to the signed-in role. Administrators get "
         "management consoles and KPI cards, managers get team approvals and result recording, and "
         "employees get their personal learning plan, certificates and signature queue.")
    callout("All screenshots in this manual were captured on the 3Boxes HRMS demo tenant "
            "(nexus-hrms-mu.vercel.app) with sample Indian-rupee data pre-loaded for evaluation. "
            "Figures such as course costs, scores and compliance percentages are demonstration "
            "values, not production data.", title="About the screenshots in this manual")

    h2("1.1 What the module manages")
    body("The L&D module is built around eleven linked data records that together cover the full "
         "training lifecycle. Understanding them helps every other chapter of this manual make "
         "sense, because each screen is a window onto one or two of these records. The records, "
         "and the screens that manage them, are summarised below.")
    tbl(
        ["Record", "Purpose", "Managed from"],
        [
            ["Course + Course Modules", "The catalog entry: content hub with videos, documents, quizzes, "
             "external links, cost, skills and passing score.", "Course Catalog"],
            ["Learning Path (+ ordered courses)", "A structured sequence of courses: onboarding, compliance "
             "bundles, role transitions and promotion tracks.", "Learning Paths"],
            ["Course Assignment", "A bulk instruction to train individuals, a department or the whole "
             "company by a due date.", "Assignments & Enrolment"],
            ["Course Enrolment", "One employee × one course: progress, due date, pre/post-test scores, "
             "feedback and result.", "Assignments & Enrolment / L&D Hub"],
            ["Certificate", "Auto-issued on passing; carries a unique number, validity window and "
             "renewal-alert state.", "Certifications"],
            ["Training Request", "An employee's nomination for a course (catalog or external) awaiting "
             "supervisor/L&D approval.", "Course Requests"],
            ["Compliance Requirement", "A recurring mandate (POSH, cybersecurity, safety) linked to a "
             "course with a frequency.", "Compliance Center"],
            ["Policy Sign-off + Acknowledgement", "A bulk digital-signature campaign for policies and "
             "handbooks, with timestamped acknowledgements.", "Compliance Center"],
            ["Skill Gap", "A TNI record: the skill, current vs required level, source review and the "
             "suggested course.", "Hub (TNI card) / APIs"],
        ],
        [0.24, 0.50, 0.26],
        "Table 1-1: Core L&D records and where they are managed",
    )

    h2("1.2 The eight-step automated workflow")
    body("The module implements one continuous digital workflow, and the L&D Hub shows it as a "
         "strip so every user can see where a given enrolment currently sits. The workflow begins "
         "with Training Needs Identification (TNI) and ends only when the employee's skill record "
         "and the company's analytics reflect the completed learning. Each step is either fully "
         "automatic or a single-click action for the responsible role, which is what makes the "
         "process scalable across departments.")
    img(os.path.join(ASSETS, "wf-lnd-workflow.png"),
        "Exhibit 1-1: The end-to-end L&D workflow — Phase 1 identifies, nominates and approves; "
        "Phase 2 delivers, assesses and evaluates")
    body("Steps 1–3 are covered in Chapter 6 (nominations and approvals) and Chapter 8 (TNI from "
         "performance reviews). Step 4 is the enrolment engine of Chapter 5. Steps 5–7 run on the "
         "enrolment lifecycle described in Chapter 7, and step 8 closes the loop by feeding the "
         "analytics of Chapter 10. The remainder of this chapter explains how to find your way "
         "around the module; later chapters are ordered the same way as the workflow itself.")

    h2("1.3 Roles at a glance")
    body("Five roles use the module, and the platform gates every action to the appropriate one. "
         "Employees and managers see personal and team views; HR managers and administrators "
         "(tenant admin, admin, super admin) additionally manage the catalog, paths, compliance "
         "requirements and approvals. The complete permission matrix is in Chapter 12, but the "
         "practical split is worth memorising early: <b>employees request and learn</b>, "
         "<b>managers approve and record results</b>, and <b>L&D administrators build and "
         "govern</b>.")
    bullet("<b>Employee</b> — sees My Learning, requests training, takes courses, signs policies, "
           "earns certificates.")
    bullet("<b>Manager</b> — everything an employee sees, plus team approvals and the ability to "
           "record assessment results and suggest training.")
    bullet("<b>HR Manager</b> — management actions on catalog, paths, assignments, approvals, "
           "compliance and sign-offs.")
    bullet("<b>Admin / Tenant Admin / Super Admin</b> — full control including deletion of courses "
           "and paths, and the audit export.")

    # ================================================================ CH 2
    h1("2. L&D Hub — Your Starting Point")
    nav("Sidebar → Learning & Development → L&D Hub   |   Route: /learning")
    body("The L&D Hub is the role-aware landing page for the whole module. Its subtitle states the "
         "intent plainly: <i>\"Upskilling, compliance tracking and professional growth through an "
         "automated digital workflow.\"</i> From here you can reach every other page, watch your "
         "personal learning queue, and — if you are an administrator — monitor the organisation's "
         "training posture through live KPI cards. The page is deliberately compact: it answers "
         "\"what do I do next?\" in one glance and defers detail to the dedicated pages.")
    img(os.path.join(ASSETS, "01-lnd-hub.png"),
        "Exhibit 2-1: L&D Hub (admin view) — KPI cards, alert cards and the L&D Modules grid")

    h2("2.1 Employee view — My Learning")
    body("For employees the most important block is <b>My Learning</b>. It lists the courses "
         "assigned to them with live progress bars, the due date, and a status badge (assigned, "
         "in progress, completed, failed or expired). The header line also summarises standing "
         "obligations, for example <i>\"2 active certificates · 2 signatures pending\"</i>, which "
         "counts active certificates and unsigned policy acknowledgements. When nothing is "
         "pending, the panel shows the friendly message <i>\"No assigned courses pending — browse "
         "the catalog to request training.\"</i> and points employees at self-nomination. Each row "
         "carries a <b>Start</b> or <b>Continue</b> button that immediately moves the enrolment "
         "into in-progress state with a timestamp, so managers can see who has actually begun.")
    steps([
        "Sign in and open <b>L&D Hub</b> from the sidebar.",
        "Review the <b>My Learning</b> rows — the highest-priority item is the one nearest its due date.",
        "Click <b>Start</b> (first time) or <b>Continue</b> (returning) on a course row.",
        "Complete the content, then wait for your manager or L&D admin to record the assessment "
        "result — a passed result automatically issues your certificate (Chapter 7).",
    ])

    h2("2.2 Administrator view — KPI and alert cards")
    body("Administrators see four KPI cards across the top: <b>Published courses</b> (with the "
         "number of learning paths as the sub-label), <b>Enrolments</b> (split into completed and "
         "in progress), <b>Certificates issued</b> (auto-issued on passing assessments) and "
         "<b>Compliance tracks</b> (with pending training requests as the sub-label). Below them, "
         "up to three alert cards appear only when attention is genuinely needed: pending course "
         "requests awaiting approval, open skill gaps from performance reviews (TNI), and team "
         "requests a manager-direct supervisor still has to approve. Clicking any alert takes you "
         "straight to the queue that can clear it, which keeps the hub an action surface rather "
         "than a dashboard you must interpret.")
    body("The <b>L&D Modules</b> grid then links to the seven working pages with one-line "
         "descriptions, and admins also get a <b>Manage Catalog</b> shortcut in the header. The "
         "bottom of the page renders the <b>L&D Workflow</b> strip — the same eight steps "
         "shown in Exhibit 1-1 — so new users always have the process map one scroll away.")

    # ================================================================ CH 3
    h1("3. Course Catalog & Content Hub")
    nav("Sidebar → Learning & Development → Course Catalog   |   Route: /learning/catalog")
    body("The Course Catalog is the central repository for everything the company teaches. Each "
         "course card shows its delivery mode (e-learning, instructor-led, document, quiz, "
         "external link or blended), difficulty level, duration in hours, number of modules, "
         "cost in rupees, and live engagement counters (<i>\"30 enrolled · 83% complete\"</i>). "
         "Compliance courses carry an amber <i>Compliance · POSH</i>-style badge, and "
         "promotion-gate courses carry a blue <i>Promotion gate</i> badge — both flags drive "
         "behaviour elsewhere in the module, so they are set carefully at creation time.")
    img(os.path.join(ASSETS, "02-lnd-catalog.png"),
        "Exhibit 3-1: Course Catalog & Content Hub with sample INR-priced courses")

    h2("3.1 Finding courses")
    body("The search box filters by title or code as you type (try <i>POSH-101</i>), and the "
         "<b>All categories</b> dropdown narrows the grid to one of six categories: technical, "
         "soft skills, compliance, leadership, onboarding or domain. Category filtering matters "
         "because the TNI engine in Chapter 8 matches skill gaps against the <b>Skills covered</b> "
         "field of published courses — a catalog that is categorised and tagged well is the "
         "single biggest contributor to useful automation later.")

    h2("3.2 Creating a course (SOP)")
    body("Only administrators and HR managers can publish courses. The form captures the content "
         "hub in one screen: identity and cost, delivery and assessment, and the module list. "
         "Cost is entered in rupees and feeds directly into the Level-4 ROI calculation, so an "
         "accurate figure here pays off in analytics later.")
    steps([
        "Click <b>New Course</b> (top right).",
        "Fill <b>Course title *</b> and optionally a <b>Code</b> (e.g. POSH-101) and <b>Provider</b>.",
        "Choose the <b>category</b>, <b>mode</b> and <b>level</b>; set <b>Duration (hours)</b>.",
        "For external content paste the <b>External link / content URL</b>; e-learning modules are "
        "defined in the next field instead.",
        "Enter <b>Skills covered</b> as comma-separated values — these are used for TNI matching, "
        "so reuse the skill names your performance reviews use.",
        "Write the <b>Description / learning objectives</b> employees will read on the card.",
        "Tick <b>Compliance course</b> (and pick POSH / CYBERSECURITY / SAFETY / DATA_PRIVACY / "
        "OTHER) if this is a statutory certification; tick <b>Promotion-gate course</b> if it "
        "gates a career ladder.",
        "Set the <b>Passing score %</b> (default 60) and the <b>Cost</b> in rupees.",
        "In the <b>Modules</b> box, add one module per line as <i>type|title|minutes</i> where type "
        "is video, document, quiz, link, live_session or on_job — e.g. "
        "<i>video|Welcome & policy overview|15</i>.",
        "Click <b>Publish course</b>. The course appears in the catalog immediately and becomes "
        "assignable, requestable and TNI-matchable.",
    ])
    callout("Deleting a course (trash icon) permanently removes it <b>and all of its enrolments</b>. "
            "The confirmation dialog states this explicitly. Prefer archiving by editing a course's "
            "status when you only want to retire it from assignment.", title="Deletion is cascading")

    # ================================================================ CH 4
    h1("4. Learning Paths & Promotion Tracks")
    nav("Sidebar → Learning & Development → Learning Paths   |   Route: /learning/paths")
    body("A learning path bundles courses into an ordered journey. Typical paths are new-joiner "
         "onboarding, an annual compliance bundle, or a Team-Lead-to-Manager transition. Each "
         "path card shows its category, status, enrolment count and completion percentage, and "
         "its sequence as numbered chips (<i>1. Workplace Safety Induction → 2. Cybersecurity "
         "Awareness → … → Path complete</i>). Optional courses are marked, and required ones are "
         "assumed otherwise. When a path is assigned, the enrolment engine creates one enrolment "
         "per course in the path — required and optional alike — and stamps each with the path "
         "reference so progress can be tracked as a whole.")
    img(os.path.join(ASSETS, "03-lnd-paths.png"),
        "Exhibit 4-1: Learning Paths with a promotion track (Team Lead → Manager)")

    h2("4.1 Promotion readiness tracks")
    body("Ticking <b>Promotion readiness track</b> and setting a <b>Target role</b> turns the path "
         "into a career gate. Promotion-track paths surface in the Analytics page's <b>Promotion "
         "readiness</b> panel, which counts employees as <i>eligible</i> only when they have "
         "completed every required course in the track, and <i>in progress</i> otherwise. This "
         "gives HR an objective, course-completion-based promotion signal instead of an "
         "improvised one, and gives employees a visible checklist for the role they are aiming "
         "at. The demo tenant ships a <i>Team Lead → Manager Track</i> with three courses so you "
         "can see the pattern end to end.")

    h2("4.2 Creating a path (SOP)")
    steps([
        "Click <b>New Path</b>.",
        "Enter the <b>Path name *</b> and choose a category: onboarding, compliance, role "
        "transition, promotion or skill upskilling.",
        "For promotion tracks set the <b>Target role</b> and tick <b>Promotion readiness track</b>.",
        "Optionally set <b>Duration (weeks)</b> and a description; choose status draft or active.",
        "Use <b>+ Add course to path…</b> to pick courses in the intended order; reorder with the "
        "arrow buttons in <b>Course sequence</b>.",
        "Mark any course as optional if it should not block path completion.",
        "Click <b>Create path</b> (or <b>Save changes</b> when editing). The path becomes "
        "assignable from the Assignments page and requestable as a bundle.",
    ])
    callout("Assigning a path creates one enrolment per course. If an employee already has an "
            "enrolment for one of those courses, that enrolment is kept — the engine never "
            "creates duplicates. Progress is reported per course, not per path.", title="Path assignment behaviour")

    # ================================================================ CH 5
    h1("5. Assignment & Enrolment Engine")
    nav("Sidebar → Learning & Development → Assignments & Enrolment   |   Route: /learning/enrollments")
    body("The Assignments page is the operational heart of the module: it is where mandatory and "
         "optional training is pushed to people, and where completion is tracked live. Five stat "
         "cards summarise the current scope — <b>Total enrolments</b>, <b>assigned</b>, "
         "<b>in progress</b>, <b>completed</b> and <b>Overdue</b> — and filter chips (all, "
         "assigned, in progress, completed, failed) narrow the tracking table. Each row shows "
         "the employee, course, the <b>Source</b> that created the enrolment (assigned, request, "
         "manager recommendation or compliance auto), progress bar, due date, status badge and "
         "result. The list is role-scoped: administrators see the company, managers see "
         "themselves and their direct reports, employees see only their own rows.")
    img(os.path.join(ASSETS, "04-lnd-enrollments.png"),
        "Exhibit 5-1: Assignment & Enrolment Engine — stats, filters and the tracking table")

    h2("5.1 Assigning training (SOP)")
    body("Approvers (admins, HR managers and managers) click <b>Assign training</b> to open the "
         "assignment wizard. The wizard supports three targeting modes, which cover the vast "
         "majority of real training pushes: individuals, a whole department, or the entire "
         "company context. Every created enrolment notifies its employee, and the confirmation "
         "toast reports exactly what happened, including any duplicates that were skipped.")
    steps([
        "Click <b>Assign training</b>.",
        "Select the course (or a learning path) from <b>Select course *</b>.",
        "Choose the assignee type: <b>individual</b> (multi-select employees via search), "
        "<b>department</b> (<b>Select department *</b>) or <b>company</b> (all active employees in "
        "the selected company context).",
        "Set the <b>Due Date</b> and tick <b>Mandatory</b> for statutory or gated training.",
        "Optionally note a <b>Reason</b> — it is stored on the assignment for audit.",
        "Click <b>Create enrolments</b>. The toast confirms: <i>\"Assigned — N enrolment(s) "
        "created, N notified\"</i>.",
    ])
    callout("Enrolments are deduplicated by the platform: one employee can hold only one enrolment "
            "per course. Re-assigning skips existing enrolments rather than duplicating them, so "
            "bulk pushes are safe to repeat.", title="Duplicate protection")

    h2("5.2 Recording results and lifecycle")
    body("Enrolments move through a simple lifecycle: <b>assigned</b> → <b>in progress</b> → "
         "<b>completed</b> or <b>failed</b>, with <b>expired</b> as a terminal state for overdue "
         "items. Employees advance their own progress (Start/Continue on the Hub), but the "
         "assessment result is an approver action: click <b>Record result</b> on the row and "
         "enter the assessment score in the prompt. A score at or above the course's passing "
         "score (default 60%) completes the enrolment, records the certificate automatically "
         "(Chapter 7) and closes any matching skill gap (Chapter 8). Below the pass mark the "
         "enrolment is marked failed and the attempt count increments, so the employee can be "
         "re-assigned for a retake.")
    body("The result cell shows the outcome at a glance: a percentage plus the certificate number "
         "for passes (e.g. <i>95% · CERT-FY2627-0044</i>), or the <b>Record result</b> button "
         "while an assessment is outstanding. Recording also captures pre-test and post-test "
         "scores when provided, which feed the Level-2 learning analytics — the module defaults "
         "the pre-test to 40 when a trainer does not run a separate baseline, and the prompt "
         "shows the pass threshold so there is no guessing.")
