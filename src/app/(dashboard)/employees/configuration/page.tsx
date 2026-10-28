'use client'

/**
 * Employee Configuration — standalone page (Task 87).
 *
 * The "Configuration" tab used to live inside /employees/settings. Per the
 * Task 87 request ("keep the approver workflows and configuration in all the
 * modules separate and remove them from the current options/configurations")
 * it is now its own page with its own sidebar entry, exactly like the
 * attendance module's separate Policy Rules / Approval Workflows pages.
 *
 * Same storage contract as before: settings are read from AND written to BOTH
 * the canonical '3boxes_hrms_settings' key (which the Add Employee form reads)
 * and the legacy '3boxes_hrms_employee_settings' key, so behaviour is
 * identical to when this panel was a tab.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FiSettings, FiClock, FiRefreshCw, FiShield, FiLock, FiSave, FiEdit2, FiX,
  FiToggleLeft, FiToggleRight, FiUserCheck, FiUser, FiArrowLeft, FiCheckSquare,
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { canAccessEmployeeSettings } from '@/lib/roleAccess'

/* ── Setting Types ── */
type SettingType = 'toggle' | 'select' | 'number' | 'text'

interface SettingField {
  key: string
  label: string
  type: SettingType
  defaultValue: string | number | boolean
  description: string
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

interface SettingSection {
  title: string
  description: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  fields: SettingField[]
}

/* ── Employee Setting Definitions (mapped from Governance Settings) ── */
const employeeSettingSections: SettingSection[] = [
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
    ],
  },
  {
    title: 'Login & Security',
    description: 'Password policies and login security settings',
    icon: <FiLock className="w-5 h-5" />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    fields: [
      { key: 'employee_password_min_length', label: 'Minimum Password Length', type: 'number', defaultValue: 8, description: 'Minimum characters required for employee passwords', min: 6, max: 32 },
      { key: 'employee_password_require_special', label: 'Require Special Characters', type: 'toggle', defaultValue: true, description: 'Passwords must contain at least one special character' },
      { key: 'employee_password_expiry_days', label: 'Password Expiry (days)', type: 'number', defaultValue: 90, description: 'Number of days before password must be changed (0 = never)', min: 0, max: 365 },
      { key: 'employee_login_max_attempts', label: 'Max Login Attempts Before Lock', type: 'number', defaultValue: 5, description: 'Failed login attempts before account is temporarily locked', min: 3, max: 10 },
      { key: 'employee_auto_lock_inactive_days', label: 'Auto-lock Inactive Accounts (days)', type: 'number', defaultValue: 90, description: 'Automatically disable accounts inactive for this many days (0 = never)', min: 0, max: 365 },
    ],
  },
  {
    title: 'Onboarding & Separation',
    description: 'Settings for employee onboarding and exit processes',
    icon: <FiRefreshCw className="w-5 h-5" />,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
    fields: [
      { key: 'employee_auto_create_login', label: 'Auto-create Login on Onboarding', type: 'toggle', defaultValue: true, description: 'Automatically create a login account when an employee is onboarded' },
      { key: 'employee_default_role', label: 'Default Login Role', type: 'select', defaultValue: 'employee', description: 'Default role assigned to new employee login accounts', options: [{ value: 'employee', label: 'Employee' }, { value: 'admin', label: 'Admin' }] },
      { key: 'employee_send_welcome_email', label: 'Send Welcome Email on Onboarding', type: 'toggle', defaultValue: true, description: 'Automatically send a welcome email with login credentials when onboarding' },
      { key: 'employee_disable_account_on_exit', label: 'Disable Account on Separation', type: 'toggle', defaultValue: true, description: 'Automatically disable login account when employee is terminated/resigned' },
      { key: 'employee_exit_clearance_required', label: 'Exit Clearance Required', type: 'toggle', defaultValue: true, description: 'Require clearance approval before final account deactivation' },
    ],
  },
]

