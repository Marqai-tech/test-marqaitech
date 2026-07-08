'use client';

import { useState, useMemo, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FiHome,
  FiGrid,
  FiUser,
  FiUsers,
  FiBriefcase,
  FiUserPlus,
  FiClock,
  FiCalendar,
  FiDollarSign,
  FiTrendingUp,
  FiBookOpen,
  FiPackage,
  FiFileText,
  FiMap,
  FiCreditCard,
  FiWatch,
  FiAlertCircle,
  FiLogOut,
  FiBell,
  FiSettings,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiShield,
  FiHelpCircle,
  FiFolder,
  FiGlobe,
  FiTruck,
  FiClipboard,
  FiStar,
  FiPercent,
  FiGitBranch,
  FiMessageCircle,
  FiBarChart2,
  FiHeart,
  FiTarget,
  FiZap,
  FiServer,
  FiSearch,
  FiCpu,
  FiLayers,
  FiLock,
  FiVideo,
  FiHardDrive,
  FiPlayCircle,
  FiRefreshCw,
  FiGift,
  FiMapPin,
  FiActivity,
  FiShoppingBag,
  FiShoppingCart,
  FiDatabase,
  FiEdit3,
  FiCheckSquare,
  FiUserCheck,
  FiBook,
  FiFile,
  FiMail,
  FiMonitor,
  FiHeadphones,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { canRoleAccessModule } from '@/lib/roleAccess';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  moduleKey?: string;
  isNew?: boolean;
}

