'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  FiUsers, FiBriefcase, FiUserPlus, FiClock, FiCalendar,
  FiDollarSign, FiTrendingUp, FiFolder, FiPackage,
  FiGlobe, FiHelpCircle, FiMessageCircle, FiBookOpen,
  FiSettings, FiShield, FiServer, FiWatch, FiTarget,
  FiShoppingBag, FiGrid, FiSearch, FiArrowRight,
  FiChevronRight,
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
  sectionColor: string;
  items: NavItem[];
}

interface ModuleGroup {
  groupLabel: string;
  groupDescription: string;
  sections: NavSection[];
}

const SECTION_COLORS: Record<string, string> = {
  'super-admin': 'from-red-500 to-rose-600',
  'tenant-admin': 'from-orange-500 to-amber-600',
  'core-hr': 'from-blue-500 to-indigo-600',
  'talent-acquisition': 'from-purple-500 to-violet-600',
  'employee-lifecycle': 'from-emerald-500 to-teal-600',
  'attendance': 'from-cyan-500 to-sky-600',
  'leave': 'from-teal-500 to-cyan-600',
  'timesheet': 'from-sky-500 to-blue-600',
  'compensation': 'from-green-500 to-emerald-600',
  'performance-growth': 'from-amber-500 to-yellow-600',
  'accounts-finance': 'from-lime-500 to-green-600',
  'operations': 'from-orange-500 to-red-600',
  'project-management': 'from-fuchsia-500 to-pink-600',
  'assets-it': 'from-slate-500 to-gray-600',
  'crm': 'from-pink-500 to-rose-600',
  'external-relations': 'from-indigo-500 to-blue-600',
  'marketplace': 'from-violet-500 to-purple-600',
  'support-intelligence': 'from-yellow-500 to-orange-600',
  'collaboration': 'from-teal-500 to-emerald-600',
  'knowledge-base': 'from-blue-500 to-cyan-600',
  'governance': 'from-gray-500 to-slate-600',
};

