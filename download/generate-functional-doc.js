#!/usr/bin/env node
const docx = require("docx");
const fs = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, PageBreak, ShadingType,
  BorderStyle, TableBorders, PageOrientation, convertInchesToTwip,
  Tab, TabStopPosition, TabStopType, LineRuleType, TableOfContents,
} = docx;

// ── Palette ──
const P = {
  primary: "162235", body: "1A2B40", secondary: "6878A0",
  accent: "37DCF2", surface: "F4F8FC",
  cover: { title: "FFFFFF", subtitle: "B0B8C0", meta: "90989F", footer: "687078" },
  tbl: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};

// ── Helper: body paragraph ──
function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, lineRule: LineRuleType.AUTO },
    ...opts,
    children: [
      new TextRun({
        text,
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 22,
        color: P.body,
        ...opts.runOpts,
      }),
    ],
  });
}

// ── Helper: bullet point ──
function bullet(text, level = 0) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720 + level * 360, hanging: 240 },
    spacing: { line: 312, lineRule: LineRuleType.AUTO, after: 40 },
    children: [
      new TextRun({
        text: "\u2022 " + text,
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 22,
        color: P.body,
      }),
    ],
  });
}

// ── Helper: section heading ──
function sectionHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 360, after: 200, line: 312, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 28 : 24,
        color: P.primary,
        bold: true,
      }),
    ],
  });
}

// ── Helper: module sub-heading ──
function moduleSubHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 240, after: 120, line: 312, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 22,
        color: P.tbl.headerBg,
        bold: true,
      }),
    ],
  });
}

// ── Helper: table cell ──
function cell(text, opts = {}) {
  const isHeader = opts.isHeader || false;
  const isAlt = opts.isAlt || false;
  return new TableCell({
    shading: isHeader
      ? { fill: P.tbl.headerBg, type: ShadingType.CLEAR }
      : isAlt
        ? { fill: P.tbl.surface, type: ShadingType.CLEAR }
        : { fill: "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { line: 276, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text,
            font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
            size: 20,
            color: isHeader ? P.tbl.headerText : P.body,
            bold: isHeader || opts.bold || false,
          }),
        ],
      }),
    ],
  });
}

// ── Helper: create table with zebra striping ──
function createTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      cell(h, { isHeader: true, width: Math.round(colWidths[i] / total * 100) })
    ),
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((c, ci) =>
        cell(c, { isAlt: ri % 2 === 1, width: Math.round(colWidths[ci] / total * 100) })
      ),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ── Helper: accent line separator ──
function accentLine() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.tbl.accentLine } },
  });
}

// ── Helper: empty paragraph spacer ──
function spacer(h = 120) {
  return new Paragraph({ spacing: { before: h, after: 0 } });
}

