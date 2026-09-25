'use client';

/**
 * ModuleSettingsPanel — shared, self-contained component that renders a list
 * of SettingSection cards with full edit/save/cancel/reset state management.
 *
 * Extracted from src/app/(dashboard)/settings/page.tsx in Task 56 so the same
 * module-level settings (Payroll / Leave / Attendance / Employee / Recruitment /
 * Performance) can be rendered inside each module's own settings page without
 * duplication. The /settings page no longer hosts these tabs.
 *
 * Settings are stored in localStorage under the key `3boxes_hrms_settings`
 * (same key the legacy /settings page used — so existing saved values are
 * preserved when an admin visits the new module settings pages).
 */
import React, { useEffect, useState } from 'react';
import {
  FiCalendar, FiClock, FiDollarSign, FiSettings, FiGlobe,
  FiUserCheck, FiShield, FiBriefcase, FiTrendingUp, FiUsers,
  FiEdit2, FiX, FiSave, FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
export type SettingType = 'toggle' | 'select' | 'number' | 'text';

export interface SettingField {
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

export interface SettingSection {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  fields: SettingField[];
}

/* ──────────────────────────────────────────────
   localStorage Helper (same key as legacy /settings page)
   ────────────────────────────────────────────── */
const SETTINGS_KEY = '3boxes_hrms_settings';

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
   Section Definitions (one array per module)
   ────────────────────────────────────────────── */
export const payrollSections: SettingSection[] = [
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

export const leaveSections: SettingSection[] = [
  {
    title: 'Leave Year & Carry Forward',
    description: 'Configure leave year start and carry forward rules',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
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
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
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

export const attendanceSections: SettingSection[] = [
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

export const employeeSections: SettingSection[] = [
  {
    title: 'Employee Code',
    description: 'Configure employee code generation rules',
    icon: <FiUserCheck className="w-5 h-5" />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
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
      { key: 'employee_data_locked', label: 'Lock Employee Data', type: 'toggle', defaultValue: false, description: 'When ON, employee ID, official email, and employment details (department, designation, branch, reporting manager, employee type/status) are read-only for ALL employees. Only the tenant admin can unlock to make changes.' },
    ],
  },
];

export const recruitmentSections: SettingSection[] = [
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

export const performanceSections: SettingSection[] = [
  {
    title: 'Review Cycle',
    description: 'Configure performance review cycle settings',
    icon: <FiCalendar className="w-5 h-5" />,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
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
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-green-500' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
        className="text-thb-text-muted hover:text-thb-text-secondary transition-colors"
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
    <div className="thb-card">
      <div className="p-6">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${section.iconBg} flex items-center justify-center ${section.iconColor}`}>
              {section.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-thb-text-primary">{section.title}</h3>
              <p className="text-xs text-thb-text-muted">{section.description}</p>
            </div>
          </div>
          {!editing ? (
            <button
              onClick={onToggleEdit}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
            >
              <FiEdit2 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <button
              onClick={onReset}
              className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"
              aria-label="Cancel editing"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {section.fields.map((field) => (
            <div key={field.key} className={field.type === 'toggle' ? 'flex items-center justify-between p-4 rounded-lg border border-thb-border/50' : ''}>
              {field.type === 'toggle' ? (
                <>
                  <div className="pr-4">
                    <label className="text-sm font-medium text-thb-text-primary flex items-center">
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
                    <span className={`thb-badge ${settings[field.key] ? 'thb-badge-success' : 'bg-slate-50 text-slate-500'}`}>
                      {settings[field.key] ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">
                    {field.label}
                    <InfoTooltip text={field.description} />
                  </label>
                  {editing ? (
                    field.type === 'select' ? (
                      <select
                        value={String(settings[field.key] ?? field.defaultValue)}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
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
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(settings[field.key] ?? field.defaultValue)}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      />
                    )
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">
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
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
            <button
              onClick={onReset}
              className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm shadow-green-500/25 flex items-center gap-2 transition-colors"
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
   Main Panel Component
   ────────────────────────────────────────────── */
export default function ModuleSettingsPanel({ sections }: { sections: SettingSection[] }) {
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, Record<string, string | number | boolean>>>({});

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const getSetting = (key: string): string | number | boolean => {
    // Find the field's default value
    for (const section of sections) {
      const field = section.fields.find(f => f.key === key);
      if (field) {
        return settings[key] ?? field.defaultValue;
      }
    }
    return settings[key] ?? '';
  };

  const handleStartEdit = (sectionTitle: string) => {
    const draft: Record<string, string | number | boolean> = {};
    const section = sections.find(s => s.title === sectionTitle);
    if (section) {
      for (const field of section.fields) {
        draft[field.key] = getSetting(field.key);
      }
    }
    setEditDrafts(prev => ({ ...prev, [sectionTitle]: draft }));
    setEditingSection(sectionTitle);
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditDrafts({});
  };

  const handleDraftChange = (sectionTitle: string, key: string, value: string | number | boolean) => {
    setEditDrafts(prev => ({
      ...prev,
      [sectionTitle]: { ...(prev[sectionTitle] || {}), [key]: value },
    }));
  };

  const handleSaveSection = async (sectionTitle: string) => {
    setSaving(true);
    try {
      const draft = editDrafts[sectionTitle] || {};
      const newSettings = { ...settings, ...draft };
      saveSettings(newSettings);
      setSettings(newSettings);
      setEditingSection(null);
      setEditDrafts({});
      toast.success('Settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
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
}