interface NavSection {
  key: string;
  label: string;
  sectionIcon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

// Pinned items always visible at the top of the sidebar (Home + Dashboard + Modules)
const PINNED_ITEMS: NavItem[] = [
  { label: 'Home', href: '/home', icon: <FiHome className="w-5 h-5" /> },
  { label: 'Dashboard', href: '/dashboard', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'dashboard' },
  { label: 'Modules', href: '/modules', icon: <FiGrid className="w-5 h-5" /> },
];

// Routes where the module picker is shown — no module auto-selected
const PICKER_ROUTES = ['/', '/home', '/dashboard', '/dashboards', '/accounts', '/crm', '/it-admin', '/project-management', '/modules'];

const navSections: NavSection[] = [
  {
    key: 'super-admin',
    sectionIcon: FiShield,
    label: 'Super Admin (Platform)',
    items: [
      { label: 'Dashboard', href: '/super-admin', icon: <FiGrid className="w-5 h-5" />, roles: ['super_admin'] },
      { label: 'Companies', href: '/super-admin', icon: <FiBriefcase className="w-5 h-5" />, roles: ['super_admin'] },
      { label: 'Subscriptions', href: '/super-admin/subscriptions', icon: <FiCreditCard className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Packages', href: '/super-admin/packages', icon: <FiPackage className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Domain', href: '/super-admin/domain', icon: <FiGlobe className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Purchase Transaction', href: '/super-admin/purchase-transactions', icon: <FiDollarSign className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Tenant Usage Metrics', href: '/super-admin/tenant-usage', icon: <FiBarChart2 className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Tenant Support Tickets', href: '/super-admin/tenant-tickets', icon: <FiHelpCircle className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Tickets', href: '/super-admin/tickets', icon: <FiHelpCircle className="w-5 h-5" />, roles: ['super_admin'] },
      { label: 'Feature Flags', href: '/super-admin/feature-flags', icon: <FiZap className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Storage Quotas', href: '/super-admin/storage-quotas', icon: <FiHardDrive className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'SSO Providers', href: '/super-admin/sso-providers', icon: <FiLock className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Collaboration Features', href: '/super-admin/collab-features', icon: <FiZap className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Audit Logs', href: '/super-admin/audit-logs', icon: <FiLock className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'Trial Requests', href: '/super-admin/trial-requests', icon: <FiZap className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
      { label: 'RBAC Management', href: '/super-admin/rbac', icon: <FiLock className="w-5 h-5" />, roles: ['super_admin'] },
      { label: 'AI Admin Console', href: '/ai-admin', icon: <FiZap className="w-5 h-5" />, roles: ['super_admin'], isNew: true },
    ],
  },
  {
    key: 'tenant-admin',
    sectionIcon: FiServer,
    label: 'Tenant Admin (Group)',
    items: [
      { label: 'Admin Dashboard', href: '/dashboards/admin', icon: <FiGrid className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Tenant Admin Console', href: '/tenant-admin', icon: <FiServer className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Sub-Companies', href: '/tenant-admin/companies', icon: <FiBriefcase className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Group Companies (read-only)', href: '/tenant-admin/group-companies', icon: <FiLayers className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Company RBAC', href: '/tenant-admin/rbac', icon: <FiLock className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Profile Configuration', href: '/tenant-admin/profile-config', icon: <FiSettings className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Storage Analytics', href: '/tenant-admin/storage-analytics', icon: <FiBarChart2 className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Communication Governance', href: '/tenant-admin/comm-governance', icon: <FiMessageCircle className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
      { label: 'AI Admin Console', href: '/ai-admin', icon: <FiZap className="w-5 h-5" />, roles: ['tenant_admin'], isNew: true },
    ],
  },
  {
    key: 'core-hr',
    label: 'Core HR',
    sectionIcon: FiUsers,
    items: [
      { label: 'HR Dashboard', href: '/dashboards/hr', icon: <FiGrid className="w-5 h-5" />, isNew: true },
      { label: 'My Profile', href: '/my-profile', icon: <FiUser className="w-5 h-5" /> },
      { label: 'Employee Dashboard', href: '/dashboards/employee', icon: <FiGrid className="w-5 h-5" />, isNew: true },
      { label: 'Employees', href: '/employees', icon: <FiUsers className="w-5 h-5" />, moduleKey: 'employees' },
      { label: 'Company Management', href: '/company', icon: <FiLayers className="w-5 h-5" />, moduleKey: 'company' },
    ],
  },
  {
    key: 'talent-acquisition',
    sectionIcon: FiBriefcase,
    label: 'Talent Acquisition',
    items: [
      { label: 'Recruitment Dashboard', href: '/dashboards/recruitment', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'recruitment', isNew: true },
      { label: 'Recruitment', href: '/recruitment', icon: <FiBriefcase className="w-5 h-5" />, moduleKey: 'recruitment' },
      { label: 'Requisitions', href: '/requisitions', icon: <FiClipboard className="w-5 h-5" />, moduleKey: 'recruitment' },
      { label: 'Offers', href: '/offers', icon: <FiStar className="w-5 h-5" />, moduleKey: 'recruitment' },
      { label: 'Job Portal', href: '/job-portal', icon: <FiSearch className="w-5 h-5" />, moduleKey: 'recruitment' },
      { label: 'AI Interview', href: '/ai-interview', icon: <FiCpu className="w-5 h-5" />, moduleKey: 'recruitment' },
      { label: 'Candidate Flow Analytics', href: '/analytics/candidate-flow', icon: <FiBarChart2 className="w-5 h-5" />, moduleKey: 'recruitment', isNew: true },
    ],
  },
  {
    key: 'employee-lifecycle',
    sectionIcon: FiUserPlus,
    label: 'Employee Lifecycle',
    items: [
      { label: 'Onboarding', href: '/onboarding', icon: <FiUserPlus className="w-5 h-5" />, moduleKey: 'onboarding' },
      { label: 'Preboarding', href: '/preboarding', icon: <FiUserPlus className="w-5 h-5" />, moduleKey: 'onboarding', isNew: true },
      { label: 'Separation', href: '/separation', icon: <FiLogOut className="w-5 h-5" />, moduleKey: 'separation' },
      { label: 'F&F Settlement', href: '/fnf', icon: <FiTruck className="w-5 h-5" />, moduleKey: 'separation' },
    ],
  },
  {
    key: 'attendance',
    sectionIcon: FiClock,
    label: 'Attendance',
    items: [
      { label: 'Attendance Dashboard', href: '/dashboards/attendance', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'attendance', isNew: true },
      { label: 'Attendance', href: '/attendance', icon: <FiClock className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Regularization', href: '/attendance/regularize', icon: <FiRefreshCw className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Hourly Permission', href: '/attendance/permission', icon: <FiClock className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Gatepass', href: '/attendance/gatepass', icon: <FiShield className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Overtime Requests', href: '/attendance/overtime', icon: <FiClock className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Comp-Off Balance', href: '/attendance/comp-off', icon: <FiGift className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Geofences', href: '/attendance/geofence', icon: <FiMapPin className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Biometric Devices', href: '/attendance/biometric', icon: <FiShield className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Burnout Analytics', href: '/attendance/burnout', icon: <FiActivity className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Audit Trail', href: '/attendance/audit-log', icon: <FiLock className="w-5 h-5" />, moduleKey: 'attendance' },
      { label: 'Policy Config', href: '/attendance/policy-config', icon: <FiSettings className="w-5 h-5" />, moduleKey: 'attendance' },
    ],
  },
  {
    key: 'leave',
    sectionIcon: FiCalendar,
    label: 'Leave',
    items: [
      { label: 'Leave Management', href: '/leave', icon: <FiCalendar className="w-5 h-5" />, moduleKey: 'leave' },
      { label: 'Leave Encashment', href: '/leave/encashment', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'leave' },
      { label: 'Optional Holidays', href: '/leave/optional-holidays', icon: <FiCalendar className="w-5 h-5" />, moduleKey: 'leave' },
    ],
  },
  {
    key: 'timesheet',
    sectionIcon: FiWatch,
    label: 'Timesheets',
    items: [
      { label: 'Timesheets', href: '/timesheets', icon: <FiWatch className="w-5 h-5" />, moduleKey: 'attendance' },
    ],
  },
  {
    key: 'compensation',
    sectionIcon: FiDollarSign,
    label: 'Compensation',
    items: [
      { label: 'Payroll Dashboard', href: '/dashboards/payroll', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll', href: '/payroll', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'payroll' },
      { label: 'CTC Templates', href: '/payroll/ctc-templates', icon: <FiLayers className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'CTC Calculator', href: '/payroll/ctc-calculator', icon: <FiPercent className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Component Master', href: '/payroll/components', icon: <FiDatabase className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Salary Settings', href: '/payroll/salary-settings', icon: <FiEdit3 className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Definitions', href: '/payroll/definitions', icon: <FiClipboard className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Income Tax', href: '/payroll/income-tax', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Tax Slabs', href: '/payroll/tax-slabs', icon: <FiBarChart2 className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Statutory Components', href: '/payroll/statutory', icon: <FiShield className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Gratuity', href: '/payroll/gratuity', icon: <FiTruck className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Inputs', href: '/payroll/inputs', icon: <FiEdit3 className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Pre-Payroll Validation', href: '/payroll/validations', icon: <FiCheckSquare className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Processing', href: '/payroll/processing', icon: <FiPlayCircle className="w-5 h-5" />, moduleKey: 'payroll' },
      { label: 'Overtime', href: '/payroll/overtime', icon: <FiActivity className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Loans', href: '/payroll/loans', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'F&F Settlement', href: '/payroll/fnf', icon: <FiTruck className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Holds', href: '/payroll/holds', icon: <FiLock className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Currency & FX', href: '/payroll/currency', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Dimensions', href: '/payroll/dimensions', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Cross-Border Secondment', href: '/payroll/secondment', icon: <FiGlobe className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Group Dashboard', href: '/payroll/group-dashboard', icon: <FiGlobe className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Compliance Calendar', href: '/payroll/compliance', icon: <FiCalendar className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'GL Mapping', href: '/payroll/gl-mapping', icon: <FiBook className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Bank File Generation', href: '/payroll/bank-files', icon: <FiFile className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Reports', href: '/payroll/reports', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payment Methods', href: '/payroll/payment-methods', icon: <FiCreditCard className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payslips', href: '/payroll/payslips', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'payroll' },
      { label: 'Payroll Approvals', href: '/payroll/approvals', icon: <FiUserCheck className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
      { label: 'AI Insights', href: '/payroll/ai-insights', icon: <FiCpu className="w-5 h-5" />, moduleKey: 'payroll', isNew: true },
    ],
  },
  {
    key: 'performance-growth',
    sectionIcon: FiTrendingUp,
    label: 'Performance & Growth',
    items: [
      { label: 'Performance', href: '/performance', icon: <FiTrendingUp className="w-5 h-5" />, moduleKey: 'performance' },
      { label: 'OKR Cascade', href: '/okrs', icon: <FiTarget className="w-5 h-5" />, moduleKey: 'performance', isNew: true },
      { label: 'Training', href: '/training', icon: <FiBookOpen className="w-5 h-5" />, moduleKey: 'training' },
      { label: 'Engagement', href: '/engagement', icon: <FiHeart className="w-5 h-5" />, moduleKey: 'engagement', isNew: true },
      { label: 'Succession Planning', href: '/succession', icon: <FiTarget className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'admin'], isNew: true },
    ],
  },
  {
    key: 'accounts-finance',
    sectionIcon: FiDollarSign,
    label: 'Accounts & Finance',
    items: [
      { label: 'Accounts Hub', href: '/accounts', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Chart of Accounts', href: '/accounts/chart-of-accounts', icon: <FiBookOpen className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Journal Entries', href: '/accounts/journal-entries', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Invoices (AR)', href: '/accounts/invoices', icon: <FiCreditCard className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Bills (AP)', href: '/accounts/bills', icon: <FiCreditCard className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Bank Reconciliation', href: '/accounts/bank-reconciliation', icon: <FiRefreshCw className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
      { label: 'Financial Reports', href: '/accounts/reports', icon: <FiBarChart2 className="w-5 h-5" />, moduleKey: 'accounts', isNew: true },
    ],
  },
  {
    key: 'operations',
    sectionIcon: FiFolder,
    label: 'Operations',
    items: [
      { label: 'Travel', href: '/travel', icon: <FiMap className="w-5 h-5" />, moduleKey: 'travel' },
      { label: 'Expenses', href: '/expenses', icon: <FiCreditCard className="w-5 h-5" />, moduleKey: 'expenses' },
      { label: 'Documents', href: '/documents', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'docs' },
    ],
  },
  {
    key: 'project-management',
    sectionIcon: FiFolder,
    label: 'Project Management',
    items: [
      { label: 'PM Dashboard', href: '/project-management', icon: <FiGrid className="w-5 h-5" />, moduleKey: 'projects', isNew: true },
      { label: 'Projects', href: '/projects', icon: <FiFolder className="w-5 h-5" />, moduleKey: 'projects' },
      { label: 'Utilization', href: '/projects/utilization', icon: <FiTrendingUp className="w-5 h-5" />, isNew: true },
    ],
  },
  {
    key: 'assets-it',
    sectionIcon: FiPackage,
    label: 'Assets & IT',
    items: [
      { label: 'Assets', href: '/assets', icon: <FiPackage className="w-5 h-5" />, moduleKey: 'assets' },
      { label: 'IT Admin Console', href: '/it-admin', icon: <FiMonitor className="w-5 h-5" />, moduleKey: 'it_admin_module', isNew: true },
    ],
  },
  {
    key: 'crm',
    sectionIcon: FiTarget,
    label: 'CRM & Sales',
    items: [
      { label: 'CRM Dashboard', href: '/crm', icon: <FiTarget className="w-5 h-5" />, moduleKey: 'crm', isNew: true },
      { label: 'Contacts', href: '/crm/contacts', icon: <FiUsers className="w-5 h-5" />, moduleKey: 'crm', isNew: true },
      { label: 'Deals', href: '/crm/deals', icon: <FiBriefcase className="w-5 h-5" />, moduleKey: 'crm', isNew: true },
      { label: 'Leads', href: '/crm/leads', icon: <FiUserPlus className="w-5 h-5" />, moduleKey: 'crm', isNew: true },
    ],
  },
  {
    key: 'external-relations',
    sectionIcon: FiGlobe,
    label: 'External Relations',
    items: [
      { label: 'Clients', href: '/clients', icon: <FiGlobe className="w-5 h-5" />, moduleKey: 'company' },
      { label: 'SOWs', href: '/clients/sow', icon: <FiFileText className="w-5 h-5" />, moduleKey: 'company', isNew: true },
      { label: 'Client Insights', href: '/clients/insights', icon: <FiTrendingUp className="w-5 h-5" />, moduleKey: 'company', isNew: true },
      { label: 'Vendors', href: '/vendors', icon: <FiTruck className="w-5 h-5" />, moduleKey: 'company' },
      { label: 'Vendor Compliance', href: '/vendors/compliance', icon: <FiShield className="w-5 h-5" />, moduleKey: 'company', isNew: true },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: <FiCreditCard className="w-5 h-5" />, moduleKey: 'company', isNew: true },
      { label: 'Vendor Invoices (AP)', href: '/vendor-invoices', icon: <FiDollarSign className="w-5 h-5" />, moduleKey: 'company', isNew: true },
    ],
  },
  {
    key: 'marketplace',
    sectionIcon: FiShoppingBag,
    label: 'Marketplace & Wellness',
    items: [
      { label: 'Marketplace Hub', href: '/marketplace', icon: <FiShoppingBag className="w-5 h-5" />, isNew: true },
      { label: 'My Wallet', href: '/marketplace/wallet', icon: <FiCreditCard className="w-5 h-5" />, isNew: true },
      { label: 'Corporate Catalog', href: '/marketplace/catalog', icon: <FiShoppingCart className="w-5 h-5" />, isNew: true },
      { label: 'Insurance Top-Up', href: '/marketplace/insurance', icon: <FiShield className="w-5 h-5" />, isNew: true },
      { label: 'Earned Wage Access', href: '/marketplace/ewa', icon: <FiDollarSign className="w-5 h-5" />, isNew: true },
      { label: 'Loan Marketplace', href: '/marketplace/loans', icon: <FiBriefcase className="w-5 h-5" />, isNew: true },
      { label: 'Gifting & Rewards', href: '/marketplace/gifting', icon: <FiGift className="w-5 h-5" />, isNew: true },
      { label: 'AI Insights', href: '/marketplace/insights', icon: <FiTrendingUp className="w-5 h-5" />, isNew: true },
    ],
  },
  {
    key: 'support-intelligence',
    sectionIcon: FiHelpCircle,
    label: 'Support & Intelligence',
    items: [
      { label: 'Helpdesk', href: '/helpdesk', icon: <FiHelpCircle className="w-5 h-5" />, moduleKey: 'helpdesk' },
      { label: 'Grievances', href: '/grievances', icon: <FiAlertCircle className="w-5 h-5" />, moduleKey: 'grievances' },
      { label: 'AI Assistant', href: '/ai-assistant', icon: <FiMessageCircle className="w-5 h-5" /> },
    ],
  },
  {
    key: 'collaboration',
    sectionIcon: FiMessageCircle,
    label: 'Collaboration Hub',
    items: [
      { label: 'Hub Home', href: '/collaboration', icon: <FiUsers className="w-5 h-5" />, isNew: true },
      { label: 'Chat', href: '/collaboration/chat', icon: <FiMessageCircle className="w-5 h-5" />, isNew: true },
      { label: 'Calls', href: '/collaboration/calls', icon: <FiVideo className="w-5 h-5" />, isNew: true },
      { label: 'Calendar', href: '/calendar', icon: <FiCalendar className="w-5 h-5" />, isNew: true },
      { label: 'Email', href: '/email', icon: <FiMail className="w-5 h-5" />, isNew: true },
      { label: 'To Do', href: '/todo', icon: <FiCheckSquare className="w-5 h-5" />, isNew: true },
      { label: 'Notes', href: '/notes', icon: <FiEdit3 className="w-5 h-5" />, isNew: true },
      { label: 'Social Feed', href: '/social-feed', icon: <FiUsers className="w-5 h-5" />, isNew: true },
      { label: 'File Manager', href: '/file-manager', icon: <FiFolder className="w-5 h-5" />, isNew: true },
      { label: 'Kanban Board', href: '/kanban', icon: <FiLayers className="w-5 h-5" />, isNew: true },
      { label: 'Invoices', href: '/invoices', icon: <FiFileText className="w-5 h-5" />, isNew: true },
    ],
  },
  {
    key: 'knowledge-base',
    sectionIcon: FiBookOpen,
    label: 'Knowledge Base',
    items: [
      { label: 'Documentation Hub', href: '/docs', icon: <FiBookOpen className="w-5 h-5" />, moduleKey: 'docs', isNew: true },
    ],
  },
  {
    key: 'governance',
    sectionIcon: FiSettings,
    label: 'Governance',
    items: [
      { label: 'Workflows', href: '/workflows', icon: <FiGitBranch className="w-5 h-5" />, moduleKey: 'settings' },
      { label: 'Reports & Analytics', href: '/reports', icon: <FiBarChart2 className="w-5 h-5" />, moduleKey: 'reports' },
      { label: 'Scheduled Reports', href: '/reports/schedules', icon: <FiBarChart2 className="w-5 h-5" />, isNew: true },
      { label: 'AI Insights', href: '/insights', icon: <FiTrendingUp className="w-5 h-5" />, isNew: true },
      { label: 'Settings & Configuration', href: '/settings', icon: <FiSettings className="w-5 h-5" />, moduleKey: 'settings' },
      { label: 'Notifications', href: '/notifications', icon: <FiBell className="w-5 h-5" /> },
    ],
  },
];

// Export for ModuleStrip to use
export { navSections };

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobileMenu?: boolean;
  currentModuleKey: string | null;
  onModuleSelect: (key: string | null) => void;
}

export default function Sidebar({ collapsed, onToggle, isMobileMenu = false, currentModuleKey, onModuleSelect }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const userRole = user?.role || 'admin';

  // Filter sections based on user role
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => {
            if (item.moduleKey) {
              return canRoleAccessModule(userRole, item.moduleKey);
            }
            return !item.roles || item.roles.includes(userRole);
          }
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [userRole]);

  // Filter pinned items based on role
  const visiblePinnedItems = useMemo(() => {
    return PINNED_ITEMS.filter((item) => {
      if (item.moduleKey) return canRoleAccessModule(userRole, item.moduleKey);
      return !item.roles || item.roles.includes(userRole);
    });
  }, [userRole]);

  // Find the current section
  const currentSection = currentModuleKey
    ? filteredSections.find((s) => s.key === currentModuleKey)
    : null;

  // Auto-detect active item
  const isItemActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside
      className={`${isMobileMenu ? 'w-full' : 'fixed left-0 top-0 h-full'} bg-thb-sidebar-bg flex flex-col transition-all duration-300 ease-in-out z-40 ${
        isMobileMenu ? '' : collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      {!isMobileMenu && (
        <div className={`flex items-center h-14 px-4 border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            <svg viewBox="0 0 35 11" className="w-4 h-3" fill="none">
              <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
              <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
              <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-base font-bold text-white tracking-tight whitespace-nowrap">
                3Boxes <span className="text-[10px] font-semibold text-blue-300 tracking-wider">HRMS</span>
              </h1>
              <p className="text-[9px] text-thb-sidebar-text leading-none -mt-0.5">People &middot; Process &middot; Technology</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        {/* Pinned items: Home + Dashboard (always visible) */}
        <ul className="space-y-0.5 mb-2">
          {visiblePinnedItems.map((item) => {
            const isActive = isItemActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => {
                    onModuleSelect(null);
                    if (isMobileMenu) onToggle();
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                    isActive
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'text-thb-sidebar-text hover:bg-thb-sidebar-hover hover:text-slate-200'
                  } ${collapsed ? 'justify-center' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                  )}
                  <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-thb-sidebar-text hover:text-slate-200'} transition-colors`}>
                    {item.icon}
                  </span>
                  {!collapsed && <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mx-3 my-2 border-t border-white/[0.06]" />

        {/* Selected Module Submenu */}
        {!collapsed && currentSection ? (
          <div className="min-w-0">
            {/* Section header with back button */}
            <div className="px-3 py-2 mb-1">
              <div className="flex items-center gap-2">
                {(() => {
                  const SectionIcon = currentSection.sectionIcon;
                  return <SectionIcon className="w-4 h-4 text-blue-400" />;
                })()}
                <span className="text-[10px] font-bold uppercase tracking-widest text-thb-sidebar-text/80 flex-1">
                  {currentSection.label}
                </span>
                <button
                  onClick={() => onModuleSelect(null)}
                  className="p-1 rounded text-thb-sidebar-text/50 hover:text-slate-200 hover:bg-thb-sidebar-hover transition-colors"
                  title="Back to module list"
                >
                  <FiChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Section items */}
            <ul className="space-y-0.5">
              {currentSection.items.map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => { if (isMobileMenu) onToggle(); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'text-thb-sidebar-text hover:bg-thb-sidebar-hover hover:text-slate-200'
                      }`}
                      title={item.label}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
                      )}
                      <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-thb-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>
                      {item.isNew && (
                        <span className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          NEW
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : !collapsed ? (
          /* No module selected — show instruction */
          <div className="px-3 py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
              <FiGrid className="w-5 h-5 text-thb-sidebar-text/30" />
            </div>
            <p className="text-[11px] text-thb-sidebar-text/50 font-medium mb-1">Select a Module</p>
            <p className="text-[9px] text-thb-sidebar-text/30 leading-relaxed">
              Click any module icon on the right to see its sub-sections here
            </p>
          </div>
        ) : null}

        {/* When collapsed, show just the active section icon */}
        {collapsed && currentSection && (
          <div className="flex flex-col items-center py-2">
            {(() => {
              const SectionIcon = currentSection.sectionIcon;
              return (
                <button
                  onClick={() => onModuleSelect(null)}
                  className="p-2 rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 hover:bg-blue-500/25 transition-colors"
                  title={currentSection.label}
                >
                  <SectionIcon className="w-5 h-5" />
                </button>
              );
            })()}
          </div>
        )}
      </nav>

      {/* Bottom Section: User Info + Collapse Toggle */}
      {!isMobileMenu && (
      <div className="border-t border-white/[0.06]">
        {/* User Info */}
        <div className={`flex items-center p-3 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ring-2 ring-white/10">
              {user?.name ? getInitials(user.name) : '??'}
            </div>
          )}
          {!collapsed && user && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user.name}</p>
              <p className="text-[10px] text-thb-sidebar-text truncate capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-thb-sidebar-text hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <FiLogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 text-thb-sidebar-text hover:text-slate-300 hover:bg-white/[0.03] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <FiChevronRight className="w-4 h-4" />
          ) : (
            <FiChevronLeft className="w-4 h-4" />
          )}
        </button>

        {/* Proud Product Branding */}
        {!collapsed && (
          <div className="px-3 pb-2 pt-1 text-center">
            <div className="flex items-center justify-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user?.tenant?.logo || '/marq-ai-logo.png'} alt="Marq AI" className="w-3.5 h-3.5 rounded object-contain" />
              <span className="text-[8px] text-thb-sidebar-text whitespace-nowrap">A Proud Product of Marq AI Tech Pvt Ltd</span>
            </div>
          </div>
        )}
      </div>
      )}
    </aside>
  );
}