// ── Module data ──
const categories = [
  {
    name: "Platform Modules",
    modules: [
      {
        name: "Super Admin",
        overview: "The Super Admin module serves as the central command center for the entire NEXUS HRMS multi-tenant SaaS platform. It provides comprehensive control over tenant lifecycle management, subscription governance, and platform-wide configuration. This module ensures operational oversight across all tenant organizations while maintaining data isolation and security boundaries.",
        features: [
          "Multi-tenant provisioning and lifecycle management with automated onboarding workflows",
          "Subscription plan creation, modification, and enforcement with usage-based billing tiers",
          "Centralized audit log aggregation across all tenants with real-time monitoring dashboards",
          "Global configuration management for platform defaults, feature flags, and service thresholds",
          "Tenant health monitoring with automated alerts for storage, user count, and compliance limits",
          "Platform-wide user impersonation for debugging and support with full activity traceability",
          "White-label customization per tenant including branding, logos, and email templates",
          "Disaster recovery orchestration with tenant-specific backup and restore capabilities",
        ],
        roles: [
          ["Super Administrator", "Full platform access; tenant CRUD; subscription management; global config"],
          ["Platform Engineer", "System health monitoring; audit log review; backup operations"],
          ["Billing Manager", "Subscription plan management; invoice review; payment gateway configuration"],
          ["Support Agent", "Read-only tenant data access; impersonation for troubleshooting"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["name", "String", "Tenant name", "Required"],
          ["domain", "String", "Custom domain", "Unique"],
          ["subscriptionPlanId", "UUID (FK)", "Linked plan", "Required"],
          ["status", "Enum", "active/suspended/trial", "Default: trial"],
          ["maxUsers", "Int", "User limit", "From plan"],
          ["settings", "JSON", "Tenant config", "Default: {}"],
          ["createdAt", "DateTime", "Creation timestamp", "Auto"],
        ],
        screens: [
          ["Dashboard", "Platform overview with tenant count, revenue, and health metrics"],
          ["Tenant List", "Searchable, filterable grid of all tenants with status indicators"],
          ["Tenant Detail", "Comprehensive tenant profile with configuration tabs"],
          ["Subscription Plans", "CRUD interface for plan management with feature matrix"],
          ["Audit Logs", "Chronological log viewer with advanced filtering and export"],
          ["Global Settings", "Platform-wide configuration with environment toggles"],
        ],
        integrations: [
          "AI Admin Console \u2013 Shares AI feature flags and usage limits per tenant",
          "Tenant Admin \u2013 Pushes subscription constraints and feature toggles downstream",
          "Reports \u2013 Feeds platform-wide analytics and billing data for reporting",
          "Settings \u2013 Synchronizes global configuration defaults to tenant-level settings",
        ],
      },
      {
        name: "AI Admin Console",
        overview: "The AI Admin Console provides centralized governance over all AI/ML capabilities within the NEXUS HRMS platform. Administrators can configure AI models, manage prompt templates, monitor usage metrics, and establish guardrails for responsible AI deployment. This module ensures that AI features operate within defined parameters while delivering intelligent automation across HR processes.",
        features: [
          "AI model configuration and versioning with A/B testing support for prompt optimization",
          "Prompt template library management with role-based access and approval workflows",
          "Real-time usage monitoring with token consumption tracking and cost allocation per tenant",
          "AI safety guardrails configuration including content filters, bias detection, and PII redaction",
          "Model performance analytics with accuracy metrics, latency tracking, and drift detection",
          "Automated retraining pipeline orchestration with data quality validation checks",
          "Feature-level AI toggle management to enable/disable specific AI capabilities per tenant",
          "Audit trail for all AI-generated outputs with source attribution and confidence scores",
        ],
        roles: [
          ["AI Administrator", "Full access to model config; prompt management; safety settings"],
          ["ML Engineer", "Model training; performance monitoring; pipeline configuration"],
          ["Compliance Officer", "Read-only access to audit trails; bias reports; PII logs"],
          ["Tenant Admin", "Feature toggles for their tenant; usage dashboards"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["modelProvider", "Enum", "openai/anthropic/custom", "Required"],
          ["modelVersion", "String", "Model version tag", "Required"],
          ["promptTemplates", "JSON[]", "Template library", "Array"],
          ["safetyConfig", "JSON", "Guardrail settings", "Default: {}"],
          ["usageMetrics", "JSON", "Aggregated usage", "Computed"],
          ["tenantOverrides", "JSON[]", "Per-tenant config", "Optional"],
          ["isActive", "Boolean", "Deployment status", "Default: true"],
        ],
        screens: [
          ["Dashboard", "AI usage overview with cost trends, model performance, and alert summary"],
          ["Model Config", "Model selection, versioning, and parameter tuning interface"],
          ["Prompt Library", "CRUD for prompt templates with preview and testing sandbox"],
          ["Usage Monitor", "Real-time token usage with per-tenant breakdown and cost allocation"],
          ["Safety Settings", "Guardrail configuration with content filter rules and bias thresholds"],
          ["Audit Trail", "AI output logs with search, filter, and compliance export"],
        ],
        integrations: [
          "Super Admin \u2013 Receives tenant subscription limits and feature flag constraints",
          "AI Interview \u2013 Provides interview scoring models and question generation prompts",
          "AI Assistant \u2013 Supplies chatbot intent models and response templates",
          "Reports \u2013 Feeds AI usage analytics and performance metrics to reporting engine",
          "Engagement \u2013 Powers sentiment analysis for pulse surveys and eNPS calculations",
        ],
      },
      {
        name: "Tenant Admin",
        overview: "The Tenant Admin module empowers organization administrators with full control over their company structure, user management, and role-based access within the NEXUS platform. It provides hierarchical organization management spanning company groups, companies, branches, and departments. This module serves as the administrative backbone for tenant-specific configuration and governance.",
        features: [
          "Company group management with multi-company hierarchy and inter-company transfers",
          "Branch and department creation with geographic coordinates and cost center mapping",
          "User lifecycle management with bulk import, role assignment, and deactivation workflows",
          "Role-based access control (RBAC) with custom role builder and permission granularity",
          "Designation management with grade-level mapping and salary band associations",
          "Organization-wide policy configuration including leave policies, attendance rules, and approval hierarchies",
          "Multi-currency and multi-locale settings per company with localization support",
          "Data import/export utilities with CSV/Excel templates and validation engines",
        ],
        roles: [
          ["Tenant Administrator", "Full org access; user management; policy configuration"],
          ["Company Admin", "Company-level management; branch/department CRUD; user assignment"],
          ["Branch Manager", "Branch-level oversight; employee view; department management"],
          ["HR Manager", "Employee management; designation config; policy review"],
          ["IT Administrator", "User provisioning; role management; integration settings"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["companyGroupId", "UUID (FK)", "Parent group", "Optional"],
          ["name", "String", "Company name", "Required"],
          ["registrationNo", "String", "Business registration", "Unique"],
          ["industry", "String", "Industry category", "Optional"],
          ["currency", "String", "Default currency", "ISO 4217"],
          ["locale", "String", "Default locale", "ISO 639-1"],
          ["branches", "Relation", "Branch list", "1:N"],
        ],
        screens: [
          ["Dashboard", "Org overview with employee count, branch distribution, and pending actions"],
          ["Company Groups", "Hierarchical group management with drag-and-drop reordering"],
          ["Companies", "Company CRUD with compliance status and branch overview"],
          ["Branches", "Branch management with location mapping and cost centers"],
          ["Departments", "Department hierarchy with team structures and designations"],
          ["Users", "User grid with role assignment, status, and bulk operations"],
          ["Roles & Permissions", "Visual RBAC builder with permission matrix editor"],
        ],
        integrations: [
          "Super Admin \u2013 Receives subscription limits and platform-level feature toggles",
          "Company Management \u2013 Shares company/branch/department structure definitions",
          "Employees \u2013 Provides org hierarchy for employee directory and org charts",
          "Workflows \u2013 Supplies approval hierarchy and role-based routing rules",
          "Settings \u2013 Pushes organization policies and locale/currency configurations"],
      },
    ],
  },
  {
    name: "Core HR",
    modules: [
      {
        name: "Dashboard",
        overview: "The Dashboard module provides a centralized, intelligent overview of all HR operations with real-time analytics and actionable insights. It aggregates data from across the HRMS platform to present key metrics, trend analysis, and proactive alerts. The module serves as the primary entry point for HR professionals, enabling quick decision-making through visual data storytelling and AI-powered recommendations.",
        features: [
          "Configurable widget-based dashboard with drag-and-drop layout customization",
          "Real-time headcount analytics with attrition trends, diversity metrics, and hiring velocity",
          "AI-powered insights and recommendations for proactive HR intervention",
          "Quick action shortcuts for common tasks like leave approval, onboarding initiation, and report generation",
          "Department-wise comparison charts with benchmark indicators and KPI tracking",
          "Calendar integration showing holidays, team leave, birthdays, and work anniversaries",
          "Compliance alert panel highlighting pending statutory filings and policy expiration dates",
          "Personalized views based on user role with relevant metrics and action items",
        ],
        roles: [
          ["HR Director", "Full dashboard access; strategic analytics; AI insights review"],
          ["HR Manager", "Department-level analytics; team metrics; quick action approvals"],
          ["Team Lead", "Team-specific view; attendance summary; pending approvals"],
          ["Employee", "Personal dashboard; leave balance; upcoming events"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["userId", "UUID (FK)", "Dashboard owner", "Required"],
          ["layout", "JSON", "Widget configuration", "Default: default"],
          ["widgets", "JSON[]", "Active widgets", "Array"],
          ["refreshInterval", "Int", "Auto-refresh (seconds)", "Default: 300"],
          ["role", "Enum", "User role for view", "Derived"],
          ["lastAccessed", "DateTime", "Last view time", "Auto-updated"],
          ["isDefault", "Boolean", "System default flag", "Default: false"],
        ],
        screens: [
          ["Main Dashboard", "Widget-based customizable view with drag-and-drop arrangement"],
          ["Analytics Center", "Deep-dive analytics with interactive charts and filters"],
          ["Quick Actions", "Shortcut panel for common HR tasks and approvals"],
          ["Alerts & Notifications", "Centralized alert feed with priority sorting"],
          ["Calendar View", "Integrated calendar with HR events and team availability"],
        ],
        integrations: [
          "Employees \u2013 Headcount data, org distribution, and demographic analytics",
          "Attendance \u2013 Real-time attendance metrics and anomaly alerts",
          "Leave Management \u2013 Leave balance summaries and team availability overlay",
          "Recruitment \u2013 Hiring pipeline metrics and open requisition counts",
          "Performance \u2013 Review cycle progress and goal completion rates",
          "Payroll \u2013 Salary disbursement status and compliance indicators",
        ],
      },
      {
        name: "Company Management",
        overview: "The Company Management module handles the structural foundation of an organization within NEXUS HRMS. It enables administrators to define and manage companies, branches, departments, and designations in a hierarchical manner. This module serves as the organizational backbone, providing the structural context required by virtually every other module in the system.",
        features: [
          "Multi-company support with independent configurations and inter-company transactions",
          "Branch management with geographic mapping, timezone settings, and operating hours",
          "Department hierarchy with nested sub-departments and cross-functional team support",
          "Designation management with grade bands, salary ranges, and competency requirements",
          "Cost center allocation and tracking with department-level budgeting integration",
          "Company-wide policy definitions for working hours, holidays, and compliance requirements",
          "Location-based statutory configuration for state-specific labor law compliance",
          "Organizational restructuring tools with change impact analysis and employee migration",
        ],
        roles: [
          ["Company Admin", "Full company config; branch/department management; policy setup"],
          ["HR Manager", "Department and designation management; policy review"],
          ["Branch Manager", "Branch-level configuration; local policy overrides"],
          ["Finance Admin", "Cost center allocation; budget mapping; statutory config"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["companyId", "UUID (FK)", "Parent company", "Required"],
          ["branchName", "String", "Branch name", "Required"],
          ["address", "JSON", "Full address", "Required"],
          ["timezone", "String", "IANA timezone", "Default: UTC"],
          ["departments", "Relation", "Department list", "1:N"],
          ["designations", "Relation", "Designation list", "1:N"],
          ["costCenter", "String", "Cost center code", "Optional"],
        ],
        screens: [
          ["Company Profile", "Company details with registration info and compliance status"],
          ["Branch Manager", "Branch CRUD with location map and operational settings"],
          ["Department Tree", "Visual hierarchy with drag-and-drop reordering"],
          ["Designation Matrix", "Grade-level designations with salary bands and competencies"],
          ["Policy Configuration", "Working hours, holidays, and compliance rule setup"],
          ["Cost Centers", "Cost center allocation with budget tracking integration"],
        ],
        integrations: [
          "Tenant Admin \u2013 Receives company structure definitions and role hierarchies",
          "Employees \u2013 Provides org structure for employee assignment and directory",
          "Payroll \u2013 Supplies cost centers, statutory configs, and salary bands",
          "Attendance \u2013 Shares branch timezones, working hours, and holiday calendars",
          "Settings \u2013 Pushes company-level policies and compliance configurations",
        ],
      },
      {
        name: "Employees",
        overview: "The Employees module is the central repository for all employee-related data within NEXUS HRMS, providing a comprehensive directory, dynamic org chart visualization, and complete employee lifecycle management. From hire to retire, this module tracks every aspect of an employee\u2019s journey including personal details, employment history, document management, and role transitions. It serves as the master data source for virtually all HR operations.",
        features: [
          "Comprehensive employee directory with advanced search, multi-field filters, and saved views",
          "Dynamic org chart visualization with interactive drill-down and reporting line display",
          "Complete employee lifecycle tracking from pre-hire through active employment to separation",
          "Rich employee profiles with personal details, employment history, qualifications, and documents",
          "Bulk employee operations including import, export, status changes, and data updates",
          "Employee transfer and promotion workflows with automated department and role updates",
          "Custom field support for organization-specific data capture beyond standard fields",
          "AI-powered duplicate detection and data quality scoring for employee records",
        ],
        roles: [
          ["HR Director", "Full employee data access; lifecycle management; org chart view"],
          ["HR Manager", "Department-level employee management; profile updates; transfers"],
          ["Team Lead", "Team member profiles; reporting line view; limited edit access"],
          ["Employee", "Self-profile view; personal detail updates; document upload"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeCode", "String", "Unique employee ID", "Auto-generated"],
          ["firstName", "String", "First name", "Required"],
          ["lastName", "String", "Last name", "Required"],
          ["email", "String", "Work email", "Unique"],
          ["departmentId", "UUID (FK)", "Department", "Required"],
          ["designationId", "UUID (FK)", "Designation", "Required"],
          ["branchId", "UUID (FK)", "Branch", "Required"],
          ["status", "Enum", "active/notice/inactive", "Default: active"],
          ["joinDate", "DateTime", "Joining date", "Required"],
          ["managerId", "UUID (FK)", "Reporting manager", "Self-ref"],
        ],
        screens: [
          ["Employee Directory", "Searchable grid with filters, saved views, and bulk operations"],
          ["Org Chart", "Interactive hierarchy visualization with drag-and-drop editing"],
          ["Employee Profile", "Comprehensive profile with tabs for personal, employment, documents"],
          ["Lifecycle View", "Timeline of employee events with status transition management"],
          ["Bulk Import", "CSV/Excel upload with validation, mapping, and error reporting"],
          ["Custom Fields", "Admin interface for defining organization-specific employee fields"],
        ],
        integrations: [
          "Company Management \u2013 Receives department, designation, and branch assignments",
          "Onboarding \u2013 Triggers onboarding workflows for new hires",
          "Payroll \u2013 Supplies salary structure, bank details, and tax configurations",
          "Attendance \u2013 Links employee to shift schedules and attendance policies",
          "Performance \u2013 Feeds employee data for review cycle assignment",
          "Separation \u2013 Initiates exit process when employee status changes",
        ],
      },
    ],
  },
  {
    name: "Talent Acquisition",
    modules: [
      {
        name: "Recruitment",
        overview: "The Recruitment module provides a comprehensive talent acquisition pipeline from job posting to candidate selection. It streamlines the entire hiring process with automated workflows, collaborative evaluation tools, and AI-powered candidate matching. The module enables recruiters to manage high-volume hiring efficiently while maintaining a candidate-centric experience throughout the recruitment journey.",
        features: [
          "Job posting creation with customizable templates, compensation ranges, and skill requirements",
          "Candidate pipeline management with drag-and-drop Kanban board and stage-based workflows",
          "Interview scheduling with calendar integration, panel coordination, and automated notifications",
          "AI-powered candidate scoring and ranking based on resume parsing and job matching",
          "Collaborative evaluation with structured feedback forms and scorecard aggregation",
          "Offer management integration with salary breakdown and approval chain triggers",
          "Source tracking and analytics to measure channel effectiveness and cost-per-hire",
          "Candidate communication hub with email templates, SMS integration, and status updates",
        ],
        roles: [
          ["Recruitment Manager", "Full pipeline access; job posting approval; analytics view"],
          ["Recruiter", "Candidate management; interview scheduling; communication"],
          ["Interviewer", "Interview scheduling; feedback submission; scorecard access"],
          ["Hiring Manager", "Job requisition approval; candidate review; offer authorization"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["jobPostingId", "UUID (FK)", "Linked job", "Required"],
          ["candidateName", "String", "Candidate name", "Required"],
          ["candidateEmail", "String", "Email address", "Required"],
          ["resumeUrl", "String", "Resume file path", "Optional"],
          ["stage", "Enum", "Pipeline stage", "Default: applied"],
          ["aiScore", "Float", "AI match score", "Computed"],
          ["source", "String", "Application source", "Required"],
          ["assignedRecruiterId", "UUID (FK)", "Recruiter", "Optional"],
          ["appliedAt", "DateTime", "Application date", "Auto"],
        ],
        screens: [
          ["Pipeline Board", "Kanban view with drag-and-drop stage management"],
          ["Job Postings", "CRUD for job listings with template selection and publishing"],
          ["Candidate Detail", "Full profile with resume, evaluations, communication history"],
          ["Interview Calendar", "Scheduling interface with panel availability and slot booking"],
          ["Evaluation Scorecard", "Structured feedback form with rating criteria and notes"],
          ["Recruitment Analytics", "Time-to-hire, source effectiveness, and pipeline metrics"],
        ],
        integrations: [
          "Requisitions \u2013 Receives approved requisitions to create job postings",
          "Job Portal \u2013 Publishes approved postings to the public career site",
          "Offers \u2013 Triggers offer letter generation for selected candidates",
          "AI Interview \u2013 Schedules AI-powered screening interviews for candidates",
          "Employees \u2013 Converts hired candidates to employee records automatically",
        ],
      },
      {
        name: "Requisitions",
        overview: "The Requisitions module manages the manpower planning and approval process for new hires within the organization. It provides structured workflows for departments to request new positions with detailed justifications, budget allocations, and required skill specifications. The module ensures that all hiring activities are properly authorized and aligned with organizational headcount budgets and strategic workforce planning.",
        features: [
          "Manpower requisition creation with position details, justification, and budget allocation",
          "Multi-level approval workflows with configurable hierarchies and delegation support",
          "Budget validation against department and organization-level headcount plans",
          "Position specification builder with competency requirements and preferred qualifications",
          "Requisition priority classification with SLA tracking for time-sensitive hiring needs",
          "Historical requisition analytics showing fill rates, time-to-approve, and budget utilization",
          "Draft and template support for recurring position types and standard job families",
          "Automated notifications and escalations for pending approvals beyond SLA thresholds",
        ],
        roles: [
          ["Department Head", "Requisition creation; justification submission; priority assignment"],
          ["HR Manager", "Requisition review; compliance check; recruitment coordination"],
          ["Finance Manager", "Budget validation; cost approval; headcount verification"],
          ["Business Unit Head", "Final approval; strategic alignment review; priority override"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["positionTitle", "String", "Job title", "Required"],
          ["departmentId", "UUID (FK)", "Requesting dept", "Required"],
          ["numberOfPositions", "Int", "Headcount request", "Min: 1"],
          ["priority", "Enum", "low/medium/high/critical", "Default: medium"],
          ["budgetAllocated", "Decimal", "Approved budget", "Optional"],
          ["status", "Enum", "draft/pending/approved/rejected", "Default: draft"],
          ["justification", "Text", "Business case", "Required"],
          ["approvedById", "UUID (FK)", "Approver", "Nullable"],
          ["targetDate", "DateTime", "Expected fill date", "Optional"],
        ],
        screens: [
          ["Requisition List", "Filterable grid with status indicators and priority badges"],
          ["Create Requisition", "Multi-step form with position spec builder and budget entry"],
          ["Approval Workflow", "Visual approval chain with status tracking and delegation"],
          ["Budget View", "Department budget allocation vs. requisition spending analysis"],
          ["Analytics", "Fill rates, approval times, and historical trend analysis"],
        ],
        integrations: [
          "Recruitment \u2013 Feeds approved requisitions as job posting source data",
          "Company Management \u2013 Validates department and designation against org structure",
          "Payroll \u2013 Cross-checks salary budget against compensation structures",
          "Reports \u2013 Supplies requisition metrics for workforce planning analytics",
        ],
      },
      {
        name: "Offers",
        overview: "The Offers module manages the complete offer letter lifecycle from generation through acceptance or declination. It provides configurable offer letter templates with dynamic field population, detailed salary breakdown computations, and multi-level approval workflows. The module ensures a professional and timely candidate experience while maintaining compliance with organizational compensation policies and budget constraints.",
        features: [
          "Configurable offer letter templates with dynamic placeholders and conditional clauses",
          "Automated salary breakdown computation with CTC structure, allowances, and deductions",
          "Multi-level offer approval workflow with compensation committee review integration",
          "Digital offer letter delivery with e-signature support and acceptance tracking",
          "Offer revision management with version history and change tracking",
          "Counter-offer processing with approval chain for compensation adjustments",
          "Offer expiry management with automated reminders and deadline enforcement",
          "Bulk offer generation for campus hiring and high-volume recruitment drives",
        ],
        roles: [
          ["Recruitment Manager", "Offer creation; template selection; approval initiation"],
          ["HR Manager", "Compensation review; policy compliance check; final authorization"],
          ["Finance Manager", "Budget validation; salary structure verification; CTC approval"],
          ["Candidate", "Offer viewing; e-signature; acceptance/declination response"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["candidateId", "UUID (FK)", "Linked candidate", "Required"],
          ["jobPostingId", "UUID (FK)", "Position offered", "Required"],
          ["ctcAmount", "Decimal", "Total CTC offered", "Required"],
          ["salaryBreakdown", "JSON", "Component details", "Computed"],
          ["status", "Enum", "draft/sent/accepted/declined/revoked", "Default: draft"],
          ["templateId", "UUID (FK)", "Letter template", "Required"],
          ["offerExpiryDate", "DateTime", "Acceptance deadline", "Required"],
          ["eSignatureId", "String", "Digital signature ref", "Nullable"],
          ["version", "Int", "Offer revision no.", "Default: 1"],
        ],
        screens: [
          ["Offer Dashboard", "Pipeline view with status tracking and pending actions"],
          ["Create Offer", "Template selection, salary computation, and preview"],
          ["Salary Breakdown", "Interactive CTC calculator with component allocation"],
          ["Approval Chain", "Visual workflow with approver actions and status tracking"],
          ["Offer Letter Preview", "Document preview with dynamic field rendering"],
          ["Acceptance Tracker", "Real-time status with e-signature verification"],
        ],
        integrations: [
          "Recruitment \u2013 Receives selected candidate data and position details",
          "Salary Structures \u2013 Pulls CTC templates and component definitions",
          "Requisitions \u2013 Validates offer against approved budget and headcount",
          "Onboarding \u2013 Triggers pre-boarding workflow upon offer acceptance",
          "Payroll \u2013 Feeds accepted salary structure for payroll setup"],
      },
      {
        name: "Job Portal",
        overview: "The Job Portal module provides a public-facing career site that showcases open positions and enables candidates to apply seamlessly. It serves as the organization\u2019s external recruitment brand, offering an intuitive application experience with AI-powered job matching. The module handles the complete candidate-facing journey from job discovery through application submission and status tracking.",
        features: [
          "Public career site with branded design, company culture showcase, and employee testimonials",
          "Job listing page with advanced search, category filters, and location-based browsing",
          "Candidate self-service portal for application tracking and status updates",
          "AI-powered job recommendation engine matching candidate profiles to open positions",
          "Resume parsing with auto-populated application forms and skill extraction",
          "Social sharing integration with referral tracking and bonus management",
          "Mobile-responsive design ensuring optimal experience across all devices",
          "SEO-optimized job pages with structured data markup for search engine visibility",
        ],
        roles: [
          ["Candidate", "Job browsing; application submission; status tracking; profile management"],
          ["Recruiter", "Application review; candidate communication; portal content management"],
          ["HR Manager", "Portal configuration; branding settings; analytics review"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["jobPostingId", "UUID (FK)", "Linked job", "Required"],
          ["candidateId", "UUID (FK)", "Applicant", "Required"],
          ["applicationDate", "DateTime", "Submission time", "Auto"],
          ["resumeUrl", "String", "Uploaded resume", "Optional"],
          ["coverLetter", "Text", "Cover note", "Optional"],
          ["referralCode", "String", "Referral source", "Nullable"],
          ["status", "Enum", "submitted/under_review/shortlisted/rejected", "Default: submitted"],
        ],
        screens: [
          ["Career Home", "Public landing page with featured jobs and company highlights"],
          ["Job Listings", "Searchable job board with filters and sorting options"],
          ["Job Detail", "Full job description with requirements, benefits, and apply button"],
          ["Application Form", "Multi-step application with resume upload and custom questions"],
          ["Candidate Portal", "Application status dashboard with communication history"],
        ],
        integrations: [
          "Recruitment \u2013 Feeds applications directly into the candidate pipeline",
          "Requisitions \u2013 Displays only approved and open positions",
          "AI Interview \u2013 Enables AI screening links for portal applicants"],
      },
      {
        name: "AI Interview",
        overview: "The AI Interview module leverages artificial intelligence to conduct automated screening and assessment interviews for candidates. It uses natural language processing and computer vision to evaluate responses, analyze communication skills, and generate objective scoring. The module significantly reduces time-to-hire by automating initial screening while maintaining assessment quality and fairness through configurable evaluation rubrics.",
        features: [
          "AI-conducted video and text-based interviews with configurable question sets",
          "Automated speech analysis evaluating communication clarity, vocabulary, and confidence",
          "Facial expression and body language assessment with bias mitigation algorithms",
          "Customizable interview templates by role with competency-based question mapping",
          "Real-time interview scoring with detailed rubric breakdown and percentile ranking",
          "Plagiarism and AI-content detection for take-home assessments and written responses",
          "Automated feedback generation with strengths, areas for improvement, and hiring recommendation",
          "Interview recording and playback with timestamped annotations for reviewer reference",
        ],
        roles: [
          ["Recruitment Manager", "Interview template config; scoring thresholds; analytics review"],
          ["Recruiter", "Interview scheduling; candidate invitation; result review"],
          ["Candidate", "Interview participation; practice mode; result viewing"],
          ["Interviewer", "AI result review; override scoring; add manual feedback"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["candidateId", "UUID (FK)", "Interviewee", "Required"],
          ["jobPostingId", "UUID (FK)", "Target position", "Required"],
          ["templateId", "UUID (FK)", "Interview template", "Required"],
          ["mode", "Enum", "video/text/hybrid", "Default: video"],
          ["overallScore", "Float", "Aggregate score", "Computed"],
          ["skillScores", "JSON", "Per-skill breakdown", "Computed"],
          ["recordingUrl", "String", "Video recording path", "Nullable"],
          ["feedback", "Text", "AI-generated feedback", "Computed"],
          ["status", "Enum", "scheduled/in_progress/completed/reviewed", "Default: scheduled"],
        ],
        screens: [
          ["Interview Dashboard", "Overview of scheduled, completed, and pending interviews"],
          ["Template Builder", "Question set creation with competency mapping and rubric config"],
          ["Interview Session", "Live AI interview interface with video/text interaction"],
          ["Scoring Report", "Detailed scorecard with skill breakdown and AI feedback"],
          ["Recording Review", "Video playback with timestamped annotations and reviewer notes"],
          ["Analytics", "Interview completion rates, score distributions, and bias audits"],
        ],
        integrations: [
          "Recruitment \u2013 Receives candidate data and triggers interview scheduling",
          "AI Admin Console \u2013 Sources interview models, prompts, and safety guardrails",
          "Job Portal \u2013 Enables AI interview links for portal applicants",
          "Offers \u2013 Provides interview scores as input for candidate selection decisions",
        ],
      },
    ],
  },
  {
    name: "Lifecycle",
    modules: [
      {
        name: "Preboarding",
        overview: "The Preboarding module manages the critical period between offer acceptance and the employee\u2019s first day, ensuring new hires are engaged, informed, and prepared before they arrive. It provides a structured portal for document collection, policy acknowledgment, and task completion. The module reduces day-one friction by ensuring all prerequisites are fulfilled before onboarding begins.",
        features: [
          "Automated pre-boarding task generation based on role, department, and location",
          "New hire portal with personalized welcome experience and company introduction",
          "Document collection workflow with secure upload, verification, and expiry tracking",
          "Policy and handbook acknowledgment with digital signature and audit trail",
          "IT and workspace provisioning requests triggered automatically upon task completion",
          "Buddy and mentor assignment with introduction communication and icebreaker activities",
          "Pre-boarding progress tracking with manager visibility and escalation for delays",
          "Integration with background verification services with status tracking and alerts",
        ],
        roles: [
          ["HR Manager", "Task template config; progress monitoring; escalation management"],
          ["Recruiter", "Pre-boarding initiation; candidate communication; document verification"],
          ["New Hire", "Portal access; document upload; policy acknowledgment; task completion"],
          ["IT Administrator", "Provisioning request receipt; asset allocation; account creation"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "New hire", "Required"],
          ["taskList", "JSON[]", "Pre-boarding tasks", "Template-derived"],
          ["documentsRequired", "JSON[]", "Required documents", "Config-based"],
          ["completedDocuments", "JSON[]", "Uploaded docs", "Progressively filled"],
          ["policyAcknowledgments", "JSON[]", "Signed policies", "Progressively filled"],
          ["status", "Enum", "pending/in_progress/completed", "Default: pending"],
          ["startDate", "DateTime", "Joining date", "Required"],
        ],
        screens: [
          ["Pre-boarding Dashboard", "HR view of all incoming hires with progress indicators"],
          ["New Hire Portal", "Personalized welcome page with task list and document upload"],
          ["Document Center", "Secure upload interface with verification status and reminders"],
          ["Policy Acknowledgment", "Policy documents with e-signature capture and tracking"],
          ["Task Tracker", "Visual progress bar with individual task status and deadlines"],
        ],
        integrations: [
          "Offers \u2013 Receives accepted offer data and triggers pre-boarding initiation",
          "Onboarding \u2013 Hands off completed pre-boarding data for day-one setup",
          "Documents \u2013 Stores collected documents in the document management system",
          "Assets \u2013 Triggers IT provisioning and asset allocation requests",
          "Employees \u2013 Creates provisional employee record upon pre-boarding start"],
      },
      {
        name: "Onboarding",
        overview: "The Onboarding module ensures a smooth and comprehensive integration of new employees into the organization from their first day onward. It provides structured checklists, induction program management, and task assignments that guide new hires through their initial period. The module promotes early engagement and productivity by delivering a consistent, high-quality onboarding experience across the organization.",
        features: [
          "Configurable onboarding checklists with department-specific and role-specific task templates",
          "Induction program scheduling with session management and trainer assignment",
          "Automated task assignment with deadline tracking and escalation for overdue items",
          "New hire feedback collection at 30/60/90 day intervals with sentiment analysis",
          "Mentor and buddy management with pairing algorithms and engagement tracking",
          "Team introduction automation with welcome messages and org chart orientation",
          "Training assignment integration for mandatory compliance and orientation courses",
          "Onboarding analytics measuring time-to-productivity, completion rates, and satisfaction scores",
        ],
        roles: [
          ["HR Manager", "Checklist template config; program oversight; analytics review"],
          ["Department Manager", "Department-specific task creation; mentor assignment; progress review"],
          ["New Hire", "Task completion; feedback submission; training access"],
          ["Mentor/Buddy", "New hire guidance; check-in scheduling; feedback provision"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "New hire", "Required"],
          ["checklistId", "UUID (FK)", "Applied checklist", "Required"],
          ["tasks", "JSON[]", "Onboarding tasks", "Template-derived"],
          ["mentorId", "UUID (FK)", "Assigned mentor", "Nullable"],
          ["buddyId", "UUID (FK)", "Assigned buddy", "Nullable"],
          ["progress", "Float", "Completion percentage", "Computed"],
          ["feedbackDates", "JSON[]", "30/60/90 day dates", "Auto-calculated"],
          ["status", "Enum", "in_progress/completed/extended", "Default: in_progress"],
        ],
        screens: [
          ["Onboarding Dashboard", "HR overview of all active onboarding with completion metrics"],
          ["Checklist Manager", "Template creation and management with drag-and-drop ordering"],
          ["Induction Schedule", "Session calendar with trainer assignment and attendance tracking"],
          ["New Hire Portal", "Personalized task list with progress tracking and resource links"],
          ["Feedback Center", "30/60/90 day feedback forms with sentiment analysis"],
          ["Analytics", "Time-to-productivity, completion rates, and satisfaction trends"],
        ],
        integrations: [
          "Preboarding \u2013 Receives completed pre-boarding data and documents",
          "Training \u2013 Assigns mandatory orientation and compliance courses",
          "Employees \u2013 Updates employee status and activates full profile",
          "Assets \u2013 Confirms asset allocation and tracks equipment handover",
          "Engagement \u2013 Feeds onboarding satisfaction data for eNPS calculations"],
      },
      {
        name: "Attendance",
        overview: "The Attendance module provides comprehensive time tracking capabilities including check-in/out management, shift scheduling, and attendance regularization. It supports multiple capture methods from biometric devices to mobile GPS check-ins, ensuring accurate time records across diverse work environments. The module integrates with payroll for precise compensation calculations and compliance reporting.",
        features: [
          "Multiple check-in/out methods including biometric, mobile GPS, web, and QR code",
          "Shift management with rotating schedules, flexible timings, and shift swap requests",
          "Attendance regularization workflow for missed punches and exception handling",
          "Late arrival and early departure tracking with configurable tolerance and auto-deduction rules",
          "Overtime calculation with multi-tier rates and approval workflows",
          "Real-time attendance dashboard with team presence indicators and anomaly alerts",
          "Geo-fencing for mobile check-ins with configurable radius and location validation",
          "Integration with biometric and access control hardware for automated punch capture",
        ],
        roles: [
          ["HR Manager", "Attendance policy config; regularization approval; compliance reporting"],
          ["Department Manager", "Team attendance view; regularization approval; shift management"],
          ["Employee", "Check-in/out; regularization request; attendance history view"],
          ["Payroll Admin", "Attendance data export; overtime calculation; deduction mapping"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Employee record", "Required"],
          ["date", "DateTime", "Attendance date", "Required"],
          ["checkIn", "DateTime", "Check-in time", "Nullable"],
          ["checkOut", "DateTime", "Check-out time", "Nullable"],
          ["shiftId", "UUID (FK)", "Applied shift", "Required"],
          ["status", "Enum", "present/absent/half-day/holiday/leave", "Default: present"],
          ["regularized", "Boolean", "Regularization flag", "Default: false"],
          ["overtimeMinutes", "Int", "OT duration", "Default: 0"],
          ["source", "Enum", "biometric/mobile/web/qr", "Required"],
        ],
        screens: [
          ["Attendance Dashboard", "Real-time presence overview with team status indicators"],
          ["Check-in/out", "Time capture interface with GPS/biometric integration"],
          ["Shift Management", "Shift scheduling with rotation patterns and assignment"],
          ["Regularization Queue", "Pending requests with approval workflow and comments"],
          ["Attendance Reports", "Daily/monthly summaries with exception and trend analysis"],
          ["Overtime Tracker", "OT hours with approval status and payroll integration"],
        ],
        integrations: [
          "Leave Management \u2013 Cross-references leave approvals for attendance marking",
          "Payroll \u2013 Supplies attendance days, overtime, and deductions for salary processing",
          "Company Management \u2013 Receives shift definitions and holiday calendars",
          "Timesheets \u2013 Validates project time entries against attendance records",
          "Reports \u2013 Feeds attendance analytics and compliance data",
        ],
      },
      {
        name: "Leave Management",
        overview: "The Leave Management module handles all aspects of employee leave administration including request processing, balance tracking, and calendar visibility. It supports multiple leave types with configurable accrual rules, carry-forward policies, and encashment options. The module ensures fair leave distribution while maintaining operational continuity through team-level availability tracking and approval workflows.",
        features: [
          "Multi-type leave management with configurable accrual, carry-forward, and encashment rules",
          "Leave request workflow with multi-level approval and delegation support",
          "Leave balance dashboard with accrual history, used days, and projected balances",
          "Team leave calendar showing department-wide availability and conflict detection",
          "Leave policy configuration by department, designation, and tenure with override rules",
          "Holiday calendar management with location-specific and cultural holiday definitions",
          "Comp-off and earned leave tracking with auto-accrual and expiry management",
          "Leave analytics with utilization trends, approval rates, and absence pattern detection",
        ],
        roles: [
          ["HR Manager", "Leave policy config; global calendar management; analytics review"],
          ["Department Manager", "Team leave approval; availability view; conflict resolution"],
          ["Employee", "Leave request; balance view; holiday calendar access"],
          ["Payroll Admin", "Leave deduction mapping; encashment processing; LOP calculation"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Employee", "Required"],
          ["leaveTypeId", "UUID (FK)", "Leave type", "Required"],
          ["startDate", "DateTime", "Leave start", "Required"],
          ["endDate", "DateTime", "Leave end", "Required"],
          ["totalDays", "Float", "Duration (incl. half)", "Computed"],
          ["status", "Enum", "pending/approved/rejected/cancelled", "Default: pending"],
          ["reason", "Text", "Leave reason", "Required"],
          ["approvedById", "UUID (FK)", "Approver", "Nullable"],
          ["balanceImpact", "JSON", "Deduction details", "Computed"],
        ],
        screens: [
          ["Leave Dashboard", "Balance overview with pending requests and upcoming leaves"],
          ["Request Form", "Leave application with date picker, type selection, and reason"],
          ["Approval Queue", "Manager view with team availability and conflict alerts"],
          ["Leave Calendar", "Team/department calendar with color-coded leave types"],
          ["Policy Configuration", "Leave type setup with accrual and carry-forward rules"],
          ["Analytics", "Utilization trends, approval rates, and absence patterns"],
        ],
        integrations: [
          "Attendance \u2013 Marks leave days in attendance records automatically",
          "Payroll \u2013 Supplies LOP days and encashment amounts for salary processing",
          "Company Management \u2013 Receives holiday calendar and leave policy definitions",
          "Dashboard \u2013 Feeds leave balance summaries and team availability data",
          "Reports \u2013 Provides leave utilization analytics and compliance metrics"],
      },
      {
        name: "Separation",
        overview: "The Separation module manages the complete employee exit process from resignation submission through clearance completion. It ensures a structured and compliant separation workflow including notice period management, knowledge transfer planning, and exit documentation. The module maintains positive offboarding experiences while protecting organizational interests through thorough clearance procedures and asset recovery.",
        features: [
          "Resignation submission and withdrawal workflow with notice period validation",
          "Multi-department clearance checklist with automated task routing and tracking",
          "Knowledge transfer planning with task assignment and completion verification",
          "Notice period management with buy-out option and early release approval workflow",
          "Exit interview scheduling with questionnaire templates and feedback aggregation",
          "Asset recovery tracking with department-wise clearance confirmation and QR scanning",
          "Automated access revocation across systems with IT integration and audit confirmation",
          "Separation analytics with attrition trends, reason analysis, and retention insights",
        ],
        roles: [
          ["HR Manager", "Separation policy config; clearance oversight; exit interview review"],
          ["Department Manager", "Clearance approval; KT planning; team transition management"],
          ["Employee", "Resignation submission; clearance task completion; exit interview"],
          ["IT Administrator", "Access revocation; asset recovery; system deprovisioning"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Separating employee", "Required"],
          ["resignationDate", "DateTime", "Submission date", "Auto"],
          ["lastWorkingDate", "DateTime", "Final day", "Computed"],
          ["noticePeriodDays", "Int", "Notice duration", "From policy"],
          ["reason", "Text", "Separation reason", "Required"],
          ["clearanceStatus", "JSON", "Dept-wise clearance", "Progressively filled"],
          ["exitInterviewId", "UUID (FK)", "Interview record", "Nullable"],
          ["status", "Enum", "submitted/notice_period/clearance/completed", "Default: submitted"],
        ],
        screens: [
          ["Separation Dashboard", "Overview of active separations with clearance progress"],
          ["Resignation Form", "Employee submission with notice period calculation"],
          ["Clearance Tracker", "Department-wise clearance status with approval actions"],
          ["Knowledge Transfer", "KT task assignment with progress tracking"],
          ["Exit Interview", "Questionnaire with response capture and analytics"],
          ["Analytics", "Attrition trends, reason breakdown, and retention indicators"],
        ],
        integrations: [
          "FNF Settlement \u2013 Triggers full and final settlement calculation upon separation",
          "Assets \u2013 Initiates asset recovery and clearance confirmation",
          "Attendance \u2013 Adjusts attendance records for notice period",
          "Leave Management \u2013 Calculates leave encashment for unused balance",
          "Employees \u2013 Updates employee status to inactive upon completion",
          "Payroll \u2013 Processes final salary adjustments and recovery items"],
      },
      {
        name: "FNF Settlement",
        overview: "The FNF (Full & Final) Settlement module handles the financial closure process for departing employees, ensuring accurate computation of all dues and recoveries. It automates complex calculations involving unpaid salary, leave encashment, gratuity, bonus pro-rata, and various deductions. The module ensures compliance with statutory requirements while providing transparent settlement statements to both HR and the departing employee.",
        features: [
          "Automated FNF computation with salary arrears, leave encashment, and gratuity calculations",
          "Recovery management for notice period shortfalls, asset deductions, and advance adjustments",
          "Statutory compliance checks for PF, ESI, TDS, and professional tax on settlement amounts",
          "Gratuity calculation as per Payment of Gratuity Act with custom organization formulas",
          "Leave encashment computation with type-wise rules for privileged, casual, and sick leaves",
          "Settlement approval workflow with finance review and authorization chain",
          "Payslip generation for settlement amount with detailed component-wise breakdown",
          "Settlement tracking dashboard with status monitoring and deadline enforcement",
        ],
        roles: [
          ["HR Manager", "FNF initiation; component verification; approval workflow oversight"],
          ["Finance Manager", "Settlement review; statutory compliance check; final authorization"],
          ["Employee", "Settlement statement view; acknowledgment; dispute raising"],
          ["Payroll Admin", "Computation execution; payslip generation; payment processing"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Departing employee", "Required"],
          ["separationId", "UUID (FK)", "Linked separation", "Required"],
          ["lastWorkingDate", "DateTime", "Final working day", "Required"],
          ["earnings", "JSON", "Component-wise earnings", "Computed"],
          ["deductions", "JSON", "Component-wise deductions", "Computed"],
          ["netPayable", "Decimal", "Final amount", "Computed"],
          ["gratuityAmount", "Decimal", "Gratuity component", "Computed"],
          ["leaveEncashment", "Decimal", "Leave encashment", "Computed"],
          ["status", "Enum", "computed/pending_approval/approved/paid", "Default: computed"],
        ],
        screens: [
          ["FNF Dashboard", "Settlement pipeline with status tracking and pending actions"],
          ["Settlement Calculator", "Interactive computation with component adjustments"],
          ["Earnings & Deductions", "Detailed breakdown with statutory compliance view"],
          ["Approval Workflow", "Multi-level authorization with comment and revision support"],
          ["Settlement Payslip", "Final statement PDF generation with component details"],
          ["Compliance Check", "Statutory validation with PF, ESI, TDS verification"],
        ],
        integrations: [
          "Separation \u2013 Receives separation data and triggers FNF computation",
          "Payroll \u2013 Sources salary structure and processes final payment",
          "Leave Management \u2013 Receives leave balance for encashment calculation",
          "Salary Structures \u2013 Pulls CTC components for earnings computation",
          "Assets \u2013 Receives asset recovery deductions for settlement adjustment"],
      },
    ],
  },
  {
    name: "Compensation",
    modules: [
      {
        name: "Payroll",
        overview: "The Payroll module is the core compensation processing engine of NEXUS HRMS, handling salary computation, statutory compliance, and payment disbursement with precision and reliability. It automates complex payroll calculations across multiple tax regimes, deduction rules, and benefit structures. The module ensures timely and accurate salary processing while maintaining complete audit trails for compliance and dispute resolution.",
        features: [
          "Automated monthly payroll processing with configurable run schedules and lock dates",
          "Multi-country statutory compliance including PF, ESI, TDS, PT, and LWF for India",
          "Payslip generation with detailed component breakdown and digital delivery",
          "Tax computation with regime selection, declaration management, and investment proof tracking",
          "Loan and advance management with EMI deduction scheduling and balance tracking",
          "Reimbursement processing with medical, LTA, and flexible benefit component handling",
          "Payroll audit trail with change tracking, approval history, and reversal capabilities",
          "Bank file generation in multiple formats for automated salary credit processing",
        ],
        roles: [
          ["Payroll Administrator", "Payroll processing; statutory filing; bank file generation"],
          ["HR Manager", "Payroll review; salary structure validation; report access"],
          ["Finance Manager", "Compliance oversight; tax filing; budget analysis"],
          ["Employee", "Payslip viewing; tax declaration; investment proof upload"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Employee", "Required"],
          ["month", "Int", "Payroll month", "1-12"],
          ["year", "Int", "Payroll year", "Required"],
          ["grossEarnings", "Decimal", "Total earnings", "Computed"],
          ["totalDeductions", "Decimal", "Total deductions", "Computed"],
          ["netPay", "Decimal", "Take-home amount", "Computed"],
          ["status", "Enum", "draft/processed/approved/paid", "Default: draft"],
          ["bankFileRef", "String", "Bank payment ref", "Nullable"],
          ["processedAt", "DateTime", "Processing time", "Auto"],
        ],
        screens: [
          ["Payroll Dashboard", "Processing status overview with month-wise summaries"],
          ["Payroll Run", "Month selection, validation, and processing initiation"],
          ["Payslip Viewer", "Detailed payslip with earnings, deductions, and net pay"],
          ["Tax Declaration", "Regime selection, investment declaration, and proof upload"],
          ["Statutory Reports", "PF, ESI, TDS, and PT reports with e-filing integration"],
          ["Bank File Generation", "Format selection and automated file creation for banks"],
        ],
        integrations: [
          "Salary Structures \u2013 Pulls CTC components and deduction rules",
          "Attendance \u2013 Receives present days, LOP, and overtime data",
          "Leave Management \u2013 Gets LOP days and leave encashment amounts",
          "FNF Settlement \u2013 Provides salary data for final settlement computation",
          "Expenses \u2013 Processes approved reimbursements in payroll run",
          "Reports \u2013 Feeds payroll analytics, cost distribution, and compliance data"],
      },
      {
        name: "Salary Structures",
        overview: "The Salary Structures module manages the definition and administration of compensation frameworks including CTC breakdowns, salary components, and reusable templates. It provides flexible configuration for earnings, deductions, and allowances that adapt to organizational policies and statutory requirements. The module ensures consistency and compliance in compensation management across the organization.",
        features: [
          "CTC breakdown builder with configurable earnings, deductions, and allowance components",
          "Salary component library with formula-based calculations and conditional applicability",
          "Template-based salary structure creation for quick employee assignment and bulk operations",
          "Tax optimization engine with regime comparison and take-home maximization suggestions",
          "Salary revision management with effective date tracking and arrears computation",
          "Minimum wage compliance checking with state-wise threshold validation and alerts",
          "Gratuity provisioning calculator with monthly accrual and fund estimation",
          "Component-wise impact analysis for salary structure changes across employee populations",
        ],
        roles: [
          ["Payroll Administrator", "Structure creation; component config; template management"],
          ["HR Manager", "Salary revision approval; policy compliance; structure assignment"],
          ["Finance Manager", "Cost impact analysis; budget validation; statutory compliance"],
          ["Employee", "Salary structure view; take-home calculator; regime comparison"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["name", "String", "Structure name", "Required"],
          ["companyId", "UUID (FK)", "Applicable company", "Required"],
          ["ctcAmount", "Decimal", "Total CTC", "Required"],
          ["components", "JSON[]", "Breakdown details", "Required"],
          ["templateId", "UUID (FK)", "Source template", "Nullable"],
          ["applicableFrom", "DateTime", "Effective date", "Required"],
          ["status", "Enum", "draft/active/archived", "Default: draft"],
          ["employeeCount", "Int", "Assigned employees", "Computed"],
        ],
        screens: [
          ["Structure Builder", "CTC breakdown editor with drag-and-drop component arrangement"],
          ["Component Library", "Reusable component definitions with formula and condition setup"],
          ["Template Manager", "CRUD for salary templates with preview and employee assignment"],
          ["Tax Optimizer", "Regime comparison with take-home projections and suggestions"],
          ["Revision Manager", "Salary change processing with arrears computation"],
          ["Compliance Checker", "Statutory validation with minimum wage and PF threshold checks"],
        ],
        integrations: [
          "Payroll \u2013 Supplies CTC components and deduction rules for processing",
          "Offers \u2013 Provides salary breakdown templates for offer letter generation",
          "FNF Settlement \u2013 Shares component definitions for settlement computation",
          "Employees \u2013 Links salary structures to employee records",
          "Reports \u2013 Feeds compensation analytics and cost distribution data"],
      },
    ],
  },
  {
    name: "Growth",
    modules: [
      {
        name: "Performance",
        overview: "The Performance module provides a comprehensive framework for managing employee performance reviews, goal setting, and continuous feedback cycles. It supports multiple review methodologies including annual appraisals, quarterly check-ins, and 360-degree feedback. The module drives a culture of high performance by enabling transparent goal alignment, real-time feedback, and data-driven talent decisions.",
        features: [
          "Configurable review cycles with custom timelines, rating scales, and participant groups",
          "Goal setting and tracking with OKR/KPI alignment and cascading organizational objectives",
          "360-degree feedback collection with peer, manager, and subordinate evaluation channels",
          "Continuous feedback mechanism with real-time praise, coaching notes, and improvement suggestions",
          "Performance calibration sessions with forced distribution and bell curve normalization tools",
          "AI-powered performance insights identifying trends, biases, and development opportunities",
          "Review form builder with custom sections, competency libraries, and weighted scoring",
          "Performance improvement plan (PIP) management with milestone tracking and outcome recording",
        ],
        roles: [
          ["HR Director", "Review cycle config; calibration oversight; analytics and trends"],
          ["HR Manager", "Review coordination; form design; PIP management"],
          ["Manager", "Goal assignment; review completion; feedback provision; calibration participation"],
          ["Employee", "Self-assessment; goal tracking; peer feedback; review view"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["cycleId", "UUID (FK)", "Review cycle", "Required"],
          ["employeeId", "UUID (FK)", "Reviewee", "Required"],
          ["reviewerId", "UUID (FK)", "Primary reviewer", "Required"],
          ["goals", "JSON[]", "Assigned goals", "Array"],
          ["selfRating", "Float", "Self-assessment score", "Nullable"],
          ["managerRating", "Float", "Manager rating", "Nullable"],
          ["finalRating", "Float", "Calibrated score", "Computed"],
          ["feedback", "JSON[]", "360 feedback items", "Array"],
          ["status", "Enum", "goal_setting/self_review/manager_review/calibration/closed", "Default: goal_setting"],
        ],
        screens: [
          ["Performance Dashboard", "Cycle overview with completion rates and rating distribution"],
          ["Review Cycle Config", "Timeline, participants, and form builder setup"],
          ["Goal Tracker", "Individual and team goal progress with OKR alignment"],
          ["Review Form", "Multi-section evaluation with competency ratings and comments"],
          ["Calibration Tool", "Rating distribution visualization with adjustment controls"],
          ["360 Feedback", "Multi-rater feedback collection and aggregation view"],
        ],
        integrations: [
          "Succession Planning \u2013 Feeds performance data for talent pipeline and nine-box grid",
          "Training \u2013 Triggers training recommendations based on skill gaps and development needs",
          "Salary Structures \u2013 Provides performance ratings for increment and bonus calculations",
          "Engagement \u2013 Correlates performance data with engagement scores for insights",
          "Reports \u2013 Supplies performance analytics and talent metrics to reporting engine"],
      },
      {
        name: "Training",
        overview: "The Training module manages the complete learning and development lifecycle from course creation through certification tracking. It provides a comprehensive learning management system with course libraries, learning paths, and skill development tracking. The module supports organizational capability building through targeted training programs aligned with business objectives and individual development plans.",
        features: [
          "Course creation and management with multimedia content support and SCORM compatibility",
          "Learning path builder with sequential course mapping, prerequisites, and completion rules",
          "Certification management with expiry tracking, renewal reminders, and compliance reporting",
          "AI-powered course recommendations based on role, skill gaps, and career aspirations",
          "Training calendar with instructor-led session scheduling, capacity management, and waitlists",
          "Assessment engine with quiz creation, question banks, automated grading, and proctoring",
          "Training effectiveness measurement with pre/post assessments and ROI calculation",
          "External training tracking with vendor management, cost allocation, and feedback collection",
        ],
        roles: [
          ["L&D Manager", "Course creation; learning path design; certification config; analytics"],
          ["HR Manager", "Training assignment; compliance tracking; budget oversight"],
          ["Manager", "Team training needs; nomination approval; skill gap review"],
          ["Employee", "Course enrollment; learning progress; certification view; feedback"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["title", "String", "Course title", "Required"],
          ["description", "Text", "Course description", "Required"],
          ["type", "Enum", "elearning/classroom/blended/external", "Required"],
          ["duration", "Int", "Duration (minutes)", "Required"],
          ["learningPathId", "UUID (FK)", "Parent path", "Nullable"],
          ["skills", "String[]", "Target skills", "Array"],
          ["certificationId", "UUID (FK)", "Linked cert", "Nullable"],
          ["enrollmentCount", "Int", "Active enrollments", "Computed"],
          ["averageRating", "Float", "Learner rating", "Computed"],
        ],
        screens: [
          ["Course Library", "Searchable catalog with filters, ratings, and enrollment actions"],
          ["Learning Paths", "Visual path builder with course sequencing and progress tracking"],
          ["Course Player", "Interactive learning interface with content navigation and note-taking"],
          ["Assessment Center", "Quiz creation, attempt tracking, and result analytics"],
          ["Certification Tracker", "Cert status, expiry dates, and renewal management"],
          ["Training Analytics", "Completion rates, effectiveness scores, and ROI metrics"],
        ],
        integrations: [
          "Performance \u2013 Receives skill gap data for training recommendation engine",
          "Onboarding \u2013 Assigns mandatory orientation and compliance courses",
          "Succession Planning \u2013 Provides development data for talent readiness assessment",
          "Employees \u2013 Updates employee skill profiles upon course completion",
          "Reports \u2013 Feeds training analytics and compliance metrics"],
      },
      {
        name: "Engagement",
        overview: "The Engagement module measures and enhances employee engagement through surveys, pulse checks, and eNPS tracking. It provides actionable insights into workforce sentiment, satisfaction drivers, and areas requiring intervention. The module enables HR teams to move beyond periodic surveys to continuous listening, fostering a culture of feedback and responsive organizational improvement.",
        features: [
          "Customizable survey builder with multiple question types, logic branching, and branding",
          "Pulse check engine for frequent, lightweight sentiment measurement with trend tracking",
          "eNPS (Employee Net Promoter Score) calculation with benchmarking and trend analysis",
          "AI-powered sentiment analysis for open-ended responses with theme extraction",
          "Anonymous feedback channels ensuring psychological safety and candid responses",
          "Survey scheduling with automated distribution, reminders, and escalation for low response rates",
          "Action planning tools linking survey insights to initiative tracking and outcome measurement",
          "Manager dashboards with team-level engagement scores and comparison benchmarks",
        ],
        roles: [
          ["HR Director", "Survey strategy; eNPS benchmarking; organization-wide insights"],
          ["HR Manager", "Survey creation; distribution management; action planning"],
          ["Manager", "Team engagement dashboard; action item tracking; pulse check review"],
          ["Employee", "Survey participation; feedback submission; results viewing"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["title", "String", "Survey title", "Required"],
          ["type", "Enum", "survey/pulse/enps/feedback", "Required"],
          ["questions", "JSON[]", "Question set", "Array"],
          ["responses", "JSON[]", "Response data", "Progressively filled"],
          ["enpsScore", "Float", "eNPS value", "Computed"],
          ["responseRate", "Float", "Participation rate", "Computed"],
          ["scheduledDate", "DateTime", "Distribution date", "Required"],
          ["status", "Enum", "draft/active/closed/analyzed", "Default: draft"],
          ["anonymityLevel", "Enum", "anonymous/partial/identified", "Default: anonymous"],
        ],
        screens: [
          ["Survey Builder", "Drag-and-drop question designer with preview and logic setup"],
          ["Pulse Check Dashboard", "Real-time sentiment trends with comparison benchmarks"],
          ["eNPS Tracker", "Score tracking over time with promoter/detractor breakdown"],
          ["Response Analytics", "Interactive charts with filtering, cross-tab, and drill-down"],
          ["Action Planning", "Insight-to-action workflow with task assignment and tracking"],
          ["Manager Dashboard", "Team-level engagement scores with trend and comparison views"],
        ],
        integrations: [
          "AI Admin Console \u2013 Powers sentiment analysis and theme extraction for responses",
          "Performance \u2013 Correlates engagement scores with performance ratings for insights",
          "Onboarding \u2013 Captures new hire engagement at 30/60/90 day intervals",
          "Reports \u2013 Feeds engagement analytics and benchmark data to reporting engine",
          "Dashboard \u2013 Displays engagement scores and trends on HR dashboard"],
      },
      {
        name: "Succession Planning",
        overview: "The Succession Planning module enables organizations to identify, develop, and prepare internal talent for critical leadership and key position transitions. It provides visual talent pipeline management, nine-box grid assessments, and readiness tracking for potential successors. The module ensures business continuity by proactively building leadership depth and reducing key-person dependency risks.",
        features: [
          "Nine-box grid assessment mapping performance against potential with visual categorization",
          "Talent pipeline management with position-based succession depth and readiness levels",
          "Successor identification with multi-candidate ranking and development gap analysis",
          "Development plan builder with targeted actions, timelines, and progress tracking",
          "Readiness assessment tracking with time-to-ready estimates and milestone monitoring",
          "Critical position flagging with risk scoring and vacancy impact analysis",
          "Leadership bench strength analytics with diversity tracking and gap identification",
          "Scenario planning for organizational changes with succession impact simulation",
        ],
        roles: [
          ["HR Director", "Succession strategy; nine-box calibration; pipeline oversight"],
          ["HR Manager", "Successor identification; development plan creation; readiness tracking"],
          ["Senior Manager", "Team talent assessment; succession recommendations; development mentoring"],
          ["Employee", "Development plan view; career aspiration submission; readiness self-assessment"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["positionId", "UUID (FK)", "Critical position", "Required"],
          ["successorId", "UUID (FK)", "Potential successor", "Required"],
          ["readinessLevel", "Enum", "ready/1-2years/3-5years/long-term", "Assessed"],
          ["nineBoxCategory", "Enum", "9 grid positions", "Assessed"],
          ["developmentPlan", "JSON[]", "Growth actions", "Array"],
          ["riskScore", "Float", "Vacancy risk", "Computed"],
          ["lastAssessmentDate", "DateTime", "Recent assessment", "Auto"],
          ["status", "Enum", "identified/developing/ready/backed-up", "Default: identified"],
        ],
        screens: [
          ["Succession Dashboard", "Pipeline overview with position risk scores and bench depth"],
          ["Nine-Box Grid", "Interactive matrix with employee placement and category filtering"],
          ["Talent Pipeline", "Position-wise successor depth with readiness indicators"],
          ["Development Plans", "Action items with timelines, mentors, and progress tracking"],
          ["Critical Positions", "High-risk role flagging with vacancy impact analysis"],
          ["Analytics", "Bench strength, diversity metrics, and succession readiness trends"],
        ],
        integrations: [
          "Performance \u2013 Receives performance ratings and review data for nine-box assessment",
          "Training \u2013 Triggers development courses for successors with skill gaps",
          "Employees \u2013 Provides employee data for talent pool and successor identification",
          "Reports \u2013 Feeds succession analytics and bench strength metrics"],
      },
    ],
  },
  {
    name: "Operations",
    modules: [
      {
        name: "Projects",
        overview: "The Projects module provides comprehensive project management capabilities with Kanban boards, milestone tracking, and resource allocation tools. It enables organizations to manage internal and client projects with full visibility into timelines, budgets, and team utilization. The module supports agile and waterfall methodologies, adapting to diverse project management needs across the organization.",
        features: [
          "Kanban board with customizable columns, swim lanes, and drag-and-drop task management",
          "Milestone tracking with Gantt chart visualization and critical path analysis",
          "Resource allocation with capacity planning, utilization tracking, and conflict detection",
          "Project budgeting with cost tracking, variance analysis, and billing integration",
          "Sprint management for agile teams with backlog grooming and velocity tracking",
          "Project document repository with version control and access permissions",
          "Client project portal with status visibility, deliverable tracking, and communication",
          "Project analytics with burndown charts, resource utilization, and profitability metrics",
        ],
        roles: [
          ["Project Manager", "Project creation; task assignment; milestone management; budget oversight"],
          ["Team Lead", "Sprint planning; task management; team allocation; progress reporting"],
          ["Team Member", "Task execution; time logging; status updates; document upload"],
          ["Client", "Portal access; status view; deliverable review; communication"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["name", "String", "Project name", "Required"],
          ["clientId", "UUID (FK)", "Client (if external)", "Nullable"],
          ["startDate", "DateTime", "Project start", "Required"],
          ["endDate", "DateTime", "Target end", "Required"],
          ["budget", "Decimal", "Approved budget", "Optional"],
          ["status", "Enum", "planning/active/on-hold/completed/cancelled", "Default: planning"],
          ["methodology", "Enum", "agile/waterfall/hybrid", "Default: agile"],
          ["milestones", "JSON[]", "Key milestones", "Array"],
          ["teamMembers", "JSON[]", "Assigned resources", "Array"],
        ],
        screens: [
          ["Project Dashboard", "Portfolio overview with status indicators and budget tracking"],
          ["Kanban Board", "Visual task management with WIP limits and swim lanes"],
          ["Gantt Chart", "Timeline view with milestones, dependencies, and critical path"],
          ["Resource Planner", "Capacity view with allocation heatmap and conflict alerts"],
          ["Sprint Board", "Agile sprint management with backlog and velocity chart"],
          ["Project Analytics", "Burndown, utilization, profitability, and variance reports"],
        ],
        integrations: [
          "Timesheets \u2013 Receives time entries for project cost and utilization tracking",
          "Clients \u2013 Links external projects to client records and SLA tracking",
          "Expenses \u2013 Tracks project-related expenses against allocated budgets",
          "Employees \u2013 Provides team member data for resource allocation and capacity planning",
          "Reports \u2013 Feeds project analytics and resource utilization data"],
      },
      {
        name: "Timesheets",
        overview: "The Timesheets module provides accurate time tracking for project work, operational activities, and administrative tasks. It enables employees to log their daily activities with project and task-level granularity while providing managers with visibility into time utilization. The module bridges project management and payroll by validating logged hours against attendance and project assignments.",
        features: [
          "Daily and weekly timesheet entry with project, task, and activity-level time logging",
          "Mobile time tracking with start/stop timer and offline sync capability",
          "Timesheet approval workflow with manager review, comments, and rejection handling",
          "Automated time categorization with configurable project and task type mappings",
          "Time validation against attendance records with discrepancy alerts and resolution workflow",
          "Billable vs. non-billable hour classification with utilization rate computation",
          "Timesheet templates for recurring activities with auto-population and quick-fill",
          "Time analytics with utilization trends, project cost allocation, and productivity metrics",
        ],
        roles: [
          ["Employee", "Time entry; timesheet submission; history view; timer usage"],
          ["Manager", "Team timesheet review; approval/rejection; utilization monitoring"],
          ["Project Manager", "Project time tracking; billable hour review; cost analysis"],
          ["Finance Admin", "Billable hour export; cost allocation; payroll integration"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Time logger", "Required"],
          ["projectId", "UUID (FK)", "Project", "Required"],
          ["taskId", "UUID (FK)", "Task", "Nullable"],
          ["date", "DateTime", "Entry date", "Required"],
          ["hours", "Decimal", "Hours logged", "Min: 0, Max: 24"],
          ["isBillable", "Boolean", "Billable flag", "Default: true"],
          ["description", "Text", "Activity notes", "Optional"],
          ["status", "Enum", "draft/submitted/approved/rejected", "Default: draft"],
          ["approvedById", "UUID (FK)", "Approver", "Nullable"],
        ],
        screens: [
          ["Weekly Timesheet", "Grid entry with project rows and day columns"],
          ["Time Tracker", "Start/stop timer with project and task selection"],
          ["Approval Queue", "Manager review interface with comment and action buttons"],
          ["Utilization Dashboard", "Billable vs. non-billable analysis with trend charts"],
          ["Discrepancy View", "Attendance vs. timesheet comparison with resolution actions"],
          ["Time Analytics", "Project-wise time distribution and productivity metrics"],
        ],
        integrations: [
          "Projects \u2013 Supplies time data for project cost and progress tracking",
          "Attendance \u2013 Validates logged hours against attendance check-in/out records",
          "Payroll \u2013 Feeds billable hours and overtime data for compensation calculation",
          "Expenses \u2013 Links time entries with related expense claims",
          "Reports \u2013 Provides time utilization analytics and cost allocation data"],
      },
      {
        name: "Travel",
        overview: "The Travel module manages the complete business travel lifecycle from request submission through itinerary planning to expense reconciliation. It streamlines travel authorization, booking coordination, and cost estimation while ensuring compliance with organizational travel policies. The module provides a seamless experience for traveling employees while maintaining budgetary control and policy adherence.",
        features: [
          "Travel request submission with purpose, destination, dates, and estimated costs",
          "Itinerary builder with flight, hotel, and transport arrangement tracking",
          "Cost estimation engine with policy-compliant budget calculations and advance processing",
          "Multi-level approval workflow with delegation support and policy exception handling",
          "Travel policy enforcement with automatic compliance checks and violation flagging",
          "Integration with travel booking platforms for real-time availability and preferred vendor rates",
          "Travel advance management with disbursement tracking and expense reconciliation",
          "International travel support with visa tracking, forex allocation, and per-diem calculations",
        ],
        roles: [
          ["Employee", "Travel request; itinerary view; expense submission; advance request"],
          ["Manager", "Travel approval; budget validation; policy exception authorization"],
          ["HR Manager", "Travel policy config; compliance monitoring; vendor management"],
          ["Finance Admin", "Advance processing; cost validation; reimbursement settlement"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Traveler", "Required"],
          ["purpose", "Text", "Travel purpose", "Required"],
          ["destination", "String", "Travel destination", "Required"],
          ["departureDate", "DateTime", "Outbound date", "Required"],
          ["returnDate", "DateTime", "Return date", "Required"],
          ["estimatedCost", "Decimal", "Budget estimate", "Required"],
          ["advanceAmount", "Decimal", "Advance requested", "Nullable"],
          ["status", "Enum", "draft/pending/approved/booked/completed/cancelled", "Default: draft"],
          ["itinerary", "JSON[]", "Travel segments", "Array"],
        ],
        screens: [
          ["Travel Dashboard", "Request pipeline with status tracking and upcoming trips"],
          ["Request Form", "Multi-step travel request with purpose and cost estimation"],
          ["Itinerary Builder", "Flight, hotel, and transport arrangement interface"],
          ["Approval Workflow", "Manager review with policy compliance indicators"],
          ["Advance Management", "Advance request and disbursement tracking"],
          ["Policy Configuration", "Travel policy rules, limits, and exception settings"],
        ],
        integrations: [
          "Expenses \u2013 Links travel requests to expense claims for reconciliation",
          "Projects \u2013 Attributes travel costs to project budgets for client billing",
          "Payroll \u2013 Processes travel advances and recovery deductions",
          "Vendors \u2013 Connects with travel agents and booking platforms",
          "Reports \u2013 Feeds travel cost analytics and policy compliance data"],
      },
      {
        name: "Expenses",
        overview: "The Expenses module manages employee expense claims from submission through approval to reimbursement. It provides a streamlined process for capturing, validating, and processing business expenses with receipt management and policy compliance checking. The module ensures timely reimbursement while maintaining strict adherence to organizational expense policies and budget controls.",
        features: [
          "Expense claim submission with itemized entries, receipt upload, and categorization",
          "AI-powered receipt scanning with automatic amount, date, and merchant extraction",
          "Policy compliance engine with automatic violation detection and exception routing",
          "Multi-level approval workflow with budget checking and delegation support",
          "Mileage calculation with GPS-based distance tracking and configurable rate tables",
          "Expense categorization with project, department, and cost center attribution",
          "Corporate card integration with automatic transaction import and matching",
          "Reimbursement processing with payroll integration and payment tracking",
        ],
        roles: [
          ["Employee", "Expense submission; receipt upload; claim tracking; card statement view"],
          ["Manager", "Team expense approval; budget validation; policy exception review"],
          ["Finance Admin", "Reimbursement processing; compliance audit; corporate card management"],
          ["HR Manager", "Expense policy config; limit settings; analytics review"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Claimant", "Required"],
          ["travelRequestId", "UUID (FK)", "Linked travel", "Nullable"],
          ["projectId", "UUID (FK)", "Project attribution", "Nullable"],
          ["totalAmount", "Decimal", "Claim total", "Computed"],
          ["items", "JSON[]", "Line items", "Array"],
          ["receipts", "JSON[]", "Receipt files", "Array"],
          ["status", "Enum", "draft/submitted/approved/rejected/reimbursed", "Default: draft"],
          ["approvedById", "UUID (FK)", "Approver", "Nullable"],
          ["reimbursedAt", "DateTime", "Payment date", "Nullable"],
        ],
        screens: [
          ["Expense Dashboard", "Claim pipeline with status tracking and summary metrics"],
          ["Submit Claim", "Itemized entry with receipt upload and categorization"],
          ["Receipt Scanner", "AI-powered capture with auto-fill and verification"],
          ["Approval Queue", "Manager review with policy compliance indicators"],
          ["Reimbursement Center", "Finance processing with payroll integration"],
          ["Policy Configuration", "Expense rules, limits, categories, and approval chains"],
        ],
        integrations: [
          "Travel \u2013 Links expense claims to approved travel requests",
          "Projects \u2013 Attributes expenses to project budgets and cost centers",
          "Payroll \u2013 Processes reimbursements through monthly payroll runs",
          "Vendors \u2013 Validates vendor invoices against expense claims",
          "Reports \u2013 Feeds expense analytics, policy compliance, and cost trends"],
      },
      {
        name: "Assets",
        overview: "The Assets module provides comprehensive management of organizational assets allocated to employees, from IT equipment to office furniture. It tracks the complete asset lifecycle including procurement, allocation, maintenance, and recovery. The module uses QR code technology for quick asset identification and audit, ensuring accurate inventory management and accountability throughout the organization.",
        features: [
          "Asset inventory management with categorization, specifications, and depreciation tracking",
          "Employee asset allocation with handover documentation and acknowledgment workflow",
          "QR code generation and scanning for instant asset identification and audit",
          "Asset maintenance scheduling with service records, vendor management, and renewal alerts",
          "Asset recovery and clearance tracking integrated with employee separation workflow",
          "Procurement request integration with approval workflow and budget validation",
          "Asset audit and physical verification with discrepancy reporting and reconciliation",
          "Depreciation calculator with configurable methods and financial reporting integration",
        ],
        roles: [
          ["IT Administrator", "Asset allocation; maintenance scheduling; recovery processing; audit"],
          ["HR Manager", "Asset policy config; allocation approval; clearance confirmation"],
          ["Finance Manager", "Depreciation tracking; budget validation; procurement approval"],
          ["Employee", "Asset view; return request; maintenance request; QR scan"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["assetCode", "String", "Unique asset ID", "Auto-generated"],
          ["name", "String", "Asset name", "Required"],
          ["category", "Enum", "laptop/desktop/mobile/furniture/other", "Required"],
          ["specifications", "JSON", "Technical specs", "Optional"],
          ["assignedToId", "UUID (FK)", "Current holder", "Nullable"],
          ["qrCode", "String", "QR identifier", "Auto-generated"],
          ["purchaseDate", "DateTime", "Acquisition date", "Required"],
          ["purchaseCost", "Decimal", "Original cost", "Required"],
          ["status", "Enum", "available/allocated/maintenance/retired", "Default: available"],
        ],
        screens: [
          ["Asset Inventory", "Searchable grid with filters, categories, and status indicators"],
          ["Asset Detail", "Full specs, allocation history, maintenance records, and QR code"],
          ["Allocation Manager", "Employee-asset assignment with handover workflow"],
          ["QR Scanner", "Mobile scan interface for identification and audit"],
          ["Maintenance Scheduler", "Service calendar with vendor coordination and cost tracking"],
          ["Audit Dashboard", "Physical verification tracker with discrepancy reports"],
        ],
        integrations: [
          "Onboarding \u2013 Triggers asset allocation for new hires during onboarding",
          "Separation \u2013 Initiates asset recovery during employee exit clearance",
          "FNF Settlement \u2013 Adds asset recovery deductions to settlement calculations",
          "Vendors \u2013 Connects with asset vendors for procurement and maintenance",
          "Projects \u2013 Attributes project-specific assets to project budgets"],
      },
      {
        name: "Documents",
        overview: "The Documents module provides centralized document management with version control, expiry tracking, and organized categorization for all HR-related documents. It serves as the secure repository for employee documents, organizational policies, compliance certificates, and contractual agreements. The module ensures document integrity, accessibility, and regulatory compliance throughout the document lifecycle.",
        features: [
          "Centralized document repository with folder hierarchy and tag-based categorization",
          "Version control with change tracking, comparison view, and rollback capabilities",
          "Document expiry tracking with automated renewal alerts and compliance notifications",
          "Role-based access control with view, edit, and download permissions per document",
          "Bulk document upload with auto-categorization and metadata extraction",
          "e-Signature integration for policy acknowledgment and agreement execution",
          "Document templates with dynamic field population for standard HR communications",
          "Compliance document tracking with regulatory requirement mapping and audit readiness",
        ],
        roles: [
          ["HR Manager", "Document policy config; template management; compliance oversight"],
          ["Department Manager", "Department document access; policy acknowledgment; template usage"],
          ["Employee", "Personal document upload/view; policy acknowledgment; template access"],
          ["Compliance Officer", "Expiry monitoring; regulatory mapping; audit preparation"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["title", "String", "Document title", "Required"],
          ["category", "Enum", "policy/employee/contract/compliance/other", "Required"],
          ["fileUrl", "String", "Storage path", "Required"],
          ["version", "Int", "Current version", "Default: 1"],
          ["expiryDate", "DateTime", "Expiry date", "Nullable"],
          ["accessLevel", "Enum", "public/internal/restricted/confidential", "Default: internal"],
          ["tags", "String[]", "Searchable tags", "Array"],
          ["uploadedById", "UUID (FK)", "Uploader", "Required"],
          ["eSignatureId", "String", "Signature reference", "Nullable"],
        ],
        screens: [
          ["Document Library", "Folder-based repository with search, filters, and tags"],
          ["Document Viewer", "Inline preview with version history and comparison tools"],
          ["Upload Center", "Bulk upload with metadata entry and auto-categorization"],
          ["Expiry Tracker", "Dashboard of expiring documents with renewal actions"],
          ["Template Manager", "Document template CRUD with dynamic field editor"],
          ["Access Control", "Permission management per document and folder"],
        ],
        integrations: [
          "Preboarding \u2013 Stores collected new hire documents in the repository",
          "Separation \u2013 Archives departing employee documents with retention policy",
          "Employees \u2013 Links documents to employee profiles and records",
          "Helpdesk \u2013 Attaches documents to support tickets for reference",
          "Settings \u2013 Applies organization-wide document policies and retention rules"],
      },
    ],
  },
  {
    name: "External",
    modules: [
      {
        name: "Clients",
        overview: "The Clients module manages the complete lifecycle of client relationships from onboarding through ongoing engagement to contract management. It provides a centralized repository for client information, service level agreements, and contractual obligations. The module enables organizations to maintain strong client relationships while ensuring SLA compliance and contract governance.",
        features: [
          "Client onboarding with company profile, contact hierarchy, and engagement setup",
          "SLA management with configurable metrics, monitoring thresholds, and escalation rules",
          "Contract lifecycle management with creation, renewal, amendment, and termination tracking",
          "Client contact management with role mapping and communication history",
          "Revenue tracking per client with billing integration and profitability analysis",
          "Client project association with resource allocation and deliverable tracking",
          "Client satisfaction measurement with periodic survey scheduling and trend analysis",
          "Compliance document tracking with regulatory requirements and audit trail",
        ],
        roles: [
          ["Account Manager", "Client relationship management; SLA monitoring; contract oversight"],
          ["Project Manager", "Client project association; deliverable tracking; billing review"],
          ["Finance Manager", "Revenue tracking; invoice management; profitability analysis"],
          ["Sales Team", "Client onboarding; contact management; opportunity tracking"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["companyName", "String", "Client company name", "Required"],
          ["industry", "String", "Industry sector", "Optional"],
          ["contactPerson", "JSON", "Primary contact", "Required"],
          ["contractId", "UUID (FK)", "Active contract", "Nullable"],
          ["slaId", "UUID (FK)", "SLA agreement", "Nullable"],
          ["revenue", "Decimal", "Account value", "Computed"],
          ["status", "Enum", "prospect/active/inactive/churned", "Default: prospect"],
          ["assignedManagerId", "UUID (FK)", "Account manager", "Required"],
          ["onboardedAt", "DateTime", "Onboarding date", "Auto"],
        ],
        screens: [
          ["Client Directory", "Searchable grid with industry, status, and revenue filters"],
          ["Client Profile", "Company details, contacts, contracts, and project associations"],
          ["SLA Dashboard", "Metric tracking with compliance indicators and escalation alerts"],
          ["Contract Manager", "Lifecycle view with renewal timelines and amendment tracking"],
          ["Revenue Analytics", "Client-wise revenue, profitability, and trend analysis"],
          ["Satisfaction Tracker", "Survey scheduling and NPS tracking per client"],
        ],
        integrations: [
          "Projects \u2013 Links clients to project records and deliverable tracking",
          "Vendors \u2013 Manages sub-contractor relationships for client projects",
          "Expenses \u2013 Tracks client-attributed expenses against project budgets",
          "Reports \u2013 Feeds client analytics, revenue, and SLA compliance data"],
      },
      {
        name: "Vendors",
        overview: "The Vendors module provides comprehensive vendor and sub-vendor management capabilities including registration, performance evaluation, and contract governance. It enables organizations to maintain a curated vendor ecosystem with quality ratings and compliance verification. The module supports strategic vendor management through performance analytics and risk assessment for informed procurement decisions.",
        features: [
          "Vendor registration with business verification, compliance documentation, and approval workflow",
          "Sub-vendor management with parent-child hierarchy and cascading compliance requirements",
          "Vendor performance rating system with multi-dimensional scoring and periodic review cycles",
          "Contract management with terms, deliverables, payment schedules, and renewal tracking",
          "Compliance verification with license tracking, insurance validation, and certification monitoring",
          "Procurement integration with purchase order generation and vendor comparison tools",
          "Payment management with milestone-based disbursement and invoice reconciliation",
          "Vendor risk assessment with financial stability scoring and dependency analysis",
        ],
        roles: [
          ["Procurement Manager", "Vendor registration; contract negotiation; performance review"],
          ["Finance Manager", "Payment processing; invoice validation; budget tracking"],
          ["Project Manager", "Vendor service coordination; deliverable tracking; quality assessment"],
          ["Compliance Officer", "Vendor verification; license tracking; risk assessment"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["vendorName", "String", "Company name", "Required"],
          ["parentVendorId", "UUID (FK)", "Parent vendor", "Nullable (sub-vendor)"],
          ["category", "String", "Service category", "Required"],
          ["contactDetails", "JSON", "Contact information", "Required"],
          ["rating", "Float", "Performance score", "0-5 scale"],
          ["complianceStatus", "JSON", "Verification status", "Progressively filled"],
          ["contractId", "UUID (FK)", "Active contract", "Nullable"],
          ["riskScore", "Float", "Risk assessment", "Computed"],
          ["status", "Enum", "pending/active/suspended/blacklisted", "Default: pending"],
        ],
        screens: [
          ["Vendor Directory", "Searchable grid with category, rating, and status filters"],
          ["Vendor Profile", "Company details, compliance docs, contracts, and performance history"],
          ["Registration Form", "Multi-step onboarding with document upload and verification"],
          ["Rating Dashboard", "Performance scores with trend analysis and comparison"],
          ["Contract Manager", "Terms, deliverables, payments, and renewal tracking"],
          ["Risk Assessment", "Risk scoring with dependency mapping and mitigation recommendations"],
        ],
        integrations: [
          "Clients \u2013 Manages sub-vendor relationships for client project delivery",
          "Projects \u2013 Links vendor services to project resource allocation",
          "Expenses \u2013 Processes vendor invoices and payment disbursements",
          "Assets \u2013 Connects with asset vendors for procurement and maintenance",
          "Reports \u2013 Feeds vendor performance, spend analysis, and risk metrics"],
      },
    ],
  },
  {
    name: "Support",
    modules: [
      {
        name: "Helpdesk",
        overview: "The Helpdesk module provides a comprehensive ticket management system for internal HR support requests and employee inquiries. It ensures timely resolution through SLA-driven workflows, knowledge base integration, and intelligent ticket routing. The module serves as the primary support channel for employees, improving HR service delivery through efficient request handling and self-service capabilities.",
        features: [
          "Ticket creation with categorization, priority assignment, and attachment support",
          "SLA management with configurable response and resolution time targets per category",
          "Knowledge base with article creation, search, and AI-powered answer suggestions",
          "Automated ticket routing with skill-based assignment and workload balancing",
          "Escalation engine with automatic priority upgrades for SLA breaches",
          "Self-service portal with FAQ access, ticket submission, and status tracking",
          "Satisfaction survey upon ticket closure with rating and feedback collection",
          "Helpdesk analytics with volume trends, resolution times, and agent performance metrics",
        ],
        roles: [
          ["HR Support Agent", "Ticket handling; response management; knowledge base contribution"],
          ["HR Manager", "SLA configuration; escalation oversight; analytics review"],
          ["Employee", "Ticket submission; status tracking; knowledge base access; satisfaction rating"],
          ["IT Administrator", "Technical ticket routing; integration support; system configuration"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["ticketNumber", "String", "Auto ticket ID", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Requester", "Required"],
          ["category", "String", "Issue category", "Required"],
          ["priority", "Enum", "low/medium/high/critical", "Default: medium"],
          ["subject", "String", "Ticket title", "Required"],
          ["description", "Text", "Issue details", "Required"],
          ["assignedToId", "UUID (FK)", "Assigned agent", "Nullable"],
          ["slaDeadline", "DateTime", "Resolution target", "Computed"],
          ["status", "Enum", "open/in_progress/resolved/closed", "Default: open"],
        ],
        screens: [
          ["Ticket Dashboard", "Queue view with filters, SLA indicators, and assignment status"],
          ["Submit Ticket", "Category selection, description, and attachment upload"],
          ["Ticket Detail", "Conversation thread, status updates, and resolution actions"],
          ["Knowledge Base", "Article search, creation, and category browsing"],
          ["SLA Monitor", "Compliance dashboard with breach alerts and escalation tracking"],
          ["Analytics", "Volume, resolution time, agent performance, and satisfaction metrics"],
        ],
        integrations: [
          "AI Assistant \u2013 Powers intelligent ticket routing and answer suggestions",
          "Employees \u2013 Links tickets to employee records for context and history",
          "Documents \u2013 Attaches relevant policy documents to ticket responses",
          "Grievances \u2013 Escalates unresolved tickets to formal grievance process",
          "Reports \u2013 Feeds helpdesk analytics and SLA compliance data"],
      },
      {
        name: "Grievances",
        overview: "The Grievances module provides a formal mechanism for employees to submit, track, and resolve workplace grievances in a confidential and fair manner. It ensures structured investigation processes with designated investigators, timeline management, and resolution documentation. The module promotes a transparent and equitable workplace by providing safe channels for raising concerns and tracking their resolution.",
        features: [
          "Confidential grievance submission with anonymity options and whistleblower protection",
          "Structured investigation workflow with investigator assignment and evidence collection",
          "Resolution tracking with timeline management, interim actions, and outcome recording",
          "Multi-level escalation with committee review for complex or unresolved grievances",
          "Communication log with secure messaging between parties while maintaining confidentiality",
          "Grievance categorization with severity classification and policy violation mapping",
          "Appeal process management for disputed resolutions with independent review capability",
          "Grievance analytics with trend analysis, category breakdown, and resolution effectiveness metrics",
        ],
        roles: [
          ["Employee", "Grievance submission; status tracking; communication; appeal filing"],
          ["HR Manager", "Investigation oversight; investigator assignment; resolution approval"],
          ["Investigator", "Evidence collection; interview scheduling; report submission"],
          ["Grievance Committee", "Complex case review; appeal adjudication; policy recommendations"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["employeeId", "UUID (FK)", "Complainant", "Required (anonymizable)"],
          ["category", "Enum", "harassment/discrimination/policy_violation/workplace/other", "Required"],
          ["severity", "Enum", "low/medium/high/critical", "Default: medium"],
          ["description", "Text", "Grievance details", "Required (encrypted)"],
          ["investigatorId", "UUID (FK)", "Assigned investigator", "Nullable"],
          ["isAnonymous", "Boolean", "Anonymity flag", "Default: false"],
          ["resolution", "Text", "Outcome details", "Nullable"],
          ["status", "Enum", "submitted/investigating/escalated/resolved/appealed/closed", "Default: submitted"],
          ["filedAt", "DateTime", "Filing date", "Auto"],
        ],
        screens: [
          ["Grievance Portal", "Submission interface with anonymity and confidentiality options"],
          ["Investigation Dashboard", "Active case management with evidence and timeline tracking"],
          ["Case Detail", "Complete grievance record with investigation notes and resolution"],
          ["Escalation Center", "Committee review queue with case summaries and decision tools"],
          ["Appeal Management", "Appeal submission and independent review workflow"],
          ["Analytics", "Trend analysis, category breakdown, and resolution effectiveness"],
        ],
        integrations: [
          "Helpdesk \u2013 Receives escalated tickets that require formal grievance processing",
          "Employees \u2013 Links grievances to employee records with confidentiality controls",
          "Workflows \u2013 Drives investigation and escalation approval workflows",
          "Documents \u2013 Stores investigation evidence and resolution documents securely",
          "Reports \u2013 Feeds grievance analytics and compliance metrics"],
      },
      {
        name: "AI Assistant",
        overview: "The AI Assistant module provides an intelligent conversational interface that helps employees and HR professionals navigate the HRMS platform, resolve queries, and complete tasks through natural language interactions. It combines intent detection, contextual understanding, and automated action execution to serve as a virtual HR assistant available around the clock. The module reduces manual effort and improves response times for common HR inquiries and transactions.",
        features: [
          "Natural language chatbot with multi-turn conversation support and context retention",
          "Intent detection engine classifying user queries across HR domains and actions",
          "Automated task execution including leave requests, attendance regularization, and payslip access",
          "Contextual help delivery with step-by-step guidance for platform features and processes",
          "Multi-channel availability including web widget, mobile app, and messaging platform integration",
          "Proactive notifications and reminders for pending actions, deadlines, and policy updates",
          "Sentiment-aware responses adjusting tone and escalation based on user frustration detection",
          "Conversation analytics with intent distribution, resolution rates, and satisfaction scoring",
        ],
        roles: [
          ["Employee", "Query resolution; task execution; policy information; help navigation"],
          ["HR Manager", "Chatbot monitoring; knowledge base updates; escalation handling"],
          ["AI Administrator", "Intent model training; response template management; analytics review"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["userId", "UUID (FK)", "Chat user", "Required"],
          ["sessionId", "String", "Conversation ID", "Auto-generated"],
          ["messages", "JSON[]", "Chat history", "Array"],
          ["detectedIntent", "String", "Classified intent", "Computed"],
          ["confidenceScore", "Float", "Intent confidence", "Computed"],
          ["actionsTaken", "JSON[]", "Executed actions", "Array"],
          ["escalated", "Boolean", "Human escalation flag", "Default: false"],
          ["satisfactionRating", "Int", "User rating (1-5)", "Nullable"],
          ["createdAt", "DateTime", "Session start", "Auto"],
        ],
        screens: [
          ["Chat Interface", "Conversational UI with quick actions and rich message cards"],
          ["Admin Console", "Intent model management, response templates, and training data"],
          ["Escalation Queue", "Human agent takeover for unresolved conversations"],
          ["Analytics Dashboard", "Intent distribution, resolution rates, and satisfaction trends"],
          ["Knowledge Base Editor", "Response content management for chatbot answers"],
        ],
        integrations: [
          "AI Admin Console \u2013 Sources intent models, response templates, and safety guardrails",
          "Helpdesk \u2013 Escalates unresolved queries to support ticket creation",
          "Leave Management \u2013 Executes leave balance queries and request submissions",
          "Attendance \u2013 Provides attendance status and regularization assistance",
          "Payroll \u2013 Delivers payslip access and tax-related information",
          "Documents \u2013 Retrieves policy documents and answers policy queries"],
      },
    ],
  },
  {
    name: "Governance",
    modules: [
      {
        name: "Workflows",
        overview: "The Workflows module provides a visual workflow builder for creating and managing multi-step approval processes across the NEXUS HRMS platform. It enables administrators to define custom approval chains, condition-based routing, and automated actions without coding. The module serves as the orchestration engine for business processes, ensuring consistent and auditable decision-making across all HR operations.",
        features: [
          "Visual workflow builder with drag-and-drop node configuration and connection routing",
          "Multi-step approval chains with parallel and sequential node execution",
          "Condition-based routing with field-value evaluation and dynamic path selection",
          "Role-based approver assignment with delegation support and auto-escalation",
          "SLA enforcement with configurable deadlines, reminders, and escalation triggers",
          "Workflow templates for common processes like leave approval, expense claims, and recruitment",
          "Audit trail with complete action history, timestamps, and decision rationale",
          "Webhook and API integration for external system notifications and data sync",
        ],
        roles: [
          ["HR Administrator", "Workflow design; template management; SLA configuration"],
          ["Department Manager", "Approval chain participation; delegation setup; escalation review"],
          ["Employee", "Request submission; status tracking; approval response"],
          ["IT Administrator", "Webhook configuration; API integration; system connectivity"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["name", "String", "Workflow name", "Required"],
          ["module", "Enum", "Target HR module", "Required"],
          ["nodes", "JSON[]", "Workflow steps", "Array"],
          ["connections", "JSON[]", "Node links", "Array"],
          ["conditions", "JSON[]", "Routing rules", "Array"],
          ["isActive", "Boolean", "Activation flag", "Default: true"],
          ["version", "Int", "Workflow version", "Default: 1"],
          ["triggerEvent", "String", "Initiating event", "Required"],
          ["slaConfig", "JSON", "SLA parameters", "Optional"],
        ],
        screens: [
          ["Workflow Builder", "Visual canvas with node palette, connection tools, and preview"],
          ["Template Gallery", "Pre-built workflow templates with customization options"],
          ["Approval Dashboard", "Pending approvals with action buttons and delegation controls"],
          ["Workflow Monitor", "Active instance tracking with status and SLA indicators"],
          ["Audit Trail", "Complete action history with filter and export capabilities"],
          ["SLA Configuration", "Deadline, reminder, and escalation rule setup per workflow"],
        ],
        integrations: [
          "Leave Management \u2013 Orchestrates leave approval chains and escalation workflows",
          "Expenses \u2013 Manages expense claim approval and reimbursement routing",
          "Recruitment \u2013 Drives hiring approval and candidate evaluation workflows",
          "Requisitions \u2013 Powers manpower requisition approval hierarchies",
          "Separation \u2013 Manages clearance approval and exit workflow orchestration",
          "Settings \u2013 Receives organization-level workflow policies and role mappings"],
      },
      {
        name: "Reports",
        overview: "The Reports module provides comprehensive HR analytics and custom reporting capabilities across all modules of the NEXUS HRMS platform. It offers pre-built report templates for common HR metrics alongside a custom report builder for ad-hoc analysis. The module transforms raw HR data into actionable insights through interactive visualizations, scheduled distributions, and export capabilities.",
        features: [
          "Pre-built report library with 50+ standard HR reports across all modules",
          "Custom report builder with drag-and-drop field selection and filter configuration",
          "Interactive dashboards with drill-down, cross-filtering, and data exploration capabilities",
          "Scheduled report generation with automated email distribution and format options",
          "Multi-format export including PDF, Excel, CSV, and PowerPoint presentation generation",
          "Data visualization engine with chart type selection, color themes, and annotation tools",
          "Compliance reporting with statutory templates and regulatory filing data preparation",
          "Report sharing and collaboration with role-based access and commenting",
        ],
        roles: [
          ["HR Director", "Full report access; custom report creation; scheduled distribution"],
          ["HR Manager", "Department-level reports; standard report generation; sharing"],
          ["Finance Manager", "Compensation and compliance reports; cost analytics; export"],
          ["Department Manager", "Team-level reports; attendance and performance summaries"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["name", "String", "Report name", "Required"],
          ["type", "Enum", "standard/custom/dashboard/compliance", "Required"],
          ["module", "String", "Source module", "Required"],
          ["fields", "JSON[]", "Selected columns", "Array"],
          ["filters", "JSON[]", "Applied filters", "Array"],
          ["schedule", "JSON", "Distribution config", "Nullable"],
          ["lastRunAt", "DateTime", "Recent execution", "Auto"],
          ["createdById", "UUID (FK)", "Report creator", "Required"],
          ["accessLevel", "Enum", "private/department/company-wide", "Default: private"],
        ],
        screens: [
          ["Report Library", "Categorized report catalog with search and quick-run options"],
          ["Custom Report Builder", "Drag-and-drop field selector with filter and grouping tools"],
          ["Dashboard Designer", "Widget-based layout with chart selection and data binding"],
          ["Report Viewer", "Interactive display with drill-down, export, and sharing options"],
          ["Schedule Manager", "Automated distribution setup with format and recipient selection"],
          ["Compliance Reports", "Statutory templates with data validation and filing preparation"],
        ],
        integrations: [
          "All Modules \u2013 Aggregates data from all HR modules for comprehensive reporting",
          "Dashboard \u2013 Feeds widget data and KPI metrics to the HR dashboard",
          "Workflows \u2013 Triggers automated report generation on workflow events",
          "Settings \u2013 Applies report access policies and distribution configurations",
          "AI Admin Console \u2013 Powers AI-driven report insights and anomaly detection"],
      },
      {
        name: "Settings",
        overview: "The Settings module serves as the central configuration hub for the entire NEXUS HRMS platform, managing system preferences, notification rules, integration endpoints, and organizational policies. It provides administrators with granular control over platform behavior, ensuring the system adapts to each organization\u2019s unique requirements. The module maintains configuration consistency while enabling flexible customization across all functional areas.",
        features: [
          "Organization-level configuration with working hours, fiscal year, and locale settings",
          "Notification management with channel preferences, trigger rules, and template customization",
          "Third-party integration hub with biometric, accounting, and communication platform connectors",
          "Email template builder with dynamic placeholders, branding, and preview capabilities",
          "Role and permission matrix editor with visual access control configuration",
          "Data retention and privacy policies with GDPR compliance and right-to-erasure management",
          "Audit log configuration with retention periods, access controls, and export schedules",
          "Feature flag management for controlled rollout of new capabilities and module access",
        ],
        roles: [
          ["System Administrator", "Full config access; integration setup; feature flag management"],
          ["HR Administrator", "HR policy config; notification management; template editing"],
          ["IT Administrator", "Integration endpoints; SSO configuration; data retention policies"],
          ["Compliance Officer", "Privacy settings; audit config; retention policy review"],
        ],
        dataModel: [
          ["id", "UUID", "Primary key", "Auto-generated"],
          ["companyId", "UUID (FK)", "Organization scope", "Required"],
          ["category", "Enum", "general/notification/integration/privacy/audit", "Required"],
          ["configKey", "String", "Setting identifier", "Required (unique per company)"],
          ["configValue", "JSON", "Setting value", "Required"],
          ["description", "Text", "Setting purpose", "Optional"],
          ["isOverridable", "Boolean", "Sub-entity override", "Default: true"],
          ["updatedById", "UUID (FK)", "Last modifier", "Auto"],
          ["updatedAt", "DateTime", "Modification time", "Auto"],
        ],
        screens: [
          ["General Settings", "Organization-level preferences for working hours, fiscal year, locale"],
          ["Notification Center", "Channel, trigger, and template management for all notifications"],
          ["Integration Hub", "Third-party service connectors with configuration and testing"],
          ["Email Templates", "Template editor with dynamic fields, branding, and preview"],
          ["Privacy & Retention", "Data retention policies, GDPR settings, and erasure management"],
          ["Feature Flags", "Module access control and capability rollout management"],
          ["Audit Configuration", "Log retention, access controls, and export scheduling"],
        ],
        integrations: [
          "All Modules \u2013 Provides configuration context for every HR module in the platform",
          "Super Admin \u2013 Receives platform-level defaults and feature flag constraints",
          "Workflows \u2013 Supplies approval hierarchies and escalation configuration",
          "Reports \u2013 Provides access policies and distribution configurations",
          "AI Admin Console \u2013 Feeds AI feature toggles and safety configuration defaults"],
      },
    ],
  },
];

// ════════════════════════════════════════════════════════
// Build Document
// ════════════════════════════════════════════════════════

const children = [];

// ── COVER PAGE ──
// Dark background cover page
for (let i = 0; i < 6; i++) {
  children.push(new Paragraph({ spacing: { before: 200 } }));
}

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 80 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "NEXUS HRMS",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 72,
        color: P.cover.title,
        bold: true,
      }),
    ],
  })
);

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 200 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "SaaS-Based AI-Powered Human Resource Management System",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 32,
        color: P.cover.subtitle,
      }),
    ],
  })
);

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
    indent: { left: 720 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: P.accent.replace("37DCF2","1B6B7A") } },
    children: [],
  })
);

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 300, after: 60 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "Functional Documentation",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 40,
        color: P.accent,
        bold: true,
      }),
    ],
  })
);

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 120, after: 60 },
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "Module-wise Functional Specifications",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 24,
        color: P.cover.subtitle,
      }),
    ],
  })
);

for (let i = 0; i < 4; i++) {
  children.push(new Paragraph({ spacing: { before: 200 } }));
}

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720 },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text: "Version 1.0  |  March 2026",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 22,
        color: P.cover.meta,
      }),
    ],
  })
);

