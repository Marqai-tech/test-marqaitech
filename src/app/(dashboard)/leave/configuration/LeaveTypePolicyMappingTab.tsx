'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiSearch, FiAlertCircle, FiLink2, FiZap,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Mapping {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  policyRuleId: string;
  policyRuleName: string;
  companyId: string;
  priority: number;
  branchId: string | null;
  departmentId: string | null;
  employmentType: string;
  genderApplicability: string;
  employeeIds: string | null;
  status: string;
}

interface LeaveType { id: string; name: string; code: string; }
interface PolicyRule { id: string; name: string; }

const EMPLOYMENT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'full-time', label: 'Full-Time' },
  { value: 'part-time', label: 'Part-Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

const GENDER_OPTIONS = [
  { value: 'all', label: 'All Genders' },
  { value: 'male', label: 'Male only' },
  { value: 'female', label: 'Female only' },
];

const PRIORITY_PRESETS = [
  { value: 100, label: '100 — Employee-specific' },
  { value: 80, label: '80 — Branch + Department' },
  { value: 60, label: '60 — Branch only' },
  { value: 40, label: '40 — Department only' },
  { value: 20, label: '20 — Employment-type' },
  { value: 10, label: '10 — All employees' },
];

export default function LeaveTypePolicyMappingTab() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<Mapping | null>(null);
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // BUG FIX: pass scopeQuery() so all three APIs filter by the selected company.
      const sq = scopeQuery();
      const [mRes, ltRes, pRes] = await Promise.all([
        fetch(`/api/leave-type-policy-mappings${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
      ]);
      const mData = await mRes.json();
      const ltData = await ltRes.json();
      const pData = await pRes.json();
      setMappings(mData.data || []);
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
      setPolicies((pData.data || []).filter((p: any) => p.status === 'active'));
    } catch (e) {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = mappings.filter(m =>
    !search ||
    (m.leaveTypeName || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.policyRuleName || '').toLowerCase().includes(search.toLowerCase())
  );

  // Detect conflicts: same leaveTypeId with overlapping scope
  const conflicts = new Set<string>();
  const byLeaveType = new Map<string, Mapping[]>();
  filtered.forEach(m => {
    if (m.status !== 'active') return;
    const arr = byLeaveType.get(m.leaveTypeId) || [];
    arr.push(m);
    byLeaveType.set(m.leaveTypeId, arr);
  });
  byLeaveType.forEach((arr, ltId) => {
    if (arr.length > 1) {
      // Check scope overlap (simplified: if two mappings both have employmentType=all and no branch/dept, they conflict)
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          const aIsAll = a.employmentType === 'all' && !a.branchId && !a.departmentId && !a.employeeIds;
          const bIsAll = b.employmentType === 'all' && !b.branchId && !b.departmentId && !b.employeeIds;
          if (aIsAll && bIsAll) {
            conflicts.add(a.id); conflicts.add(b.id);
          }
        }
      }
    }
  });

  const handleDelete = async (item: Mapping) => {
    if (!confirm(`Delete the mapping "${item.leaveTypeName}" → "${item.policyRuleName}"?`)) return;
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${item.id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Mapping deleted');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
        <FiZap className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Conflict resolution:</strong> When multiple mappings match an employee for the same leave type, the one with the <strong>highest priority</strong> wins.
          Use the priority presets as a guide: employee-specific (100) &gt; branch+dept (80) &gt; branch (60) &gt; dept (40) &gt; employment-type (20) &gt; all (10).
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search mappings..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setEditItem(null); setShowDialog(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <FiPlus className="w-4 h-4" /> Add Mapping
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading mappings...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FiLink2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">
              {search ? 'No mappings match your search.' : 'No mappings yet. Create leave types and policies first, then map them here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m) => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${conflicts.has(m.id) ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{m.leaveTypeName || '—'}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.leaveTypeCode}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.policyRuleName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.priority >= 80 ? 'bg-purple-50 text-purple-700' :
                        m.priority >= 40 ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {m.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {m.employmentType !== 'all' && <span className="mr-1">{m.employmentType}</span>}
                      {m.branchId && <span className="mr-1">📍branch</span>}
                      {m.departmentId && <span className="mr-1">🏛dept</span>}
                      {m.employeeIds && <span className="mr-1">👤specific</span>}
                      {m.employmentType === 'all' && !m.branchId && !m.departmentId && !m.employeeIds && <span className="text-gray-400">All employees</span>}
                    </td>
                    <td className="px-4 py-3">
                      {conflicts.has(m.id) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700" title="Another mapping with the same scope exists — the higher priority one will win">
                          <FiAlertCircle className="w-3 h-3" /> Conflict
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => { setEditItem(m); setShowDialog(true); }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
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
        <MappingDialog
          mode={editItem ? 'edit' : 'add'}
          editItem={editItem}
          leaveTypes={leaveTypes}
          policies={policies}
          onClose={() => setShowDialog(false)}
          onSaved={() => { setShowDialog(false); fetchAll(); }}
        />
      )}
    </div>
  );
}

function MappingDialog({ mode, editItem, leaveTypes, policies, onClose, onSaved }: {
  mode: 'add' | 'edit';
  editItem: Mapping | null;
  leaveTypes: LeaveType[];
  policies: PolicyRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [policyRuleId, setPolicyRuleId] = useState('');
  const [priority, setPriority] = useState(10);
  const [employmentType, setEmploymentType] = useState('all');
  const [genderApplicability, setGenderApplicability] = useState('all');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Data for cascading dropdowns
  const [branches, setBranches] = useState<{id:string;name:string}[]>([]);
  const [departments, setDepartments] = useState<{id:string;name:string}[]>([]);
  const [employees, setEmployees] = useState<{id:string;firstName:string;lastName:string;employeeId?:string}[]>([]);
  const [empSearch, setEmpSearch] = useState('');

  // Fetch branches + departments on mount
  useEffect(() => {
    const headers = getAuthHeaders();
    fetch('/api/branches', { headers }).then(r => r.json()).then(d => setBranches(d.data || d || [])).catch(() => {});
    fetch('/api/departments', { headers }).then(r => r.json()).then(d => setDepartments(d.data || d || [])).catch(() => {});
    fetch('/api/employees?limit=500', { headers }).then(r => r.json()).then(d => {
      setEmployees((d.employees || []).map((e:any) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeId: e.employeeId })));
    }).catch(() => {});
  }, []);

  // Filter departments by selected branch
  const filteredDepartments = branchId
    ? departments.filter((d: any) => d.branchId === branchId)
    : departments;

  // Filter employees by selected branch + department
  const filteredEmployees = employees.filter(e => {
    // If department is selected, filter by it; if only branch, filter by branch
    // Since we don't have dept/branch on the employee object here, show all when
    // no filter is applied, and let the server handle the scoping
    if (!empSearch) return true;
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    return name.includes(empSearch.toLowerCase()) || (e.employeeId || '').toLowerCase().includes(empSearch.toLowerCase());
  });

  useEffect(() => {
    if (mode === 'edit' && editItem) {
      setLeaveTypeId(editItem.leaveTypeId);
      setPolicyRuleId(editItem.policyRuleId);
      setPriority(editItem.priority);
      setEmploymentType(editItem.employmentType || 'all');
      setGenderApplicability(editItem.genderApplicability || 'all');
      setBranchId(editItem.branchId || '');
      setDepartmentId(editItem.departmentId || '');
      try { setSelectedEmployeeIds(editItem.employeeIds ? JSON.parse(editItem.employeeIds) : []); } catch { setSelectedEmployeeIds([]); }
    } else {
      setLeaveTypeId(''); setPolicyRuleId(''); setPriority(10); setEmploymentType('all'); setGenderApplicability('all');
      setBranchId(''); setDepartmentId(''); setSelectedEmployeeIds([]); setEmpSearch('');
    }
  }, [mode, editItem]);

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!leaveTypeId) { toast.error('Select a leave type'); return; }
    if (!policyRuleId) { toast.error('Select a policy'); return; }
    setSaving(true);
    try {
      const payload = {
        leaveTypeId, policyRuleId, priority: Number(priority), employmentType, genderApplicability,
        branchId: branchId || null,
        departmentId: departmentId || null,
        employeeIds: selectedEmployeeIds.length > 0 ? JSON.stringify(selectedEmployeeIds) : null,
        // BUG FIX: send companyId from the company switcher so the mapping is
        // stored in the SELECTED company, not the first company in the DB.
        companyId: effectiveCompanyId() || undefined,
      };
      const url = mode === 'edit' ? `/api/leave-type-policy-mappings/${editItem!.id}` : '/api/leave-type-policy-mappings';
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success(mode === 'edit' ? 'Mapping updated' : 'Mapping created');
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
          <h3 className="font-semibold text-gray-900">{mode === 'edit' ? 'Edit Mapping' : 'Add Type–Policy Mapping'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><FiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {leaveTypes.length === 0 || policies.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              <FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              You need at least one leave type and one policy before creating a mapping.
              <div className="mt-3 text-xs">Leave types: {leaveTypes.length} · Policies: {policies.length}</div>
            </div>
          ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave Type *</label>
                <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} disabled={mode === 'edit'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                  <option value="">— Select —</option>
                  {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave Policy *</label>
                <select value={policyRuleId} onChange={(e) => setPolicyRuleId(e.target.value)} disabled={mode === 'edit'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                  <option value="">— Select —</option>
                  {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority (higher number wins)</label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRIORITY_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">When multiple mappings match the same employee for this leave type, the one with the <strong>highest priority number</strong> wins. Specific employees (100) &gt; branch+dept (80) &gt; branch (60) &gt; dept (40) &gt; employment-type (20) &gt; all (10).</p>
            </div>

            {/* Scope section */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Applicability Scope (optional — leave empty for all employees)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                  <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setDepartmentId(''); }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Department {branchId ? '(filtered by branch)' : ''}</label>
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All Departments</option>
                    {filteredDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
                  <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Gender</label>
                  <select value={genderApplicability} onChange={(e) => setGenderApplicability(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Specific employees — searchable multi-select */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Specific Employees <span className="text-gray-400 font-normal">(optional — overrides all other scope)</span>
              </label>
              {selectedEmployeeIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedEmployeeIds.map(id => {
                    const emp = employees.find(e => e.id === id);
                    if (!emp) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">
                        {emp.firstName} {emp.lastName}
                        <button type="button" onClick={() => toggleEmployee(id)} className="text-blue-400 hover:text-blue-600"><FiX className="w-3 h-3" /></button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employees by name or ID..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {empSearch && (
                <div className="mt-1.5 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                  {filteredEmployees.slice(0, 20).map(emp => (
                    <button key={emp.id} type="button" onClick={() => { toggleEmployee(emp.id); setEmpSearch(''); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-700">{emp.firstName} {emp.lastName}</span>
                      <span className="text-gray-400">{emp.employeeId || ''}</span>
                    </button>
                  ))}
                  {filteredEmployees.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No employees found</p>}
                  {filteredEmployees.length > 20 && <p className="px-3 py-1.5 text-xs text-gray-400 text-center">Showing 20 of {filteredEmployees.length} — refine your search</p>}
                </div>
              )}
            </div>
          </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white z-[80] pr-20">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || leaveTypes.length === 0 || policies.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <FiRefreshCw className="w-4 h-4 animate-spin" />}
            {mode === 'edit' ? 'Save Changes' : 'Create Mapping'}
          </button>
        </div>
      </div>
    </div>
  );
}
