'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import {
  FiSettings,
  FiEdit2,
  FiX,
  FiSave,
  FiBell,
  FiGlobe,
  FiDatabase,
  FiShield,
  FiClock,
  FiDollarSign,
  FiCalendar,
  FiAlertTriangle,
  FiUserCheck,
  FiUsers,
  FiInfo,
  FiCheck,
  FiMenu,
  FiBriefcase,
  FiTrendingUp,
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiHeart,
  FiCamera,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  plan: string;
  status: string;
  country?: string | null;
  currency: string;
  timezone: string;
  logo?: string | null;
}

interface NotifPref {
  email: boolean;
  leave: boolean;
  payroll: boolean;
  recruitment: boolean;
  workflow: boolean;
  system: boolean;
}

type SettingType = 'toggle' | 'select' | 'number' | 'text';

interface SettingField {
  key: string;
  label: string;
  type: SettingType;
  defaultValue: string | number | boolean;
  description: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

interface SettingSection {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  fields: SettingField[];
}

/* ──────────────────────────────────────────────
   localStorage Helper
   ────────────────────────────────────────────── */
const SETTINGS_KEY = 'nexus_hrms_settings';

function loadSettings(): Record<string, string | number | boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function saveSettings(settings: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/* ──────────────────────────────────────────────
   Auth Helper
   ────────────────────────────────────────────── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ──────────────────────────────────────────────
   Roles Data
   ────────────────────────────────────────────── */
const rolesData = [
  { name: 'Super Admin', key: 'super_admin', description: 'Full system access across all tenants', permissions: ['All Permissions'] },
  { name: 'Tenant Admin', key: 'tenant_admin', description: 'Full access within their tenant', permissions: ['User Management', 'Employee Management', 'Payroll', 'Reports', 'Settings'] },
  { name: 'HR Admin', key: 'hr_admin', description: 'HR module access', permissions: ['Employee Management', 'Leave Management', 'Attendance', 'Recruitment', 'Performance', 'Training'] },
  { name: 'Manager', key: 'manager', description: 'Team management access', permissions: ['Team View', 'Leave Approvals', 'Performance Reviews', 'Timesheet Approvals'] },
  { name: 'Employee', key: 'employee', description: 'Self-service access', permissions: ['Self Profile', 'Leave Request', 'Attendance', 'Timesheet', 'Documents'] },
];

/* ──────────────────────────────────────────────
   Setting Definitions
   ────────────────────────────────────────────── */
const payrollSections: SettingSection[] = [
  {
    title: 'Pay Schedule',
    description: 'Configure how and when employees are paid',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    fields: [
      { key: 'payroll_pay_frequency', label: 'Pay Frequency', type: 'select', defaultValue: 'monthly', description: 'How often employees are paid', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'bi_monthly', label: 'Bi-monthly' }, { value: 'weekly', label: 'Weekly' }] },
      { key: 'payroll_default_pay_day', label: 'Default Pay Day', type: 'number', defaultValue: 1, description: 'Day of the month when salary is disbursed', min: 1, max: 31 },
      { key: 'payroll_cutoff_day', label: 'Default Cut-off Day', type: 'number', defaultValue: 25, description: 'Day of the month after which attendance is counted in next cycle', min: 1, max: 31 },
    ],
  },
  {
    title: 'Overtime & Calculation',
    description: 'Rules for overtime pay and payroll calculations',
    icon: <FiClock className="w-5 h-5" />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    fields: [
      { key: 'payroll_overtime_method', label: 'Overtime Calculation Method', type: 'select', defaultValue: '1.5x', description: 'Rate multiplier applied to overtime hours', options: [{ value: 'flat_rate', label: 'Flat Rate' }, { value: '1.5x', label: '1.5x (Time & Half)' }, { value: '2x', label: '2x (Double Time)' }] },
      { key: 'payroll_auto_approve_overtime', label: 'Auto-approve Overtime', type: 'toggle', defaultValue: false, description: 'Automatically approve overtime requests without manager approval' },
      { key: 'payroll_round_off_net_pay', label: 'Round Off Net Pay', type: 'toggle', defaultValue: false, description: 'Round net pay to the nearest whole currency unit' },
      { key: 'payroll_proration_method', label: 'Proration Method', type: 'select', defaultValue: 'calendar_days', description: 'How salary is prorated for partial months', options: [{ value: 'calendar_days', label: 'Calendar Days' }, { value: 'working_days', label: 'Working Days' }] },
    ],
  },
  {
    title: 'Tax & Compliance',
    description: 'Tax regime and TDS calculation preferences',
    icon: <FiDollarSign className="w-5 h-5" />,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    fields: [
      { key: 'payroll_tax_regime', label: 'Tax Regime Default', type: 'select', defaultValue: 'new', description: 'Default tax regime for new employees', options: [{ value: 'old', label: 'Old Regime' }, { value: 'new', label: 'New Regime' }] },
      { key: 'payroll_tds_method', label: 'TDS Calculation Method', type: 'select', defaultValue: 'cumulative', description: 'Method for calculating Tax Deducted at Source', options: [{ value: 'cumulative', label: 'Cumulative' }, { value: 'non_cumulative', label: 'Non-cumulative' }] },
    ],
  },
  {
    title: 'Advanced',
    description: 'Additional payroll processing configuration',
    icon: <FiSettings className="w-5 h-5" />,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    fields: [
      { key: 'payroll_loan_interest_rate', label: 'Loan Interest Rate Default (%)', type: 'number', defaultValue: 5, description: 'Default annual interest rate for employee loans', min: 0, max: 30, step: 0.5 },
      { key: 'payroll_auto_post_accounting', label: 'Auto-post to Accounting', type: 'toggle', defaultValue: false, description: 'Automatically post payroll entries to the accounting module' },
      { key: 'payroll_salary_structure_default', label: 'Default Salary Structure', type: 'text', defaultValue: 'Standard', description: 'Name of the default salary structure for new employees' },
      { key: 'payroll_processing_mode', label: 'Payroll Processing Mode', type: 'select', defaultValue: 'full', description: 'Full processes all employees; Delta processes only changes', options: [{ value: 'full', label: 'Full Processing' }, { value: 'delta', label: 'Delta Processing' }] },
    ],
  },
];

