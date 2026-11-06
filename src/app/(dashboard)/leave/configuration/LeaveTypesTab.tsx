'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiSearch, FiCheck, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description?: string;
  defaultDays: number;
  isPaid: boolean;
  carryForward: boolean;
  maxCarryForward: number;
  employmentType: string;
  employeeStatus: string;
  probationRestricted: boolean;
  sandwichRuleEnabled: boolean;
  encashmentAllowed: boolean;
  status: string;
  createdAt: string;
}

const EMPLOYMENT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'full-time', label: 'Full-Time' },
  { value: 'part-time', label: 'Part-Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

export default function LeaveTypesTab() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<LeaveType | null>(null);
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      // BUG FIX: pass scopeQuery() so the API filters by the selected company.
      const sq = scopeQuery();
      const res = await fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setTypes(data.data || []);
    } catch (e) {
      toast.error('Failed to load leave types');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const filtered = types.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleStatus = async (item: LeaveType) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`${newStatus === 'active' ? 'Activate' : 'Deactivate'} "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/leave-types/${item.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update status');
      }
      toast.success(`"${item.name}" ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchTypes();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update status');
    }
  };

  const handleDelete = async (item: LeaveType) => {
    if (!confirm(`Delete "${item.name}"? This will only succeed if no leave records reference it.`)) return;
    try {
      const res = await fetch(`/api/leave-types/${item.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete');
      }
      toast.success(`"${item.name}" deleted`);
      fetchTypes();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete leave type');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTypes}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowDialog(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FiPlus className="w-4 h-4" /> Add Leave Type
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading leave types...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">
              {search ? 'No leave types match your search.' : 'No leave types yet. Click "Add Leave Type" to create one.'}
            </p>
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Carry Fwd</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employment</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{t.name}</div>
                      {t.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{t.description}</div>}
                    </td>
                    <td className="px-4 py-3"><code className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{t.code}</code></td>
                    <td className="px-4 py-3 text-gray-700">{t.defaultDays} days</td>
                    <td className="px-4 py-3">
                      {t.isPaid ? <span className="text-green-600 text-xs font-medium">Paid</span> : <span className="text-orange-600 text-xs font-medium">Unpaid</span>}
                    </td>
                    <td className="px-4 py-3">
                      {t.carryForward ? (
                        <span className="text-xs text-gray-600">{t.maxCarryForward} days</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {EMPLOYMENT_TYPES.find(e => e.value === t.employmentType)?.label || t.employmentType}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(t)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === 'active'
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {t.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => { setEditItem(t); setShowDialog(true); }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDialog && (
        <LeaveTypeDialog
          mode={editItem ? 'edit' : 'add'}
          editItem={editItem}
          onClose={() => setShowDialog(false)}
          onSaved={() => { setShowDialog(false); fetchTypes(); }}
        />
      )}
    </div>
  );
}

/* ───────── Add/Edit Dialog ───────── */
function LeaveTypeDialog({ mode, editItem, onClose, onSaved }: {
  mode: 'add' | 'edit';
  editItem: LeaveType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [quota, setQuota] = useState('0');
  const [isPaid, setIsPaid] = useState(true);
  const [carryForward, setCarryForward] = useState(false);
  const [maxCarryForward, setMaxCarryForward] = useState('0');
  const [employmentType, setEmploymentType] = useState('all');
  const [probationRestricted, setProbationRestricted] = useState(false);
  const [sandwichRule, setSandwichRule] = useState(true);
  const [encashmentAllowed, setEncashmentAllowed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && editItem) {
      setName(editItem.name);
      setCode(editItem.code);
      setDescription(editItem.description || '');
      setQuota(String(editItem.defaultDays || '0'));
      setIsPaid(editItem.isPaid);
      setCarryForward(editItem.carryForward);
      setMaxCarryForward(String(editItem.maxCarryForward || '0'));
      setEmploymentType(editItem.employmentType || 'all');
      setProbationRestricted(editItem.probationRestricted);
      setSandwichRule(editItem.sandwichRuleEnabled);
      setEncashmentAllowed(editItem.encashmentAllowed);
    } else {
      setName(''); setCode(''); setDescription(''); setQuota('0'); setIsPaid(true);
      setCarryForward(false); setMaxCarryForward('0'); setEmploymentType('all');
      setProbationRestricted(false); setSandwichRule(true); setEncashmentAllowed(false);
    }
  }, [mode, editItem]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!code.trim()) { toast.error('Code is required'); return; }
    if (!/^[A-Za-z][A-Za-z\s'-]{1,49}$/.test(name)) { toast.error('Name must be 2–50 letters/spaces'); return; }
    const upperCode = code.toUpperCase();
    if (!/^[A-Z][A-Z0-9-]{1,9}$/.test(upperCode)) { toast.error('Code must be 2–10 chars: uppercase letters, numbers, hyphens'); return; }
    const dd = Number(quota);
    if (isNaN(dd) || dd < 0 || dd > 366) { toast.error('Quota must be 0–366'); return; }

    setSaving(true);
    try {
      // BUG FIX: send companyId from the company switcher so the leave type
      // is stored in the SELECTED company, not the first company in the DB.
      const currentCompanyId = effectiveCompanyId();
      const payload = {
        name: name.trim(),
        code: upperCode,
        description: description.trim() || null,
        defaultDays: dd,
        isPaid,
        carryForward,
        maxCarryForward: Number(maxCarryForward) || 0,
        employmentType,
        probationRestricted,
        sandwichRuleEnabled: sandwichRule,
        encashmentAllowed,
        // BUG FIX: explicitly send the selected company's id.
        companyId: currentCompanyId || undefined,
      };
      const url = mode === 'edit' ? `/api/leave-types/${editItem!.id}` : '/api/leave-types';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success(mode === 'edit' ? 'Leave type updated' : 'Leave type created');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-900">{mode === 'edit' ? 'Edit Leave Type' : 'Add Leave Type'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Casual Leave"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. CL"
                maxLength={10} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Annual Quota (days)</label>
              <input type="number" min={0} max={366} value={quota} onChange={(e) => setQuota(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Carry Forward</label>
              <input type="number" min={0} value={maxCarryForward} onChange={(e) => setMaxCarryForward(e.target.value)}
                disabled={!carryForward}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Toggle label="Paid Leave" checked={isPaid} onChange={setIsPaid} />
            <Toggle label="Carry Forward" checked={carryForward} onChange={setCarryForward} />
            <Toggle label="Sandwich Rule" checked={sandwichRule} onChange={setSandwichRule} hint="Count weekends/holidays between leave days as leave" />
            <Toggle label="Probation Restricted" checked={probationRestricted} onChange={setProbationRestricted} hint="Block during probation period" />
            <Toggle label="Encashment Allowed" checked={encashmentAllowed} onChange={setEncashmentAllowed} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}
            {mode === 'edit' ? 'Save Changes' : 'Create Leave Type'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
