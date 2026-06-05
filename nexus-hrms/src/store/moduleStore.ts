'use client';

import { create } from 'zustand';

export interface SubMenuItem {
  label: string;
  href: string;
}

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  route: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  icon: string; // We'll use string keys and resolve in components
  roles?: string[]; // If specified, only these roles can see it
  subMenus: SubMenuItem[];
}

export const modules: ModuleConfig[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'Tenant management, audit logs & subscriptions',
    route: '/dashboard',
    color: 'red',
    gradientFrom: 'from-red-500',
    gradientTo: 'to-red-700',
    icon: 'FiShield',
    roles: ['super_admin'],
    subMenus: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Tenants', href: '/company-management' },
      { label: 'Audit Logs', href: '/notifications' },
      { label: 'Subscriptions', href: '/settings' },
    ],
  },
  {
    id: 'company',
    name: 'Company',
    description: 'Companies, branches, departments & policies',
    route: '/company-management',
    color: 'blue',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-blue-700',
    icon: 'FiHome',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'Companies', href: '/company-management' },
      { label: 'Branches', href: '/company-management' },
      { label: 'Departments', href: '/masters' },
      { label: 'Designations', href: '/masters' },
      { label: 'Grades / Bands', href: '/masters' },
      { label: 'Cost Centers', href: '/masters' },
      { label: 'Business Units', href: '/masters' },
      { label: 'Policies', href: '/masters' },
    ],
  },
  {
    id: 'masters',
    name: 'Masters',
    description: 'Shifts, holidays, leave types & configuration',
    route: '/masters',
    color: 'violet',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-violet-700',
    icon: 'FiSliders',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'Shifts', href: '/masters' },
      { label: 'Holidays', href: '/masters' },
      { label: 'Leave Types', href: '/masters' },
      { label: 'Skills', href: '/masters' },
      { label: 'Employee Types', href: '/masters' },
      { label: 'Training Types', href: '/masters' },
      { label: 'Document Types', href: '/masters' },
      { label: 'Project Types', href: '/masters' },
      { label: 'Ticket Categories', href: '/masters' },
      { label: 'Notification Templates', href: '/masters' },
      { label: 'Sub Vendors', href: '/masters' },
    ],
  },
  {
    id: 'employees',
    name: 'Employees',
    description: 'Directory, onboarding, documents & assets',
    route: '/employees',
    color: 'emerald',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-emerald-700',
    icon: 'FiUsers',
    subMenus: [
      { label: 'Employee Directory', href: '/employees' },
      { label: 'Onboarding', href: '/onboarding' },
      { label: 'Documents', href: '/documents' },
      { label: 'Assets', href: '/assets' },
      { label: 'Incidents', href: '/helpdesk' },
    ],
  },
  {
    id: 'leave',
    name: 'Leave',
    description: 'Leave management, balances & holiday calendar',
    route: '/leave',
    color: 'amber',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-amber-700',
    icon: 'FiCalendar',
    subMenus: [
      { label: 'Leave Dashboard', href: '/leave' },
      { label: 'My Leaves', href: '/leave' },
      { label: 'Leave Balances', href: '/leave' },
      { label: 'Leave Types', href: '/masters' },
      { label: 'Holiday Calendar', href: '/leave' },
    ],
  },
  {
    id: 'attendance',
    name: 'Attendance',
    description: 'Daily logs, shifts & regularization',
    route: '/attendance',
    color: 'cyan',
    gradientFrom: 'from-cyan-500',
    gradientTo: 'to-cyan-700',
    icon: 'FiClock',
    subMenus: [
      { label: 'Attendance Dashboard', href: '/attendance' },
      { label: 'Daily Log', href: '/attendance' },
      { label: 'Shifts', href: '/masters' },
      { label: 'Regularization', href: '/attendance' },
    ],
  },
  {
    id: 'timesheet-projects',
    name: 'Timesheet / Projects',
    description: 'Projects, timesheets, clients & vendors',
    route: '/projects',
    color: 'indigo',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-indigo-700',
    icon: 'FiFolder',
    roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'],
    subMenus: [
      { label: 'Project Dashboard', href: '/projects' },
      { label: 'Timesheets', href: '/timesheets' },
      { label: 'Project Allocation', href: '/projects' },
      { label: 'Clients', href: '/clients' },
      { label: 'Vendors', href: '/vendors' },
    ],
  },
  {
    id: 'payroll',
    name: 'Payroll',
    description: 'Salary structures, processing & reports',
    route: '/payroll',
    color: 'green',
    gradientFrom: 'from-green-500',
    gradientTo: 'to-green-700',
    icon: 'FiDollarSign',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'Payroll Dashboard', href: '/payroll' },
      { label: 'Salary Structures', href: '/salary-structures' },
      { label: 'CTC Based', href: '/salary-structures' },
      { label: 'Input Based', href: '/salary-structures' },
      { label: 'Statutory Masters', href: '/masters' },
      { label: 'Payroll Processing', href: '/payroll' },
      { label: 'FNF Settlement', href: '/fnf' },
      { label: 'Reports', href: '/payroll' },
    ],
  },
  {
    id: 'training',
    name: 'Training',
    description: 'Programs, enrollments & training types',
    route: '/training',
    color: 'rose',
    gradientFrom: 'from-rose-500',
    gradientTo: 'to-rose-700',
    icon: 'FiBookOpen',
    subMenus: [
      { label: 'Training Dashboard', href: '/training' },
      { label: 'Programs', href: '/training' },
      { label: 'Enrollments', href: '/training' },
      { label: 'Training Types', href: '/masters' },
    ],
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'Reviews, goals, feedback & promotions',
    route: '/performance',
    color: 'orange',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-orange-700',
    icon: 'FiTrendingUp',
    subMenus: [
      { label: 'Performance Dashboard', href: '/performance' },
      { label: 'Reviews', href: '/performance' },
      { label: 'Goals', href: '/performance' },
      { label: 'Feedback', href: '/performance' },
      { label: 'Promotions', href: '/performance' },
    ],
  },
  {
    id: 'travel-expense',
    name: 'Travel & Expense',
    description: 'Travel requests, claims & reimbursements',
    route: '/travel',
    color: 'teal',
    gradientFrom: 'from-teal-500',
    gradientTo: 'to-teal-700',
    icon: 'FiMap',
    subMenus: [
      { label: 'Travel Requests', href: '/travel' },
      { label: 'Expense Claims', href: '/expenses' },
      { label: 'Reimbursements', href: '/expenses' },
      { label: 'Approvals', href: '/expenses' },
    ],
  },
  {
    id: 'exit-workflow',
    name: 'Exit Workflow',
    description: 'Resignation, separation & clearance',
    route: '/separation',
    color: 'red',
    gradientFrom: 'from-red-400',
    gradientTo: 'to-red-600',
    icon: 'FiLogOut',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'Resignation', href: '/separation' },
      { label: 'Separation', href: '/separation' },
      { label: 'FNF Settlement', href: '/fnf' },
      { label: 'Exit Interview', href: '/separation' },
      { label: 'Clearance', href: '/separation' },
    ],
  },
  {
    id: 'workflows',
    name: 'Workflows',
    description: 'Workflow builder, active & history',
    route: '/workflows',
    color: 'purple',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-purple-700',
    icon: 'FiGitBranch',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'Workflow Builder', href: '/workflows' },
      { label: 'Active Workflows', href: '/workflows' },
      { label: 'Workflow History', href: '/workflows' },
    ],
  },
  {
    id: 'hr-desk',
    name: 'HR Desk',
    description: 'Help desk, grievances & announcements',
    route: '/helpdesk',
    color: 'sky',
    gradientFrom: 'from-sky-500',
    gradientTo: 'to-sky-700',
    icon: 'FiLifeBuoy',
    subMenus: [
      { label: 'Help Desk', href: '/helpdesk' },
      { label: 'Grievances', href: '/grievances' },
      { label: 'Announcements', href: '/helpdesk' },
      { label: 'Knowledge Base', href: '/helpdesk' },
    ],
  },
  {
    id: 'applications',
    name: 'Applications',
    description: 'Chat, calls, files & AI assistant',
    route: '/notifications',
    color: 'pink',
    gradientFrom: 'from-pink-500',
    gradientTo: 'to-pink-700',
    icon: 'FiGrid',
    subMenus: [
      { label: 'Chat', href: '/notifications' },
      { label: 'Calls', href: '/notifications' },
      { label: 'Files', href: '/documents' },
      { label: 'AI Assistant', href: '/notifications' },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    description: 'RBAC, roles, permissions & login activity',
    route: '/rbac',
    color: 'slate',
    gradientFrom: 'from-slate-500',
    gradientTo: 'to-slate-700',
    icon: 'FiLock',
    roles: ['super_admin', 'tenant_admin', 'hr_admin'],
    subMenus: [
      { label: 'RBAC', href: '/rbac' },
      { label: 'Roles', href: '/rbac' },
      { label: 'Permissions', href: '/rbac' },
      { label: 'Login Activity', href: '/rbac' },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'General, profile, notifications & integrations',
    route: '/settings',
    color: 'gray',
    gradientFrom: 'from-gray-500',
    gradientTo: 'to-gray-700',
    icon: 'FiSettings',
    subMenus: [
      { label: 'General', href: '/settings' },
      { label: 'Profile', href: '/settings' },
      { label: 'Notifications', href: '/settings' },
      { label: 'Integrations', href: '/settings' },
    ],
  },
  {
    id: 'knowledge-hub',
    name: 'Knowledge Hub',
    description: 'Documents, SOPs, FAQs & announcements',
    route: '/documents',
    color: 'yellow',
    gradientFrom: 'from-yellow-400',
    gradientTo: 'to-yellow-600',
    icon: 'FiBook',
    subMenus: [
      { label: 'Documents Library', href: '/documents' },
      { label: 'SOPs', href: '/documents' },
      { label: 'FAQs', href: '/helpdesk' },
      { label: 'Announcements', href: '/helpdesk' },
    ],
  },
];

interface ModuleState {
  activeModule: string | null;
  setActiveModule: (module: string | null) => void;
  getModuleById: (id: string) => ModuleConfig | undefined;
  getVisibleModules: (role: string) => ModuleConfig[];
}

export const useModuleStore = create<ModuleState>((set) => ({
  activeModule: null,

  setActiveModule: (module: string | null) => {
    set({ activeModule: module });
  },

  getModuleById: (id: string) => {
    return modules.find((m) => m.id === id);
  },

  getVisibleModules: (role: string) => {
    return modules.filter(
      (m) => !m.roles || m.roles.includes(role)
    );
  },
}));
