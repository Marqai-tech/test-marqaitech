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
  { id: 'mapping', label: 'Type–Policy Mapping', icon: FiLink2 },
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

/* ── Inline Leave Type Form (no popup) — simplified ── */
function LeaveTypeForm({ editItem, onClose, onSaved }: { editItem: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const { effectiveCompanyId } = useCompanyContextStore();

  useEffect(() => {
    if (editItem) {
      setName(editItem.name); setCode(editItem.code || ''); setDescription(editItem.description || '');
      setStatus(editItem.status || 'active');
    }
  }, [editItem]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!code.trim()) { toast.error('Code required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.toUpperCase(),
        description: description.trim() || null,
        status,
        companyId: effectiveCompanyId() || undefined,
      };
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
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Casual Leave" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Code *</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} placeholder="e.g. CL" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase font-mono" /></div>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
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
  const [policyRules, setPolicyRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const [mRes, ltRes, pRes, rRes] = await Promise.all([
        fetch(`/api/leave-type-policy-mappings${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/policy-rule-configs${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
      ]);
      const mData = await mRes.json(); const ltData = await ltRes.json(); const pData = await pRes.json(); const rData = await rRes.json();
      setMappings(mData.data || []);
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
      setPolicies((pData.data || []).filter((p: any) => p.status === 'active'));
      setPolicyRules(rData.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete this mapping?`)) return;
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      toast.success('Mapping deleted'); fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const handleToggleStatus = async (item: any) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${item.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Mapping ${newStatus}`); fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  // Helper: find rule name for a mapping
  const getRuleName = (m: any) => {
    const rule = policyRules.find((r: any) => r.id === m.ruleConfigId);
    if (rule) return rule.name;
    // fallback: match by policyRuleId
    const rule2 = policyRules.find((r: any) => r.policyRuleId === m.policyRuleId);
    return rule2 ? rule2.name : '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          {!showForm && (
            <button onClick={() => { setEditItem(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <FiPlus className="w-4 h-4" /> Add Mapping
            </button>
          )}
        </div>
      </div>

      {showForm ? (
        <MappingForm editItem={editItem} leaveTypes={leaveTypes} policies={policies} policyRules={policyRules} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchAll(); }} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-12 text-center text-sm text-gray-400">Loading...</div> :
           mappings.length === 0 ? <div className="p-12 text-center"><FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">No mappings yet. Create leave types, policies and rules first, then map them here.</p></div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Policy</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{m.leaveTypeName || '—'} <span className="text-xs text-gray-400 font-mono">({m.leaveTypeCode})</span></td>
                      <td className="px-4 py-3 text-gray-700">{m.policyRuleName || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{getRuleName(m)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleStatus(m)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.status === 'active' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {m.status === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      </td>
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

/* ── Simplified Inline Mapping Form ── */
/* Table: LeaveTypePolicyMapping — stores leaveTypeId + policyRuleId + status (+ companyId) */
function MappingForm({ editItem, leaveTypes, policies, policyRules, onClose, onSaved }: { editItem: any | null; leaveTypes: any[]; policies: any[]; policyRules: any[]; onClose: () => void; onSaved: () => void }) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [policyRuleId, setPolicyRuleId] = useState('');
  const [ruleConfigId, setRuleConfigId] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const { effectiveCompanyId } = useCompanyContextStore();

  useEffect(() => {
    if (editItem) {
      setLeaveTypeId(editItem.leaveTypeId || '');
      setPolicyRuleId(editItem.policyRuleId || '');
      setStatus(editItem.status || 'active');
    }
  }, [editItem]);

  // Filter policy rules by selected leave type + policy
  const filteredRules = policyRules.filter((r: any) =>
    (!leaveTypeId || r.leaveTypeId === leaveTypeId) &&
    (!policyRuleId || r.policyRuleId === policyRuleId)
  );

  const handleSave = async () => {
    if (!leaveTypeId) { toast.error('Select a leave type'); return; }
    if (!policyRuleId) { toast.error('Select a policy'); return; }
    if (!ruleConfigId) { toast.error('Select a policy rule'); return; }
    setSaving(true);
    try {
      const payload = {
        leaveTypeId,
        policyRuleId,
        ruleConfigId,
        status,
        companyId: effectiveCompanyId() || undefined,
      };
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
            {/* Row 1: Leave Type + Leave Policy */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave Type *</label>
                <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} disabled={!!editItem}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                  <option value="">— Select —</option>
                  {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave Policy *</label>
                <select value={policyRuleId} onChange={(e) => setPolicyRuleId(e.target.value)} disabled={!!editItem}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                  <option value="">— Select —</option>
                  {policies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Policy Rule */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Policy Rule *</label>
              <select value={ruleConfigId} onChange={(e) => setRuleConfigId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Rule —</option>
                {policyRules.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.category})</option>)}
              </select>
            </div>

            {/* Row 3: Status */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-gray-50">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={handleSave} disabled={saving || leaveTypes.length === 0 || policies.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
          {saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}
          {editItem ? 'Save Changes' : 'Create Mapping'}
        </button>
      </div>
    </div>
  );
}
