'use client'

import { useCallback, useEffect, useState } from 'react'
import { FiShield, FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiSave, FiInfo, FiCheckCircle } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

// Dynamic Job Approval Chain — mirrors the Requisition Approval Chain page.
// Tiers, order and approver types are managed here; the job engine
// (POST /api/recruitment + PATCH /api/recruitment/[id] + POST
// /api/recruitment/job-approval) reads this chain, so changes apply to
// newly created / re-submitted job postings immediately.
// Default chain = HR Approval → Admin Approval.

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const MANAGE_ROLES = ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'super_admin']

const APPROVER_TYPES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'hr_admin', label: 'HR Admin', hint: 'Any HR role (hr_admin, company_hr_admin, admin, tenant_admin, ceo, super_admin)' },
  { value: 'department_head', label: 'Department Head', hint: 'The real head of the job\'s department (Department Head assigned in Company → Departments)' },
  { value: 'tenant_admin', label: 'Tenant Admin', hint: 'super_admin / tenant_admin only' },
  { value: 'ceo', label: 'CEO', hint: 'super_admin / ceo only' },
  { value: 'finance', label: 'Finance', hint: 'Finance roles (finance_admin, admin, tenant_admin, ceo, super_admin)' },
  { value: 'reporting_manager', label: 'Hiring Manager', hint: 'The hiring manager configured on the job\'s hiring team' },
  { value: 'specific_user', label: 'Specific User', hint: 'One named user — enter their User ID below' },
]

interface Tier { tier: number; approverType: string; label?: string; approverUserId?: string | null }

export default function JobApprovalPage() {
  const { user } = useAuthStore()
  const allowed = MANAGE_ROLES.includes(user?.role || '')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customized, setCustomized] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [tiers, setTiers] = useState<Tier[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/recruitment/workflow-config?type=job', { headers: getAuthHeaders() })
      const json = await r.json()
      const eff = json?.effective || {}
      setEnabled(eff.enabled !== false)
      setTiers(Array.isArray(eff.tiers) && eff.tiers.length > 0
        ? eff.tiers.map((t: Tier, i: number) => ({ ...t, tier: i + 1 }))
        : [
            { tier: 1, approverType: 'hr_admin', label: 'HR Approval' },
            { tier: 2, approverType: 'tenant_admin', label: 'Admin Approval' },
          ])
      setCustomized(!!json?.saved)
    } catch {
      toast.error('Failed to load job approval configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (allowed) load() }, [allowed, load])

  const updateTier = (idx: number, patch: Partial<Tier>) => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  const moveTier = (idx: number, dir: -1 | 1) => setTiers(prev => {
    const next = [...prev]
    const j = idx + dir
    if (j < 0 || j >= next.length) return prev
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  })

  const save = async () => {
    if (tiers.length === 0) { toast.error('At least one approval tier is required'); return }
    setSaving(true)
    try {
      const config = {
        enabled,
        tiers: tiers.map((t, i) => ({
          tier: i + 1,
          approverType: t.approverType,
          label: t.label?.trim() || undefined,
          approverUserId: t.approverType === 'specific_user' ? (t.approverUserId || '').trim() || undefined : undefined,
        })),
      }
      const r = await fetch('/api/recruitment/workflow-config', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ workflowType: 'job', config, name: 'Job Approval Chain' }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok) { toast.error(json?.error || 'Save failed'); return }
      toast.success('Job approval chain saved — applies to newly created and re-submitted job postings')
      load()
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <div className="thb-card border-l-4 border-l-amber-500 p-4 flex items-start gap-3">
          <FiInfo className="w-5 h-5 text-amber-500 mt-0.5" />
          <p className="text-sm text-slate-600">Job Approval Chain configuration is restricted to Tenant Admin / HR Admin roles.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md">
            <FiShield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Job Approval Chain</h1>
            <p className="text-sm text-thb-text-secondary">Configure who approves new job postings, in which order</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${customized ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
          <FiCheckCircle className="w-3.5 h-3.5" />{customized ? 'Customized for your tenant' : 'Using default chain (HR → Admin)'}
        </span>
      </div>

      {/* Help banner */}
      <div className="thb-card border-l-4 border-l-sky-500 bg-sky-50/40">
        <div className="p-4 flex items-start gap-3">
          <FiInfo className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">How it works</p>
            <p className="text-xs">Every newly created job posting moves through the tiers below, one after another, before it goes live. While waiting, the job shows as <b>Pending Approval</b> in the Job Posting List; the current tier&apos;s approvers can approve or reject it right from the list. Only after the final tier approves does the job become <b>Open</b> and visible to candidates.</p>
            <p className="text-xs">Department Head resolves automatically from <b>Company → Departments → Department Head</b>. Jobs saved as draft skip approval until they are activated.</p>
          </div>
        </div>
      </div>

      {/* Master toggle */}
      <div className="thb-card p-4">
        <label className="flex items-center gap-3 text-sm text-thb-text-secondary">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          <span className="font-semibold text-thb-text-primary">Require approval before jobs go live</span>
        </label>
        <p className="mt-1 text-[11px] text-thb-text-muted">When off, new job postings are published immediately without any approval chain.</p>
      </div>

      {/* Tier list */}
      <div className="thb-card overflow-hidden">
        <div className="px-4 py-3 border-b border-thb-border bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-thb-text-primary">Approval Tiers ({tiers.length})</h3>
          <button onClick={() => setTiers(prev => [...prev, { tier: prev.length + 1, approverType: 'hr_admin', label: '' }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600">
            <FiPlus className="w-3.5 h-3.5" />Add Tier
          </button>
        </div>
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-thb-text-secondary">Loading…</div>
        ) : (
          <div className="divide-y divide-thb-border/50">
            {tiers.length === 0 && <div className="px-4 py-8 text-center text-sm text-thb-text-muted">No tiers — add at least one.</div>}
            {tiers.map((t, idx) => (
              <div key={idx} className="p-4 grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto] gap-3 items-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10 text-sm font-bold text-teal-700">{idx + 1}</span>
                <div>
                  <label className="block text-[11px] font-medium text-thb-text-muted mb-1">Approver Type</label>
                  <select value={t.approverType} onChange={e => updateTier(idx, { approverType: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm">
                    {APPROVER_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-thb-text-muted">{APPROVER_TYPES.find(a => a.value === t.approverType)?.hint}</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-medium text-thb-text-muted mb-1">Display Label (optional)</label>
                    <input type="text" value={t.label || ''} onChange={e => updateTier(idx, { label: e.target.value })} placeholder={`e.g. ${APPROVER_TYPES.find(a => a.value === t.approverType)?.label} Approval`} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" />
                  </div>
                  {t.approverType === 'specific_user' && (
                    <div>
                      <label className="block text-[11px] font-medium text-thb-text-muted mb-1">User ID (required)</label>
                      <input type="text" value={t.approverUserId || ''} onChange={e => updateTier(idx, { approverUserId: e.target.value })} placeholder="User ID of the approver" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 justify-end">
                  <button onClick={() => moveTier(idx, -1)} disabled={idx === 0} title="Move up" className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40"><FiArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveTier(idx, 1)} disabled={idx === tiers.length - 1} title="Move down" className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40"><FiArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => setTiers(prev => prev.filter((_, i) => i !== idx))} disabled={tiers.length <= 1} title="Remove tier" className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"><FiTrash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        <button onClick={load} disabled={saving} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50">Reset</button>
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-teal-500 text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 shadow-sm shadow-teal-500/25">
          <FiSave className="w-4 h-4" />{saving ? 'Saving…' : 'Save Approval Chain'}
        </button>
      </div>
    </div>
  )
}
