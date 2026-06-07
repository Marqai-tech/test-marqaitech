#!/usr/bin/env node
/**
 * NEXUS HRMS - Workflow Documentation Generator
 * Generates a professional DOCX with DM-1 Deep Cyan palette
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, PageBreak, BorderStyle,
  ShadingType, TableLayoutType, convertInchesToTwip, convertMillimetersToTwip,
  Header, Footer, PageNumber, NumberFormat, SectionType, VerticalAlign,
  ImageRun, Tab, TabStopPosition, TabStopType, TableOfContents,
} = require("docx");
const fs = require("fs");

// ─── Palette ────────────────────────────────────────────────────
const P = {
  primary: "162235",
  body: "1A2B40",
  secondary: "6878A0",
  accent: "37DCF2",
  surface: "F4F8FC",
  cover: { title: "FFFFFF", subtitle: "B0B8C0", meta: "90989F", footer: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};

// ─── Font helpers ───────────────────────────────────────────────
const FONT = { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" };
const INDENT_480 = 480;   // firstLine indent
const LINE_312 = 312;     // line spacing (twips × 20 → 312 = 1.3×)

// ─── Reusable style factories ───────────────────────────────────
function bodyText(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: INDENT_480 },
    spacing: { line: LINE_312 },
    ...opts,
    children: [
      new TextRun({ text, font: FONT, size: 22, color: P.body, ...opts.run }),
    ],
  });
}

function bodyPara(runs, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: INDENT_480 },
    spacing: { line: LINE_312, after: 80 },
    ...opts,
    children: runs,
  });
}

function boldLabel(label, value) {
  return bodyPara([
    new TextRun({ text: label, font: FONT, size: 22, color: P.body, bold: true }),
    new TextRun({ text: value, font: FONT, size: 22, color: P.body }),
  ], { indent: { firstLine: INDENT_480 } });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160, line: LINE_312 },
    children: [
      new TextRun({ text, font: FONT, size: 32, bold: true, color: P.primary }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 280, after: 120, line: LINE_312 },
    children: [
      new TextRun({ text, font: FONT, size: 26, bold: true, color: P.primary }),
    ],
  });
}

function heading4(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 200, after: 80, line: LINE_312 },
    children: [
      new TextRun({ text, font: FONT, size: 23, bold: true, color: P.table.headerBg }),
    ],
  });
}

function accentLine() {
  return new Paragraph({
    spacing: { before: 40, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent } },
    children: [],
  });
}

function spacer(h = 120) {
  return new Paragraph({ spacing: { before: h }, children: [] });
}

// ─── Table helpers ──────────────────────────────────────────────
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine };
const BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function hdrCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: P.table.headerBg, type: ShadingType.CLEAR },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, font: FONT, size: 20, bold: true, color: P.table.headerText })],
    })],
  });
}

function dataCell(text, width, idx, opts = {}) {
  const bg = idx % 2 === 1 ? P.table.surface : "FFFFFF";
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({ text, font: FONT, size: 19, color: P.body, ...opts.run })],
    })],
  });
}

function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => hdrCell(h, colWidths[i])),
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) => dataCell(cell, colWidths[ci], ri)),
    })
  );
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  });
}

// Status transitions table (4 columns)
function statusTable(rows) {
  return makeTable(
    ["From Status", "Trigger", "To Status", "Responsible Role"],
    rows,
    [2200, 2600, 2200, 2000]
  );
}

// Role responsibilities table (3 columns)
function roleTable(rows) {
  return makeTable(
    ["Role", "Responsibility", "Actions"],
    rows,
    [2000, 3200, 3800]
  );
}

// ─── Numbered step helper ───────────────────────────────────────
function numberedStep(num, title, desc) {
  return bodyPara([
    new TextRun({ text: `${num}. ${title}: `, font: FONT, size: 22, color: P.body, bold: true }),
    new TextRun({ text: desc, font: FONT, size: 22, color: P.body }),
  ], { indent: { firstLine: INDENT_480 } });
}

function bulletItem(text) {
  return bodyPara([
    new TextRun({ text: `• ${text}`, font: FONT, size: 22, color: P.body }),
  ], { indent: { left: 720, firstLine: 0 } });
}

// ─── Module data ────────────────────────────────────────────────
const modules = [
  // ────── 1. Recruitment Workflow ──────
  {
    title: "1. Recruitment Workflow",
    description: "The Recruitment Workflow governs the end-to-end process of talent acquisition within NEXUS HRMS, from identifying workforce needs through to onboarding new hires. It ensures a structured, consistent, and compliant approach to hiring across all departments and locations.",
    trigger: "A department head or hiring manager submits a manpower requisition indicating a staffing need, either for a new position or a replacement hire.",
    steps: [
      ["Requisition Creation", "The hiring manager creates a requisition specifying the role, required qualifications, headcount, and target hire date. The system validates the request against department budget and existing headcount plans."],
      ["Requisition Approval", "The requisition routes through a configurable approval chain including the department head, HR business partner, and finance controller for budget clearance. Each approver can approve, reject, or request modifications with comments."],
      ["Job Posting", "Upon final approval, HR creates a job posting with the approved job description, compensation range, and qualifications. The posting is published to configured internal career portals, external job boards, and social media channels simultaneously."],
      ["Application Receipt", "Candidates submit applications through the career portal or via manual entry by recruiters. The system parses resumes using AI, extracts key data points, and creates structured candidate profiles with skills matching scores."],
      ["Screening", "The AI engine screens applications against job criteria, ranking candidates by fit score. Recruiters can apply additional filters, create shortlists, and tag candidates for further review. Unqualified candidates receive automated regret notifications."],
      ["Interview Scheduling", "For shortlisted candidates, the system proposes interview slots based on panelist availability from their calendars. It sends calendar invitations to all participants and tracks confirmation status with automated reminders."],
      ["Interview Feedback", "After each interview round, panelists receive structured feedback forms aligned with competency frameworks. The system aggregates scores, highlights consensus and disagreements, and provides AI-generated interview summaries."],
      ["Offer Creation", "The recruiter drafts the offer letter using configurable templates, populating compensation components, benefits, start date, and special conditions. The system auto-calculates CTC breakdowns based on the salary structure."],
      ["Offer Approval", "The offer goes through an approval workflow involving HR, finance for CTC validation, and the hiring manager. Budget impact analysis is generated automatically for each approval level."],
      ["Offer Sent", "The approved offer is sent to the candidate via email with a digital signature link. The system tracks offer delivery, opens, and response deadlines with escalation alerts for non-responses."],
      ["Acceptance/Rejection", "The candidate accepts or rejects the offer through a secure portal. Upon acceptance, the system records the acceptance details and triggers the onboarding workflow. Upon rejection, it logs the reason and reactivates the pipeline if needed."],
      ["Onboarding Initiation", "The system automatically creates an onboarding record and pre-boarding task list for the accepted candidate. It notifies IT, facilities, and relevant departments to prepare for the new hire's first day."],
    ],
    decisions: [
      ["Requisition Budget Check", "If the requisition exceeds department budget, it requires additional CFO approval; otherwise it follows the standard chain."],
      ["Screening Threshold", "Candidates below the configurable AI fit-score threshold are auto-rejected; those above proceed to the shortlist for recruiter review."],
      ["Offer Response Timeout", "If the candidate does not respond within the configured deadline, the system escalates to the recruiter who can extend, renegotiate, or withdraw the offer."],
    ],
    roles: [
      ["Hiring Manager", "Initiates requisition and defines role requirements", "Create requisition, Review candidates, Approve offer"],
      ["HR Recruiter", "Manages the hiring pipeline end-to-end", "Post job, Screen candidates, Schedule interviews, Draft offer"],
      ["Interview Panelist", "Evaluates candidate competencies", "Attend interview, Submit feedback, Score competencies"],
      ["HR Business Partner", "Ensures compliance and policy alignment", "Approve requisition, Review offer, Validate compensation"],
      ["Finance Controller", "Validates budget and CTC approval", "Budget approval, CTC sign-off, Offer approval"],
      ["Department Head", "Final authority on team staffing", "Approve requisition, Final candidate selection"],
    ],
    statuses: [
      ["Draft", "Submit requisition", "Pending Approval", "Hiring Manager"],
      ["Pending Approval", "Manager approves", "HR Review", "Department Head"],
      ["HR Review", "HR approves", "Budget Approval", "HR Business Partner"],
      ["Budget Approval", "Finance clears", "Approved", "Finance Controller"],
      ["Approved", "Job posted", "Open", "HR Recruiter"],
      ["Open", "Shortlist finalized", "In Progress", "HR Recruiter"],
      ["In Progress", "Interviews complete", "Offer Stage", "HR Recruiter"],
      ["Offer Stage", "Offer accepted", "Onboarding", "Candidate / System"],
      ["Offer Stage", "Offer rejected", "Pipeline Review", "HR Recruiter"],
      ["Onboarding", "Onboarding initiated", "Closed", "System"],
    ],
    notifications: [
      "Requisition submission confirmation to hiring manager",
      "Approval request emails to each approver in the chain",
      "Job posting live notification to hiring team",
      "Application receipt confirmation to candidates",
      "Interview schedule invitations to panelists and candidates",
      "Feedback submission reminders to panelists",
      "Offer approval request to designated approvers",
      "Offer letter delivery and response tracking alerts",
      "Acceptance notification to all stakeholders",
      "Onboarding task assignments to IT, Facilities, and HR",
    ],
    exceptions: [
      "If budget approval is denied, the requisition is sent back to the hiring manager with finance comments for revision or escalation.",
      "If no candidates meet the screening threshold within 30 days, the system alerts HR to consider adjusting job criteria or sourcing channels.",
      "If an interview panelist fails to submit feedback within 48 hours, the system escalates to the panel coordinator and sends a final reminder.",
      "If a candidate disputes the offer terms, the recruiter can initiate a renegotiation workflow with revised compensation requiring fresh approval.",
    ],
    integrations: "Employee Master (for org structure), Budget Management, Calendar (Outlook/Google), Job Boards (LinkedIn, Naukri), Digital Signature (DocuSign/Adobe Sign), Onboarding Module, AI Resume Parser, Communication (Email/SMS/WhatsApp).",
  },

  // ────── 2. Employee Onboarding Workflow ──────
  {
    title: "2. Employee Onboarding Workflow",
    description: "The Employee Onboarding Workflow orchestrates the transition from candidate to productive team member. It ensures every new hire has a consistent, welcoming experience while all administrative, compliance, and operational requirements are fulfilled on schedule.",
    trigger: "A candidate accepts an offer letter in the Recruitment module, or an administrator manually initiates onboarding for a lateral hire or transfer.",
    steps: [
      ["Offer Acceptance", "The system captures the signed offer letter and records acceptance details including start date and accepted terms. A unique onboarding ID is generated linking the recruitment record to the new employee profile."],
      ["Preboarding Tasks", "Automated task lists are generated for HR, IT, facilities, and the hiring manager covering equipment procurement, access provisioning, desk allocation, and welcome kit preparation. Each task has an owner and deadline before the join date."],
      ["Day 1 Check-in", "The new hire completes the check-in process including biometric registration, ID card issuance, and introductory orientation. The system logs attendance from day one and activates the employee self-service portal."],
      ["Documentation", "The employee uploads identity, education, and employment documents through the portal. The system verifies documents against the required checklist, flags missing items, and sets compliance deadlines with automated reminders."],
      ["IT Setup", "IT completes laptop/desktop provisioning, email account creation, VPN access, and software license assignment as per the role-based access matrix. All asset assignments are tracked in the Asset Management module."],
      ["Training Assignment", "Mandatory compliance, security, and role-specific training courses are auto-assigned based on the employee's department, role, and level. The LMS tracks enrollment, progress, and completion deadlines."],
      ["Probation Period", "The system sets the probation period duration per company policy and initiates periodic check-in schedules for the manager. Automated reminders are sent for probation reviews at 30, 60, and 90-day milestones."],
      ["Confirmation", "Upon successful probation review, the manager submits a confirmation recommendation. HR processes the confirmation, updating the employee status from probationary to confirmed with any applicable salary adjustments."],
    ],
    decisions: [
      ["Document Verification", "If documents are incomplete or invalid, onboarding proceeds conditionally but compliance flags are raised with escalation after the grace period."],
      ["Probation Outcome", "If the manager rates the employee below expectations, the system offers options to extend probation, initiate a PIP, or recommend separation."],
      ["IT Readiness", "If IT setup is incomplete by day 1, an emergency escalation is triggered to ensure minimum access is provisioned for the employee's first working day."],
    ],
    roles: [
      ["HR Coordinator", "Manages the onboarding process and documentation", "Generate task lists, Verify documents, Schedule orientation"],
      ["Hiring Manager", "Prepares team integration and probation review", "Assign buddy, Set initial goals, Conduct probation reviews"],
      ["IT Administrator", "Provisions technology and access", "Setup workstation, Create accounts, Assign assets"],
      ["Facilities Manager", "Prepares physical workspace", "Desk allocation, Access cards, Welcome kit"],
      ["New Employee", "Completes required documentation and training", "Upload documents, Attend orientation, Complete training"],
      ["HR Business Partner", "Oversees probation and confirmation", "Review probation outcome, Process confirmation"],
    ],
    statuses: [
      ["Preboarding", "Join date arrives", "Day 1 Active", "System"],
      ["Day 1 Active", "Check-in completed", "Onboarding In Progress", "HR Coordinator"],
      ["Onboarding In Progress", "All documents verified", "Documentation Complete", "HR Coordinator"],
      ["Documentation Complete", "IT setup done", "Fully Onboarded", "IT Administrator"],
      ["Fully Onboarded", "Probation period starts", "Probation", "System"],
      ["Probation", "Manager confirms", "Confirmed", "Hiring Manager"],
      ["Probation", "Manager extends", "Probation Extended", "Hiring Manager"],
      ["Probation", "Separation initiated", "Exit Process", "HR Business Partner"],
    ],
    notifications: [
      "Preboarding task assignment notifications to all stakeholders",
      "Welcome email with first-day instructions to the new hire",
      "Document upload reminders with compliance deadlines",
      "IT provisioning status updates to the hiring manager",
      "Training enrollment and completion reminders",
      "Probation review reminders at 30/60/90-day intervals",
      "Confirmation or extension notification to the employee",
    ],
    exceptions: [
      "If the new hire fails to report on the scheduled date, the system triggers a no-show alert and initiates a 3-day grace period before cancellation.",
      "If mandatory compliance documents are not submitted within 15 days, an escalation is sent to HR and the hiring manager with a hold on access renewal.",
      "If IT provisioning is delayed beyond the join date, an emergency ticket is auto-created with high priority and SLA tracking.",
    ],
    integrations: "Recruitment Module, Employee Master, Asset Management, IT Service Desk, Learning Management System (LMS), Attendance & Leave, Payroll (for probation salary), Document Management, Communication (Email/Slack).",
  },

  // ────── 3. Leave Management Workflow ──────
  {
    title: "3. Leave Management Workflow",
    description: "The Leave Management Workflow handles employee time-off requests from submission through approval, balance adjustment, and calendar synchronization. It ensures policy compliance while providing managers visibility into team availability.",
    trigger: "An employee submits a leave request through the self-service portal or mobile app, specifying leave type, duration, and reason.",
    steps: [
      ["Leave Request", "The employee selects the leave type (casual, sick, earned, comp-off, etc.), specifies start and end dates, and provides a reason. Half-day and partial-day options are supported, and supporting documents can be attached for medical leave."],
      ["Balance Check", "The system validates the request against the employee's available leave balance, accrued leaves, and carry-forward limits. It calculates the number of working days excluding weekends and holidays per the location calendar."],
      ["Manager Approval", "The request is routed to the reporting manager for approval with team availability context showing overlapping leaves. The manager can approve, reject, or suggest alternative dates with comments."],
      ["Auto-Update Balance", "Upon approval, the system deducts the leave days from the appropriate balance bucket and updates the leave ledger. For partial approvals, only the approved days are deducted with the remaining request cancelled."],
      ["Notification", "The employee receives an approval or rejection notification with updated balance information. In case of rejection, the reason and alternative dates suggested by the manager are included."],
      ["Calendar Update", "The approved leave is reflected in the team calendar, shared availability views, and attendance system. Integration with Outlook/Google Calendar pushes the event to the employee's and manager's calendars automatically."],
    ],
    decisions: [
      ["Insufficient Balance", "If the requested days exceed available balance, the system offers options to take LOP (Loss of Pay), split across leave types, or reduce duration."],
      ["Team Overlap", "If multiple team members request the same dates exceeding the configurable team availability threshold, the system flags a conflict for the manager's attention."],
      ["Probation Restriction", "If the employee is on probation, certain leave types may be restricted per policy, triggering a conditional approval path requiring HR override."],
    ],
    roles: [
      ["Employee", "Initiates leave requests and tracks balance", "Submit request, Upload documents, Cancel/Modify request"],
      ["Reporting Manager", "Approves or rejects team leave requests", "Review team calendar, Approve/Reject, Suggest alternatives"],
      ["HR Administrator", "Manages leave policies and exceptions", "Configure policies, Override restrictions, Process encashment"],
      ["System", "Validates and auto-processes leave logic", "Balance check, Calendar sync, Auto-update ledger"],
    ],
    statuses: [
      ["Draft", "Submit request", "Pending Approval", "Employee"],
      ["Pending Approval", "Manager approves", "Approved", "Reporting Manager"],
      ["Pending Approval", "Manager rejects", "Rejected", "Reporting Manager"],
      ["Approved", "Employee cancels", "Cancelled", "Employee"],
      ["Approved", "Leave period ends", "Consumed", "System"],
      ["Pending Approval", "Balance insufficient (auto)", "Pending HR Review", "System"],
    ],
    notifications: [
      "Leave request submission confirmation to employee",
      "Approval/rejection notification to employee with balance summary",
      "Team leave conflict alert to manager",
      "Leave start reminder to employee and manager",
      "Return-to-work reminder after leave end date",
      "Monthly leave balance summary to employees",
    ],
    exceptions: [
      "If a sick leave exceeds 3 consecutive days without medical documentation, the system flags it for HR review and sends a document upload reminder.",
      "If a manager does not act on a leave request within 48 hours, the system escalates to the skip-level manager or auto-approves based on policy configuration.",
      "If a leave cancellation occurs after approval within 24 hours of the start date, it requires manager confirmation to prevent calendar disruption.",
    ],
    integrations: "Attendance & Time Tracking, Holiday Calendar, Team Availability Dashboard, Payroll (LOP calculations), Outlook/Google Calendar, Employee Self-Service Portal, Mobile App.",
  },

  // ────── 4. Payroll Processing Workflow ──────
  {
    title: "4. Payroll Processing Workflow",
    description: "The Payroll Processing Workflow manages the complete salary computation cycle from pay period selection through disbursement and payslip generation. It ensures statutory compliance, accuracy, and auditability of all compensation transactions.",
    trigger: "The payroll administrator initiates the monthly payroll cycle by selecting the pay period, or the system auto-triggers on the configured payroll run date.",
    steps: [
      ["Pay Period Selection", "The payroll admin selects the pay period (monthly/bi-monthly) and payroll run date. The system locks the attendance window and prevents retroactive modifications for the selected period."],
      ["Attendance Calculation", "The system aggregates attendance data including present days, absences, late arrivals, overtime, and leave consumption. It cross-references with the biometric system, timesheets, and approved leave records to compute payable days."],
      ["Salary Component Calculation", "Each employee's gross salary is computed based on their salary structure: basic pay, HRA, transport allowance, special allowance, and any ad-hoc payments. Variable components like performance bonuses and incentives are included based on approved data."],
      ["Statutory Deductions", "The system calculates all mandatory deductions including PF, ESI, Professional Tax, TDS, and Labour Welfare Fund as per applicable statutes. It applies the correct slabs based on employee location, salary level, and tax regime selection."],
      ["Net Salary", "Net salary is computed by deducting statutory deductions, voluntary deductions (loan EMIs, insurance), and any recoveries from the gross salary. The system validates that net pay is non-negative and flags any anomalies."],
      ["Approval", "The payroll summary with department-wise cost breakdowns, variance analysis, and exception reports is sent to the finance manager and HR head for approval. Approvers can review individual records and flag discrepancies."],
      ["Payment", "Upon approval, the system generates bank payment files in the required format (NEFT/RTGS) and triggers the fund transfer. Payment confirmations are reconciled against bank statements automatically."],
      ["Payslip Generation", "Individual payslips are generated with detailed earnings, deductions, and year-to-date summaries. Payslips are published to the employee portal and sent via email with password-protected PDFs."],
    ],
    decisions: [
      ["Anomaly Detection", "If an employee's net pay varies by more than the configured threshold (default 25%) from the previous month, the record is flagged for manual review before processing."],
      ["New Joiner/Leaver", "Pro-rata salary calculations are applied for employees who joined or left during the pay period, with special handling for FNF settlements."],
      ["Statutory Compliance Failure", "If any statutory component calculation fails due to missing configuration, the entire payroll run is held with a specific error notification to the admin."],
    ],
    roles: [
      ["Payroll Administrator", "Initiates and manages the payroll cycle", "Select pay period, Review exceptions, Generate reports"],
      ["Finance Manager", "Approves payroll disbursement", "Review summary, Approve payment, Authorize bank file"],
      ["HR Head", "Validates compensation accuracy", "Review salary data, Approve variable pay, Sign off on payroll"],
      ["System", "Auto-computes all salary and deduction components", "Calculate components, Generate bank files, Create payslips"],
      ["Employee", "Views and acknowledges payslip", "Download payslip, Raise queries, Submit tax declarations"],
    ],
    statuses: [
      ["Initiated", "Attendance finalized", "Attendance Processed", "Payroll Administrator"],
      ["Attendance Processed", "Salary computed", "Salary Computed", "System"],
      ["Salary Computed", "Deductions applied", "Deductions Applied", "System"],
      ["Deductions Applied", "Net pay verified", "Ready for Approval", "System"],
      ["Ready for Approval", "Finance approves", "Approved", "Finance Manager"],
      ["Approved", "Payment initiated", "Payment Processing", "Payroll Administrator"],
      ["Payment Processing", "Bank confirms", "Paid", "Bank / System"],
      ["Paid", "Payslips generated", "Completed", "System"],
    ],
    notifications: [
      "Payroll run initiation alert to all stakeholders",
      "Anomaly flag notifications to payroll admin and finance",
      "Approval request with summary dashboard to approvers",
      "Payment processing confirmation to finance",
      "Payslip availability notification to employees",
      "Statutory filing reminder to compliance team",
    ],
    exceptions: [
      "If attendance data is incomplete for any employee, the system generates an exception report and holds that individual's processing while completing the rest.",
      "If bank payment fails for any account, the system marks the record as 'Payment Failed' and triggers a retry workflow with admin notification.",
      "If a retroactive salary change is detected after payroll lock, a supplementary payroll run is scheduled with delta calculations.",
    ],
    integrations: "Attendance & Biometric, Leave Management, Employee Master, Tax Declaration Module, Bank Integration (NEFT/RTGS), Statutory Filing (PF/ESI/TDS), Accounting (ERP), Loan Management, Reimbursement Module.",
  },

  // ────── 5. Performance Review Workflow ──────
  {
    title: "5. Performance Review Workflow",
    description: "The Performance Review Workflow orchestrates the end-to-end appraisal cycle from goal setting to final rating and development planning. It supports multi-rater feedback, calibration, and data-driven talent decisions.",
    trigger: "HR creates a performance review cycle with defined timelines, applicable employee groups, and configured review stages.",
    steps: [
      ["Cycle Creation", "HR configures the review cycle specifying the review period, rating scale, competency framework, applicable business units, and milestone dates. The system generates personalized task lists for all participants based on their role in the process."],
      ["Self Assessment", "Employees complete self-evaluation against assigned goals and competencies, providing ratings, achievements, and development areas. The system saves draft progress and sends reminders as deadlines approach."],
      ["Manager Review", "Reporting managers assess their team members based on self-assessments, observed performance, and objective data (KPIs, project outcomes). They provide ratings and written feedback for each competency and overall performance."],
      ["360 Feedback", "Multi-rater feedback is collected from peers, subordinates, and cross-functional collaborators selected by the system and the manager. Responses are anonymized and aggregated to provide a holistic view of the employee's performance."],
      ["Calibration", "Department heads and HR conduct calibration sessions to normalize ratings across teams, ensuring consistency and fairness. The system provides statistical tools showing rating distributions, forced ranking options, and outlier identification."],
      ["Final Rating", "After calibration, final ratings are locked and communicated to employees. The system maps ratings to bell-curve distributions where configured and generates department and organization-wide analytics."],
      ["Development Plan", "Based on final ratings and feedback, individual development plans (IDPs) are created with specific learning recommendations, stretch assignments, and mentoring connections. Goals for the next review cycle are seeded from the development plan."],
    ],
    decisions: [
      ["Rating Dispute", "If an employee disputes their rating, a formal review process is triggered involving skip-level manager and HR for resolution."],
      ["Calibration Adjustment", "If calibration significantly changes an individual's rating, the change requires documented justification and HR sign-off before being finalized."],
      ["Non-Completion", "If any participant fails to complete their assessment by the deadline, the system applies configurable defaults or escalates to HR for manual intervention."],
    ],
    roles: [
      ["HR Administrator", "Configures and monitors the review cycle", "Create cycle, Set parameters, Monitor completion, Facilitate calibration"],
      ["Employee", "Completes self-assessment and receives feedback", "Self-evaluate, Review feedback, Accept development plan"],
      ["Reporting Manager", "Evaluates team members and provides feedback", "Rate competencies, Write feedback, Recommend development"],
      ["Skip-Level Manager", "Ensures fairness and resolves disputes", "Review calibration, Approve disputed ratings, Validate consistency"],
      ["360 Reviewer", "Provides anonymized peer/subordinate feedback", "Complete feedback form, Rate competencies"],
    ],
    statuses: [
      ["Cycle Created", "Cycle published", "Self Assessment Open", "HR Administrator"],
      ["Self Assessment Open", "Employee completes", "Manager Review", "Employee"],
      ["Manager Review", "Manager completes", "360 Feedback", "Reporting Manager"],
      ["360 Feedback", "All feedback collected", "Calibration", "System"],
      ["Calibration", "Calibration finalized", "Final Rating", "Skip-Level Manager / HR"],
      ["Final Rating", "Rating communicated", "Development Plan", "HR Administrator"],
      ["Development Plan", "Plan acknowledged", "Cycle Closed", "Employee"],
    ],
    notifications: [
      "Cycle launch notification with timeline to all participants",
      "Self-assessment deadline reminders (7-day, 3-day, 1-day)",
      "Manager review assignment with team assessment summaries",
      "360 feedback requests with anonymity assurance",
      "Calibration session scheduling invites",
      "Final rating disclosure to employees",
      "Development plan action items to employees and managers",
    ],
    exceptions: [
      "If an employee is on extended leave during the review period, they are excluded with HR approval and the review is deferred to the next cycle.",
      "If 360 feedback response rate is below 60%, the system extends the deadline and sends escalation reminders to non-responders.",
      "If calibration results in a department-wide rating curve violation, the system alerts the HR head for policy review before finalization.",
    ],
    integrations: "Goal Setting Module, Competency Framework, Learning Management System, Talent Succession, Compensation Planning (for increment cycles), Analytics & Reporting, Employee Master.",
  },

  // ────── 6. Separation Workflow ──────
  {
    title: "6. Separation Workflow",
    description: "The Separation Workflow manages the employee exit process from resignation through final settlement, ensuring compliance, knowledge transfer, and a smooth transition for both the departing employee and the organization.",
    trigger: "An employee submits a resignation letter, or HR initiates separation for termination, retirement, or end of contract.",
    steps: [
      ["Resignation Submission", "The employee submits a formal resignation through the portal specifying the last working date and reason. The system validates the notice period requirement based on employment terms and calculates the expected last date."],
      ["Manager Review", "The reporting manager reviews the resignation and can accept, request a retention discussion, or propose an early release. The system presents retention risk assessment based on the employee's performance and criticality."],
      ["Notice Period", "The employee serves the notice period as per policy, with options for early release or buy-out. The system tracks notice period compliance, ensures knowledge transfer tasks are assigned and completed, and monitors attendance."],
      ["Clearance (IT, Finance, HR, Admin)", "A multi-department clearance process is initiated with task checklists for each department. IT processes asset returns and access revocation, Finance clears dues and loans, HR processes document returns, and Admin handles physical access and ID cards."],
      ["Exit Interview", "HR or an external agency conducts a structured exit interview capturing the employee's experience, feedback, and reasons for leaving. The system records responses for trend analysis and attrition insights."],
      ["FNF Calculation", "The Full and Final settlement is computed including pending salary, leave encashment, gratuity, bonus proration, notice period adjustments, and recoveries (loans, advances, asset damage). The system generates a detailed FNF statement for employee review."],
      ["Final Settlement", "After FNF approval, the settlement amount is processed through payroll or a separate bank transfer. The system archives the employee record, deactivates accounts, and generates all statutory forms (Form 16, PF transfer)."],
    ],
    decisions: [
      ["Retention Counter-Offer", "If the manager decides to retain, a counter-offer workflow is triggered requiring HR and finance approval before negotiation with the employee."],
      ["Notice Period Waiver", "If early release is approved, the system calculates buy-out costs and adjusts FNF accordingly, requiring both manager and HR authorization."],
      ["Clearance Hold", "If any department flags a clearance issue (e.g., unreturned assets, pending dues), FNF processing is held until the issue is resolved or a waiver is obtained."],
    ],
    roles: [
      ["Employee", "Initiates resignation and completes exit formalities", "Submit resignation, Complete KT, Return assets, Attend exit interview"],
      ["Reporting Manager", "Reviews and manages the separation", "Accept/counter resignation, Assign KT, Approve early release"],
      ["HR Coordinator", "Orchestrates the exit process", "Initiate clearance, Schedule exit interview, Process FNF"],
      ["IT Administrator", "Handles technology clearance", "Revoke access, Collect assets, Wipe devices"],
      ["Finance Team", "Manages financial settlement", "Clear dues, Calculate FNF, Process payment"],
      ["Admin/Facilities", "Handles physical clearance", "Collect ID/access cards, Desk clearance, Vehicle return"],
    ],
    statuses: [
      ["Resignation Submitted", "Manager accepts", "Notice Period", "Reporting Manager"],
      ["Resignation Submitted", "Manager counters", "Retention Discussion", "Reporting Manager / HR"],
      ["Notice Period", "Clearance initiated", "Clearance In Progress", "HR Coordinator"],
      ["Clearance In Progress", "All departments clear", "Clearance Complete", "All Departments"],
      ["Clearance Complete", "Exit interview done", "FNF Processing", "HR Coordinator"],
      ["FNF Processing", "FNF approved", "Settlement Pending", "Finance Team"],
      ["Settlement Pending", "Payment processed", "Separated", "Finance Team / System"],
    ],
    notifications: [
      "Resignation submission confirmation to employee and manager",
      "Clearance task assignments to all departments",
      "Notice period milestone reminders to employee and manager",
      "Clearance completion status updates to HR",
      "Exit interview scheduling notification to employee",
      "FNF statement review request to employee",
      "Final settlement confirmation with payment details",
      "Account deactivation notice to employee",
    ],
    exceptions: [
      "If the employee absconds during notice period, the system marks the record as 'Absconding', initiates legal hold on FNF, and triggers the absconding resolution workflow.",
      "If clearance cannot be completed due to disputed asset returns, an arbitration process is initiated with HR as mediator and FNF is held until resolution.",
      "If an employee withdraws resignation during notice period (per policy), the system reverses all initiated processes and restores the employee to active status.",
    ],
    integrations: "Recruitment (backfill triggering), Asset Management, IT Service Desk, Payroll (FNF processing), Leave Management (encashment), Attendance (notice tracking), Document Management, Legal/Compliance, Bank Integration.",
  },

  // ────── 7. Expense Claim Workflow ──────
  {
    title: "7. Expense Claim Workflow",
    description: "The Expense Claim Workflow streamlines the submission, approval, and reimbursement of business expenses. It enforces policy compliance through automated checks and ensures timely reimbursement with full audit trails.",
    trigger: "An employee submits an expense claim for reimbursement through the portal or mobile app, categorized by expense type.",
    steps: [
      ["Submission", "The employee creates an expense claim selecting the expense category (travel, meals, accommodation, miscellaneous), entering amounts, dates, project codes, and cost centers. The system validates entries against expense policy limits and flags violations."],
      ["Receipt Upload", "Supporting receipts and invoices are uploaded as attachments with the claim. The AI engine performs OCR-based receipt validation, matching amounts, dates, and merchant details to claim entries. Missing or invalid receipts trigger auto-flags."],
      ["Manager Approval", "The claim is routed to the reporting manager for approval with a summary showing category-wise totals, policy compliance status, and historical spending. The manager can approve, partially approve, or reject with comments."],
      ["Finance Review", "Approved claims undergo finance team review for policy adherence, budget allocation, and tax treatment (GST, TDS). Finance can query the employee for clarification, adjust amounts, or flag for audit review."],
      ["Payment Processing", "Once finance clears the claim, the reimbursement amount is scheduled for payment through the next payroll cycle or a separate bank transfer. The system generates payment references and updates the claim status with expected payment date."],
    ],
    decisions: [
      ["Policy Violation", "If a claim exceeds category limits or lacks required receipts, the system auto-flags it for manager and finance review with violation details."],
      ["Partial Approval", "If the manager or finance approves only part of the claim, the rejected portion is communicated to the employee with reasons and the approved amount proceeds."],
      ["Audit Flag", "If the system detects patterns of unusual claims or duplicate receipts, the claim is flagged for internal audit review before processing."],
    ],
    roles: [
      ["Employee", "Submits and tracks expense claims", "Create claim, Upload receipts, Respond to queries"],
      ["Reporting Manager", "Approves team expense claims", "Review policy compliance, Approve/Reject, Forward to finance"],
      ["Finance Reviewer", "Validates and processes payments", "Verify policy adherence, Process payment, Handle tax treatment"],
      ["Internal Auditor", "Reviews flagged claims", "Investigate anomalies, Approve/Reject flagged claims"],
    ],
    statuses: [
      ["Draft", "Submit claim", "Pending Manager Approval", "Employee"],
      ["Pending Manager Approval", "Manager approves", "Pending Finance Review", "Reporting Manager"],
      ["Pending Manager Approval", "Manager rejects", "Rejected", "Reporting Manager"],
      ["Pending Finance Review", "Finance approves", "Approved for Payment", "Finance Reviewer"],
      ["Pending Finance Review", "Finance queries", "Query Pending", "Finance Reviewer"],
      ["Approved for Payment", "Payment processed", "Reimbursed", "System / Finance"],
      ["Pending Manager Approval", "Audit flag triggered", "Under Audit", "System"],
    ],
    notifications: [
      "Claim submission confirmation to employee",
      "Approval request to reporting manager with policy summary",
      "Finance review assignment with compliance report",
      "Query notification to employee for clarification needed",
      "Payment processing confirmation with expected date",
      "Monthly expense summary to managers",
    ],
    exceptions: [
      "If a receipt fails AI validation but is a legitimate expense, the employee can request manual review by uploading additional justification.",
      "If the finance team does not process a claim within 5 business days of approval, an escalation is triggered to the finance head.",
      "If an expense claim is submitted beyond the policy-defined submission window (typically 30 days), it requires special HR approval.",
    ],
    integrations: "Project Management (project code validation), Accounting/ERP (GL posting), Payroll (reimbursement processing), Travel Management, Tax Module (GST/TDS), AI OCR Engine, Mobile App.",
  },

  // ────── 8. Helpdesk Ticket Workflow ──────
  {
    title: "8. Helpdesk Ticket Workflow",
    description: "The Helpdesk Ticket Workflow manages internal service requests and issue resolution across HR, IT, Admin, and Facilities. It ensures SLA compliance, efficient routing, and continuous service improvement through feedback loops.",
    trigger: "An employee creates a helpdesk ticket through the portal, email, or chatbot, selecting a category and describing the issue.",
    steps: [
      ["Ticket Creation", "The employee submits a ticket with category (IT, HR, Admin, Facilities), priority, description, and attachments. The AI engine analyzes the request, suggests knowledge base articles for self-resolution, and auto-classifies the sub-category."],
      ["Auto-Assignment", "Based on category, sub-category, and priority, the system assigns the ticket to the appropriate support team or individual using skill-based routing rules. Load balancing ensures equitable distribution across team members."],
      ["SLA Tracking", "The system activates SLA timers based on the priority and category, defining response and resolution deadlines. Real-time dashboards show SLA compliance, and escalation triggers fire at configurable thresholds (50%, 75%, 90% of SLA time)."],
      ["Resolution", "The assigned agent works on the ticket, updating status and adding notes. They can request additional information from the employee, escalate to a higher tier, or resolve with a solution. All interactions are logged in the ticket timeline."],
      ["Closure", "After providing a resolution, the agent marks the ticket as resolved. The employee has a configurable window (typically 48 hours) to confirm the resolution or reopen the ticket if the issue persists."],
      ["Feedback", "Upon closure, the system sends a satisfaction survey to the employee rating the support experience. Aggregate feedback data feeds into service quality reports and agent performance dashboards."],
    ],
    decisions: [
      ["Priority Escalation", "If SLA response time is breached, the ticket is automatically escalated to the next support tier and the team lead is notified."],
      ["Reopen Decision", "If the employee reopens the ticket within the confirmation window, it is reassigned with elevated priority and the original agent receives the case for follow-up."],
      ["Auto-Resolution", "If the AI engine identifies the issue as a known problem with an existing solution, it can auto-suggest the fix and mark the ticket as 'Suggested Resolution' pending employee confirmation."],
    ],
    roles: [
      ["Employee", "Creates and tracks service requests", "Submit ticket, Provide information, Confirm resolution, Rate experience"],
      ["L1 Support Agent", "Handles first-line support and triage", "Acknowledge ticket, Attempt resolution, Escalate if needed"],
      ["L2/L3 Specialist", "Resolves complex or escalated issues", "Diagnose root cause, Implement solution, Document resolution"],
      ["Service Desk Manager", "Monitors SLA and team performance", "Review escalations, Reassign tickets, Generate reports"],
      ["System", "Automates routing, SLA tracking, and escalation", "Auto-assign, Track SLA, Trigger escalations, Send surveys"],
    ],
    statuses: [
      ["Open", "Agent assigned", "In Progress", "System"],
      ["In Progress", "More info needed", "Awaiting Information", "L1/L2 Agent"],
      ["Awaiting Information", "Info provided", "In Progress", "Employee"],
      ["In Progress", "Solution provided", "Resolved", "L1/L2/L3 Agent"],
      ["Resolved", "Employee confirms", "Closed", "Employee"],
      ["Resolved", "Employee reopens", "Reopened", "Employee"],
      ["In Progress", "SLA breached", "Escalated", "System"],
    ],
    notifications: [
      "Ticket creation confirmation with tracking ID to employee",
      "Assignment notification to support agent",
      "SLA warning at 50%, 75%, and 90% thresholds to agent and manager",
      "Status update notifications to employee at each transition",
      "Resolution confirmation request to employee",
      "Feedback survey upon closure",
      "Weekly service desk summary to management",
    ],
    exceptions: [
      "If no agent is available for assignment (all at capacity), the system creates a queue overflow alert and assigns to the team lead for manual redistribution.",
      "If a critical ticket (P1) breaches SLA, an emergency escalation is sent to the department head and IT/HR leadership for immediate intervention.",
      "If an employee repeatedly reopens the same ticket (3+ times), it is automatically flagged for root cause analysis and process improvement review.",
    ],
    integrations: "Knowledge Base, Asset Management, Employee Master, Email/Chat Integration, AI Classification Engine, Analytics Dashboard, Calendar (scheduling), Communication (Slack/Teams).",
  },

  // ────── 9. Offer Management Workflow ──────
  {
    title: "9. Offer Management Workflow",
    description: "The Offer Management Workflow handles the creation, approval, delivery, and tracking of employment offers to candidates. It integrates closely with recruitment and onboarding to ensure a seamless candidate-to-employee transition.",
    trigger: "A candidate is selected through the recruitment pipeline and the recruiter initiates offer creation, or a lateral hire offer is manually created by HR.",
    steps: [
      ["Draft", "The recruiter creates an offer draft using the approved template, entering compensation details, designation, location, reporting manager, and start date. The system pre-populates fields from the candidate's application and requisition data."],
      ["Approval Chain", "The draft offer routes through a multi-level approval chain: hiring manager validates role fit, HR verifies compensation alignment with internal equity, and finance approves budget impact. Each approver sees the full compensation breakdown and comparison data."],
      ["Generation", "Upon final approval, the system generates a formal offer letter as a PDF with company branding, legal clauses, and digital signature placeholders. The letter includes annexures for compensation structure, benefits summary, and policy acknowledgments."],
      ["Sending", "The offer letter is sent to the candidate via email with a secure link to review and sign electronically. The system tracks email delivery, open status, and provides the recruiter with real-time visibility into candidate engagement."],
      ["Candidate Response", "The candidate reviews the offer and can accept, decline, or request negotiation. The portal provides a digital signature capability for acceptance and a structured form for decline reasons or negotiation points."],
      ["Onboarding Trigger", "Upon candidate acceptance, the system automatically triggers the onboarding workflow, creates the pre-boarding checklist, notifies all stakeholders, and converts the candidate record to a pending-employee record in the system."],
    ],
    decisions: [
      ["Compensation Out of Band", "If the offered compensation falls outside the approved salary band for the role, additional HR head approval is required before the offer can proceed."],
      ["Candidate Negotiation", "If the candidate requests negotiation, a revised offer workflow is initiated requiring the same approval chain for any changes to compensation or terms."],
      ["Offer Expiry", "If the candidate does not respond within the validity period, the offer expires and the recruiter can choose to extend, revise, or close the candidate pipeline."],
    ],
    roles: [
      ["Recruiter", "Creates and manages the offer process", "Draft offer, Track response, Initiate revisions"],
      ["Hiring Manager", "Validates role fit and approves terms", "Review offer details, Approve, Request changes"],
      ["HR Business Partner", "Ensures compensation equity and policy compliance", "Verify salary band, Approve compensation, Validate terms"],
      ["Finance Controller", "Approves budget impact of the offer", "Review CTC, Approve budget, Sign off on special terms"],
      ["Candidate", "Reviews and responds to the offer", "Review offer, Accept/Decline/Negotiate, Sign digitally"],
    ],
    statuses: [
      ["Draft", "Submit for approval", "Pending Approval", "Recruiter"],
      ["Pending Approval", "All approvers approve", "Approved", "Approval Chain"],
      ["Pending Approval", "Any approver rejects", "Rejected", "Approver"],
      ["Approved", "Offer generated and sent", "Sent", "System"],
      ["Sent", "Candidate accepts", "Accepted", "Candidate"],
      ["Sent", "Candidate declines", "Declined", "Candidate"],
      ["Sent", "Candidate negotiates", "Negotiation", "Candidate"],
      ["Sent", "Validity expires", "Expired", "System"],
      ["Accepted", "Onboarding triggered", "Onboarding Initiated", "System"],
    ],
    notifications: [
      "Offer draft completion confirmation to recruiter",
      "Sequential approval requests to each approver",
      "Offer sent notification to recruiter and hiring manager",
      "Offer delivery and open tracking alerts to recruiter",
      "Candidate response notification to all stakeholders",
      "Onboarding initiation alert to HR, IT, and Facilities",
      "Offer expiry warning (3 days before) to recruiter",
    ],
    exceptions: [
      "If an approver is unavailable (leave/departed), the system redirects to the configured backup approver after 24 hours to prevent pipeline delays.",
      "If the candidate disputes offer terms after acceptance, a formal review process is initiated involving HR and legal before any modifications.",
      "If the digital signature platform is unavailable, the system allows manual offer processing with scanned signature acceptance as a temporary override.",
    ],
    integrations: "Recruitment Module, Compensation Management, Digital Signature (DocuSign/Adobe Sign), Onboarding Module, Email/Communication, Employee Master, Budget Management, Legal/Compliance.",
  },

  // ────── 10. AI Interview Workflow ──────
  {
    title: "10. AI Interview Workflow",
    description: "The AI Interview Workflow leverages artificial intelligence to conduct, score, and generate feedback for candidate interviews. It provides consistent, bias-aware evaluation while reducing the manual burden on interview panelists.",
    trigger: "A recruiter or hiring manager schedules an AI interview for a shortlisted candidate, selecting the competency framework and interview type.",
    steps: [
      ["Session Creation", "The recruiter creates an AI interview session by selecting the candidate, job role, competency framework, difficulty level, and interview format (text, voice, or video). The system configures the interview engine with role-specific parameters and generates a unique session link."],
      ["Question Generation", "The AI engine generates a dynamic question set based on the job requirements, competency framework, and candidate's resume data. Questions are calibrated for difficulty and mapped to specific competencies, with follow-up question trees prepared for multi-turn conversations."],
      ["Multi-turn Conversation", "The AI conducts a structured interview with the candidate through multiple turns, adapting follow-up questions based on previous responses. It probes deeper on weak areas and explores demonstrated strengths, maintaining natural conversational flow while ensuring comprehensive coverage."],
      ["Scoring", "Upon session completion, the AI evaluates each response against the competency framework using NLP and behavioral analysis. It generates scores for each competency, overall interview score, and comparative analysis against the role benchmark."],
      ["Feedback Report", "A detailed feedback report is generated with competency-wise scores, response analysis, strengths, improvement areas, and hiring recommendation. The report includes sentiment analysis, communication quality assessment, and technical accuracy evaluation."],
      ["Integration with Recruitment", "The AI interview results are automatically integrated into the candidate's recruitment pipeline record. Scores and feedback are visible to the hiring team alongside traditional interview feedback, providing a comprehensive view for decision-making."],
    ],
    decisions: [
      ["Score Threshold", "If the AI interview score falls below the configurable threshold for the role level, the system recommends rejection but allows the recruiter to override with justification."],
      ["Technical Failure", "If the AI session encounters a technical error mid-interview, the system saves the progress and offers options to resume or restart from the failure point."],
      ["Bias Detection", "If the AI engine detects potential bias in question patterns or scoring anomalies, it flags the session for human review before results are finalized."],
    ],
    roles: [
      ["Recruiter", "Configures and monitors AI interview sessions", "Create session, Set parameters, Review results, Override recommendations"],
      ["Hiring Manager", "Reviews AI interview outcomes for hiring decisions", "Review feedback report, Compare with manual interviews, Make hiring decision"],
      ["AI System", "Conducts and evaluates the interview autonomously", "Generate questions, Conduct conversation, Score responses, Generate report"],
      ["Candidate", "Participates in the AI interview session", "Join session, Respond to questions, Complete interview"],
      ["HR Reviewer", "Validates AI fairness and compliance", "Audit bias flags, Review flagged sessions, Ensure ethical AI use"],
    ],
    statuses: [
      ["Scheduled", "Candidate joins", "In Progress", "Candidate / System"],
      ["In Progress", "Interview completes", "Scoring", "AI System"],
      ["Scoring", "Scoring complete", "Report Generated", "AI System"],
      ["Report Generated", "Recruiter reviews", "Under Review", "Recruiter"],
      ["Under Review", "Decision made", "Completed", "Hiring Manager / Recruiter"],
      ["In Progress", "Technical failure", "Interrupted", "System"],
      ["Report Generated", "Bias flag raised", "Flagged for Review", "AI System"],
    ],
    notifications: [
      "Interview session creation confirmation with link to recruiter and candidate",
      "Session start reminder 30 minutes before scheduled time",
      "Real-time session monitoring alerts for technical issues",
      "Scoring completion notification to recruiter and hiring manager",
      "Flagged session alert to HR reviewer for bias investigation",
      "Final results integration confirmation to recruitment pipeline",
    ],
    exceptions: [
      "If the candidate experiences connectivity issues, the system allows a one-time reschedule without affecting the interview quality assessment.",
      "If the AI engine produces inconsistent scoring across similar responses, the session is flagged for manual review and the scoring model is reported for recalibration.",
      "If a bias flag is confirmed, the interview results are quarantined, the candidate is offered a manual interview alternative, and the AI model undergoes immediate audit.",
    ],
    integrations: "Recruitment Module, Competency Framework, AI/ML Engine, Resume Parser, Video/Audio Processing, Analytics Dashboard, Candidate Portal, Communication (Email/SMS).",
  },

  // ────── 11. Requisition Approval Workflow ──────
  {
    title: "11. Requisition Approval Workflow",
    description: "The Requisition Approval Workflow governs the approval of manpower requisitions before job postings are created. It ensures budgetary control, workforce planning alignment, and proper authorization before recruitment begins.",
    trigger: "A hiring manager submits a drafted manpower requisition for approval, specifying the role, headcount, and justification.",
    steps: [
      ["Draft", "The hiring manager creates a requisition draft with role details, required qualifications, headcount, business justification, target compensation range, and expected hire date. The draft can be saved and modified before submission."],
      ["Manager Submit", "The hiring manager submits the completed requisition, which triggers the approval workflow. The system validates that all mandatory fields are completed and attaches supporting data including department budget status and headcount metrics."],
      ["HR Review", "HR reviews the requisition for workforce planning alignment, compensation benchmarking, and policy compliance. HR can approve, return for modifications, or escalate with recommendations for alternative staffing solutions."],
      ["Budget Approval", "Finance reviews the budget impact of the new hire, checking against departmental allocations and overall organizational budget. They approve, request cost optimization, or deny with financial justification."],
      ["Posting Creation", "Upon all approvals, the system auto-generates a job posting template pre-filled with approved requisition data. The recruiter can customize the posting content before publishing to configured channels."],
    ],
    decisions: [
      ["Budget Overrun", "If the requisition exceeds the department's approved hiring budget, it requires CFO-level approval in addition to the standard chain."],
      ["Headcount Cap", "If the department headcount has reached the approved plan limit, the requisition requires CEO/COO approval as a headcount exception."],
      ["Alternative Suggestion", "If HR identifies a better staffing alternative (internal transfer, contractor, role redesign), the requisition is returned with a recommendation for the hiring manager's consideration."],
    ],
    roles: [
      ["Hiring Manager", "Initiates and justifies the staffing need", "Create draft, Submit requisition, Respond to queries, Approve final terms"],
      ["HR Business Partner", "Validates workforce planning alignment", "Review requisition, Benchmark compensation, Suggest alternatives"],
      ["Finance Controller", "Validates budget availability and impact", "Review budget impact, Approve/Deny cost, Suggest optimization"],
      ["CFO", "Approves budget exceptions and overruns", "Review exception requests, Approve/Deny elevated requisitions"],
      ["Recruiter", "Creates the job posting post-approval", "Customize posting, Publish to channels, Track responses"],
    ],
    statuses: [
      ["Draft", "Manager submits", "Pending HR Review", "Hiring Manager"],
      ["Pending HR Review", "HR approves", "Pending Budget Approval", "HR Business Partner"],
      ["Pending HR Review", "HR returns", "Returned for Revision", "HR Business Partner"],
      ["Pending Budget Approval", "Finance approves", "Approved", "Finance Controller"],
      ["Pending Budget Approval", "Finance denies", "Denied", "Finance Controller"],
      ["Approved", "Job posting created", "Posted", "Recruiter"],
      ["Pending Budget Approval", "Budget exception", "Pending CFO Approval", "System"],
      ["Pending CFO Approval", "CFO approves", "Approved", "CFO"],
    ],
    notifications: [
      "Requisition submission confirmation to hiring manager",
      "HR review assignment with workforce planning data",
      "Budget review request to finance with cost impact analysis",
      "CFO escalation notification for budget exceptions",
      "Approval confirmation with next steps to all stakeholders",
      "Denial notification with reasons to hiring manager",
      "Job posting creation task to recruiter upon approval",
    ],
    exceptions: [
      "If an approver is on extended leave, the system redirects to a backup approver after the configured timeout (default 48 hours).",
      "If a requisition is urgent (business-critical), the hiring manager can request expedited approval which compresses all review stages to 24 hours total.",
      "If the same role was requisitioned and denied within the last 90 days, the system flags it for additional justification before allowing resubmission.",
    ],
    integrations: "Budget Management, Workforce Planning, Recruitment Module, Compensation Benchmarking, Department Analytics, Organizational Chart, Communication (Email/Teams).",
  },

  // ────── 12. Training Enrollment Workflow ──────
  {
    title: "12. Training Enrollment Workflow",
    description: "The Training Enrollment Workflow manages the lifecycle of learning activities from course creation through enrollment, delivery, assessment, and certification. It ensures employees meet compliance and development training requirements on schedule.",
    trigger: "An L&D administrator creates a new training course, or the system auto-assigns mandatory training based on role, department, or compliance requirements.",
    steps: [
      ["Course Creation", "The L&D administrator creates a training course defining title, description, learning objectives, delivery mode (classroom/virtual/e-learning), duration, prerequisites, and target audience. They upload or link content materials and configure assessment criteria."],
      ["Enrollment", "Employees enroll through self-service selection or are auto-enrolled by the system based on mandatory training rules, development plan recommendations, or manager nominations. Waitlists are managed when session capacity is reached."],
      ["Attendance", "For instructor-led sessions, attendance is captured through biometric integration, digital check-in, or manual marking by the instructor. The system tracks attendance compliance against the minimum required for certification eligibility."],
      ["Assessment", "Post-training assessments are administered online or in-person with configured question banks, time limits, and passing criteria. The system auto-grades objective questions and supports rubric-based evaluation for subjective assessments."],
      ["Certification", "Upon successful assessment completion, the system generates a digital certificate with a unique verification code. Certifications are recorded in the employee's learning profile with validity periods and renewal reminders for time-bound certifications."],
    ],
    decisions: [
      ["Assessment Failure", "If an employee fails the assessment, the system offers a retake option (configurable number of attempts) with remedial learning recommendations before the retake."],
      ["Prerequisite Not Met", "If an employee attempts enrollment without completing prerequisites, the system blocks enrollment and suggests the prerequisite course first."],
      ["Certification Expiry", "If a certification has an expiry date, the system sends renewal reminders at 90, 60, and 30 days before expiry, and auto-assigns the renewal course if configured."],
    ],
    roles: [
      ["L&D Administrator", "Creates and manages training programs", "Create courses, Configure assessments, Manage schedules, Generate reports"],
      ["Employee", "Enrolls and completes training", "Self-enroll, Attend sessions, Complete assessments, Download certificates"],
      ["Reporting Manager", "Nominates team members and tracks progress", "Nominate employees, Approve enrollments, Monitor completion"],
      ["Instructor", "Delivers training and evaluates", "Conduct sessions, Mark attendance, Grade assessments"],
      ["System", "Automates enrollment and compliance tracking", "Auto-enroll, Track attendance, Auto-grade, Generate certificates"],
    ],
    statuses: [
      ["Created", "Enrollment opens", "Open for Enrollment", "L&D Administrator"],
      ["Open for Enrollment", "Employee enrolls", "Enrolled", "Employee / System"],
      ["Enrolled", "Session starts", "In Progress", "Instructor / System"],
      ["In Progress", "Session completes", "Assessment Due", "System"],
      ["Assessment Due", "Assessment passed", "Certified", "System"],
      ["Assessment Due", "Assessment failed", "Retake Required", "System"],
      ["Certified", "Certification expires", "Renewal Due", "System"],
    ],
    notifications: [
      "Course availability notification to target audience",
      "Enrollment confirmation with session details to employee",
      "Pre-session reminders (3-day and 1-day) to enrolled employees",
      "Attendance marking reminders to instructors",
      "Assessment due date reminders to employees",
      "Certification issuance notification to employee and manager",
      "Certification renewal reminders at 90/60/30-day intervals",
    ],
    exceptions: [
      "If an employee cannot attend a mandatory training due to legitimate reasons (leave, travel), they must complete an equivalent e-learning module within the extended deadline.",
      "If an instructor cancels a session, the system auto-notifies all enrolled employees and offers rescheduled dates or alternative sessions.",
      "If the LMS platform is unavailable during assessment, the system extends the deadline and preserves any completed responses for resumption.",
    ],
    integrations: "Learning Management System (LMS), Performance Review (development plans), Compliance Module, Calendar (Outlook/Google), Video Conferencing (Zoom/Teams), Assessment Engine, Certificate Verification Portal, Employee Master.",
  },

  // ────── 13. Asset Assignment Workflow ──────
  {
    title: "13. Asset Assignment Workflow",
    description: "The Asset Assignment Workflow tracks the complete lifecycle of organizational assets from request through assignment, usage monitoring, and return. It ensures accountability, proper utilization, and complete asset traceability.",
    trigger: "An employee or manager requests an asset assignment (laptop, phone, vehicle, equipment) for a new hire, role change, or replacement.",
    steps: [
      ["Request", "The employee or manager submits an asset request specifying the asset type, justification, urgency, and preferred specifications. The system validates the request against the employee's role-based asset entitlement matrix."],
      ["Approval", "The request is routed to the reporting manager and IT/fleet admin for approval. They verify the entitlement, check inventory availability, and approve, suggest alternatives, or deny the request with justification."],
      ["Assignment", "Upon approval, the asset is allocated from inventory or procured if unavailable. The system records the asset details (serial number, configuration, value), generates an acknowledgment form, and updates the asset register with the assignment."],
      ["Tracking", "The system continuously tracks assigned assets through periodic employee confirmations, GPS tracking (for vehicles), and IT inventory scans. Maintenance schedules, warranty expiry, and insurance renewal dates are monitored with automated alerts."],
      ["Return", "When the employee changes roles, leaves the organization, or the asset reaches end-of-life, a return process is initiated. The asset is inspected for damage, data is wiped, and the return is recorded in the asset register."],
      ["Clearance", "After successful return and inspection, the asset assignment is closed in the system. Any damage charges are calculated and forwarded to payroll for recovery. The asset is returned to inventory, reassigned, or disposed of per policy."],
    ],
    decisions: [
      ["Inventory Unavailable", "If the requested asset is not in inventory, the system can either initiate procurement or offer an equivalent available alternative for the employee's consideration."],
      ["Damage Assessment", "If a returned asset is damaged beyond normal wear and tear, a damage assessment is conducted and recovery charges are calculated based on the asset's depreciated value and repair/replacement cost."],
      ["Exception Request", "If an employee requests an asset beyond their entitlement level, the request requires additional VP-level approval with budget impact justification."],
    ],
    roles: [
      ["Employee", "Requests and acknowledges asset assignments", "Submit request, Sign acknowledgment, Confirm possession, Return asset"],
      ["Reporting Manager", "Approves team asset requests", "Review entitlement, Approve/Deny, Suggest alternatives"],
      ["IT / Asset Admin", "Manages asset inventory and assignment", "Check availability, Allocate asset, Record details, Inspect returns"],
      ["Finance", "Handles procurement and damage recovery", "Procurement approval, Depreciation tracking, Damage recovery"],
      ["System", "Automates tracking and compliance", "Entitlement validation, Warranty alerts, Periodic confirmations"],
    ],
    statuses: [
      ["Requested", "Manager approves", "Pending Allocation", "Reporting Manager"],
      ["Pending Allocation", "Asset allocated", "Assigned", "IT / Asset Admin"],
      ["Assigned", "Employee acknowledges", "In Use", "Employee"],
      ["In Use", "Return initiated", "Return Pending", "Employee / Manager"],
      ["Return Pending", "Asset returned", "Under Inspection", "IT / Asset Admin"],
      ["Under Inspection", "Inspection passed", "Cleared", "IT / Asset Admin"],
      ["Under Inspection", "Damage found", "Damage Assessment", "IT / Asset Admin"],
      ["Cleared", "Assignment closed", "Closed", "System"],
    ],
    notifications: [
      "Asset request submission confirmation to employee",
      "Approval request to manager with entitlement details",
      "Allocation confirmation with asset details to employee",
      "Periodic asset confirmation reminders (quarterly)",
      "Warranty and insurance expiry alerts to admin",
      "Return initiation notification to employee",
      "Damage assessment result and recovery notification to employee",
    ],
    exceptions: [
      "If an asset is lost or stolen, the employee must file an incident report and the system triggers insurance claim and replacement procurement workflows.",
      "If a returned asset contains sensitive data that cannot be wiped, the system escalates to the security team for certified data destruction before reuse.",
      "If an employee refuses to return an asset after separation, the system places a hold on FNF settlement and initiates legal recovery procedures.",
    ],
    integrations: "IT Service Desk, Procurement, Finance (depreciation & recovery), Separation Workflow (return triggers), Insurance Management, Employee Master, Inventory Management, Security (data wipe certification).",
  },

  // ────── 14. Grievance Resolution Workflow ──────
  {
    title: "14. Grievance Resolution Workflow",
    description: "The Grievance Resolution Workflow provides a structured, confidential mechanism for employees to raise workplace concerns and ensures fair, timely resolution through defined investigation and mediation processes.",
    trigger: "An employee files a grievance through the confidential portal or contacts the designated grievance officer, describing the issue and involved parties.",
    steps: [
      ["Filing", "The employee submits a grievance through the confidential portal, selecting the category (harassment, discrimination, policy violation, workplace conflict, other), describing the issue, identifying involved parties, and attaching evidence. The system ensures anonymity options where applicable."],
      ["Acknowledgment", "The system automatically acknowledges receipt to the employee with a reference number and expected timeline. The designated grievance officer is notified and reviews the filing within 24 hours to determine severity and assign priority."],
      ["Investigation", "An impartial investigator is assigned based on the grievance category and involved parties (ensuring no conflict of interest). The investigator interviews relevant parties, collects evidence, and documents findings. Regular status updates are provided to the employee while maintaining confidentiality."],
      ["Mediation", "If appropriate, a formal mediation session is arranged between the involved parties facilitated by a trained mediator. The system schedules the session, provides guidelines, and documents the mediation outcome including any agreed-upon resolutions."],
      ["Resolution", "Based on investigation findings and/or mediation outcomes, the grievance officer determines the resolution, which may include corrective actions, policy changes, disciplinary measures, or dismissal of the grievance. The resolution is documented with full justification."],
      ["Follow-up", "The system schedules follow-up check-ins at 30, 60, and 90 days post-resolution to ensure the resolution is effective and no retaliation occurs. The employee can report any concerns during the follow-up period through the confidential channel."],
    ],
    decisions: [
      ["Severity Assessment", "If the grievance involves allegations of serious misconduct (harassment, fraud), it is escalated immediately to senior leadership and legal, bypassing the standard investigation timeline."],
      ["Mediation Unsuitable", "If either party refuses mediation or the investigator determines mediation is inappropriate (power imbalance, severity), the process proceeds directly to resolution based on investigation findings."],
      ["Retaliation Report", "If the employee reports retaliation during the follow-up period, a new expedited investigation is triggered with enhanced protections for the complainant."],
    ],
    roles: [
      ["Employee (Complainant)", "Files and tracks the grievance", "Submit grievance, Provide evidence, Participate in investigation, Attend mediation"],
      ["Grievance Officer", "Oversees the resolution process", "Acknowledge grievance, Assign investigator, Determine resolution, Monitor follow-up"],
      ["Investigator", "Conducts impartial fact-finding", "Interview parties, Collect evidence, Document findings, Recommend action"],
      ["Mediator", "Facilitates resolution between parties", "Schedule mediation, Facilitate discussion, Document agreement"],
      ["HR Head", "Ensures policy compliance and fairness", "Review serious cases, Approve disciplinary actions, Ensure no retaliation"],
    ],
    statuses: [
      ["Filed", "Acknowledged by officer", "Acknowledged", "System / Grievance Officer"],
      ["Acknowledged", "Investigator assigned", "Under Investigation", "Grievance Officer"],
      ["Under Investigation", "Investigation complete", "Mediation / Resolution", "Investigator"],
      ["Mediation", "Mediation complete", "Resolution Pending", "Mediator"],
      ["Resolution Pending", "Resolution determined", "Resolved", "Grievance Officer"],
      ["Resolved", "Follow-up initiated", "Under Follow-up", "System"],
      ["Under Follow-up", "Follow-up period ends", "Closed", "System"],
      ["Under Follow-up", "Retaliation reported", "Reopened (Expedited)", "Employee / System"],
    ],
    notifications: [
      "Filing acknowledgment with reference number to employee",
      "Investigation assignment to investigator with case details",
      "Regular status updates to employee (while maintaining confidentiality)",
      "Mediation scheduling to involved parties",
      "Resolution communication to employee with outcome details",
      "Follow-up check-in reminders at 30/60/90 days",
      "Retaliation report escalation to HR head and legal",
    ],
    exceptions: [
      "If the grievance involves a senior leader, the system automatically routes to the board-level ethics committee instead of the standard grievance officer.",
      "If the complainant wishes to withdraw the grievance, they must provide a written statement. The grievance officer evaluates if the withdrawal is voluntary before closing.",
      "If the investigation reveals systemic issues beyond the individual case, the system triggers a policy review workflow to address the root cause organization-wide.",
    ],
    integrations: "Employee Master, Communication (confidential channel), Legal/Compliance, Disciplinary Action Module, Policy Management, Analytics (trend analysis), Calendar (scheduling), Document Management (secure storage).",
  },

  // ────── 15. Workflow Engine Pattern ──────
  {
    title: "15. Workflow Engine Pattern",
    description: "The Workflow Engine is the foundational pattern powering all workflow processes in NEXUS HRMS. It provides a generic, configurable framework based on the WorkflowDefinition → WorkflowInstance → WorkflowApproval model that enables rapid creation and modification of business processes without code changes.",
    trigger: "Any business event (user action, system trigger, scheduled event, AI recommendation) that requires a structured multi-step process with approvals and status tracking.",
    steps: [
      ["WorkflowDefinition Creation", "A workflow definition is created by administrators defining the process blueprint: steps, transitions, approval chains, role mappings, SLA configurations, notification templates, and exception handlers. Each definition is versioned and supports A/B testing for process optimization."],
      ["WorkflowDefinition Activation", "When a definition is activated, it becomes available for instantiation. The system validates the definition for completeness (all statuses reachable, all transitions have triggers, no orphan steps) and publishes it to the workflow registry. Previous versions are archived but remain active for in-flight instances."],
      ["WorkflowInstance Creation", "When a trigger event occurs, the engine creates a workflow instance from the active definition. The instance captures the specific context (requester, data, business references) and initializes the first step. Instance-specific variables are set that will drive conditional logic throughout the process."],
      ["Step Execution", "Each step in the workflow instance is executed according to the definition: automated actions (API calls, data updates, notifications) are performed by the system, while manual steps (approvals, reviews, data entry) are assigned to the configured roles. The engine tracks completion and triggers transitions."],
      ["WorkflowApproval Processing", "At approval steps, the engine creates approval records with the required approvers, approval levels (sequential/parallel), and delegation rules. It supports single approver, multi-approver (any/all/majority), and tiered approval patterns. Escalation timers and auto-approval rules are enforced."],
      ["Transition Evaluation", "After each step completes, the engine evaluates transition conditions using the instance context and business rules. Conditional branching, parallel paths, and merge points are handled deterministically. The engine ensures the workflow progresses correctly through the defined state machine."],
      ["Completion and Archival", "When all steps are completed and the workflow reaches a terminal state, the instance is marked as complete. Full audit trail, all decisions, and data mutations are archived. The engine triggers any configured post-completion actions (notifications, integrations, analytics updates)."],
    ],
    decisions: [
      ["Conditional Branching", "The engine evaluates rule expressions at decision points to determine the workflow path. Rules can reference instance data, system state, or external API responses for dynamic routing."],
      ["Approval Rejection Path", "If an approval is rejected, the engine follows the configured rejection path: return to a previous step, terminate the workflow, or route to an exception handler with the rejection reason."],
      ["Parallel Path Synchronization", "When multiple parallel paths exist, the engine supports AND-join (all paths must complete) or OR-join (any path completion suffices) synchronization before proceeding to the next step."],
    ],
    roles: [
      ["Workflow Administrator", "Designs and configures workflow definitions", "Create definitions, Configure rules, Activate versions, Monitor health"],
      ["Process Owner", "Owns the business process being automated", "Define requirements, Approve definitions, Review performance, Request changes"],
      ["Approver", "Makes decisions at approval steps", "Review requests, Approve/Reject, Delegate authority, Add comments"],
      ["System", "Executes automated steps and enforces rules", "Evaluate transitions, Send notifications, Track SLAs, Create audit records"],
      ["Auditor", "Reviews workflow compliance and performance", "Access audit trails, Analyze bottlenecks, Verify compliance, Recommend optimizations"],
    ],
    statuses: [
      ["Definition Draft", "Definition validated and activated", "Active Definition", "Workflow Administrator"],
      ["Active Definition", "Trigger event occurs", "Instance Created", "System"],
      ["Instance Created", "First step executes", "In Progress", "System"],
      ["In Progress", "Approval step reached", "Pending Approval", "System"],
      ["Pending Approval", "Approver approves", "Approved (Continue)", "Approver"],
      ["Pending Approval", "Approver rejects", "Rejected (Path/Exception)", "Approver"],
      ["In Progress", "Final step completes", "Completed", "System"],
      ["In Progress", "Error/exception occurs", "Error / Exception", "System"],
      ["Error / Exception", "Issue resolved", "In Progress (Resumed)", "Workflow Administrator"],
    ],
    notifications: [
      "Workflow instance creation confirmation to requester",
      "Step assignment notifications to responsible roles",
      "Approval request notifications with context summary",
      "SLA warning and breach notifications",
      "Completion notification with summary to requester and stakeholders",
      "Error/exception alerts to workflow administrator",
      "Daily/weekly workflow health dashboard to process owners",
    ],
    exceptions: [
      "If a workflow definition has a structural error (unreachable states, missing transitions), the engine prevents activation and reports the specific issues for correction.",
      "If an approval step times out (approver unavailable, SLA breached), the engine applies the configured timeout policy: auto-approve, auto-reject, escalate to backup, or hold for manual intervention.",
      "If a system integration call fails during step execution, the engine implements retry logic (configurable attempts and backoff) before marking the step as errored and alerting administrators.",
    ],
    integrations: "All NEXUS HRMS modules (via workflow triggers), Notification Engine, User/Role Management, Audit & Compliance, Analytics Platform, External Systems (via API), Calendar, Communication, AI/ML Engine (for smart routing).",
  },
];

// ─── Build Document ─────────────────────────────────────────────
async function main() {
  const children = [];

  // ─────────── COVER PAGE ───────────
  children.push(
    // Top spacer
    new Paragraph({ spacing: { before: 3600 }, children: [] }),
    // Decorative accent line
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: P.accent } },
      children: [],
    }),
    // Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "NEXUS HRMS", font: FONT, size: 72, bold: true, color: P.cover.title }),
      ],
    }),
    // Subtitle
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Workflow Documentation", font: FONT, size: 40, color: P.accent }),
      ],
    }),
    // Subtitle 2
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: "SaaS-Based AI-Powered Human Resource Management System", font: FONT, size: 24, color: P.cover.subtitle }),
      ],
    }),
    // Accent line
    new Paragraph({
      spacing: { after: 600 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent } },
      children: [],
    }),
    // Meta info
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Version 1.0  |  March 2026", font: FONT, size: 22, color: P.cover.meta }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Classification: Confidential", font: FONT, size: 20, color: P.cover.meta }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Prepared by: NEXUS HRMS Product Team", font: FONT, size: 20, color: P.cover.footer }),
      ],
    }),
    // Page break
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ─────────── TABLE OF CONTENTS ───────────
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({ text: "Table of Contents", font: FONT, size: 36, bold: true, color: P.primary }),
      ],
    }),
    accentLine(),
  );
  // TOC field – use proper TableOfContents element so the post-process script can inject field codes
  children.push(
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-4",
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ─────────── MODULE SECTIONS ───────────
  for (const mod of modules) {
    // Section heading
    children.push(heading2(mod.title));
    children.push(accentLine());

    // Description
    children.push(heading3("Description"));
    children.push(bodyText(mod.description));

    // Trigger
    children.push(heading3("Trigger Event"));
    children.push(bodyText(mod.trigger));

    // Step-by-step Flow
    children.push(heading3("Step-by-Step Flow"));
    for (let i = 0; i < mod.steps.length; i++) {
      children.push(numberedStep(i + 1, mod.steps[i][0], mod.steps[i][1]));
    }

    // Decision Points
    children.push(heading3("Decision Points"));
    for (const d of mod.decisions) {
      children.push(heading4(d[0]));
      children.push(bodyText(d[1]));
    }

    // Role Responsibilities
    children.push(heading3("Role Responsibilities"));
    children.push(roleTable(mod.roles));
    children.push(spacer(80));

    // Status Transitions
    children.push(heading3("Status Transitions"));
    children.push(statusTable(mod.statuses));
    children.push(spacer(80));

    // Notifications & Alerts
    children.push(heading3("Notifications & Alerts"));
    for (const n of mod.notifications) {
      children.push(bulletItem(n));
    }

    // Exception Handling
    children.push(heading3("Exception Handling"));
    for (const e of mod.exceptions) {
      children.push(bulletItem(e));
    }

    // Integration Points
    children.push(heading3("Integration Points"));
    children.push(bodyText(mod.integrations));

    // Page break after each module
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ─── Create Document ─────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: P.body },
          paragraph: { spacing: { line: LINE_312 } },
        },
        heading1: {
          run: { font: FONT, size: 36, bold: true, color: P.primary },
          paragraph: { spacing: { before: 360, after: 200, line: LINE_312 } },
        },
        heading2: {
          run: { font: FONT, size: 32, bold: true, color: P.primary },
          paragraph: { spacing: { before: 300, after: 160, line: LINE_312 } },
        },
        heading3: {
          run: { font: FONT, size: 26, bold: true, color: P.primary },
          paragraph: { spacing: { before: 240, after: 120, line: LINE_312 } },
        },
        heading4: {
          run: { font: FONT, size: 23, bold: true, color: P.table.headerBg },
          paragraph: { spacing: { before: 200, after: 80, line: LINE_312 } },
        },
      },
    },
    sections: [
      // Cover page section (dark bg)
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            size: { width: 12240, height: 15840 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "NEXUS HRMS — Workflow Documentation", font: FONT, size: 16, color: P.secondary }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine } },
                spacing: { before: 100 },
                children: [
                  new TextRun({ text: "Page ", font: FONT, size: 16, color: P.secondary }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: P.secondary }),
                  new TextRun({ text: " of ", font: FONT, size: 16, color: P.secondary }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: P.secondary }),
                  new TextRun({ text: "  |  NEXUS HRMS  |  Confidential", font: FONT, size: 16, color: P.secondary }),
                ],
              }),
            ],
          }),
        },
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("/home/z/my-project/download/NEXUS-HRMS-Workflow-Documentation.docx", buffer);
  console.log("Document generated successfully!");
}

main().catch(err => { console.error(err); process.exit(1); });
