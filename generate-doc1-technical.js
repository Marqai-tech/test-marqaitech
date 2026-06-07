const { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, PageNumber, PageBreak, BorderStyle, ShadingType, WidthType,
  TableOfContents, NumberFormat, SectionType } = require("docx");
const fs = require("fs");

// Palette: DM-1 Deep Cyan (Tech/AI)
const P = {
  primary: "162235", body: "1A2B40", secondary: "6878A0",
  accent: "37DCF2", surface: "F4F8FC",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" }
};
const c = (hex) => hex.replace("#", "");
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : level === HeadingLevel.HEADING_2 ? 280 : 220, after: 120 },
    children: [new TextRun({ text, bold: true, color: P.primary, font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 28 : 26 })]
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: P.body, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
  });
}

function bodyNoIndent(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: P.body, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 276 },
    shading: { type: ShadingType.CLEAR, fill: "F0F4F8" },
    indent: { left: 360 },
    children: [new TextRun({ text, size: 20, color: "2D3748", font: { ascii: "Courier New" } })]
  });
}

function bulletItem(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 60 },
    indent: { left: 720, hanging: 360 },
    children: [new TextRun({ text: "\u2022 " + text, size: 24, color: P.body, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
  });
}

function makeTable(headers, rows) {
  const t = P.table;
  const headerCells = headers.map(h => new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 21, color: t.headerText, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })] })],
    shading: { type: ShadingType.CLEAR, fill: t.headerBg },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  }));
  const dataRows = rows.map((row, idx) => new TableRow({
    children: row.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 21, color: P.body, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })] })],
      shading: idx % 2 === 0 ? { type: ShadingType.CLEAR, fill: t.surface } : { type: ShadingType.CLEAR, fill: "FFFFFF" },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
    }))
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: t.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
  });
}

