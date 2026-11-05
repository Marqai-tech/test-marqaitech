#!/usr/bin/env python3
"""Chapters 7-11: Roles, Permission Matrix, Quick-Reference Cards, FAQ, Glossary."""
from talent_manual_kit import (
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer,
)


def build():
    # ================================================================ CH 7
    h1("7. Roles and Permissions")
    body("The hiring modules use the platform's standard role model. Two capabilities matter "
         "most day to day: who can <b>manage workflow configuration</b>, and who can "
         "<b>approve offers</b> at each tier. Configuration management is restricted to "
         "tenant_admin, admin, hr_admin, company_hr_admin and super_admin - enforced by the API "
         "for both saving and resetting. Offer approval depends on the configured tiers: when a "
         "tier names a role type (HR Admin, Finance, and so on), any user holding that role "
         "qualifies; when a tier names a Specific User, only that user qualifies; when no chain "
         "is configured, only admin-level roles may approve.")
    tbl(
        ["Role", "Recruitment", "Preboarding / Onboarding", "Workflow configuration"],
        [
            ["Super Admin", "Full access across tenants (company scoping required to save "
             "config)", "Full access", "Can save, must target a company"],
            ["Tenant Admin", "Full access; fallback offer approver", "Full access",
             "Save and reset"],
            ["HR Admin / Company HR Admin", "Full ATS access; default tier-1 approver; "
             "HR Verified sign-off", "Full access; advances stages; verifies documents",
             "Save and reset"],
            ["Manager / Department Head", "Shortlist, interview feedback; can act as "
             "Reporting Manager or Department Head approval tier", "Task completion for own "
             "reports", "No"],
            ["Finance", "Approves CTC-sign-off tiers only", "Payroll setup tasks", "No"],
            ["Employee (general)", "No ATS access", "Completes assigned onboarding tasks; "
             "may act as buddy", "No"],
        ],
        [0.20, 0.30, 0.27, 0.23],
        "Table 7-1: Role capabilities across the three modules.",
    )
    body("Two platform-level rules are worth remembering. First, all API routes verify the "
         "session token and the tenant database is resolved per tenant, so cross-tenant leakage "
         "is structurally prevented. Second, audit logging records the sensitive mutations - "
         "job posting creation, application status changes, offer status transitions (with tier "
         "signatures noted), and every workflow configuration update - giving auditors a "
         "complete trail without any extra effort from users.")

    # ================================================================ CH 8
    h1("8. Approval and Permission Matrix")
    body("The matrix below lists the seventeen actions that cover virtually all daily "
         "decision-making in the three modules, and which role may perform each. Where the "
         "offer approval chain is enabled, the tier configuration always wins: a tier of type "
         "Finance permits Finance users for that signature specifically, regardless of the "
         "generic \"approve\" column. Read \"Admin-level\" as tenant_admin, admin, hr_admin, "
         "company_hr_admin and super_admin.")
    tbl(
        ["#", "Action", "Who can do it"],
        [
            ["1", "Create / edit / close job postings", "Admin-level"],
            ["2", "Submit an application (internal form or careers site)", "Anyone (public "
             "careers) / HR"],
            ["3", "Change application stage status", "Admin-level; Edit Status on rows is "
             "admin-only"],
            ["4", "Shortlist / reject from candidate cards", "Admin-level"],
            ["5", "Move candidate to talent pool", "Admin-level"],
            ["6", "Run candidate shortlist analytics search", "HR and managers"],
            ["7", "Schedule interview and record feedback", "Admin-level and hiring "
             "managers"],
            ["8", "Create offer (draft)", "Admin-level"],
            ["9", "Submit offer into approval (Advance)", "Admin-level"],
            ["10", "Sign approval tier", "The tier's role or specific user, in order"],
            ["11", "Send approved offer / copy candidate link", "Admin-level"],
            ["12", "Record candidate acceptance or decline", "System via candidate link; "
             "admin-level can update status"],
            ["13", "Convert accepted offer to employee", "Admin-level"],
            ["14", "Advance preboarding stage", "Admin-level (stage notify roles are "
             "informed)"],
            ["15", "Mark HR Verified", "HR roles"],
            ["16", "Complete / edit onboarding tasks", "Task owner, mentor, HR, admins"],
            ["17", "Save or reset workflow configuration", "Admin-level (super_admin with "
             "company scope)"],
        ],
        [0.07, 0.45, 0.48],
        "Table 8-1: Action-by-action permission matrix.",
    )
    callout("A 403 on an offer action is almost always the tier gate, not a permission "
            "problem: the message names the exact tier and label required. Forward the offer "
            "to that approver rather than escalating.", title="Reading rejections")

    # ================================================================ CH 9
    h1("9. Role Quick-Reference Cards")
    body("These four cards compress the daily routine of each key role into a few lines. They "
         "are intentionally terse - the detailed procedures live in Chapters 3 to 6. Print them "
         "or pin them in your team channel; they answer ninety percent of \"how do I...\" "
         "questions for new team members.")
    h2("9.1 HR Administrator")
    bullet("<b>Owns:</b> the whole ladder - postings to Day 1 - plus workflow configuration.")
    bullet("<b>Morning:</b> dashboard cards (offers pending? overdue preboarding stages?), "
           "then clear blockers.")
    bullet("<b>Core actions:</b> post jobs, move applications, create offers, advance "
           "preboarding stages, mark HR Verified, complete onboarding tasks.")
    bullet("<b>Escalates:</b> tier approvers who have not signed; BGV vendor delays.")
    bullet("<b>Configures:</b> stages, SLAs, approval tiers, checklist - then verifies on the "
           "dashboard.")
    h2("9.2 Recruiter / Hiring Manager")
    bullet("<b>Owns:</b> candidates from application to accepted offer.")
    bullet("<b>Core actions:</b> shortlist via Analytics tab, schedule interviews, keep stage "
           "statuses truthful, create the offer draft, submit it for approval.")
    bullet("<b>Remember:</b> you cannot approve your own offer through the chain - approvers "
           "sign in configured order.")
    bullet("<b>After acceptance:</b> click Convert once, then confirm the checklist appeared "
           "on /onboarding.")
    h2("9.3 Approver (Tier signatory)")
    bullet("<b>Owns:</b> one signature in the offer chain.")
    bullet("<b>Sees:</b> \"Offer Pending Approval\" notification linking to /offers.")
    bullet("<b>Does:</b> review salary, position and joining date; click Advance once - the "
           "system records your tier.")
    bullet("<b>If blocked:</b> the message names the tier that must sign before yours; wait "
           "or coordinate, do not retry.")
    h2("9.4 IT / Admin / Finance support functions")
    bullet("<b>Owns:</b> the provisioning, asset and payroll tasks that preboarding and "
           "onboarding assign to them.")
    bullet("<b>Triggered by:</b> stage notifications (IT Provisioning, Asset Request) and "
           "conversion notifications (Payroll Setup Required).")
    bullet("<b>Does:</b> complete the assigned onboarding task rows; keep the preboarding "
           "stage SLA in mind (3d provisioning, 2d assets by default).")
    bullet("<b>Escalates:</b> missing information to HR via the task notes field, not email.")

    # ================================================================ CH 10
    h1("10. FAQ and Troubleshooting")
    body("The answers below reflect the enforced system behaviour, not conventions. Where a "
         "behaviour is configurable, the answer says so and points to Chapter 6.")
    h2("10.1 Why is my offer stuck at \"Pending Approval\"?")
    body("The offer remains pending until <b>every configured tier</b> has signed, in order. "
         "Open the offer and check the approval trail: the first tier without a signature is "
         "the blocker, and its type or named user tells you exactly who to nudge. Clicking "
         "Advance as anyone else returns the 403 tier message. This is the sequential gate "
         "working as designed.")
    h2("10.2 Who can approve if no tiers are configured?")
    body("If the chain is disabled or the tier list is empty, only admin-level roles can "
         "approve an offer - a deliberate single-signature fallback for small teams. Add tiers "
         "in Workflow Configuration, tab 1, when you want a real chain.")
    h2("10.3 Can I rename or add pipeline stages?")
    body("You can rename labels, recolour, reorder, set SLAs and hide stages, but the six "
         "stage <b>keys</b> are fixed because application histories store them. A hidden stage "
         "(Visible unchecked) still exists for data purposes; new applications simply do not "
         "show it in pipeline views.")
    h2("10.4 Why can't I set a preboarding candidate to a stage I removed?")
    body("Disabled stages are rejected by the API with a validation error - not just hidden "
         "in the UI. This guarantees the ladder your team sees is the ladder the system "
         "enforces. Re-enable the stage in tab 2 if you genuinely need it back.")
    h2("10.5 A converted candidate has no onboarding tasks - why?")
    body("Two usual causes. First, template precedence: if \"Also generate from Onboarding "
         "Task Templates\" is enabled and a department-scoped template set matches, those "
         "templates replaced the default checklist - possibly with zero tasks if the matched "
         "templates are empty or inactive. Second, the configuration's phases may have been "
         "emptied. Check tab 3 and the templates page, then create the missing tasks once in "
         "configuration so future hires inherit them.")
    h2("10.6 Where do due dates on generated tasks come from?")
    body("From the joining date plus each task's <b>Due</b> offset. Negative offsets land "
         "before joining (paperwork at -3 days), zero on Day 1, positive after (training +7, "
         "allocation review +14). Changing the joining date on the offer before conversion "
         "shifts the whole schedule; after conversion, edit task due dates directly.")
    h2("10.7 What does an SLA number on a stage actually do?")
    body("It records a service target in days for that stage. The system surfaces stage ages "
         "and trends on dashboards and reports so breaches are visible; it does not "
         "auto-reject or auto-escalate. Treat SLA fields as your operational contract with the "
         "team, reviewed in the recruitment reports.")
    h2("10.8 Why does the pipeline chart show my custom stage names?")
    body("The dashboard builds its pipeline chart from the <b>enabled configured stages</b>, "
         "so label and order changes appear immediately after saving. It is also the quickest "
         "smoke test that a configuration save worked.")
    h2("10.9 Can two candidates share one preboarding stage order differently?")
    body("No - the ladder is global per tenant (or company scope). Different joins happen "
         "naturally: a candidate entering at Document Collection and another at Background "
         "Verification, depending on which stages were enabled at conversion time. To change "
         "an individual's position, advance or edit that candidate's stage.")
    h2("10.10 What happens to the job's vacancy count after conversion?")
    body("The cascade decrements the posting's vacancies as part of conversion, keeping "
         "Open Positions honest. If the number looks wrong, check for duplicate applications "
         "marked hired on the same posting.")
    h2("10.11 A candidate declined after preboarding started - now what?")
    body("Set the preboarding candidate to Cancelled from the preboarding page and reject or "
         "withdraw the offer record for the audit trail. Generated employee records and tasks "
         "should be cleaned up with HR review before Day 1 reporting is affected.")
    h2("10.12 Who receives preboarding stage notifications?")
    body("The roles listed in each stage's <b>notify roles</b> field - by default hr_admin on "
         "the first three stages, it_admin on IT Provisioning and admin on Asset Request. "
         "Adjust the field per stage in tab 2; changes apply to future entries immediately.")

    # ================================================================ CH 11
    h1("11. Glossary")
    body("Terms are listed alphabetically. Keys in fixed-width style are system values users "
         "may encounter in filters, URLs or exports.")
    tbl(
        ["Term", "Meaning"],
        [
            ["Advance (offer)", "The Workflow-column button that moves an offer to its next "
             "status; while tiers are unsigned it records one tier signature."],
            ["Approval tier", "One ordered signature step in the offer approval chain, bound "
             "to a role type or a specific user."],
            ["BGV", "Background verification - the vendor-run check tracked in the BGV "
             "Tracking tab (statuses: Pending, In Progress, Completed, Failed)."],
            ["Buddy program", "Optional onboarding feature pairing the new hire with a buddy; "
             "adds buddy_setup tasks and a Buddy chip on task rows."],
            ["Cascade (conversion)", "The single transaction behind Convert: employee record, "
             "preboarding case, generated checklist, notifications, hired status and vacancy "
             "decrement."],
            ["Category (task)", "One of ten fixed onboarding task categories: general, "
             "it_setup, hr_docs, training, introduction, buddy_setup, payroll_setup, "
             "project_allocation (plus Documentation and Compliance in filters)."],
            ["Company-scoped config", "A workflow configuration saved for one company, which "
             "overrides the tenant-wide configuration and defaults."],
            ["Convert", "The button on an accepted offer that runs the cascade."],
            ["Day 1 Ready", "The final preboarding stage (key: joined), gated by HR "
             "verification and, optionally, complete documents."],
            ["Due offset", "Days relative to the joining date used to schedule generated "
             "onboarding tasks; negative means before joining."],
            ["HR Verified", "HR's confirmation toggle on a preboarding candidate, required "
             "before joining when the gate is enabled."],
            ["Onboarding progress", "The per-employee completion panel (new hires, average "
             "completion, overdue tasks, fully onboarded)."],
            ["Pending Approval", "Offer state while approval tiers remain unsigned."],
            ["Pipeline stage key", "Fixed stored value for an application stage (applied, "
             "screening, interview, offered, hired, rejected); labels are configurable."],
            ["Preboarding stage machine", "The forward-only ladder of configured stages a "
             "converted candidate walks from offer acceptance to Day 1."],
            ["Requisition", "The approved hiring request that precedes a job posting."],
            ["SLA (stage)", "Configured service-target days for a pipeline or preboarding "
             "stage, used for reporting and dashboards."],
            ["Stage ladder", "The visual bar on /preboarding showing configured stages with "
             "live candidate counts."],
            ["Talent pool", "Holding status for strong candidates without an active match, "
             "instead of rejection."],
            ["Template precedence", "The rule that matching onboarding task templates replace "
             "the configured checklist for a hire when template generation is enabled."],
            ["Tenant", "Your organisation's isolated workspace; workflow configuration is "
             "tenant-wide unless company-scoped."],
            ["Tier order", "The strict sequence in which offer approval tiers must sign; "
             "enforced by the API with a 403 on out-of-order attempts."],
            ["Time-to-hire", "Dashboard metric averaging days from application to hire."],
            ["Workflow Configuration", "The admin editor at /recruitment/workflow-config with "
             "three tabs shaping all three modules."],
            ["Workflow type", "One of the three configurable workflows: recruitment, "
             "preboarding, onboarding."],
        ],
        [0.24, 0.76],
        "Table 11-1: Glossary of module terminology.",
    )
