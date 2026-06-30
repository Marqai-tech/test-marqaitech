'use client';

import { useState, useMemo } from 'react';
import {
  FiBookOpen,
  FiCode,
  FiLayout,
  FiGitBranch,
  FiShield,
  FiCpu,
  FiFileText,
  FiVideo,
  FiSearch,
  FiEye,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiChevronRight,
  FiClock,
  FiUser,
  FiTag,
  FiLock,
  FiStar,
  FiExternalLink,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface DocCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description?: string;
  docCount: number;
}

interface DocDocument {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  category?: { id: string; name: string; slug: string; icon: string; color: string };
  content: string;
  summary?: string | null;
  tags?: string | null;
  version: string;
  author?: string | null;
  fileUrl?: string | null;
  videoUrl?: string | null;
  status: string;
  isFeatured: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  permissions?: DocPermission[];
}

interface DocPermission {
  id: string;
  documentId: string;
  targetType: string;
  targetId: string;
  canView: boolean;
  canEdit: boolean;
  canShare: boolean;
  grantedBy?: string | null;
}

/* ── Category Config ── */
const CATEGORIES: DocCategory[] = [
  { id: 'cat-technical', name: 'Technical', slug: 'technical', icon: 'FiCode', color: 'blue', description: 'System architecture, API docs, integration guides', docCount: 3 },
  { id: 'cat-functional', name: 'Functional', slug: 'functional', icon: 'FiLayout', color: 'violet', description: 'Feature guides, user manuals, how-tos', docCount: 3 },
  { id: 'cat-workflow', name: 'Workflow', slug: 'workflow', icon: 'FiGitBranch', color: 'emerald', description: 'Approval workflows, business processes, flow charts', docCount: 3 },
  { id: 'cat-security', name: 'Security', slug: 'security', icon: 'FiShield', color: 'amber', description: 'Security policies, data protection, compliance', docCount: 3 },
  { id: 'cat-ai', name: 'AI', slug: 'ai', icon: 'FiCpu', color: 'purple', description: 'AI features, ML models, automation guides', docCount: 3 },
  { id: 'cat-sop', name: 'SOP', slug: 'sop', icon: 'FiFileText', color: 'rose', description: 'Standard operating procedures, checklists, templates', docCount: 3 },
  { id: 'cat-training', name: 'Training Videos', slug: 'training-videos', icon: 'FiVideo', color: 'cyan', description: 'Video tutorials, walkthroughs, demo recordings', docCount: 3 },
];

/* ── Color map ── */
const colorMap: Record<string, { bg: string; text: string; border: string; light: string; icon: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50', icon: 'text-blue-500' },
  violet: { bg: 'bg-violet-500', text: 'text-violet-600', border: 'border-violet-200', light: 'bg-violet-50', icon: 'text-violet-500' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50', icon: 'text-emerald-500' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50', icon: 'text-amber-500' },
  purple: { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200', light: 'bg-purple-50', icon: 'text-purple-500' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200', light: 'bg-rose-50', icon: 'text-rose-500' },
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-600', border: 'border-cyan-200', light: 'bg-cyan-50', icon: 'text-cyan-500' },
};

/* ── Icon map ── */
const iconMap: Record<string, React.ReactNode> = {
  FiCode: <FiCode className="w-5 h-5" />,
  FiLayout: <FiLayout className="w-5 h-5" />,
  FiGitBranch: <FiGitBranch className="w-5 h-5" />,
  FiShield: <FiShield className="w-5 h-5" />,
  FiCpu: <FiCpu className="w-5 h-5" />,
  FiFileText: <FiFileText className="w-5 h-5" />,
  FiVideo: <FiVideo className="w-5 h-5" />,
  FiBookOpen: <FiBookOpen className="w-5 h-5" />,
};

