#!/usr/bin/env node
const docx = require("docx");
const fs = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, PageBreak, ShadingType,
  BorderStyle, TableOfContents, LineRuleType, NumberFormat,
} = docx;

// ── Palette (DM-1 Deep Cyan) ──
const P = {
  primary: "162235",
  body: "1A2B40",
  secondary: "6878A0",
  accent: "37DCF2",
  surface: "F4F8FC",
  coverBg: "162235",
  cover: { title: "FFFFFF", subtitle: "B0B8C0", meta: "90989F", footer: "687078" },
  tbl: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};

// ── Borders ──
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Helper: body paragraph ──
function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, lineRule: LineRuleType.AUTO, after: 80 },
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
  const sz = level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 28 : 24;
  return new Paragraph({
    heading: level,
    spacing: { before: 360, after: 200, line: Math.ceil((sz / 2) * 23), lineRule: "atLeast" },
    children: [
      new TextRun({
        text,
        font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        size: sz,
        color: P.primary,
        bold: true,
      }),
    ],
  });
}

// ── Helper: accent line separator ──
function accentLine() {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.tbl.accentLine } },
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

// ── Helper: create table ──
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
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: P.tbl.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.tbl.accentLine },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.tbl.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [headerRow, ...dataRows],
  });
}

// ── Helper: label/value pair ──
function labelValue(label, value) {
  return new Paragraph({
    spacing: { line: 312, lineRule: LineRuleType.AUTO, after: 60 },
    children: [
      new TextRun({ text: label + ": ", font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 22, color: P.tbl.headerBg, bold: true }),
      new TextRun({ text: value, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 22, color: P.body }),
    ],
  });
}

// ── Helper: wiki page block ──
function wikiPageBlock(page) {
  const children = [];
  children.push(sectionHeading(page.title, HeadingLevel.HEADING_2));
  children.push(labelValue("URL Slug", page.slug));
  children.push(labelValue("Tags", page.tags));
  children.push(labelValue("Last Updated", page.lastUpdated));
  children.push(labelValue("Page Owner", page.owner));
  children.push(labelValue("Parent", page.parent));
  children.push(labelValue("Siblings", page.siblings));
  children.push(labelValue("Children", page.children));
  children.push(accentLine());
  page.paragraphs.forEach(p => children.push(bodyPara(p)));
  children.push(spacer(120));
  return children;
}

// ── Spacer ──
function spacer(h = 120) {
  return new Paragraph({ spacing: { before: h, after: 0 } });
}