const navSections: NavSection[] = [
  {
    key: 'super-admin', sectionIcon: FiShield, label: 'Super Admin', sectionColor: SECTION_COLORS['super-admin'],
    items: [
      { label: 'Dashboard', href: '/super-admin', icon: <FiGrid className="w-4 h-4" />, roles: ['super_admin'] },
      { label: 'Companies', href: '/super-admin', icon: <FiBriefcase className="w-4 h-4" />, roles: ['super_admin'] },
      { label: 'Subscriptions', href: '/super-admin/subscriptions', icon: <FiDollarSign className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Packages', href: '/super-admin/packages', icon: <FiPackage className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Domain', href: '/super-admin/domain', icon: <FiGlobe className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Purchase Transaction', href: '/super-admin/purchase-transactions', icon: <FiDollarSign className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Tenant Usage', href: '/super-admin/tenant-usage', icon: <FiTrendingUp className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Tenant Tickets', href: '/super-admin/tenant-tickets', icon: <FiHelpCircle className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Feature Flags', href: '/super-admin/feature-flags', icon: <FiSettings className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Storage Quotas', href: '/super-admin/storage-quotas', icon: <FiPackage className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'SSO Providers', href: '/super-admin/sso-providers', icon: <FiShield className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Collaboration Features', href: '/super-admin/collab-features', icon: <FiMessageCircle className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Audit Logs', href: '/super-admin/audit-logs', icon: <FiShield className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'Trial Requests', href: '/super-admin/trial-requests', icon: <FiBriefcase className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
      { label: 'RBAC Management', href: '/super-admin/rbac', icon: <FiShield className="w-4 h-4" />, roles: ['super_admin'] },
      { label: 'AI Admin Console', href: '/ai-admin', icon: <FiSettings className="w-4 h-4" />, roles: ['super_admin'], isNew: true },
    ],
  },
  {
    key: 'tenant-admin', sectionIcon: FiServer, label: 'Tenant Admin', sectionColor: SECTION_COLORS['tenant-admin'],
    items: [
      { label: 'Admin Dashboard', href: '/dashboards/admin', icon: <FiServer className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Tenant Console', href: '/tenant-admin', icon: <FiServer className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Sub-Companies', href: '/tenant-admin/companies', icon: <FiBriefcase className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Group Companies', href: '/tenant-admin/group-companies', icon: <FiFolder className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Company RBAC', href: '/tenant-admin/rbac', icon: <FiShield className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Profile Config', href: '/tenant-admin/profile-config', icon: <FiSettings className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Storage Analytics', href: '/tenant-admin/storage-analytics', icon: <FiPackage className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'Comm Governance', href: '/tenant-admin/comm-governance', icon: <FiMessageCircle className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
      { label: 'AI Admin Console', href: '/ai-admin', icon: <FiSettings className="w-4 h-4" />, roles: ['tenant_admin'], isNew: true },
    ],
  },
  {
    key: 'core-hr', sectionIcon: FiUsers, label: 'Core HR', sectionColor: SECTION_COLORS['core-hr'],
    items: [
      { label: 'HR Dashboard', href: '/dashboards/hr', icon: <FiGrid className="w-4 h-4" />, isNew: true },
      { label: 'My Profile', href: '/my-profile', icon: <FiUsers className="w-4 h-4" /> },
      { label: 'Employee Dashboard', href: '/dashboards/employee', icon: <FiGrid className="w-4 h-4" />, isNew: true },
      { label: 'Employees', href: '/employees', icon: <FiUsers className="w-4 h-4" />, moduleKey: 'employees' },
      { label: 'Company Management', href: '/company', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company' },
    ],
  },
  {
    key: 'talent-acquisition', sectionIcon: FiBriefcase, label: 'Talent Acquisition', sectionColor: SECTION_COLORS['talent-acquisition'],
    items: [
      { label: 'Recruitment Dashboard', href: '/dashboards/recruitment', icon: <FiGrid className="w-4 h-4" />, moduleKey: 'recruitment', isNew: true },
      { label: 'Recruitment', href: '/recruitment', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment' },
      { label: 'Requisitions', href: '/requisitions', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment' },
      { label: 'Offers', href: '/offers', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment' },
      { label: 'Job Portal', href: '/job-portal', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment' },
      { label: 'AI Interview', href: '/ai-interview', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment' },
      { label: 'Candidate Flow', href: '/analytics/candidate-flow', icon: <FiBriefcase className="w-4 h-4" />, moduleKey: 'recruitment', isNew: true },
    ],
  },
  {
    key: 'employee-lifecycle', sectionIcon: FiUserPlus, label: 'Employee Lifecycle', sectionColor: SECTION_COLORS['employee-lifecycle'],
    items: [
      { label: 'Onboarding', href: '/onboarding', icon: <FiUserPlus className="w-4 h-4" />, moduleKey: 'onboarding' },
      { label: 'Preboarding', href: '/preboarding', icon: <FiUserPlus className="w-4 h-4" />, moduleKey: 'onboarding', isNew: true },
      { label: 'Separation', href: '/separation', icon: <FiUserPlus className="w-4 h-4" />, moduleKey: 'separation' },
      { label: 'F&F Settlement', href: '/fnf', icon: <FiUserPlus className="w-4 h-4" />, moduleKey: 'separation' },
    ],
  },
  {
    key: 'attendance', sectionIcon: FiClock, label: 'Attendance', sectionColor: SECTION_COLORS['attendance'],
    items: [
      { label: 'Attendance Dashboard', href: '/dashboards/attendance', icon: <FiGrid className="w-4 h-4" />, moduleKey: 'attendance', isNew: true },
      { label: 'Attendance', href: '/attendance', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Regularization', href: '/attendance/regularize', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Permission', href: '/attendance/permission', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Gatepass', href: '/attendance/gatepass', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Overtime', href: '/attendance/overtime', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Comp-Off', href: '/attendance/comp-off', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Geofences', href: '/attendance/geofence', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Biometric', href: '/attendance/biometric', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Burnout Analytics', href: '/attendance/burnout', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Audit Trail', href: '/attendance/audit-log', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
      { label: 'Policy Config', href: '/attendance/policy-config', icon: <FiClock className="w-4 h-4" />, moduleKey: 'attendance' },
    ],
  },
  {
    key: 'leave', sectionIcon: FiCalendar, label: 'Leave', sectionColor: SECTION_COLORS['leave'],
    items: [
      { label: 'Leave Management', href: '/leave', icon: <FiCalendar className="w-4 h-4" />, moduleKey: 'leave' },
      { label: 'Leave Encashment', href: '/leave/encashment', icon: <FiCalendar className="w-4 h-4" />, moduleKey: 'leave' },
      { label: 'Optional Holidays', href: '/leave/optional-holidays', icon: <FiCalendar className="w-4 h-4" />, moduleKey: 'leave' },
    ],
  },
  {
    key: 'timesheet', sectionIcon: FiWatch, label: 'Timesheets', sectionColor: SECTION_COLORS['timesheet'],
    items: [
      { label: 'Timesheets', href: '/timesheets', icon: <FiWatch className="w-4 h-4" />, moduleKey: 'attendance' },
    ],
  },
  {
    key: 'compensation', sectionIcon: FiDollarSign, label: 'Compensation', sectionColor: SECTION_COLORS['compensation'],
    items: [
      { label: 'Payroll Dashboard', href: '/dashboards/payroll', icon: <FiGrid className="w-4 h-4" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll', href: '/payroll', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll' },
      { label: 'CTC Templates', href: '/payroll/ctc-templates', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll', isNew: true },
      { label: 'Component Master', href: '/payroll/components', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll', isNew: true },
      { label: 'Income Tax', href: '/payroll/income-tax', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll', isNew: true },
      { label: 'Payroll Processing', href: '/payroll/processing', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll' },
      { label: 'Payslips', href: '/payroll/payslips', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll' },
      { label: 'AI Insights', href: '/payroll/ai-insights', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'payroll', isNew: true },
    ],
  },
  {
    key: 'performance-growth', sectionIcon: FiTrendingUp, label: 'Performance & Growth', sectionColor: SECTION_COLORS['performance-growth'],
    items: [
      { label: 'Performance', href: '/performance', icon: <FiTrendingUp className="w-4 h-4" />, moduleKey: 'performance' },
      { label: 'OKR Cascade', href: '/okrs', icon: <FiTarget className="w-4 h-4" />, moduleKey: 'performance', isNew: true },
      { label: 'Training', href: '/training', icon: <FiBookOpen className="w-4 h-4" />, moduleKey: 'training' },
      { label: 'Engagement', href: '/engagement', icon: <FiTrendingUp className="w-4 h-4" />, moduleKey: 'engagement', isNew: true },
      { label: 'Succession', href: '/succession', icon: <FiTarget className="w-4 h-4" />, roles: ['super_admin', 'tenant_admin', 'admin'], isNew: true },
    ],
  },
  {
    key: 'accounts-finance', sectionIcon: FiDollarSign, label: 'Accounts & Finance', sectionColor: SECTION_COLORS['accounts-finance'],
    items: [
      { label: 'Accounts Hub', href: '/accounts', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Chart of Accounts', href: '/accounts/chart-of-accounts', icon: <FiBookOpen className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Journal Entries', href: '/accounts/journal-entries', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Invoices (AR)', href: '/accounts/invoices', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Bills (AP)', href: '/accounts/bills', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Bank Reconciliation', href: '/accounts/bank-reconciliation', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
      { label: 'Financial Reports', href: '/accounts/reports', icon: <FiDollarSign className="w-4 h-4" />, moduleKey: 'accounts', isNew: true },
    ],
  },
  {
    key: 'operations', sectionIcon: FiFolder, label: 'Operations', sectionColor: SECTION_COLORS['operations'],
    items: [
      { label: 'Travel', href: '/travel', icon: <FiFolder className="w-4 h-4" />, moduleKey: 'travel' },
      { label: 'Expenses', href: '/expenses', icon: <FiFolder className="w-4 h-4" />, moduleKey: 'expenses' },
      { label: 'Documents', href: '/documents', icon: <FiFolder className="w-4 h-4" />, moduleKey: 'docs' },
    ],
  },
  {
    key: 'project-management', sectionIcon: FiTarget, label: 'Project Management', sectionColor: SECTION_COLORS['project-management'],
    items: [
      { label: 'PM Dashboard', href: '/project-management', icon: <FiGrid className="w-4 h-4" />, moduleKey: 'projects', isNew: true },
      { label: 'Projects', href: '/projects', icon: <FiFolder className="w-4 h-4" />, moduleKey: 'projects' },
      { label: 'Utilization', href: '/projects/utilization', icon: <FiTarget className="w-4 h-4" />, isNew: true },
    ],
  },
  {
    key: 'assets-it', sectionIcon: FiPackage, label: 'Assets & IT', sectionColor: SECTION_COLORS['assets-it'],
    items: [
      { label: 'Assets', href: '/assets', icon: <FiPackage className="w-4 h-4" />, moduleKey: 'assets' },
      { label: 'IT Admin Console', href: '/it-admin', icon: <FiPackage className="w-4 h-4" />, moduleKey: 'it_admin_module', isNew: true },
    ],
  },
  {
    key: 'crm', sectionIcon: FiTarget, label: 'CRM & Sales', sectionColor: SECTION_COLORS['crm'],
    items: [
      { label: 'CRM Dashboard', href: '/crm', icon: <FiTarget className="w-4 h-4" />, moduleKey: 'crm', isNew: true },
      { label: 'Contacts', href: '/crm/contacts', icon: <FiTarget className="w-4 h-4" />, moduleKey: 'crm', isNew: true },
      { label: 'Deals', href: '/crm/deals', icon: <FiTarget className="w-4 h-4" />, moduleKey: 'crm', isNew: true },
      { label: 'Leads', href: '/crm/leads', icon: <FiTarget className="w-4 h-4" />, moduleKey: 'crm', isNew: true },
    ],
  },
  {
    key: 'external-relations', sectionIcon: FiGlobe, label: 'External Relations', sectionColor: SECTION_COLORS['external-relations'],
    items: [
      { label: 'Clients', href: '/clients', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company' },
      { label: 'SOWs', href: '/clients/sow', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company', isNew: true },
      { label: 'Vendors', href: '/vendors', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company', isNew: true },
      { label: 'Vendor Invoices', href: '/vendor-invoices', icon: <FiGlobe className="w-4 h-4" />, moduleKey: 'company', isNew: true },
    ],
  },
  {
    key: 'marketplace', sectionIcon: FiShoppingBag, label: 'Marketplace', sectionColor: SECTION_COLORS['marketplace'],
    items: [
      { label: 'Marketplace Hub', href: '/marketplace', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'My Wallet', href: '/marketplace/wallet', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'Catalog', href: '/marketplace/catalog', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'Insurance', href: '/marketplace/insurance', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'EWA', href: '/marketplace/ewa', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'Loans', href: '/marketplace/loans', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
      { label: 'Gifting', href: '/marketplace/gifting', icon: <FiShoppingBag className="w-4 h-4" />, isNew: true },
    ],
  },
  {
    key: 'support-intelligence', sectionIcon: FiHelpCircle, label: 'Support & AI', sectionColor: SECTION_COLORS['support-intelligence'],
    items: [
      { label: 'Helpdesk', href: '/helpdesk', icon: <FiHelpCircle className="w-4 h-4" />, moduleKey: 'helpdesk' },
      { label: 'Grievances', href: '/grievances', icon: <FiHelpCircle className="w-4 h-4" />, moduleKey: 'grievances' },
      { label: 'AI Assistant', href: '/ai-assistant', icon: <FiHelpCircle className="w-4 h-4" /> },
    ],
  },
  {
    key: 'collaboration', sectionIcon: FiMessageCircle, label: 'Collaboration', sectionColor: SECTION_COLORS['collaboration'],
    items: [
      { label: 'Hub Home', href: '/collaboration', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Chat', href: '/collaboration/chat', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Calls', href: '/collaboration/calls', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Calendar', href: '/calendar', icon: <FiCalendar className="w-4 h-4" />, isNew: true },
      { label: 'Email', href: '/email', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'To Do', href: '/todo', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Notes', href: '/notes', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Social Feed', href: '/social-feed', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'File Manager', href: '/file-manager', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
      { label: 'Kanban Board', href: '/kanban', icon: <FiMessageCircle className="w-4 h-4" />, isNew: true },
    ],
  },
  {
    key: 'knowledge-base', sectionIcon: FiBookOpen, label: 'Knowledge Base', sectionColor: SECTION_COLORS['knowledge-base'],
    items: [
      { label: 'Documentation Hub', href: '/docs', icon: <FiBookOpen className="w-4 h-4" />, moduleKey: 'docs', isNew: true },
    ],
  },
  {
    key: 'governance', sectionIcon: FiSettings, label: 'Governance', sectionColor: SECTION_COLORS['governance'],
    items: [
      { label: 'Workflows', href: '/workflows', icon: <FiSettings className="w-4 h-4" />, moduleKey: 'settings' },
      { label: 'Reports & Analytics', href: '/reports', icon: <FiSettings className="w-4 h-4" />, moduleKey: 'reports' },
      { label: 'Scheduled Reports', href: '/reports/schedules', icon: <FiSettings className="w-4 h-4" />, isNew: true },
      { label: 'AI Insights', href: '/insights', icon: <FiSettings className="w-4 h-4" />, isNew: true },
      { label: 'Settings', href: '/settings', icon: <FiSettings className="w-4 h-4" />, moduleKey: 'settings' },
      { label: 'Notifications', href: '/notifications', icon: <FiSettings className="w-4 h-4" /> },
    ],
  },
];

const MODULE_GROUPS: ModuleGroup[] = [
  { groupLabel: 'Administration', groupDescription: 'Platform & tenant management', sections: navSections.filter(s => ['super-admin', 'tenant-admin'].includes(s.key)) },
  { groupLabel: 'People & Talent', groupDescription: 'HR, recruitment & lifecycle', sections: navSections.filter(s => ['core-hr', 'talent-acquisition', 'employee-lifecycle'].includes(s.key)) },
  { groupLabel: 'Time & Leave', groupDescription: 'Attendance, leave & timesheets', sections: navSections.filter(s => ['attendance', 'leave', 'timesheet'].includes(s.key)) },
  { groupLabel: 'Compensation & Finance', groupDescription: 'Payroll, performance & accounts', sections: navSections.filter(s => ['compensation', 'performance-growth', 'accounts-finance'].includes(s.key)) },
  { groupLabel: 'Operations & Projects', groupDescription: 'Travel, expenses & project management', sections: navSections.filter(s => ['operations', 'project-management'].includes(s.key)) },
  { groupLabel: 'Technology & Sales', groupDescription: 'Assets, IT, CRM & sales', sections: navSections.filter(s => ['assets-it', 'crm'].includes(s.key)) },
  { groupLabel: 'External & Marketplace', groupDescription: 'Clients, vendors & wellness', sections: navSections.filter(s => ['external-relations', 'marketplace'].includes(s.key)) },
  { groupLabel: 'Support & Collaboration', groupDescription: 'Helpdesk, chat & knowledge base', sections: navSections.filter(s => ['support-intelligence', 'collaboration', 'knowledge-base'].includes(s.key)) },
  { groupLabel: 'Governance', groupDescription: 'Workflows, reports & settings', sections: navSections.filter(s => ['governance'].includes(s.key)) },
];

export default function ModulesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const userRole = user?.role || 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    return MODULE_GROUPS.map(group => ({
      ...group,
      sections: group.sections
        .map(section => ({
          ...section,
          items: section.items.filter(item => {
            if (item.moduleKey) return canRoleAccessModule(userRole, item.moduleKey);
            return !item.roles || item.roles.includes(userRole);
          }),
        }))
        .filter(section => section.items.length > 0),
    })).filter(group => group.sections.length > 0);
  }, [userRole]);

  const searchFilteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return filteredGroups;
    const q = searchQuery.toLowerCase();
    return filteredGroups.map(group => ({
      ...group,
      sections: group.sections
        .map(section => ({
          ...section,
          items: section.items.filter(item =>
            item.label.toLowerCase().includes(q) || section.label.toLowerCase().includes(q)
          ),
        }))
        .filter(section => section.items.length > 0),
    })).filter(group => group.sections.length > 0);
  }, [filteredGroups, searchQuery]);

  const totalModules = searchFilteredGroups.reduce((acc, g) => acc + g.sections.length, 0);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-thb-text-primary tracking-tight">Modules</h1>
            <p className="text-sm text-thb-text-secondary mt-1">
              {totalModules} modules available &middot; Click a module to explore its features
            </p>
          </div>
        </div>
        {/* Search Bar */}
        <div className="relative max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/30 text-sm text-thb-text-primary placeholder:text-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Module Groups */}
      <div className="space-y-10">
        {searchFilteredGroups.map((group) => (
          <div key={group.groupLabel}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-thb-text-primary">{group.groupLabel}</h2>
              <p className="text-xs text-thb-text-secondary mt-0.5">{group.groupDescription}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {group.sections.map((section) => {
                const SectionIcon = section.sectionIcon;
                const isExpanded = expandedModule === section.key;
                const gradientColor = section.sectionColor || 'from-blue-500 to-indigo-600';
                return (
                  <div
                    key={section.key}
                    className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                      isExpanded
                        ? 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 border-blue-300 shadow-lg shadow-blue-500/10'
                        : 'border-slate-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 cursor-pointer'
                    }`}
                  >
                    <div
                      className="p-4 flex items-center gap-3"
                      onClick={() => setExpandedModule(isExpanded ? null : section.key)}
                    >
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradientColor} flex items-center justify-center shadow-md flex-shrink-0`}>
                        <SectionIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-thb-text-primary truncate">{section.label}</h3>
                        <p className="text-[11px] text-thb-text-secondary">{section.items.length} features</p>
                      </div>
                      <FiChevronRight className={`w-4 h-4 text-thb-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                          {section.items.map((item) => (
                            <button
                              key={item.href}
                              onClick={(e) => { e.stopPropagation(); router.push(item.href); }}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group ${
                                pathname === item.href
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'hover:bg-white hover:shadow-sm text-thb-text-secondary hover:text-thb-text-primary'
                              }`}
                            >
                              <span className="flex-shrink-0 text-thb-text-secondary group-hover:text-blue-500 transition-colors">
                                {item.icon}
                              </span>
                              <span className="text-xs font-medium truncate flex-1">{item.label}</span>
                              {item.isNew && (
                                <span className="flex-shrink-0 text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                                  NEW
                                </span>
                              )}
                              <FiArrowRight className="w-3 h-3 text-slate-300 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {searchFilteredGroups.length === 0 && searchQuery && (
        <div className="text-center py-16">
          <FiSearch className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-thb-text-primary mb-1">No modules found</h3>
          <p className="text-sm text-thb-text-secondary">No modules match &ldquo;{searchQuery}&rdquo;. Try a different search term.</p>
        </div>
      )}
    </div>
  );
}
