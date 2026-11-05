'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings, FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiRefreshCw,
  FiSearch, FiAlertCircle, FiLayers, FiClipboard, FiLink2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

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
  { id: 'mapping', label: 'Type–Policy Mapping', icon: FiLink2 },
] as const;

type TabId = typeof TABS[number]['id'];

export default function LeaveConfigurationPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('types');

  const isAdmin = user && ['super_admin', 'tenant_admin', 'admin'].includes(user.role);

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leave Configuration</h1>
        <p className="text-sm text-slate-500 mt-1">Manage leave types, policies, and type-policy mappings.</p>
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
      {activeTab === 'mapping' && <LeaveMappingTab />}
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

/* ═══════════ LEAVE POLICIES TAB ═══════════ */
function LeavePoliciesTab() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { scopeQuery } = useCompanyContextStore();

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-policy-rules', { headers: getAuthHeaders() });
      const data = await res.json();
      setPolicies(data.data || []);
    } catch { toast.error('Failed to load policies'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {loading ? <div className="p-12 text-center text-sm text-gray-400">Loading policies...</div> :
       policies.length === 0 ? <div className="p-12 text-center"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No policies yet. Create one from Leave Settings.</p></div> :
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Policy Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {policies.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.employmentType || 'all'}{p.branchId ? ' · branch' : ''}{p.departmentId ? ' · dept' : ''}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{p.priority}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}

/* ═══════════ MAPPING TAB ═══════════ */
function LeaveMappingTab() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { scopeQuery } = useCompanyContextStore();

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-type-policy-mappings', { headers: getAuthHeaders() });
      const data = await res.json();
      setMappings(data.data || []);
    } catch { toast.error('Failed to load mappings'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {loading ? <div className="p-12 text-center text-sm text-gray-400">Loading mappings...</div> :
       mappings.length === 0 ? <div className="p-12 text-center"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No mappings yet. Create leave types and policies first.</p></div> :
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Policy</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {mappings.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.leaveTypeName || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{m.policyRuleName || '—'}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{m.priority}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}