children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720 },
    children: [
      new TextRun({
        text: "Confidential \u2013 For Internal Use Only",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 20,
        color: P.cover.footer,
      }),
    ],
  })
);

// Page break after cover
children.push(
  new Paragraph({
    children: [new PageBreak()],
  })
);

// ── TABLE OF CONTENTS ──
children.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 300 },
    children: [
      new TextRun({
        text: "Table of Contents",
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: 32,
        color: P.primary,
        bold: true,
      }),
    ],
  })
);

children.push(
  new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-4",
  stylesWithLevels: [
      { styleName: "Heading1", level: 1 },
      { styleName: "Heading2", level: 2 },
      { styleName: "Heading3", level: 3 },
      { styleName: "Heading4", level: 4 },
    ],
  })
);

children.push(
  new Paragraph({
    children: [new PageBreak()],
  })
);

// ── BODY CONTENT ──

// Document Introduction
children.push(
  sectionHeading("1. Introduction")
);

children.push(
  bodyPara("This document provides the complete functional specification for NEXUS HRMS, a SaaS-based AI-powered Human Resource Management System. It details the functional requirements, user interactions, data models, and integration points for each of the 40 modules organized across 10 functional categories. The specifications serve as the authoritative reference for development, testing, and stakeholder alignment throughout the product lifecycle.")
);