const leaveSections: SettingSection[] = [
  {
    title: 'Leave Year & Carry Forward',
    description: 'Configure leave year start and carry forward rules',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    fields: [
      { key: 'leave_year_start_month', label: 'Leave Year Start Month', type: 'select', defaultValue: 'january', description: 'Month when the leave year begins', options: [{ value: 'january', label: 'January' }, { value: 'april', label: 'April' }, { value: 'july', label: 'July' }, { value: 'october', label: 'October' }] },
      { key: 'leave_max_carry_forward', label: 'Max Carry Forward Days', type: 'number', defaultValue: 5, description: 'Maximum number of leave days that can be carried forward to the next year', min: 0, max: 30 },
      { key: 'leave_encashment_enabled', label: 'Leave Encashment Enabled', type: 'toggle', defaultValue: true, description: 'Allow employees to encash unused leave days' },
      { key: 'leave_encashment_rate_basis', label: 'Encashment Rate Basis', type: 'select', defaultValue: 'basic', description: 'Salary component used for leave encashment calculation', options: [{ value: 'basic', label: 'Basic Salary' }, { value: 'gross', label: 'Gross Salary' }] },
    ],
  },
  {
    title: 'Leave Application Rules',
    description: 'Rules governing leave applications',
    icon: <FiClock className="w-5 h-5" />,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    fields: [
      { key: 'leave_comp_off_expiry_days', label: 'Comp-off Expiry Days', type: 'number', defaultValue: 30, description: 'Number of days after which compensatory off expires', min: 1, max: 365 },
      { key: 'leave_min_balance_before_apply', label: 'Minimum Leave Balance Before Applying', type: 'number', defaultValue: 0, description: 'Minimum leaves that must remain after the current application', min: 0, max: 15 },
      { key: 'leave_advance_days', label: 'Leave Application Advance Days', type: 'number', defaultValue: 3, description: 'Minimum days in advance a leave must be applied for', min: 0, max: 30 },
      { key: 'leave_sandwich_policy', label: 'Sandwich Leave Policy', type: 'toggle', defaultValue: false, description: 'Count weekends/holidays between leave days as part of leave' },
    ],
  },
  {
    title: 'Special Leaves & Calendar',
    description: 'Holiday calendar and special leave entitlements',
    icon: <FiGlobe className="w-5 h-5" />,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
    fields: [
      { key: 'leave_holiday_calendar_default', label: 'Default Holiday Calendar', type: 'text', defaultValue: 'Indian National', description: 'Default holiday calendar applied to new employees' },
      { key: 'leave_maternity_days', label: 'Maternity Leave Days', type: 'number', defaultValue: 182, description: 'Number of maternity leave days allowed', min: 0, max: 365 },
      { key: 'leave_paternity_days', label: 'Paternity Leave Days', type: 'number', defaultValue: 15, description: 'Number of paternity leave days allowed', min: 0, max: 90 },
    ],
  },
];

const attendanceSections: SettingSection[] = [
  {
    title: 'Work Hours & Thresholds',
    description: 'Define work hours and attendance thresholds',
    icon: <FiClock className="w-5 h-5" />,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    fields: [
      { key: 'attendance_work_hours', label: 'Work Hours Per Day', type: 'number', defaultValue: 8, description: 'Standard work hours per day', min: 1, max: 24, step: 0.5 },
      { key: 'attendance_late_threshold', label: 'Late Arrival Threshold (minutes)', type: 'number', defaultValue: 15, description: 'Minutes after shift start time to mark as late', min: 0, max: 120 },
      { key: 'attendance_early_departure_threshold', label: 'Early Departure Threshold (minutes)', type: 'number', defaultValue: 15, description: 'Minutes before shift end time to mark as early departure', min: 0, max: 120 },
      { key: 'attendance_half_day_threshold', label: 'Half-day Threshold (hours)', type: 'number', defaultValue: 4, description: 'Minimum hours worked to count as half day', min: 1, max: 12, step: 0.5 },
      { key: 'attendance_overtime_start_after', label: 'Overtime Starts After (hours)', type: 'number', defaultValue: 8, description: 'Hours after which additional time counts as overtime', min: 1, max: 24, step: 0.5 },
    ],
  },
  {
    title: 'Shift & Weekend Rules',
    description: 'Weekend definitions and shift change policies',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    fields: [
      { key: 'attendance_weekend_saturday', label: 'Saturday as Weekend', type: 'toggle', defaultValue: false, description: 'Include Saturday as a weekend (non-working day)' },
      { key: 'attendance_weekend_sunday', label: 'Sunday as Weekend', type: 'toggle', defaultValue: true, description: 'Include Sunday as a weekend (non-working day)' },
      { key: 'attendance_shift_change_notice_days', label: 'Shift Change Notice Period (days)', type: 'number', defaultValue: 3, description: 'Minimum days notice required before a shift change', min: 0, max: 30 },
      { key: 'attendance_auto_clockout_time', label: 'Auto Clock-out Time', type: 'text', defaultValue: '23:59', description: 'Time at which employees are automatically clocked out (HH:MM format)' },
    ],
  },
  {
    title: 'Geofencing & Grace Period',
    description: 'Location-based attendance and grace periods',
    icon: <FiGlobe className="w-5 h-5" />,
    iconBg: 'bg-lime-50',
    iconColor: 'text-lime-600',
    fields: [
      { key: 'attendance_geofencing_enabled', label: 'Geofencing Enabled', type: 'toggle', defaultValue: false, description: 'Require employees to be within a geofenced area to clock in' },
      { key: 'attendance_grace_period', label: 'Grace Period for Late Arrival (minutes)', type: 'number', defaultValue: 5, description: 'Buffer minutes allowed after shift start before marking as late', min: 0, max: 60 },
    ],
  },
];