/* ── localStorage Helpers (same contract as the old settings tab) ──
 *
 * IMPORTANT: We write to BOTH the canonical '3boxes_hrms_settings' key
 * (which the Add Employee form reads from) AND the legacy
 * '3boxes_hrms_employee_settings' key (for backwards compatibility).
 */
const CANONICAL_SETTINGS_KEY = '3boxes_hrms_settings'
const EMP_SETTINGS_KEY = '3boxes_hrms_employee_settings'

function loadEmployeeSettings(): Record<string, string | number | boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const canonical = localStorage.getItem(CANONICAL_SETTINGS_KEY)
    if (canonical) return JSON.parse(canonical)
    const legacy = localStorage.getItem(EMP_SETTINGS_KEY)
    if (legacy) return JSON.parse(legacy)
  } catch { /* ignore */ }
  return {}
}

function saveEmployeeSettings(settings: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CANONICAL_SETTINGS_KEY, JSON.stringify(settings))
    localStorage.setItem(EMP_SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

function getSettingValue(key: string, fields: SettingField[], settings: Record<string, string | number | boolean>): string | number | boolean {
  if (key in settings) return settings[key]
  const field = fields.find(f => f.key === key)
  return field?.defaultValue ?? ''
}

export default function EmployeeConfigurationPage() {
  const { user } = useAuthStore()
  const isAdmin = canAccessEmployeeSettings(user?.role)

  const [empSettings, setEmpSettings] = useState<Record<string, string | number | boolean>>({})
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editDrafts, setEditDrafts] = useState<Record<string, Record<string, string | number | boolean>>>({})

  useEffect(() => {
    setEmpSettings(loadEmployeeSettings())
  }, [])

  /* Settings handlers */
  const handleStartEdit = (sectionTitle: string) => {
    const section = employeeSettingSections.find(s => s.title === sectionTitle)
    if (!section) return
    const draft: Record<string, string | number | boolean> = {}
    section.fields.forEach(f => {
      draft[f.key] = getSettingValue(f.key, section.fields, empSettings)
    })
    setEditDrafts(prev => ({ ...prev, [sectionTitle]: draft }))
    setEditingSection(sectionTitle)
  }

  const handleDraftChange = (sectionTitle: string, key: string, value: string | number | boolean) => {
    setEditDrafts(prev => ({
      ...prev,
      [sectionTitle]: { ...(prev[sectionTitle] || {}), [key]: value },
    }))
  }

  const handleSaveSection = (sectionTitle: string) => {
    const draft = editDrafts[sectionTitle]
    if (!draft) return
    const next = { ...empSettings, ...draft }
    setEmpSettings(next)
    saveEmployeeSettings(next)
    const nextDrafts = { ...editDrafts }
    delete nextDrafts[sectionTitle]
    setEditDrafts(nextDrafts)
    setEditingSection(null)
    toast.success(`${sectionTitle} settings saved`)
  }

  const handleCancelEdit = () => {
    setEditingSection(null)
  }

  const renderSettingField = (field: SettingField, value: string | number | boolean, onChange: (val: string | number | boolean) => void, isEditing: boolean) => {
    if (!isEditing) {
      const displayValue = field.type === 'toggle' ? (value ? 'Enabled' : 'Disabled')
        : field.type === 'select' ? (field.options?.find(o => o.value === value)?.label || String(value))
        : String(value)
      return (
        <div className="flex items-center justify-between py-2">
          <div className="flex-1 min-w-0 mr-4">
            <p className="text-sm text-thb-text-primary font-medium">{field.label}</p>
            <p className="text-xs text-thb-text-muted mt-0.5">{field.description}</p>
          </div>
          <div className="flex-shrink-0">
            {field.type === 'toggle' ? (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {value ? <FiToggleRight className="w-3.5 h-3.5" /> : <FiToggleLeft className="w-3.5 h-3.5" />}
                {displayValue}
              </span>
            ) : (
              <span className="text-sm font-medium text-thb-text-primary bg-slate-50 px-3 py-1.5 rounded-lg">{displayValue || '—'}</span>
            )}
          </div>
        </div>
      )
    }

    // Editing mode
    return (
      <div className="py-2">
        <label className="block text-sm text-thb-text-primary font-medium mb-1">{field.label}</label>
        <p className="text-xs text-thb-text-muted mb-2">{field.description}</p>
        {field.type === 'toggle' ? (
          <button
            onClick={() => onChange(!value)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${value ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {value ? <FiToggleRight className="w-4 h-4" /> : <FiToggleLeft className="w-4 h-4" />}
            {value ? 'Enabled' : 'Disabled'}
          </button>
        ) : field.type === 'select' ? (
          <select
            value={String(value)}
            onChange={e => onChange(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        ) : field.type === 'number' ? (
          <input
            type="number"
            value={Number(value)}
            onChange={e => onChange(Number(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        ) : (
          <input
            type="text"
            value={String(value)}
            onChange={e => onChange(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        )}
      </div>
    )
  }

  /* ── Render ── */
  if (!isAdmin) {
    return (
      <div className="py-16 text-center text-sm text-thb-text-muted">
        You do not have access to Employee Configuration.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-cyan-600 flex items-center justify-center shadow-md">
            <FiSettings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Employee Configuration</h1>
            <p className="text-sm text-thb-text-secondary">Employee code generation, probation defaults, access permissions, login security &amp; onboarding/separation — separate from Employee Settings</p>
          </div>
        </div>
        <Link href="/employees/settings" className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Employee Settings
        </Link>
      </div>

      {/* Intro banner */}
      <div className="thb-card border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/60 to-emerald-50/40">
        <div className="p-4 flex items-start gap-3">
          <FiSettings className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-900 mb-1">Employee Configuration</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Configure employee code generation, probation defaults, access permissions, login security policies,
              and onboarding/separation settings. These settings are applied across the Employee module.
              Approval Workflows are configured separately on the{' '}
              <Link href="/employees/approval-config" className="text-green-600 hover:underline font-medium">Approval Workflows</Link> page.
            </p>
          </div>
        </div>
      </div>

      {/* Sections */}
      {employeeSettingSections.map(section => {
        const isEditing = editingSection === section.title
        const draft = editDrafts[section.title] || {}
        const allFields = section.fields
        return (
          <div key={section.title} className="thb-card overflow-hidden">
            <div className="px-5 py-4 border-b border-thb-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${section.iconBg} ${section.iconColor}`}>
                  {section.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-thb-text-primary">{section.title}</h3>
                  <p className="text-xs text-thb-text-muted mt-0.5">{section.description}</p>
                </div>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button onClick={handleSaveSection.bind(null, section.title)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors">
                    <FiSave className="w-3.5 h-3.5" /> Save
                  </button>
                  <button onClick={handleCancelEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-thb-border text-thb-text-secondary rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors">
                    <FiX className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => handleStartEdit(section.title)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-thb-border text-thb-text-secondary rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors">
                  <FiEdit2 className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            <div className="px-5 py-3 divide-y divide-thb-border">
              {allFields.map(field => {
                const value = isEditing
                  ? (draft[field.key] ?? getSettingValue(field.key, allFields, empSettings))
                  : getSettingValue(field.key, allFields, empSettings)
                const onChange = (val: string | number | boolean) => handleDraftChange(section.title, field.key, val)
                return (
                  <div key={field.key}>
                    {renderSettingField(field, value, onChange, isEditing)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Cross-link footer: keep the module's config surfaces discoverable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/employees/settings" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
          <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
            <FiUser className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Employee Settings</p>
            <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
              Login credentials, invitations, bulk operations, company mapping and custom fields.
            </p>
          </div>
        </Link>
        <Link href="/employees/approval-config" className="thb-card p-4 flex items-start gap-3 hover:border-violet-300 hover:shadow-sm transition-all group">
          <div className="p-2 rounded-lg bg-violet-50 text-violet-500 flex-shrink-0">
            <FiCheckSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-thb-text-primary group-hover:text-violet-700">Approval Workflows</p>
            <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
              Multi-tier approver routing for employee profile updates and lifecycle requests.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}