children.push(
  bodyPara("NEXUS HRMS is designed as a multi-tenant cloud platform that leverages artificial intelligence to automate and enhance HR operations across the entire employee lifecycle. From talent acquisition through separation, the system provides intelligent workflows, predictive analytics, and conversational AI assistance that transform traditional HR processes into data-driven, employee-centric experiences.")
);

children.push(
  bodyPara("Each module specification includes a comprehensive overview, key functional features, role-based access definitions, data model summaries reflecting the Prisma schema design, UI component descriptions, and integration points with other modules. This structured approach ensures complete traceability from business requirements through technical implementation.")
);

// Module Categories
let moduleIndex = 2;
categories.forEach((category, catIdx) => {
  children.push(sectionHeading(`${moduleIndex}. ${category.name}`));
  children.push(
    bodyPara(`The ${category.name} category encompasses ${category.modules.length} modules that collectively address the ${category.name.toLowerCase()} needs of the organization. Each module is designed to operate both independently and as part of the integrated NEXUS HRMS ecosystem, ensuring seamless data flow and process continuity across functional boundaries.`)
  );

  category.modules.forEach((mod, modIdx) => {
    const modNumber = `${moduleIndex}.${modIdx + 1}`;

    // Module heading
    children.push(sectionHeading(`${modNumber} ${mod.name}`, HeadingLevel.HEADING_2));

    // 1. Module Overview
    children.push(moduleSubHeading(`${modNumber}.1 Module Overview`));
    children.push(bodyPara(mod.overview));

    // 2. Key Functional Features
    children.push(moduleSubHeading(`${modNumber}.2 Key Functional Features`));
    mod.features.forEach((f) => {
      children.push(bullet(f));
    });

    // 3. User Roles & Access
    children.push(moduleSubHeading(`${modNumber}.3 User Roles & Access`));
    children.push(
      createTable(
        ["Role", "Access & Capabilities"],
        mod.roles,
        [30, 70]
      )
    );

    // 4. Data Model Summary
    children.push(moduleSubHeading(`${modNumber}.4 Data Model Summary`));
    children.push(
      createTable(
        ["Field", "Type", "Description", "Constraints"],
        mod.dataModel,
        [20, 18, 35, 27]
      )
    );

    // 5. UI Components & Screens
    children.push(moduleSubHeading(`${modNumber}.5 UI Components & Screens`));
    children.push(
      createTable(
        ["Screen", "Description"],
        mod.screens,
        [30, 70]
      )
    );

    // 6. Integration Points
    children.push(moduleSubHeading(`${modNumber}.6 Integration Points`));
    mod.integrations.forEach((integ) => {
      children.push(bullet(integ));
    });

    // Separator between modules
    if (modIdx < category.modules.length - 1) {
      children.push(accentLine());
    }
  });

  moduleIndex++;
});

// ── Create Document ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
          size: 22,
          color: P.body,
        },
        paragraph: {
          spacing: { line: 312, lineRule: LineRuleType.AUTO },
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    },
    // Cover page section with dark background
    // We'll handle cover styling through the main section
  ],
});

// ── Generate File ──
async function generate() {
  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join("/home/z/my-project/download", "NEXUS-HRMS-Functional-Documentation.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("Document generated: " + outputPath);
}

generate().catch(console.error);
