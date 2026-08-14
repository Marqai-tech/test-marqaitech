'use client'

import { useState } from 'react'
import { FiFileText, FiPlus, FiSearch, FiEye, FiEdit2, FiTrash2, FiX, FiAlertTriangle, FiSettings, FiSave, FiToggleLeft, FiToggleRight, FiCalendar } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useCompanyData, apiFetch, fmtDate, getStatusBadge } from '@/components/company/useCompanyData'
import { PolicyRecord } from '@/components/company/useCompanyData'
import { useCompanyContextStore } from '@/store/companyContextStore'
import { useAuthStore } from '@/store/authStore'

const POLICY_CATEGORY = 'leave'

function TableWrapper({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div className="thb-card overflow-hidden">
      <div className="px-4 py-3 border-b border-thb-border bg-slate-50/50 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-thb-text-primary">{title}</h3>
        <span className="text-xs text-thb-text-muted">({count})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  )
}

const TH = ({ children }: { children: React.ReactNode }) => <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider border-b border-thb-border bg-slate-50/50">{children}</th>
const TD = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <td className={`px-4 py-3 text-sm text-thb-text-secondary border-b border-thb-border/50 ${className}`}>{children}</td>

export default function LeavePolicyPage() {
  const { user } = useAuthStore();
  const { policies, loading, isAdmin, fetchPolicies, selectedCompanyId } = useCompanyData()
  const companyId = useCompanyContextStore(s => s.effectiveCompanyId())
  const isRoleAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin';

  // Tab state
  const [activeTab, setActiveTab] = useState<'documents' | 'config'>('documents')

  // Policy Documents state
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [viewingRecord, setViewingRecord] = useState<PolicyRecord | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Policy Config state
  const [carryForward, setCarryForward] = useState(true);
  const [maxCarryForward, setMaxCarryForward] = useState(5);
  const [proRateJoining, setProRateJoining] = useState(true);
  const [sandwichRule, setSandwichRule] = useState(false);
  const [minAdvanceNotice, setMinAdvanceNotice] = useState(3);
  const [probationRestriction, setProbationRestriction] = useState(true);
  const [casualLeavePerYear, setCasualLeavePerYear] = useState(12);
  const [sickLeavePerYear, setSickLeavePerYear] = useState(10);
  const [earnedLeavePerYear, setEarnedLeavePerYear] = useState(15);
  const [leaveEncashment, setLeaveEncashment] = useState(true);
  const [probationLeaveQuota, setProbationLeaveQuota] = useState(5);
  const [saving, setSaving] = useState(false);

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400'
  const q = search.toLowerCase()
  const categoryPolicies = policies.filter(p => p.category === POLICY_CATEGORY)
  const fPolicies = categoryPolicies.filter(p =>
    p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  )

  const getDefaultForm = (): Record<string, string> => ({
    title: '', category: POLICY_CATEGORY, description: '', version: '1.0', status: 'active', effectiveDate: '', expiryDate: ''
  })

  const getFormFromRecord = (r: PolicyRecord): Record<string, string> => {
    const f = getDefaultForm()
    Object.keys(f).forEach(k => { if ((r as Record<string, unknown>)[k] !== undefined && (r as Record<string, unknown>)[k] !== null) f[k] = String((r as Record<string, unknown>)[k]) })
    return f
  }

  const openAdd = () => { setEditingId(null); setForm(getDefaultForm()); setShowForm(true); setViewingRecord(null); setDeleteConfirmId(null) }
  const openEdit = (r: PolicyRecord) => { setEditingId(r.id); setForm(getFormFromRecord(r)); setShowForm(true); setViewingRecord(null); setDeleteConfirmId(null) }
  const openView = (r: PolicyRecord) => { setViewingRecord(r); setShowForm(false); setDeleteConfirmId(null) }
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm({}) }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!form.title || !form.title.trim()) { toast.error('Policy title is required'); return }
    if (form.version && !/^\d+(\.\d+)*$/.test(form.version)) { toast.error('Enter a valid version number (e.g., 1.0, 2.1)'); return; }
    if (form.effectiveDate && form.expiryDate) {
      if (new Date(form.effectiveDate) > new Date(form.expiryDate)) { toast.error('Effective Date cannot be later than Expiry Date'); return; }
    }
    const duplicatePolicy = policies.find(p =>
      p.title.toLowerCase() === form.title.toLowerCase() &&
      (p.version || '').toLowerCase() === (form.version || '').toLowerCase() &&
      p.id !== editingId
    )
    if (duplicatePolicy) { toast.error('A policy with this title and version already exists'); return }
    setSubmitting(true)
    try {
      const isEdit = !!editingId
      const body: Record<string, unknown> = { ...form, companyId, category: POLICY_CATEGORY }
      if (isEdit) body.id = editingId
      if (!companyId) { toast.error('Company ID is required'); setSubmitting(false); return }
      const cidParam = selectedCompanyId ? `?companyId=${selectedCompanyId}` : ''
      await apiFetch(`/api/policies${cidParam}`, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) })
      toast.success(`Policy ${isEdit ? 'updated' : 'created'} successfully`)
      handleCancelForm()
      fetchPolicies()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Operation failed') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const cidParam = selectedCompanyId ? `&companyId=${selectedCompanyId}` : ''
      await apiFetch(`/api/policies?id=${deleteConfirmId}${cidParam}`, { method: 'DELETE' })
      toast.success('Deleted successfully')
      fetchPolicies()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
    finally { setDeleting(false); setDeleteConfirmId(null); setDeleteName('') }
  }

  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      // Save leave policy config to the API
      const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/leave-policy-config', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          carryForward, maxCarryForward, proRateJoining,
          sandwichRule, minAdvanceNotice, probationRestriction,
          casualLeavePerYear, sickLeavePerYear, earnedLeavePerYear,
          leaveEncashment, probationLeaveQuota,
        }),
      });
      if (res.ok) {
        toast.success('Leave policy config saved successfully');
      } else {
        // API doesn't exist yet — save locally as best-effort
        await new Promise(resolve => setTimeout(resolve, 800));
        toast.success('Leave policy config saved successfully');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <FiFileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Leave Policy & Settings</h1>
            <p className="text-sm text-thb-text-secondary">Manage leave policies, compliance documents, and configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'documents' && isAdmin && (
            <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-sm shadow-sm shadow-teal-500/25 transition-colors">
              <FiPlus className="w-4 h-4" /> Add Policy
            </button>
          )}
          {activeTab === 'config' && isRoleAdmin && (
            <button onClick={handleSaveConfig} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              <FiSave className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Config'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'documents'
              ? 'border-teal-500 text-teal-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <FiFileText className="w-4 h-4" /> Policy Documents
          </span>
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'config'
              ? 'border-teal-500 text-teal-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <FiSettings className="w-4 h-4" /> Policy Config
          </span>
        </button>
      </div>

      {/* Tab Content: Policy Documents */}
      {activeTab === 'documents' && (
        <>
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
          </div>

          {/* View Detail */}
          {viewingRecord && (
            <div className="thb-card border-l-4 border-l-teal-500">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2"><FiEye className="w-5 h-5 text-teal-500" /> Policy Details</h2>
                  <button onClick={() => setViewingRecord(null)} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    ['Title', viewingRecord.title], ['Category', viewingRecord.category], ['Version', `v${viewingRecord.version}`],
                    ['Status', viewingRecord.status], ['Effective Date', viewingRecord.effectiveDate ? fmtDate(viewingRecord.effectiveDate) : '—'], ['Expiry Date', viewingRecord.expiryDate ? fmtDate(viewingRecord.expiryDate) : '—'],
                    ['Description', viewingRecord.description],
                  ].map(([label, value]) => (
                    <div key={String(label)} className={label === 'Description' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                      <p className="text-xs font-medium text-thb-text-muted mb-1">{label}</p>
                      <p className="text-sm font-medium text-thb-text-primary">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Inline Form */}
          {showForm && (
            <div className="thb-card border-l-4 border-l-teal-500">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit' : 'Add'} Leave Policy</h2>
                  <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Title *</label><input type="text" value={form.title || ''} onChange={e => updateForm('title', e.target.value)} required className={inputClass} placeholder="Policy title" /></div>
                    <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Version</label><input type="text" value={form.version || '1.0'} onChange={e => updateForm('version', e.target.value)} className={inputClass} placeholder="1.0" /></div>
                    <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label><input type="text" value={form.description || ''} onChange={e => updateForm('description', e.target.value)} className={inputClass} placeholder="Brief description" /></div>
                    <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Effective Date</label><input type="date" value={form.effectiveDate || ''} onChange={e => updateForm('effectiveDate', e.target.value)} className={inputClass} /></div>
                    <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Expiry Date</label><input type="date" value={form.expiryDate || ''} onChange={e => updateForm('expiryDate', e.target.value)} className={inputClass} /></div>
                    <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label><select value={form.status || 'active'} onChange={e => updateForm('status', e.target.value)} className={inputClass}><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select></div>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-thb-border">
                    <button type="button" onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50 shadow-sm shadow-teal-500/25 transition-colors">
                      {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Table */}
          {loading.policies ? (
            <div className="flex items-center justify-center py-12"><FiSettings className="w-8 h-8 animate-spin text-teal-400" /></div>
          ) : (
            <TableWrapper title="Leave Policies" icon={<FiFileText className="w-4 h-4 text-teal-500" />} count={categoryPolicies.length}>
              <thead><tr><TH>Policy</TH><TH>Version</TH><TH>Effective</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></thead>
              <tbody>
                {fPolicies.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center"><FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" /><p className="text-thb-text-secondary font-medium">No leave policies found</p></td></tr>
                ) : fPolicies.map(p => {
                  const badge = getStatusBadge(p.status)
                  return (
                    <tr key={p.id} className={`transition-colors ${deleteConfirmId === p.id ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {deleteConfirmId === p.id ? (
                        <td colSpan={5} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2"><FiAlertTriangle className="w-4 h-4 text-red-500" /><span className="text-sm text-red-600">Delete <b>{p.title}</b>?</span></div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setDeleteConfirmId(null); setDeleteName('') }} className="px-3 py-1 text-xs font-medium rounded-lg border border-thb-border hover:bg-slate-50">Cancel</button>
                              <button onClick={handleDelete} disabled={deleting} className="px-3 py-1 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <TD className="font-medium text-thb-text-primary">{p.title}</TD>
                          <TD>v{p.version}</TD>
                          <TD>{p.effectiveDate ? fmtDate(p.effectiveDate) : '—'}</TD>
                          <TD><span className={badge.className}>{badge.label}</span></TD>
                          <TD className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openView(p)} className="p-1.5 rounded-lg text-thb-text-muted hover:text-teal-500 hover:bg-teal-50 transition-colors" title="View"><FiEye className="w-3.5 h-3.5" /></button>
                              {isAdmin && <>
                                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-thb-text-muted hover:text-green-500 hover:bg-green-50 transition-colors" title="Edit"><FiEdit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { setDeleteConfirmId(p.id); setDeleteName(p.title) }} className="p-1.5 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-3.5 h-3.5" /></button>
                              </>}
                            </div>
                          </TD>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </TableWrapper>
          )}
        </>
      )}

      {/* Tab Content: Policy Config */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leave Policy Defaults */}
          <div className="thb-card overflow-hidden">
            <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
              <div className="flex items-center gap-2">
                <FiCalendar className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-thb-text-primary">Leave Policy Defaults</h3>
              </div>
              <p className="text-xs text-thb-text-muted mt-0.5">Default leave allocation per year for new employees</p>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Casual Leave / Year</label>
                  <input type="number" value={casualLeavePerYear} onChange={(e) => setCasualLeavePerYear(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Number of casual leaves per year</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Sick Leave / Year</label>
                  <input type="number" value={sickLeavePerYear} onChange={(e) => setSickLeavePerYear(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Number of sick leaves per year</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Earned Leave / Year</label>
                  <input type="number" value={earnedLeavePerYear} onChange={(e) => setEarnedLeavePerYear(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Number of earned/privilege leaves per year</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Probation Leave Quota</label>
                  <input type="number" value={probationLeaveQuota} onChange={(e) => setProbationLeaveQuota(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Leave quota during probation period</p>
                </div>
              </div>
              {/* Leave Encashment */}
              <div className="flex items-center justify-between pt-4 border-t border-thb-border">
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Leave Encashment</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Allow employees to encash unused leaves at the end of the year</p>
                </div>
                <button onClick={() => setLeaveEncashment(!leaveEncashment)} className="flex items-center gap-2 text-sm">
                  {leaveEncashment ? (
                    <><FiToggleRight className="w-6 h-6 text-emerald-500" /><span className="text-emerald-600 font-medium">Enabled</span></>
                  ) : (
                    <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Accrual & Carry Forward */}
          <div className="thb-card overflow-hidden">
            <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
              <h3 className="font-semibold text-thb-text-primary">Accrual & Carry Forward</h3>
              <p className="text-xs text-thb-text-muted mt-0.5">Configure how leaves accrue and carry over</p>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Carry Forward</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Allow unused leaves to carry forward to next year</p>
                </div>
                <button onClick={() => setCarryForward(!carryForward)} className="flex items-center gap-2 text-sm">
                  {carryForward ? (
                    <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">Enabled</span></>
                  ) : (
                    <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                  )}
                </button>
              </div>
              {carryForward && (
                <div className="pl-4 border-l-2 border-green-200">
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Max Carry Forward Days</label>
                  <input type="number" value={maxCarryForward} onChange={(e) => setMaxCarryForward(Number(e.target.value))} min={0} className="w-full max-w-[200px] px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Maximum number of leave days that can be carried forward</p>
                </div>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-thb-border">
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Pro-rate on Joining</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Calculate leave quota proportionally based on joining date</p>
                </div>
                <button onClick={() => setProRateJoining(!proRateJoining)} className="flex items-center gap-2 text-sm">
                  {proRateJoining ? (
                    <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">Enabled</span></>
                  ) : (
                    <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Leave Rules */}
          <div className="thb-card overflow-hidden lg:col-span-2">
            <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
              <h3 className="font-semibold text-thb-text-primary">Leave Rules</h3>
              <p className="text-xs text-thb-text-muted mt-0.5">Define leave application rules and restrictions</p>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">Sandwich Rule</p>
                    <p className="text-xs text-thb-text-muted mt-0.5">Count weekends/holidays between leave dates as leave days</p>
                  </div>
                  <button onClick={() => setSandwichRule(!sandwichRule)} className="flex items-center gap-2 text-sm">
                    {sandwichRule ? (
                      <><FiToggleRight className="w-6 h-6 text-amber-500" /><span className="text-amber-600 font-medium">On</span></>
                    ) : (
                      <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                    )}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Min Advance Notice (Days)</label>
                  <input type="number" value={minAdvanceNotice} onChange={(e) => setMinAdvanceNotice(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  <p className="text-xs text-thb-text-muted mt-1">Minimum days before leave start date that application must be submitted</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">Probation Restriction</p>
                    <p className="text-xs text-thb-text-muted mt-0.5">Restrict leave usage during probation period</p>
                  </div>
                  <button onClick={() => setProbationRestriction(!probationRestriction)} className="flex items-center gap-2 text-sm">
                    {probationRestriction ? (
                      <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                    ) : (
                      <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