// Cover page using R1 recipe (Deep Cyan DM-1 dark bg)
function buildCover() {
  const titleLines = ["NEXUS HRMS", "Technical Documentation"];
  const children = [
    new Paragraph({ spacing: { before: 3600 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { line: 920, lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[0], bold: true, size: 72, color: P.cover.titleColor, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { line: 660, lineRule: "atLeast", after: 200 },
      children: [new TextRun({ text: titleLines[1], bold: true, size: 44, color: P.accent, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })]
    }),
    new Paragraph({
      indent: { left: 1200, right: 1200 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 20 } },
      spacing: { before: 200 }, children: []
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { before: 300, line: 400 },
      children: [new TextRun({ text: "Coding Standards & Module-wise Code Explanation", size: 28, color: P.cover.subtitleColor, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { before: 100, line: 360 },
      children: [new TextRun({ text: "SaaS-Based AI-Powered Human Resource Management System", size: 22, color: P.cover.subtitleColor, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
    }),
    new Paragraph({ spacing: { before: 2000 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { line: 360 },
      children: [new TextRun({ text: "Version 1.0  |  June 2026", size: 20, color: P.cover.metaColor, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 1200 },
      spacing: { line: 360 },
      children: [new TextRun({ text: "NEXUS HRMS Development Team", size: 20, color: P.cover.metaColor, font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" } })]
    }),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        verticalAlign: "top",
        shading: { type: ShadingType.CLEAR, fill: P.primary },
        children: children,
      })]
    })]
  });
}

// ============ DOCUMENT CONTENT ============

const content = [];

// --- Chapter 1: Project Overview ---
content.push(heading("1. Project Overview"));
content.push(body("NEXUS HRMS is a comprehensive SaaS-Based AI-Powered Human Resource Management System designed to streamline and automate the entire employee lifecycle within organizations of all sizes. Built on the Next.js 16 framework with React 19, the platform leverages serverless PostgreSQL via Neon, Prisma ORM v7, and advanced AI capabilities to deliver a modern, scalable, and intelligent HR management solution. The system supports multi-tenant architecture, allowing multiple organizations to share the same infrastructure while maintaining complete data isolation and customization."));
content.push(body("The platform encompasses over 40 distinct modules spanning the complete HR lifecycle from talent acquisition through onboarding, performance management, compensation, operations, and separation. Each module is designed with a consistent user interface paradigm featuring module landing pages with icon tiles, context-aware sidebars, embedded inline forms, and view/read-only panels. The AI integration permeates multiple modules including AI-powered interviews, an intelligent HR chatbot, and an AI admin console for model configuration and monitoring."));
content.push(body("The technology stack prioritizes developer experience and deployment efficiency. Next.js 16 with the App Router provides server-side rendering, API routes, and file-based routing. Prisma ORM with the Neon serverless adapter ensures type-safe database access with connection pooling optimized for serverless environments. Zustand provides lightweight client-side state management, while shadcn/ui components combined with Tailwind CSS 4 deliver a polished, accessible, and responsive user interface."));

content.push(heading("1.1 Technology Stack", HeadingLevel.HEADING_2));
content.push(makeTable(
  ["Category", "Technology", "Version", "Purpose"],
  [
    ["Framework", "Next.js", "16.2.7", "Full-stack React framework with App Router, SSR, and API routes"],
    ["UI Library", "React", "19.2.4", "Component-based UI with hooks, concurrent features"],
    ["Language", "TypeScript", "5+", "Type-safe development with strict mode enabled"],
    ["Database", "PostgreSQL (Neon)", "Serverless", "Managed serverless PostgreSQL with connection pooling"],
    ["ORM", "Prisma", "7.8.0", "Type-safe database access with migrations and seeding"],
    ["State Management", "Zustand", "5.0.14", "Lightweight client-side state with persistence"],
    ["Styling", "Tailwind CSS", "4", "Utility-first CSS with custom design tokens"],
    ["UI Components", "shadcn/ui", "Latest", "Accessible, composable component library (49 components)"],
    ["Authentication", "Custom JWT (jose)", "6.2.3", "HS256 JWT tokens with 24-hour expiry"],
    ["Password Hashing", "bcryptjs", "3.0.3", "Salt rounds 12 for secure password storage"],
    ["AI Integration", "z-ai-web-dev-sdk", "0.0.18", "AI chat completions, interview scoring, image generation"],
    ["Icons", "react-icons", "5.6.0", "Feather Icons (Fi*) for consistent iconography"],
    ["Date Handling", "date-fns", "4.4.0", "Modern date utility library"],
    ["Notifications", "react-hot-toast", "2.6.0", "Toast notification system"],
    ["Deployment", "Vercel", "—", "Serverless deployment with Neon integration"],
  ]
));

content.push(heading("1.2 Architecture Overview", HeadingLevel.HEADING_2));
content.push(body("NEXUS HRMS follows a modern full-stack architecture built on the Next.js App Router pattern. The application is organized into a layered structure that separates concerns between presentation, business logic, and data access. The frontend uses React 19 with server components and client components, where server components handle data fetching and static rendering while client components manage interactive state and user interactions."));
content.push(body("The backend API routes follow RESTful conventions with consistent patterns for CRUD operations. Each API route handles authentication via JWT token validation, input validation, error handling, and database operations through Prisma. The Prisma schema defines 45 models organized into logical groups covering the entire HR domain, from multi-tenant infrastructure to employee lifecycle events, compensation, and AI chat logs."));
content.push(body("The multi-tenant architecture implements a hierarchical data model: Super Admin manages Tenants, each Tenant contains Company Groups and Companies, Companies have Branches and Departments, and Employees belong to Departments. This hierarchy is enforced at both the database level through foreign key relationships and at the application level through role-based access control in the sidebar and API routes."));

content.push(heading("1.3 SaaS Multi-Tenant Hierarchy", HeadingLevel.HEADING_2));
content.push(body("The SaaS multi-tenant architecture is one of the foundational design decisions in NEXUS HRMS. It enables the platform to serve multiple organizations from a single deployment while maintaining strict data isolation between tenants. The hierarchy flows from the platform level down to individual employees, with each level adding organizational context and access control boundaries."));
content.push(makeTable(
  ["Level", "Entity", "Description", "Key Fields"],
  [
    ["1", "Super Admin", "Platform-level administrator with global access", "Manages all tenants, subscriptions, and system config"],
    ["2", "Tenant", "Organization subscribing to the platform", "name, slug, domain, plan, status, country, currency"],
    ["3", "Company Group", "Logical grouping of companies within a tenant", "name, tenantId"],
    ["4", "Company", "Individual company within a group", "name, code, registrationNo, taxId, country, address"],
    ["5", "Branch", "Physical or logical office location", "name, code, companyId, address, status"],
    ["6", "Department", "Functional unit within a branch or company", "name, code, companyId, parentDepartmentId, status"],
    ["7", "Employee", "Individual worker in the organization", "employeeId, name, email, departmentId, designationId"],
  ]
));

// --- Chapter 2: Coding Standards ---
content.push(heading("2. Coding Standards"));
content.push(body("Consistent coding standards are essential for maintaining code quality, readability, and maintainability across a large-scale application like NEXUS HRMS. This chapter outlines the mandatory coding conventions, naming patterns, file organization principles, and best practices that all developers must follow when contributing to the codebase. These standards ensure that the codebase remains accessible to new team members and that modules developed by different engineers maintain a uniform structure and style."));

content.push(heading("2.1 File and Directory Structure", HeadingLevel.HEADING_2));
content.push(body("The NEXUS HRMS project follows a strict file organization pattern that mirrors the Next.js App Router conventions while adding module-specific structure. Understanding this structure is critical for locating files, adding new modules, and maintaining the existing codebase. Every module follows the same organizational pattern to ensure predictability and reduce cognitive load when navigating the project."));
content.push(codeBlock("nexus-hrms/"));
content.push(codeBlock("\u251C\u2500\u2500 prisma/                    # Database schema and migrations"));
content.push(codeBlock("\u2502   \u251C\u2500\u2500 schema.prisma            # 45 Prisma models"));
content.push(codeBlock("\u2502   \u2514\u2500\u2500 seed.ts                 # Database seeding script"));
content.push(codeBlock("\u251C\u2500\u2500 src/"));
content.push(codeBlock("\u2502   \u251C\u2500\u2500 app/                    # Next.js App Router"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 (dashboard)/       # Route group for authenticated pages"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u251C\u2500\u2500 layout.tsx     # Dashboard layout with Sidebar + Header"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u251C\u2500\u2500 home/page.tsx  # Module icons landing page"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u251C\u2500\u2500 [module]/page.tsx  # Individual module pages"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u2514\u2500\u2500 employees/[id]/page.tsx # Dynamic routes"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 api/              # API route handlers"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u251C\u2500\u2500 auth/        # Authentication endpoints"));
content.push(codeBlock("\u2502   \u2502   \u2502   \u2514\u2500\u2500 [module]/   # Module CRUD endpoints"));
content.push(codeBlock("\u2502   \u2502   \u2514\u2500\u2500 login/page.tsx  # Login page"));
content.push(codeBlock("\u2502   \u251C\u2500\u2500 components/            # Shared UI components"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 Sidebar.tsx     # Navigation sidebar"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 Header.tsx      # Top navigation bar"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 ui/            # 49 shadcn/ui primitives"));
content.push(codeBlock("\u2502   \u2502   \u2514\u2500\u2500 hrms/          # Module-specific components"));
content.push(codeBlock("\u2502   \u251C\u2500\u2500 lib/                  # Utility libraries"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 auth.ts        # JWT + bcrypt functions"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 prisma.ts      # Neon serverless client"));
content.push(codeBlock("\u2502   \u2502   \u251C\u2500\u2500 api.ts         # Frontend API helpers"));
content.push(codeBlock("\u2502   \u2502   \u2514\u2500\u2500 notifications.ts # Server-side notification creator"));
content.push(codeBlock("\u2502   \u2514\u2500\u2500 store/                # Zustand state stores"));
content.push(codeBlock("\u2502       \u251C\u2500\u2500 authStore.ts    # Auth state + localStorage persistence"));
content.push(codeBlock("\u2502       \u2514\u2500\u2500 notificationStore.ts # Notification state"));
content.push(codeBlock("\u251C\u2500\u2500 middleware.ts               # Auth guard middleware"));
content.push(codeBlock("\u2514\u2500\u2500 next.config.ts             # Next.js configuration"));

content.push(heading("2.2 Naming Conventions", HeadingLevel.HEADING_2));
content.push(makeTable(
  ["Element", "Convention", "Example", "Notes"],
  [
    ["Directories", "kebab-case", "ai-interview/, job-portal/", "Matches URL route segments"],
    ["Page files", "page.tsx", "home/page.tsx", "Next.js App Router convention"],
    ["Layout files", "layout.tsx", "(dashboard)/layout.tsx", "Wraps child routes with shared UI"],
    ["Components", "PascalCase", "CompanyManagement, AIInterview", "One component per file, named export"],
    ["Hooks", "camelCase with use prefix", "useMobile, useToast", "React hooks convention"],
    ["API routes", "route.ts", "api/employees/route.ts", "Next.js API route convention"],
    ["Prisma models", "PascalCase", "Employee, JobPosting", "Singular nouns for model names"],
    ["Database fields", "camelCase", "firstName, dateOfJoining", "Prisma default field naming"],
    ["CSS classes", "nexus-{category}", "nexus-card, nexus-badge-success", "Design token system"],
    ["Env variables", "UPPER_SNAKE", "POSTGRES_URL, DATABASE_URL", "Standard environment variable naming"],
    ["TypeScript types", "PascalCase", "UserRole, ModuleKey", "Interfaces and type aliases"],
    ["Constants", "UPPER_SNAKE", "ROLE_LABELS, ROLE_COLORS", "Lookup maps and configuration"],
    ["State stores", "camelCase + Store", "authStore, notificationStore", "Zustand store naming"],
    ["API helper functions", "camelCase", "fetchEmployees, createLeave", "Descriptive verb + noun"],
  ]
));

content.push(heading("2.3 TypeScript Standards", HeadingLevel.HEADING_2));
content.push(body("TypeScript is used throughout the NEXUS HRMS codebase with strict type checking enabled. All new code must include proper type annotations for function parameters, return types, and object shapes. The use of the 'any' type is strictly prohibited except in exceptional cases where it is explicitly documented with a TODO comment explaining why a more specific type cannot be used. Type definitions should be centralized in the lib/types.ts file for shared types, while module-specific types can be defined co-located with their usage."));
content.push(body("Union types are used extensively for enumerating finite sets of values such as user roles (super_admin, tenant_admin, hr_admin, manager, employee), module keys, leave statuses, and approval states. This pattern provides compile-time safety while maintaining flexibility compared to TypeScript enums. When adding new values to an existing union type, developers must update all switch/case statements and conditional branches that consume the type to ensure exhaustive handling."));
content.push(codeBlock("// Example: Role type definition from lib/types.ts"));
content.push(codeBlock("type UserRole = 'super_admin' | 'tenant_admin' | 'hr_admin'"));
content.push(codeBlock("  | 'manager' | 'employee' | 'company_hr_admin'"));
content.push(codeBlock("  | 'hr_executive' | 'dept_head' | 'reporting_manager'"));
content.push(codeBlock("  | 'finance' | 'it_admin' | 'recruiter'"));
content.push(codeBlock("  | 'vendor' | 'sub_vendor' | 'client' | 'auditor' | 'job_seeker';"));
content.push(body("Interface definitions should follow the pattern of defining data shapes that map directly to API responses or Prisma model outputs. All optional fields must be explicitly marked with the '?' operator, and developers should never rely on undefined behavior by accessing potentially undefined properties without null checks. The safe navigation operator (?.) and nullish coalescing (??) should be used for defensive property access."));

content.push(heading("2.4 React Component Standards", HeadingLevel.HEADING_2));
content.push(body("All React components in NEXUS HRMS follow a consistent pattern that ensures predictability, testability, and maintainability. Each module page is implemented as a client component ('use client') that manages its own state through React hooks. The component structure follows a top-down pattern where the page component acts as the orchestrator, managing state such as the active sub-view, selected items, form visibility, and viewing state for read-only panels."));
content.push(body("The standard module page component implements a three-state pattern: the list/table view (default), the inline creation/edit form (toggled by the 'Add' button), and the view/read-only panel (toggled by the FiEye icon button). This pattern is implemented using the viewingId and editingId state variables. When viewingId is set, the component renders a read-only detail panel. When editingId is set or the showForm flag is true, an inline form is rendered. Otherwise, the default list view is shown."));
content.push(codeBlock("// Standard module page state pattern"));
content.push(codeBlock("const [activeTab, setActiveTab] = useState('list');"));
content.push(codeBlock("const [viewingId, setViewingId] = useState<string | null>(null);"));
content.push(codeBlock("const [editingId, setEditingId] = useState<string | null>(null);"));
content.push(codeBlock("const [showForm, setShowForm] = useState(false);"));
content.push(codeBlock("const [searchQuery, setSearchQuery] = useState('');"));
content.push(body("Components must use the design token system for styling rather than arbitrary Tailwind values. The approved design tokens include: nexus-card for card containers, nexus-badge and nexus-badge-success/warning/error/info for status indicators, nexus-border for border styling, and nexus-text-primary/secondary/muted for text hierarchy. These tokens ensure visual consistency across modules and enable theme-wide changes through a single source of truth."));

content.push(heading("2.5 API Route Standards", HeadingLevel.HEADING_2));
content.push(body("API routes in NEXUS HRMS follow a consistent pattern for handling HTTP requests with proper authentication, validation, error handling, and response formatting. Every API route must implement the following structure: first, extract and validate the JWT token from the Authorization header or cookie; second, verify the user's role-based permissions for the requested operation; third, validate the request body against expected schemas; fourth, execute the database operation via Prisma; and finally, return a standardized JSON response."));
content.push(codeBlock("// Standard API route pattern"));
content.push(codeBlock("export async function GET(request: Request) {"));
content.push(codeBlock("  const token = getTokenFromHeaders(request);"));
content.push(codeBlock("  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });"));
content.push(codeBlock("  const decoded = verifyToken(token);"));
content.push(codeBlock("  if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });"));
content.push(codeBlock("  // Role check, data fetch, response"));
content.push(codeBlock("  const data = await prisma.model.findMany({ where: { tenantId } });"));
content.push(codeBlock("  return NextResponse.json({ data });"));
content.push(codeBlock("}"));
content.push(body("Error responses must follow the standard format: { error: string, details?: string } with appropriate HTTP status codes (400 for validation errors, 401 for authentication failures, 403 for authorization failures, 404 for not found, and 500 for server errors). Database errors should be caught with try/catch blocks and logged, with generic error messages returned to the client to prevent information leakage. Successful responses should use { data: T } for single items and { data: T[], total: number } for collections."));

content.push(heading("2.6 Prisma ORM Standards", HeadingLevel.HEADING_2));
content.push(body("The Prisma schema is the single source of truth for database structure and must be treated with the same rigor as production code. All model changes require a migration, and migrations must be reviewed before applying to production. The schema uses UUID primary keys (@default(uuid())) for all models, camelCase field names, and explicit relation definitions with onDelete: Cascade where appropriate."));
content.push(body("When defining relations, always include both sides of the relationship using the @relation attribute with a descriptive name. Use @unique for fields that should have database-level uniqueness constraints (e.g., employeeId, slug, assetTag). Enum-like fields should use String type with documented valid values rather than Prisma enums, as this provides greater flexibility for future additions without requiring migrations."));
content.push(body("Database queries should leverage Prisma's type-safe query builder and avoid raw SQL wherever possible. Include statements should be used judiciously to avoid over-fetching data. For complex queries that require aggregation or filtering across relations, use Prisma's fluent API with where, include, orderBy, skip, and take. Always use parameterized queries when raw SQL is unavoidable."));

content.push(heading("2.7 Design Token System", HeadingLevel.HEADING_2));
content.push(body("The NEXUS HRMS design token system provides a semantic layer on top of Tailwind CSS utility classes. Design tokens define the visual language of the application including colors, spacing, typography, and component styling. Using design tokens instead of arbitrary values ensures visual consistency, enables theme-wide changes, and makes the codebase more maintainable. All module pages and components must use the approved design tokens."));
content.push(makeTable(
  ["Token", "Usage", "CSS Implementation"],
  [
    ["nexus-card", "Card and panel containers", "bg-white rounded-xl border border-gray-200 shadow-sm"],
    ["nexus-badge", "Default badge styling", "px-2.5 py-0.5 rounded-full text-xs font-medium"],
    ["nexus-badge-success", "Success/active status", "bg-emerald-50 text-emerald-700 border-emerald-200"],
    ["nexus-badge-warning", "Warning/pending status", "bg-amber-50 text-amber-700 border-amber-200"],
    ["nexus-badge-error", "Error/rejected status", "bg-red-50 text-red-700 border-red-200"],
    ["nexus-badge-info", "Informational status", "bg-blue-50 text-blue-700 border-blue-200"],
    ["nexus-border", "Standard borders", "border border-gray-200"],
    ["nexus-text-primary", "Primary text", "text-gray-900"],
    ["nexus-text-secondary", "Secondary text", "text-gray-600"],
    ["nexus-text-muted", "Muted/helper text", "text-gray-400"],
  ]
));

// --- Chapter 3: Module-wise Code Explanation ---
content.push(heading("3. Module-wise Code Explanation"));
content.push(body("This chapter provides a detailed walkthrough of the code architecture for each module in NEXUS HRMS. Each module section covers the route page structure, component hierarchy, state management, API integration, and data model. Understanding these patterns is essential for maintaining existing modules and developing new ones that conform to the established architecture."));

// Platform Modules
content.push(heading("3.1 Super Admin Module", HeadingLevel.HEADING_2));
content.push(body("The Super Admin module is the platform-level management interface accessible only to users with the super_admin role. It provides functionality for managing tenants, subscription plans, audit logs, and global system configuration. The module is implemented as a single-page component at src/app/(dashboard)/super-admin/page.tsx with supporting logic in the SuperAdmin component at src/components/hrms/super-admin.tsx."));
content.push(body("The Super Admin page renders a dashboard with key metrics including total tenants, active subscriptions, revenue summaries, and system health indicators. Navigation tabs allow switching between the dashboard view, tenant management, subscription plans, and audit logs. The tenant management view provides a tabular listing of all tenants with inline actions for creating, editing, and suspending tenants. Each tenant record includes the tenant name, slug, domain, subscription plan, and status."));
content.push(body("API integration is handled through the /api/tenants and /api/super-admin/dashboard endpoints. The GET /api/super-admin/dashboard endpoint returns aggregated statistics including total tenants, active subscriptions, and monthly revenue. The tenants CRUD endpoints support full lifecycle management. Audit logs are accessed via GET /api/super-admin/audit-logs which returns a paginated list of all AuditLog records ordered by creation date. Role-based access is enforced at the API level by verifying the decoded JWT token's role field."));

content.push(heading("3.2 Tenant Admin Module", HeadingLevel.HEADING_2));
content.push(body("The Tenant Admin module provides organization-level administration for tenant administrators. It allows managing company groups, companies, branches, departments, and user accounts within the tenant's scope. The module enforces data isolation by filtering all database queries by the tenantId derived from the authenticated user's session. The page is located at src/app/(dashboard)/tenant-admin/page.tsx."));
content.push(body("The component structure follows a tabbed interface pattern with sections for Company Groups, Companies, Branches, Departments, and User Management. Each section implements the standard three-state pattern (list, form, view). When a company group is selected, the Companies tab filters to show only companies within that group. Similarly, selecting a company filters branches and departments. This cascading filter pattern ensures data context is maintained across navigation states."));
content.push(body("The Prisma models involved are Tenant, CompanyGroup, Company, Branch, and Department, with their hierarchical relationships enforced through foreign key constraints. The Company model includes comprehensive fields for registration details, tax identification, and address information. The Department model supports a self-referential hierarchy through parentDepartmentId, allowing for multi-level department structures."));

content.push(heading("3.3 AI Admin Console", HeadingLevel.HEADING_2));
content.push(body("The AI Admin Console is a specialized module for configuring and monitoring the AI features across the platform. Accessible to super_admin and tenant_admin roles, it provides control over AI model parameters, prompt templates, usage monitoring, and AI performance metrics. The module is implemented at src/app/(dashboard)/ai-admin/page.tsx and integrates with the z-ai-web-dev-sdk for AI model interaction."));
content.push(body("The console features three primary views: Model Configuration, Prompt Templates, and Usage Analytics. Model Configuration allows administrators to set parameters like temperature, max tokens, and model selection for different AI features (chatbot, interview, copilot). Prompt Templates provides a CRUD interface for managing system prompts that govern AI behavior. Usage Analytics displays metrics on AI feature usage including request counts, token consumption, response times, and error rates."));
content.push(body("The AIChatLog Prisma model stores all AI interactions with fields for userId, sessionId, role (user/assistant), message content, detected intent, confidence score, source (chatbot/interview/copilot), and metadata as JSON. This model enables comprehensive auditing and analytics of AI feature usage across the platform."));

// Core HR Modules
content.push(heading("3.4 Company Management Module", HeadingLevel.HEADING_2));
content.push(body("The Company Management module at src/app/(dashboard)/company/page.tsx provides a comprehensive interface for managing organizational structure including companies, branches, departments, and designations. This module is central to the HRMS as it defines the organizational hierarchy that all other modules reference. The component is implemented in src/components/hrms/company-management.tsx with the Companies component at src/components/hrms/companies.tsx."));
content.push(body("The module follows a hierarchical navigation pattern where selecting a company reveals its branches and departments. Each entity (Company, Branch, Department) supports full CRUD operations through inline forms that replace the list view when creating or editing. The Designation management is scoped to departments, with each designation defining a job level and salary range. The Designation model includes minSalary and maxSalary fields that inform compensation planning."));
content.push(body("Key Prisma models include Company (with registrationNo, taxId, country, currency, address fields), Branch (with location details and status), Department (with code, parentDepartmentId for hierarchy, and status), and Designation (with title, level, minSalary, maxSalary). The Company model also includes Holiday, Policy, and Announcement relations that define company-specific HR policies and events."));

content.push(heading("3.5 Employee Management Module", HeadingLevel.HEADING_2));
content.push(body("The Employee Management module is one of the most comprehensive modules in NEXUS HRMS, providing full lifecycle management of employees from creation through separation. Located at src/app/(dashboard)/employees/page.tsx with a dynamic route for individual employee views at src/app/(dashboard)/employees/[id]/page.tsx, this module serves as the central hub for employee data management. The primary components are EmployeeManagement and Employees in src/components/hrms/."));
content.push(body("The employee list view displays a searchable, filterable table of employees with columns for Employee ID, Name, Department, Designation, Status, and quick action buttons for viewing and editing. The search functionality filters across name, employee ID, and email fields. Department and status filters provide additional narrowing capabilities. The inline form for creating employees captures personal information, employment details, bank account information, and salary data."));
content.push(body("The Employee Prisma model is the central entity with relations to Dependent (one-to-many for family members), Qualification (educational history), Experience (work history), and EmployeeSkill (skill assessments). The model includes comprehensive personal fields (firstName, lastName, email, phone, dateOfBirth, gender, maritalStatus, address), employment fields (employeeId, dateOfJoining, probationEndDate, confirmationDate), and financial fields (salary, bankName, bankAccount, bankIfsc). The status field tracks the employee lifecycle: active, on_probation, on_leave, suspended, separated."));
content.push(body("The API endpoints at /api/employees support GET (list with pagination and filtering), POST (create with validation), and at /api/employees/[id] support GET (individual with relations), PUT (update), and DELETE (soft delete by setting status to separated). The dynamic route page.tsx at /employees/[id] renders a detailed employee profile with tabs for personal information, employment details, qualifications, experience, skills, documents, and activity history."));

// Talent Acquisition Modules
content.push(heading("3.6 Recruitment Module", HeadingLevel.HEADING_2));
content.push(body("The Recruitment module at src/app/(dashboard)/recruitment/page.tsx manages the complete talent acquisition pipeline from job posting through candidate screening and interview scheduling. The module is implemented in src/components/hrms/recruitment.tsx and integrates with the Requisitions, Offers, AI Interview, and Job Portal modules to provide a seamless hiring workflow. The recruitment dashboard displays a pipeline view showing candidates at each stage: Applied, Screening, Interview, Offer, Hired, and Rejected."));
content.push(body("The module uses three primary Prisma models: JobPosting, JobApplication, and Interview. JobPosting defines the open position with fields for title, department, position type, location, experience requirements, salary range, description, requirements, and number of vacancies. JobApplication captures candidate information including name, email, phone, resume URL, cover letter, source, and status progression through the hiring pipeline. Interview schedules individual sessions with type (phone, video, in-person, AI), date, time, duration, interviewer assignment, and feedback fields."));
content.push(body("The recruitment API at /api/recruitment supports creating job postings, listing applications filtered by job and status, updating application status, and scheduling interviews. The source field on JobApplication tracks where candidates came from (website, referral, job_portal, linkedin, other), enabling recruitment channel analytics. The rating field allows recruiters to score candidates on a 1-5 scale, and the aiScore and aiFeedback fields on the Interview model store AI-generated assessment results from the AI Interview module."));

content.push(heading("3.7 Requisitions Module", HeadingLevel.HEADING_2));
content.push(body("The Requisitions module at src/app/(dashboard)/requisitions/page.tsx manages manpower requisitions, which are formal requests from department heads or hiring managers to fill open positions. The Requisition Prisma model includes fields for requisitionId (auto-generated unique identifier), companyId, branchId, departmentId, designationId, hiringManagerId, positionType (new_replacement/additional), numberOfOpenings, employmentType (full_time/part_time/contract/intern), skillsRequired, experienceRequired, qualification, salaryBudget, priority (low/medium/high/critical), expectedJoiningDate, and approvalStatus."));
content.push(body("The requisition workflow follows a multi-step approval process: Draft (created by hiring manager) > Pending Approval (submitted to HR Admin) > Approved (requisition is open for recruitment) > Filled (all positions filled) > Cancelled. The approvalStatus field tracks this progression, and the status field provides a broader lifecycle view. Once a requisition is approved, it can be linked to a JobPosting through the jobPostingId field, automatically creating the public-facing job listing."));
content.push(body("The API endpoints at /api/requisitions implement role-based access control: managers can create and view their own requisitions, HR admins can approve or reject requisitions, and super admins have full access. The GET endpoint supports filtering by department, priority, and approvalStatus, and returns the associated company, branch, department, and designation details through Prisma include statements."));

content.push(heading("3.8 Offers Module", HeadingLevel.HEADING_2));
content.push(body("The Offers module at src/app/(dashboard)/offers/page.tsx manages the offer letter generation and tracking process for candidates who have successfully completed the interview process. The Offer Prisma model captures comprehensive offer details including candidateId, jobPostingId, candidateName, candidateEmail, position, department, offeredSalary, offeredCurrency, offeredCTC (Cost to Company), salaryBreakdown as a structured JSON object, joiningDate, probationPeriod, reportingTo, and status tracking through the offer lifecycle."));
content.push(body("The offer status workflow progresses through: Draft (initially created) > Pending Approval (submitted for HR/admin review) > Approved (authorized for sending) > Sent (email sent to candidate) > Accepted (candidate accepted) > Rejected (candidate declined) > Withdrawn (company withdrew the offer). The sentAt and respondedAt timestamp fields track the timing of these transitions. The salaryBreakdown JSON field stores a detailed breakdown including basic salary, HRA, DA, conveyance, medical allowance, special allowance, and any other components as defined by the salary structure."));
content.push(body("The API at /api/offers provides endpoints for creating offers (with automatic salary breakdown calculation based on the salary structure), listing offers with filtering, updating offer status, and generating offer letter documents. When an offer is accepted, the system can automatically initiate the pre-boarding process by creating an OnboardingTask record and updating the candidate's application status."));

content.push(heading("3.9 Job Portal Module", HeadingLevel.HEADING_2));
content.push(body("The Job Portal module at src/app/(dashboard)/job-portal/page.tsx implements the public-facing career site where external candidates can browse open positions, view job details, and submit applications. The module is implemented in src/components/hrms/job-portal.tsx and provides a dual interface: an administrative view for managing job postings and portal settings, and a public-facing view (accessible without authentication) for candidates."));
content.push(body("The admin interface allows HR administrators to publish job postings from approved requisitions to the portal, set application deadlines, configure required documents, and manage the portal appearance. Job postings can be featured, categorized by department or location, and tagged for search optimization. The portal settings control the company branding, custom application form fields, and automated response templates for acknowledging applications."));
content.push(body("The public-facing view renders job listings in a responsive grid layout with search, category filters, and location filters. Each job detail page displays the full job description, requirements, benefits, and an application form. Applications submitted through the portal automatically create JobApplication records with the source field set to 'job_portal', enabling tracking of portal-specific recruitment metrics."));

content.push(heading("3.10 AI Interview Module", HeadingLevel.HEADING_2));
content.push(body("The AI Interview module at src/app/(dashboard)/ai-interview/page.tsx is one of the most innovative features of NEXUS HRMS, providing AI-powered interview sessions that can evaluate candidates automatically. The module integrates with the z-ai-web-dev-sdk to conduct conversational interviews, evaluate responses, and generate structured feedback with scoring. The primary component is implemented in src/components/hrms/ai-interview.tsx."));
content.push(body("The AI Interview workflow begins when a recruiter initiates an interview session for a candidate. The system generates contextual interview questions based on the job posting requirements, the candidate's resume, and the position's skill requirements. During the interview, the AI chatbot conducts a multi-turn conversation, asking follow-up questions based on the candidate's responses. The session is recorded in the AIChatLog model with the source field set to 'interview'."));
content.push(body("After the interview concludes, the AI generates a comprehensive evaluation report stored in the Interview model's aiScore and aiFeedback fields. The aiScore is a numerical rating (0-100) that assesses the candidate across multiple dimensions including technical knowledge, communication skills, problem-solving ability, and cultural fit. The aiFeedback field contains structured feedback with specific observations, strengths, areas for improvement, and a recommendation (strong_hire, hire, no_hire, strong_no_hire). The /api/ai-interview endpoint handles the AI chat completions and scoring logic."));

// Lifecycle Modules
content.push(heading("3.11 Onboarding Module", HeadingLevel.HEADING_2));
content.push(body("The Onboarding module at src/app/(dashboard)/onboarding/page.tsx manages the process of integrating new employees into the organization. The module uses the OnboardingTask Prisma model to track individual tasks assigned to new hires, with each task having a category, status, due date, and completion tracking. Categories include documentation (completing employment forms), IT setup (equipment and account provisioning), training (orientation sessions and policy reviews), and introduction (team meetings and buddy assignments)."));
content.push(body("The module provides a dashboard view for HR administrators showing all active onboarding processes organized by employee, with progress indicators showing the percentage of completed tasks. The employee view shows their personal onboarding checklist with task descriptions, due dates, and completion actions. Tasks can be reassigned, rescheduled, or marked as complete with notes. The API at /api/onboarding supports CRUD operations with role-based filtering: HR admins see all tasks, managers see tasks for their department's employees, and employees see only their own tasks."));

content.push(heading("3.12 Preboarding Module", HeadingLevel.HEADING_2));
content.push(body("The Preboarding module at src/app/(dashboard)/preboarding/page.tsx handles the critical period between offer acceptance and the employee's first day. This module ensures that all necessary preparations are completed before the new hire arrives, including document collection, IT provisioning, workspace setup, and welcome communications. The module integrates with the Offers module to automatically create preboarding tasks when an offer is accepted."));
content.push(body("The preboarding checklist typically includes: collecting signed offer letters, tax forms (W-4 or local equivalent), bank account details for payroll setup, emergency contact information, and identification documents for verification. IT provisioning tasks include creating email accounts, granting system access, assigning equipment, and configuring VPN access. The module sends automated email reminders to the new hire for pending document submissions and provides a secure document upload portal."));

content.push(heading("3.13 Attendance Module", HeadingLevel.HEADING_2));
content.push(body("The Attendance module at src/app/(dashboard)/attendance/page.tsx provides comprehensive attendance tracking with features for check-in/check-out, shift management, overtime calculation, and attendance regularization. The Attendance Prisma model records each attendance entry with employeeId, date, checkIn, checkOut, status, workHours, overtime, notes, and location. The status field tracks attendance states: present, absent, half_day, late, on_leave, holiday, weekend."));
content.push(body("The check-in/check-out workflow is implemented through the /api/attendance endpoint. When an employee checks in, a new Attendance record is created with the checkIn timestamp. Upon check-out, the record is updated with the checkOut time, and workHours and overtime are automatically calculated based on the assigned shift. The Shift Prisma model defines shift configurations including name, startTime, endTime, breakDuration, and graceTime for late arrival tolerance."));
content.push(body("Attendance regularization allows employees to request corrections for missed check-ins or check-outs, with manager approval workflow. The module includes attendance analytics showing patterns of absenteeism, late arrivals, and overtime across departments. The calendar view provides a visual representation of attendance data with color-coded statuses."));

content.push(heading("3.14 Leave Management Module", HeadingLevel.HEADING_2));
content.push(body("The Leave Management module at src/app/(dashboard)/leave/page.tsx handles leave requests, balance tracking, and approval workflows. The module uses three Prisma models: LeaveType (defining leave categories with default days, carry-forward rules, and paid status), LeaveBalance (tracking each employee's leave entitlement by year with total, used, and remaining counts), and LeaveRequest (managing individual leave applications with dates, reasons, and approval status)."));
content.push(body("The leave request workflow follows: Employee submits request > Manager reviews > Approved/Rejected. The halfDay flag on LeaveRequest allows employees to request half-day leaves. The LeaveBalance model tracks carryForward amounts from previous years, subject to the maxCarryForward limit defined on the LeaveType. Leave balances are automatically updated when a request is approved, and the remaining balance is recalculated in real time."));
content.push(body("The calendar view displays leave data across the organization, enabling managers to identify potential staffing gaps from overlapping leaves. Team leave calendars can be filtered by department, showing all approved and pending leaves in a monthly or weekly view. The API at /api/leave supports creating requests, checking balances, and the approval workflow with role-based access control."));

content.push(heading("3.15 Separation Module", HeadingLevel.HEADING_2));
content.push(body("The Separation module at src/app/(dashboard)/separation/page.tsx manages the complete employee exit process from resignation submission through clearance and final settlement. The Separation Prisma model captures the type of separation (resignation, termination, retirement, layoff), reason, notice period, last working date, status, exit interview notes, and settlement amount. The workflow progresses through: Initiated > Notice Period > Clearance In Progress > Clearance Complete > FNF Processing > Separated."));
content.push(body("During the clearance process, the module tracks clearances from multiple departments including IT (equipment return, access revocation), Finance (loan settlement, advance recovery), HR (document return, knowledge transfer), and Administration (asset return, ID card surrender). Each department's clearance status is tracked individually, and the overall clearance status is derived from the completion of all department clearances."));
content.push(body("The exit interview component allows HR to document feedback from departing employees about their experience, reasons for leaving, and suggestions for improvement. This data feeds into retention analytics and engagement surveys. Upon completion of all clearances, the FNF (Full and Final) Settlement process is initiated through the FNF module, which calculates the final payment including pending salary, leave encashment, bonus, and deducts outstanding amounts."));

// Compensation Modules
content.push(heading("3.16 Payroll Module", HeadingLevel.HEADING_2));
content.push(body("The Payroll module at src/app/(dashboard)/payroll/page.tsx is one of the most critical modules in the HRMS, responsible for processing employee salaries, generating payslips, and managing payroll runs. The Payroll Prisma model stores detailed salary breakdowns including basicSalary, hra, da, conveyance, medical, otherAllowances, grossSalary, pf, esi, tax, professionalTax, otherDeductions, totalDeductions, netSalary, currency, status, paidDate, and paySlip (URL to generated PDF)."));
content.push(body("The payroll processing workflow begins with the payroll administrator selecting a pay period (month/year) and initiating a payroll run. The system automatically calculates each employee's earnings based on their salary structure and attendance data for the period. Deductions are computed including statutory deductions (PF, ESI, professional tax) and any additional deductions like loan EMIs or advance recoveries. The net salary is calculated as grossSalary minus totalDeductions."));
content.push(body("The module supports multiple payroll statuses: Draft (initially calculated), Processing (under review), Approved (authorized for payment), Paid (payment processed), and Cancelled. Payslip generation creates PDF documents with the complete salary breakdown, which are stored and accessible to employees through the self-service portal. The API at /api/payroll supports bulk payroll processing, individual payslip generation, and payroll reports for accounting integration."));

content.push(heading("3.17 Salary Structures Module", HeadingLevel.HEADING_2));
content.push(body("The Salary Structures module at src/app/(dashboard)/salary-structures/page.tsx provides a flexible engine for defining compensation frameworks. It uses two Prisma models: SalaryStructure (defining the overall structure with name, companyId, country, currency, and description) and SalaryComponent (defining individual components within the structure with type, category, calculationType, value, percentageOf, formula, isTaxable, isStatutory, maxLimit, and sortOrder)."));
content.push(body("Each salary component can be either an earning or a deduction, and its value can be calculated using three methods: Fixed (a set amount), Percentage (a percentage of another component, such as HRA being 40% of basic salary), or Formula (a custom expression referencing other components). This flexibility allows organizations to model virtually any compensation structure, from simple flat-rate schemes to complex multi-component packages with conditional calculations."));
content.push(body("The module provides a visual drag-and-drop interface for ordering salary components, which determines the calculation sequence. Components that depend on other components must be calculated after their dependencies. The formula field supports a simple expression language with references to other component names, basic arithmetic operators, and conditional logic. The API at /api/salary-structures validates formulas for circular dependencies before saving."));

// Growth Modules
content.push(heading("3.18 Performance Module", HeadingLevel.HEADING_2));
content.push(body("The Performance module at src/app/(dashboard)/performance/page.tsx manages employee performance reviews, goal setting, and feedback cycles. The module uses two primary Prisma models: PerformanceReview (with reviewCycle, reviewPeriod, reviewerId, multi-dimensional ratings including goalsRating, skillsRating, behaviorRating, overallRating, comments, strengths, improvements, and status) and Goal (with title, description, category, priority, status, progress tracking, and date management)."));
content.push(body("The performance review workflow follows a structured process: the HR administrator creates a review cycle defining the period and participants. Employees complete self-assessments, managers provide their evaluations, and optionally 360-degree feedback is collected from peers. The overall rating is calculated as a weighted average of the dimensional ratings, with weights configurable per review cycle. Review statuses progress through: Draft > Self Assessment > Manager Review > Calibration > Completed."));
content.push(body("Goal management supports the OKR (Objectives and Key Results) methodology with progress tracking. Each goal has a category (performance, development, behavioral), priority level, and progress percentage that can be updated throughout the review period. Goals can be linked to organizational objectives, creating alignment from individual contributors to company-level targets. The API at /api/performance and /api/goals support the full CRUD lifecycle with role-based access controls."));

content.push(heading("3.19 Training Module", HeadingLevel.HEADING_2));
content.push(body("The Training module at src/app/(dashboard)/training/page.tsx manages corporate learning and development programs. The module uses two Prisma models: Training (defining courses with title, description, category, trainer, schedule, location, mode, status, maxParticipants, and cost) and TrainingEnrollment (tracking employee participation with status, score, feedback, and completionDate). The module supports multiple training modes: classroom, online, hybrid, and self-paced."));
content.push(body("The training lifecycle progresses through: Scheduled (course created with dates and capacity) > Enrolling (accepting participant registrations) > In Progress (training is underway) > Completed (training finished) > Cancelled. Employees can browse available courses, enroll (subject to capacity limits), and provide post-training feedback. Managers can nominate team members for specific training programs and track completion rates."));
content.push(body("The module integrates with the performance review system to identify skill gaps and recommend relevant training programs. Training completion data feeds into the employee's skill profile and performance metrics. The analytics dashboard shows training ROI metrics including completion rates, average scores, skill improvement tracking, and cost-per-employee analysis."));

content.push(heading("3.20 Engagement Module", HeadingLevel.HEADING_2));
content.push(body("The Engagement module at src/app/(dashboard)/engagement/page.tsx manages employee engagement surveys, pulse checks, and sentiment analysis. The module uses the Feedback Prisma model to collect and analyze employee feedback across multiple dimensions including job satisfaction, work-life balance, management effectiveness, and organizational culture. Feedback types include peer feedback, manager feedback, self-assessment, and 360-degree reviews."));
content.push(body("The survey creation workflow allows HR administrators to design custom surveys with multiple question types (rating scale, multiple choice, open-ended) and configure distribution rules (all employees, specific departments, random sampling). Surveys can be scheduled for recurring administration (weekly pulse checks, quarterly comprehensive surveys) with automated distribution and reminder notifications."));
content.push(body("The analytics dashboard provides real-time engagement scores with trend analysis, heatmaps showing engagement by department and tenure, and text analytics for open-ended responses. The isAnonymous flag on the Feedback model ensures that sensitive feedback can be collected without attribution, encouraging honest responses. The module also tracks eNPS (Employee Net Promoter Score) over time."));

content.push(heading("3.21 Succession Planning Module", HeadingLevel.HEADING_2));
content.push(body("The Succession Planning module at src/app/(dashboard)/succession/page.tsx helps organizations identify and develop internal talent to fill key positions. The module provides tools for creating succession plans for critical roles, identifying potential successors based on performance data, skill assessments, and career aspirations, and tracking development progress for successor candidates."));
content.push(body("The succession planning workflow involves identifying key positions (typically senior leadership and critical technical roles), assessing potential successors using a nine-box grid (performance vs. potential), creating development plans for identified successors, and tracking readiness over time. The module integrates with the Performance module for performance data, the Training module for development activities, and the Employee Skills model for competency assessments."));
content.push(body("The nine-box grid visualization plots employees on two axes: performance (low, medium, high) and potential (low, medium, high). Each cell in the grid has a specific development recommendation, from 'Exit' for low performers with low potential to 'Star' for high performers with high potential. Successor candidates are ranked by their readiness level (Ready Now, Ready in 1-2 Years, Ready in 3-5 Years) with specific development actions assigned."));

// Operations Modules
content.push(heading("3.22 Projects Module", HeadingLevel.HEADING_2));
content.push(body("The Projects module at src/app/(dashboard)/projects/page.tsx provides comprehensive project management capabilities. The module uses three Prisma models: Project (with projectType, billingType, budgetAmount, estimatedHours, actualHours, billingRate, costRate, and progress tracking), ProjectTask (with milestone assignment, planned vs. actual hours, priority, and billable flag), and ProjectMilestone (with billing amount, completion percentage, and invoice status). The ProjectAllocation model tracks team assignments with role, allocation percentage, and billing status."));
content.push(body("The module supports both Kanban and list views for task management. Projects can be filtered by status (not_started, in_progress, on_hold, completed, cancelled), client, and project manager. The Gantt-style timeline view shows task dependencies and milestone dates. Resource allocation reports show team utilization across projects with conflict detection for over-allocated resources."));
content.push(body("The billing integration tracks billable hours against project budgets, with automatic calculations for project profitability. Milestone-based billing allows invoicing at predefined project stages. The API at /api/projects, /api/projects/[id]/tasks, and /api/projects/[id]/allocations provide the full CRUD lifecycle with role-based access: project managers can manage their own projects, while administrators have access to all projects."));

content.push(heading("3.23 Assets Module", HeadingLevel.HEADING_2));
content.push(body("The Assets module at src/app/(dashboard)/assets/page.tsx manages organizational assets including IT equipment, furniture, vehicles, and other company property. The module uses two Prisma models: Asset (with assetTag, category, brand, model, serialNumber, purchaseDate, purchaseCost, status, condition, location, and warrantyExpiry) and AssetAssignment (tracking the assignment of assets to employees with assignedDate, returnDate, condition, and status)."));
content.push(body("The asset lifecycle follows: Purchased (new asset registered) > Available (in inventory, not assigned) > Assigned (allocated to an employee) > In Maintenance (under repair or servicing) > Retired (disposed or written off). The module provides a QR code generation feature for physical asset tagging, enabling quick asset identification through mobile scanning. Warranty tracking sends automatic alerts when assets approach their warranty expiry dates."));
content.push(body("The asset dashboard provides key metrics including total asset value, assignment rate, maintenance costs, and depreciation calculations. The API at /api/assets supports bulk asset creation, assignment workflows, and maintenance scheduling. Integration with the Separation module ensures that all assets are returned and accounted for during the employee exit clearance process."));

// Remaining modules summary
content.push(heading("3.24 Additional Modules Overview", HeadingLevel.HEADING_2));
content.push(makeTable(
  ["Module", "Route", "Prisma Models", "Key Features"],
  [
    ["Timesheets", "/timesheets", "Timesheet", "Time tracking, approval workflows, project billing integration"],
    ["Travel", "/travel", "TravelRequest", "Travel requests, itinerary management, approval workflow, cost estimation"],
    ["Expenses", "/expenses", "ExpenseClaim", "Expense claims, receipt upload, multi-level approval, reimbursement"],
    ["Documents", "/documents", "Document", "Document management, versioning, expiry tracking, access control"],
    ["Clients", "/clients", "Client", "Client management, SLA tracking, contract management, billing"],
    ["Vendors", "/vendors", "Vendor", "Vendor management, sub-vendor hierarchy, performance rating, invoices"],
    ["Helpdesk", "/helpdesk", "Ticket, TicketCategory, TicketComment", "Ticket management, SLA tracking, knowledge base, internal notes"],
    ["Grievances", "/grievances", "Grievance", "Grievance submission, investigation workflow, resolution tracking"],
    ["AI Assistant", "/ai-assistant", "AIChatLog", "AI chatbot, intent detection, contextual responses, learning"],
    ["Workflows", "/workflows", "WorkflowDefinition, WorkflowInstance, WorkflowApproval", "Workflow builder, multi-step approval, step tracking"],
    ["Reports", "/reports", "—", "HR analytics, custom reports, data export, scheduled generation"],
    ["Settings", "/settings", "Policy, Holiday, Announcement, Shift", "General config, notifications, integrations, policy management"],
    ["FNF Settlement", "/fnf", "FNFCalculation", "Full & final settlement, leave encashment, recovery calculation"],
  ]
));

// --- Chapter 4: State Management ---
content.push(heading("4. State Management Architecture"));
content.push(body("State management in NEXUS HRMS follows a hybrid approach combining React's built-in state management (useState, useReducer) for component-local state with Zustand for cross-component and persisted state. This approach avoids the complexity of a global state management library while providing the persistence and sharing capabilities needed for authentication state and notification management."));

content.push(heading("4.1 Zustand Stores", HeadingLevel.HEADING_2));
content.push(makeTable(
  ["Store", "File", "State", "Actions", "Persistence"],
  [
    ["Auth Store", "src/store/authStore.ts", "user, token, isAuthenticated, isLoading", "login, logout, fetchUser, setToken", "localStorage (token + user)"],
    ["Notification Store", "src/store/notificationStore.ts", "list, unreadCount", "fetchNotifications, markAsRead, markAllAsRead", "None (fetched on mount)"],
    ["App Store", "src/lib/store.ts", "activeModule, sidebarOpen, searchQuery, userRole, currentCompanyId, homeView", "setActiveModule, toggleSidebar, setSearchQuery, etc.", "None"],
  ]
));
content.push(body("The authStore is the most critical Zustand store, managing the JWT authentication token and user profile data. The store persists the token to localStorage on login and removes it on logout. The fetchUser action calls the /api/auth/me endpoint with the stored token to validate the session and retrieve the current user profile. This pattern ensures that the authentication state survives page refreshes while maintaining server-side session validation."));
content.push(body("The notificationStore fetches notifications from the /api/notifications endpoint on component mount and provides actions for marking individual or all notifications as read. The unreadCount is computed from the notification list and displayed in the Header component's notification bell icon. Real-time notification updates are achieved through periodic polling rather than WebSocket connections, keeping the implementation simple and compatible with serverless deployment."));

content.push(heading("4.2 Component State Pattern", HeadingLevel.HEADING_2));
content.push(body("Each module page manages its own local state using React's useState hook following a consistent pattern. The standard state variables include activeTab (for sub-view navigation), viewingId (for the read-only detail panel), editingId (for the edit form), showForm (for the create form), and searchQuery (for list filtering). This pattern is repeated across all modules, creating a predictable development experience."));
content.push(body("Form state is managed locally within the form component using controlled inputs. Each form field has a corresponding state variable with an onChange handler. Form submission calls the appropriate API endpoint, handles loading states with a submitting flag, and provides user feedback through the react-hot-toast notification system. Error handling displays validation errors inline next to the relevant form fields."));

// --- Chapter 5: Authentication & Authorization ---
content.push(heading("5. Authentication & Authorization"));
content.push(body("The authentication system in NEXUS HRMS implements a custom JWT-based approach using the jose library for token creation and verification and bcryptjs for password hashing. The system is designed for stateless authentication suitable for serverless deployment, where session state is not maintained on the server but is instead encoded in the JWT token payload."));

content.push(heading("5.1 Authentication Flow", HeadingLevel.HEADING_2));
content.push(body("The authentication flow begins at the login page (src/app/login/page.tsx) where users enter their email and password. The frontend sends a POST request to /api/auth/login with the credentials. The server validates the email against the User table in the database, verifies the password using bcryptjs compare, and if valid, creates a JWT token using jose's SignJWT with the HS256 algorithm and a 24-hour expiry period."));
content.push(body("The JWT token contains the user's ID, email, name, role, and tenantId as claims. The token is returned in the response body and stored in both the Zustand authStore (for React state) and localStorage (for persistence across page refreshes). Subsequent API requests include the token in the Authorization: Bearer header, which is extracted and verified by the getTokenFromHeaders and verifyToken functions in src/lib/auth.ts."));

content.push(heading("5.2 Role-Based Access Control", HeadingLevel.HEADING_2));
content.push(body("The authorization system implements role-based access control (RBAC) at multiple levels. The sidebar navigation in src/components/Sidebar.tsx defines which menu items are visible to each role, using the role field on each nav item. For example, Super Admin items are only visible to users with the super_admin role, while Employee-level items are visible to all authenticated users."));
content.push(makeTable(
  ["Role", "Sidebar Sections", "Key Capabilities"],
  [
    ["super_admin", "All sections", "Full system access, tenant management, audit logs, AI console"],
    ["tenant_admin", "Platform (limited), Core HR, all operational", "Company management, user provisioning, subscription management"],
    ["hr_admin", "Core HR, Talent Acquisition, Compensation, Growth", "Employee management, recruitment, payroll, performance reviews"],
    ["manager", "Core HR (limited), Requisitions, Projects", "Team management, requisition creation, timesheet approval"],
    ["employee", "Dashboard, Employees (view), self-service modules", "Profile view, leave requests, timesheets, helpdesk"],
  ]
));
content.push(body("API routes enforce authorization by decoding the JWT token and checking the role claim against the required role for the operation. For example, the POST /api/requisitions endpoint requires the hr_admin or manager role, while GET /api/requisitions allows broader access with results filtered by the user's role and department. This defense-in-depth approach ensures that even if the sidebar is bypassed, the API layer still enforces access control."));

// --- Chapter 6: API Integration Patterns ---
content.push(heading("6. API Integration Patterns"));
content.push(body("The API layer in NEXUS HRMS follows consistent patterns for request handling, response formatting, and error management. Understanding these patterns is essential for developing new API endpoints and consuming them from frontend components. The API is built on Next.js API routes, which run as serverless functions on Vercel, with Prisma as the data access layer connecting to the Neon serverless PostgreSQL database."));

content.push(heading("6.1 Request/Response Standards", HeadingLevel.HEADING_2));
content.push(body("All API endpoints follow RESTful conventions with consistent request and response formats. GET requests accept query parameters for filtering, pagination (page, limit), and sorting (sortBy, sortOrder). POST and PUT requests accept JSON bodies with appropriate field validation. DELETE requests support soft deletion by updating the status field rather than physically removing records, preserving audit trails and referential integrity."));
content.push(makeTable(
  ["Operation", "Method", "Path Pattern", "Success Response", "Error Response"],
  [
    ["List", "GET", "/api/{module}", "{ data: T[], total: number }", "{ error: string }"],
    ["Get by ID", "GET", "/api/{module}/{id}", "{ data: T }", "{ error: 'Not found' }"],
    ["Create", "POST", "/api/{module}", "{ data: T }", "{ error: string, details?: string }"],
    ["Update", "PUT", "/api/{module}/{id}", "{ data: T }", "{ error: string }"],
    ["Delete", "DELETE", "/api/{module}/{id}", "{ success: true }", "{ error: string }"],
  ]
));

content.push(heading("6.2 Frontend API Integration", HeadingLevel.HEADING_2));
content.push(body("The frontend API integration is handled through two mechanisms: the apiFetch helper in src/lib/api.ts and direct fetch calls in component effects. The apiFetch function provides a typed wrapper around the native fetch API that automatically includes the authentication token from the auth store, handles JSON serialization and deserialization, and provides consistent error handling. Typed API functions are exported for each module (e.g., fetchEmployees, createLeave, updatePerformance) with proper TypeScript interfaces for request and response types."));
content.push(body("The React Query provider in src/lib/api-provider.tsx wraps the application with @tanstack/react-query, configured with a 30-second stale time and 1 retry on failure. React Query manages caching, background refetching, and optimistic updates. Module pages use the useQuery hook for data fetching and useMutation for create/update operations, with automatic cache invalidation on successful mutations."));

// --- Chapter 7: Deployment Architecture ---
content.push(heading("7. Deployment Architecture"));
content.push(body("NEXUS HRMS is deployed on Vercel's serverless platform, which provides automatic scaling, edge caching, and seamless integration with the Neon serverless PostgreSQL database. The deployment architecture is designed for zero-configuration scaling, where each API route and server component runs as an independent serverless function, automatically scaling based on traffic demand."));

content.push(heading("7.1 Build and Deployment Process", HeadingLevel.HEADING_2));
content.push(body("The build process is defined in vercel.json with the build command 'npx prisma generate && npx next build'. This ensures that the Prisma client is generated before the Next.js build, which is necessary because the application imports from @/generated/prisma/client rather than the standard @prisma/client. The Neon Vercel integration automatically provides the POSTGRES_URL, POSTGRES_PRISMA_URL, and POSTGRES_URL_NON_POOLING environment variables, which the application uses through its fallback chain: POSTGRES_PRISMA_URL || POSTGRES_URL || DATABASE_URL."));
content.push(body("The Prisma client is configured in prisma.config.ts to use the Neon serverless adapter (@prisma/adapter-neon) with the @neondatabase/serverless driver. This configuration enables WebSocket-less connections optimized for serverless environments, where each function invocation establishes a new database connection through Neon's connection pooler. The development mode uses a singleton pattern to prevent connection pool exhaustion during hot reloading, while production creates a new client per request."));

content.push(heading("7.2 Environment Configuration", HeadingLevel.HEADING_2));
content.push(makeTable(
  ["Variable", "Source", "Usage", "Required"],
  [
    ["POSTGRES_PRISMA_URL", "Vercel Neon Integration", "Primary Prisma connection string with pooling", "Yes (on Vercel)"],
    ["POSTGRES_URL", "Vercel Neon Integration", "Fallback connection string", "Yes (on Vercel)"],
    ["POSTGRES_URL_NON_POOLING", "Vercel Neon Integration", "Direct connection for migrations", "Yes (on Vercel)"],
    ["DATABASE_URL", "Local .env", "Local development connection string", "Yes (local only)"],
    ["JWT_SECRET", "Manual", "Secret key for JWT token signing", "Yes"],
    ["NEXT_PUBLIC_APP_URL", "Manual", "Public application URL for CORS", "No"],
  ]
));

// --- Chapter 8: Testing Standards ---
content.push(heading("8. Testing Standards"));
content.push(body("Testing is a critical component of maintaining code quality in a large-scale HRMS application. While the current codebase is in the development phase with emphasis on feature delivery, the testing strategy outlined here defines the standards that must be adopted as the platform matures toward production readiness. The testing pyramid for NEXUS HRMS follows the standard distribution: a broad base of unit tests, a middle layer of integration tests, and a thin top layer of end-to-end tests."));

content.push(heading("8.1 Unit Testing", HeadingLevel.HEADING_2));
content.push(body("Unit tests should cover individual functions, utility methods, and component rendering logic. The recommended testing framework is Jest with React Testing Library for component tests. Each module should have a corresponding test file co-located with the source file using the .test.ts or .test.tsx naming convention. Unit tests for API route handlers should mock the Prisma client and test request validation, error handling, and response formatting independently of the database."));
content.push(body("Critical areas for unit test coverage include: authentication functions (hashPassword, verifyPassword, createToken, verifyToken), utility functions (safeText, cn class merging), form validation logic, state management stores (Zustand actions and computed values), and data transformation functions. The target code coverage is 80% for core business logic modules and 60% for UI components."));

content.push(heading("8.2 Integration Testing", HeadingLevel.HEADING_2));
content.push(body("Integration tests verify the interaction between multiple components of the system, particularly the API routes and their database operations. These tests should use a test database instance with seeded data and test the complete request-response cycle including authentication, authorization, data validation, database operations, and response formatting. The recommended approach is to use a dedicated test database that is reset between test runs using Prisma migrations and seed scripts."));
content.push(body("Key integration test scenarios include: complete CRUD lifecycle for each module (create, read, update, delete), authentication flow (login, token validation, session expiry), role-based access control (verifying that different roles see different data), multi-tenant data isolation (verifying that tenant A cannot access tenant B's data), and workflow transitions (approval chains, status changes)."));

content.push(heading("8.3 End-to-End Testing", HeadingLevel.HEADING_2));
content.push(body("End-to-end tests validate complete user workflows through the browser, simulating real user interactions. The recommended framework is Playwright, which provides cross-browser testing capabilities and integrates well with the Next.js development workflow. E2E tests should cover the most critical user journeys including: login and authentication, employee onboarding workflow, leave request approval workflow, payroll processing, and recruitment pipeline management."));
content.push(body("E2E tests should be run against a staging environment that mirrors the production configuration, with a seeded test database that provides consistent test data. Tests should be independent and idempotent, not relying on the state created by previous tests. The CI/CD pipeline should run E2E tests on every pull request merge to the main branch, with failures blocking the deployment."));

// Build the document
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" }, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 32, bold: true, color: P.primary } },
      heading2: { run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 28, bold: true, color: P.primary } },
      heading3: { run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 26, bold: true, color: P.primary } },
    }
  },
  sections: [
    // Cover section
    {
      properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 }, size: { width: 11906, height: 16838 } } },
      children: [buildCover()]
    },
    // TOC section
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 }, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary })] })] })
      },
      children: [
        new Paragraph({ spacing: { before: 200, after: 300 }, children: [new TextRun({ text: "Table of Contents", bold: true, size: 36, color: P.primary, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })] }),
        new TableOfContents("TOC", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new TextRun({ text: "Right-click the table of contents and select 'Update Field' to refresh page numbers.", italics: true, size: 18, color: P.secondary })] }),
        new Paragraph({ children: [new PageBreak()] }),
      ]
    },
    // Body section
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 }, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary })] })] })
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "NEXUS HRMS - Technical Documentation", size: 18, color: P.secondary, italics: true })] })] })
      },
      children: content,
    }
  ]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/home/z/my-project/download/NEXUS-HRMS-Technical-Documentation.docx", buf);
  console.log("Document 1 generated successfully!");
});