// ── Cover Page ──
function buildCover() {
  const titleText = "NEXUS HRMS";
  const subtitleText = "GitHub Wiki & Knowledge Hub";
  const metaText = "Master Blueprint for Wiki Architecture, Page Templates & Complete Content";
  const dateText = "March 2026";

  return [
    new Table({
      borders: allNoBorders,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 16838, rule: "exact" },
          children: [
            new TableCell({
              shading: { fill: P.coverBg, type: ShadingType.CLEAR },
              borders: allNoBorders,
              margins: { left: 1200, right: 1200 },
              verticalAlign: "top",
              width: { size: 100, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ spacing: { before: 4200 } }),
                // Accent line top
                new Paragraph({
                  indent: { left: 0, right: 6000 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: P.accent, space: 16 } },
                  spacing: { after: 300 },
                }),
                // Title
                new Paragraph({
                  spacing: { line: Math.ceil(52 * 23), lineRule: "atLeast", after: 120 },
                  children: [
                    new TextRun({ text: titleText, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 52, bold: true, color: P.cover.title }),
                  ],
                }),
                // Subtitle
                new Paragraph({
                  spacing: { line: Math.ceil(40 * 23), lineRule: "atLeast", after: 200 },
                  children: [
                    new TextRun({ text: subtitleText, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 40, color: P.accent }),
                  ],
                }),
                // Accent line bottom
                new Paragraph({
                  indent: { left: 0, right: 6000 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: P.accent, space: 16 } },
                  spacing: { after: 400 },
                }),
                // Meta
                new Paragraph({
                  spacing: { line: 360, after: 80 },
                  children: [
                    new TextRun({ text: metaText, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 22, color: P.cover.subtitle }),
                  ],
                }),
                new Paragraph({
                  spacing: { line: 360 },
                  children: [
                    new TextRun({ text: dateText, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 20, color: P.cover.meta }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

// ── 40 Module Definitions ──
const modules = [
  { name: "Super Admin", slug: "module-super-admin", desc: "Central command center for multi-tenant platform governance, subscription management, and global configuration." },
  { name: "AI Admin Console", slug: "module-ai-admin", desc: "Governance over AI/ML capabilities including model configuration, prompt templates, usage monitoring, and safety guardrails." },
  { name: "Tenant Admin", slug: "module-tenant-admin", desc: "Organization administration with company structure, user management, and role-based access control." },
  { name: "Dashboard", slug: "module-dashboard", desc: "Centralized HR operations overview with real-time analytics, configurable widgets, and AI-powered insights." },
  { name: "Company Management", slug: "module-company-mgmt", desc: "Structural foundation for organizational hierarchy including companies, branches, departments, and designations." },
  { name: "Employees", slug: "module-employees", desc: "Central employee repository with directory, org chart, lifecycle management, and document handling." },
  { name: "Recruitment", slug: "module-recruitment", desc: "Comprehensive talent acquisition pipeline from job posting through candidate selection with AI-powered matching." },
  { name: "Requisitions", slug: "module-requisitions", desc: "Manpower planning and approval process with budget validation and multi-level approval workflows." },
  { name: "Offers", slug: "module-offers", desc: "Complete offer letter lifecycle with template management, salary breakdown, and digital signatures." },
  { name: "Job Portal", slug: "module-job-portal", desc: "Public-facing career site with AI-powered job matching, resume parsing, and candidate self-service." },
  { name: "AI Interview", slug: "module-ai-interview", desc: "AI-driven screening interviews with speech analysis, facial assessment, and automated scoring." },
  { name: "Onboarding", slug: "module-onboarding", desc: "Structured new hire onboarding with task management, document collection, and orientation scheduling." },
  { name: "Preboarding", slug: "module-preboarding", desc: "Pre-join engagement with digital document submission, IT provisioning, and welcome communications." },
  { name: "Attendance", slug: "module-attendance", desc: "Time tracking with biometric integration, shift management, overtime calculation, and compliance monitoring." },
  { name: "Leave Management", slug: "module-leave", desc: "Leave request workflows with policy engine, balance tracking, delegation, and calendar integration." },
  { name: "Timesheets", slug: "module-timesheets", desc: "Project time logging with weekly/monthly views, approval workflows, and billing integration." },
  { name: "Payroll", slug: "module-payroll", desc: "End-to-end payroll processing with statutory compliance, tax calculations, and bank integration." },
  { name: "Salary Structures", slug: "module-salary-structures", desc: "Compensation framework with CTC templates, component definitions, and grade-based salary bands." },
  { name: "Performance", slug: "module-performance", desc: "Performance review cycles with goal setting, 360-degree feedback, calibration, and development plans." },
  { name: "Goals", slug: "module-goals", desc: "OKR and goal management with cascading objectives, progress tracking, and alignment dashboards." },
  { name: "Engagement", slug: "module-engagement", desc: "Employee engagement with pulse surveys, eNPS tracking, sentiment analysis, and action planning." },
  { name: "Succession", slug: "module-succession", desc: "Succession planning with talent pipeline identification, readiness assessment, and development tracking." },
  { name: "Training", slug: "module-training", desc: "Learning management with course catalog, enrollment, completion tracking, and certification management." },
  { name: "Learning", slug: "module-learning", desc: "Personalized learning paths with skill gap analysis, content recommendations, and competency mapping." },
  { name: "Travel", slug: "module-travel", desc: "Travel request management with itinerary planning, approval workflows, and expense integration." },
  { name: "Expenses", slug: "module-expenses", desc: "Expense reporting with receipt capture, policy validation, approval workflows, and reimbursement tracking." },
  { name: "Assets", slug: "module-assets", desc: "Asset lifecycle management from procurement through assignment, maintenance, and disposal." },
  { name: "Documents", slug: "module-documents", desc: "Centralized document management with templates, e-signatures, version control, and compliance tracking." },
  { name: "Projects", slug: "module-projects", desc: "Project management with task boards, resource allocation, milestone tracking, and utilization analytics." },
  { name: "Helpdesk", slug: "module-helpdesk", desc: "Employee support with ticket management, SLA tracking, knowledge base, and escalation workflows." },
  { name: "Grievances", slug: "module-grievances", desc: "Grievance handling with confidential submission, investigation workflows, and resolution tracking." },
  { name: "Workflows", slug: "module-workflows", desc: "Workflow engine with visual builder, condition routing, approval hierarchies, and automation rules." },
  { name: "Reports", slug: "module-reports", desc: "Reporting engine with pre-built templates, custom report builder, scheduled delivery, and data export." },
  { name: "Analytics", slug: "module-analytics", desc: "Advanced analytics with predictive models, trend analysis, benchmarking, and executive dashboards." },
  { name: "Compliance & Audit", slug: "module-compliance-audit", desc: "Statutory compliance with audit trails, regulatory reporting, and policy enforcement monitoring." },
  { name: "Separation", slug: "module-separation", desc: "Employee exit management with resignation processing, notice period tracking, and clearance workflows." },
  { name: "FnF Settlement", slug: "module-fnf", desc: "Full and Final settlement with automated calculations, recovery tracking, and compliance documentation." },
  { name: "Alumni", slug: "module-alumni", desc: "Alumni network management with engagement tracking, rehire eligibility, and referral programs." },
  { name: "Vendor Portal", slug: "module-vendor-portal", desc: "Vendor management with onboarding, contract tracking, performance evaluation, and payment workflows." },
  { name: "Client Portal", slug: "module-client-portal", desc: "Client engagement with project visibility, billing transparency, feedback collection, and SLA monitoring." },
];

// ── Wiki Page Definitions ──
const gettingStartedPages = [
  {
    title: "Home / Welcome", slug: "Home", tags: "welcome, overview, getting-started",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Root", siblings: "Quick-Start-Guide, Architecture-Overview", children: "Getting-Started, Module-Documentation, Technical-Reference, Operations, Contributing",
    paragraphs: [
      "Welcome to the NEXUS HRMS GitHub Wiki, the central knowledge repository for the next-generation Human Resource Management System. This wiki serves as the definitive source of truth for all platform documentation, covering everything from architecture decisions and development guidelines to operational procedures and troubleshooting guides. Whether you are a developer onboarding to the project, an administrator configuring the platform, or a stakeholder seeking product understanding, this wiki provides the comprehensive resources you need.",
      "NEXUS HRMS is a multi-tenant SaaS platform built on Next.js 16 with TypeScript, Prisma ORM, and PostgreSQL. It encompasses over 40 modules spanning the complete HR lifecycle from talent acquisition through alumni management. The platform leverages AI capabilities for intelligent automation, provides role-based access control at every level, and supports multi-company organizational structures with full data isolation between tenants.",
      "This wiki is organized into five primary sections: Getting Started for new users and developers, Module Documentation with detailed guides for each of the 40+ modules, Technical Reference for API documentation and design systems, Operations for deployment and incident management, and Contributing for team collaboration guidelines. Use the sidebar navigation to browse by category or search for specific topics.",
      "All wiki content is version-controlled alongside the application code, ensuring documentation stays synchronized with software releases. Each page includes metadata such as last updated date, page owner, and navigation links to related content. We encourage all team members to contribute improvements and keep documentation current as the platform evolves.",
    ],
  },
  {
    title: "Quick Start Guide", slug: "Quick-Start-Guide", tags: "quickstart, setup, onboarding",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Getting Started", siblings: "Home, Architecture-Overview, Development-Setup, Deployment-Guide", children: "",
    paragraphs: [
      "This Quick Start Guide helps you get NEXUS HRMS running on your local development environment in under 30 minutes. Before you begin, ensure your system meets the prerequisites: Node.js 20 or later, PostgreSQL 15 or later, Redis 7 or later (optional for caching), and Git. You will also need access to the NEXUS HRMS GitHub repository with appropriate permissions for the organization.",
      "Clone the repository using the provided SSH URL, then navigate to the project root and install dependencies with npm install. Copy the .env.example file to .env.local and configure your local database connection string, Redis URL, and authentication secrets. Run npx prisma migrate dev to set up the database schema and seed data. Start the development server with npm run dev and navigate to http://localhost:3000 to verify the application loads correctly.",
      "The default seed data includes a super administrator account and a demo tenant with sample employees, departments, and configurations. Use the credentials provided in the seed script output to log in and explore the platform. You can access the admin console at /super-admin, the tenant dashboard at /dashboard, and the API documentation at /api/docs. The demo environment includes sample data across all major modules to help you understand the platform capabilities.",
      "For IDE setup, we recommend VS Code with the recommended extensions listed in .vscode/extensions.json. Enable TypeScript strict mode and ESLint auto-fix on save for optimal development experience. The project includes pre-configured debugging configurations for both the Next.js frontend and API routes. Refer to the Development Setup page for detailed environment configuration instructions.",
    ],
  },
  {
    title: "Architecture Overview", slug: "Architecture-Overview", tags: "architecture, design, system",
    lastUpdated: "2026-03-04", owner: "Architecture Team",
    parent: "Getting Started", siblings: "Home, Quick-Start-Guide, Development-Setup, Deployment-Guide", children: "API-Documentation, Database-Schema, Authentication-Authorization, State-Management",
    paragraphs: [
      "NEXUS HRMS follows a modern full-stack architecture built on Next.js 16 with the App Router pattern. The frontend uses React 19 with TypeScript, Tailwind CSS 4 for styling, and shadcn/ui for the component library. The backend leverages Next.js API routes with Prisma ORM for database access, providing a unified deployment model where frontend and backend share the same codebase and deployment pipeline. This architecture eliminates the complexity of microservice orchestration while maintaining clear separation of concerns through route handlers and middleware.",
      "The data layer uses PostgreSQL as the primary database with Prisma as the ORM, providing type-safe database access, automatic migration generation, and a visual schema browser. Multi-tenancy is implemented at the application level using a shared database with tenant ID isolation on every query. Redis serves as the caching layer for session management, frequently accessed configurations, and real-time features. File storage uses cloud object storage (S3-compatible) with signed URLs for secure document access.",
      "The authentication system uses JWT-based tokens with refresh token rotation, supporting multiple authentication strategies including email/password, social login (Google, Microsoft), and SAML SSO for enterprise clients. Role-based access control (RBAC) is enforced at both the API route level and the UI component level, with a hierarchical permission model supporting platform-wide, tenant-wide, company-wide, and department-level scopes. Middleware intercepts every request to validate authentication tokens and inject tenant context.",
      "The platform follows an event-driven architecture for cross-module communication. Domain events are published when significant state changes occur (employee hired, leave approved, payroll processed), and interested modules subscribe to these events for downstream processing. This decouples modules while maintaining data consistency. The workflow engine provides a visual builder for configuring business processes with conditional routing, parallel approvals, and automated actions.",
    ],
  },
  {
    title: "Development Setup", slug: "Development-Setup", tags: "development, environment, configuration",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Getting Started", siblings: "Home, Quick-Start-Guide, Architecture-Overview, Deployment-Guide", children: "",
    paragraphs: [
      "This page provides detailed instructions for setting up your NEXUS HRMS development environment. The project requires Node.js 20+ (we recommend using nvm for version management), PostgreSQL 15+ with the uuid-ossp and pgcrypto extensions enabled, and optionally Redis 7+ for caching and session management. Install the required system dependencies before proceeding with the application setup.",
      "After cloning the repository, run npm install to install all dependencies including development tools, testing frameworks, and Prisma CLI. The project uses a monorepo structure with all code in a single repository. Environment variables are managed through .env.local (gitignored) with .env.example serving as the template. Key variables include DATABASE_URL for PostgreSQL connection, NEXTAUTH_SECRET for authentication, NEXTAUTH_URL for the application base URL, and REDIS_URL for caching. Additional configuration for AI services, cloud storage, and email delivery is documented in the .env.example file.",
      "Database setup involves running npx prisma migrate dev which applies all pending migrations and generates the Prisma Client. The seed script at prisma/seed.ts populates the database with sample data including a super admin account, demo tenant, sample companies, branches, departments, and employees. For testing, run npx prisma migrate reset to wipe and reseed the database. Prisma Studio (npx prisma studio) provides a visual database browser useful during development.",
      "The development server supports hot module replacement for instant frontend updates and API route changes. Use npm run dev for the standard development server or npm run dev:turbo for the Turbopack-accelerated mode. The project includes ESLint for code quality, Prettier for formatting, and TypeScript strict mode for type safety. Pre-commit hooks via Husky run linting and type-checking on every commit. Configure your IDE to use the project's .prettierrc and .eslintrc settings for consistent code style.",
    ],
  },
  {
    title: "Deployment Guide", slug: "Deployment-Guide", tags: "deployment, production, release",
    lastUpdated: "2026-03-04", owner: "DevOps Team",
    parent: "Getting Started", siblings: "Home, Quick-Start-Guide, Architecture-Overview, Development-Setup", children: "Deployment-Procedures, Monitoring-Alerting, Backup-Recovery",
    paragraphs: [
      "NEXUS HRMS supports deployment to any Node.js-compatible hosting platform with PostgreSQL database access. The primary deployment target is Vercel, which provides seamless integration with Next.js features including serverless API routes, edge middleware, and automatic scaling. The project includes a vercel.json configuration file with optimized build settings, environment variable mappings, and deployment hooks. Alternative deployment targets include AWS (using EC2 or ECS), Docker containers, and self-hosted environments.",
      "The deployment pipeline follows a GitOps model with automated CI/CD through GitHub Actions. The production branch triggers automatic deployment to production, while the staging branch deploys to the staging environment for final validation. Every pull request generates a preview deployment with a unique URL for testing changes in isolation. The build process runs type checking, linting, unit tests, and integration tests before allowing deployment to proceed. Database migrations are applied automatically during the deployment process with rollback capabilities.",
      "Environment configuration differs between development, staging, and production. Critical variables like DATABASE_URL, NEXTAUTH_SECRET, and encryption keys must use different values in each environment. The deployment guide includes a comprehensive checklist of environment variables with descriptions and recommended values. Secret management uses encrypted environment variables in the CI/CD platform with no secrets stored in the codebase. All sensitive configuration is injected at deployment time.",
      "Post-deployment verification includes automated health checks on critical API endpoints, database connectivity tests, and authentication flow validation. The monitoring stack (detailed in the Operations section) provides real-time visibility into application health, performance metrics, and error rates. Rollback procedures allow reverting to any previous deployment within seconds using the platform's deployment history. Blue-green deployment support enables zero-downtime updates for major releases.",
    ],
  },
];

// ── Module Documentation Pages (generate all 40) ──
function generateModulePages() {
  return modules.map((mod, idx) => ({
    title: `Module: ${mod.name}`, slug: mod.slug, tags: `module, ${mod.name.toLowerCase()}, documentation`,
    lastUpdated: "2026-03-04", owner: "Module Team",
    parent: "Module Documentation", siblings: modules.filter(m => m.name !== mod.name).slice(0, 5).map(m => m.slug).join(", ") + ", ...",
    children: `${mod.slug}-overview, ${mod.slug}-features, ${mod.slug}-user-guide, ${mod.slug}-admin-guide, ${mod.slug}-api-reference, ${mod.slug}-faq, ${mod.slug}-troubleshooting`,
    paragraphs: [
      `The ${mod.name} module is a core component of NEXUS HRMS that ${mod.desc.toLowerCase()} This module integrates seamlessly with the broader HRMS ecosystem, sharing data through the event-driven architecture and maintaining consistency through the unified authentication and authorization framework. The module follows the platform's design system for consistent user experience and implements comprehensive audit logging for all data modifications.`,
      `Key features of the ${mod.name} module include role-based access control with granular permissions supporting multiple user roles from administrators to end users. The module provides a rich set of screens and workflows optimized for different user personas, ensuring that each stakeholder interacts with relevant functionality without unnecessary complexity. Integration with the workflow engine enables configurable approval processes, automated notifications, and escalation rules tailored to organizational policies.`,
      `Administrators can configure the ${mod.name} module through a dedicated settings panel that exposes all customization options without requiring code changes. Configuration includes role permissions, workflow definitions, notification templates, and integration settings with other modules. The module supports multi-company and multi-branch deployment, with configuration inheritance allowing global defaults with local overrides. All configuration changes are tracked in the audit log with full before/after comparison.`,
      `For developers, the ${mod.name} module exposes a comprehensive REST API documented in the API Reference section. API endpoints follow RESTful conventions with consistent request/response formats, pagination support, and comprehensive error codes. The module's database schema integrates with the Prisma ORM model, and all database queries go through the service layer to enforce business rules and data validation. Refer to the technical reference pages for API documentation and database schema details.`,
      `Common troubleshooting scenarios for the ${mod.name} module are documented in the module-specific troubleshooting guide. The most frequent issues relate to permission configuration, workflow setup, and integration data mapping. The FAQ section addresses common questions from both administrators and end users. If you encounter an issue not covered in the documentation, please create a ticket in the Helpdesk module or reach out to the module maintenance team through the designated Slack channel.`,
    ],
  }));
}

// ── Technical Reference Pages ──
const techRefPages = [
  {
    title: "API Documentation", slug: "API-Documentation", tags: "api, rest, endpoints, reference",
    lastUpdated: "2026-03-04", owner: "API Team",
    parent: "Technical Reference", siblings: "Database-Schema, Authentication-Authorization, State-Management, Component-Library, Design-System, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "The NEXUS HRMS API follows RESTful design principles with JSON request and response bodies. All API endpoints are versioned using URL path versioning (e.g., /api/v1/employees) to support backward compatibility as the platform evolves. Authentication is required for all endpoints except public health checks and the login endpoint, using Bearer token authentication with JWT tokens obtained through the authentication flow. Rate limiting is enforced per-tenant with configurable thresholds based on subscription tier.",
      "API responses use a consistent envelope format with status, data, meta, and error fields. The status field indicates success or failure, data contains the response payload, meta provides pagination information for list endpoints, and error contains detailed error information when applicable. List endpoints support pagination with page and limit parameters, sorting with sort and order parameters, and filtering with field-specific query parameters. All timestamps are returned in ISO 8601 format with UTC timezone.",
      "Error responses include a machine-readable error code, a human-readable message, and a details array with field-level validation errors for input validation failures. Common error codes include AUTH_REQUIRED for missing authentication, FORBIDDEN for insufficient permissions, NOT_FOUND for missing resources, VALIDATION_ERROR for input validation failures, and RATE_LIMITED for exceeding request thresholds. The API documentation includes complete request/response examples for every endpoint with cURL commands and SDK usage samples.",
      "The API supports bulk operations for high-throughput scenarios, including bulk create, update, and delete endpoints for applicable resources. Bulk operations accept arrays of items and return per-item success/failure status. Long-running operations use an asynchronous pattern with job IDs that can be polled for completion status. Webhook support enables real-time notifications when specific events occur, with configurable retry policies and signature verification for security.",
    ],
  },
  {
    title: "Database Schema", slug: "Database-Schema", tags: "database, schema, prisma, postgresql",
    lastUpdated: "2026-03-04", owner: "Architecture Team",
    parent: "Technical Reference", siblings: "API-Documentation, Authentication-Authorization, State-Management, Component-Library, Design-System, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "The NEXUS HRMS database uses PostgreSQL 15+ with Prisma ORM for type-safe data access and automatic migration management. The schema follows a multi-tenant architecture where every tenant-scoped table includes a tenantId column that enforces data isolation at the application level. Prisma middleware automatically injects tenant filtering on every query to prevent cross-tenant data leakage. The schema includes over 80 tables covering the complete HR domain from employee records through payroll processing.",
      "Core entity tables include User, Employee, Company, Branch, Department, Designation, and Tenant. These foundational tables establish the organizational hierarchy and serve as foreign key references for virtually all other entities. The schema uses UUID primary keys for all tables, ensuring globally unique identifiers that support distributed systems and data migration scenarios. Timestamps (createdAt, updatedAt) are automatically managed by Prisma on all tables, and soft deletion is implemented using a deletedAt nullable timestamp field.",
      "Relationship modeling uses Prisma's declarative relation syntax with explicit foreign keys and cascade rules. One-to-many relationships (Company to Branch, Department to Employee) use standard foreign key references. Many-to-many relationships (Employee to Skills, Employee to Projects) use explicit junction tables with additional attributes. Self-referential relationships (Employee to Manager, Department to Parent Department) support hierarchical data structures. The schema includes comprehensive indexes on frequently queried fields and composite indexes for common filter combinations.",
      "Database migrations are managed through Prisma Migrate with all migrations stored in the prisma/migrations directory. Each migration includes both the SQL migration file and a lock file to prevent concurrent migration conflicts. The migration history serves as an audit trail of schema changes. For production deployments, migrations are applied as part of the CI/CD pipeline with automatic rollback on failure. Custom SQL migrations can be added for complex schema changes that exceed Prisma's declarative capabilities.",
    ],
  },
  {
    title: "Authentication & Authorization", slug: "Authentication-Authorization", tags: "auth, rbac, permissions, security",
    lastUpdated: "2026-03-04", owner: "Security Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, State-Management, Component-Library, Design-System, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "NEXUS HRMS implements a comprehensive authentication and authorization system built on NextAuth.js with custom extensions for multi-tenant support. Authentication supports multiple strategies: email/password with bcrypt hashing and optional two-factor authentication, social login through Google and Microsoft OAuth providers, and SAML 2.0 SSO for enterprise clients. JWT access tokens have a configurable expiration (default 15 minutes) with refresh token rotation for seamless session continuity without compromising security.",
      "Authorization follows a hierarchical Role-Based Access Control (RBAC) model with four permission scopes: Platform (super admin operations), Tenant (organization-wide operations), Company (company-level operations), and Department (team-level operations). Each role consists of a set of permissions that map to specific API endpoints and UI components. The permission system supports fine-grained access control including field-level permissions (e.g., viewing salary details requires explicit permission even with employee read access).",
      "Middleware intercepts every API request to validate authentication tokens, resolve tenant context, and check authorization permissions. The middleware pipeline processes requests in order: token validation, tenant resolution, permission checking, and request enrichment. Failed authentication returns 401 Unauthorized, while insufficient permissions return 403 Forbidden with a detailed message indicating which permission is required. The middleware also handles rate limiting, request logging, and audit trail generation.",
      "Session management supports concurrent sessions with device tracking, allowing administrators to view and terminate active sessions. Password policies are configurable per tenant including minimum length, complexity requirements, rotation intervals, and history enforcement. Account lockout triggers after configurable failed login attempts with exponential backoff. All authentication events are logged to the audit system including successful logins, failed attempts, password changes, and session terminations.",
    ],
  },
  {
    title: "State Management", slug: "State-Management", tags: "state, zustand, context, data-flow",
    lastUpdated: "2026-03-04", owner: "Frontend Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, Authentication-Authorization, Component-Library, Design-System, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "NEXUS HRMS uses a layered state management strategy combining Zustand for global client state, React Context for component-level state, and TanStack Query (React Query) for server state management. This separation ensures optimal performance by minimizing unnecessary re-renders and providing clear data flow patterns. Server state (API data) is managed exclusively through TanStack Query with automatic caching, background refetching, and optimistic updates.",
      "The Zustand store is organized into domain-specific slices: authStore for authentication state (user, tokens, permissions), appStore for application-wide UI state (theme, sidebar, notifications), and notificationStore for real-time notification management. Each store slice follows a consistent pattern with typed actions, selectors for optimized component subscriptions, and middleware for persistence and devtools integration. Stores are initialized with default values and hydrated from the API on application startup.",
      "TanStack Query handles all API communication with automatic caching, deduplication, and background refetching. Query keys follow a hierarchical structure [module, resource, id?, params?] that enables efficient cache invalidation. Mutations use optimistic updates to provide instant UI feedback before server confirmation, with automatic rollback on failure. Prefetching is implemented for anticipated user navigation paths using the query client's prefetchQuery method. Cache stale time and garbage collection are configured per module based on data freshness requirements.",
      "Real-time state updates are handled through Server-Sent Events (SSE) for notifications and WebSocket connections for collaborative features like simultaneous editing. The notification system maintains a persistent connection that pushes updates to the notification store, which then triggers UI updates through Zustand subscriptions. For offline scenarios, the application queues mutations in IndexedDB and replays them when connectivity is restored, using conflict resolution strategies based on last-write-wins with server authority.",
    ],
  },
  {
    title: "Component Library", slug: "Component-Library", tags: "components, ui, shadcn, design-system",
    lastUpdated: "2026-03-04", owner: "Frontend Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, Authentication-Authorization, State-Management, Design-System, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "The NEXUS HRMS component library is built on shadcn/ui, a collection of reusable components implemented with Radix UI primitives and styled with Tailwind CSS. This approach provides fully accessible, customizable components without the constraints of a traditional component library. Components are copied into the project source code, enabling direct modification and extension while maintaining compatibility with upstream updates.",
      "The library includes over 50 base components organized into categories: Form Controls (Input, Select, Checkbox, Radio, DatePicker, FileUpload), Data Display (Table, Card, Badge, Avatar, Tooltip, DescriptionList), Navigation (Tabs, Breadcrumb, Sidebar, CommandPalette, Pagination), Feedback (Dialog, Toast, Alert, Progress, Skeleton), and Layout (Resizable, ScrollArea, Accordion, Collapsible). Each component supports consistent theming through CSS custom properties and Tailwind's design token system.",
      "HRMS-specific composite components build on the base library to provide domain-specific UI patterns. These include EmployeeCard, OrgChart, LeaveCalendar, TimesheetGrid, PayrollSummary, and WorkflowBuilder. Composite components encapsulate complex interactions and data fetching logic while maintaining a clean prop-based API. All components support keyboard navigation, screen reader compatibility, and responsive design across desktop, tablet, and mobile viewports.",
      "Component development follows a strict quality checklist: TypeScript types for all props and events, Storybook stories for visual documentation and testing, unit tests covering user interactions and edge cases, accessibility audit using axe-core, and visual regression testing using Chromatic. New components must pass all quality gates before being merged. The component library documentation includes usage examples, prop reference tables, and migration guides for breaking changes.",
    ],
  },
  {
    title: "Design System", slug: "Design-System", tags: "design, tokens, theme, branding",
    lastUpdated: "2026-03-04", owner: "Design Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, Authentication-Authorization, State-Management, Component-Library, Error-Handling, Testing-Guide",
    children: "",
    paragraphs: [
      "The NEXUS HRMS Design System establishes the visual language and interaction patterns that ensure consistency across all 40+ modules. Built on Tailwind CSS 4 with custom design tokens, the system defines the color palette, typography scale, spacing system, iconography, and motion guidelines. Design tokens are defined as CSS custom properties in the globals.css file, enabling runtime theming and per-tenant brand customization without rebuilding the application.",
      "The color system uses a semantic token approach where colors are named by purpose rather than value: --color-primary, --color-secondary, --color-accent, --color-success, --color-warning, --color-error, and --color-surface. Each semantic token maps to a palette value that can be overridden per tenant for white-label deployments. Dark mode support is built into the design system with automatic token remapping based on the user's system preference or manual toggle. All color combinations meet WCAG 2.1 AA contrast requirements.",
      "Typography follows a modular scale with base font size 14px (0.875rem) and a 1.25 ratio for heading levels. The primary typeface is Inter for Latin characters and Microsoft YaHei for CJK text, with system fonts as fallbacks. Heading styles are predefined as Tailwind utility classes (text-h1 through text-h6) with consistent weight, letter-spacing, and line-height. Body text uses font-size 14px with 1.5 line-height for optimal readability in data-dense interfaces.",
      "The spacing system uses a 4px base unit with a consistent scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. All padding, margins, and gaps use values from this scale to maintain visual rhythm. Component dimensions follow an 8px grid for vertical rhythm and a flexible grid system for horizontal layout. The design system documentation includes Figma files with all components, tokens, and usage guidelines, accessible to both designers and developers for seamless collaboration.",
    ],
  },
  {
    title: "Error Handling", slug: "Error-Handling", tags: "errors, exceptions, logging, debugging",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, Authentication-Authorization, State-Management, Component-Library, Design-System, Testing-Guide",
    children: "",
    paragraphs: [
      "NEXUS HRMS implements a comprehensive error handling strategy that spans the entire application stack from API routes through the UI layer. Server-side errors are captured using a custom error class hierarchy that includes AppError as the base class with specialized subclasses for ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, and RateLimitError. Each error class includes a machine-readable code, HTTP status code, user-friendly message, and optional details array for field-level validation errors.",
      "API route handlers use a consistent try-catch pattern with a centralized error middleware that formats error responses according to the API specification. Unhandled exceptions are caught by a global error handler that logs the full stack trace, generates a unique error reference ID, and returns a sanitized response to the client without exposing internal implementation details. The error reference ID enables support teams to trace the error in the logging system without exposing sensitive information to the client.",
      "Client-side error handling uses React Error Boundaries at the page and component level to catch rendering errors and display fallback UIs. API errors from TanStack Query mutations are handled through the onError callback, which displays toast notifications with actionable error messages. Network errors trigger automatic retry with exponential backoff for idempotent operations. The application includes a global error boundary that catches unexpected errors and displays a user-friendly error page with a retry button and a link to the helpdesk.",
      "Logging and monitoring are integrated with the error handling system. All server-side errors are logged with structured JSON format including timestamp, error code, message, stack trace, request context (tenant, user, endpoint), and error reference ID. Logs are shipped to the centralized logging platform (ELK stack) for search and analysis. Error rate alerting triggers notifications when error rates exceed configurable thresholds, enabling proactive incident response before users report issues.",
    ],
  },
  {
    title: "Testing Guide", slug: "Testing-Guide", tags: "testing, jest, playwright, quality",
    lastUpdated: "2026-03-04", owner: "QA Team",
    parent: "Technical Reference", siblings: "API-Documentation, Database-Schema, Authentication-Authorization, State-Management, Component-Library, Design-System, Error-Handling",
    children: "",
    paragraphs: [
      "The NEXUS HRMS testing strategy follows the testing pyramid model with a strong foundation of unit tests, a middle layer of integration tests, and a targeted set of end-to-end tests. Unit tests use Jest with React Testing Library for component testing and Jest for service and utility function testing. Integration tests verify API route behavior using Next.js test utilities with a test database. E2E tests use Playwright for browser automation covering critical user journeys across all major modules.",
      "Unit test coverage targets are set at 80% for service layers, 70% for React components, and 90% for utility functions. Tests are co-located with source files using the .test.ts/.test.tsx naming convention. Mocking follows a consistent pattern: Prisma client is mocked at the module level, external API calls are mocked using MSW (Mock Service Worker), and React hooks are tested using the renderHook utility. Test data is generated using factory functions that produce valid test objects with sensible defaults and overridable fields.",
      "API integration tests verify the complete request-response cycle including authentication, authorization, validation, business logic, and database operations. Tests run against a dedicated test database that is reset between test suites using Prisma's migrate reset command. Each test suite handles its own test data setup and cleanup using transaction-based rollbacks for isolation. API tests cover happy paths, edge cases, validation errors, permission failures, and concurrent access scenarios.",
      "End-to-end tests with Playwright cover critical user journeys: login and authentication flows, employee CRUD operations, leave request and approval workflows, payroll processing, and report generation. E2E tests run against a fully provisioned test environment with seeded data. Tests are organized by user role (super admin, HR manager, employee) to ensure each persona's experience is validated. The E2E test suite runs on every pull request and as part of the nightly regression suite, with visual comparison screenshots for UI consistency verification.",
    ],
  },
];

// ── Operations Pages ──
const operationsPages = [
  {
    title: "Deployment Procedures", slug: "Deployment-Procedures", tags: "deployment, release, ci-cd, production",
    lastUpdated: "2026-03-04", owner: "DevOps Team",
    parent: "Operations", siblings: "Monitoring-Alerting, Backup-Recovery, Incident-Response, Security-Protocols, Performance-Optimization",
    children: "",
    paragraphs: [
      "Deployment procedures for NEXUS HRMS follow a structured, automated pipeline that ensures reliable and consistent releases across all environments. The CI/CD pipeline is implemented using GitHub Actions with separate workflows for continuous integration, staging deployment, and production deployment. Every code change triggers the CI workflow which runs type checking, linting, unit tests, and builds the application. Only changes that pass all quality gates are eligible for deployment.",
      "The staging environment receives automatic deployments from the staging branch and serves as the final validation step before production. Staging mirrors the production environment including database configuration, external service integrations, and performance characteristics. QA teams perform smoke tests and regression testing on staging before approving a production release. The production deployment workflow requires manual approval from a release manager, ensuring human oversight for production changes.",
      "Production deployments use a rolling update strategy with health check validation between batches. The deployment process includes pre-deployment database migrations (applied by Prisma Migrate), application deployment via Vercel's deployment API, post-deployment health checks on critical endpoints, and automated smoke test execution. If any step fails, the deployment automatically rolls back to the previous version. Deployment windows are scheduled during low-traffic periods, though the zero-downtime deployment capability allows releases at any time for critical fixes.",
      "Emergency hotfix procedures follow an expedited path with a dedicated hotfix branch workflow. Hotfixes branch from the production tag, include only the minimal fix, and go through an accelerated review process (one approver instead of two). The hotfix is deployed directly to production after CI validation and then back-merged into the staging and main branches. All hotfix deployments are logged with root cause analysis documentation required within 24 hours of the incident resolution.",
    ],
  },
  {
    title: "Monitoring & Alerting", slug: "Monitoring-Alerting", tags: "monitoring, alerting, observability, metrics",
    lastUpdated: "2026-03-04", owner: "DevOps Team",
    parent: "Operations", siblings: "Deployment-Procedures, Backup-Recovery, Incident-Response, Security-Protocols, Performance-Optimization",
    children: "",
    paragraphs: [
      "The NEXUS HRMS monitoring stack provides comprehensive observability across the application, infrastructure, and business layers. Application Performance Monitoring (APM) uses a combination of Vercel Analytics for frontend performance, custom metrics exporters for API response times and error rates, and structured logging for request tracing. Infrastructure monitoring covers CPU, memory, disk, and network metrics for all services including the PostgreSQL database, Redis cache, and application servers.",
      "Alerting is configured using a severity-based classification system. Critical alerts (P1) indicate service outages or data integrity issues that require immediate response within 15 minutes. High alerts (P2) indicate degraded performance or partial functionality loss with a 1-hour response target. Medium alerts (P3) indicate anomalies or trends that need investigation within 4 hours. Low alerts (P4) are informational and reviewed during business hours. Alert routing sends P1/P2 alerts to the on-call engineer via PagerDuty, while P3/P4 alerts go to the team Slack channel.",
      "Dashboard visualization uses Grafana with pre-built dashboards for application health, API performance, database metrics, business KPIs, and tenant-specific monitoring. Real-time dashboards display current system status with 1-minute metric granularity, while historical dashboards support trend analysis with configurable time ranges. Each tenant has a dedicated dashboard view showing their usage metrics, active users, API call volume, and resource consumption against their subscription limits.",
      "Log aggregation uses the ELK stack (Elasticsearch, Logstash, Kibana) with structured JSON logging across all services. Application logs include request IDs for distributed tracing across API boundaries. Log retention follows a tiered policy: hot storage (7 days) for active querying, warm storage (90 days) for recent investigations, and cold storage (1 year) for compliance and audit requirements. Log search and analysis are available through Kibana with pre-built search templates for common investigation scenarios.",
    ],
  },
  {
    title: "Backup & Recovery", slug: "Backup-Recovery", tags: "backup, recovery, disaster, data-protection",
    lastUpdated: "2026-03-04", owner: "DevOps Team",
    parent: "Operations", siblings: "Deployment-Procedures, Monitoring-Alerting, Incident-Response, Security-Protocols, Performance-Optimization",
    children: "",
    paragraphs: [
      "The NEXUS HRMS backup strategy implements a multi-layered data protection approach ensuring business continuity and disaster recovery capabilities. PostgreSQL database backups use continuous WAL (Write-Ahead Log) archiving with point-in-time recovery (PITR) capability, allowing restoration to any second within the retention period. Full database snapshots are taken daily at 02:00 UTC and retained for 30 days. WAL archives are retained for 7 days, providing granular recovery within the past week.",
      "File storage backups use cloud provider snapshot capabilities with cross-region replication for disaster recovery. All uploaded documents, generated reports, and template files are replicated to a secondary region with a replication lag under 15 minutes. File versioning is enabled, maintaining historical versions for 90 days to support accidental deletion recovery. Backup integrity verification runs weekly, restoring a random sample to a test environment and validating data completeness and consistency.",
      "Disaster recovery procedures are documented and tested quarterly through simulated disaster scenarios. The Recovery Point Objective (RPO) is 1 hour, meaning at most 1 hour of data may be lost in a catastrophic failure. The Recovery Time Objective (RTO) is 4 hours for full platform restoration and 1 hour for critical functionality restoration using the failover environment. The failover environment in the secondary region maintains a warm standby with continuously replicated data that can be promoted to primary within minutes.",
      "Recovery procedures are categorized by scope: single-tenant recovery for tenant-specific data corruption, partial recovery for individual table or module data restoration, and full platform recovery for complete system failure. Single-tenant recovery uses the tenant-specific backup export functionality that creates a self-contained data package. Partial recovery uses PITR with table-level restoration from backups. Full platform recovery follows the documented runbook with automated scripts for infrastructure provisioning, database restoration, and service configuration.",
    ],
  },
  {
    title: "Incident Response", slug: "Incident-Response", tags: "incident, response, on-call, escalation",
    lastUpdated: "2026-03-04", owner: "DevOps Team",
    parent: "Operations", siblings: "Deployment-Procedures, Monitoring-Alerting, Backup-Recovery, Security-Protocols, Performance-Optimization",
    children: "",
    paragraphs: [
      "The NEXUS HRMS incident response process follows a structured methodology to minimize service disruption and ensure rapid resolution. Incidents are classified by severity: SEV1 (critical service outage affecting all users), SEV2 (major feature degradation or multi-tenant impact), SEV3 (minor feature issue affecting single tenant or limited users), and SEV4 (cosmetic or non-urgent issues). Each severity level has defined response time targets: SEV1 requires initial response within 15 minutes, SEV2 within 1 hour, SEV3 within 4 hours, and SEV4 within 24 hours.",
      "The on-call rotation ensures 24/7 coverage with a primary on-call engineer and a secondary backup. On-call engineers receive automated alert notifications via PagerDuty with escalation policies that escalate unacknowledged alerts after 5 minutes to the secondary on-call and after 15 minutes to the engineering manager. The on-call handoff occurs weekly with a synchronous briefing covering known issues, ongoing investigations, and any temporary monitoring adjustments. On-call engineers have access to runbooks for common incidents and escalation contacts for vendor support.",
      "Incident communication follows a predefined template for both internal and external notifications. For SEV1 and SEV2 incidents, a status page update is posted within 15 minutes of incident declaration, with updates every 30 minutes until resolution. Internal communication uses a dedicated Slack incident channel with automated creation on SEV1 declaration. Stakeholder notifications include the incident summary, current impact assessment, estimated time to resolution, and next update time. Post-incident, a customer-facing incident report is published within 48 hours.",
      "Post-incident review (PIR) is mandatory for all SEV1 and SEV2 incidents and recommended for SEV3. The PIR follows a blameless methodology focused on systemic improvements rather than individual fault. The review document includes an incident timeline, root cause analysis (using the 5 Whys methodology), impact assessment, what went well, what could be improved, and action items with owners and due dates. Action items are tracked in the project management system and reviewed weekly until completion. Patterns across incidents are analyzed quarterly to identify systemic improvements.",
    ],
  },
  {
    title: "Security Protocols", slug: "Security-Protocols", tags: "security, protocols, compliance, encryption",
    lastUpdated: "2026-03-04", owner: "Security Team",
    parent: "Operations", siblings: "Deployment-Procedures, Monitoring-Alerting, Backup-Recovery, Incident-Response, Performance-Optimization",
    children: "",
    paragraphs: [
      "NEXUS HRMS security protocols are designed to protect sensitive HR data across the entire application stack. The security framework is based on the principle of defense in depth, implementing multiple layers of protection including network security, application security, data encryption, access control, and audit logging. All security measures comply with GDPR, SOC 2 Type II, and ISO 27001 requirements, with annual third-party audits validating compliance.",
      "Data encryption is enforced both at rest and in transit. All database connections use TLS 1.3, and API communication enforces HTTPS with HSTS headers. Sensitive data fields (SSN, bank account numbers, salary details) are encrypted at the application level using AES-256-GCM before storage, with encryption keys managed through a hardware security module (HSM). Database-level encryption uses PostgreSQL's Transparent Data Encryption (TDE) for full-disk protection. Encryption key rotation follows a 90-day cycle with zero-downtime re-encryption.",
      "Access control follows the principle of least privilege with regular access reviews. Super admin access requires multi-factor authentication and is audited quarterly. Production database access is restricted to break-glass procedures that require approval and automatically expire after 4 hours. API key management uses short-lived tokens with automatic rotation. Network security implements VPC isolation, security groups with minimal inbound rules, and a Web Application Firewall (WAF) with OWASP Core Rule Set protection.",
      "Vulnerability management includes automated dependency scanning (Snyk), static application security testing (SAST) in the CI pipeline, dynamic application security testing (DAST) during staging deployment, and annual penetration testing by a certified third party. Security patching follows a risk-based SLA: critical vulnerabilities are patched within 24 hours, high within 72 hours, and medium within 30 days. The security team maintains a vulnerability register and tracks remediation progress through the security dashboard.",
    ],
  },
  {
    title: "Performance Optimization", slug: "Performance-Optimization", tags: "performance, optimization, caching, scalability",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Operations", siblings: "Deployment-Procedures, Monitoring-Alerting, Backup-Recovery, Incident-Response, Security-Protocols",
    children: "",
    paragraphs: [
      "NEXUS HRMS performance optimization focuses on delivering sub-200ms API response times and sub-2-second page load times across all modules. The optimization strategy addresses four key areas: database query performance, API response caching, frontend rendering optimization, and infrastructure scaling. Performance benchmarks are established for each module and monitored continuously with automated alerts when metrics degrade beyond defined thresholds.",
      "Database performance optimization starts with proper indexing strategy. All foreign keys are indexed, and composite indexes cover common query patterns identified through query analysis. Slow query monitoring logs queries exceeding 100ms with execution plans for analysis. Query optimization techniques include selective field loading (avoiding SELECT *), pagination for all list endpoints, batch loading for N+1 query prevention, and materialized views for complex aggregation queries. Connection pooling uses PgBouncer with configurable pool sizes per environment.",
      "Caching is implemented at multiple levels using Redis as the primary cache store. Application-level caching stores frequently accessed configurations, permission sets, and organizational structures with TTL-based expiration. HTTP caching uses Cache-Control headers with ETags for conditional requests. API response caching implements a two-tier strategy: short-lived cache (30 seconds) for frequently changing data and long-lived cache (5 minutes) for relatively static data. Cache invalidation follows a tag-based pattern where updates to source data invalidate all related cache entries.",
      "Frontend performance optimization includes code splitting with dynamic imports for module-level lazy loading, image optimization using Next.js Image component with automatic format conversion (WebP/AVIF), and font optimization with preload hints. React rendering optimization uses memo, useMemo, and useCallback strategically to prevent unnecessary re-renders. Bundle analysis is integrated into the CI pipeline, alerting when bundle size increases beyond 5% on any route. Core Web Vitals (LCP, FID, CLS) are monitored through Real User Monitoring (RUM) with performance budgets enforced per route.",
    ],
  },
];

// ── Contributing Pages ──
const contributingPages = [
  {
    title: "Code of Conduct", slug: "Code-of-Conduct", tags: "conduct, community, standards, behavior",
    lastUpdated: "2026-03-04", owner: "Community Team",
    parent: "Contributing", siblings: "Contributing-Guidelines, Code-Review-Process, Branch-Strategy, Release-Process, Documentation-Standards",
    children: "",
    paragraphs: [
      "The NEXUS HRMS project is committed to providing a welcoming, inclusive, and harassment-free experience for everyone who participates in our community. This Code of Conduct applies to all project spaces including GitHub repositories, issue trackers, pull request discussions, Slack channels, and any other forum where the community represents the project. By participating, you agree to uphold these standards and help create a positive environment for collaboration.",
      "We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community. Expected behavior includes demonstrating empathy and kindness toward other people, being respectful of differing opinions and viewpoints, giving and gracefully accepting constructive feedback, accepting responsibility for mistakes and apologizing to those affected, and focusing on what is best for the overall community. We prioritize marginalized people's safety over privileged people's comfort.",
      "Unacceptable behavior includes the use of sexualized language or imagery, trolling, insulting or derogatory comments, personal or political attacks, public or private harassment, publishing others' private information without explicit permission, and any other conduct that could reasonably be considered inappropriate in a professional setting. Community leaders are responsible for clarifying and enforcing standards of acceptable behavior and will take appropriate corrective action in response to any behavior deemed inappropriate.",
      "Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project leadership team via the confidential reporting channel. All complaints will be reviewed and investigated promptly and fairly. The project leadership is committed to maintaining confidentiality with regard to the reporter of an incident. Enforcement actions may include warning, temporary ban, or permanent expulsion from project spaces, determined by the severity and context of the violation.",
    ],
  },
  {
    title: "Contributing Guidelines", slug: "Contributing-Guidelines", tags: "contributing, guidelines, pr, development",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Contributing", siblings: "Code-of-Conduct, Code-Review-Process, Branch-Strategy, Release-Process, Documentation-Standards",
    children: "",
    paragraphs: [
      "Thank you for your interest in contributing to NEXUS HRMS! This guide provides the essential information you need to make effective contributions to the project. All contributions, whether code, documentation, bug reports, or feature suggestions, are valued and help make NEXUS HRMS better for everyone. Before submitting your first contribution, please read this guide thoroughly and ensure you understand the project conventions and review process.",
      "To contribute code, start by forking the repository and creating a feature branch from the main branch following our branch naming convention (feature/description, fix/description, or docs/description). Implement your changes with appropriate test coverage and ensure all existing tests pass. Follow the project's coding standards enforced by ESLint and Prettier. Commit messages should follow the Conventional Commits specification (feat:, fix:, docs:, refactor:, test:, chore:) with a concise description in the imperative mood.",
      "Pull requests should target the main branch and include a clear description of the changes, motivation for the change, related issue references, and testing instructions. Small, focused pull requests are preferred over large, multi-concern changes. If a change requires significant refactoring, consider splitting it into a preparation PR followed by the feature PR. All pull requests require at least two approvals from code owners before merging, and CI checks must pass. Draft pull requests are welcome for early feedback.",
      "Documentation contributions are equally important as code contributions. When adding features or changing behavior, update the relevant wiki pages and API documentation. Follow the documentation standards outlined in the Documentation Standards page. Bug reports should include a clear description of the issue, steps to reproduce, expected behavior, actual behavior, and environment details. Feature requests should describe the problem being solved, the proposed solution, and any alternative approaches considered.",
    ],
  },
  {
    title: "Code Review Process", slug: "Code-Review-Process", tags: "review, quality, approval, standards",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Contributing", siblings: "Code-of-Conduct, Contributing-Guidelines, Branch-Strategy, Release-Process, Documentation-Standards",
    children: "",
    paragraphs: [
      "Code review is a critical quality gate in the NEXUS HRMS development process, ensuring that all code changes meet our standards for correctness, security, performance, and maintainability. Every code change must be reviewed by at least two team members before merging, with at least one reviewer being a designated code owner for the affected module. The review process is designed to be thorough yet efficient, with target review completion times of 24 hours for standard PRs and 4 hours for urgent fixes.",
      "Reviewers evaluate changes across multiple dimensions: correctness (does the code do what it claims?), security (does it introduce vulnerabilities?), performance (does it maintain acceptable performance?), readability (can others understand and maintain the code?), testing (are there adequate tests?), and documentation (are changes documented?). Reviewers use a standardized checklist aligned with these dimensions, available as a PR template. Specific attention is given to authentication/authorization changes, database query efficiency, and error handling completeness.",
      "The review workflow follows a structured process. The author submits the PR with a self-review, addressing any obvious issues before requesting reviewers. Reviewers examine the code, leave inline comments with specific feedback, and indicate whether changes are required (request changes) or optional (comments). The author addresses all required changes and responds to all comments. After addressing feedback, the author requests re-review. Once all reviewers approve, the PR can be merged using the squash-and-merge strategy to maintain a clean main branch history.",
      "Review etiquette guidelines ensure a constructive and respectful process. Authors should make their PRs easy to review by keeping them focused, providing context in the description, and responding promptly to feedback. Reviewers should provide actionable feedback, explain the reasoning behind suggestions, and distinguish between required changes and optional improvements. Disagreements are resolved through discussion in the PR, with escalation to the tech lead if consensus cannot be reached. Personal attacks, dismissive language, or unconstructive criticism are not tolerated.",
    ],
  },
  {
    title: "Branch Strategy", slug: "Branch-Strategy", tags: "git, branching, workflow, version-control",
    lastUpdated: "2026-03-04", owner: "Platform Team",
    parent: "Contributing", siblings: "Code-of-Conduct, Contributing-Guidelines, Code-Review-Process, Release-Process, Documentation-Standards",
    children: "",
    paragraphs: [
      "NEXUS HRMS follows a trunk-based development model with short-lived feature branches, enabling continuous integration while maintaining main branch stability. The main branch represents the current development state and should always be in a deployable condition. All changes are integrated through feature branches that are created from main, developed with frequent commits, and merged back through pull requests after code review and CI validation.",
      "Branch naming follows a structured convention to communicate intent and facilitate tracking. Feature branches use the format feature/JIRA-ID-short-description (e.g., feature/NEXUS-1234-leave-balance-api). Bug fix branches use fix/JIRA-ID-description. Documentation branches use docs/description. Hotfix branches for production fixes use hotfix/JIRA-ID-description. Release branches use release/vX.Y.Z. All branch names must be lowercase with hyphens as separators and include the JIRA ticket ID when applicable.",
      "Feature branches should be short-lived, ideally merged within 3-5 business days. Long-running feature branches risk merge conflicts and integration issues. For features requiring extended development, use feature flags to merge incomplete work behind a disabled flag, enabling continuous integration without exposing unfinished functionality. Feature flags are managed through the Settings module and can be toggled per environment without code deployment.",
      "Merge strategy uses squash-and-merge for all feature branches to maintain a clean, linear history on main. Each merged PR becomes a single commit on main with the PR title as the commit message. This approach simplifies bisecting, reversion, and history navigation. The release branch is created from main for each release cycle and receives only cherry-picked bug fixes after code freeze. Hotfix branches are created from the release tag and merged directly to main and the current release branch.",
    ],
  },
  {
    title: "Release Process", slug: "Release-Process", tags: "release, versioning, changelog, deployment",
    lastUpdated: "2026-03-04", owner: "Release Manager",
    parent: "Contributing", siblings: "Code-of-Conduct, Contributing-Guidelines, Code-Review-Process, Branch-Strategy, Documentation-Standards",
    children: "",
    paragraphs: [
      "NEXUS HRMS follows semantic versioning (SemVer) with a structured release process that balances velocity with stability. Version numbers follow the MAJOR.MINOR.PATCH format where MAJOR indicates breaking changes, MINOR indicates new features with backward compatibility, and PATCH indicates bug fixes. Pre-release versions use the format X.Y.Z-alpha.N, X.Y.Z-beta.N, or X.Y.Z-rc.N for alpha, beta, and release candidate phases respectively.",
      "The release cycle operates on a two-week sprint cadence with a minor release at the end of each sprint. The release process begins with a code freeze on Wednesday of the second week, after which only bug fixes and documentation updates are accepted for the release. Thursday is dedicated to QA validation, regression testing, and staging deployment verification. Friday is the release day when the production deployment occurs during the maintenance window. Patch releases for critical bug fixes follow an expedited process and can be released at any time.",
      "Each release includes a changelog generated from the conventional commit messages, organized into sections: Features, Bug Fixes, Performance Improvements, and Breaking Changes. The changelog is automatically generated using the standard-version tool and manually reviewed by the release manager. Breaking changes are prominently highlighted with migration instructions. The changelog is published to the wiki, GitHub Releases page, and distributed via email to subscribed stakeholders.",
      "Post-release activities include monitoring production metrics for 48 hours, updating the wiki with release-specific documentation changes, closing the release milestone in the project tracker, and conducting a release retrospective. The retrospective evaluates the release process effectiveness, identifies any issues encountered during deployment, and generates improvement action items. Release artifacts including deployment packages, database migration scripts, and configuration snapshots are archived for audit and rollback purposes.",
    ],
  },
  {
    title: "Documentation Standards", slug: "Documentation-Standards", tags: "documentation, standards, wiki, writing",
    lastUpdated: "2026-03-04", owner: "Documentation Team",
    parent: "Contributing", siblings: "Code-of-Conduct, Contributing-Guidelines, Code-Review-Process, Branch-Strategy, Release-Process",
    children: "",
    paragraphs: [
      "Documentation standards for NEXUS HRMS ensure consistency, completeness, and usability across all wiki pages and technical documentation. Every documentation page must include a standard header with the page title, URL slug, tags, last updated date, page owner, and navigation links (parent, siblings, children). This metadata enables automated documentation management including stale page detection, ownership tracking, and navigation generation.",
      "Writing style follows a professional, clear, and concise approach. Use present tense and active voice for descriptions and instructions. Avoid jargon unless the audience is specifically technical, in which case define terms on first use. Organize content with descriptive headings that enable scanning. Code examples must be complete, runnable, and include comments for non-obvious steps. Screenshots and diagrams should accompany complex procedures, using consistent annotation styles with numbered callouts for sequential steps.",
      "Wiki page templates are provided for each documentation type: Module Documentation, API Reference, Workflow Documentation, Troubleshooting Guide, FAQ, Release Notes, Contributing Guide, and Security Advisory. Each template defines the required sections, formatting guidelines, and example content. New pages must start from the appropriate template to ensure structural consistency. Template customization is allowed for module-specific needs, but core sections must be preserved.",
      "Documentation review follows the same quality process as code review. All documentation changes are submitted as pull requests and reviewed for accuracy, completeness, and adherence to style guidelines. Technical accuracy must be verified by a subject matter expert. Documentation is considered a first-class deliverable with the same importance as code, and incomplete documentation blocks feature releases. Automated checks validate that new features include corresponding documentation updates and that existing documentation reflects current API behavior.",
    ],
  },
];

// ── BUILD DOCUMENT ──
async function main() {
  const modulePages = generateModulePages();

  const children = [];

  // ── SECTION 2: TOC ──
  // (will be separate section)

  // ── SECTION 3: Body Content ──

  // Chapter 1: Wiki Architecture & Organization
  children.push(sectionHeading("1. Wiki Architecture & Organization"));
  children.push(bodyPara("This chapter defines the foundational architecture for the NEXUS HRMS GitHub Wiki, establishing the organizational principles, navigation structures, and content management strategies that ensure the wiki remains an effective knowledge hub as the platform scales. A well-architected wiki reduces onboarding time, minimizes duplicate content, and enables efficient information retrieval across the entire organization."));

  children.push(sectionHeading("1.1 Wiki Home Page Structure and Content", HeadingLevel.HEADING_2));
  children.push(bodyPara("The wiki home page serves as the primary entry point and orientation page for all wiki visitors. It must provide immediate value by answering three questions: What is this wiki about? Where should I start? How do I find what I need? The home page follows a structured layout with a concise project description, a feature highlights section with links to key modules, a quick navigation grid organized by audience persona (Developer, Administrator, End User, Stakeholder), and a recent updates section showing the latest changes to wiki content."));
  children.push(bodyPara("The home page content is maintained by the Platform Team and updated with every major release. It includes a prominently placed search instruction, links to the five primary wiki sections, and a visual site map showing the top-level organization. The home page also features a contribution call-to-action directing team members to the Contributing section for guidelines on improving wiki content. Statistics showing wiki coverage (number of documented modules, last review dates) provide transparency about documentation health."));

  children.push(sectionHeading("1.2 Navigation Sidebar Structure", HeadingLevel.HEADING_2));
  children.push(bodyPara("The sidebar provides persistent navigation across all wiki pages, organized in a hierarchical tree structure that mirrors the content architecture. The top level shows five primary sections: Getting Started, Module Documentation, Technical Reference, Operations, and Contributing. Each section expands to show its child pages with the current page highlighted. Module Documentation further expands to show module categories and individual modules, providing direct access to any of the 40+ module documentation pages."));
  children.push(bodyPara("Sidebar items use consistent naming conventions with URL slugs that match page titles. The sidebar is implemented as a single Markdown file (_Sidebar.md) that GitHub renders on every wiki page. Nested lists provide the hierarchical structure, with indentation levels corresponding to page depth. Cross-references between sections use relative links within the wiki. The sidebar file is version-controlled and updated as part of the documentation review process."));

  children.push(sectionHeading("1.3 Category Organization", HeadingLevel.HEADING_2));
  children.push(bodyPara("Wiki content is organized into five primary categories aligned with user roles and information needs. Getting Started covers onboarding content for new team members and users. Module Documentation provides comprehensive guides for each of the 40+ platform modules. Technical Reference houses API documentation, database schemas, and design system specifications. Operations covers deployment, monitoring, incident response, and security procedures. Contributing documents the collaboration framework including code standards and review processes."));
  children.push(bodyPara("Within each category, sub-categories provide further organization. Module Documentation is grouped by functional domain: Platform Modules (Super Admin, AI Admin, Tenant Admin), Core HR (Dashboard, Company Management, Employees), Talent Acquisition (Recruitment, Requisitions, Offers, Job Portal, AI Interview), Employee Lifecycle (Onboarding, Preboarding), Time & Compensation (Attendance, Leave, Timesheets, Payroll, Salary Structures), Performance & Growth (Performance, Goals, Engagement, Succession, Training, Learning), and Operations & Support (Travel, Expenses, Assets, Documents, Projects, Helpdesk, Grievances, Workflows)."));

  children.push(sectionHeading("1.4 Cross-Referencing Strategy", HeadingLevel.HEADING_2));
  children.push(bodyPara("Cross-references connect related content across wiki pages, enabling readers to navigate the knowledge graph efficiently. Every wiki page includes a metadata section listing parent page, sibling pages, and child pages as navigational links. Additionally, inline cross-references appear within content where related concepts are discussed. For example, the Employees module page links to the Onboarding module page where new hire processes are documented, and to the Payroll module page where salary structures are configured."));
  children.push(bodyPara("Cross-references follow a consistent format using GitHub wiki relative links: [[Page Title|Page-Slug]]. External documentation references use standard Markdown link syntax with absolute URLs. Version-specific links include the version tag in the URL path when referencing documentation that varies between releases. A cross-reference index page maintains a complete mapping of all inter-page links, used during documentation reviews to identify broken references and ensure coverage completeness."));

  children.push(sectionHeading("1.5 Version Control for Wiki Pages", HeadingLevel.HEADING_2));
  children.push(bodyPara("GitHub Wiki pages are stored in a separate Git repository (wiki.git) alongside the main codebase, providing full version history for every page. Each wiki edit creates a commit with the author, timestamp, and change description. The wiki repository follows the same branch protection rules as the main repository, requiring pull requests for changes to protected branches. This ensures documentation changes are reviewed before publication, maintaining accuracy and consistency."));
  children.push(bodyPara("Version tagging aligns wiki content with application releases. After each release, a tag is created in the wiki repository corresponding to the application version (e.g., v2.3.0). This enables readers to access documentation specific to their deployed version while the main branch always reflects the latest development state. Release-specific documentation branches are maintained for major versions (e.g., v2.x) receiving ongoing patch updates. The version control strategy ensures that documentation evolves in lockstep with the application."));

  children.push(accentLine());

  // Chapter 2: Wiki Page Templates
  children.push(sectionHeading("2. Wiki Page Templates"));
  children.push(bodyPara("This chapter provides complete templates for each type of wiki page used in the NEXUS HRMS knowledge hub. Templates ensure structural consistency across documentation, reduce authoring effort, and enable automated quality checks. Every new wiki page must start from the appropriate template and include all required sections. Template customization for module-specific needs is allowed, but core sections must be preserved to maintain navigation and metadata integrity."));

  // Template 1: Module Documentation
  children.push(sectionHeading("2.1 Module Documentation Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Module Documentation Template is the most frequently used template in the wiki, serving as the foundation for all 40+ module documentation pages. It provides a comprehensive structure covering every aspect of a module from overview through troubleshooting. The template ensures that all module documentation follows a consistent structure, making it easy for readers to find specific information regardless of which module they are researching."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Overview", "Module description, purpose, and position in the platform", "Yes"],
      ["Features", "Bulleted list of key features with brief descriptions", "Yes"],
      ["User Guide", "Step-by-step instructions for common user tasks", "Yes"],
      ["Admin Guide", "Configuration, settings, and administrative procedures", "Yes"],
      ["API Reference", "Endpoints, request/response formats, authentication requirements", "Yes"],
      ["FAQ", "Frequently asked questions with concise answers", "Yes"],
      ["Troubleshooting", "Common issues and resolution steps", "Yes"],
      ["Related Pages", "Links to related module documentation and references", "Yes"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 2: API Reference
  children.push(sectionHeading("2.2 API Reference Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The API Reference Template provides a standardized format for documenting REST API endpoints. Each endpoint is documented with its HTTP method, URL path, request parameters, request body schema, response schema, error codes, and usage examples. The template ensures that all API documentation is complete and consistent, enabling developers to integrate with the platform without needing to read source code."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Endpoint Summary", "Method, path, short description, authentication requirement", "Yes"],
      ["Request Parameters", "Path params, query params, headers with types and descriptions", "Yes"],
      ["Request Body", "JSON schema with field descriptions, types, and validation rules", "Conditional"],
      ["Response Schema", "Success response structure with field descriptions and types", "Yes"],
      ["Error Responses", "Error codes, messages, and resolution guidance", "Yes"],
      ["Examples", "cURL and SDK usage examples for common scenarios", "Yes"],
      ["Rate Limits", "Rate limiting rules and throttle thresholds for the endpoint", "Yes"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 3: Workflow Documentation
  children.push(sectionHeading("2.3 Workflow Documentation Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Workflow Documentation Template captures business process flows including approval chains, state transitions, and automated actions. It is used for documenting both system-provided workflows and custom workflows configured by administrators. The template includes a visual workflow diagram, step-by-step descriptions, role responsibilities, and exception handling procedures."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Workflow Overview", "Purpose, triggers, and business context", "Yes"],
      ["Workflow Diagram", "Visual representation of the process flow", "Yes"],
      ["Step Definitions", "Detailed description of each workflow step", "Yes"],
      ["Role Assignments", "Roles responsible for each step with permissions", "Yes"],
      ["State Transitions", "All possible states and transition conditions", "Yes"],
      ["Exception Handling", "Error scenarios and recovery procedures", "Yes"],
      ["Configuration Guide", "How to set up and customize the workflow", "Yes"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 4: Troubleshooting Guide
  children.push(sectionHeading("2.4 Troubleshooting Guide Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Troubleshooting Guide Template provides a problem-solution format for documenting common issues and their resolutions. Each troubleshooting entry includes symptoms, root cause analysis, resolution steps, and prevention measures. The template enables support teams and users to quickly identify and resolve issues without escalating to engineering, reducing support burden and mean time to resolution."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Problem Statement", "Clear description of the issue including symptoms", "Yes"],
      ["Affected Versions", "Software versions where the issue has been observed", "Yes"],
      ["Root Cause", "Technical explanation of why the issue occurs", "Yes"],
      ["Resolution Steps", "Step-by-step instructions to fix the issue", "Yes"],
      ["Verification", "How to confirm the issue is resolved", "Yes"],
      ["Prevention", "Steps to prevent recurrence", "Recommended"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 5: FAQ Template
  children.push(sectionHeading("2.5 FAQ Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The FAQ Template organizes frequently asked questions by category with concise, actionable answers. FAQ pages serve as the first line of support, deflecting common questions from the helpdesk. Answers include links to detailed documentation pages where users can learn more. The template supports both general platform FAQs and module-specific FAQs, ensuring consistent formatting across all FAQ pages."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Category Header", "Grouping label for related questions", "Yes"],
      ["Question", "The question phrased from the user perspective", "Yes"],
      ["Answer", "Concise answer with links to detailed documentation", "Yes"],
      ["Applicable Roles", "Which user roles this FAQ applies to", "Recommended"],
      ["Related Pages", "Links to relevant wiki pages for more information", "Recommended"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 6: Release Notes
  children.push(sectionHeading("2.6 Release Notes Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Release Notes Template provides a structured format for communicating changes in each software release. Release notes are the primary communication tool for informing stakeholders about new features, improvements, bug fixes, and breaking changes. The template follows the Keep a Changelog format adapted for the NEXUS HRMS context, ensuring that every release includes complete and actionable change documentation."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title (version number), URL slug, tags, release date, owner", "Yes"],
      ["Summary", "High-level overview of the release highlights", "Yes"],
      ["New Features", "New capabilities added in this release", "Yes"],
      ["Improvements", "Enhancements to existing features", "Yes"],
      ["Bug Fixes", "Issues resolved in this release", "Yes"],
      ["Breaking Changes", "Changes requiring migration or configuration updates", "Conditional"],
      ["Deprecations", "Features scheduled for removal in future releases", "Conditional"],
      ["Known Issues", "Outstanding issues not resolved in this release", "Recommended"],
      ["Migration Guide", "Steps required to upgrade from the previous version", "Conditional"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 7: Contributing Guide
  children.push(sectionHeading("2.7 Contributing Guide Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Contributing Guide Template establishes the framework for community participation in the project. It covers the complete contribution lifecycle from setting up the development environment through submitting and reviewing changes. The template ensures that all contribution-related documentation maintains a welcoming tone while clearly communicating expectations and processes. It integrates with the Code of Conduct and Branch Strategy documentation."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title, URL slug, tags, last updated, owner, navigation links", "Yes"],
      ["Welcome Statement", "Encouraging introduction to contributions", "Yes"],
      ["Getting Started", "Prerequisites and environment setup for contributors", "Yes"],
      ["Contribution Types", "Types of contributions accepted (code, docs, issues)", "Yes"],
      ["Workflow", "Step-by-step contribution process from fork to merge", "Yes"],
      ["Standards", "Coding, documentation, and testing standards", "Yes"],
      ["Review Process", "How contributions are reviewed and approved", "Yes"],
      ["Recognition", "How contributors are acknowledged", "Recommended"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));

  // Template 8: Security Advisory
  children.push(sectionHeading("2.8 Security Advisory Template", HeadingLevel.HEADING_2));
  children.push(bodyPara("The Security Advisory Template provides a structured format for communicating security vulnerabilities, their impact, and remediation steps. Security advisories are time-sensitive documents that require careful handling to protect users while providing actionable information for mitigation. The template follows industry-standard vulnerability disclosure practices coordinated with the security team's responsible disclosure policy."));
  children.push(createTable(
    ["Section", "Description", "Required"],
    [
      ["Page Header", "Title (CVE/advisory ID), URL slug, tags, disclosure date, owner", "Yes"],
      ["Severity Rating", "CVSS score and severity classification (Critical/High/Medium/Low)", "Yes"],
      ["Vulnerability Description", "Technical description of the security issue", "Yes"],
      ["Affected Versions", "Software versions affected by the vulnerability", "Yes"],
      ["Impact Assessment", "Potential impact if the vulnerability is exploited", "Yes"],
      ["Mitigation Steps", "Immediate steps to reduce risk before patching", "Yes"],
      ["Remediation", "Permanent fix instructions including patched versions", "Yes"],
      ["Credits", "Acknowledgment of vulnerability reporter", "Recommended"],
    ],
    [30, 50, 20]
  ));
  children.push(spacer(100));
  children.push(accentLine());

  // Chapter 3: Complete Wiki Page Content
  children.push(sectionHeading("3. Complete Wiki Page Content"));
  children.push(bodyPara("This chapter provides the full content for every wiki page in the NEXUS HRMS Knowledge Hub. Each page includes its metadata (title, URL slug, tags, last updated date, page owner, navigation links) and complete content paragraphs. This content serves as the master copy from which the GitHub Wiki pages are created and maintained. All pages follow the templates defined in Chapter 2 and the architectural principles established in Chapter 1."));

  // 3.1 Getting Started Pages
  children.push(sectionHeading("3.1 Getting Started Pages", HeadingLevel.HEADING_2));
  gettingStartedPages.forEach(page => {
    children.push(...wikiPageBlock(page));
  });

  // 3.2 Module Documentation Pages
  children.push(sectionHeading("3.2 Module Documentation Pages", HeadingLevel.HEADING_2));
  children.push(bodyPara("The following pages document each of the 40 modules in the NEXUS HRMS platform. Each module page follows the Module Documentation Template with sections for Overview, Features, User Guide, Admin Guide, API Reference, FAQ, and Troubleshooting. The module pages are organized by functional domain and cross-reference related modules to provide a complete picture of the platform's capabilities."));
  modulePages.forEach(page => {
    children.push(...wikiPageBlock(page));
  });

  // 3.3 Technical Reference Pages
  children.push(sectionHeading("3.3 Technical Reference Pages", HeadingLevel.HEADING_2));
  techRefPages.forEach(page => {
    children.push(...wikiPageBlock(page));
  });

  // 3.4 Operations Pages
  children.push(sectionHeading("3.4 Operations Pages", HeadingLevel.HEADING_2));
  operationsPages.forEach(page => {
    children.push(...wikiPageBlock(page));
  });

  // 3.5 Contributing Pages
  children.push(sectionHeading("3.5 Contributing Pages", HeadingLevel.HEADING_2));
  contributingPages.forEach(page => {
    children.push(...wikiPageBlock(page));
  });

  children.push(accentLine());

  // Chapter 4: Sidebar Navigation Structure
  children.push(sectionHeading("4. Sidebar Navigation Structure"));
  children.push(bodyPara("The sidebar provides persistent navigation across all wiki pages. Below is the complete sidebar Markdown structure with nested hierarchy linking all wiki pages. This content is stored in the _Sidebar.md file in the wiki repository and rendered by GitHub on every wiki page. The structure mirrors the five primary content categories with full depth expansion for all module documentation pages."));

  const sidebarLines = [
    "**NEXUS HRMS Wiki**",
    "- [[Home]]",
    "- **Getting Started**",
    "  - [[Quick Start Guide|Quick-Start-Guide]]",
    "  - [[Architecture Overview|Architecture-Overview]]",
    "  - [[Development Setup|Development-Setup]]",
    "  - [[Deployment Guide|Deployment-Guide]]",
    "- **Module Documentation**",
  ];
  const moduleCategories = [
    { label: "Platform", mods: ["Super Admin", "AI Admin Console", "Tenant Admin"] },
    { label: "Core HR", mods: ["Dashboard", "Company Management", "Employees"] },
    { label: "Talent Acquisition", mods: ["Recruitment", "Requisitions", "Offers", "Job Portal", "AI Interview"] },
    { label: "Employee Lifecycle", mods: ["Onboarding", "Preboarding"] },
    { label: "Time & Compensation", mods: ["Attendance", "Leave Management", "Timesheets", "Payroll", "Salary Structures"] },
    { label: "Performance & Growth", mods: ["Performance", "Goals", "Engagement", "Succession", "Training", "Learning"] },
    { label: "Operations & Support", mods: ["Travel", "Expenses", "Assets", "Documents", "Projects", "Helpdesk", "Grievances", "Workflows"] },
    { label: "Analytics & Reporting", mods: ["Reports", "Analytics", "Compliance & Audit"] },
    { label: "Offboarding", mods: ["Separation", "FnF Settlement", "Alumni"] },
    { label: "External Portals", mods: ["Vendor Portal", "Client Portal"] },
  ];
  moduleCategories.forEach(cat => {
    sidebarLines.push(`  - **${cat.label}**`);
    cat.mods.forEach(m => {
      const mod = modules.find(x => x.name === m);
      if (mod) sidebarLines.push(`    - [[${mod.name}|${mod.slug}]]`);
    });
  });
  sidebarLines.push("- **Technical Reference**");
  ["API Documentation|API-Documentation", "Database Schema|Database-Schema", "Authentication & Authorization|Authentication-Authorization", "State Management|State-Management", "Component Library|Component-Library", "Design System|Design-System", "Error Handling|Error-Handling", "Testing Guide|Testing-Guide"].forEach(s => {
    const [label, slug] = s.split("|");
    sidebarLines.push(`  - [[${label}|${slug}]]`);
  });
  sidebarLines.push("- **Operations**");
  ["Deployment Procedures|Deployment-Procedures", "Monitoring & Alerting|Monitoring-Alerting", "Backup & Recovery|Backup-Recovery", "Incident Response|Incident-Response", "Security Protocols|Security-Protocols", "Performance Optimization|Performance-Optimization"].forEach(s => {
    const [label, slug] = s.split("|");
    sidebarLines.push(`  - [[${label}|${slug}]]`);
  });
  sidebarLines.push("- **Contributing**");
  ["Code of Conduct|Code-of-Conduct", "Contributing Guidelines|Contributing-Guidelines", "Code Review Process|Code-Review-Process", "Branch Strategy|Branch-Strategy", "Release Process|Release-Process", "Documentation Standards|Documentation-Standards"].forEach(s => {
    const [label, slug] = s.split("|");
    sidebarLines.push(`  - [[${label}|${slug}]]`);
  });

  sidebarLines.forEach(line => {
    const indent = line.match(/^(\s*)/)[1].length;
    const isBold = line.includes("**");
    const cleanLine = line.replace(/^\s+/, "").replace(/\*\*/g, "").replace(/\[\[/g, "").replace(/\|/g, " - ").replace(/\]\]/g, "");
    children.push(new Paragraph({
      indent: { left: indent * 120 },
      spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 20 },
      children: [
        new TextRun({
          text: cleanLine,
          font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
          size: 18,
          color: isBold ? P.tbl.headerBg : P.body,
          bold: isBold,
        }),
      ],
    }));
  });
  children.push(spacer(120));
  children.push(accentLine());

  // Chapter 5: Footer & Cross-Reference Strategy
  children.push(sectionHeading("5. Footer & Cross-Reference Strategy"));
  children.push(bodyPara("This chapter defines how wiki pages link to each other, reference external documentation, and maintain version-specific links. A well-implemented cross-reference strategy ensures that readers can navigate the knowledge hub efficiently and that documentation remains accurate across software versions."));

  children.push(sectionHeading("5.1 Inter-Page Linking", HeadingLevel.HEADING_2));
  children.push(bodyPara("Every wiki page includes three types of navigational links: parent links pointing to the containing section, sibling links pointing to peer pages at the same level, and child links pointing to sub-pages. These links appear in the page header metadata section and provide a consistent navigation pattern across all pages. Inline cross-references within content use the GitHub wiki link syntax [[Display Text|Page-Slug]] to connect related concepts, ensuring that readers can follow logical information paths without relying solely on the sidebar."));
  children.push(bodyPara("Cross-reference validation is performed as part of the documentation review process. A script scans all wiki pages for broken links, identifying references to pages that do not exist or have been renamed. The cross-reference index maintains a complete mapping of all inter-page links, enabling impact analysis when pages are moved or removed. When a page is deprecated, all incoming references are updated to point to the replacement page, and the deprecated page includes a redirect notice."));

  children.push(sectionHeading("5.2 External Documentation References", HeadingLevel.HEADING_2));
  children.push(bodyPara("External documentation references use standard Markdown link syntax with absolute URLs pointing to resources outside the GitHub wiki. Common external references include the Prisma documentation for ORM-specific topics, Next.js documentation for framework features, Tailwind CSS documentation for styling utilities, and vendor documentation for third-party integrations. External references are grouped in a dedicated section at the bottom of each wiki page under the heading 'External References'."));
  children.push(bodyPara("External links are validated quarterly to ensure they remain active and point to the intended content. When external documentation is critical for understanding a wiki page, key information is summarized within the wiki itself with the external link provided for further details. This approach reduces dependency on external resources while maintaining attribution and providing paths to deeper technical content. All external references include the access date to help readers assess currency."));

  children.push(sectionHeading("5.3 Version-Specific Links", HeadingLevel.HEADING_2));
  children.push(bodyPara("Version-specific documentation links direct readers to information relevant to a particular software release. The wiki maintains a version index page that lists all documented versions with links to their specific documentation trees. When content differs between versions, the wiki page includes a version notice banner indicating which versions the current content applies to, with links to documentation for other versions. Breaking changes between versions are documented in the Release Notes pages with migration guides."));
  children.push(bodyPara("The versioning strategy uses Git tags in the wiki repository to mark documentation states corresponding to application releases. Readers can access version-specific documentation by checking out the appropriate tag or by using the version selector on the wiki home page. The main branch always reflects the latest development documentation, while release branches (e.g., v2.x) contain documentation for maintained release lines. This dual-track approach ensures that users of both current and older versions can find relevant documentation."));

  children.push(accentLine());

  // Chapter 6: Wiki Maintenance Procedures
  children.push(sectionHeading("6. Wiki Maintenance Procedures"));
  children.push(bodyPara("This chapter establishes the operational procedures for maintaining the NEXUS HRMS GitHub Wiki as a living, accurate, and valuable knowledge resource. Effective wiki maintenance requires a combination of automated tools and human oversight to ensure that content remains current, accurate, and well-organized as the platform evolves."));

  children.push(sectionHeading("6.1 Update Frequency", HeadingLevel.HEADING_2));
  children.push(bodyPara("Wiki update frequency is tied to the software release cycle and operational needs. Major updates occur with every minor release (bi-weekly), incorporating new feature documentation, updated API references, and revised configuration guides. Patch releases trigger targeted updates to affected documentation pages. Architecture and design system documentation is updated quarterly or when significant design decisions are made. Operations documentation is updated whenever procedures change, which typically occurs during post-incident reviews or infrastructure upgrades."));
  children.push(bodyPara("Module documentation pages are reviewed on a rotating schedule ensuring that every module is reviewed at least once per quarter. The review schedule assigns specific weeks to module categories, distributing the review workload evenly across the team. High-traffic pages (Getting Started, API Documentation, Deployment Guide) are reviewed monthly. The documentation team maintains a review calendar in the project management tool with assigned reviewers and due dates for each review cycle."));

  children.push(sectionHeading("6.2 Review Process", HeadingLevel.HEADING_2));
  children.push(bodyPara("The wiki review process follows a structured approach combining automated checks and manual review. Automated checks validate technical accuracy by comparing documented API endpoints against the codebase, verifying code examples are syntactically correct and runnable, and checking that all cross-references point to existing pages. Manual review focuses on content accuracy, clarity, completeness, and adherence to the documentation standards."));
  children.push(bodyPara("Review assignments are made based on expertise, with technical content reviewed by subject matter experts and writing quality reviewed by the documentation team. Each review follows a checklist that includes accuracy verification, completeness assessment, style consistency, cross-reference validation, and metadata currency. Reviewers submit feedback through pull requests, maintaining the same quality process as code reviews. Approved changes are merged by the documentation team lead, who ensures that related pages are updated consistently."));

  children.push(sectionHeading("6.3 Stale Content Identification", HeadingLevel.HEADING_2));
  children.push(bodyPara("Stale content identification uses both automated and manual approaches. Automated stale detection runs weekly, flagging pages that have not been updated in over 90 days, pages where the last updated date exceeds the review schedule threshold, and pages with broken cross-references or missing metadata. The automated system generates a stale content report distributed to the documentation team, listing flagged pages with their age and last reviewer."));
  children.push(bodyPara("Manual stale content identification occurs during the quarterly review cycle and through community feedback. Team members can flag content as potentially stale using the wiki's issue tracker, providing context about what appears outdated. The documentation team triages these reports alongside the automated flags, prioritizing pages that affect high-traffic areas or critical processes. Stale pages are either updated to reflect current state, marked with a stale content warning pending review, or archived if the documented feature has been deprecated."));

  children.push(sectionHeading("6.4 Archive Strategy", HeadingLevel.HEADING_2));
  children.push(bodyPara("The archive strategy ensures that outdated documentation is preserved for reference while clearly distinguishing it from current content. When a wiki page becomes obsolete due to feature removal or significant redesign, the page is moved to the Archive section of the wiki with a clear deprecation notice at the top. The original page URL is replaced with a redirect to the current documentation or to the archive page with a notice directing readers to updated content."));
  children.push(bodyPara("Archived pages are maintained in a dedicated Archive category within the wiki, organized by the version in which the content was superseded. Each archived page includes a header indicating the deprecation date, the version in which the feature was removed or changed, and a link to the current documentation. Archived content is retained indefinitely for historical reference and regulatory compliance, as certain HR documentation must be preserved for audit purposes. The archive section is excluded from the main sidebar navigation but remains accessible through search and direct links."));

  // ── Build the document ──
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
            spacing: { line: 312 },
          },
        },
        heading1: {
          run: {
            font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
            size: 32,
            bold: true,
            color: P.primary,
          },
        },
        heading2: {
          run: {
            font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
            size: 28,
            bold: true,
            color: P.primary,
          },
        },
        heading3: {
          run: {
            font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
            size: 24,
            bold: true,
            color: P.primary,
          },
        },
      },
    },
    sections: [
      // Section 1: Cover
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: "portrait" },
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: buildCover(),
      },
      // Section 2: TOC
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: "portrait" },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
            pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 200, after: 400, line: Math.ceil(32 * 23), lineRule: "atLeast" },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Table of Contents",
                font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
                size: 32,
                bold: true,
                color: P.primary,
              }),
            ],
          }),
          new TableOfContents("Table of Contents", {
            hyperlink: true,
            headingStyleRange: "1-3",
          }),
          new Paragraph({
            children: [new PageBreak()],
          }),
        ],
      },
      // Section 3: Body
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: "portrait" },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = "/home/z/my-project/download/NEXUS-HRMS-GitHub-Wiki-Knowledge-Hub.docx";
  fs.writeFileSync(outputPath, buffer);
  console.log("Document generated:", outputPath);
}

main().catch(err => { console.error(err); process.exit(1); });
