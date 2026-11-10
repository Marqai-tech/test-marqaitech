'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings, FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiRefreshCw,
  FiSearch, FiAlertCircle, FiLayers, FiClipboard, FiLink2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import PolicyRulesTab from './PolicyRulesTab';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const EMPLOYMENT_TYPES = [
  { value: 'all', label: 'All Types' }, { value: 'full-time', label: 'Full-Time' },
  { value: 'part-time', label: 'Part-Time' }, { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

const TABS = [
  { id: 'types', label: 'Leave Types', icon: FiLayers },
  { id: 'policies', label: 'Leave Policies', icon: FiClipboard },
  { id: 'rules', label: 'Policy Rules', icon: FiSettings },
] as const;

type TabId = typeof TABS[number]['id'];

export default function LeaveConfigurationPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('types');
  const effectiveCompanyLabel = useCompanyContextStore(s => s.effectiveCompanyLabel);
  const companyLabel = effectiveCompanyLabel(user?.role);

  const isAdmin = user && ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(user.role);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <FiSettings className="w-12 h-12 mx-auto mb-4 text-red-300" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-500">Leave Configuration is only available to Admin roles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">Manage leave types, policies, and type-policy mappings.</p>
        </div>
        {/* BUG_140 FIX: show the selected company context so the admin knows which company the configuration applies to */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <FiLayers className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">Configuring for</p>
            <p className="text-sm font-semibold text-blue-800">{companyLabel || 'All companies'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'types' && <LeaveTypesTab />}
      {activeTab === 'policies' && <LeavePoliciesTab />}
      {activeTab === 'rules' && <PolicyRulesTab />}
    </div>
  );
}

/* ═══════════ LEAVE TYPES TAB (inline, no popup) ═══════════ */
function LeaveTypesTab() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const { scopeQuery } = useCompanyContextStore();

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-types', { headers: getAuthHeaders() });
      const data = await res.json();
      setTypes(data.data || []);
    } catch { toast.error('Failed to load leave types'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const filtered = types.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/leave-types/${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      toast.success(`"${item.name}" deleted`); fetchTypes();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTypes} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <FiPlus className="w-4 h-4" /> Add Leave Type
          </button>
        </div>
      </div>

      {showForm ? (
        <LeaveTypeForm editItem={editItem} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchTypes(); }} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">{search ? 'No matches.' : 'No leave types yet.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Quota</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Paid</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                      <td className="px-4 py-3"><code className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{t.code}</code></td>
                      <td className="px-4 py-3 text-gray-700">{t.defaultDays} days</td>
                      <td className="px-4 py-3">{t.isPaid ? <span className="text-green-600 text-xs font-medium">Paid</span> : <span className="text-orange-600 text-xs font-medium">Unpaid</span>}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${t.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditItem(t); setShowForm(true); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><FiEdit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(t)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded ml-1"><FiTrash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Inline Leave Type Form (no popup) ── */
function LeaveTypeForm({ editItem, onClose, onSaved }: { editItem: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [description, setDescription] = useState('');
  const [quota, setQuota] = useState('0'); const [isPaid, setIsPaid] = useState(true);
  const [carryForward, setCarryForward] = useState(false); const [maxCarryForward, setMaxCarryForward] = useState('0');
  const [employmentType, setEmploymentType] = useState('all'); const [probationRestricted, setProbationRestricted] = useState(false);
  const [sandwichRule, setSandwichRule] = useState(true); const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name); setCode(editItem.code); setDescription(editItem.description || '');
      setQuota(String(editItem.defaultDays || '0')); setIsPaid(editItem.isPaid);
      setCarryForward(editItem.carryForward); setMaxCarryForward(String(editItem.maxCarryForward || '0'));
      setEmploymentType(editItem.employmentType || 'all'); setProbationRestricted(editItem.probationRestricted);
      setSandwichRule(editItem.sandwichRuleEnabled);
    }
  }, [editItem]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!code.trim()) { toast.error('Code required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), code: code.toUpperCase(), description: description.trim() || null, defaultDays: Number(quota) || 0, isPaid, carryForward, maxCarryForward: Number(maxCarryForward) || 0, employmentType, probationRestricted, sandwichRuleEnabled: sandwichRule };
      const url = editItem ? `/api/leave-types/${editItem.id}` : '/api/leave-types';
      const method = editItem ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(editItem ? 'Updated' : 'Created'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">{editItem ? 'Edit Leave Type' : 'Add Leave Type'}</h3>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><FiX className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Code *</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase font-mono" /></div>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Quota (days)</label><input type="number" min={0} max={366} value={quota} onChange={(e) => setQuota(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Max Carry Forward</label><input type="number" min={0} value={maxCarryForward} onChange={(e) => setMaxCarryForward(e.target.value)} disabled={!carryForward} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label><select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([['Paid Leave', isPaid, setIsPaid], ['Carry Forward', carryForward, setCarryForward], ['Sandwich Rule', sandwichRule, setSandwichRule], ['Probation Restricted', probationRestricted, setProbationRestricted]] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
            <label key={label} className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <button type="button" onClick={() => setter(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} /></button>
              <span className="text-xs font-medium text-gray-800">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">{saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}{editItem ? 'Save Changes' : 'Create'}</button>
      </div>
    </div>
  );
}

/* ═══════════ LEAVE POLICIES TAB (inline, no popup) ═══════════ */
function LeavePoliciesTab() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setPolicies(data.data || []);
    } catch { toast.error('Failed to load policies'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete policy "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/leave-policy-rules?id=${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      toast.success('Policy deleted'); fetchPolicies();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const handleToggleStatus = async (item: any) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch('/api/leave-policy-rules', { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ id: item.id, status: newStatus }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Policy ${newStatus}`); fetchPolicies();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={fetchPolicies} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          {!showForm && (
            <button onClick={() => { setEditItem(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <FiPlus className="w-4 h-4" /> Add Policy
            </button>
          )}
        </div>
      </div>

      {showForm ? (
        <PolicyForm editItem={editItem} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchPolicies(); }} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-12 text-center text-sm text-gray-400">Loading...</div> :
           policies.length === 0 ? <div className="p-12 text-center"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No policies yet. Click "Add Policy" to create one.</p></div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Document</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Effective</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {policies.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{p.description || '—'}</td>
                      <td className="px-4 py-3 text-xs">{p.policyId ? <span className="text-blue-600">Attached</span> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.effectiveFromDate ? new Date(p.effectiveFromDate).toLocaleDateString('en-GB') : '—'}
                        {p.effectiveToDate ? ` → ${new Date(p.effectiveToDate).toLocaleDateString('en-GB')}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleStatus(p)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {p.status === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditItem(p); setShowForm(true); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><FiEdit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded ml-1"><FiTrash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}
    </div>
  );
}

/* ── Simplified Inline Policy Form ── */
function PolicyForm({ editItem, onClose, onSaved }: { editItem: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [status, setStatus] = useState('active');
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docMime, setDocMime] = useState('');
  const [docSize, setDocSize] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { effectiveCompanyId } = useCompanyContextStore();

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setVersion(editItem.description || '1.0');
      setEffectiveFrom(editItem.effectiveFromDate ? editItem.effectiveFromDate.split('T')[0] : '');
      setEffectiveTo(editItem.effectiveToDate ? editItem.effectiveToDate.split('T')[0] : '');
      setStatus(editItem.status || 'active');
    }
  }, [editItem]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Max 3 MB'); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setDocUrl(reader.result as string); setDocName(file.name); setDocMime(file.type); setDocSize(file.size); setUploading(false);
      toast.success(`Uploaded ${file.name}`);
    };
    reader.onerror = () => { setUploading(false); toast.error('Upload failed'); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Policy name required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: version.trim() || '1.0',
        status,
        effectiveFromDate: effectiveFrom || null,
        effectiveToDate: effectiveTo || null,
        companyId: effectiveCompanyId() || undefined,
      };
      const method = editItem ? 'PUT' : 'POST';
      const body = editItem ? JSON.stringify({ id: editItem.id, ...payload }) : JSON.stringify(payload);
      const res = await fetch('/api/leave-policy-rules', { method, headers: getAuthHeaders(), body });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(editItem ? 'Updated' : 'Created'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-blue-100 bg-blue-50/50">
        <h3 className="text-sm font-bold text-slate-900">{editItem ? 'Edit Policy' : 'Add Leave Policy'}</h3>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><FiX className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Policy Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full-Time Standard" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Version</label>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {/* Document Upload */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Policy Document (PDF/DOCX, max 3 MB)</label>
          {docUrl ? (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FiCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0"><p className="text-sm font-medium text-green-800 truncate">{docName}</p><p className="text-xs text-green-600">{(docSize / 1024).toFixed(0)} KB</p></div>
              </div>
              <button onClick={() => { setDocUrl(''); setDocName(''); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><FiTrash2 className="w-4 h-4" /></button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:bg-gray-50">
              <span className="text-sm text-gray-600">{uploading ? 'Uploading...' : 'Click to upload'}</span>
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" disabled={uploading} />
            </label>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective From</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective To</label>
            <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">{saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}{editItem ? 'Save Changes' : 'Create Policy'}</button>
      </div>
    </div>
  );
}

/* ═══════════ MAPPING TAB (inline, no popup) ═══════════ */
function LeaveMappingTab() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const { scopeQuery } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, ltRes, pRes] = await Promise.all([
        fetch('/api/leave-type-policy-mappings', { headers: getAuthHeaders() }),
        fetch('/api/leave-types', { headers: getAuthHeaders() }),
        fetch('/api/leave-policy-rules', { headers: getAuthHeaders() }),
      ]);
      const mData = await mRes.json(); const ltData = await ltRes.json(); const pData = await pRes.json();
      setMappings(mData.data || []);
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
      setPolicies((pData.data || []).filter((p: any) => p.status === 'active'));
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete mapping "${item.leaveTypeName}" → "${item.policyRuleName}"?`)) return;
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      toast.success('Mapping deleted'); fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      {/* Tip */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
        <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div><strong>Tip:</strong> Mapping connects a Leave Type to a Policy. When an employee applies for a leave type, the system uses the mapped policy to validate rules and calculate balance. Higher priority wins when multiple mappings match the same employee.</div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <FiPlus className="w-4 h-4" /> Add Mapping
          </button>
        </div>
      </div>

      {showForm ? (
        <MappingForm editItem={editItem} leaveTypes={leaveTypes} policies={policies} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchAll(); }} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-12 text-center text-sm text-gray-400">Loading...</div> :
           mappings.length === 0 ? <div className="p-12 text-center"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No mappings yet. Create leave types and policies first, then map them.</p></div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{m.leaveTypeName || '—'} <span className="text-xs text-gray-400 font-mono">({m.leaveTypeCode})</span></td>
                      <td className="px-4 py-3 text-gray-700">{m.policyRuleName || '—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${m.priority >= 80 ? 'bg-purple-50 text-purple-700' : m.priority >= 40 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{m.priority}</span></td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditItem(m); setShowForm(true); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><FiEdit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(m)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded ml-1"><FiTrash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}
    </div>
  );
}

/* ── Inline Mapping Form ── */
function MappingForm({ editItem, leaveTypes, policies, onClose, onSaved }: { editItem: any | null; leaveTypes: any[]; policies: any[]; onClose: () => void; onSaved: () => void }) {
  const [leaveTypeId, setLeaveTypeId] = useState(''); const [policyRuleId, setPolicyRuleId] = useState('');
  const [priority, setPriority] = useState(10); const [employmentType, setEmploymentType] = useState('all');
  const [branchId, setBranchId] = useState(''); const [departmentId, setDepartmentId] = useState('');
  const [genderApplicability, setGenderApplicability] = useState('all');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = getAuthHeaders();
    fetch('/api/branches', { headers: h }).then(r => r.json()).then(d => setBranches(d.data || d || [])).catch(() => {});
    fetch('/api/departments', { headers: h }).then(r => r.json()).then(d => setDepartments(d.data || d || [])).catch(() => {});
    fetch('/api/employees?limit=500', { headers: h }).then(r => r.json()).then(d => setEmployees((d.employees || []).map((e:any) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, employeeId: e.employeeId })))).catch(() => {});
  }, []);

  useEffect(() => {
    if (editItem) {
      setLeaveTypeId(editItem.leaveTypeId); setPolicyRuleId(editItem.policyRuleId); setPriority(editItem.priority);
      setEmploymentType(editItem.employmentType || 'all'); setBranchId(editItem.branchId || '');
      setDepartmentId(editItem.departmentId || ''); setGenderApplicability(editItem.genderApplicability || 'all');
      try { setSelectedEmpIds(editItem.employeeIds ? JSON.parse(editItem.employeeIds) : []); } catch { setSelectedEmpIds([]); }
    }
  }, [editItem]);

  const filteredDepts = branchId ? departments.filter((d: any) => d.branchId === branchId) : departments;
  const filteredEmps = employees.filter(e => { if (!empSearch) return false; const n = e.name.toLowerCase(); return n.includes(empSearch.toLowerCase()) || (e.employeeId || '').toLowerCase().includes(empSearch.toLowerCase()); });
  const toggleEmp = (id: string) => setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!leaveTypeId) { toast.error('Select a leave type'); return; }
    if (!policyRuleId) { toast.error('Select a policy'); return; }
    setSaving(true);
    try {
      const payload = { leaveTypeId, policyRuleId, priority: Number(priority), employmentType, branchId: branchId || null, departmentId: departmentId || null, genderApplicability, employeeIds: selectedEmpIds.length > 0 ? JSON.stringify(selectedEmpIds) : null };
      const url = editItem ? `/api/leave-type-policy-mappings/${editItem.id}` : '/api/leave-type-policy-mappings';
      const method = editItem ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(editItem ? 'Updated' : 'Created'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">{editItem ? 'Edit Mapping' : 'Add Type–Policy Mapping'}</h3>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><FiX className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4">
        {leaveTypes.length === 0 || policies.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />You need at least one leave type and one policy first.<div className="mt-2 text-xs">Leave types: {leaveTypes.length} · Policies: {policies.length}</div></div>
        ) : (
          <>
            {/* Leave Type + Policy */}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Leave Type *</label><select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} disabled={!!editItem} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"><option value="">— Select —</option>{leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Leave Policy *</label><select value={policyRuleId} onChange={(e) => setPolicyRuleId(e.target.value)} disabled={!!editItem} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"><option value="">— Select —</option>{policies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            </div>

            {/* Priority */}
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Priority (conflict resolution)</label><select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={100}>100 — Employee-specific</option><option value={80}>80 — Branch + Department</option><option value={60}>60 — Branch only</option><option value={40}>40 — Department only</option><option value={20}>20 — Employment-type</option><option value={10}>10 — All employees</option></select><p className="text-xs text-gray-500 mt-1">Higher priority wins when multiple mappings match the same employee.</p></div>

            {/* Applicability scope */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Applicability Scope <span className="text-gray-400 font-normal">(optional — leave empty for all employees)</span></p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Branch</label><select value={branchId} onChange={(e) => { setBranchId(e.target.value); setDepartmentId(''); }} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="">All Branches</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Department {branchId ? '(filtered by branch)' : ''}</label><select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="">All Departments</option>{filteredDepts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label><select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Gender</label><select value={genderApplicability} onChange={(e) => setGenderApplicability(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="all">All Genders</option><option value="male">Male only</option><option value="female">Female only</option></select><p className="text-[10px] text-gray-500 mt-0.5">Use Female only for Maternity, Male only for Paternity</p></div>
              </div>
            </div>

            {/* Specific employees */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Specific Employees <span className="text-gray-400 font-normal">(optional — this leave will be applicable ONLY to selected employees)</span></label>
              {selectedEmpIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedEmpIds.map(id => { const emp = employees.find(e => e.id === id); if (!emp) return null; return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">{emp.name}<button type="button" onClick={() => toggleEmp(id)} className="text-blue-400 hover:text-blue-600"><FiX className="w-3 h-3" /></button></span>
                  ); })}
                </div>
              )}
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employees by name or ID to assign this leave..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              {empSearch && (
                <div className="mt-1.5 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                  {filteredEmps.slice(0, 20).map(emp => (
                    <button key={emp.id} type="button" onClick={() => { toggleEmp(emp.id); setEmpSearch(''); }} className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${selectedEmpIds.includes(emp.id) ? 'bg-blue-50/50' : ''}`}>
                      <span className="font-medium text-gray-700">{emp.name}</span>
                      <span className="text-gray-400">{emp.employeeId || ''}</span>
                    </button>
                  ))}
                  {filteredEmps.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No employees found</p>}
                  {filteredEmps.length > 20 && <p className="px-3 py-1.5 text-xs text-gray-400 text-center">Showing 20 of {filteredEmps.length} — refine your search</p>}
                </div>
              )}
              {selectedEmpIds.length > 0 && <p className="text-[10px] text-blue-600 mt-1.5">✓ This leave type will be applicable ONLY to {selectedEmpIds.length} selected employee(s). All other employees will NOT see this leave type.</p>}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={handleSave} disabled={saving || leaveTypes.length === 0 || policies.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">{saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}{editItem ? 'Save Changes' : 'Create Mapping'}</button>
      </div>
    </div>
  );
}