const employeeSections: SettingSection[] = [
  {
    title: 'Employee Code',
    description: 'Configure employee code generation rules',
    icon: <FiUserCheck className="w-5 h-5" />,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    fields: [
      { key: 'employee_code_prefix', label: 'Employee Code Prefix', type: 'text', defaultValue: 'EMP', description: 'Prefix for auto-generated employee codes' },
      { key: 'employee_code_sequence', label: 'Code Sequence Start', type: 'number', defaultValue: 1001, description: 'Starting number for auto-generated employee codes', min: 1, max: 99999 },
      { key: 'employee_code_auto_generation', label: 'Auto-generate Employee Code', type: 'toggle', defaultValue: true, description: 'Automatically generate employee code on creation' },
    ],
  },
  {
    title: 'Probation & Notice',
    description: 'Default probation and notice period settings',
    icon: <FiClock className="w-5 h-5" />,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
    fields: [
      { key: 'employee_probation_period', label: 'Probation Period Default (months)', type: 'number', defaultValue: 6, description: 'Default probation period for new employees', min: 0, max: 24 },
      { key: 'employee_notice_period', label: 'Notice Period Default (months)', type: 'number', defaultValue: 2, description: 'Default notice period for resignations', min: 0, max: 12 },
      { key: 'employee_doc_expiry_reminder_days', label: 'Document Expiry Reminder Days', type: 'number', defaultValue: 30, description: 'Days before document expiry to send a reminder', min: 1, max: 180 },
    ],
  },
  {
    title: 'Access & Permissions',
    description: 'Employee self-service and profile settings',
    icon: <FiShield className="w-5 h-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    fields: [
      { key: 'employee_email_domain_restriction', label: 'Email Domain Restriction', type: 'text', defaultValue: '', description: 'Restrict employee emails to this domain (leave empty for no restriction)' },
      { key: 'employee_self_service_access', label: 'Employee Self-Service Access', type: 'toggle', defaultValue: true, description: 'Allow employees to access the self-service portal' },
      { key: 'employee_profile_edit_permissions', label: 'Profile Edit Permissions', type: 'select', defaultValue: 'limited', description: 'What profile fields employees can edit themselves', options: [{ value: 'none', label: 'None' }, { value: 'limited', label: 'Limited (Contact Info)' }, { value: 'full', label: 'Full (All Fields)' }] },
      { key: 'employee_max_reporting_levels', label: 'Maximum Reporting Manager Levels', type: 'number', defaultValue: 3, description: 'Maximum depth of the reporting hierarchy', min: 1, max: 10 },
    ],
  },
];

const recruitmentSections: SettingSection[] = [
  {
    title: 'Application Defaults',
    description: 'Configure default recruitment application settings',
    icon: <FiBriefcase className="w-5 h-5" />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    fields: [
      { key: 'recruitment_default_application_source', label: 'Default Application Source', type: 'select', defaultValue: 'company_website', description: 'Default source attributed to new job applications', options: [{ value: 'company_website', label: 'Company Website' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'naukri', label: 'Naukri' }, { value: 'indeed', label: 'Indeed' }, { value: 'referral', label: 'Employee Referral' }, { value: 'other', label: 'Other' }] },
      { key: 'recruitment_auto_reject_days', label: 'Auto-reject After (days without response)', type: 'number', defaultValue: 30, description: 'Automatically reject applications with no response after this many days', min: 7, max: 180 },
    ],
  },
  {
    title: 'Offer & Onboarding',
    description: 'Offer letter and new hire onboarding defaults',
    icon: <FiUserCheck className="w-5 h-5" />,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
    fields: [
      { key: 'recruitment_offer_letter_template', label: 'Offer Letter Template', type: 'select', defaultValue: 'standard', description: 'Default offer letter template for new hires', options: [{ value: 'standard', label: 'Standard Offer Letter' }, { value: 'senior', label: 'Senior/Executive Offer' }, { value: 'intern', label: 'Internship Offer' }, { value: 'contract', label: 'Contract Offer' }] },
      { key: 'recruitment_probation_default_months', label: 'Probation Period for New Hires (months)', type: 'number', defaultValue: 6, description: 'Default probation period applied to all new hires from recruitment', min: 0, max: 24 },
      { key: 'recruitment_offer_expiry_days', label: 'Offer Expiry Days', type: 'number', defaultValue: 7, description: 'Number of days before an offer letter expires if not accepted', min: 1, max: 30 },
    ],
  },
  {
    title: 'Pipeline & Process',
    description: 'Recruitment pipeline and workflow defaults',
    icon: <FiSettings className="w-5 h-5" />,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    fields: [
      { key: 'recruitment_auto_screening', label: 'Auto-screening Enabled', type: 'toggle', defaultValue: false, description: 'Automatically screen applications based on predefined criteria' },
      { key: 'recruitment_min_interview_score', label: 'Minimum Interview Score to Advance', type: 'number', defaultValue: 3, description: 'Minimum score (out of 5) required to advance to next interview round', min: 1, max: 5 },
      { key: 'recruitment_background_check_required', label: 'Background Check Required', type: 'toggle', defaultValue: true, description: 'Require background verification before final offer' },
      { key: 'recruitment_requisition_approval_levels', label: 'Requisition Approval Levels', type: 'number', defaultValue: 2, description: 'Number of approval levels required for a job requisition', min: 1, max: 5 },
    ],
  },
];

