'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiSearch, FiCheck, FiAlertCircle, FiSettings, FiSave,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PolicyRuleConfig {
  id: string;
  name: string;
  description: string | null;
  mappingId: string | null;
  policyRuleId: string | null;
  policyRuleName?: string;
  leaveTypeId: string | null;
  leaveTypeName?: string;
  leaveTypeCode?: string;
  category: string;
  value: string;
  unit: string;
  applicabilityType: string;
  departmentId: string | null;
  departmentName?: string;
  branchId: string | null;
  branchName?: string;
  employeeId: string | null;
  employeeFirstName?: string;
  employeeLastName?: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  createdAt: string;
}

interface PolicyRule { id: string; name: string; }
interface LeaveType { id: string; name: string; code: string; }
interface Department { id: string; name: string; }
interface Branch { id: string; name: string; }
interface Employee { id: string; firstName: string; lastName: string; employeeId: string; }

// 12 categories — expanded with all fields
const RULE_CATEGORIES = [
  { value: 'annual_leave_limit', label: 'Annual Leave Limit', valueType: 'number', unit: 'days', desc: 'Maximum total leave days per year' },
  { value: 'monthly_accrual', label: 'Monthly Accrual', valueType: 'number', unit: 'days/month', desc: 'How many days accrue each month' },
  { value: 'max_consecutive_days', label: 'Maximum Consecutive Days', valueType: 'number', unit: 'days', desc: 'Max consecutive days in one application' },
  { value: 'min_advance_notice', label: 'Minimum Advance Notice', valueType: 'number', unit: 'days', desc: 'Minimum days before leave start to apply' },
  { value: 'half_day', label: 'Half-Day Permission', valueType: 'boolean', unit: '', desc: 'Allow half-day leave applications' },
  { value: 'carry_forward', label: 'Carry Forward', valueType: 'boolean', unit: '', desc: 'Allow carrying unused leave to next year' },
  { value: 'encashment', label: 'Leave Encashment', valueType: 'boolean', unit: '', desc: 'Allow encashing unused leave' },
  { value: 'sandwich_rule', label: 'Sandwich Leave', valueType: 'boolean', unit: '', desc: 'Count weekends/holidays between leave days as leave' },
  { value: 'weekend_holiday_calc', label: 'Weekend/Holiday Calculation', valueType: 'selection', unit: '', desc: 'How weekends/holidays are treated', options: ['exclude', 'include', 'count_as_leave'] },
  { value: 'probation_restriction', label: 'Probation Restriction', valueType: 'boolean', unit: '', desc: 'Block paid leave during probation' },
  { value: 'min_leave_duration', label: 'Minimum Leave Duration', valueType: 'number', unit: 'days', desc: 'Minimum days per application' },
  { value: 'max_leave_duration', label: 'Maximum Leave Duration', valueType: 'number', unit: 'days', desc: 'Maximum days per application' },
];

const APPLICABILITY_TYPES = [
  { value: 'company', label: 'Company-wide' },
  { value: 'department', label: 'Specific Department' },
  { value: 'branch', label: 'Specific Branch' },
  { value: 'employee', label: 'Specific Employee' },
];

