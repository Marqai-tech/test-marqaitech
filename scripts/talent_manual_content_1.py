#!/usr/bin/env python3
"""Chapters 1-4: Introduction, Lifecycle, Recruitment, Preboarding."""
from talent_manual_kit import (
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer,
)

ASSETS = "/home/z/my-project/scripts/manual_assets/recruit"


def build():
    # ================================================================ CH 1
    h1("1. Introduction")
    body("This manual is the standard operating procedure (SOP) and user guide for the three "
         "talent-acquisition modules of 3Boxes HRMS: <b>Recruitment</b>, <b>Preboarding</b> and "
         "<b>Onboarding</b>. Together these modules carry a new hire from the first job requisition "
         "to a fully productive employee, and every step in between is configurable by your own "
         "administrators. The manual documents the workflows exactly as they are implemented in the "
         "product, including the field names, buttons, page paths and approval rules that users "
         "will see on screen.")
    body("A deliberate design principle of this suite is that <b>workflow logic lives in "
         "configuration, not in code</b>. Pipeline stage names, service-level targets, approval "
         "tiers, preboarding stages and the auto-generated onboarding checklist are all maintained "
         "by HR administrators through the Workflow Configuration editor. This manual therefore "
         "gives workflow configuration its own dedicated chapter (Chapter 6), and every module "
         "chapter explains which configuration drives the behaviour being described. If a screen "
         "in your tenant shows different stage labels than the examples in this manual, the "
         "underlying workflow is the same - only the configured labels differ.")
    h2("1.1 Purpose of This Manual")
    body("The purpose of this document is to let every role - HR administrator, recruiter, hiring "
         "manager, approver and new hire support functions such as IT - operate the hiring "
         "lifecycle confidently and consistently. It provides step-by-step procedures for daily "
         "tasks, explains the approval and gating rules that the system enforces automatically, "
         "and serves as the reference for troubleshooting the questions that most often reach the "
         "help desk. Following the SOP ensures that data stays consistent across the three modules "
         "and that candidates receive a professional, trackable experience from application to "
         "their first completed week.")
    h2("1.2 Scope and Intended Audience")
    body("The manual covers the Recruitment module (requisitions, job postings, applications, "
         "screening, interviews, offers and the tiered offer approval chain), the Preboarding "
         "module (the stage machine that runs from offer acceptance to Day 1 readiness, including "
         "document collection and background verification tracking), and the Onboarding module "
         "(checklists, task templates and progress tracking). It also covers the Workflow "
         "Configuration editor that administers all three. Out of scope are the Performance, "
         "Project Management and Attendance modules, which are documented separately; where those "
         "modules interact with hiring (for example the employee record created on conversion), "
         "the interaction is described from the hiring side only.")
    body("Readers are assumed to have a working 3Boxes HRMS account with one of the standard "
         "roles. Chapter 7 defines what each role can see and do, and Chapter 8 provides the "
         "action-by-action permission matrix. Screenshots in this manual were taken from a live "
         "demo tenant; your data will naturally differ, but the layout and controls are identical.")
    h2("1.3 How to Use This Manual")
    body("Chapters are organised <b>module by module</b> as requested by operating teams: each "
         "module chapter opens with a workflow diagram, walks through the screen regions in the "
         "order a user encounters them, and then presents numbered SOP procedures for the core "
         "tasks. Numbered steps are meant to be followed top to bottom the first few times; after "
         "that, the quick-reference cards in Chapter 9 are designed for daily use. Administrators "
         "configuring the system for the first time should read Chapter 2 for the big picture, "
         "then work through Chapter 6 carefully before going live, because configuration changes "
         "apply to the whole tenant immediately.")

    # ================================================================ CH 2
    h1("2. The Talent Acquisition Lifecycle")
    body("The three modules form one continuous pipeline with clear hand-offs. Recruitment owns "
         "everything up to a hired, offer-accepted candidate. The <b>conversion cascade</b> is the "
         "bridge: a single click turns the accepted offer into an employee record, starts "
         "preboarding, and generates the onboarding checklist. Preboarding then prepares everything "
         "physically and legally required before the joining date, and Onboarding runs the first "
         "30 days of structured integration. Understanding these boundaries is the fastest way to "
         "answer the classic question of where a person \"is\" in the system at any moment.")
    img(f"{ASSETS}/wf-overview.png",
        "Figure 2-1: The end-to-end talent acquisition lifecycle across the three modules, "
        "with the conversion cascade as the bridge.")
    body("Each module hands off a well-defined artefact. Recruitment hands off a <b>hired "
         "candidate with an accepted offer</b>. The cascade hands off an <b>employee record plus a "
         "preboarding case plus a generated checklist</b>. Preboarding hands off a <b>Day 1 Ready "
         "employee with verified documents and completed background verification</b>. Onboarding "
         "hands off a <b>fully onboarded employee</b> whose tasks, training and allocations are "
         "complete. Because every hand-off is logged and auditable, HR can always reconstruct who "
         "did what and when.")
    h2("2.1 Where Each Module Ends and the Next Begins")
    tbl(
        ["Boundary", "Trigger", "What the receiving module gets"],
        [
            ["Recruitment to cascade", "User clicks Convert on an accepted offer "
             "(Offer Management)", "Employee record (probation status), preboarding case at the "
             "first enabled stage, generated onboarding tasks, notifications to HR, IT, Admin "
             "and Finance"],
            ["Preboarding to Day 1", "Candidate reaches the final configured stage "
             "(Day 1 Ready / Joined) and passes the enabled gates", "A joining-ready employee; "
             "onboarding checklist tasks due before Day 1 should already be complete"],
            ["Onboarding completion", "All checklist tasks completed or skipped",
             "Employee marked fully onboarded in the Onboarding Progress panel"],
        ],
        [0.22, 0.34, 0.44],
        "Table 2-1: Module boundaries and hand-off artefacts.",
    )
    h2("2.2 The Golden Thread: Configuration")
    body("One configuration page drives all three modules. The stage names you see on the "
         "recruitment pipeline, the number of approval tiers an offer passes through, the "
         "preboarding ladder, the HR-verification and document gates, and the checklist a new "
         "hire receives are all read live from the tenant's workflow configuration. This is why "
         "the dashboard pipeline chart, the preboarding stage ladder and the conversion checklist "
         "always agree with each other: they are three views of the same source of truth. Chapter "
         "6 explains every field of that editor, and the module chapters cross-reference the "
         "relevant section wherever configuration changes behaviour.")

    # ================================================================ CH 3
    h1("3. Recruitment Module")
    body("The Recruitment module is a full applicant tracking system (ATS): requisitions and job "
         "postings at the top of the funnel, application intake and screening in the middle, "
         "interviews and offers near the bottom, and a tiered approval chain guarding every offer. "
         "The primary working page is <b>/recruitment</b>, with three tabs - Jobs, Candidates and "
         "Analytics - while the <b>/dashboards/recruitment</b> page provides the management view "
         "of funnel health. Offers live on their own <b>/offers</b> page, because their approval "
         "workflow deserves dedicated space.")
    nav("Sidebar: Recruitment > Recruitment Dashboard (/dashboards/recruitment), "
        "Requisitions (/requisitions), Offers (/offers), Workflow Configuration "
        "(/recruitment/workflow-config)")
    h2("3.1 Module Workflow")
    body("The application pipeline has six fixed stages: applied, screening, interview, offered, "
         "hired and rejected. The <b>keys are fixed by the system</b> because they are stored on "
         "every application record, but their display labels, order, SLA targets, colours and "
         "visibility are configurable per tenant. When an application reaches the Offered stage, "
         "an offer record is created on the Offers page and must pass the configured approval "
         "chain tier by tier before it can be sent to the candidate. Only after the candidate "
         "accepts can the recruiter convert the offer into an employee, which triggers the "
         "cascade described in Chapter 5.")
    img(f"{ASSETS}/wf-recruitment.png",
        "Figure 3-1: Recruitment module workflow - the six-stage application pipeline and the "
        "sequential offer approval chain.")
    h2("3.2 The Recruitment Dashboard")
    nav("Recruitment > Recruitment Dashboard  (/dashboards/recruitment)")
    body("The dashboard is the morning checkpoint for the hiring team. Six stat cards summarise "
         "the funnel: <b>Open Positions</b>, <b>Total Applications</b>, <b>Interviews Scheduled</b>, "
         "<b>Offers Pending</b>, <b>Hires This Month</b> and <b>Avg Time-to-Hire</b> (in days). All "
         "values are computed live from the tenant database - there are no demo or cached numbers. "
         "The <b>Recruitment Pipeline</b> bar chart below the cards is built from the configured "
         "workflow stages, so it shows your own stage labels and includes a conversion percentage "
         "under each bar. A <b>Source Distribution</b> donut shows which channels (LinkedIn, "
         "referrals, job portals and so on) feed the funnel, alongside a monthly applications "
         "trend, recent applications and upcoming interviews.")
    body("The Quick Actions strip links to the six most frequent tasks: Post New Job, Schedule "
         "Interview, Review Applications, Talent Pool, Offer Management and Analytics. Note that "
         "because the pipeline chart reads the live configuration, renaming a stage in Workflow "
         "Configuration (Chapter 6.2) changes the chart immediately - a useful way to verify that "
         "a configuration change has taken effect.")
    img(f"{ASSETS}/01-recruitment-dashboard.png",
        "Figure 3-2: Recruitment Dashboard with live stats and the configured pipeline chart.")
    h2("3.3 Job Postings: Creating and Managing")
    nav("Recruitment > (working page) /recruitment > Jobs tab > Create Job")
    body("Job postings are the containers for openings. The Jobs tab lists every posting with "
         "search and filters for type (Full-time, Part-time, Contract, Internship), status (Open, "
         "Closed, On Hold, Filled) and department. Each row expands to show its applicants with "
         "inline status editing. Best practice, reflected in the module's own tips, is to create "
         "the requisition first on the Requisitions page and then raise the posting against it, so "
         "that approvals and headcount stay linked.")
    h3("SOP - Post a new job")
    steps([
        "Open <b>/recruitment</b> and stay on the <b>Jobs</b> tab.",
        "Click <b>Create Job</b> (top right; visible to admin roles).",
        "Fill the required fields: <b>Job Title</b>, <b>Department</b> and <b>Description</b>; "
        "optionally Position, Location, Type, Experience, Salary Range, Vacancies, Closing Date "
        "and Requirements.",
        "Click <b>Post Job</b>. The posting appears in the list with status Open.",
        "To share externally, use the job board chips on the posting's detail page "
        "(LinkedIn, Indeed, Glassdoor, StepStone, Naukri) or point candidates to the public "
        "careers site at /careers.",
    ])
    h3("SOP - Move an application through the pipeline")
    steps([
        "Open the job's detail page (click a posting) and switch to the <b>Pipeline</b> tab, or "
        "work from the <b>Candidates</b> tab of /recruitment.",
        "Set the application status using the status editor (Applied, Screening, Interview, "
        "Offered, Hired, Rejected) and click <b>Save</b>.",
        "Strong but unmatched candidates can be moved to the talent pool with <b>Move to Talent "
        "Pool</b> instead of being rejected outright.",
        "The SLA badges configured per stage (for example Screening 3d, Interview 7d) are your "
        "service targets; the dashboard trend helps you spot stages that routinely breach them.",
    ])
    callout("Non-recruiter users see candidate contact details masked with a \"PII masked for "
            "hiring panel\" badge. The masking policy is configurable by admins under "
            "/recruitment/pii-policy.", title="Privacy note")
    h2("3.4 Screening Tools and Analytics")
    body("The <b>Analytics</b> tab of /recruitment is a cross-application shortlist finder. Enter "
         "skills (comma separated), experience range in years, expected salary range, status and "
         "optionally a specific job posting, then click <b>Search Candidates</b>. The results "
         "panel reports Total Matches, Average Experience, Average Expected Salary and Unique "
         "Skills Found, and renders a clickable skills cloud - clicking a skill filters the result "
         "set further. This is the fastest way to build a shortlist from the full historical "
         "applicant pool rather than from a single posting.")
    body("The module also ships AI-assisted helpers: resume parsing and consent capture under "
         "/api/ats, and a sentiment analysis action on candidate cards. These are aids to human "
         "decision-making; the pipeline status always remains a manual, auditable decision.")
    h2("3.5 Offers and the Tiered Approval Chain")
    nav("Recruitment > Offers  (/offers)")
    body("Every offer is created on the Offers page and carries a status: draft, pending_approval, "
         "approved, sent, accepted, rejected or withdrawn. The <b>Workflow</b> column of the offer "
         "table is where the lifecycle happens: clicking <b>Advance</b> moves the offer to the "
         "next status. While approval tiers remain unsigned the offer sits at "
         "<b>pending_approval</b> and each qualifying click records one tier approval. The system "
         "enforces <b>strict tier order</b>: the API checks the next unsigned tier and, if the "
         "current user does not match it, rejects the action with HTTP 403 and the message "
         "\"Approval blocked: tier {n} of {total} requires \\\"{label}\\\" to approve before you "
         "can act.\" The signed tiers are stored on the offer as an approval trail.")
    body("Once the final tier signs, the status flips to <b>approved</b>; the next Advance sends "
         "the offer and mints a secure candidate link (an access token) that can be copied with "
         "the <b>Link</b> button. The candidate opens the link, reviews the offer and accepts or "
         "declines; a declined offer optionally routes the candidate to a decline survey. An "
         "<b>accepted</b> offer shows the <b>Convert</b> button - the doorway to the onboarding "
         "cascade (Chapter 5). If no approval tiers are configured, only admin-level roles may "
         "approve offers, preserving a single controlled signature.")
    h3("SOP - Create and route an offer")
    steps([
        "On <b>/offers</b> click <b>Create Offer</b>.",
        "Fill <b>Candidate Name</b>, <b>Position</b>, <b>Salary</b> and <b>Joining Date</b> "
        "(required), plus email, department, currency (INR/USD/EUR) and probation days as needed.",
        "Click <b>Create</b>. The offer starts as <b>draft</b>.",
        "Click <b>Advance</b> to submit it - status becomes <b>pending_approval</b>.",
        "Each configured approver (tier) clicks <b>Advance</b> in order; each click records one "
        "tier signature. The badge stays \"Pending Approval\" until the final tier signs.",
        "When the offer shows <b>approved</b>, click <b>Advance</b> again to <b>send</b> it, then "
        "use <b>Link</b> to copy the candidate link and share it.",
        "When the candidate accepts (status <b>accepted</b>), click <b>Convert</b> to start the "
        "onboarding cascade.",
    ])
    img(f"{ASSETS}/03-offers.png",
        "Figure 3-3: Offer Management - the Workflow column drives Advance, Link and Convert "
        "actions.")
    h2("3.6 Reading the Funnel Signals")
    body("Three signals on the dashboard deserve a daily glance. First, <b>Offers Pending</b> "
         "greater than zero for more than a day usually means a tier approver has not acted - the "
         "approval trail on the offer tells you exactly which tier is waiting. Second, a "
         "<b>conversion percentage</b> below roughly 10% between Screening and Interview often "
         "indicates the screening criteria are stricter than the job requirements. Third, "
         "<b>Avg Time-to-Hire</b> trending upward while applications stay flat suggests an SLA "
         "breach somewhere in the middle of the pipeline; compare the per-stage SLA targets in "
         "Workflow Configuration with the actual stage ages to find the bottleneck.")

    # ================================================================ CH 4
    h1("4. Preboarding Module")
    body("Preboarding is the stage machine that runs between \"offer accepted\" and \"ready for "
         "Day 1\". It exists because the weeks between acceptance and joining are where offers "
         "are lost and Day 1 failures are created: documents do not arrive, background checks "
         "stall, laptops are not ordered. The module makes this invisible work visible as a "
         "ladder of six configurable stages, each with its own SLA target and responsible role, "
         "and each advancing the candidate one concrete step closer to joining.")
    nav("Sidebar: Preboarding > Preboarding Dashboard  (/preboarding)")
    h2("4.1 Module Workflow: The Stage Machine")
    body("A converted candidate enters preboarding at the <b>first enabled stage after offer "
         "acceptance</b> - by default Document Collection - and advances forward one stage at a "
         "time. The default ladder is <b>Offer Accepted (2d)</b>, <b>Document Collection (5d)</b>, "
         "<b>Background Verification (7d)</b>, <b>IT Provisioning (3d)</b>, <b>Asset Request "
         "(2d)</b> and <b>Day 1 Ready / Joined</b>. Each stage carries an SLA in days and a "
         "notify-roles list; when a candidate enters a stage, the configured roles receive a "
         "notification. Disabled stages are hidden everywhere and cannot be set - the API rejects "
         "transitions into them with a validation error, so the ladder can be shortened per "
         "tenant without breaking the flow.")
    img(f"{ASSETS}/wf-preboarding.png",
        "Figure 4-1: The preboarding stage machine with default SLAs, notify roles and the two "
        "joining gates.")
    body("Two optional gates harden the end of the ladder. <b>Require HR verification before "
         "joining</b> holds the candidate at the final stage until an HR user confirms the "
         "HR Verified toggle. <b>Block \"Joined\" until all documents are collected</b> prevents "
         "reaching Day 1 Ready with pending documents - the classic protection against "
         "\"we will get the contract signed later\". Both are checkboxes in the Preboarding "
         "Stages tab of Workflow Configuration (Chapter 6.3).")
    h2("4.2 The Preboarding Screen")
    nav("Preboarding > /preboarding > Pipeline tab")
    body("The dashboard opens with four stat cards - <b>Total Candidates</b>, <b>In Progress</b>, "
         "<b>Pending BGV</b> and <b>Ready for Day 1</b> - followed by the stage ladder bar that "
         "mirrors your configured stages with live counts. Below it, the <b>Pipeline</b> table "
         "lists candidates with their position, current stage, start date and HR Verified state. "
         "The <b>Documents</b> tab tracks per-candidate document status (Pending, Uploaded, "
         "Verified, Rejected) across the standard document set, and the <b>BGV Tracking</b> tab "
         "records vendor background-check status (Pending, In Progress, Completed, Failed) with "
         "submission and completion dates. A live-data banner shows whether candidates have been "
         "converted from recruitment yet.")
    img(f"{ASSETS}/04-preboarding.png",
        "Figure 4-2: Preboarding dashboard - stat cards, the configured stage ladder and the "
        "candidate pipeline.")
    h3("SOP - Advance a candidate through preboarding")
    steps([
        "Open <b>/preboarding</b> and locate the candidate in the Pipeline table (use the search "
        "box or the All Stages filter).",
        "Complete the work of the current stage first - upload and verify documents in the "
        "Documents tab, or update the BGV record in BGV Tracking.",
        "Click <b>Advance Stage</b> (chevron) in the Actions column. The candidate moves to the "
        "next enabled stage and the notify roles of that stage are informed.",
        "If the candidate cannot proceed (for example BGV failed), edit the candidate and set the "
        "stage back, or use Cancelled - stage moves are auditable.",
        "Before the final stage, confirm the enabled gates: HR Verified must be marked if that "
        "gate is on, and all documents must be verified if the document block is on.",
    ])
    callout("The Advance action is optimistic: the row updates immediately and rolls back "
            "automatically if the server rejects the transition, for example into a disabled "
            "stage.", title="UI behaviour")
    h2("4.3 Documents and Background Verification")
    body("The Documents tab presents one grid per candidate covering the standard document set: "
         "offer letter, ID proof, tax forms, direct deposit details, employment agreement and "
         "emergency contact. Each document moves through Pending, Uploaded, Verified and "
         "Rejected; HR should verify only originals or registry-checked copies, because the "
         "document gate trusts these statuses when it blocks or allows joining. The BGV Tracking "
         "tab is deliberately minimal: vendor, status, submitted and completed dates and free "
         "notes, which is enough to keep the background-check vendor accountable against the "
         "stage SLA without duplicating the vendor's own portal.")
    body("Candidates can also be added manually with <b>Add Candidate</b> (Full Name, Email, "
         "Position, Stage, Start Date) for cases that bypass recruitment, such as rehires or "
         "intern conversions handled offline. The stage select in that form lists exactly the "
         "enabled stages from configuration, so manually added candidates follow the same ladder "
         "as converted ones.")