const performanceSections: SettingSection[] = [
  {
    title: 'Review Cycle',
    description: 'Configure performance review cycle settings',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    fields: [
      { key: 'performance_review_cycle_frequency', label: 'Review Cycle Frequency', type: 'select', defaultValue: 'quarterly', description: 'How often performance reviews are conducted', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'semi_annual', label: 'Semi-Annual' }, { value: 'annual', label: 'Annual' }] },
      { key: 'performance_rating_scale', label: 'Rating Scale', type: 'select', defaultValue: '1-5', description: 'Scale used for performance ratings', options: [{ value: '1-3', label: '1-3 (Meets/Exceeds/Below)' }, { value: '1-5', label: '1-5 (Standard 5-point)' }, { value: '1-10', label: '1-10 (Granular 10-point)' }] },
      { key: 'performance_review_window_days', label: 'Review Window (days)', type: 'number', defaultValue: 14, description: 'Number of days the review form stays open for completion', min: 3, max: 60 },
    ],
  },
  {
    title: 'Appraisal Methods',
    description: 'Configure self-appraisal and 360-degree feedback settings',
    icon: <FiTrendingUp className="w-5 h-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    fields: [
      { key: 'performance_self_appraisal_enabled', label: 'Self-Appraisal Enabled', type: 'toggle', defaultValue: true, description: 'Allow employees to submit self-appraisals as part of the review process' },
      { key: 'performance_360_feedback_enabled', label: '360-degree Feedback Enabled', type: 'toggle', defaultValue: false, description: 'Collect feedback from peers, subordinates, and cross-functional colleagues' },
      { key: 'performance_calibration_required', label: 'Calibration Session Required', type: 'toggle', defaultValue: true, description: 'Require a calibration session to normalize ratings across teams before finalization' },
      { key: 'performance_goal_setting_enabled', label: 'Goal Setting (OKR/MB0) Enabled', type: 'toggle', defaultValue: true, description: 'Enable goal or objective setting as part of the performance cycle' },
    ],
  },
  {
    title: 'Feedback & Improvement',
    description: 'Continuous feedback and performance improvement settings',
    icon: <FiUsers className="w-5 h-5" />,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    fields: [
      { key: 'performance_continuous_feedback', label: 'Continuous Feedback Enabled', type: 'toggle', defaultValue: true, description: 'Allow managers and peers to give real-time feedback outside of review cycles' },
      { key: 'performance_pip_enabled', label: 'Performance Improvement Plan (PIP)', type: 'toggle', defaultValue: true, description: 'Enable formal PIP process for underperforming employees' },
      { key: 'performance_pip_duration_days', label: 'PIP Default Duration (days)', type: 'number', defaultValue: 30, description: 'Default duration for a Performance Improvement Plan', min: 7, max: 180 },
      { key: 'performance_rating_visibility', label: 'Rating Visibility', type: 'select', defaultValue: 'manager_only', description: 'Who can see the final performance rating', options: [{ value: 'manager_only', label: 'Manager Only' }, { value: 'employee_and_manager', label: 'Employee & Manager' }, { value: 'team_visible', label: 'Team Visible' }] },
    ],
  },
];

/* ──────────────────────────────────────────────
   Toggle Switch Component
   ────────────────────────────────────────────── */
function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-blue-500' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

/* ──────────────────────────────────────────────
   Info Tooltip Component
   ────────────────────────────────────────────── */
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-nexus-text-muted hover:text-nexus-text-secondary transition-colors"
        aria-label="More info"
      >
        <FiInfo className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg animate-fade-in pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </span>
  );
}

/* ──────────────────────────────────────────────
   Settings Section Card
   ────────────────────────────────────────────── */