/* ── Seeded Sample Documents ── */
const SAMPLE_DOCUMENTS: DocDocument[] = [
  // Technical
  {
    id: 'doc-tech-1',
    title: 'System Architecture Overview',
    slug: 'system-architecture-overview',
    categoryId: 'cat-technical',
    category: { id: 'cat-technical', name: 'Technical', slug: 'technical', icon: 'FiCode', color: 'blue' },
    content: `# System Architecture Overview

## Introduction
3Boxes HRMS is built on a modern SaaS multi-tenant architecture designed for scalability, security, and performance. The platform serves organizations of all sizes with enterprise-grade HR management capabilities.

## Architecture Components

### Frontend Layer
- **Next.js 16** with App Router for server-side rendering and static generation
- **React 19** with TypeScript for type-safe component development
- **Tailwind CSS 4** for responsive, utility-first styling
- Client-side state management with **Zustand** and **TanStack Query**

### Backend Layer
- **Next.js API Routes** for RESTful endpoints
- **Prisma ORM** with PostgreSQL (Neon) for database operations
- **JWT-based authentication** with role-based access control
- Real-time communication via **Socket.io**

### Database Layer
- **PostgreSQL** hosted on Neon serverless
- Multi-tenant data isolation at the application layer
- Prisma Client for type-safe database queries
- Automated migrations and schema management

### Infrastructure
- Deployed on **Vercel** with edge functions
- CDN distribution for static assets
- Automated CI/CD pipeline
- Health monitoring and alerting

## Multi-Tenancy Model
The platform uses a shared database with tenant isolation through application-level filtering. Each tenant's data is scoped via \`tenantId\` foreign keys across all models.

## Security Architecture
- End-to-end encryption for sensitive data
- RBAC with 5 role levels: super_admin, tenant_admin, hr_admin, manager, employee
- JWT tokens with 24-hour expiry
- Audit logging for all critical operations`,
    summary: 'Complete architecture diagram and component breakdown of 3Boxes HRMS SaaS platform',
    tags: 'architecture, system, infrastructure, SaaS',
    version: '2.1',
    author: 'Engineering Team',
    status: 'published',
    isFeatured: true,
    viewCount: 1247,
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-02-10T14:30:00Z',
  },
  {
    id: 'doc-tech-2',
    title: 'API Integration Guide',
    slug: 'api-integration-guide',
    categoryId: 'cat-technical',
    category: { id: 'cat-technical', name: 'Technical', slug: 'technical', icon: 'FiCode', color: 'blue' },
    content: `# API Integration Guide

## Authentication
All API requests require a Bearer token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Core Endpoints

### Employees
- \`GET /api/employees\` - List all employees
- \`POST /api/employees\` - Create new employee
- \`GET /api/employees/:id\` - Get employee details
- \`PATCH /api/employees/:id\` - Update employee
- \`DELETE /api/employees/:id\` - Delete employee

### Payroll
- \`GET /api/payroll\` - List payroll records
- \`POST /api/payroll\` - Process payroll
- \`GET /api/payroll/:id\` - Get payroll details

### Leave Management
- \`GET /api/leave\` - List leave requests
- \`POST /api/leave\` - Submit leave request
- \`PATCH /api/leave/:id\` - Update leave status

## Webhook Configuration
Configure webhooks to receive real-time notifications for events like:
- Employee onboarding completion
- Leave request status changes
- Payroll processing completion
- Performance review submissions

## Rate Limiting
- Standard tier: 100 requests/minute
- Professional tier: 500 requests/minute
- Enterprise tier: 2000 requests/minute`,
    summary: 'REST API endpoints, authentication, and webhook configuration',
    tags: 'API, REST, webhooks, integration',
    version: '1.8',
    author: 'API Team',
    status: 'published',
    isFeatured: false,
    viewCount: 893,
    createdAt: '2025-01-20T09:00:00Z',
    updatedAt: '2025-02-08T11:00:00Z',
  },
  {
    id: 'doc-tech-3',
    title: 'Database Schema Documentation',
    slug: 'database-schema-documentation',
    categoryId: 'cat-technical',
    category: { id: 'cat-technical', name: 'Technical', slug: 'technical', icon: 'FiCode', color: 'blue' },
    content: `# Database Schema Documentation

## Entity Relationship Overview
3Boxes HRMS uses a relational database model with over 50 interconnected entities organized into logical domains.

## Core Entities

### Tenant & Organization
- **Tenant** - Top-level SaaS customer organization
- **CompanyGroup** - Group of companies within a tenant
- **Company** - Individual company with branches
- **Branch** - Physical office location
- **Department** - Organizational unit within a company

### People
- **User** - Authentication and authorization identity
- **Employee** - Full employee record with personal/professional details
- **Designation** - Job title with level and salary band

### HR Operations
- **LeaveType/LeaveRequest/LeaveBalance** - Leave management
- **Attendance** - Daily attendance tracking
- **Payroll** - Monthly salary processing
- **PerformanceReview/Goal** - Performance management

### Recruitment
- **JobPosting/JobApplication/Interview** - Full recruitment pipeline

## Migration Guide
Use Prisma migrations for schema changes:
\`\`\`bash
npx prisma migrate dev --name your-migration-name
npx prisma generate
\`\`\``,
    summary: 'Entity relationship diagrams, model definitions, and migration guides',
    tags: 'database, schema, ERD, migration',
    version: '1.5',
    author: 'Database Team',
    status: 'published',
    isFeatured: false,
    viewCount: 654,
    createdAt: '2025-01-22T13:00:00Z',
    updatedAt: '2025-02-05T16:00:00Z',
  },

  // Functional
  {
    id: 'doc-func-1',
    title: 'Employee Management Guide',
    slug: 'employee-management-guide',
    categoryId: 'cat-functional',
    category: { id: 'cat-functional', name: 'Functional', slug: 'functional', icon: 'FiLayout', color: 'violet' },
    content: `# Employee Management Guide

## Overview
The Employee Management module is the core of 3Boxes HRMS, providing comprehensive tools for managing the complete employee lifecycle from onboarding to separation.

## Employee Lifecycle

### 1. Onboarding
- Create employee profile with personal details
- Assign department, designation, and branch
- Set up bank account and tax information
- Generate employee ID automatically
- Initiate onboarding task checklist

### 2. Active Employment
- Update personal information
- Manage employment changes (promotion, transfer)
- Track qualifications, skills, and experience
- Handle document management
- Manage employee assets

### 3. Leave & Attendance
- Configure leave policies and balances
- Process leave requests with multi-level approval
- Track daily attendance with check-in/check-out
- Manage shifts and overtime

### 4. Separation
- Process resignation/termination
- Manage notice period
- Conduct exit interviews
- Process Full & Final settlement

## Best Practices
- Always verify employee data before submission
- Use bulk operations for mass updates
- Regular data audits for accuracy
- Maintain proper documentation trail`,
    summary: 'Complete guide to employee lifecycle management from onboarding to separation',
    tags: 'employee, onboarding, lifecycle, HR',
    version: '2.0',
    author: 'Product Team',
    status: 'published',
    isFeatured: true,
    viewCount: 2103,
    createdAt: '2025-01-10T08:00:00Z',
    updatedAt: '2025-02-12T10:00:00Z',
  },
  {
    id: 'doc-func-2',
    title: 'Payroll Processing Manual',
    slug: 'payroll-processing-manual',
    categoryId: 'cat-functional',
    category: { id: 'cat-functional', name: 'Functional', slug: 'functional', icon: 'FiLayout', color: 'violet' },
    content: `# Payroll Processing Manual

## Payroll Cycle
3Boxes HRMS supports monthly payroll processing with the following workflow:

### Step 1: Pre-Processing
- Verify attendance data for the month
- Confirm leave adjustments
- Review overtime calculations
- Validate salary structure changes

### Step 2: Processing
- Calculate gross salary (Basic + HRA + DA + Allowances)
- Compute statutory deductions (PF, ESI, Tax)
- Apply other deductions (loans, advances)
- Generate net salary

### Step 3: Approval
- HR Admin reviews payroll summary
- Finance team validates amounts
- Super Admin approves for payment

### Step 4: Payment & Reports
- Generate payslips
- Process bank transfers
- Create payroll reports
- Archive payroll data

## Salary Components
| Component | Type | Description |
|-----------|------|-------------|
| Basic Salary | Earning | Base pay (40-50% of CTC) |
| HRA | Earning | House Rent Allowance |
| DA | Earning | Dearness Allowance |
| PF | Deduction | Provident Fund (12%) |
| ESI | Deduction | Employee State Insurance |
| TDS | Deduction | Tax Deducted at Source |`,
    summary: 'Step-by-step payroll processing, salary structures, and compliance',
    tags: 'payroll, salary, deductions, compliance',
    version: '1.6',
    author: 'Payroll Team',
    status: 'published',
    isFeatured: false,
    viewCount: 1567,
    createdAt: '2025-01-18T11:00:00Z',
    updatedAt: '2025-02-09T09:00:00Z',
  },
  {
    id: 'doc-func-3',
    title: 'Recruitment & Hiring Workflow',
    slug: 'recruitment-hiring-workflow',
    categoryId: 'cat-functional',
    category: { id: 'cat-functional', name: 'Functional', slug: 'functional', icon: 'FiLayout', color: 'violet' },
    content: `# Recruitment & Hiring Workflow

## Overview
The Recruitment module streamlines the entire hiring process from requisition to offer letter generation.

## Process Flow

### 1. Manpower Requisition
- Hiring manager creates requisition
- HR Admin reviews and approves
- Job posting created automatically

### 2. Candidate Sourcing
- Applications received via multiple channels
- Resume parsing and candidate database
- AI-powered resume screening

### 3. Interview Process
- Schedule interviews with panel members
- AI-assisted interview scoring
- Multi-round interview tracking
- Real-time feedback collection

### 4. Offer Management
- Generate offer letters with templates
- Track offer acceptance/decline
- Initiate pre-onboarding process

### 5. Onboarding Integration
- Auto-create employee profile
- Generate onboarding checklist
- IT setup requests
- Welcome email automation`,
    summary: 'End-to-end recruitment process from requisition to offer',
    tags: 'recruitment, hiring, interview, offers',
    version: '1.4',
    author: 'Talent Acquisition',
    status: 'published',
    isFeatured: false,
    viewCount: 989,
    createdAt: '2025-01-25T14:00:00Z',
    updatedAt: '2025-02-07T15:00:00Z',
  },

  // Workflow
  {
    id: 'doc-wf-1',
    title: 'Leave Approval Workflow',
    slug: 'leave-approval-workflow',
    categoryId: 'cat-workflow',
    category: { id: 'cat-workflow', name: 'Workflow', slug: 'workflow', icon: 'FiGitBranch', color: 'emerald' },
    content: `# Leave Approval Workflow

## Workflow Steps

### 1. Employee Submits Request
- Select leave type (Casual, Sick, Earned, etc.)
- Specify start and end dates
- Provide reason for leave
- Attach supporting documents (medical certificate, etc.)

### 2. Manager Review
- Notification sent to reporting manager
- Manager can: Approve, Reject, or Request More Info
- Auto-escalation if no action within 24 hours

### 3. HR Approval (for leaves > 3 days)
- HR Admin receives notification
- Verifies leave balance
- Checks team coverage
- Final approval or rejection

### 4. Notification & Calendar Update
- Employee notified of decision
- Team calendar updated
- Leave balance adjusted
- Out-of-office auto-responder configured

## Delegation Rules
- Managers can delegate approval authority during their absence
- Delegation must be configured in advance
- Delegate receives all pending requests automatically`,
    summary: 'Multi-level leave approval process with delegation rules',
    tags: 'leave, approval, workflow, delegation',
    version: '1.3',
    author: 'Workflow Team',
    status: 'published',
    isFeatured: false,
    viewCount: 756,
    createdAt: '2025-01-28T10:00:00Z',
    updatedAt: '2025-02-06T12:00:00Z',
  },
  {
    id: 'doc-wf-2',
    title: 'Expense Claim Process',
    slug: 'expense-claim-process',
    categoryId: 'cat-workflow',
    category: { id: 'cat-workflow', name: 'Workflow', slug: 'workflow', icon: 'FiGitBranch', color: 'emerald' },
    content: `# Expense Claim Process

## Expense Categories
- Travel (flights, trains, local transport)
- Food & Accommodation
- Client Entertainment
- Office Supplies
- Training & Development
- Medical Reimbursement

## Submission Process

### 1. Create Expense Claim
- Select expense category
- Enter amount and date
- Upload receipt (mandatory for claims > $25)
- Add description and project code

### 2. Manager Verification
- Manager reviews expense details
- Validates against company policy
- Checks budget allocation
- Approves or returns for correction

### 3. Finance Approval
- Finance team verifies receipts
- Checks against expense policy limits
- Approves for reimbursement
- Flags policy violations

### 4. Reimbursement
- Added to next payroll cycle
- Or processed as separate payment
- Employee notified of payment date

## Policy Limits
| Category | Monthly Limit | Per-Transaction Limit |
|----------|---------------|---------------------|
| Travel | $2,000 | $500 |
| Food | $500 | $75 |
| Accommodation | $1,500 | $300 |`,
    summary: 'Expense submission, verification, approval, and reimbursement workflow',
    tags: 'expense, claims, reimbursement, approval',
    version: '1.2',
    author: 'Finance Team',
    status: 'published',
    isFeatured: false,
    viewCount: 543,
    createdAt: '2025-02-01T09:00:00Z',
    updatedAt: '2025-02-11T13:00:00Z',
  },
  {
    id: 'doc-wf-3',
    title: 'Performance Review Cycle',
    slug: 'performance-review-cycle',
    categoryId: 'cat-workflow',
    category: { id: 'cat-workflow', name: 'Workflow', slug: 'workflow', icon: 'FiGitBranch', color: 'emerald' },
    content: `# Performance Review Cycle

## Annual Review Process

### Phase 1: Goal Setting (January)
- Employee sets SMART goals
- Manager reviews and aligns with team objectives
- Goals locked after mutual agreement

### Phase 2: Mid-Year Review (July)
- Progress assessment against goals
- 360-degree feedback collection
- Development plan discussion
- Goal adjustment if needed

### Phase 3: Year-End Review (December)
- Self-assessment submission
- Manager evaluation
- 360-degree feedback analysis
- Calibration sessions

### Phase 4: Rating & Development Plan
- Final rating assignment
- Performance improvement plan (if needed)
- Career development discussion
- Compensation review

## 360-Degree Feedback
Feedback is collected from:
- Direct Manager (weighted 40%)
- Peers (weighted 20%)
- Direct Reports (weighted 20%)
- Self Assessment (weighted 20%)

## Rating Scale
| Rating | Description | Range |
|--------|-------------|-------|
| 5 | Exceptional | 4.5-5.0 |
| 4 | Exceeds Expectations | 3.5-4.4 |
| 3 | Meets Expectations | 2.5-3.4 |
| 2 | Needs Improvement | 1.5-2.4 |
| 1 | Unsatisfactory | 1.0-1.4 |`,
    summary: 'Annual and mid-year review cycle with 360-degree feedback',
    tags: 'performance, review, 360-feedback, goals',
    version: '1.1',
    author: 'HR Operations',
    status: 'published',
    isFeatured: false,
    viewCount: 678,
    createdAt: '2025-02-03T11:00:00Z',
    updatedAt: '2025-02-10T10:00:00Z',
  },

  // Security
  {
    id: 'doc-sec-1',
    title: 'Data Protection Policy',
    slug: 'data-protection-policy',
    categoryId: 'cat-security',
    category: { id: 'cat-security', name: 'Security', slug: 'security', icon: 'FiShield', color: 'amber' },
    content: `# Data Protection Policy

## GDPR Compliance
3Boxes HRMS is fully compliant with GDPR and other major data protection regulations.

## Data Encryption

### At Rest
- AES-256 encryption for all sensitive fields
- Database-level encryption on Neon PostgreSQL
- Encrypted file storage for documents

### In Transit
- TLS 1.3 for all API communications
- Certificate pinning for mobile applications
- Secure WebSocket connections for real-time features

## Privacy Controls

### Data Access
- Role-based access control (RBAC)
- Audit logging for all data access
- Data masking for sensitive fields
- Session timeout enforcement

### Data Retention
- Employee data: Duration of employment + 7 years
- Application data: 2 years post-rejection
- Audit logs: 10 years
- Payroll records: 7 years

### Data Subject Rights
- Right to access personal data
- Right to rectification
- Right to erasure (subject to legal obligations)
- Right to data portability
- Right to restrict processing

## Breach Response
- Automated breach detection
- 72-hour notification to authorities
- Affected user notification within 48 hours
- Post-incident review and remediation`,
    summary: 'GDPR compliance, data encryption, and privacy controls',
    tags: 'GDPR, encryption, privacy, data protection',
    version: '2.0',
    author: 'Security Team',
    status: 'published',
    isFeatured: true,
    viewCount: 1102,
    createdAt: '2025-01-12T09:00:00Z',
    updatedAt: '2025-02-14T08:00:00Z',
  },
  {
    id: 'doc-sec-2',
    title: 'Access Control Matrix',
    slug: 'access-control-matrix',
    categoryId: 'cat-security',
    category: { id: 'cat-security', name: 'Security', slug: 'security', icon: 'FiShield', color: 'amber' },
    content: `# Access Control Matrix

## Role Definitions

### Super Admin
- Full system access across all tenants
- User management and role assignment
- System configuration and settings
- Database and infrastructure management
- Audit log access

### Tenant Admin
- Full access within their tenant
- Company and branch management
- User management within tenant
- Subscription and billing management
- Report generation

### HR Admin
- Employee management
- Payroll processing
- Leave management
- Recruitment operations
- Performance reviews

### Manager
- Team member viewing
- Leave approval for direct reports
- Performance review submission
- Expense approval
- Timesheet approval

### Employee
- Self-service profile management
- Leave request submission
- Expense claim submission
- Payslip viewing
- Training enrollment

## Permission Matrix
| Feature | Super Admin | Tenant Admin | HR Admin | Manager | Employee |
|---------|-------------|-------------|----------|---------|----------|
| User Management | ✅ | ✅ | ❌ | ❌ | ❌ |
| Employee CRUD | ✅ | ✅ | ✅ | 👁️ | 👁️ Self |
| Payroll Process | ✅ | ✅ | ✅ | ❌ | 👁️ Self |
| Leave Approve | ✅ | ✅ | ✅ | ✅ Team | ❌ |
| Reports | ✅ | ✅ | ✅ | ✅ Team | ❌ |`,
    summary: 'Role-based access control definitions and permission matrices',
    tags: 'RBAC, access control, permissions, roles',
    version: '1.7',
    author: 'Security Team',
    status: 'published',
    isFeatured: false,
    viewCount: 845,
    createdAt: '2025-01-14T10:00:00Z',
    updatedAt: '2025-02-08T14:00:00Z',
  },
  {
    id: 'doc-sec-3',
    title: 'Incident Response Plan',
    slug: 'incident-response-plan',
    categoryId: 'cat-security',
    category: { id: 'cat-security', name: 'Security', slug: 'security', icon: 'FiShield', color: 'amber' },
    content: `# Incident Response Plan

## Incident Classification

### Severity Levels
| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 - Critical | Data breach, system compromise | 15 minutes |
| P2 - High | Vulnerability exploitation attempt | 1 hour |
| P3 - Medium | Suspicious activity, policy violation | 4 hours |
| P4 - Low | Minor security event | 24 hours |

## Response Process

### 1. Detection & Identification
- Automated monitoring alerts
- User reports
- Third-party notifications
- Log analysis

### 2. Containment
- Isolate affected systems
- Block malicious IPs
- Disable compromised accounts
- Preserve evidence

### 3. Eradication
- Remove malicious code
- Patch vulnerabilities
- Reset compromised credentials
- Update security rules

### 4. Recovery
- Restore from clean backups
- Verify system integrity
- Gradual service restoration
- Enhanced monitoring

### 5. Post-Incident
- Root cause analysis
- Lessons learned documentation
- Security improvements
- Stakeholder communication`,
    summary: 'Security incident classification, escalation, and resolution procedures',
    tags: 'incident, response, security, breach',
    version: '1.3',
    author: 'Security Team',
    status: 'published',
    isFeatured: false,
    viewCount: 432,
    createdAt: '2025-01-30T15:00:00Z',
    updatedAt: '2025-02-09T11:00:00Z',
  },

  // AI
  {
    id: 'doc-ai-1',
    title: 'AI Interview System',
    slug: 'ai-interview-system',
    categoryId: 'cat-ai',
    category: { id: 'cat-ai', name: 'AI', slug: 'ai', icon: 'FiCpu', color: 'purple' },
    content: `# AI Interview System

## Overview
The AI Interview System leverages machine learning to enhance the recruitment process with automated scoring, question generation, and candidate evaluation.

## Features

### AI-Powered Scoring
- Analyzes interview responses in real-time
- Scores based on technical accuracy, communication skills, and problem-solving ability
- Provides objective metrics alongside human evaluation
- Reduces hiring bias through standardized assessment

### Smart Question Generation
- Generates role-specific interview questions
- Adapts difficulty based on candidate responses
- Covers technical, behavioral, and situational categories
- Ensures comprehensive skill assessment

### Candidate Evaluation
- Multi-dimensional scoring (Technical, Communication, Culture Fit)
- Comparative analysis against job requirements
- Automated interview summary generation
- Recommendation engine for hiring decisions

## Configuration

### Setting Up AI Interviews
1. Navigate to Recruitment > Job Postings
2. Enable "AI Interview" for the position
3. Configure scoring weights for each dimension
4. Set minimum threshold scores
5. Define auto-advance criteria

### Scoring Dimensions
| Dimension | Weight | Description |
|-----------|--------|-------------|
| Technical Skills | 40% | Domain knowledge accuracy |
| Communication | 25% | Clarity and articulation |
| Problem Solving | 20% | Analytical thinking |
| Culture Fit | 15% | Values alignment |

## Best Practices
- Use AI scores as supplementary data, not sole decision criteria
- Regularly calibrate scoring models with feedback
- Maintain human oversight in final hiring decisions`,
    summary: 'AI-powered interview scoring, question generation, and candidate evaluation',
    tags: 'AI, interview, scoring, recruitment, ML',
    version: '1.2',
    author: 'AI Team',
    status: 'published',
    isFeatured: true,
    viewCount: 934,
    createdAt: '2025-02-02T10:00:00Z',
    updatedAt: '2025-02-13T12:00:00Z',
  },
  {
    id: 'doc-ai-2',
    title: 'AI Chatbot Configuration',
    slug: 'ai-chatbot-configuration',
    categoryId: 'cat-ai',
    category: { id: 'cat-ai', name: 'AI', slug: 'ai', icon: 'FiCpu', color: 'purple' },
    content: `# AI Chatbot Configuration

## Getting Started
The 3Boxes AI Chatbot serves as an intelligent HR assistant that can answer employee queries, guide through processes, and automate routine tasks.

## Setup Guide

### 1. Enable Chatbot
- Navigate to Settings > AI Features
- Toggle "AI Chatbot" to enabled
- Select your preferred language model

### 2. Customize Behavior
- Define the chatbot's personality and tone
- Set up FAQ responses for common queries
- Configure escalation rules to human agents
- Set operating hours and response timeouts

### 3. Knowledge Base
- Upload company policies and procedures
- Index employee handbook
- Add department-specific information
- Set up auto-refresh for policy updates

### 4. Integration Points
- Employee self-service portal
- Leave management queries
- Payroll and payslip requests
- IT helpdesk routing

## Supported Queries
- "How many leave days do I have?"
- "What is the leave policy for sick days?"
- "When is my next payroll date?"
- "How do I submit an expense claim?"
- "What are the company holidays this month?"

## Monitoring & Analytics
- Query volume and response time metrics
- User satisfaction scores
- Escalation rate tracking
- Popular topics analysis`,
    summary: 'Setting up and customizing the HR AI assistant for your organization',
    tags: 'AI, chatbot, configuration, HR assistant',
    version: '1.1',
    author: 'AI Team',
    status: 'published',
    isFeatured: false,
    viewCount: 567,
    createdAt: '2025-02-05T09:00:00Z',
    updatedAt: '2025-02-12T16:00:00Z',
  },
  {
    id: 'doc-ai-3',
    title: 'Predictive Analytics Guide',
    slug: 'predictive-analytics-guide',
    categoryId: 'cat-ai',
    category: { id: 'cat-ai', name: 'AI', slug: 'ai', icon: 'FiCpu', color: 'purple' },
    content: `# Predictive Analytics Guide

## Overview
3Boxes Predictive Analytics uses machine learning models to provide actionable insights for workforce planning, attrition prediction, and performance forecasting.

## Available Models

### Attrition Prediction
- Identifies employees at risk of leaving
- Analyzes patterns: tenure, satisfaction, compensation, growth
- Risk scores updated weekly
- Recommended retention actions

### Performance Forecasting
- Predicts review cycle outcomes
- Based on goal progress, skill development, and feedback
- Helps managers proactively support underperformers
- Identifies high-potential employees for development

### Workforce Planning
- Demand forecasting based on growth trends
- Skill gap analysis across departments
- Succession planning recommendations
- Training need identification

## Using Predictive Insights

### Dashboard
- Access via Reports > Predictive Analytics
- Filter by department, location, or time period
- Export insights as PDF or Excel

### Risk Indicators
| Indicator | Threshold | Action |
|-----------|-----------|--------|
| Attrition Risk | > 70% | Schedule retention meeting |
| Performance Risk | > 60% | Create development plan |
| Skill Gap | > 40% | Enroll in training |

## Data Requirements
- Minimum 6 months of historical data for accurate predictions
- Regular data updates improve model accuracy
- Employee feedback integration enhances predictions`,
    summary: 'Using AI for attrition prediction, performance forecasting, and workforce planning',
    tags: 'AI, analytics, prediction, attrition, workforce',
    version: '1.0',
    author: 'AI Team',
    status: 'published',
    isFeatured: false,
    viewCount: 389,
    createdAt: '2025-02-07T14:00:00Z',
    updatedAt: '2025-02-13T09:00:00Z',
  },

  // SOP
  {
    id: 'doc-sop-1',
    title: 'Employee Onboarding SOP',
    slug: 'employee-onboarding-sop',
    categoryId: 'cat-sop',
    category: { id: 'cat-sop', name: 'SOP', slug: 'sop', icon: 'FiFileText', color: 'rose' },
    content: `# Employee Onboarding SOP

## Purpose
This Standard Operating Procedure defines the step-by-step process for onboarding new employees into the organization using 3Boxes HRMS.

## Scope
Applies to all new hires, rehires, and transfers across all departments and branches.

## Procedure

### Day -5 to Day -1: Pre-Boarding
- [ ] Send welcome email with first-day instructions
- [ ] Create employee profile in 3Boxes HRMS
- [ ] Assign employee ID and generate credentials
- [ ] Set up email and communication accounts
- [ ] Prepare workspace and equipment
- [ ] Assign onboarding buddy
- [ ] Schedule orientation sessions

### Day 1: Welcome & Orientation
- [ ] Office tour and introductions
- [ ] IT setup verification (laptop, email, access)
- [ ] HR documentation (ID proofs, bank details, tax forms)
- [ ] Company culture and values presentation
- [ ] Safety and emergency procedures briefing
- [ ] 3Boxes HRMS portal walkthrough

### Day 2-5: Department Integration
- [ ] Team introductions and role overview
- [ ] Department-specific training
- [ ] Process and tool orientation
- [ ] Assign initial tasks/projects
- [ ] Set up 1-on-1 with manager

### Day 30: First Month Review
- [ ] Manager check-in meeting
- [ ] Onboarding task completion verification
- [ ] Feedback collection
- [ ] Probation goals setting

### Day 90: Probation Review
- [ ] Performance assessment
- [ ] Culture fit evaluation
- [ ] Probation confirmation/extension decision

## Checklist Template
Available in 3Boxes HRMS under Onboarding > Templates

## Responsible Parties
| Task | Owner |
|------|-------|
| Employee creation | HR Admin |
| IT setup | IT Department |
| Workspace prep | Facilities |
| Orientation | HR Team |
| Department training | Line Manager |`,
    summary: 'Standard operating procedure for new employee onboarding process',
    tags: 'SOP, onboarding, checklist, new hire',
    version: '2.1',
    author: 'HR Operations',
    status: 'published',
    isFeatured: false,
    viewCount: 1456,
    createdAt: '2025-01-08T09:00:00Z',
    updatedAt: '2025-02-11T14:00:00Z',
  },
  {
    id: 'doc-sop-2',
    title: 'Payroll Processing SOP',
    slug: 'payroll-processing-sop',
    categoryId: 'cat-sop',
    category: { id: 'cat-sop', name: 'SOP', slug: 'sop', icon: 'FiFileText', color: 'rose' },
    content: `# Payroll Processing SOP

## Purpose
Define the standard monthly payroll processing procedure to ensure accurate and timely salary disbursement.

## Payroll Calendar
| Activity | Due Date |
|----------|----------|
| Attendance freeze | 25th of month |
| Leave adjustments | 26th of month |
| Salary structure changes | 26th of month |
| Payroll processing | 27th of month |
| HR review | 28th of month |
| Finance approval | 1st of next month |
| Bank transfer | 2nd of next month |
| Payslip distribution | 3rd of next month |

## Step-by-Step Process

### Step 1: Data Validation
1. Verify all attendance records are complete
2. Confirm leave adjustments are applied
3. Review overtime calculations
4. Check for pending salary structure changes
5. Validate new joiner/leaver data

### Step 2: Run Payroll
1. Navigate to Payroll > Process Payroll
2. Select the month and year
3. Click "Generate Payroll"
4. Review the payroll summary report
5. Check for errors or discrepancies

### Step 3: Review & Approval
1. HR Admin reviews payroll register
2. Verify statutory deductions
3. Check net salary calculations
4. Submit for Finance approval
5. Super Admin final approval

### Step 4: Disbursement
1. Generate bank transfer file
2. Submit to bank for processing
3. Update payment status in system
4. Generate and distribute payslips

## Exception Handling
- Late attendance data: Process manually with adjustments
- Mid-month joiners: Pro-rata calculation
- Mid-month leavers: Final settlement via FNF module`,
    summary: 'Monthly payroll processing checklist and standard operating procedure',
    tags: 'SOP, payroll, processing, checklist',
    version: '1.8',
    author: 'Payroll Operations',
    status: 'published',
    isFeatured: false,
    viewCount: 1123,
    createdAt: '2025-01-16T10:00:00Z',
    updatedAt: '2025-02-10T11:00:00Z',
  },
  {
    id: 'doc-sop-3',
    title: 'Exit Management SOP',
    slug: 'exit-management-sop',
    categoryId: 'cat-sop',
    category: { id: 'cat-sop', name: 'SOP', slug: 'sop', icon: 'FiFileText', color: 'rose' },
    content: `# Exit Management SOP

## Purpose
Standard procedure for managing employee separations including resignation, termination, and retirement.

## Process Flow

### 1. Resignation Initiation
- Employee submits resignation letter
- HR acknowledges receipt within 24 hours
- Manager notified for retention assessment
- If retention not viable, initiate exit process

### 2. Notice Period Management
- Standard notice period: 30 days
- Waiver requests require HR Admin approval
- Knowledge transfer plan created
- Work handover schedule prepared

### 3. Clearance Process
- [ ] IT assets returned (laptop, phone, access cards)
- [ ] Pending deliverables completed or documented
- [ ] Knowledge transfer sessions conducted
- [ ] Access credentials deactivated
- [ ] Email forwarding configured
- [ ] Files and documents handed over

### 4. Exit Interview
- Scheduled in last week of employment
- Conducted by HR (not direct manager)
- Feedback collected on work experience
- Improvement suggestions documented
- Data used for organizational development

### 5. Full & Final Settlement
- Calculate pending salary
- Process leave encashment
- Deduct outstanding loans/advances
- Compute gratuity (if applicable)
- Generate FNF statement
- Process payment within 30 days

### 6. Post-Separation
- Archive employee records
- Update org chart
- Reassign team members
- Conduct exit survey analysis
- Deactivate all system access`,
    summary: 'Employee separation, clearance, and FNF settlement procedure',
    tags: 'SOP, exit, separation, FNF, clearance',
    version: '1.5',
    author: 'HR Operations',
    status: 'published',
    isFeatured: false,
    viewCount: 876,
    createdAt: '2025-01-20T13:00:00Z',
    updatedAt: '2025-02-06T15:00:00Z',
  },

  // Training Videos
  {
    id: 'doc-vid-1',
    title: 'Getting Started with 3Boxes HRMS',
    slug: 'getting-started-3boxes-hrms',
    categoryId: 'cat-training',
    category: { id: 'cat-training', name: 'Training Videos', slug: 'training-videos', icon: 'FiVideo', color: 'cyan' },
    content: `# Getting Started with 3Boxes HRMS

## Video Overview
A comprehensive walkthrough of the 3Boxes HRMS platform covering initial setup, configuration, and first steps for new administrators.

## Video Chapters

### Chapter 1: Platform Overview (0:00 - 5:30)
- Navigating the dashboard
- Understanding the sidebar menu
- Quick stats and analytics widgets
- Notification center

### Chapter 2: Initial Setup (5:30 - 15:00)
- Company profile configuration
- Branch and department setup
- Designation and salary structure creation
- Leave policy configuration

### Chapter 3: User Management (15:00 - 25:00)
- Creating admin users
- Role assignment and permissions
- Inviting team members
- SSO configuration

### Chapter 4: Employee Onboarding (25:00 - 35:00)
- Adding your first employee
- Document upload
- Onboarding checklist
- IT setup integration

### Chapter 5: First Payroll Run (35:00 - 45:00)
- Salary structure assignment
- Attendance verification
- Processing payroll
- Generating payslips

## Quick Start Checklist
1. Complete company profile
2. Set up organization structure
3. Configure leave policies
4. Create salary structures
5. Add employees
6. Process first payroll

## Duration
Total: 45 minutes

## Target Audience
- HR Administrators
- Tenant Administrators
- New Super Admins`,
    summary: 'Platform overview and initial setup walkthrough video tutorial',
    tags: 'training, video, getting started, setup',
    version: '1.0',
    author: 'Training Team',
    status: 'published',
    isFeatured: true,
    viewCount: 2340,
    createdAt: '2025-01-05T08:00:00Z',
    updatedAt: '2025-02-01T10:00:00Z',
    videoUrl: '#training-video-getting-started',
  },
  {
    id: 'doc-vid-2',
    title: 'Attendance & Leave Management',
    slug: 'attendance-leave-management',
    categoryId: 'cat-training',
    category: { id: 'cat-training', name: 'Training Videos', slug: 'training-videos', icon: 'FiVideo', color: 'cyan' },
    content: `# Attendance & Leave Management

## Video Overview
Learn how to use the attendance tracking and leave management features in 3Boxes HRMS, including shift management, overtime, and leave approval workflows.

## Video Chapters

### Chapter 1: Daily Attendance (0:00 - 8:00)
- Check-in/check-out process
- Attendance dashboard
- Late arrival tracking
- Half-day and overtime rules

### Chapter 2: Shift Management (8:00 - 16:00)
- Creating shift schedules
- Assigning employees to shifts
- Break duration configuration
- Grace time settings

### Chapter 3: Leave Types & Policies (16:00 - 24:00)
- Configuring leave types
- Setting carry-forward rules
- Leave balance calculations
- Holiday calendar setup

### Chapter 4: Leave Requests & Approvals (24:00 - 32:00)
- Submitting a leave request
- Manager approval workflow
- Multi-level approval setup
- Leave cancellation process

### Chapter 5: Reports & Analytics (32:00 - 40:00)
- Attendance reports
- Leave utilization reports
- Absenteeism analysis
- Export and scheduling

## Duration
Total: 40 minutes

## Prerequisites
- Getting Started with 3Boxes HRMS (recommended)`,
    summary: 'How to mark attendance, apply for leaves, and manage shifts',
    tags: 'training, video, attendance, leave, shifts',
    version: '1.0',
    author: 'Training Team',
    status: 'published',
    isFeatured: false,
    viewCount: 1678,
    createdAt: '2025-01-10T14:00:00Z',
    updatedAt: '2025-02-03T09:00:00Z',
    videoUrl: '#training-video-attendance',
  },
  {
    id: 'doc-vid-3',
    title: 'Payroll Setup & Processing',
    slug: 'payroll-setup-processing',
    categoryId: 'cat-training',
    category: { id: 'cat-training', name: 'Training Videos', slug: 'training-videos', icon: 'FiVideo', color: 'cyan' },
    content: `# Payroll Setup & Processing

## Video Overview
Complete walkthrough of payroll configuration and processing in 3Boxes HRMS, from salary structure setup to payslip generation.

## Video Chapters

### Chapter 1: Salary Structure Setup (0:00 - 12:00)
- Creating salary components
- Defining earnings (Basic, HRA, DA, Allowances)
- Configuring deductions (PF, ESI, TDS)
- Setting up company-wide structures

### Chapter 2: Employee Salary Assignment (12:00 - 20:00)
- Assigning structures to employees
- Custom individual components
- Salary revision processing
- Effective date management

### Chapter 3: Monthly Payroll Processing (20:00 - 32:00)
- Pre-processing checklist
- Running payroll calculation
- Reviewing payroll register
- Handling exceptions

### Chapter 4: Statutory Compliance (32:00 - 42:00)
- PF return filing
- ESI compliance
- TDS computation
- Professional tax setup

### Chapter 5: Payslips & Reports (42:00 - 50:00)
- Generating payslips
- Bank advice creation
- Payroll analytics
- Year-end processing

## Duration
Total: 50 minutes

## Prerequisites
- Getting Started with 3Boxes HRMS
- Salary structure configuration completed`,
    summary: 'Complete payroll configuration and processing walkthrough',
    tags: 'training, video, payroll, salary, compliance',
    version: '1.0',
    author: 'Training Team',
    status: 'published',
    isFeatured: false,
    viewCount: 1234,
    createdAt: '2025-01-15T11:00:00Z',
    updatedAt: '2025-02-05T10:00:00Z',
    videoUrl: '#training-video-payroll',
  },
];

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    published: 'thb-badge thb-badge-success',
    draft: 'thb-badge thb-badge-warning',
    archived: 'bg-slate-100 text-slate-600 thb-badge',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function renderMarkdown(content: string): string {
  let html = content
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold text-thb-text-primary mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-lg font-semibold text-thb-text-primary mt-5 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold text-thb-text-primary mt-6 mb-3">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-semibold text-thb-text-primary">$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/gim, '<code class="px-1.5 py-0.5 bg-slate-100 text-sm rounded font-mono text-thb-text-primary">$1</code>')
    // Checkboxes
    .replace(/^- \[ \] (.*$)/gim, '<div class="flex items-center gap-2 py-0.5"><input type="checkbox" disabled class="w-4 h-4 rounded border-thb-border" /><span class="text-sm text-thb-text-secondary">$1</span></div>')
    .replace(/^- \[x\] (.*$)/gim, '<div class="flex items-center gap-2 py-0.5"><input type="checkbox" checked disabled class="w-4 h-4 rounded border-thb-border" /><span class="text-sm text-thb-text-secondary line-through">$1</span></div>')
    // List items
    .replace(/^- (.*$)/gim, '<li class="text-sm text-thb-text-secondary ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li class="text-sm text-thb-text-secondary ml-4 list-decimal">$1</li>')
    // Code blocks
    .replace(/```([\s\S]*?)```/gim, '<pre class="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-3"><code>$1</code></pre>')
    // Tables - simple handling
    .replace(/\|(.+)\|/gim, (match) => {
      const cells = match.split('|').filter(c => c.trim() && c.trim() !== '---' && !c.match(/^[-\s]+$/));
      if (cells.length === 0) return '';
      return '<tr>' + cells.map(c => `<td class="px-3 py-2 text-sm text-thb-text-secondary border-b border-thb-border">${c.trim()}</td>`).join('') + '</tr>';
    })
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p class="text-sm text-thb-text-secondary leading-relaxed my-2">')
    // Single newlines
    .replace(/\n/g, '<br/>');

  return `<div class="prose-sm"><p class="text-sm text-thb-text-secondary leading-relaxed">${html}</p></div>`;
}

