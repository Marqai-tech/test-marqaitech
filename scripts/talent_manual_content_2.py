#!/usr/bin/env python3
"""Chapters 5-6: Onboarding, Workflow Configuration."""
from talent_manual_kit import (
    h1, h2, h3, body, bullet, steps, callout, nav, img, tbl, spacer,
)

ASSETS = "/home/z/my-project/scripts/manual_assets/recruit"


def build():
    # ================================================================ CH 5
    h1("5. Onboarding Module")
    body("Onboarding turns a joining-ready candidate into a productive employee through a "
         "structured checklist. Its distinguishing feature is that <b>the checklist creates "
         "itself</b>: when an accepted offer is converted, the system generates the right tasks "
         "for that hire with due dates computed from the joining date, assigns them categories "
         "and owners, and notifies the responsible functions. HR then tracks completion on a "
         "single page with per-employee progress bars, rather than chasing tasks over email.")
    nav("Sidebar: Onboarding > Onboarding Dashboard  (/onboarding)")
    h2("5.1 Module Workflow: The Conversion Cascade")
    body("The cascade is triggered by the <b>Convert</b> action on an accepted offer and performs "
         "five things atomically. First, it creates the <b>employee record</b> with status "
         "probation and a generated employee code. Second, it opens a <b>preboarding case</b> "
         "starting at the first enabled stage after offer acceptance. Third, it generates the "
         "<b>onboarding tasks</b>: from active onboarding task templates when template generation "
         "is enabled and templates exist for the department, otherwise from the configured "
         "checklist phases - with due dates offset from the joining date and \"System "
         "(auto-generated)\" recorded as the assigner. Fourth, it sends <b>notifications</b> to IT "
         "(provisioning needed), Admin (workstation readiness), Finance (payroll setup) and HR "
         "(preboarding started), each linking back to the onboarding page. Fifth, it marks the "
         "application hired and decrements the job's vacancy count.")
    img(f"{ASSETS}/wf-onboarding.png",
        "Figure 5-1: The onboarding cascade and the default three-phase checklist with "
        "category and due-date offsets.")
    body("Because the cascade is a single transaction, a conversion either fully succeeds or "
         "leaves no partial state. If something looks wrong afterwards - for example a missing "
         "task group - check the template precedence rule in section 5.4 and the configuration in "
         "Chapter 6.4 before creating tasks by hand, since hand-made duplicates are the most "
         "common cause of double-booked orientation sessions.")
    h2("5.2 The Onboarding Screen")
    nav("Onboarding > /onboarding")
    body("The dashboard summarises the workload in four cards - <b>Total Tasks</b>, <b>Pending</b>, "
         "<b>In Progress</b> and <b>Completed</b> - above the checklist table. The table columns "
         "are <b>Employee, Task, Category, Due Date, Status, Notes</b> and <b>Actions</b>; rows can "
         "carry a Buddy chip, a \"from: template\" chip when generated from a template, and a "
         "preboarding origin reference. Filters cover the ten task categories (General, "
         "Documentation, IT Setup, Training, Compliance, HR Docs, Introduction, Buddy Setup, "
         "Payroll Setup, Project Allocation) and the four task statuses (Pending, In Progress, "
         "Completed, Skipped). The <b>Onboarding Progress</b> panel underneath aggregates "
         "per-employee completion: new hires, average completion percentage, overdue tasks and "
         "the number of employees fully onboarded, each with a progress bar and the next due "
         "task.")
    img(f"{ASSETS}/05-onboarding.png",
        "Figure 5-2: Onboarding dashboard - summary cards, filters and checklist table "
        "(demo tenant shown before its first conversion, hence the empty state).")
    h3("SOP - Run onboarding for a new hire")
    steps([
        "Convert the accepted offer on <b>/offers</b> (see Chapter 3.5). The employee, "
        "preboarding case and checklist appear immediately.",
        "Open <b>/onboarding</b> and filter by the new employee to review the generated tasks "
        "and their due dates.",
        "Assign owners where needed by editing a task (Mentor / Check-in Owner, Priority, "
        "Training Module and KRA fields are available).",
        "As work completes, click <b>Mark Complete</b> in the row's Actions column; the progress "
        "panel updates instantly.",
        "Watch the Onboarding Progress panel daily during the first week - overdue tasks and "
        "stalled employees are visible at a glance.",
        "After the ramp-up tasks (+7d training and KRAs, +14d allocation review) complete, the "
        "employee shows as fully onboarded.",
    ])
    h2("5.3 Creating and Editing Tasks Manually")
    body("Any task can be added by hand with <b>Add Task</b>: choose the Employee, enter the Task "
         "description, pick one of the ten Categories, set a Due Date and optionally Notes, "
         "Priority, Training Module, KRA and Mentor / Check-in Owner. Manual tasks are the right "
         "tool for exceptional cases - a visa appointment, an extra compliance training for one "
         "region - while repeating structure belongs in templates or configuration so the next "
         "hire benefits automatically. Editing follows the same form; Status is editable only on "
         "existing tasks.")
    h2("5.4 Task Templates and the Precedence Rule")
    nav("Onboarding > Onboarding Templates  (/onboarding/templates)")
    body("Task templates are reusable checklist rows with a <b>Template Name</b>, <b>Task</b>, "
         "<b>Category</b>, <b>Due Offset</b> in days from joining, and optional role and "
         "department scoping, plus an active flag. When the configuration option <b>\"Also "
         "generate from Onboarding Task Templates\"</b> is enabled and at least one active "
         "template matches the new hire's department, <b>templates take precedence</b> over the "
         "configured checklist phases for that hire. In practice this means a department that "
         "maintains its own templates gets exactly those tasks, while everyone else receives the "
         "standard configured checklist - one system, two levels of customisation, no duplicate "
         "task sets.")
    img(f"{ASSETS}/09-onboarding-templates.png",
        "Figure 5-3: Onboarding Task Templates - reusable, department-scoped checklist rows "
        "that override the default checklist when enabled.")

    # ================================================================ CH 6
    h1("6. Workflow Configuration (Admin Guide)")
    body("Workflow Configuration is the single admin page that shapes all three modules. It has "
         "three tabs - <b>Recruitment Pipeline</b>, <b>Preboarding Stages</b> and <b>Onboarding "
         "Checklist</b> - and every change saved here applies to the whole tenant immediately: "
         "the pipeline table and dashboard chart, the preboarding ladder and the conversion "
         "checklist all read the saved configuration live. A yellow dot on a tab marks that the "
         "tab has been customised away from system defaults. Access is restricted to the "
         "management roles listed in 6.1; everyone else sees a permission notice.")
    nav("Recruitment > Workflow Configuration  (/recruitment/workflow-config)")
    h2("6.1 Access and How Configuration Resolves")
    body("Users with the roles <b>tenant_admin, admin, hr_admin, company_hr_admin or "
         "super_admin</b> can open the editor and save; the API enforces the same list, so the UI "
         "gate is a convenience rather than the security boundary. A super_admin must scope a "
         "save to a specific company. Configuration resolves in a clear order: a "
         "<b>company-scoped</b> saved configuration wins, then the <b>tenant-wide</b> one, and if "
         "neither exists the <b>built-in defaults</b> apply. Saved JSON is validated on every "
         "read; if a saved configuration is ever invalid, the system silently falls back to "
         "defaults rather than breaking the hiring flow. Merging is key-based, so a saved "
         "configuration that omits a stage leaves that stage at its default.")
    h2("6.2 Tab 1: Recruitment Pipeline and Offer Approval Chain")
    img(f"{ASSETS}/06-wf-config-tab1.png",
        "Figure 6-1: Workflow Configuration, Recruitment Pipeline tab - stage editor and the "
        "Offer Approval Chain.")
    h3("Application Pipeline Stages")
    body("The six pipeline stages are listed with fixed keys and editable presentation. For each "
         "stage you can set the <b>colour</b> (slate, blue, amber, violet, green, red, cyan or "
         "pink), the <b>label</b> shown across the UI, the <b>SLA</b> target in days (0-365, "
         "blank for none), a <b>Visible</b> checkbox that hides the stage from pipeline views "
         "without changing stored data, and the <b>order</b> with the move up / move down "
         "arrows. Stage keys themselves cannot be added, deleted or renamed - they map to stored "
         "application statuses, which is what keeps historical data intact.")
    h3("Offer Approval Chain")
    body("The chain is enabled with the <b>Enabled</b> checkbox and consists of ordered approval "
         "tiers. Each tier has an <b>approver type</b> - Reporting Manager, Department Head, "
         "HR Admin, Tenant Admin, Finance or Specific User - plus, for the Specific User type, a "
         "user picker, and a free-text <b>label</b> such as \"HR Approval\". Tiers can be added, "
         "reordered and deleted. The semantics matter: the offer must be approved <b>tier by "
         "tier, in order</b>, and it is only \"Approved\" after the final tier signs - earlier "
         "signatures are recorded and shown as pending. Leaving the tier list empty while the "
         "chain is disabled allows any admin-level role to approve, which suits small teams.")
    callout("After changing the chain, test it with a draft offer before relying on it: create "
            "an offer, Advance it, and confirm the first tier's approver sees the pending "
            "state. Tier rules apply to newly recorded approvals immediately.",
            title="Rollout tip")
    h2("6.3 Tab 2: Preboarding Stages")
    img(f"{ASSETS}/07-wf-config-tab2.png",
        "Figure 6-2: Workflow Configuration, Preboarding Stages tab - the stage machine with "
        "SLAs, notify roles and joining gates.")
    body("Each preboarding stage row exposes the fixed key chip, an editable <b>label</b>, an "
         "<b>SLA</b> in days, a <b>notify roles</b> field (comma-separated role keys such as "
         "hr_admin, it_admin, admin) and an <b>Enabled</b> checkbox, plus reorder arrows. "
         "Converted candidates start at the first enabled stage after offer acceptance, so "
         "disabling Document Collection, for example, makes such candidates enter at Background "
         "Verification - useful for contractors whose documents were collected at offer time. "
         "Below the ladder sit the two gates: <b>\"Require HR verification before joining\"</b> "
         "and <b>\"Block \\\"Joined\\\" until all documents collected\"</b>. Disabled stages are "
         "hidden in the UI and rejected by the API, so a shortened ladder is enforced, not "
         "merely suggested.")
    h2("6.4 Tab 3: Onboarding Checklist")
    img(f"{ASSETS}/08-wf-config-tab3.png",
        "Figure 6-3: Workflow Configuration, Onboarding Checklist tab - phases with tasks, "
        "categories and due-date offsets.")
    body("The checklist is organised as ordered <b>phases</b>, each with a label and a set of "
         "task rows. Every task has a description, a <b>category</b> (general, it_setup, "
         "hr_docs, training, introduction, buddy_setup, payroll_setup, project_allocation) and a "
         "<b>Due</b> offset in days relative to the joining date, where negative numbers mean "
         "before joining (the default paperwork pack sits at -3 days) and positive numbers after "
         "it (ramp-up tasks at +7 and +14 days). Phases and tasks can be added, reordered and "
         "removed. Two checkboxes at the top control generation: <b>\"Also generate from "
         "Onboarding Task Templates\"</b> (templates win when they match, per Chapter 5.4) and "
         "<b>\"Buddy program enabled\"</b>.")
    h2("6.5 Saving, Resetting and Safe Experimentation")
    body("Each tab ends in a save bar with the note that saved configuration applies "
         "immediately, and a <b>Save Configuration</b> button that performs the PUT to "
         "/api/recruitment/workflow-config. Every tab also has its own <b>Reset</b> action that "
         "restores the system defaults for that workflow after a confirmation prompt - your "
         "customisation for that tab is removed. Because reads are validated and fall back to "
         "defaults on error, experimentation is safe: a half-edited tab only takes effect when "
         "saved, and a bad save is reverted by Reset in seconds. Still, the recommended routine "
         "for significant changes is to announce them, save outside working hours, and verify on "
         "the dashboard charts as described in Chapter 3.2.")
    tbl(
        ["Workflow type", "Configurable", "Fixed by system"],
        [
            ["recruitment", "Stage labels, colours, order, SLA, visibility; approval chain "
             "on/off, tiers (type, user, label, order)", "Stage keys; that approval is "
             "sequential when enabled"],
            ["preboarding", "Stage labels, SLA, notify roles, enabled flags, order; both "
             "joining gates", "Stage keys; forward-only advancing"],
            ["onboarding", "Phase labels and order, task text, category, due offset, "
             "add/remove; template generation toggle; buddy toggle", "The ten task categories; "
             "that templates take precedence when matching"],
        ],
        [0.16, 0.52, 0.32],
        "Table 6-1: Configuration surface per workflow type.",
    )