export default function PolicyRulesTab() {
  const [rules, setRules] = useState<PolicyRuleConfig[]>([]);
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PolicyRuleConfig | null>(null);
  const { scopeQuery } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const [rRes, pRes, ltRes, dRes, bRes, eRes] = await Promise.all([
        fetch(`/api/policy-rule-configs${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/departments${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/branches${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/employees?limit=500&includePhotos=0`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      const rData = await rRes.json();
      const pData = await pRes.json();
      const ltData = await ltRes.json();
      setRules(rData.data || []);
      setPolicies((pData.data || []).filter((p: any) => p.status === 'active'));
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
      if (dRes?.ok) { const d = await dRes.json(); setDepartments(d.data || d || []); }
      if (bRes?.ok) { const b = await bRes.json(); setBranches(b.data || b || []); }
      if (eRes?.ok) { const e = await eRes.json(); setEmployees((e.employees || []).map((emp: any) => ({ id: emp.id, firstName: emp.firstName, lastName: emp.lastName, employeeId: emp.employeeId }))); }
    } catch {
      toast.error('Failed to load policy rules');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = rules.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (item: PolicyRuleConfig) => {
    if (!confirm(`Delete the rule "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/policy-rule-configs/${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Rule deleted');
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  const handleToggleStatus = async (item: PolicyRuleConfig) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/policy-rule-configs/${item.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(`Rule ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
  };

  const getCategoryLabel = (cat: string) => RULE_CATEGORIES.find(c => c.value === cat)?.label || cat;
  const getApplicabilityLabel = (type: string) => APPLICABILITY_TYPES.find(a => a.value === type)?.label || type;
  const getApplicabilityDetail = (r: PolicyRuleConfig) => {
    if (r.applicabilityType === 'department') return r.departmentName || 'Dept';
    if (r.applicabilityType === 'branch') return r.branchName || 'Branch';
    if (r.applicabilityType === 'employee') return `${r.employeeFirstName || ''} ${r.employeeLastName || ''}`.trim() || 'Employee';
    return 'All';
  };

  return (
    <div className="space-y-4">
      {/* Inline form */}
      {showForm && (
        <InlineRuleForm
          mode={editItem ? 'edit' : 'add'}
          editItem={editItem}
          policies={policies}
          leaveTypes={leaveTypes}
          departments={departments}
          branches={branches}
          employees={employees}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={() => { setShowForm(false); setEditItem(null); fetchAll(); }}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search rules..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!showForm && (
            <button onClick={() => { setEditItem(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <FiPlus className="w-4 h-4" /> Add Rule
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading policy rules...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FiSettings className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">{search ? 'No rules match your search.' : 'No policy rules yet. Click "Add Rule" to create one.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Rule Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Applies To</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Effective</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      {r.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{r.description}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{getCategoryLabel(r.category)}</span></td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{r.leaveTypeName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{r.policyRuleName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{r.value} {r.unit}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded">{getApplicabilityLabel(r.applicabilityType)}</span>
                      {r.applicabilityType !== 'company' && <span className="ml-1 text-gray-500">{getApplicabilityDetail(r)}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString('en-GB') : '—'}
                      {r.effectiveTo ? ` → ${new Date(r.effectiveTo).toLocaleDateString('en-GB')}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleStatus(r)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'active' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {r.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => { setEditItem(r); setShowForm(true); }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r)}
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
    </div>
  );
}

/* ───────── Inline Form (expanded with all fields) ───────── */
function InlineRuleForm({ mode, editItem, policies, leaveTypes, departments, branches, employees, onClose, onSaved }: {
  mode: 'add' | 'edit';
  editItem: PolicyRuleConfig | null;
  policies: PolicyRule[];
  leaveTypes: LeaveType[];
  departments: Department[];
  branches: Branch[];
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [policyRuleId, setPolicyRuleId] = useState('');
  const [category, setCategory] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [applicabilityType, setApplicabilityType] = useState('company');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && editItem) {
      setName(editItem.name); setDescription(editItem.description || '');
      setLeaveTypeId(editItem.leaveTypeId || ''); setPolicyRuleId(editItem.policyRuleId || '');
      setCategory(editItem.category); setValue(editItem.value); setUnit(editItem.unit);
      setApplicabilityType(editItem.applicabilityType || 'company');
      setDepartmentId(editItem.departmentId || ''); setBranchId(editItem.branchId || ''); setEmployeeId(editItem.employeeId || '');
      setEffectiveFrom(editItem.effectiveFrom ? editItem.effectiveFrom.split('T')[0] : '');
      setEffectiveTo(editItem.effectiveTo ? editItem.effectiveTo.split('T')[0] : '');
      setStatus(editItem.status);
    } else {
      setName(''); setDescription(''); setLeaveTypeId(''); setPolicyRuleId(''); setCategory('');
      setValue(''); setUnit(''); setApplicabilityType('company');
      setDepartmentId(''); setBranchId(''); setEmployeeId('');
      setEffectiveFrom(''); setEffectiveTo(''); setStatus('active');
    }
  }, [mode, editItem]);

  const selectedCategory = RULE_CATEGORIES.find(c => c.value === category);
  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    const config = RULE_CATEGORIES.find(c => c.value === cat);
    if (config) {
      setUnit(config.unit);
      if (config.valueType === 'boolean') setValue('true');
      else if (config.valueType === 'number') setValue('0');
      else if (config.valueType === 'selection' && config.options) setValue(config.options[0]);
      else setValue('');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Rule name is required'); return; }
    if (!category) { toast.error('Please select a rule category'); return; }
    if (!value && value !== '0') { toast.error('Rule value is required'); return; }
    if (applicabilityType === 'department' && !departmentId) { toast.error('Please select a department'); return; }
    if (applicabilityType === 'branch' && !branchId) { toast.error('Please select a branch'); return; }
    if (applicabilityType === 'employee' && !employeeId) { toast.error('Please select an employee'); return; }
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) { toast.error('Effective To cannot be before Effective From'); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(), description: description.trim() || null,
        leaveTypeId: leaveTypeId || null,
        policyRuleId: policyRuleId || null,
        category, value, unit, applicabilityType,
        departmentId: applicabilityType === 'department' ? departmentId : null,
        branchId: applicabilityType === 'branch' ? branchId : null,
        employeeId: applicabilityType === 'employee' ? employeeId : null,
        effectiveFrom: effectiveFrom || null, effectiveTo: effectiveTo || null, status,
      };
      const url = mode === 'edit' ? `/api/policy-rule-configs/${editItem!.id}` : '/api/policy-rule-configs';
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success(mode === 'edit' ? 'Rule updated' : 'Rule created');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const renderValueInput = () => {
    if (!selectedCategory) return null;
    const vt = selectedCategory.valueType;
    if (vt === 'boolean') return (
      <select value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="true">Enabled (Yes)</option><option value="false">Disabled (No)</option>
      </select>
    );
    if (vt === 'selection' && selectedCategory.options) return (
      <select value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
        {selectedCategory.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    if (vt === 'number') return <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />;
    return <input type="text" value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />;
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-blue-100 bg-blue-50/50">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          {mode === 'edit' ? <FiEdit2 className="w-4 h-4 text-blue-600" /> : <FiPlus className="w-4 h-4 text-blue-600" />}
          {mode === 'edit' ? 'Edit Rule' : 'Add Rule'}
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><FiX className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-4">
        {/* Row 1: Name + Description */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max 3 consecutive days"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this rule does..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Row 2: Leave Type + Leave Policy (direct selection, no mapping) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Leave Type</label>
            <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All leave types</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Leave Policy *</label>
            <select value={policyRuleId} onChange={(e) => setPolicyRuleId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select Policy —</option>
              {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Row 3: Category + Value */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rule Category *</label>
            <select value={category} onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select Category —</option>
              {RULE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {selectedCategory && <p className="text-[10px] text-gray-400 mt-1">{selectedCategory.desc}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rule Value * {unit && <span className="text-gray-400">({unit})</span>}</label>
            {renderValueInput()}
          </div>
        </div>

        {/* Row 4: Applicability */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Applicability</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Applies To</label>
              <select value={applicabilityType} onChange={(e) => { setApplicabilityType(e.target.value); setDepartmentId(''); setBranchId(''); setEmployeeId(''); }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {APPLICABILITY_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            {applicabilityType === 'department' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department *</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            {applicabilityType === 'branch' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {applicabilityType === 'employee' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Row 5: Effective dates + Status */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective From</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective To</label>
            <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2">
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
          {mode === 'edit' ? 'Save Changes' : 'Create Rule'}
        </button>
      </div>
    </div>
  );
}