const initialForm = {
  title: '',
  categoryId: '',
  content: '',
  summary: '',
  tags: '',
  version: '1.0',
  author: '',
  status: 'published',
  isFeatured: false,
};

const ROLES = ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'];

/* ── Component ── */
export default function DocumentationHubPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');
  const isSuperAdmin = user?.role === 'super_admin';

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [documents] = useState<DocDocument[]>(SAMPLE_DOCUMENTS);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionsDocId, setPermissionsDocId] = useState<string | null>(null);
  const [permForm, setPermForm] = useState({ targetType: 'role', targetId: '', canView: true, canEdit: false, canShare: false });
  const [localPermissions, setLocalPermissions] = useState<DocPermission[]>([]);

  /* Filtered documents */
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (activeCategory && doc.categoryId !== activeCategory) return false;
      if (search) {
        const s = search.toLowerCase();
        return doc.title.toLowerCase().includes(s) ||
          doc.summary?.toLowerCase().includes(s) ||
          doc.tags?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [documents, activeCategory, search]);

  /* View document */
  const viewingDocument = viewingId ? documents.find(d => d.id === viewingId) : null;

  /* Category stats */
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    CATEGORIES.forEach(cat => {
      stats[cat.id] = documents.filter(d => d.categoryId === cat.id && d.status === 'published').length;
    });
    return stats;
  }, [documents]);

  /* Featured documents */
  const featuredDocs = useMemo(() => documents.filter(d => d.isFeatured && d.status === 'published'), [documents]);

  /* Form handlers */
  const handleAddNew = () => {
    setForm({ ...initialForm, categoryId: activeCategory || '' });
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (doc: DocDocument) => {
    setForm({
      title: doc.title,
      categoryId: doc.categoryId,
      content: doc.content,
      summary: doc.summary || '',
      tags: doc.tags || '',
      version: doc.version,
      author: doc.author || '',
      status: doc.status,
      isFeatured: doc.isFeatured,
    });
    setEditingId(doc.id);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.categoryId || !form.content) {
      toast.error('Please fill in all required fields (Title, Category, Content)');
      return;
    }
    try {
      setSubmitting(true);
      const body = {
        title: form.title,
        categoryId: form.categoryId,
        content: form.content,
        summary: form.summary || null,
        tags: form.tags || null,
        version: form.version,
        author: form.author || null,
        status: form.status,
        isFeatured: form.isFeatured,
      };

      if (editingId) {
        const res = await fetch(`/api/documentation-hub/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update'); }
        toast.success('Document updated successfully');
      } else {
        const res = await fetch('/api/documentation-hub', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to create'); }
        toast.success('Document created successfully');
      }

      handleCancelForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/documentation-hub/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete'); }
      toast.success('Document deleted successfully');
      if (viewingId === id) setViewingId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const handleManagePermissions = (docId: string) => {
    setPermissionsDocId(docId);
    setShowPermissions(true);
    const doc = documents.find(d => d.id === docId);
    setLocalPermissions(doc?.permissions || []);
    setTimeout(() => document.getElementById('permissions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleAddPermission = async () => {
    if (!permForm.targetId) {
      toast.error('Please select a role or enter a user ID');
      return;
    }
    try {
      const res = await fetch('/api/documentation-hub/permissions', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          documentId: permissionsDocId,
          targetType: permForm.targetType,
          targetId: permForm.targetId,
          canView: permForm.canView,
          canEdit: permForm.canEdit,
          canShare: permForm.canShare,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add permission'); }
      const data = await res.json();
      setLocalPermissions(prev => [...prev, data.permission]);
      toast.success('Permission added successfully');
      setPermForm({ targetType: 'role', targetId: '', canView: true, canEdit: false, canShare: false });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add permission');
    }
  };

  const handleRemovePermission = async (permId: string) => {
    try {
      const res = await fetch(`/api/documentation-hub/permissions?id=${permId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to remove permission'); }
      setLocalPermissions(prev => prev.filter(p => p.id !== permId));
      toast.success('Permission removed');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove permission');
    }
  };

  const totalDocs = documents.filter(d => d.status === 'published').length;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="thb-card overflow-hidden">
        <div className="relative px-6 py-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <FiBookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Documentation Hub</h1>
                <p className="text-sm text-slate-400">Your organization&apos;s knowledge base</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search documents, guides, SOPs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/10 border border-white/10 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 backdrop-blur-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <FiFileText className="w-4 h-4" />
                <span><span className="text-white font-semibold">{totalDocs}</span> documents</span>
                <span className="text-slate-600">|</span>
                <span><span className="text-white font-semibold">{CATEGORIES.length}</span> categories</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-6 py-3 bg-white border-t border-thb-border overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <button
              onClick={() => setActiveCategory(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                !activeCategory
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FiBookOpen className="w-3.5 h-3.5" />
              All
            </button>
            {CATEGORIES.map(cat => {
              const colors = colorMap[cat.color];
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(isActive ? null : cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? `${colors.bg} text-white shadow-sm`
                      : `${colors.light} ${colors.text} hover:opacity-80`
                  }`}
                >
                  {iconMap[cat.icon]}
                  {cat.name}
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : `${colors.light} ${colors.text}`
                  }`}>
                    {categoryStats[cat.id] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {CATEGORIES.map(cat => {
          const colors = colorMap[cat.color];
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(isActive ? null : cat.id)}
              className={`thb-card p-4 text-left transition-all hover:shadow-md ${
                isActive ? `ring-2 ${colors.border} shadow-md` : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-lg ${colors.light} flex items-center justify-center mb-3 ${colors.icon}`}>
                {iconMap[cat.icon]}
              </div>
              <h3 className="text-sm font-semibold text-thb-text-primary">{cat.name}</h3>
              <p className="text-xs text-thb-text-muted mt-0.5">{categoryStats[cat.id] || 0} docs</p>
            </button>
          );
        })}
      </div>

      {/* Featured Documents */}
      {!activeCategory && !search && featuredDocs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2 mb-3">
            <FiStar className="w-5 h-5 text-amber-500" />
            Featured Documents
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredDocs.map(doc => {
              const colors = colorMap[doc.category?.color || 'blue'];
              return (
                <div key={doc.id} className="thb-card p-4 hover:shadow-md transition-all border-l-4 cursor-pointer" style={{ borderLeftColor: `var(--tw-color-${doc.category?.color || 'blue'})` }}>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mb-2 ${colors.light} ${colors.text}`}>
                    {iconMap[doc.category?.icon || 'FiBookOpen']}
                    {doc.category?.name}
                  </div>
                  <h3 className="text-sm font-semibold text-thb-text-primary mb-1 line-clamp-2">{doc.title}</h3>
                  <p className="text-xs text-thb-text-muted line-clamp-2">{doc.summary}</p>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-thb-text-muted">
                    <span className="flex items-center gap-1"><FiEye className="w-3 h-3" />{doc.viewCount}</span>
                    <span className="flex items-center gap-1"><FiUser className="w-3 h-3" />{doc.author}</span>
                    <span className="flex items-center gap-1"><FiClock className="w-3 h-3" />{formatDate(doc.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewingId(doc.id); setShowForm(false); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors"
                    >
                      <FiEye className="w-3 h-3" /> Read
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
          {activeCategory
            ? <>{CATEGORIES.find(c => c.id === activeCategory)?.name} Documents</>
            : <>All Documents</>
          }
          <span className="text-sm font-normal text-thb-text-muted">({filteredDocuments.length})</span>
        </h2>
        {isAdmin && (
          <button
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"
          >
            <FiPlus className="w-4 h-4" />
            Add Document
          </button>
        )}
      </div>

      {/* View-Only Panel */}
      {viewingId && viewingDocument && (
        <div id="view-panel" className="thb-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${colorMap[viewingDocument.category?.color || 'blue'].light} flex items-center justify-center ${colorMap[viewingDocument.category?.color || 'blue'].icon}`}>
                  {iconMap[viewingDocument.category?.icon || 'FiBookOpen']}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-thb-text-primary">{viewingDocument.title}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`thb-badge ${colorMap[viewingDocument.category?.color || 'blue'].light} ${colorMap[viewingDocument.category?.color || 'blue'].text}`}>
                      {viewingDocument.category?.name}
                    </span>
                    <span className={getStatusBadge(viewingDocument.status)}>
                      {viewingDocument.status.charAt(0).toUpperCase() + viewingDocument.status.slice(1)}
                    </span>
                    {viewingDocument.isFeatured && (
                      <span className="inline-flex items-center gap-1 thb-badge bg-amber-50 text-amber-700">
                        <FiStar className="w-3 h-3" /> Featured
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewingDocument.videoUrl && (
                  <a href={viewingDocument.videoUrl} className="px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-medium hover:bg-cyan-100 transition-colors flex items-center gap-1">
                    <FiVideo className="w-3.5 h-3.5" /> Watch Video
                  </a>
                )}
                {viewingDocument.fileUrl && (
                  <a href={viewingDocument.fileUrl} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1">
                    <FiExternalLink className="w-3.5 h-3.5" /> Attachment
                  </a>
                )}
                {isAdmin && (
                  <>
                    <button onClick={() => handleEdit(viewingDocument)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1">
                      <FiEdit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => handleManagePermissions(viewingDocument.id)} className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 transition-colors flex items-center gap-1">
                        <FiLock className="w-3.5 h-3.5" /> Permissions
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Meta bar */}
            <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-slate-50 rounded-lg mb-4 text-xs text-thb-text-muted">
              <span className="flex items-center gap-1"><FiUser className="w-3.5 h-3.5" /> {viewingDocument.author || 'Unknown'}</span>
              <span className="flex items-center gap-1"><FiClock className="w-3.5 h-3.5" /> Updated {formatDate(viewingDocument.updatedAt)}</span>
              <span className="flex items-center gap-1"><FiEye className="w-3.5 h-3.5" /> {viewingDocument.viewCount} views</span>
              <span>v{viewingDocument.version}</span>
              {viewingDocument.tags && (
                <span className="flex items-center gap-1"><FiTag className="w-3.5 h-3.5" /> {viewingDocument.tags}</span>
              )}
            </div>

            {/* Rendered Content */}
            <div
              className="doc-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingDocument.content) }}
            />
          </div>
        </div>
      )}

      {/* Permissions Panel (Super Admin only) */}
      {showPermissions && isSuperAdmin && permissionsDocId && (
        <div id="permissions-panel" className="thb-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <HiShieldCheck className="w-5 h-5 text-violet-500" />
                Document Permissions
              </h2>
              <button onClick={() => { setShowPermissions(false); setPermissionsDocId(null); }} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Add Permission Form */}
            <div className="flex flex-wrap items-end gap-3 mb-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Target Type</label>
                <select
                  value={permForm.targetType}
                  onChange={e => setPermForm(p => ({ ...p, targetType: e.target.value, targetId: '' }))}
                  className="px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="role">Role</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                  {permForm.targetType === 'role' ? 'Select Role' : 'User ID'}
                </label>
                {permForm.targetType === 'role' ? (
                  <select
                    value={permForm.targetId}
                    onChange={e => setPermForm(p => ({ ...p, targetId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    <option value="">Select Role</option>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={permForm.targetId}
                    onChange={e => setPermForm(p => ({ ...p, targetId: e.target.value }))}
                    placeholder="Enter user ID"
                    className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={permForm.canView} onChange={e => setPermForm(p => ({ ...p, canView: e.target.checked }))} className="w-4 h-4 rounded border-thb-border" />
                  View
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={permForm.canEdit} onChange={e => setPermForm(p => ({ ...p, canEdit: e.target.checked }))} className="w-4 h-4 rounded border-thb-border" />
                  Edit
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={permForm.canShare} onChange={e => setPermForm(p => ({ ...p, canShare: e.target.checked }))} className="w-4 h-4 rounded border-thb-border" />
                  Share
                </label>
              </div>
              <button
                onClick={handleAddPermission}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
              >
                Add Permission
              </button>
            </div>

            {/* Permissions List */}
            {localPermissions.length === 0 ? (
              <div className="text-center py-8">
                <FiLock className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                <p className="text-sm text-thb-text-secondary">No restrictions — this document is visible to all users</p>
                <p className="text-xs text-thb-text-muted mt-1">Add permissions to restrict access to specific roles or users</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {localPermissions.map(perm => (
                  <div key={perm.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-thb-border">
                    <div className="flex items-center gap-3">
                      <span className={`thb-badge ${perm.targetType === 'role' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                        {perm.targetType === 'role' ? 'Role' : 'User'}
                      </span>
                      <span className="text-sm font-medium text-thb-text-primary">{perm.targetId.replace('_', ' ')}</span>
                      <div className="flex items-center gap-2 text-xs text-thb-text-muted">
                        {perm.canView && <span className="text-emerald-600">View</span>}
                        {perm.canEdit && <span className="text-blue-600">Edit</span>}
                        {perm.canShare && <span className="text-amber-600">Share</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePermission(perm.id)}
                      className="p-1.5 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="thb-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">
                {editingId ? 'Edit Document' : 'Create Document'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Document title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Category *</label>
                <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Category</option>
                  {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Content * (Markdown)</label>
                <textarea rows={10} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-y" placeholder="# Document Title&#10;&#10;Write your content in Markdown..." />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Summary</label>
                <textarea rows={2} value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Brief description of the document..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Tags (comma-separated)</label>
                <input type="text" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="api, integration, guide" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Version</label>
                <input type="text" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="1.0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Author</label>
                <input type="text" value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Author name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-thb-text-secondary mt-6">
                  <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="w-4 h-4 rounded border-thb-border" />
                  Featured Document
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Saving...' : editingId ? 'Update Document' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      {filteredDocuments.length === 0 ? (
        <div className="thb-card p-12 text-center">
          <FiBookOpen className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <p className="text-thb-text-secondary font-medium">No documents found</p>
          <p className="text-sm text-thb-text-muted mt-1">Try adjusting your search or category filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map(doc => {
            const colors = colorMap[doc.category?.color || 'blue'];
            return (
              <div key={doc.id} className="thb-card p-4 hover:shadow-md transition-all group">
                {/* Category badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.light} ${colors.text}`}>
                    {iconMap[doc.category?.icon || 'FiBookOpen']}
                    {doc.category?.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={getStatusBadge(doc.status)}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </span>
                    {doc.isFeatured && <FiStar className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                </div>

                {/* Title & Summary */}
                <h3 className="text-sm font-semibold text-thb-text-primary mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">{doc.title}</h3>
                <p className="text-xs text-thb-text-muted line-clamp-2 mb-3">{doc.summary}</p>

                {/* Tags */}
                {doc.tags && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {doc.tags.split(',').slice(0, 3).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-thb-text-muted text-[10px] rounded">
                        <FiTag className="w-2.5 h-2.5" />{tag.trim()}
                      </span>
                    ))}
                    {doc.tags.split(',').length > 3 && (
                      <span className="text-[10px] text-thb-text-muted">+{doc.tags.split(',').length - 3}</span>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between text-[11px] text-thb-text-muted pt-3 border-t border-thb-border">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><FiUser className="w-3 h-3" />{doc.author || '—'}</span>
                    <span className="flex items-center gap-1"><FiEye className="w-3 h-3" />{doc.viewCount}</span>
                  </div>
                  <span>v{doc.version}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-thb-border">
                  <button
                    onClick={() => { setViewingId(doc.id); setShowForm(false); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    <FiEye className="w-3.5 h-3.5" /> View
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleEdit(doc)}
                        className="p-1.5 rounded-md text-thb-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleManagePermissions(doc.id)}
                          className="p-1.5 rounded-md text-thb-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors"
                          title="Manage Permissions"
                        >
                          <FiLock className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 rounded-md text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