function SettingsSectionCard({
  section,
  settings,
  editing,
  onToggleEdit,
  onChange,
  onSave,
  onReset,
  saving,
}: {
  section: SettingSection;
  settings: Record<string, string | number | boolean>;
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (key: string, value: string | number | boolean) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  return (
    <div className="nexus-card">
      <div className="p-6">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${section.iconBg} flex items-center justify-center ${section.iconColor}`}>
              {section.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-nexus-text-primary">{section.title}</h3>
              <p className="text-xs text-nexus-text-muted">{section.description}</p>
            </div>
          </div>
          {!editing ? (
            <button
              onClick={onToggleEdit}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
            >
              <FiEdit2 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <button
              onClick={onReset}
              className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"
              aria-label="Cancel editing"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {section.fields.map((field) => (
            <div key={field.key} className={field.type === 'toggle' ? 'flex items-center justify-between p-4 rounded-lg border border-nexus-border/50' : ''}>
              {field.type === 'toggle' ? (
                <>
                  <div className="pr-4">
                    <label className="text-sm font-medium text-nexus-text-primary flex items-center">
                      {field.label}
                      <InfoTooltip text={field.description} />
                    </label>
                  </div>
                  {editing ? (
                    <ToggleSwitch
                      enabled={!!settings[field.key]}
                      onToggle={() => onChange(field.key, !settings[field.key])}
                    />
                  ) : (
                    <span className={`nexus-badge ${settings[field.key] ? 'nexus-badge-success' : 'bg-slate-50 text-slate-500'}`}>
                      {settings[field.key] ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1.5">
                    {field.label}
                    <InfoTooltip text={field.description} />
                  </label>
                  {editing ? (
                    field.type === 'select' ? (
                      <select
                        value={String(settings[field.key] ?? field.defaultValue)}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : field.type === 'number' ? (
                      <input
                        type="number"
                        value={String(settings[field.key] ?? field.defaultValue)}
                        onChange={(e) => onChange(field.key, Number(e.target.value))}
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(settings[field.key] ?? field.defaultValue)}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    )
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">
                      {field.type === 'select'
                        ? field.options?.find((o) => o.value === String(settings[field.key]))?.label ?? String(settings[field.key] ?? field.defaultValue)
                        : String(settings[field.key] ?? field.defaultValue) || '—'}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Save/Cancel */}
        {editing && (
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
            <button
              onClick={onReset}
              className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 flex items-center gap-2 transition-colors"
            >
              <FiSave className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Sidebar Navigation Item
   ────────────────────────────────────────────── */
type TabKey = 'profile' | 'general' | 'payroll' | 'leave' | 'attendance' | 'employee' | 'recruitment' | 'performance' | 'company' | 'roles' | 'notifications';

interface NavItem {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: 'profile', label: 'My Profile', icon: <FiUser className="w-4 h-4" /> },
  { key: 'general', label: 'General', icon: <FiSettings className="w-4 h-4" /> },
  { key: 'payroll', label: 'Payroll', icon: <FiDollarSign className="w-4 h-4" /> },
  { key: 'leave', label: 'Leave', icon: <FiCalendar className="w-4 h-4" /> },
  { key: 'attendance', label: 'Attendance', icon: <FiClock className="w-4 h-4" /> },
  { key: 'employee', label: 'Employee', icon: <FiUsers className="w-4 h-4" /> },
  { key: 'recruitment', label: 'Recruitment', icon: <FiBriefcase className="w-4 h-4" /> },
  { key: 'performance', label: 'Performance', icon: <FiTrendingUp className="w-4 h-4" /> },
  { key: 'company', label: 'Company', icon: <FiDatabase className="w-4 h-4" /> },
  { key: 'roles', label: 'Roles & Permissions', icon: <FiShield className="w-4 h-4" /> },
  { key: 'notifications', label: 'Notifications', icon: <FiBell className="w-4 h-4" /> },
];

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  // Read tab from URL query parameter
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const validTabs: TabKey[] = ['profile', 'general', 'payroll', 'leave', 'attendance', 'employee', 'recruitment', 'performance', 'company', 'roles', 'notifications'];
  const defaultTab = (tabFromUrl && validTabs.includes(tabFromUrl)) ? tabFromUrl : 'profile';

  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [saving, setSaving] = useState(false);

  // Sync activeTab with URL search params when they change
  useEffect(() => {
    const tabFromUrlUpdate = searchParams.get('tab') as TabKey | null;
    const newTab = (tabFromUrlUpdate && validTabs.includes(tabFromUrlUpdate)) ? tabFromUrlUpdate : 'profile';
    setActiveTab(newTab);
  }, [searchParams]);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /* Profile state */
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string;
    department: string;
    designation: string;
    branch: string;
    employeeId: string;
    dateOfJoining: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /* General settings state */
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [generalForm, setGeneralForm] = useState({
    companyName: '',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    currency: 'INR',
  });

  /* Module settings from localStorage */
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, Record<string, string | number | boolean>>>({});

  /* Notification preferences */
  const [notifPrefs, setNotifPrefs] = useState<NotifPref>(() => {
    if (typeof window === 'undefined') return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
    const stored = localStorage.getItem('nexus_notif_prefs');
    if (stored) {
      try { return JSON.parse(stored) as NotifPref; } catch { /* ignore */ }
    }
    return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
  });

  /* Load settings from localStorage on mount */
  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
  }, []);

  /* Fetch tenant info */
  const fetchTenant = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants?limit=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const t = data.tenants?.[0] || null;
        setTenant(t);
        if (t) {
          setGeneralForm({
            companyName: t.name || '',
            timezone: t.timezone || 'UTC',
            dateFormat: 'MM/DD/YYYY',
            currency: t.currency || 'INR',
          });
        }
      }
    } catch {
      /* ignore - tenant API might not be available */
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchTenant()); }, [fetchTenant]);

  /* Fetch user profile */
  const fetchProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      const res = await fetch('/api/users/profile', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProfileData({
          name: data.name || '',
          email: data.email || '',
          phone: data.employee?.phone || '',
          emergencyContactName: data.employee?.emergencyContactName || '',
          emergencyContactPhone: data.employee?.emergencyContactPhone || '',
          address: data.employee?.address || '',
          city: data.employee?.city || '',
          state: data.employee?.state || '',
          zipCode: data.employee?.zipCode || '',
          country: data.employee?.country || '',
          dateOfBirth: data.employee?.dateOfBirth ? new Date(data.employee.dateOfBirth).toISOString().split('T')[0] : '',
          gender: data.employee?.gender || '',
          bloodGroup: data.employee?.bloodGroup || '',
          department: data.employee?.department || '',
          designation: data.employee?.designation || '',
          branch: data.employee?.branch || '',
          employeeId: data.employee?.employeeId || '',
          dateOfJoining: data.employee?.dateOfJoining ? new Date(data.employee.dateOfJoining).toISOString().split('T')[0] : '',
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setProfileError(errData.error || 'Failed to load profile. Please try again.');
      }
    } catch {
      setProfileError('Network error. Please check your connection and try again.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  /* Save user profile */
  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true);
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: profileData?.name,
          phone: profileData?.phone,
          emergencyContactName: profileData?.emergencyContactName,
          emergencyContactPhone: profileData?.emergencyContactPhone,
          address: profileData?.address,
          city: profileData?.city,
          state: profileData?.state,
          zipCode: profileData?.zipCode,
          country: profileData?.country,
          dateOfBirth: profileData?.dateOfBirth || null,
          gender: profileData?.gender,
          bloodGroup: profileData?.bloodGroup,
        }),
      });
      if (res.ok) {
        toast.success('Profile updated successfully');
        setEditingProfile(false);
        fetchProfile();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update profile');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  /* Get default value for a field */
  const getDefaultValue = useCallback((key: string): string | number | boolean => {
    const allSections = [...payrollSections, ...leaveSections, ...attendanceSections, ...employeeSections, ...recruitmentSections, ...performanceSections];
    for (const section of allSections) {
      const field = section.fields.find((f) => f.key === key);
      if (field) return field.defaultValue;
    }
    return '';
  }, []);

  /* Get current setting value (with default fallback) */
  const getSetting = useCallback((key: string): string | number | boolean => {
    if (key in settings) return settings[key];
    return getDefaultValue(key);
  }, [settings, getDefaultValue]);

  /* Start editing a section */
  const handleStartEdit = useCallback((sectionKey: string) => {
    // Build a draft from current settings
    const allSections = [...payrollSections, ...leaveSections, ...attendanceSections, ...employeeSections, ...recruitmentSections, ...performanceSections];
    const section = allSections.find((s) => s.title === sectionKey);
    if (!section) return;
    const draft: Record<string, string | number | boolean> = {};
    for (const field of section.fields) {
      draft[field.key] = getSetting(field.key);
    }
    setEditDrafts((prev) => ({ ...prev, [sectionKey]: draft }));
    setEditingSection(sectionKey);
  }, [getSetting]);

  /* Update a draft field */
  const handleDraftChange = useCallback((sectionKey: string, key: string, value: string | number | boolean) => {
    setEditDrafts((prev) => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] || {}), [key]: value },
    }));
  }, []);

  /* Cancel editing */
  const handleCancelEdit = useCallback(() => {
    setEditingSection(null);
    setEditDrafts((prev) => {
      const next = { ...prev };
      if (editingSection) delete next[editingSection];
      return next;
    });
  }, [editingSection]);

  /* Save section settings */
  const handleSaveSection = useCallback((sectionKey: string) => {
    const draft = editDrafts[sectionKey];
    if (!draft) return;
    const newSettings = { ...settings, ...draft };
    setSettings(newSettings);
    saveSettings(newSettings);
    setEditingSection(null);
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
    toast.success('Settings saved successfully');
  }, [editDrafts, settings]);

  /* Save general settings */
  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
      if (tenant?.id) {
        const res = await fetch(`/api/tenants/${tenant.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: generalForm.companyName,
            timezone: generalForm.timezone,
            currency: generalForm.currency,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed');
        }
      }
      toast.success('Settings saved successfully');
      setEditingSection(null);
      fetchTenant();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  /* Save notification preferences */
  const handleSaveNotifPrefs = () => {
    try {
      localStorage.setItem('nexus_notif_prefs', JSON.stringify(notifPrefs));
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  /* Access restriction - profile tab is available to all users, other tabs require admin */
  if (!isAdmin && activeTab !== 'profile') {
    return (
      <div className="space-y-6">
        <div className="nexus-card p-12 text-center">
          <FiAlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-nexus-text-primary mb-2">Access Restricted</h2>
          <p className="text-nexus-text-secondary">Only administrators can access Settings.</p>
        </div>
      </div>
    );
  }

  /* Build section cards for module settings tabs */
  const renderModuleSections = (sections: SettingSection[]) => (
    <div className="space-y-4">
      {sections.map((section) => {
        const isEditing = editingSection === section.title;
        const draft = isEditing ? editDrafts[section.title] || {} : {};
        const currentSettings: Record<string, string | number | boolean> = {};
        for (const field of section.fields) {
          currentSettings[field.key] = isEditing ? (draft[field.key] ?? getSetting(field.key)) : getSetting(field.key);
        }
        return (
          <SettingsSectionCard
            key={section.title}
            section={section}
            settings={currentSettings}
            editing={isEditing}
            onToggleEdit={() => {
              if (isEditing) {
                handleCancelEdit();
              } else {
                handleStartEdit(section.title);
              }
            }}
            onChange={(key, value) => handleDraftChange(section.title, key, value)}
            onSave={() => handleSaveSection(section.title)}
            onReset={handleCancelEdit}
            saving={saving}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiSettings className="w-6 h-6 text-slate-500" />
            Settings
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage system configuration and preferences</p>
        </div>
        {/* Mobile tab selector */}
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="md:hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
        >
          <FiMenu className="w-4 h-4" />
          {navItems.find((n) => n.key === activeTab)?.label}
        </button>
      </div>

      {/* Module Tips & Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModuleTips
          moduleKey="settings"
          title="Settings Tips"
          tips={[
            { title: 'Configure Modules First', description: 'Set up payroll, leave, and attendance rules before onboarding employees to ensure smooth operations.' },
            { title: 'Role-Based Access', description: 'Use the Roles & Permissions tab to control who can view and modify different settings sections.' },
            { title: 'Test Changes', description: 'After updating settings, verify the changes by checking the relevant module to ensure they take effect.' },
            { title: 'Backup Settings', description: 'Settings are stored locally — consider documenting critical configurations for recovery purposes.' },
            { title: 'Review Periodically', description: 'Revisit settings quarterly to align policies with evolving organizational needs and compliance requirements.' },
          ]}
          userRole={user?.role}
        />
        <ModuleWorkflow
          moduleKey="settings"
          title="How to Configure System Settings"
          subtitle="Follow this workflow to properly set up your HRMS"
          accentColor="emerald"
          steps={[
            { step: 1, title: 'Review General Settings', description: 'Set company name, timezone, date format, and currency preferences.' },
            { step: 2, title: 'Configure Payroll Rules', description: 'Define pay frequency, overtime calculation, and tax regime defaults.' },
            { step: 3, title: 'Set Leave Policies', description: 'Configure leave year, carry forward rules, and application policies.' },
            { step: 4, title: 'Define Attendance Rules', description: 'Set work hours, late thresholds, weekend rules, and geofencing options.' },
            { step: 5, title: 'Setup Employee Codes', description: 'Configure employee code prefixes, auto-generation, and probation defaults.' },
            { step: 6, title: 'Configure Notifications', description: 'Enable or disable email and module-specific notification preferences.' },
            { step: 7, title: 'Assign Roles & Permissions', description: 'Define role-based access levels for different user types in the system.' },
            { step: 8, title: 'Test Configuration', description: 'Verify all settings are working correctly by testing in relevant modules.' },
          ]}
          userRole={user?.role}
        />
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileSidebarOpen && (
        <div className="md:hidden nexus-card animate-slide-in-down">
          <div className="p-2 space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => { setActiveTab(item.key); setMobileSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.key
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-nexus-text-secondary hover:bg-slate-50'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar Navigation (desktop) */}
        <nav className="hidden md:block w-56 shrink-0">
          <div className="nexus-card p-2 sticky top-24">
            <div className="space-y-0.5">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.key
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-nexus-text-secondary hover:bg-slate-50 hover:text-nexus-text-primary'
                  }`}
                >
                  <span className={activeTab === item.key ? 'text-blue-500' : 'text-nexus-text-muted'}>{item.icon}</span>
                  {item.label}
                  {activeTab === item.key && (
                    <FiCheck className="w-3.5 h-3.5 ml-auto text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {profileLoading ? (
                <div className="nexus-card p-12 text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-nexus-text-muted">Loading profile...</p>
                </div>
              ) : profileError ? (
                <div className="nexus-card p-12 text-center">
                  <FiAlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-nexus-text-primary mb-2">Failed to Load Profile</h2>
                  <p className="text-sm text-nexus-text-secondary mb-4">{profileError}</p>
                  <button
                    onClick={() => fetchProfile()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : profileData ? (
                <>
                  {/* Profile Header Card */}
                  <div className="nexus-card">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                            <FiUser className="w-5 h-5" />
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-nexus-text-primary">My Profile</h2>
                            <p className="text-xs text-nexus-text-muted">View and update your personal information</p>
                          </div>
                        </div>
                        {!editingProfile ? (
                          <button
                            onClick={() => setEditingProfile(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
                          >
                            <FiEdit2 className="w-4 h-4" />
                            Edit Profile
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingProfile(false)}
                            className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"
                          >
                            <FiX className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      {/* Avatar + Name Row */}
                      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-nexus-border">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/20">
                          {profileData.name ? profileData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-nexus-text-primary">{profileData.name || 'User'}</h3>
                          <p className="text-sm text-nexus-text-muted">{profileData.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="nexus-badge nexus-badge-success capitalize">{user?.role?.replace('_', ' ') || 'employee'}</span>
                            {profileData.employeeId && (
                              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono">{profileData.employeeId}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Basic Information */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                          <FiUser className="w-4 h-4 text-blue-500" />
                          Basic Information
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Full Name</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.name} onChange={(e) => setProfileData(p => p ? { ...p, name: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.name || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1 flex items-center gap-1"><FiMail className="w-3 h-3" /> Official Email</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.email || '—'}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1 flex items-center gap-1"><FiPhone className="w-3 h-3" /> Phone</label>
                            {editingProfile ? (
                              <input type="tel" value={profileData.phone} onChange={(e) => setProfileData(p => p ? { ...p, phone: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="+91 98765 43210" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.phone || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Gender</label>
                            {editingProfile ? (
                              <select value={profileData.gender} onChange={(e) => setProfileData(p => p ? { ...p, gender: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                                <option value="">Select</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                              </select>
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 capitalize">{profileData.gender || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date of Birth</label>
                            {editingProfile ? (
                              <input type="date" value={profileData.dateOfBirth} onChange={(e) => setProfileData(p => p ? { ...p, dateOfBirth: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.dateOfBirth ? new Date(profileData.dateOfBirth).toLocaleDateString() : '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Blood Group</label>
                            {editingProfile ? (
                              <select value={profileData.bloodGroup} onChange={(e) => setProfileData(p => p ? { ...p, bloodGroup: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white">
                                <option value="">Select</option>
                                <option value="A+">A+</option><option value="A-">A-</option>
                                <option value="B+">B+</option><option value="B-">B-</option>
                                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                                <option value="O+">O+</option><option value="O-">O-</option>
                              </select>
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.bloodGroup || '—'}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Work Information (read-only) */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                          <FiBriefcase className="w-4 h-4 text-emerald-500" />
                          Work Information
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee ID</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 font-mono">{profileData.employeeId || '—'}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Department</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.department || '—'}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Designation</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.designation || '—'}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Branch</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.branch || '—'}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date of Joining</label>
                            <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.dateOfJoining ? new Date(profileData.dateOfJoining).toLocaleDateString() : '—'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Address Information */}
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                          <FiMapPin className="w-4 h-4 text-violet-500" />
                          Address
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Street Address</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.address} onChange={(e) => setProfileData(p => p ? { ...p, address: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.address || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">City</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.city} onChange={(e) => setProfileData(p => p ? { ...p, city: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.city || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">State</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.state} onChange={(e) => setProfileData(p => p ? { ...p, state: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.state || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ZIP Code</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.zipCode} onChange={(e) => setProfileData(p => p ? { ...p, zipCode: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.zipCode || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.country} onChange={(e) => setProfileData(p => p ? { ...p, country: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.country || '—'}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Emergency Contact */}
                      <div>
                        <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                          <FiHeart className="w-4 h-4 text-red-500" />
                          Emergency Contact
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Contact Name</label>
                            {editingProfile ? (
                              <input type="text" value={profileData.emergencyContactName} onChange={(e) => setProfileData(p => p ? { ...p, emergencyContactName: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.emergencyContactName || '—'}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Contact Phone</label>
                            {editingProfile ? (
                              <input type="tel" value={profileData.emergencyContactPhone} onChange={(e) => setProfileData(p => p ? { ...p, emergencyContactPhone: e.target.value } : p)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                            ) : (
                              <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{profileData.emergencyContactPhone || '—'}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Save/Cancel */}
                      {editingProfile && (
                        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                          <button
                            onClick={() => setEditingProfile(false)}
                            className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveProfile}
                            disabled={profileSaving}
                            className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 flex items-center gap-2 transition-colors"
                          >
                            <FiSave className="w-4 h-4" />
                            {profileSaving ? 'Saving...' : 'Save Profile'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="nexus-card p-12 text-center">
                  <FiUser className="w-12 h-12 text-nexus-text-muted mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-nexus-text-primary mb-2">No Profile Data</h2>
                  <p className="text-nexus-text-secondary">Unable to load your profile information. Please try again later.</p>
                </div>
              )}
            </div>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="nexus-card">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                        <FiGlobe className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-nexus-text-primary">General Settings</h2>
                        <p className="text-xs text-nexus-text-muted">Configure basic application settings</p>
                      </div>
                    </div>
                    {editingSection !== 'general' ? (
                      <button onClick={() => setEditingSection('general')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                        <FiEdit2 className="w-4 h-4" />
                        Edit
                      </button>
                    ) : (
                      <button onClick={() => setEditingSection(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                        <FiX className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                        <span className="flex items-center gap-1"><FiDatabase className="w-3 h-3" /> Company Name</span>
                      </label>
                      {editingSection === 'general' ? (
                        <input type="text" value={generalForm.companyName} onChange={e => setGeneralForm(p => ({ ...p, companyName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.companyName || '—'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                        <span className="flex items-center gap-1"><FiClock className="w-3 h-3" /> Timezone</span>
                      </label>
                      {editingSection === 'general' ? (
                        <select value={generalForm.timezone} onChange={e => setGeneralForm(p => ({ ...p, timezone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">Eastern Time (ET)</option>
                          <option value="America/Chicago">Central Time (CT)</option>
                          <option value="America/Denver">Mountain Time (MT)</option>
                          <option value="America/Los_Angeles">Pacific Time (PT)</option>
                          <option value="Asia/Kolkata">India (IST)</option>
                          <option value="Europe/London">London (GMT)</option>
                          <option value="Asia/Tokyo">Tokyo (JST)</option>
                        </select>
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.timezone}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                        <span className="flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Date Format</span>
                      </label>
                      {editingSection === 'general' ? (
                        <select value={generalForm.dateFormat} onChange={e => setGeneralForm(p => ({ ...p, dateFormat: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.dateFormat}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                        <span className="flex items-center gap-1"><FiDollarSign className="w-3 h-3" /> Currency</span>
                      </label>
                      {editingSection === 'general' ? (
                        <select value={generalForm.currency} onChange={e => setGeneralForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="INR">INR (₹) — Indian Rupee</option>
                          <option value="USD">USD ($) — US Dollar</option>
                          <option value="EUR">EUR (€) — Euro</option>
                          <option value="GBP">GBP (£) — British Pound</option>
                          <option value="SGD">SGD (S$) — Singapore Dollar</option>
                          <option value="AED">AED (د.إ) — UAE Dirham</option>
                          <option value="AUD">AUD (A$) — Australian Dollar</option>
                          <option value="CAD">CAD (C$) — Canadian Dollar</option>
                          <option value="JPY">JPY (¥) — Japanese Yen</option>
                          <option value="CNY">CNY (¥) — Chinese Yuan</option>
                        </select>
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.currency}</p>
                      )}
                    </div>
                  </div>

                  {editingSection === 'general' && (
                    <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                      <button onClick={() => setEditingSection(null)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                      <button onClick={handleSaveGeneral} disabled={saving} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 flex items-center gap-2 transition-colors">
                        <FiSave className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payroll Tab */}
          {activeTab === 'payroll' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiDollarSign className="w-5 h-5 text-emerald-500" />
                  Payroll Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Configure payroll processing, tax, and calculation rules</p>
              </div>
              {renderModuleSections(payrollSections)}
            </div>
          )}

          {/* Leave Tab */}
          {activeTab === 'leave' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiCalendar className="w-5 h-5 text-blue-500" />
                  Leave Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Manage leave policies, carry forward rules, and special leaves</p>
              </div>
              {renderModuleSections(leaveSections)}
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiClock className="w-5 h-5 text-orange-500" />
                  Attendance Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Define work hours, attendance thresholds, and geofencing rules</p>
              </div>
              {renderModuleSections(attendanceSections)}
            </div>
          )}

          {/* Employee Tab */}
          {activeTab === 'employee' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiUsers className="w-5 h-5 text-indigo-500" />
                  Employee Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Configure employee code generation, probation, and access policies</p>
              </div>
              {renderModuleSections(employeeSections)}
            </div>
          )}

          {/* Recruitment Tab */}
          {activeTab === 'recruitment' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiBriefcase className="w-5 h-5 text-amber-500" />
                  Recruitment Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Configure hiring pipeline, offer letters, and application defaults</p>
              </div>
              {renderModuleSections(recruitmentSections)}
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="space-y-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                  <FiTrendingUp className="w-5 h-5 text-violet-500" />
                  Performance Settings
                </h2>
                <p className="text-xs text-nexus-text-muted mt-0.5">Configure review cycles, appraisal methods, and feedback settings</p>
              </div>
              {renderModuleSections(performanceSections)}
            </div>
          )}

          {/* Company Tab */}
          {activeTab === 'company' && (
            <div className="space-y-4">
              <div className="nexus-card">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                      <FiDatabase className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-nexus-text-primary">Company Information</h2>
                      <p className="text-xs text-nexus-text-muted">Current tenant configuration</p>
                    </div>
                  </div>

                  {tenant ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Company Name</label>
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(() => { const n = tenant.name || ''; return !n.toLowerCase().includes('3 boxes') ? '3 Boxes Corp' : n; })()}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Slug</label>
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 font-mono">{tenant.slug}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Domain</label>
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{tenant.domain || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Plan</label>
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 capitalize">{tenant.plan}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                        <span className={`nexus-badge ${tenant.status === 'active' ? 'nexus-badge-success' : 'nexus-badge-warning'}`}>{tenant.status}</span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label>
                        <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{tenant.country || '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FiDatabase className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No tenant information available</p>
                      <p className="text-sm text-nexus-text-muted mt-1">Tenant data will appear once configured</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Roles & Permissions Tab */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div className="nexus-card">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
                      <FiShield className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-nexus-text-primary">Roles & Permissions</h2>
                      <p className="text-xs text-nexus-text-muted">View role definitions and access levels</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {rolesData.map(role => (
                      <div key={role.key} className="p-4 rounded-lg border border-nexus-border/50 hover:border-nexus-border transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                              role.key === 'super_admin' ? 'bg-red-500' :
                              role.key === 'tenant_admin' ? 'bg-orange-500' :
                              role.key === 'hr_admin' ? 'bg-blue-500' :
                              role.key === 'manager' ? 'bg-emerald-500' :
                              'bg-slate-500'
                            }`}>
                              {role.name.split(' ').map(w => w[0]).join('')}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-nexus-text-primary">{role.name}</p>
                              <p className="text-xs text-nexus-text-muted">{role.description}</p>
                            </div>
                          </div>
                          <span className={`nexus-badge ${role.key === user?.role ? 'nexus-badge-success' : 'bg-slate-50 text-slate-500'}`}>
                            {role.key === user?.role ? 'Your Role' : role.key}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {role.permissions.map(perm => (
                            <span key={perm} className="text-[10px] px-2 py-1 rounded-md bg-slate-50 text-nexus-text-secondary font-medium border border-nexus-border/50">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 mt-4">
                    <p className="text-xs text-amber-700 font-medium">Role management is currently view-only</p>
                    <p className="text-xs text-amber-600 mt-0.5">Custom role creation and permission editing will be available in a future update.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="nexus-card">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                      <FiBell className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-nexus-text-primary">Notification Preferences</h2>
                      <p className="text-xs text-nexus-text-muted">Choose what notifications you receive</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'email' as const, label: 'Email Notifications', desc: 'Receive notifications via email' },
                      { key: 'leave' as const, label: 'Leave Updates', desc: 'Leave request approvals and rejections' },
                      { key: 'payroll' as const, label: 'Payroll Alerts', desc: 'Payroll processing and payment notifications' },
                      { key: 'recruitment' as const, label: 'Recruitment Updates', desc: 'New applications and interview schedules' },
                      { key: 'workflow' as const, label: 'Workflow Notifications', desc: 'Approval requests and workflow updates' },
                      { key: 'system' as const, label: 'System Alerts', desc: 'System maintenance and announcements' },
                    ].map(pref => (
                      <div key={pref.key} className="flex items-center justify-between p-4 rounded-lg border border-nexus-border/50 hover:border-nexus-border transition-colors">
                        <div>
                          <p className="text-sm font-medium text-nexus-text-primary">{pref.label}</p>
                          <p className="text-xs text-nexus-text-muted">{pref.desc}</p>
                        </div>
                        <ToggleSwitch
                          enabled={notifPrefs[pref.key]}
                          onToggle={() => setNotifPrefs(p => ({ ...p, [pref.key]: !p[pref.key] }))}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end mt-6 pt-4 border-t border-nexus-border">
                    <button onClick={handleSaveNotifPrefs} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/25 transition-colors flex items-center gap-2">
                      <FiSave className="w-4 h-4" />
                      Save Preferences
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
