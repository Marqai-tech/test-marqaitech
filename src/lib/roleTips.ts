// ============================================================================
// Role-Based Tips & Workflows Configuration for HRMS Application
// ============================================================================

/**
 * A single tip for a module, optionally scoped to specific roles.
 * If `roles` is undefined, the tip applies to all roles.
 */
export interface ModuleTip {
  title: string;
  description: string;
  roles?: string[];
}

/**
 * A single step in a module workflow, optionally scoped to specific roles.
 * If `roles` is undefined, the step applies to all roles.
 * Steps with the same `step` number but different roles represent
 * role-specific alternatives at that point in the workflow.
 */
export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  route?: string;
  roles?: string[];
}

/**
 * Configuration for a single module's tips and workflow.
 */
export interface RoleTipsConfig {
  moduleKey: string;
  tips: ModuleTip[];
  workflowSteps: WorkflowStep[];
  workflowTitle: string;
  workflowSubtitle?: string;
}

// Available roles in the system
export type HrmsRole =
  | 'super_admin'
  | 'tenant_admin'
  | 'hr_admin'
  | 'manager'
  | 'employee'
  | 'recruiter'
  | 'finance'
  | 'it_admin';

// ============================================================================
// Module Configurations
// ============================================================================

export const roleTipsConfig: Record<string, RoleTipsConfig> = {
  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------
  dashboard: {
    moduleKey: 'dashboard',
    tips: [
      {
        title: 'Personalized Overview',
        description: 'Your dashboard shows metrics and widgets tailored to your role. Super admins see tenant-wide stats, managers see team data, and employees see personal info.',
      },
      {
        title: 'Quick Actions Panel',
        description: 'Use the Quick Actions panel on the dashboard to navigate to common tasks like applying for leave, raising a ticket, or approving requests without hunting through menus.',
      },
      {
        title: 'Monitor Team Activity',
        description: 'As a manager, the Team Activity widget on your dashboard shows pending approvals, attendance anomalies, and team leave calendars at a glance.',
        roles: ['manager', 'hr_admin', 'tenant_admin'],
      },
      {
        title: 'System Health & Alerts',
        description: 'Super admins and IT admins can view system health indicators, failed payroll runs, and critical alerts directly from the dashboard.',
        roles: ['super_admin', 'it_admin'],
      },
      {
        title: 'Financial Snapshot',
        description: 'Finance users see a financial snapshot widget with pending payroll runs, expense approvals, and budget utilization summaries.',
        roles: ['finance', 'hr_admin', 'tenant_admin'],
      },
      {
        title: 'Recruitment Pipeline Summary',
        description: 'Recruiters see an at-a-glance view of open positions, candidates in pipeline, and upcoming interviews right on the dashboard.',
        roles: ['recruiter', 'hr_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Log In & Review',
        description: 'Sign in and review your personalized dashboard widgets and alerts',
        route: '/dashboard',
      },
      {
        step: 2,
        title: 'Check Notifications',
        description: 'Review pending notifications and action items in the notification bell',
        roles: ['employee', 'manager'],
      },
      {
        step: 2,
        title: 'Review Pending Approvals',
        description: 'Check the approvals queue for leave, expense, or timesheet requests from your team',
        route: '/dashboard',
        roles: ['manager', 'hr_admin', 'finance'],
      },
      {
        step: 3,
        title: 'Monitor System Alerts',
        description: 'Review system health, failed jobs, and compliance alerts from the admin dashboard',
        route: '/super-admin',
        roles: ['super_admin', 'it_admin'],
      },
      {
        step: 3,
        title: 'Check Payroll Status',
        description: 'View the current payroll processing status and any pending runs',
        route: '/payroll',
        roles: ['finance', 'hr_admin'],
      },
      {
        step: 4,
        title: 'Quick Action',
        description: 'Use the Quick Actions panel to jump to your most common task (leave request, ticket, approval, etc.)',
        route: '/dashboard',
      },
      {
        step: 5,
        title: 'Explore Reports',
        description: 'Navigate to the Reports module for deeper analytics and data insights',
        route: '/reports',
        roles: ['manager', 'hr_admin', 'finance', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowTitle: 'Getting Started with Dashboard',
    workflowSubtitle: 'Make the most of your personalized dashboard',
  },

  // ---------------------------------------------------------------------------
  // EMPLOYEES
  // ---------------------------------------------------------------------------
  employees: {
    moduleKey: 'employees',
    tips: [
      {
        title: 'Employee Directory Search',
        description: 'Use the global search bar to quickly find employees by name, ID, department, or designation. Filters help narrow down results in large organizations.',
      },
      {
        title: 'View & Edit Your Profile',
        description: 'Navigate to your own profile to update personal details, emergency contacts, bank information, and upload documents.',
        roles: ['employee'],
      },
      {
        title: 'Manage Employee Records',
        description: 'HR admins can create, update, and manage all employee records including personal info, job details, compensation, and document uploads.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'Team Roster Overview',
        description: 'Managers can view their direct and indirect reportees, filter by status (active, probation, notice period), and access team member profiles.',
        roles: ['manager'],
      },
      {
        title: 'Bulk Import Employees',
        description: 'Use the CSV bulk import feature to onboard multiple employees at once. Download the template, fill in data, and upload for mass creation.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Employee Lifecycle Tracking',
        description: 'Track the full employee lifecycle from onboarding through probation confirmation, promotions, transfers, and eventual separation—all from the employee profile.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Access Employee Module',
        description: 'Navigate to the Employees module from the sidebar',
        route: '/employees',
      },
      {
        step: 2,
        title: 'Search or Filter',
        description: 'Use the search bar and filters to find specific employees by department, status, or location',
      },
      {
        step: 3,
        title: 'View Your Profile',
        description: 'Click on your name or avatar to view and edit your personal profile details',
        route: '/employees',
        roles: ['employee'],
      },
      {
        step: 3,
        title: 'View Team Members',
        description: 'Switch to the "My Team" view to see all direct and indirect reportees',
        route: '/employees',
        roles: ['manager'],
      },
      {
        step: 3,
        title: 'Add New Employee',
        description: 'Click "Add Employee" to create a new employee record with personal, job, and compensation details',
        route: '/employees',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 4,
        title: 'Edit Employee Details',
        description: 'Open an employee record to update job information, compensation, or personal details',
        route: '/employees',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        step: 5,
        title: 'Upload Documents',
        description: 'Upload and manage employee documents like ID proofs, certificates, and contracts',
        route: '/documents',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 6,
        title: 'Generate Reports',
        description: 'Export employee data or generate headcount reports for HR analytics',
        route: '/reports',
        roles: ['hr_admin', 'finance', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowTitle: 'Managing Employees',
    workflowSubtitle: 'Navigate the employee directory and manage records effectively',
  },

  // ---------------------------------------------------------------------------
  // COMPANY
  // ---------------------------------------------------------------------------
  company: {
    moduleKey: 'company',
    tips: [
      {
        title: 'Company Profile Setup',
        description: 'Set up your company profile with legal name, registration details, logo, and contact information. This data flows into offer letters, payslips, and compliance documents.',
        roles: ['tenant_admin', 'super_admin'],
      },
      {
        title: 'Manage Branches & Locations',
        description: 'Define all company branches and locations. Each branch can have its own attendance rules, holiday calendar, and statutory compliance requirements.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'Department Configuration',
        description: 'Create and manage departments with designated department heads. Departments are used for organizational structure, reporting, and access control.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'Designation & Grade Setup',
        description: 'Define designations and grade levels that link to salary structures, leave policies, and approval hierarchies.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'View Company Directory',
        description: 'Employees can browse the company directory to find colleagues, view org charts, and understand the organizational structure.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Multi-Company Management',
        description: 'Super admins can manage multiple companies (tenants) within the platform, switching between them and configuring each independently.',
        roles: ['super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Company Profile',
        description: 'Enter company legal name, registration number, logo, and address',
        route: '/company',
        roles: ['tenant_admin', 'super_admin'],
      },
      {
        step: 1,
        title: 'Browse Company Info',
        description: 'View your company profile, departments, and organizational structure',
        route: '/company',
        roles: ['employee', 'manager'],
      },
      {
        step: 2,
        title: 'Add Branches',
        description: 'Define office locations with address, time zone, and statutory details',
        route: '/company',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        step: 3,
        title: 'Define Departments',
        description: 'Create departments, assign heads, and set up reporting hierarchies',
        route: '/company',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 4,
        title: 'Setup Designations',
        description: 'Create designation levels and map them to grade structures',
        route: '/company',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 5,
        title: 'Configure Holiday Calendar',
        description: 'Set up the company holiday calendar for each branch or location',
        route: '/company',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 6,
        title: 'Review Org Chart',
        description: 'Verify the organizational structure and reporting relationships in the org chart view',
        route: '/company',
      },
    ],
    workflowTitle: 'Setting Up Company Structure',
    workflowSubtitle: 'Configure your company profile, branches, and organizational hierarchy',
  },

  // ---------------------------------------------------------------------------
  // RECRUITMENT
  // ---------------------------------------------------------------------------
  recruitment: {
    moduleKey: 'recruitment',
    tips: [
      {
        title: 'Job Requisition Workflow',
        description: 'All hiring starts with a job requisition. Managers raise requisitions, which are approved by department heads and HR before a job posting is created.',
        roles: ['manager', 'hr_admin', 'recruiter'],
      },
      {
        title: 'AI-Powered Candidate Screening',
        description: 'Use the AI screening feature to automatically rank candidates based on job description match, reducing manual screening time by up to 70%.',
        roles: ['recruiter', 'hr_admin'],
      },
      {
        title: 'Interview Scheduling',
        description: 'Schedule interviews directly from the candidate profile. The system sends calendar invites to interviewers and automated reminders to candidates.',
        roles: ['recruiter', 'hr_admin', 'manager'],
      },
      {
        title: 'Pipeline Management',
        description: 'Track candidates through each stage of the hiring pipeline—Applied, Screening, Interview, Offer, Hired—with drag-and-drop Kanban boards.',
        roles: ['recruiter', 'hr_admin', 'manager'],
      },
      {
        title: 'Offer Letter Generation',
        description: 'Generate offer letters from templates with pre-filled compensation details, joining dates, and terms. Send digitally for e-signature.',
        roles: ['hr_admin', 'recruiter', 'tenant_admin'],
      },
      {
        title: 'Referral Tracking',
        description: 'Employees can submit referrals for open positions and track the referral status and bonus eligibility from the recruitment portal.',
        roles: ['employee'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Job Requisition',
        description: 'Raise a hiring request specifying the role, count, budget, and justification',
        route: '/requisitions',
        roles: ['manager', 'hr_admin'],
      },
      {
        step: 1,
        title: 'View Open Positions',
        description: 'Browse currently open positions and refer candidates from your network',
        route: '/recruitment',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Approve Requisition',
        description: 'Review and approve the job requisition after verifying budget and headcount',
        route: '/requisitions',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 3,
        title: 'Post Job Opening',
        description: 'Create a job posting with detailed JD, requirements, and publish to job portals',
        route: '/recruitment',
        roles: ['recruiter', 'hr_admin'],
      },
      {
        step: 4,
        title: 'Screen Candidates',
        description: 'Review applications, use AI screening, and shortlist candidates for interviews',
        route: '/recruitment',
        roles: ['recruiter', 'hr_admin'],
      },
      {
        step: 5,
        title: 'Conduct Interviews',
        description: 'Schedule and conduct interviews, collect feedback from interviewers',
        route: '/recruitment',
        roles: ['recruiter', 'manager', 'hr_admin'],
      },
      {
        step: 6,
        title: 'Generate Offer',
        description: 'Create and send the offer letter with compensation breakdown and joining details',
        route: '/offers',
        roles: ['hr_admin', 'recruiter'],
      },
      {
        step: 7,
        title: 'Initiate Onboarding',
        description: 'Convert accepted candidates to employees and trigger the onboarding workflow',
        route: '/onboarding',
        roles: ['hr_admin', 'recruiter'],
      },
    ],
    workflowTitle: 'End-to-End Recruitment Process',
    workflowSubtitle: 'From requisition to onboarding—manage the complete hiring lifecycle',
  },

  // ---------------------------------------------------------------------------
  // ONBOARDING
  // ---------------------------------------------------------------------------
  onboarding: {
    moduleKey: 'onboarding',
    tips: [
      {
        title: 'Automated Onboarding Plans',
        description: 'Create reusable onboarding templates with task checklists, document requirements, and orientation schedules. Assign templates based on department or role.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Pre-boarding Portal',
        description: 'New hires receive a pre-boarding portal link to submit documents, fill personal details, and complete compliance forms before their first day.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Manager Welcome & Setup',
        description: 'Managers are automatically notified of new team members and can assign buddy programs, equipment requests, and initial project assignments.',
        roles: ['manager'],
      },
      {
        title: 'Task Checklist Tracking',
        description: 'Both HR and new hires can track onboarding progress with a visual checklist. Overdue tasks trigger automated reminders to the responsible parties.',
        roles: ['hr_admin', 'manager', 'employee'],
      },
      {
        title: 'Document Collection',
        description: 'Collect all mandatory documents (ID proofs, certificates, bank details) digitally during onboarding. The system validates and stores them securely.',
        roles: ['hr_admin', 'employee'],
      },
      {
        title: 'IT & Asset Provisioning',
        description: 'IT admins receive automated provisioning requests for laptop, email, VPN, and software access when a new hire onboards.',
        roles: ['it_admin', 'hr_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Onboarding Plan',
        description: 'Set up onboarding templates with tasks, documents, and orientation activities',
        route: '/onboarding',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Complete Pre-boarding',
        description: 'Fill in your personal details, upload documents, and complete compliance forms before joining',
        route: '/preboarding',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Send Pre-boarding Link',
        description: 'Send the pre-boarding portal link to the new hire for document submission and form completion',
        route: '/onboarding',
        roles: ['hr_admin'],
      },
      {
        step: 3,
        title: 'Day-One Orientation',
        description: 'Conduct the orientation session covering company policies, culture, and team introductions',
        route: '/onboarding',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 4,
        title: 'Assign Buddy & Equipment',
        description: 'Assign an onboarding buddy and submit equipment/laptop provisioning requests',
        route: '/onboarding',
        roles: ['manager', 'it_admin'],
      },
      {
        step: 5,
        title: 'Complete Task Checklist',
        description: 'Work through the onboarding task checklist and mark items as completed',
        route: '/onboarding',
        roles: ['employee', 'hr_admin'],
      },
      {
        step: 6,
        title: 'IT Setup & Access',
        description: 'Provision email, VPN, software licenses, and hardware for the new hire',
        route: '/assets',
        roles: ['it_admin'],
      },
      {
        step: 7,
        title: 'Onboarding Feedback',
        description: 'Collect feedback from the new hire about their onboarding experience for continuous improvement',
        route: '/onboarding',
        roles: ['hr_admin', 'employee'],
      },
    ],
    workflowTitle: 'Employee Onboarding Workflow',
    workflowSubtitle: 'Ensure a smooth first-day experience with structured onboarding',
  },

  // ---------------------------------------------------------------------------
  // ATTENDANCE
  // ---------------------------------------------------------------------------
  attendance: {
    moduleKey: 'attendance',
    tips: [
      {
        title: 'Clock In/Out',
        description: 'Use the web or mobile app to clock in and out daily. The system automatically calculates work hours, breaks, and overtime based on your shift configuration.',
        roles: ['employee'],
      },
      {
        title: 'Regularization Requests',
        description: 'If you forget to clock in/out, submit an attendance regularization request with a reason. Your manager will review and approve it.',
        roles: ['employee'],
      },
      {
        title: 'Team Attendance Overview',
        description: 'Managers can view real-time attendance status of their team, identify late arrivals, early departures, and absences at a glance.',
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Shift Management',
        description: 'HR admins can define shifts, rotate shift schedules, and assign employees to shifts. Night shift allowances are auto-calculated based on shift configuration.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Attendance Policy Configuration',
        description: 'Configure attendance rules including grace period, half-day thresholds, overtime calculation, and late arrival penalties per company policy.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'Attendance Reports & Compliance',
        description: 'Generate attendance summaries, overtime reports, and compliance reports for payroll processing and statutory requirements.',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Configure Shifts',
        description: 'Define shift timings, grace periods, and overtime rules for each location',
        route: '/attendance',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Clock In for the Day',
        description: 'Use the Check-In button to mark your attendance when starting work',
        route: '/attendance',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Assign Employees to Shifts',
        description: 'Map employees to the appropriate shift roster and publish the schedule',
        route: '/attendance',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 2,
        title: 'Clock Out & Review',
        description: 'Clock out at the end of the day and review your total worked hours',
        route: '/attendance',
        roles: ['employee'],
      },
      {
        step: 3,
        title: 'Request Regularization',
        description: 'Submit a regularization request if you missed a punch or have a discrepancy',
        route: '/attendance',
        roles: ['employee'],
      },
      {
        step: 4,
        title: 'Approve Regularizations',
        description: 'Review and approve/reject attendance regularization requests from team members',
        route: '/attendance',
        roles: ['manager', 'hr_admin'],
      },
      {
        step: 5,
        title: 'Review Team Attendance',
        description: 'Monitor team attendance patterns, absences, and late arrivals',
        route: '/attendance',
        roles: ['manager', 'hr_admin'],
      },
      {
        step: 6,
        title: 'Generate Reports',
        description: 'Export attendance data for payroll processing and compliance filing',
        route: '/reports',
        roles: ['hr_admin', 'finance'],
      },
    ],
    workflowTitle: 'Attendance Management Workflow',
    workflowSubtitle: 'Track, manage, and report employee attendance effectively',
  },

  // ---------------------------------------------------------------------------
  // LEAVE
  // ---------------------------------------------------------------------------
  leave: {
    moduleKey: 'leave',
    tips: [
      {
        title: 'Apply for Leave',
        description: 'Submit leave requests specifying the type, duration, and reason. The system auto-calculates balance deductions and shows your remaining leave before you submit.',
        roles: ['employee'],
      },
      {
        title: 'Leave Balance Dashboard',
        description: 'View your available leave balance for each leave type (casual, sick, earned, etc.) including accrued, used, and carry-forwarded amounts.',
        roles: ['employee'],
      },
      {
        title: 'Approve Team Leave Requests',
        description: 'Managers receive leave requests from reportees with team calendar visibility. Approve or reject with comments while avoiding team coverage gaps.',
        roles: ['manager'],
      },
      {
        title: 'Leave Policy Configuration',
        description: 'HR admins define leave types, accrual rules, carry-forward limits, encashment policies, and probation restrictions per company policy.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Holiday & Leave Calendar',
        description: 'The shared calendar shows company holidays, team members on leave, and helps plan time-off without coverage issues.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Leave Encashment & Settlement',
        description: 'Process leave encashment during payroll or full-and-final settlement. Configurable rules determine which leave types are encashable.',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Configure Leave Policies',
        description: 'Define leave types, accrual rules, eligibility, and carry-forward limits',
        route: '/leave',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Check Leave Balance',
        description: 'View your available leave balance before applying for time off',
        route: '/leave',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Apply for Leave',
        description: 'Submit a leave request with type, dates, and reason; the system shows balance impact',
        route: '/leave',
        roles: ['employee'],
      },
      {
        step: 3,
        title: 'Manager Approval',
        description: 'Review the leave request against team calendar and approve or reject with comments',
        route: '/leave',
        roles: ['manager'],
      },
      {
        step: 4,
        title: 'HR Review (if needed)',
        description: 'HR can review and override leave decisions for special cases or policy exceptions',
        route: '/leave',
        roles: ['hr_admin'],
      },
      {
        step: 5,
        title: 'Leave Deduction in Payroll',
        description: 'Unpaid leaves and LOP days are automatically reflected in payroll calculations',
        route: '/payroll',
        roles: ['hr_admin', 'finance'],
      },
      {
        step: 6,
        title: 'Leave Encashment',
        description: 'Process leave encashment for eligible employees during year-end or separation',
        route: '/payroll',
        roles: ['hr_admin', 'finance'],
      },
    ],
    workflowTitle: 'Leave Management Workflow',
    workflowSubtitle: 'From policy setup to encashment—manage the complete leave lifecycle',
  },

  // ---------------------------------------------------------------------------
  // PAYROLL
  // ---------------------------------------------------------------------------
  payroll: {
    moduleKey: 'payroll',
    tips: [
      {
        title: 'Configure Components First',
        description: 'Start by setting up Component Master and Statutory Components before processing payroll. Earnings, deductions, and allowances must be defined before running any payroll.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'View Your Payslip',
        description: 'Navigate to the Payslips section to view and download your monthly salary details, including earnings, deductions, tax, and net pay.',
        roles: ['employee'],
      },
      {
        title: 'CTC Template Setup',
        description: 'Create CTC templates that define the salary structure for different grades and designations. Templates ensure consistency in offer letters and payroll.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Payroll Processing Cycle',
        description: 'The payroll cycle includes: verify attendance → collect inputs → validate data → run payroll → review → lock → generate payslips. Follow each step in order.',
        roles: ['hr_admin', 'finance'],
      },
      {
        title: 'Tax & Statutory Compliance',
        description: 'Configure tax slabs, PF, ESI, TDS, and professional tax settings. The system auto-calculates statutory deductions during payroll processing.',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
      {
        title: 'Payroll Reports & Bank Files',
        description: 'Generate salary registers, statutory reports (PF ECR, ESI, TDS), and bank payment files after locking the payroll run.',
        roles: ['finance', 'hr_admin', 'tenant_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Setup Components',
        description: 'Configure earnings, deductions, and allowances in the Component Master',
        route: '/payroll/components',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
      {
        step: 1,
        title: 'View Salary Details',
        description: 'Check your CTC breakdown and salary components',
        route: '/payroll/payslips',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Configure Statutory',
        description: 'Set up PF, ESI, TDS, Professional Tax, and other statutory components',
        route: '/payroll/statutory',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 3,
        title: 'Create CTC Templates',
        description: 'Build salary structure templates for different grades and roles',
        route: '/payroll/ctc-templates',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 4,
        title: 'Collect Payroll Inputs',
        description: 'Gather attendance, leave, overtime, and variable inputs for the payroll period',
        route: '/payroll/inputs',
        roles: ['hr_admin', 'finance'],
      },
      {
        step: 5,
        title: 'Run Payroll',
        description: 'Execute the payroll run, review calculations, and validate for errors',
        route: '/payroll/processing',
        roles: ['hr_admin', 'finance'],
      },
      {
        step: 6,
        title: 'Review & Lock',
        description: 'Review payroll registers, resolve validation errors, and lock the payroll run',
        route: '/payroll/validations',
        roles: ['hr_admin', 'finance'],
      },
      {
        step: 7,
        title: 'Generate Payslips & Reports',
        description: 'Publish payslips for employees and generate bank files and statutory reports',
        route: '/payroll/payslips',
        roles: ['hr_admin', 'finance'],
      },
    ],
    workflowTitle: 'How to Process Payroll',
    workflowSubtitle: 'Follow this workflow to set up and process payroll end-to-end',
  },

  // ---------------------------------------------------------------------------
  // PERFORMANCE
  // ---------------------------------------------------------------------------
  performance: {
    moduleKey: 'performance',
    tips: [
      {
        title: 'Goal Setting & Alignment',
        description: 'Set individual goals aligned with team and organizational objectives. Use the OKR framework to ensure everyone works toward shared outcomes.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Continuous Feedback',
        description: 'Give and receive real-time feedback from peers, managers, and direct reports. Regular feedback improves performance far more than annual reviews alone.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Review Cycle Management',
        description: 'HR admins can configure performance review cycles with custom questionnaires, rating scales, review periods, and multi-level approval workflows.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Self-Appraisal',
        description: 'Before the review meeting, complete your self-appraisal by reflecting on achievements, challenges, and development areas against your goals.',
        roles: ['employee'],
      },
      {
        title: 'Manager Assessment & Calibration',
        description: 'Managers evaluate reportees, provide ratings and comments. HR can run calibration sessions to normalize ratings across teams and departments.',
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Performance Improvement Plans',
        description: 'Create structured PIPs for underperformers with clear milestones, timelines, and support resources. Track progress with regular check-ins.',
        roles: ['manager', 'hr_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Configure Review Cycle',
        description: 'Set up the performance review cycle with timeline, questionnaire, and rating scale',
        route: '/performance',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Set Your Goals',
        description: 'Define your individual goals aligned with team and company objectives',
        route: '/performance',
        roles: ['employee', 'manager'],
      },
      {
        step: 2,
        title: 'Continuous Feedback',
        description: 'Exchange regular feedback with peers and managers throughout the review period',
        route: '/performance',
        roles: ['employee', 'manager'],
      },
      {
        step: 3,
        title: 'Self-Appraisal',
        description: 'Complete your self-evaluation against your goals and competencies',
        route: '/performance',
        roles: ['employee'],
      },
      {
        step: 4,
        title: 'Manager Review',
        description: 'Evaluate your reportees, provide ratings, and add developmental comments',
        route: '/performance',
        roles: ['manager'],
      },
      {
        step: 5,
        title: 'Calibration Session',
        description: 'Normalize ratings across teams to ensure fairness and consistency',
        route: '/performance',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 6,
        title: 'Review Meeting',
        description: 'Conduct one-on-one review meetings to discuss feedback and growth plans',
        route: '/performance',
        roles: ['manager', 'employee'],
      },
      {
        step: 7,
        title: 'Development Plan',
        description: 'Create individual development plans based on review outcomes and career aspirations',
        route: '/training',
        roles: ['employee', 'manager', 'hr_admin'],
      },
    ],
    workflowTitle: 'Performance Review Cycle',
    workflowSubtitle: 'From goal setting to development planning—manage the complete performance cycle',
  },

  // ---------------------------------------------------------------------------
  // TRAINING
  // ---------------------------------------------------------------------------
  training: {
    moduleKey: 'training',
    tips: [
      {
        title: 'Browse Course Catalog',
        description: 'Explore the training catalog for courses, workshops, and e-learning modules assigned to you or recommended based on your role and development plan.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Learning Paths',
        description: 'Enroll in structured learning paths that combine multiple courses into a progressive curriculum designed for specific roles or competencies.',
        roles: ['employee'],
      },
      {
        title: 'Training Needs Assessment',
        description: 'Managers can identify skill gaps in their team through performance reviews and recommend targeted training programs for their reportees.',
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Course & Content Management',
        description: 'HR admins can create courses, upload content (videos, documents, SCORM), set assessments, and define completion criteria and certifications.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Training Compliance Tracking',
        description: 'Track mandatory training completions for compliance (fire safety, data privacy, harassment prevention). Get alerts for overdue trainings.',
        roles: ['hr_admin', 'manager', 'tenant_admin'],
      },
      {
        title: 'Training ROI & Analytics',
        description: 'Measure training effectiveness through completion rates, assessment scores, post-training performance improvements, and employee satisfaction surveys.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Training Program',
        description: 'Build courses with content, assessments, and certification criteria',
        route: '/training',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Browse Available Courses',
        description: 'Explore the course catalog and find trainings relevant to your role',
        route: '/training',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Assign Training',
        description: 'Assign courses to individuals, teams, or the entire organization with deadlines',
        route: '/training',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 3,
        title: 'Complete Coursework',
        description: 'Work through the course modules, watch videos, and complete assessments',
        route: '/training',
        roles: ['employee'],
      },
      {
        step: 4,
        title: 'Assessment & Certification',
        description: 'Pass the course assessment to earn a certification and update your skill profile',
        route: '/training',
        roles: ['employee'],
      },
      {
        step: 5,
        title: 'Track Completion',
        description: 'Monitor training completion rates, overdue assignments, and compliance status',
        route: '/training',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 6,
        title: 'Evaluate Effectiveness',
        description: 'Analyze post-training performance, gather feedback, and measure ROI',
        route: '/reports',
        roles: ['hr_admin', 'tenant_admin'],
      },
    ],
    workflowTitle: 'Training Management Workflow',
    workflowSubtitle: 'Create, deliver, and track employee training programs effectively',
  },

  // ---------------------------------------------------------------------------
  // ENGAGEMENT
  // ---------------------------------------------------------------------------
  engagement: {
    moduleKey: 'engagement',
    tips: [
      {
        title: 'Participate in Surveys',
        description: 'Your voice matters! Complete engagement surveys honestly. Responses are anonymized and used to improve workplace culture and policies.',
        roles: ['employee'],
      },
      {
        title: 'Recognition & Kudos',
        description: 'Recognize colleagues for their contributions by sending kudos and shout-outs. Public recognition boosts morale and strengthens team culture.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Team Engagement Dashboard',
        description: "Managers can view their team's engagement scores, participation rates, and sentiment trends to identify disengaged employees early.",
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Survey Configuration',
        description: 'HR admins can create custom engagement surveys with various question types, schedule recurring pulse surveys, and set anonymity levels.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Grievance Management',
        description: 'Employees can raise workplace grievances confidentially. HR tracks resolution progress and ensures timely follow-up and compliance.',
        roles: ['employee', 'hr_admin'],
      },
      {
        title: 'Engagement Analytics',
        description: 'Analyze engagement trends across departments, demographics, and time periods. Identify hotspots and track the impact of interventions.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Engagement Survey',
        description: 'Design survey questions, set anonymity level, and schedule the survey period',
        route: '/engagement',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Complete Survey',
        description: 'Share your honest feedback through the engagement survey—your responses are anonymous',
        route: '/engagement',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Send Recognition',
        description: 'Appreciate a colleague by sending a kudos or recognition for their work',
        route: '/engagement',
        roles: ['employee', 'manager'],
      },
      {
        step: 3,
        title: 'Review Team Engagement',
        description: "Analyze your team's engagement scores and identify areas needing attention",
        route: '/engagement',
        roles: ['manager'],
      },
      {
        step: 4,
        title: 'Analyze Survey Results',
        description: 'View aggregated survey results, sentiment analysis, and trend reports',
        route: '/engagement',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 5,
        title: 'Action Planning',
        description: 'Create action plans based on survey insights to address areas of concern',
        route: '/engagement',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 6,
        title: 'Track Improvements',
        description: 'Monitor engagement score changes over time to measure the impact of interventions',
        route: '/engagement',
        roles: ['hr_admin', 'tenant_admin'],
      },
    ],
    workflowTitle: 'Employee Engagement Cycle',
    workflowSubtitle: 'Measure, analyze, and improve employee engagement continuously',
  },

  // ---------------------------------------------------------------------------
  // HELPDESK
  // ---------------------------------------------------------------------------
  helpdesk: {
    moduleKey: 'helpdesk',
    tips: [
      {
        title: 'Raise a Ticket',
        description: 'Submit support tickets for IT issues, HR queries, facility requests, or any workplace need. Track ticket status and communicate with agents in real-time.',
        roles: ['employee'],
      },
      {
        title: 'Knowledge Base Search',
        description: 'Before raising a ticket, search the knowledge base for FAQs and self-service articles. Many common issues have documented solutions.',
        roles: ['employee'],
      },
      {
        title: 'Ticket Queue Management',
        description: 'Helpdesk agents and IT admins can manage ticket queues, assign tickets, set priorities, and track SLA compliance from the agent dashboard.',
        roles: ['it_admin', 'hr_admin'],
      },
      {
        title: 'SLA Configuration',
        description: 'Configure SLAs by ticket category and priority. Set response and resolution time targets, escalation rules, and breach notifications.',
        roles: ['it_admin', 'hr_admin', 'tenant_admin'],
      },
      {
        title: 'Manager Escalation View',
        description: 'Managers can view escalated tickets from their team members and help prioritize resolution with the helpdesk team.',
        roles: ['manager'],
      },
      {
        title: 'Helpdesk Analytics',
        description: 'Track ticket volume, resolution times, SLA compliance, agent performance, and satisfaction scores to continuously improve support quality.',
        roles: ['it_admin', 'hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Search Knowledge Base',
        description: 'Look for a solution in the FAQ and self-service articles before creating a ticket',
        route: '/helpdesk',
        roles: ['employee'],
      },
      {
        step: 1,
        title: 'Configure SLA & Categories',
        description: 'Set up ticket categories, SLAs, escalation rules, and agent assignments',
        route: '/helpdesk',
        roles: ['it_admin', 'hr_admin', 'tenant_admin'],
      },
      {
        step: 2,
        title: 'Raise Ticket',
        description: 'Create a support ticket with category, priority, description, and attachments',
        route: '/helpdesk',
        roles: ['employee'],
      },
      {
        step: 3,
        title: 'Agent Triage & Assign',
        description: 'Review incoming tickets, triage by priority, and assign to the appropriate agent',
        route: '/helpdesk',
        roles: ['it_admin', 'hr_admin'],
      },
      {
        step: 4,
        title: 'Resolve & Communicate',
        description: 'Work on the ticket, communicate progress via comments, and provide a resolution',
        route: '/helpdesk',
        roles: ['it_admin', 'hr_admin'],
      },
      {
        step: 5,
        title: 'Escalate if Needed',
        description: 'Escalate tickets that breach SLA or require higher authority intervention',
        route: '/helpdesk',
        roles: ['it_admin', 'manager'],
      },
      {
        step: 6,
        title: 'Close & Rate',
        description: 'Verify the resolution, close the ticket, and rate your support experience',
        route: '/helpdesk',
        roles: ['employee'],
      },
    ],
    workflowTitle: 'Helpdesk Ticket Lifecycle',
    workflowSubtitle: 'From issue reporting to resolution—track every support request',
  },

  // ---------------------------------------------------------------------------
  // TRAVEL
  // ---------------------------------------------------------------------------
  travel: {
    moduleKey: 'travel',
    tips: [
      {
        title: 'Submit Travel Request',
        description: 'Create travel requests with trip details including destination, dates, purpose, and estimated costs. Attach supporting documents for easy approval.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Travel Policy Compliance',
        description: 'Travel requests are automatically validated against company travel policy (class of travel, hotel limits, daily allowances). Violations are flagged for manager review.',
        roles: ['employee', 'manager', 'hr_admin'],
      },
      {
        title: 'Approve Travel Requests',
        description: 'Managers review team travel requests against budget, policy compliance, and business need. Approve or reject with comments.',
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Travel Booking Coordination',
        description: 'Once approved, travel bookings can be coordinated through the system. Upload itineraries and booking confirmations for centralized tracking.',
        roles: ['employee', 'hr_admin'],
      },
      {
        title: 'Travel Advance Processing',
        description: 'Process travel advances through payroll or direct payment. Advances are reconciled against actual expenses after the trip.',
        roles: ['finance', 'hr_admin'],
      },
      {
        title: 'Travel Policy Configuration',
        description: 'Define travel policies including class of travel, accommodation limits, per diem rates, and approval thresholds by grade and destination.',
        roles: ['hr_admin', 'tenant_admin', 'finance'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Configure Travel Policy',
        description: 'Define travel rules, per diem rates, and approval thresholds by grade',
        route: '/travel',
        roles: ['hr_admin', 'tenant_admin', 'finance'],
      },
      {
        step: 1,
        title: 'Submit Travel Request',
        description: 'Enter trip details, estimated costs, and business justification',
        route: '/travel',
        roles: ['employee', 'manager'],
      },
      {
        step: 2,
        title: 'Manager Approval',
        description: 'Review the travel request for policy compliance and business need',
        route: '/travel',
        roles: ['manager', 'hr_admin'],
      },
      {
        step: 3,
        title: 'Process Travel Advance',
        description: 'Issue travel advance payment if applicable based on policy',
        route: '/travel',
        roles: ['finance'],
      },
      {
        step: 4,
        title: 'Upload Itinerary',
        description: 'Upload flight, hotel, and transportation booking details',
        route: '/travel',
        roles: ['employee'],
      },
      {
        step: 5,
        title: 'Complete Trip',
        description: 'After the trip, submit actual expense reports against the travel request',
        route: '/expenses',
        roles: ['employee'],
      },
      {
        step: 6,
        title: 'Reconcile Expenses',
        description: 'Compare actual expenses with advances and process reimbursement or recovery',
        route: '/expenses',
        roles: ['finance'],
      },
    ],
    workflowTitle: 'Business Travel Management',
    workflowSubtitle: 'From request to reimbursement—manage business travel seamlessly',
  },

  // ---------------------------------------------------------------------------
  // EXPENSES
  // ---------------------------------------------------------------------------
  expenses: {
    moduleKey: 'expenses',
    tips: [
      {
        title: 'Submit Expense Claims',
        description: 'Create expense claims by category (travel, meals, accommodation, misc) with receipts attached. The system auto-converts foreign currency if configured.',
        roles: ['employee'],
      },
      {
        title: 'Expense Policy Validation',
        description: 'Expense claims are automatically validated against company policy limits. Out-of-policy items are flagged and require additional justification.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Approve Team Expenses',
        description: 'Review expense submissions from your team, verify receipts, check policy compliance, and approve or reject with comments.',
        roles: ['manager'],
      },
      {
        title: 'Finance Review & Reimbursement',
        description: 'Finance team reviews approved expenses, verifies accounting codes, processes reimbursements through payroll or direct payment.',
        roles: ['finance'],
      },
      {
        title: 'Expense Analytics',
        description: 'Track expense trends by department, category, and employee. Identify cost-saving opportunities and policy violation patterns.',
        roles: ['finance', 'hr_admin', 'tenant_admin'],
      },
      {
        title: 'Expense Policy Configuration',
        description: 'Define expense categories, spending limits, required documentation, and multi-level approval thresholds by employee grade.',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Configure Expense Policy',
        description: 'Set up expense categories, limits, and approval rules by grade',
        route: '/expenses',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Submit Expense Claim',
        description: 'Create a new claim with itemized expenses and receipt attachments',
        route: '/expenses',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Manager Approval',
        description: 'Review the expense claim for policy compliance and business validity',
        route: '/expenses',
        roles: ['manager'],
      },
      {
        step: 3,
        title: 'Finance Review',
        description: 'Verify accounting codes, tax calculations, and receipt authenticity',
        route: '/expenses',
        roles: ['finance'],
      },
      {
        step: 4,
        title: 'Process Reimbursement',
        description: 'Schedule reimbursement through payroll or direct bank transfer',
        route: '/expenses',
        roles: ['finance'],
      },
      {
        step: 5,
        title: 'Employee Confirmation',
        description: 'Confirm receipt of reimbursement and close the claim',
        route: '/expenses',
        roles: ['employee'],
      },
    ],
    workflowTitle: 'Expense Management Workflow',
    workflowSubtitle: 'Submit, approve, and reimburse employee expenses efficiently',
  },

  // ---------------------------------------------------------------------------
  // ASSETS
  // ---------------------------------------------------------------------------
  assets: {
    moduleKey: 'assets',
    tips: [
      {
        title: 'View Assigned Assets',
        description: 'Check all assets currently assigned to you (laptop, phone, access cards, etc.) along with their serial numbers, assignment dates, and return due dates.',
        roles: ['employee'],
      },
      {
        title: 'Request New Assets',
        description: 'Submit asset requests for new equipment or replacements. Requests are routed to your manager and IT admin for approval and provisioning.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Asset Inventory Management',
        description: 'IT admins can manage the complete asset inventory—add new assets, track locations, assign/unassign employees, and schedule maintenance.',
        roles: ['it_admin'],
      },
      {
        title: 'Asset Return During Separation',
        description: 'When an employee resigns, all assigned assets are flagged for return. The clearance process ensures assets are collected before the final settlement.',
        roles: ['it_admin', 'hr_admin', 'manager'],
      },
      {
        title: 'Asset Depreciation Tracking',
        description: 'Finance can track asset depreciation for accounting purposes. The system calculates depreciation schedules and provides reports for financial statements.',
        roles: ['finance', 'tenant_admin'],
      },
      {
        title: 'Audit & Compliance',
        description: 'Conduct periodic asset audits, generate asset tracking reports, and ensure all assets are accounted for and properly assigned.',
        roles: ['it_admin', 'finance', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Register New Asset',
        description: 'Add new assets to inventory with details like serial number, category, and value',
        route: '/assets',
        roles: ['it_admin'],
      },
      {
        step: 1,
        title: 'Request an Asset',
        description: 'Submit a request for a new or replacement asset with justification',
        route: '/assets',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Approve Asset Request',
        description: 'Review and approve the asset request from the team member',
        route: '/assets',
        roles: ['manager'],
      },
      {
        step: 3,
        title: 'Assign Asset',
        description: 'Provision the asset, update inventory, and record the assignment',
        route: '/assets',
        roles: ['it_admin'],
      },
      {
        step: 4,
        title: 'Track & Maintain',
        description: 'Track asset condition, schedule maintenance, and update status as needed',
        route: '/assets',
        roles: ['it_admin'],
      },
      {
        step: 5,
        title: 'Asset Return',
        description: 'Process asset return when the employee transfers or separates',
        route: '/assets',
        roles: ['it_admin', 'hr_admin'],
      },
      {
        step: 6,
        title: 'Depreciation & Audit',
        description: 'Calculate asset depreciation and generate audit reports for compliance',
        route: '/reports',
        roles: ['finance', 'it_admin'],
      },
    ],
    workflowTitle: 'Asset Management Lifecycle',
    workflowSubtitle: 'From procurement to disposal—track every company asset',
  },

  // ---------------------------------------------------------------------------
  // DOCUMENTS
  // ---------------------------------------------------------------------------
  documents: {
    moduleKey: 'documents',
    tips: [
      {
        title: 'Upload & Manage Documents',
        description: 'Upload personal documents (ID proofs, certificates, tax forms) to your profile. Documents are encrypted and accessible only to authorized roles.',
        roles: ['employee'],
      },
      {
        title: 'Company Document Repository',
        description: 'Access company-wide documents like policies, handbooks, templates, and forms from the centralized document repository.',
        roles: ['employee'],
      },
      {
        title: 'Document Categories & Access Control',
        description: 'HR admins can organize documents into categories, set access permissions by role, and configure retention policies for compliance.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Digital Signatures & Workflows',
        description: 'Route documents for digital signatures and approvals. Track document status (draft, pending signature, signed, archived) through the workflow.',
        roles: ['hr_admin', 'manager', 'tenant_admin'],
      },
      {
        title: 'Compliance & Expiry Tracking',
        description: 'Set expiry dates on compliance documents (licenses, certifications, work permits). Get automated alerts before documents expire.',
        roles: ['hr_admin', 'it_admin'],
      },
      {
        title: 'Audit Trail',
        description: 'Every document action (upload, view, download, delete) is logged with timestamp and user. Essential for compliance audits and data governance.',
        roles: ['super_admin', 'hr_admin', 'it_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Setup Document Categories',
        description: 'Create document categories and define access permissions for each role',
        route: '/documents',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'Upload Your Documents',
        description: 'Upload required personal documents like ID proofs, certificates, and bank details',
        route: '/documents',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Configure Retention Policies',
        description: 'Set document retention periods and auto-archival rules for compliance',
        route: '/documents',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 3,
        title: 'Request Signatures',
        description: 'Route documents for digital signatures through configured approval workflows',
        route: '/documents',
        roles: ['hr_admin', 'manager'],
      },
      {
        step: 4,
        title: 'Set Expiry Alerts',
        description: 'Configure expiry dates on compliance documents and set up renewal reminders',
        route: '/documents',
        roles: ['hr_admin', 'it_admin'],
      },
      {
        step: 5,
        title: 'Review Audit Trail',
        description: 'Monitor document access logs and ensure compliance with data governance policies',
        route: '/documents',
        roles: ['super_admin', 'hr_admin'],
      },
    ],
    workflowTitle: 'Document Management Workflow',
    workflowSubtitle: 'Securely manage, share, and track organizational documents',
  },

  // ---------------------------------------------------------------------------
  // PROJECTS
  // ---------------------------------------------------------------------------
  projects: {
    moduleKey: 'projects',
    tips: [
      {
        title: 'View Assigned Projects',
        description: 'See all projects you are assigned to, along with your role, allocation percentage, and current task status. Track deadlines and milestones.',
        roles: ['employee'],
      },
      {
        title: 'Project Timesheets',
        description: 'Log your daily work hours against project tasks. Accurate timesheets feed into billing, utilization tracking, and payroll calculations.',
        roles: ['employee', 'manager'],
      },
      {
        title: 'Resource Allocation',
        description: 'Managers can allocate team members to projects, set utilization targets, and identify bench resources. Visual Gantt charts help plan timelines.',
        roles: ['manager', 'hr_admin'],
      },
      {
        title: 'Project Dashboard',
        description: 'Track project health with real-time dashboards showing budget vs actual, milestone progress, risk indicators, and team workload distribution.',
        roles: ['manager', 'tenant_admin'],
      },
      {
        title: 'Client Billing Integration',
        description: 'Map project hours to client billing rates, generate invoices, and track receivables. Timesheet approvals trigger billing events automatically.',
        roles: ['finance', 'manager'],
      },
      {
        title: 'Project Portfolio Management',
        description: 'Super admins and tenant admins can view the entire project portfolio, compare project health metrics, and make strategic resource decisions.',
        roles: ['tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Create Project',
        description: 'Define the project with name, client, timeline, budget, and team structure',
        route: '/projects',
        roles: ['manager', 'tenant_admin'],
      },
      {
        step: 1,
        title: 'View Your Projects',
        description: 'Check your assigned projects, tasks, and allocation details',
        route: '/projects',
        roles: ['employee'],
      },
      {
        step: 2,
        title: 'Allocate Resources',
        description: 'Assign team members with defined roles and allocation percentages',
        route: '/projects',
        roles: ['manager'],
      },
      {
        step: 3,
        title: 'Log Timesheets',
        description: 'Record daily work hours against project tasks and activities',
        route: '/timesheets',
        roles: ['employee'],
      },
      {
        step: 4,
        title: 'Approve Timesheets',
        description: 'Review and approve team timesheets for billing and payroll accuracy',
        route: '/timesheets',
        roles: ['manager'],
      },
      {
        step: 5,
        title: 'Track Milestones',
        description: 'Update project milestones, track progress, and flag risks or delays',
        route: '/projects',
        roles: ['manager'],
      },
      {
        step: 6,
        title: 'Client Billing',
        description: 'Generate invoices based on approved timesheets and billing rates',
        route: '/projects',
        roles: ['finance'],
      },
      {
        step: 7,
        title: 'Project Closure',
        description: 'Close the project, release resources, and generate final reports',
        route: '/projects',
        roles: ['manager', 'tenant_admin'],
      },
    ],
    workflowTitle: 'Project Management Workflow',
    workflowSubtitle: 'Plan, execute, and track projects from inception to closure',
  },

  // ---------------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------------
  settings: {
    moduleKey: 'settings',
    tips: [
      {
        title: 'Profile & Preferences',
        description: 'Update your personal preferences including theme, language, notification settings, and default views. Changes take effect immediately.',
        roles: ['employee'],
      },
      {
        title: 'Role-Based Access Control',
        description: 'Configure role permissions at the module and action level. Define who can view, create, edit, or delete data in each module.',
        roles: ['super_admin', 'tenant_admin'],
      },
      {
        title: 'Workflow & Approval Configuration',
        description: 'Set up multi-level approval workflows for leave, expenses, travel, and other requests. Configure delegation rules for when approvers are away.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Email & Notification Templates',
        description: 'Customize email and notification templates for various events (welcome email, leave approval, payroll notification, etc.) with your branding.',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        title: 'Integration Settings',
        description: 'Configure third-party integrations (SSO, biometric devices, accounting software, job portals) from the integration settings panel.',
        roles: ['it_admin', 'super_admin'],
      },
      {
        title: 'System Configuration',
        description: 'Super admins manage global system settings including tenant management, data retention, audit logging levels, and feature flags.',
        roles: ['super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Set Personal Preferences',
        description: 'Configure your theme, language, notifications, and display preferences',
        route: '/settings',
        roles: ['employee'],
      },
      {
        step: 1,
        title: 'Manage RBAC',
        description: 'Review and configure role permissions for each module and action',
        route: '/settings',
        roles: ['super_admin', 'tenant_admin'],
      },
      {
        step: 2,
        title: 'Configure Approval Workflows',
        description: 'Set up multi-level approval chains and delegation rules for requests',
        route: '/settings',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 3,
        title: 'Customize Templates',
        description: 'Edit email and notification templates with company branding',
        route: '/settings',
        roles: ['hr_admin', 'tenant_admin'],
      },
      {
        step: 4,
        title: 'Setup Integrations',
        description: 'Connect third-party services like SSO, biometric devices, and accounting tools',
        route: '/settings',
        roles: ['it_admin', 'super_admin'],
      },
      {
        step: 5,
        title: 'Review Audit Logs',
        description: 'Check audit logs for system configuration changes and access events',
        route: '/settings',
        roles: ['super_admin', 'it_admin'],
      },
      {
        step: 6,
        title: 'Test Configuration',
        description: 'Verify all settings work as expected by testing workflows and permissions',
        route: '/settings',
        roles: ['super_admin', 'tenant_admin', 'it_admin'],
      },
    ],
    workflowTitle: 'System Settings Configuration',
    workflowSubtitle: 'Configure preferences, permissions, and integrations for your organization',
  },

  // ---------------------------------------------------------------------------
  // REPORTS
  // ---------------------------------------------------------------------------
  reports: {
    moduleKey: 'reports',
    tips: [
      {
        title: 'Pre-Built Report Library',
        description: 'Access a library of pre-built HR, payroll, attendance, and compliance reports. Filter by date range, department, location, and employee status.',
        roles: ['hr_admin', 'finance', 'tenant_admin', 'super_admin'],
      },
      {
        title: 'View Personal Reports',
        description: 'Access your own attendance summary, leave history, payslip archive, and tax documents from the reports section.',
        roles: ['employee'],
      },
      {
        title: 'Team Performance Reports',
        description: 'Generate team-level performance reports showing goal completion, review scores, and development progress for your reportees.',
        roles: ['manager'],
      },
      {
        title: 'Custom Report Builder',
        description: 'Create custom reports by selecting data fields, filters, grouping, and chart types. Save custom reports for reuse and schedule automated generation.',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
      {
        title: 'Compliance & Statutory Reports',
        description: 'Generate statutory compliance reports including PF ECR, ESI, TDS, Professional Tax, and labor law returns for government filing.',
        roles: ['finance', 'hr_admin'],
      },
      {
        title: 'AI-Powered Insights',
        description: 'Use AI to automatically surface anomalies, trends, and recommendations from your HR data. Ask questions in natural language for instant analysis.',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowSteps: [
      {
        step: 1,
        title: 'Browse Report Categories',
        description: 'Navigate to Reports and browse available categories (HR, Payroll, Attendance, etc.)',
        route: '/reports',
      },
      {
        step: 2,
        title: 'Select Report Type',
        description: 'Choose from pre-built reports or start a custom report from scratch',
        route: '/reports',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
      {
        step: 2,
        title: 'View Personal Reports',
        description: 'Access your individual attendance, leave, and payroll reports',
        route: '/reports',
        roles: ['employee'],
      },
      {
        step: 3,
        title: 'Apply Filters',
        description: 'Set date range, department, location, and other filters to narrow down data',
        route: '/reports',
      },
      {
        step: 4,
        title: 'Generate & Preview',
        description: 'Run the report and preview results with interactive charts and tables',
        route: '/reports',
        roles: ['hr_admin', 'finance', 'manager'],
      },
      {
        step: 5,
        title: 'Export & Share',
        description: 'Export reports as PDF, Excel, or CSV and share with stakeholders',
        route: '/reports',
        roles: ['hr_admin', 'finance', 'tenant_admin', 'super_admin'],
      },
      {
        step: 6,
        title: 'Schedule Recurring Reports',
        description: 'Set up automated report generation on a daily, weekly, or monthly schedule',
        route: '/reports',
        roles: ['hr_admin', 'finance', 'tenant_admin'],
      },
      {
        step: 7,
        title: 'AI Analysis',
        description: 'Use AI-powered insights to identify trends, anomalies, and recommendations',
        route: '/reports',
        roles: ['hr_admin', 'tenant_admin', 'super_admin'],
      },
    ],
    workflowTitle: 'Reporting & Analytics Workflow',
    workflowSubtitle: 'Generate, customize, and schedule reports for data-driven decisions',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tips filtered for a specific module and role.
 * Returns tips where:
 * - The `roles` array is undefined (applies to all roles), OR
 * - The `roles` array includes the user's role
 */
export function getTipsForRole(moduleKey: string, role: string): ModuleTip[] {
  const config = roleTipsConfig[moduleKey];
  if (!config) return [];

  return config.tips.filter(
    (tip) => tip.roles === undefined || tip.roles.includes(role)
  );
}

/**
 * Get workflow steps filtered for a specific module and role.
 * Returns steps where:
 * - The `roles` array is undefined (applies to all roles), OR
 * - The `roles` array includes the user's role
 */
export function getWorkflowForRole(moduleKey: string, role: string): WorkflowStep[] {
  const config = roleTipsConfig[moduleKey];
  if (!config) return [];

  return config.workflowSteps.filter(
    (step) => step.roles === undefined || step.roles.includes(role)
  );
}

/**
 * Get the full configuration for a module including role-filtered tips and workflow.
 */
export function getConfigForRole(moduleKey: string, role: string): RoleTipsConfig | null {
  const config = roleTipsConfig[moduleKey];
  if (!config) return null;

  return {
    ...config,
    tips: getTipsForRole(moduleKey, role),
    workflowSteps: getWorkflowForRole(moduleKey, role),
  };
}

/**
 * Get all module keys that have role-specific configurations.
 */
export function getAllModuleKeys(): string[] {
  return Object.keys(roleTipsConfig);
}

/**
 * Check if a module has configuration for a specific role.
 */
export function hasConfigForRole(moduleKey: string, role: string): boolean {
  const config = roleTipsConfig[moduleKey];
  if (!config) return false;

  const hasTips = config.tips.some(
    (tip) => tip.roles === undefined || tip.roles.includes(role)
  );
  const hasSteps = config.workflowSteps.some(
    (step) => step.roles === undefined || step.roles.includes(role)
  );

  return hasTips || hasSteps;
}
