'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FiSettings, FiUsers, FiMail, FiLock, FiKey, FiEye, FiEyeOff,
  FiCopy, FiCheck, FiSend, FiRefreshCw, FiSearch, FiAlertTriangle,
  FiUserCheck, FiUserX, FiPlus, FiTrash2, FiShield, FiToggleLeft,
  FiToggleRight, FiDownload, FiX, FiChevronDown, FiFilter
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

/* ── Types ── */
interface EmployeeCredential {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  status: string
  department: string
  designation: string
  hasLoginAccount: boolean
  loginEmail: string
  loginStatus: string
  lastLogin: string | null
  userRole: string | null
}

interface Department {
  id: string
  name: string
}

type TabKey = 'credentials' | 'invite' | 'bulk'

/* ── Password generator ── */
function generatePassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special
  let pwd = ''
  pwd += upper[Math.floor(Math.random() * upper.length)]
  pwd += lower[Math.floor(Math.random() * lower.length)]
  pwd += digits[Math.floor(Math.random() * digits.length)]
  pwd += special[Math.floor(Math.random() * special.length)]
  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)]
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export default function EmployeeSettingsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin'

  /* State */
  const [activeTab, setActiveTab] = useState<TabKey>('credentials')
  const [employees, setEmployees] = useState<EmployeeCredential[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  // Password actions
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordModalMode, setPasswordModalMode] = useState<'single' | 'selected' | 'all'>('single')
  const [manualPassword, setManualPassword] = useState('')
  const [useAutoPassword, setUseAutoPassword] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [passwordResults, setPasswordResults] = useState<Array<{
    employeeId: string; name: string; email: string; password: string; action: string; success: boolean; error?: string
  }> | null>(null)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  // Invite
  const [inviteProcessing, setInviteProcessing] = useState(false)
  const [inviteResults, setInviteResults] = useState<Array<{
    employeeId: string; name: string; email: string; password: string; success: boolean; error?: string
  }> | null>(null)

  // Detail modal
  const [detailEmployee, setDetailEmployee] = useState<EmployeeCredential | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editEmail, setEditEmail] = useState('')

  /* Fetch data */
  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterDept) params.set('departmentId', filterDept)
      const res = await fetch(`/api/employees/credentials?${params.toString()}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setEmployees(data.employees || [])
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [search, filterDept])

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setDepartments((data.departments || data || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])
  useEffect(() => { fetchDepartments() }, [fetchDepartments])

  /* Selection */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      const filtered = getFilteredEmployees()
      setSelectedIds(new Set(filtered.map(e => e.id)))
      setSelectAll(true)
    }
  }

  /* Filter */
  const getFilteredEmployees = () => {
    let list = employees
    if (filterStatus === 'has_account') list = list.filter(e => e.hasLoginAccount)
    if (filterStatus === 'no_account') list = list.filter(e => !e.hasLoginAccount)
    if (filterStatus === 'active') list = list.filter(e => e.loginStatus === 'active')
    if (filterStatus === 'inactive') list = list.filter(e => e.loginStatus === 'inactive')
    return list
  }

  const filteredEmployees = getFilteredEmployees()

  /* Stats */
  const totalEmployees = employees.length
  const withAccount = employees.filter(e => e.hasLoginAccount).length
  const withoutAccount = totalEmployees - withAccount
  const activeAccounts = employees.filter(e => e.loginStatus === 'active').length
  const inactiveAccounts = employees.filter(e => e.loginStatus === 'inactive').length

  /* Password operations */
  const handlePasswordAction = async () => {
    setProcessing(true)
    setPasswordResults(null)
    try {
      const ids = passwordModalMode === 'all'
        ? filteredEmployees.map(e => e.id)
        : passwordModalMode === 'selected'
          ? Array.from(selectedIds)
          : [detailEmployee?.id || '']

      const res = await fetch('/api/employees/credentials', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          mode: passwordModalMode,
          employeeIds: ids,
          password: useAutoPassword ? undefined : manualPassword || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setPasswordResults(data.results || [])
        toast.success(data.message || 'Passwords processed')
        fetchEmployees()
      } else {
        toast.error(data.error || 'Operation failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(false)
    }
  }

  /* Invite */
  const handleInvite = async (mode: 'selected' | 'all') => {
    setInviteProcessing(true)
    setInviteResults(null)
    try {
      const ids = mode === 'all'
        ? filteredEmployees.map(e => e.id)
        : Array.from(selectedIds)

      if (ids.length === 0) {
        toast.error('No employees selected')
        setInviteProcessing(false)
        return
      }

      const res = await fetch('/api/employees/invite', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          mode,
          employeeIds: ids,
          generateNewPassword: true,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setInviteResults(data.results || [])
        toast.success(data.message || 'Invites processed')
        fetchEmployees()
      } else {
        toast.error(data.error || 'Invite failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setInviteProcessing(false)
    }
  }

  /* Single employee actions */
  const handleToggleStatus = async (emp: EmployeeCredential) => {
    try {
      const res = await fetch('/api/employees/credentials', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: emp.id, action: 'toggle_status' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        fetchEmployees()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error('Failed to toggle status')
    }
  }

  const handleDeleteAccount = async (emp: EmployeeCredential) => {
    if (!confirm(`Remove login account for ${emp.firstName} ${emp.lastName}? They will no longer be able to sign in.`)) return
    try {
      const res = await fetch('/api/employees/credentials', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: emp.id, action: 'delete_account' }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        setDetailEmployee(null)
        fetchEmployees()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error('Failed to delete account')
    }
  }

  const handleResetSinglePassword = async () => {
    if (!detailEmployee) return
    setProcessing(true)
    try {
      const res = await fetch('/api/employees/credentials', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: detailEmployee.id,
          action: 'reset_password',
          password: editPassword || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Password reset successfully')
        setPasswordResults([{ employeeId: detailEmployee.employeeId, name: `${detailEmployee.firstName} ${detailEmployee.lastName}`, email: detailEmployee.email, password: data.password, action: 'reset', success: true }])
        fetchEmployees()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error('Failed to reset password')
    } finally {
      setProcessing(false)
    }
  }

  /* Copy to clipboard */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  /* Export credentials as CSV */
  const handleExportCSV = () => {
    const rows = [['Employee ID', 'Name', 'Email', 'Department', 'Has Account', 'Login Status', 'Last Login']]
    filteredEmployees.forEach(e => {
      rows.push([e.employeeId, `${e.firstName} ${e.lastName}`, e.email, e.department, e.hasLoginAccount ? 'Yes' : 'No', e.loginStatus, e.lastLogin || ''])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'employee_credentials.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const toggleShowPassword = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }))
  }

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-md">
            <FiSettings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Employee Settings</h1>
            <p className="text-sm text-thb-text-secondary">Manage login credentials, passwords & invitations</p>
          </div>
        </div>
        <button onClick={handleExportCSV} className="inline-flex items-center gap-2 px-4 py-2.5 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors">
          <FiDownload className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="thb-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600"><FiUsers className="w-5 h-5" /></div>
          <div><p className="text-xs text-thb-text-secondary">Total</p><p className="text-lg font-bold text-thb-text-primary">{totalEmployees}</p></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600"><FiUserCheck className="w-5 h-5" /></div>
          <div><p className="text-xs text-thb-text-secondary">With Account</p><p className="text-lg font-bold text-emerald-600">{withAccount}</p></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600"><FiUserX className="w-5 h-5" /></div>
          <div><p className="text-xs text-thb-text-secondary">No Account</p><p className="text-lg font-bold text-amber-600">{withoutAccount}</p></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600"><FiShield className="w-5 h-5" /></div>
          <div><p className="text-xs text-thb-text-secondary">Active</p><p className="text-lg font-bold text-violet-600">{activeAccounts}</p></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="thb-card p-1">
        <div className="flex gap-1">
          {([
            { key: 'credentials' as TabKey, label: 'Login Credentials', icon: FiKey },
            { key: 'invite' as TabKey, label: 'Invite Employees', icon: FiSend },
            { key: 'bulk' as TabKey, label: 'Bulk Operations', icon: FiRefreshCw },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'bg-violet-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
              }`}
            >
              <tab.icon className="w-4 h-4" /> <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CREDENTIALS TAB ═══ */}
      {activeTab === 'credentials' && (
        <div className="space-y-4">
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              />
            </div>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20">
              <option value="">All Status</option>
              <option value="has_account">Has Account</option>
              <option value="no_account">No Account</option>
              <option value="active">Account Active</option>
              <option value="inactive">Account Inactive</option>
            </select>
          </div>

          {/* Employee Table */}
          <div className="thb-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border bg-slate-50/80">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectAll && filteredEmployees.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-violet-500 focus:ring-violet-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Login Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Account Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Last Login</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-thb-border">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" /></td></tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-thb-text-muted">No employees found</td></tr>
                  ) : filteredEmployees.map(emp => (
                    <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(emp.id) ? 'bg-violet-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(emp.id)}
                          onChange={() => toggleSelect(emp.id)}
                          className="rounded border-slate-300 text-violet-500 focus:ring-violet-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-thb-text-primary">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-thb-text-muted">{emp.employeeId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-thb-text-secondary">{emp.loginEmail}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-thb-text-secondary">{emp.department}</span>
                      </td>
                      <td className="px-4 py-3">
                        {!emp.hasLoginAccount ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <FiUserX className="w-3 h-3" /> No Account
                          </span>
                        ) : emp.loginStatus === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <FiUserCheck className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            <FiUserX className="w-3 h-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-thb-text-muted">{emp.lastLogin ? new Date(emp.lastLogin).toLocaleDateString() : '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {emp.hasLoginAccount && (
                            <button onClick={() => handleToggleStatus(emp)} className="p-1.5 rounded-lg text-thb-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title={emp.loginStatus === 'active' ? 'Disable Account' : 'Enable Account'}>
                              {emp.loginStatus === 'active' ? <FiToggleRight className="w-4 h-4" /> : <FiToggleLeft className="w-4 h-4" />}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setDetailEmployee(emp)
                              setEditPassword('')
                              setEditEmail(emp.email)
                              setPasswordResults(null)
                            }}
                            className="p-1.5 rounded-lg text-thb-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            title="Manage Credentials"
                          >
                            <FiKey className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INVITE TAB ═══ */}
      {activeTab === 'invite' && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="thb-card border-l-4 border-l-violet-500 bg-gradient-to-r from-violet-50/60 to-indigo-50/40">
            <div className="p-4 flex items-start gap-3">
              <FiSend className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 mb-1">Invite Employees to HRMS</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Send login invitations to employees via email. Each invitation includes the employee&apos;s login email,
                  an auto-generated password, and a direct login link. Employees without accounts will have one created automatically.
                  New passwords are generated for each invite to ensure security.
                </p>
              </div>
            </div>
          </div>

          {/* Selection Summary */}
          <div className="thb-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-thb-text-primary">Select Employees to Invite</h3>
                <p className="text-xs text-thb-text-muted mt-1">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} employee(s) selected`
                    : 'Use the Credentials tab to select employees, or invite all below'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-thb-text-muted bg-slate-50 px-2 py-1 rounded">
                  {withoutAccount} without accounts
                </span>
              </div>
            </div>

            {/* Quick select without-account employees */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => {
                  const noAccountIds = employees.filter(e => !e.hasLoginAccount).map(e => e.id)
                  setSelectedIds(new Set(noAccountIds))
                  setActiveTab('invite')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <FiFilter className="w-3.5 h-3.5" /> Select employees without accounts
              </button>
            </div>

            {/* Invite Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleInvite('selected')}
                disabled={inviteProcessing || selectedIds.size === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm shadow-sm shadow-violet-500/25 transition-colors disabled:opacity-50"
              >
                {inviteProcessing ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Inviting...</> : <><FiSend className="w-4 h-4" /> Invite Selected ({selectedIds.size})</>}
              </button>
              <button
                onClick={() => handleInvite('all')}
                disabled={inviteProcessing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium text-sm shadow-sm shadow-indigo-500/25 transition-colors disabled:opacity-50"
              >
                {inviteProcessing ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Processing...</> : <><FiMail className="w-4 h-4" /> Invite All Employees</>}
              </button>
            </div>
          </div>

          {/* Invite Results */}
          {inviteResults && (
            <div className="thb-card">
              <div className="p-4 border-b border-thb-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-thb-text-primary">Invite Results</h3>
                <button onClick={() => setInviteResults(null)} className="p-1 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"><FiX className="w-4 h-4" /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-thb-border bg-slate-50/80">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Employee</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Password</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-thb-border">
                    {inviteResults.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-sm text-thb-text-primary">{r.name}</td>
                        <td className="px-4 py-2 text-sm text-thb-text-secondary">{r.email}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <code className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">
                              {showPasswords[`inv-${i}`] ? r.password : '••••••••'}
                            </code>
                            <button onClick={() => toggleShowPassword(`inv-${i}`)} className="p-0.5 text-thb-text-muted hover:text-thb-text-primary">
                              {showPasswords[`inv-${i}`] ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => copyToClipboard(r.password)} className="p-0.5 text-thb-text-muted hover:text-violet-500">
                              <FiCopy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {r.success
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><FiCheck className="w-3 h-3" /> Sent</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><FiAlertTriangle className="w-3 h-3" /> {r.error}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ BULK OPERATIONS TAB ═══ */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
          {/* Create Accounts for All Without */}
          <div className="thb-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600"><FiPlus className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-bold text-thb-text-primary">Create Login Accounts</h3>
                <p className="text-xs text-thb-text-muted">Generate accounts for employees who don&apos;t have one yet</p>
              </div>
            </div>
            <p className="text-xs text-thb-text-secondary mb-4 leading-relaxed">
              <strong>{withoutAccount}</strong> employee(s) currently have no login account. This will create accounts using their
              employee email as the login email and an auto-generated password. Default role: <code className="bg-slate-100 px-1 rounded">admin</code> (company-level access).
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setPasswordModalMode('all')
                  setUseAutoPassword(true)
                  setShowPasswordModal(true)
                }}
                disabled={withoutAccount === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                <FiPlus className="w-4 h-4" /> Create All Missing Accounts
              </button>
            </div>
          </div>

          {/* Reset Passwords */}
          <div className="thb-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600"><FiKey className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-bold text-thb-text-primary">Bulk Reset Passwords</h3>
                <p className="text-xs text-thb-text-muted">Reset passwords for selected or all employees at once</p>
              </div>
            </div>
            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
                <input type="checkbox" checked={useAutoPassword} onChange={e => setUseAutoPassword(e.target.checked)} className="rounded border-slate-300 text-violet-500 focus:ring-violet-500" />
                Auto-generate strong passwords (recommended)
              </label>
              {!useAutoPassword && (
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={manualPassword} onChange={e => setManualPassword(e.target.value)}
                    placeholder="Enter manual password for all"
                    className="flex-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button onClick={() => setManualPassword(generatePassword())} className="p-2 rounded-lg border border-thb-border text-thb-text-muted hover:text-violet-500 hover:bg-violet-50">
                    <FiRefreshCw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setPasswordModalMode('selected'); setShowPasswordModal(true) }}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                <FiKey className="w-4 h-4" /> Reset Selected ({selectedIds.size})
              </button>
              <button
                onClick={() => { setPasswordModalMode('all'); setShowPasswordModal(true) }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium text-sm shadow-sm transition-colors"
              >
                <FiRefreshCw className="w-4 h-4" /> Reset All Passwords
              </button>
            </div>
          </div>

          {/* Password Results */}
          {passwordResults && (
            <div className="thb-card">
              <div className="p-4 border-b border-thb-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-thb-text-primary">Password Results</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const text = passwordResults.filter(r => r.success).map(r => `${r.name},${r.email},${r.password}`).join('\n')
                    copyToClipboard(`Name,Email,Password\n${text}`)
                  }} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-slate-50 text-thb-text-secondary hover:bg-slate-100">
                    <FiCopy className="w-3 h-3" /> Copy All
                  </button>
                  <button onClick={() => setPasswordResults(null)} className="p-1 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"><FiX className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-thb-border bg-slate-50/80">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Emp ID</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Password</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Action</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-thb-text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-thb-border">
                    {passwordResults.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-xs text-thb-text-muted">{r.employeeId}</td>
                        <td className="px-4 py-2 text-sm text-thb-text-primary">{r.name}</td>
                        <td className="px-4 py-2 text-sm text-thb-text-secondary">{r.email}</td>
                        <td className="px-4 py-2">
                          {r.success ? (
                            <div className="flex items-center gap-1">
                              <code className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">
                                {showPasswords[`res-${i}`] ? r.password : '••••••••'}
                              </code>
                              <button onClick={() => toggleShowPassword(`res-${i}`)} className="p-0.5 text-thb-text-muted hover:text-thb-text-primary">
                                {showPasswords[`res-${i}`] ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => copyToClipboard(r.password)} className="p-0.5 text-thb-text-muted hover:text-violet-500">
                                <FiCopy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium text-thb-text-muted bg-slate-50 px-2 py-0.5 rounded">
                            {r.action === 'account_created' ? 'Created' : r.action === 'password_reset' ? 'Reset' : r.action === 'linked_and_reset' ? 'Linked+Reset' : r.action}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {r.success
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><FiCheck className="w-3 h-3" /> OK</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" title={r.error}><FiAlertTriangle className="w-3 h-3" /> Failed</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PASSWORD MODAL (confirmation) ═══ */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !processing && setShowPasswordModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-thb-text-primary">
                {passwordModalMode === 'all' ? 'Reset All Passwords' : `Reset ${selectedIds.size} Password(s)`}
              </h3>
              <button onClick={() => !processing && setShowPasswordModal(false)} className="p-1 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <FiAlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">This will {passwordModalMode === 'all' ? `affect ${filteredEmployees.length}` : `affect ${selectedIds.size}`} employee(s)</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Existing passwords will be overwritten. Make sure to securely share the new passwords.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-thb-text-secondary mb-2">
                  <input type="checkbox" checked={useAutoPassword} onChange={e => setUseAutoPassword(e.target.checked)} className="rounded border-slate-300 text-violet-500 focus:ring-violet-500" />
                  Auto-generate unique passwords for each employee
                </label>
              </div>

              {!useAutoPassword && (
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Set same password for all</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text" value={manualPassword} onChange={e => setManualPassword(e.target.value)}
                      placeholder="Enter password"
                      className="flex-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                    <button onClick={() => setManualPassword(generatePassword())} className="p-2 rounded-lg border border-thb-border text-thb-text-muted hover:text-violet-500" title="Generate">
                      <FiRefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowPasswordModal(false)} disabled={processing} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handlePasswordAction} disabled={processing} className="px-6 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 shadow-sm shadow-violet-500/25 transition-colors">
                {processing ? 'Processing...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      {detailEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDetailEmployee(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-thb-text-primary">Manage Credentials</h3>
              <button onClick={() => setDetailEmployee(null)} className="p-1 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>

            {/* Employee Info */}
            <div className="p-4 bg-slate-50 rounded-xl mb-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
                  {detailEmployee.firstName[0]}{detailEmployee.lastName[0]}
                </div>
                <div>
                  <p className="font-semibold text-thb-text-primary">{detailEmployee.firstName} {detailEmployee.lastName}</p>
                  <p className="text-xs text-thb-text-muted">{detailEmployee.employeeId} · {detailEmployee.department}</p>
                </div>
              </div>
            </div>

            {/* Account Status */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Login Email</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button onClick={async () => {
                    try {
                      const res = await fetch('/api/employees/credentials', {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ employeeId: detailEmployee.id, action: 'update_email', email: editEmail }),
                      })
                      const data = await res.json()
                      if (res.ok) { toast.success(data.message); fetchEmployees() }
                      else toast.error(data.error)
                    } catch { toast.error('Failed to update email') }
                  }} className="px-3 py-2.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors">
                    Update
                  </button>
                </div>
                <p className="text-[10px] text-thb-text-muted mt-1">By default, the employee&apos;s work email is used as the login email</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reset Password</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                    placeholder="Leave empty for auto-generated password"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button onClick={() => setEditPassword(generatePassword())} className="p-2.5 rounded-lg border border-thb-border text-thb-text-muted hover:text-violet-500 hover:bg-violet-50" title="Generate Password">
                    <FiRefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Password result in detail */}
            {passwordResults && passwordResults.length === 1 && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-5">
                <p className="text-xs font-medium text-emerald-800 mb-1">New password generated:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-white px-3 py-1 rounded border border-emerald-200">
                    {showPasswords['detail'] ? passwordResults[0].password : '••••••••'}
                  </code>
                  <button onClick={() => toggleShowPassword('detail')} className="p-1 text-emerald-600 hover:text-emerald-800">
                    {showPasswords['detail'] ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => copyToClipboard(passwordResults[0].password)} className="p-1 text-emerald-600 hover:text-emerald-800">
                    <FiCopy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleResetSinglePassword}
                disabled={processing}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm transition-colors disabled:opacity-50"
              >
                {processing ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Resetting...</> : <><FiKey className="w-4 h-4" /> Reset Password</>}
              </button>

              {detailEmployee.hasLoginAccount && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleStatus(detailEmployee)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors"
                  >
                    {detailEmployee.loginStatus === 'active' ? <><FiToggleRight className="w-4 h-4" /> Disable Account</> : <><FiToggleLeft className="w-4 h-4" /> Enable Account</>}
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(detailEmployee)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium text-sm transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
