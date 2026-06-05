export type UserRole = 
  | 'super_admin' 
  | 'company_hr_admin' 
  | 'hr_executive' 
  | 'dept_head' 
  | 'reporting_manager' 
  | 'employee' 
  | 'finance' 
  | 'it_admin' 
  | 'recruiter' 
  | 'vendor' 
  | 'sub_vendor' 
  | 'client' 
  | 'auditor'
  | 'job_seeker';

export type ModuleKey = 
  | 'dashboard'
  | 'recruitment'
  | 'employees'
  | 'attendance'
  | 'leave'
  | 'payroll'
  | 'performance'
  | 'learning'
  | 'engagement'
  | 'travel_expense'
  | 'assets'
  | 'helpdesk'
  | 'compliance'
  | 'workflow'
  | 'analytics'
  | 'client_portal'
  | 'vendor_portal'
  | 'sub_vendor_portal'
  | 'job_portal'
  | 'ai_interview'
  | 'ai_chatbot'
  | 'alumni'
  | 'settings'
  | 'onboarding'
  | 'companies'
  | 'audit_logs'
  | 'help_training';

export interface CompanyInfo {
  id: string;
  name: string;
  code: string;
  industry: string;
  logo?: string;
  country: string;
  currency: string;
  employeeCount: number;
  isActive: boolean;
}

export interface EmployeeInfo {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  designation: string;
  department: string;
  status: string;
  joiningDate: string;
  company: string;
}

export interface DashboardStat {
  label: string;
  value: string | number;
  change?: number;
  icon: string;
  color: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  read: boolean;
}

export interface SidebarItem {
  key: ModuleKey;
  label: string;
  icon: string;
  badge?: number;
  children?: SidebarItem[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  company_hr_admin: 'HR Admin',
  hr_executive: 'HR Executive',
  dept_head: 'Department Head',
  reporting_manager: 'Reporting Manager',
  employee: 'Employee',
  finance: 'Finance Team',
  it_admin: 'IT Admin',
  recruiter: 'Recruiter',
  vendor: 'Vendor',
  sub_vendor: 'Sub-Vendor',
  client: 'Client',
  auditor: 'Auditor',
  job_seeker: 'Job Seeker',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-800',
  company_hr_admin: 'bg-purple-100 text-purple-800',
  hr_executive: 'bg-pink-100 text-pink-800',
  dept_head: 'bg-orange-100 text-orange-800',
  reporting_manager: 'bg-yellow-100 text-yellow-800',
  employee: 'bg-green-100 text-green-800',
  finance: 'bg-blue-100 text-blue-800',
  it_admin: 'bg-cyan-100 text-cyan-800',
  recruiter: 'bg-indigo-100 text-indigo-800',
  vendor: 'bg-teal-100 text-teal-800',
  sub_vendor: 'bg-emerald-100 text-emerald-800',
  client: 'bg-amber-100 text-amber-800',
  auditor: 'bg-slate-100 text-slate-800',
  job_seeker: 'bg-violet-100 text-violet-800',
};

export const EMPLOYMENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  on_leave: 'bg-yellow-100 text-yellow-800',
  probation: 'bg-blue-100 text-blue-800',
  notice_period: 'bg-orange-100 text-orange-800',
  exited: 'bg-red-100 text-red-800',
};
