'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiSearch, FiAlertCircle,
  FiLink2, FiLayers, FiClipboard, FiSettings, FiSave, FiGrid, FiList,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
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
interface LeaveType { id: string; name: string; code: string; defaultDays: number; status: string; }
interface PolicyRule {
  id: string; name: string; policyId?: string | null;
  employmentType: string; genderApplicability?: string; gender?: string;
  branchId?: string | null; departmentId?: string | null;
  entitledDaysPerYear?: number; probationRestriction?: boolean;
  branch?: { name: string } | null; department?: { name: string } | null;
}
interface Policy {
  id: string; title: string; version?: string; status: string;
  effectiveDate?: string | null; expiryDate?: string | null; description?: string | null;
}

/* ── Helpers ── */
function fmtDate(d?: string | null): string {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d).slice(0, 10); }
}

function deriveLeaveYear(p?: Policy): string {
  if (!p?.effectiveDate) return 'January – December';
  const start = new Date(p.effectiveDate);
  const end = p.expiryDate ? new Date(p.expiryDate) : new Date(start.getFullYear(), 11, 31);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[start.getMonth()]} – ${months[end.getMonth()]} ${start.getFullYear()}`;
}

function formatApplicableTo(rule?: PolicyRule | null): string {
  if (!rule) return 'All Employees';
  const parts: string[] = [];
  const g = (rule.genderApplicability || rule.gender || 'all').toLowerCase();
  if (g === 'male') parts.push('Male');
  else if (g === 'female') parts.push('Female');
  else if (g === 'other') parts.push('Other');
  const et = rule.employmentType;
  if (et && et !== 'all') {
    if (et === 'internship' && rule.probationRestriction) parts.push('Probation/Intern');
    else parts.push(et.charAt(0).toUpperCase() + et.slice(1));
  }
  if (rule.branch?.name) parts.push(rule.branch.name);
  if (rule.department?.name) parts.push(rule.department.name);
  return parts.length === 0 ? 'All Employees' : parts.join(', ');
}

function getAppliesToBadges(rule?: PolicyRule | null): Array<{ label: string; className: string }> {
  if (!rule) return [{ label: 'All Employees', className: 'bg-slate-100 text-slate-600' }];
  const badges: Array<{ label: string; className: string }> = [];
  const g = (rule.genderApplicability || rule.gender || 'all').toLowerCase();
  if (g === 'male') badges.push({ label: 'Male', className: 'bg-blue-50 text-blue-700' });
  else if (g === 'female') badges.push({ label: 'Female', className: 'bg-pink-50 text-pink-700' });
  else if (g === 'other') badges.push({ label: 'Other', className: 'bg-amber-50 text-amber-700' });
  const et = rule.employmentType;
  if (et && et !== 'all') {
    if (et === 'internship' && rule.probationRestriction) badges.push({ label: 'Probation/Intern', className: 'bg-amber-50 text-amber-700' });
    else badges.push({ label: et.charAt(0).toUpperCase() + et.slice(1), className: 'bg-teal-50 text-teal-700' });
  }
  if (rule.branch?.name) badges.push({ label: rule.branch.name, className: 'bg-emerald-50 text-emerald-700' });
  if (rule.department?.name) badges.push({ label: rule.department.name, className: 'bg-indigo-50 text-indigo-700' });
  if (badges.length === 0) badges.push({ label: 'All Employees', className: 'bg-slate-100 text-slate-600' });
  return badges;
}

const LT_PILL_COLORS: Record<string, string> = {
  CL: 'bg-blue-100 text-blue-700', SL: 'bg-teal-100 text-teal-700',
  EL: 'bg-emerald-100 text-emerald-700', PL: 'bg-emerald-100 text-emerald-700',
  PAL: 'bg-sky-100 text-sky-700', OL: 'bg-amber-100 text-amber-700',
  OH: 'bg-purple-100 text-purple-700', MTL: 'bg-pink-100 text-pink-700',
  MAL: 'bg-pink-100 text-pink-700', BL: 'bg-rose-100 text-rose-700',
  LOP: 'bg-orange-100 text-orange-700', CO: 'bg-amber-100 text-amber-700',
};
function ltPill(code: string) { return LT_PILL_COLORS[code.toUpperCase()] || 'bg-slate-100 text-slate-700'; }

/* ════════════════════════════════════════════════════════════ */
/* MAIN COMPONENT                                                */
/* ════════════════════════════════════════════════════════════ */
export default function LeaveTypePolicyMappingTab() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [policyRules, setPolicyRules] = useState<PolicyRule[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editMapping, setEditMapping] = useState<Mapping | null>(null);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [filterPolicyId, setFilterPolicyId] = useState('');
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const sep = sq ? `?${sq}` : '';
      const [mRes, ltRes, prRes, pRes] = await Promise.all([
        fetch(`/api/leave-type-policy-mappings${sep}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-types${sep}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave-policy-rules${sep}`, { headers: getAuthHeaders() }),
        fetch(`/api/policies${sep}${sq ? '&' : '?'}category=leave`, { headers: getAuthHeaders() }),
      ]);
      const mData = await mRes.json();
      const ltData = await ltRes.json();
      const prData = await prRes.json();
      const pData = await pRes.json();
      setMappings(mData.data || []);
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
      setPolicyRules(prData.data || []);
      const policiesRaw = pData.data || pData.policies || pData || [];
      setPolicies(policiesRaw.filter((p: any) => p.category === 'leave'));
    } catch (e) {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Derived data for the list table ── */
  // Join mapping → policyRule → policy to get policy title + effectiveDate
  const enrichedMappings = mappings.map(m => {
    const rule = policyRules.find(r => r.id === m.policyRuleId);
    const policy = policies.find(p => p.id === rule?.policyId);
    const leaveType = leaveTypes.find(lt => lt.id === m.leaveTypeId);
    const daysPerYear = rule?.entitledDaysPerYear || leaveType?.defaultDays || 0;
    return {
      ...m,
      policyTitle: policy?.title || '—',
      policyEffectiveDate: policy?.effectiveDate || null,
      policyStatus: policy?.status || '—',
      daysPerYear,
      applicableTo: formatApplicableTo(rule),
      badges: getAppliesToBadges(rule),
    };
  });

  const filtered = enrichedMappings.filter(m => {
    if (filterPolicyId) {
      const rule = policyRules.find(r => r.id === m.policyRuleId);
      if (rule?.policyId !== filterPolicyId) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.leaveTypeName || '').toLowerCase().includes(q)
      || (m.policyRuleName || '').toLowerCase().includes(q)
      || (m.policyTitle || '').toLowerCase().includes(q);
  });

  /* ── Counts for step cards ── */
  const counts = {
    types: leaveTypes.length,
    policies: policies.length,
    rules: policyRules.length,
    mapping: mappings.length,
  };

  /* ── Matrix view data ── */
  const matrixPolicies = policies;
  const getMatrixCell = (leaveTypeId: string, policyId: string) => {
    const matching = mappings.filter(m => m.leaveTypeId === leaveTypeId);
    for (const m of matching) {
      const rule = policyRules.find(r => r.id === m.policyRuleId);
      if (rule?.policyId === policyId) return m.policyRuleName || '✓';
    }
    return null;
  };

  /* ── Handlers ── */
  const handleDelete = async (item: Mapping) => {
    if (!confirm(`Delete mapping "${item.leaveTypeName}" → "${item.policyRuleName}"?`)) return;
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${item.id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Mapping deleted');
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  const openCreate = () => { setEditMapping(null); setShowCreateForm(true); };
  const openEdit = (m: Mapping) => { setEditMapping(m); setShowCreateForm(true); };
  const closeForm = () => { setShowCreateForm(false); setEditMapping(null); };

  /* ════════════════════════════════════════════════════════════ */
  /* RENDER                                                        */
  /* ════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* ── 4 step cards at top (matching screenshot 2) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StepCard num={1} title="Leave Types" count={counts.types} subtitle="Name, code and category" icon={<FiLayers className="w-5 h-5" />} color="emerald" />
        <StepCard num={2} title="Leave Policy" count={counts.policies} subtitle="Who it applies to, leave year" icon={<FiClipboard className="w-5 h-5" />} color="blue" />
        <StepCard num={3} title="Leave Rules" count={counts.rules} subtitle="Entitlement, limits, carry forward" icon={<FiSettings className="w-5 h-5" />} color="amber" />
        <StepCard num={4} title="Mapping" count={counts.mapping} subtitle="Attach types + rules to a policy" icon={<FiLink2 className="w-5 h-5" />} color="violet" active />
      </div>

      {/* ── Create Mapping form (inline, matching screenshot 1) ── */}
      {showCreateForm && (
        <CreateMappingForm
          mode={editMapping ? 'edit' : 'add'}
          editItem={editMapping}
          leaveTypes={leaveTypes}
          policyRules={policyRules}
          policies={policies}
          onClose={closeForm}
          onSaved={() => { closeForm(); fetchAll(); }}
          companyId={effectiveCompanyId()}
        />
      )}

      {/* ── Policy Mapping table card ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Card header with title + List/Matrix toggle + filter + Create button */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex items-center gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Policy Mapping</h3>
            <p className="text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? 'mapping' : 'mappings'} · a policy decides who gets which leaves</p>
          </div>
          <div className="flex-1" />
          {/* List/Matrix toggle */}
          <div className="inline-flex border border-slate-300 rounded-lg overflow-hidden">
            <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${view === 'list' ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              <FiList className="w-3 h-3" /> List
            </button>
            <button onClick={() => setView('matrix')} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${view === 'matrix' ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              <FiGrid className="w-3 h-3" /> Matrix
            </button>
          </div>
          {/* Policy filter */}
          <select value={filterPolicyId} onChange={e => setFilterPolicyId(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20">
            <option value="">All policies</option>
            {policies.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {/* Search */}
          <div className="relative w-40">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
          </div>
          {/* Refresh */}
          <button onClick={fetchAll} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {/* Create Mapping button */}
          <button onClick={openCreate} disabled={showCreateForm} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-semibold text-xs shadow-sm shadow-violet-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <FiPlus className="w-3.5 h-3.5" /> Create Mapping
          </button>
        </div>

        {/* LIST view */}
        {view === 'list' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <FiRefreshCw className="w-4 h-4 animate-spin" /> Loading mappings...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FiLink2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500 font-medium">No mappings found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {mappings.length === 0 ? 'Click "Create Mapping" above to create your first mapping.' : 'No mappings match the current filter.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Policy</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Leave Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Rule Applied</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Days/Year</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Effective From</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{m.policyTitle}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {m.leaveTypeCode && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ltPill(m.leaveTypeCode)}`}>{m.leaveTypeCode}</span>}
                          <span className="font-medium text-slate-900">{m.leaveTypeName || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{m.policyRuleName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{m.daysPerYear}</span>
                        <span className="text-xs text-slate-400 ml-1">days</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(m.policyEffectiveDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${m.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                          {m.status === 'active' ? 'Active' : m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => openEdit(m)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 transition-colors" title="Edit this mapping">
                            <FiEdit2 className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => handleDelete(m)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* MATRIX view */}
        {view === 'matrix' && (
          <div className="overflow-x-auto">
            {leaveTypes.length === 0 || matrixPolicies.length === 0 ? (
              <div className="p-12 text-center">
                <FiGrid className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">Need at least 1 leave type + 1 policy for matrix view</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">Leave Type</th>
                    {matrixPolicies.map(p => <th key={p.id} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">{p.title}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveTypes.map(lt => (
                    <tr key={lt.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ltPill(lt.code)}`}>{lt.code}</span>
                          <span className="font-medium text-slate-900">{lt.name}</span>
                        </div>
                      </td>
                      {matrixPolicies.map(p => {
                        const cell = getMatrixCell(lt.id, p.id);
                        return (
                          <td key={p.id} className="px-4 py-3 text-center">
                            {cell ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-xs font-medium" title={cell}>
                                <FiLink2 className="w-3 h-3" /> {cell.length > 18 ? cell.slice(0, 16) + '…' : cell}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Step Card sub-component                                       */
/* ════════════════════════════════════════════════════════════ */
function StepCard({ num, title, count, subtitle, icon, color, active }: {
  num: number; title: string; count: number; subtitle: string;
  icon: React.ReactNode; color: 'emerald' | 'blue' | 'amber' | 'violet'; active?: boolean;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', badge: 'bg-violet-100 text-violet-700' },
  };
  const c = colorMap[color];
  return (
    <div className={`bg-white rounded-xl border p-4 ${active ? 'border-violet-500 border-2 bg-violet-50/30' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${active ? 'bg-violet-600 text-white' : `${c.bg} ${c.text}`}`}>{num}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>{count}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Create Mapping Form (inline, matching screenshot 1)          */
/* ════════════════════════════════════════════════════════════ */
function CreateMappingForm({ mode, editItem, leaveTypes, policyRules, policies, onClose, onSaved, companyId }: {
  mode: 'add' | 'edit';
  editItem: Mapping | null;
  leaveTypes: LeaveType[];
  policyRules: PolicyRule[];
  policies: Policy[];
  onClose: () => void;
  onSaved: () => void;
  companyId: string | null;
}) {
  // Step 1: selected policy (for add mode, pick from dropdown; for edit mode, derive from existing mapping's rule)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(() => {
    if (mode === 'edit' && editItem) {
      const rule = policyRules.find(r => r.id === editItem.policyRuleId);
      return rule?.policyId || '';
    }
    return '';
  });

  // Step 2: per-leave-type rows with Include checkbox + selected rule + days/year
  const [rows, setRows] = useState<Array<{
    leaveTypeId: string;
    leaveTypeName: string;
    leaveTypeCode: string;
    defaultDays: number;
    included: boolean;
    ruleId: string;
    daysPerYear: number;
  }>>(() => {
    if (mode === 'edit' && editItem) {
      // Edit mode: single row for the mapped leave type
      const lt = leaveTypes.find(l => l.id === editItem.leaveTypeId);
      return [{
        leaveTypeId: editItem.leaveTypeId,
        leaveTypeName: editItem.leaveTypeName || lt?.name || '',
        leaveTypeCode: editItem.leaveTypeCode || lt?.code || '',
        defaultDays: lt?.defaultDays || 0,
        included: true,
        ruleId: editItem.policyRuleId,
        daysPerYear: lt?.defaultDays || 0,
      }];
    }
    // Add mode: all leave types, pre-populated with existing mappings if any
    return leaveTypes.map(lt => {
      const existingMapping = mappingsForType(lt.id);
      return {
        leaveTypeId: lt.id,
        leaveTypeName: lt.name,
        leaveTypeCode: lt.code,
        defaultDays: lt.defaultDays || 0,
        included: false,
        ruleId: existingMapping?.policyRuleId || '',
        daysPerYear: lt.defaultDays || 0,
      };
    });
  });

  // Helper: find existing mapping for a leave type
  function mappingsForType(ltId: string): Mapping | undefined {
    // This is called during init only — uses the outer scope's mappings via closures
    // Since we can't access the parent's mappings directly, default to no existing
    return undefined;
  }

  const [saving, setSaving] = useState(false);

  // When rule changes on a row, update daysPerYear from the rule
  const updateRowRule = (leaveTypeId: string, ruleId: string) => {
    setRows(prev => prev.map(row => {
      if (row.leaveTypeId !== leaveTypeId) return row;
      if (!ruleId) return { ...row, ruleId: '', daysPerYear: row.defaultDays };
      const rule = policyRules.find(r => r.id === ruleId);
      const days = rule?.entitledDaysPerYear || row.defaultDays;
      return { ...row, ruleId, daysPerYear: days };
    }));
  };

  const updateRowDays = (leaveTypeId: string, days: number) => {
    setRows(prev => prev.map(row => row.leaveTypeId === leaveTypeId ? { ...row, daysPerYear: days } : row));
  };

  const toggleRowIncluded = (leaveTypeId: string) => {
    setRows(prev => prev.map(row => row.leaveTypeId === leaveTypeId ? { ...row, included: !row.included } : row));
  };

  const handleSave = async () => {
    if (mode === 'add' && !selectedPolicyId) { toast.error('Please select a policy'); return; }

    if (mode === 'edit' && editItem) {
      // Edit mode: update the single mapping
      const row = rows[0];
      if (!row.ruleId) { toast.error('Please select a rule'); return; }
      setSaving(true);
      try {
        const payload = {
          leaveTypeId: row.leaveTypeId,
          policyRuleId: row.ruleId,
          priority: editItem.priority,
          employmentType: editItem.employmentType,
          genderApplicability: editItem.genderApplicability,
          branchId: editItem.branchId,
          departmentId: editItem.departmentId,
          employeeIds: editItem.employeeIds,
          companyId: companyId || undefined,
        };
        const res = await fetch(`/api/leave-type-policy-mappings/${editItem.id}`, {
          method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update');
        toast.success('Mapping updated');
        onSaved();
      } catch (e: any) { toast.error(e.message || 'Failed to save'); }
      finally { setSaving(false); }
      return;
    }

    // Add mode: create one mapping per included row
    const includedRows = rows.filter(r => r.included && r.ruleId);
    if (includedRows.length === 0) {
      toast.error('Please tick at least one leave type and select a rule');
      return;
    }
    setSaving(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const row of includedRows) {
        // For each row, find the rule to get its scope
        const rule = policyRules.find(r => r.id === row.ruleId);
        const payload = {
          leaveTypeId: row.leaveTypeId,
          policyRuleId: row.ruleId,
          priority: 10,
          employmentType: rule?.employmentType || 'all',
          genderApplicability: rule?.genderApplicability || rule?.gender || 'all',
          branchId: rule?.branchId || null,
          departmentId: rule?.departmentId || null,
          employeeIds: null,
          companyId: companyId || undefined,
        };
        try {
          const res = await fetch('/api/leave-type-policy-mappings', {
            method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload),
          });
          if (res.ok) successCount++;
          else failCount++;
        } catch { failCount++; }
      }
      if (successCount > 0) {
        toast.success(`Created ${successCount} mapping(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
        onSaved();
      } else {
        toast.error('Failed to create any mappings');
      }
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId);
  const includedCount = rows.filter(r => r.included && r.ruleId).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-6 space-y-5">
        {/* Header with breadcrumb */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {/* Breadcrumb: Leave / Mapping / Create Mapping */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
              <span>Leave</span>
              <span className="text-slate-300">/</span>
              <span>Mapping</span>
              <span className="text-slate-300">/</span>
              <span className="text-violet-600 font-medium">{mode === 'edit' ? 'Edit Mapping' : 'Create Mapping'}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FiLink2 className="w-5 h-5 text-violet-500" /> {mode === 'edit' ? 'Edit Mapping' : 'Create Mapping'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'edit'
                ? 'Update the leave type + rule for this mapping.'
                : 'Select a policy, then tick the leave types to include and pick the applicable rule for each.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Close">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1 — Select Policy */}
        {mode === 'add' && (
          <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <h3 className="text-sm font-semibold text-slate-900">Select Policy <span className="text-red-500">*</span></h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Leave Policy</label>
                <select value={selectedPolicyId} onChange={e => setSelectedPolicyId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20">
                  <option value="">— Select a policy —</option>
                  {policies.map(p => (
                    <option key={p.id} value={p.id}>{p.title} (v{p.version || '1.0'}){p.status === 'active' ? ' — Active' : ''}</option>
                  ))}
                </select>
              </div>
              {selectedPolicy && (
                <div className="text-xs text-slate-600 space-y-1 sm:pt-7">
                  <p><span className="font-medium">Status:</span> <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs ${selectedPolicy.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{selectedPolicy.status === 'active' ? 'Active' : selectedPolicy.status}</span></p>
                  <p><span className="font-medium">Effective:</span> {fmtDate(selectedPolicy.effectiveDate)}</p>
                  <p><span className="font-medium">Leave Year:</span> {deriveLeaveYear(selectedPolicy)}</p>
                  {selectedPolicy.description && <p className="text-slate-500">{selectedPolicy.description}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Leave Types & Rules table */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">{mode === 'edit' ? '2' : '2'}</span>
            <h3 className="text-sm font-semibold text-slate-900">Leave Types &amp; Rules</h3>
            <span className="text-xs text-slate-500">— {mode === 'edit' ? 'update the rule for this leave type' : 'tick the leave types to include under this policy'}</span>
          </div>

          {leaveTypes.length === 0 ? (
            <div className="text-sm text-slate-500 bg-white rounded-lg p-4 border border-slate-200">No leave types configured. Create leave types first in the Leave Types tab.</div>
          ) : policyRules.length === 0 ? (
            <div className="text-sm text-slate-500 bg-white rounded-lg p-4 border border-slate-200">No policy rules defined. Create rules first in the Policy Rules tab.</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-16 text-center">Include</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Leave Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Applicable Rule</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">Days/Year</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Applicable To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const rule = policyRules.find(r => r.id === row.ruleId);
                    const badges = getAppliesToBadges(rule);
                    return (
                      <tr key={row.leaveTypeId} className={`transition-colors ${row.included ? 'bg-violet-50/40' : 'hover:bg-slate-50/50'}`}>
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={row.included} onChange={() => toggleRowIncluded(row.leaveTypeId)} className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ltPill(row.leaveTypeCode)}`}>{row.leaveTypeCode}</span>
                            <span className="font-medium text-slate-900">{row.leaveTypeName}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">default {row.defaultDays} days/year</p>
                        </td>
                        <td className="px-4 py-3">
                          <select value={row.ruleId} onChange={e => updateRowRule(row.leaveTypeId, e.target.value)} disabled={mode === 'edit'} className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400">
                            <option value="">— Select rule —</option>
                            {policyRules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min={0} value={row.daysPerYear} onChange={e => updateRowDays(row.leaveTypeId, parseInt(e.target.value) || 0)} disabled={!row.ruleId} className="w-24 px-2 py-1 rounded border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-400" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {badges.map(b => <span key={b.label} className={`text-xs px-1.5 py-0.5 rounded ${b.className}`}>{b.label}</span>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || (mode === 'add' && (!selectedPolicyId || includedCount === 0))} className="px-6 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-violet-500/25 transition-colors flex items-center gap-2">
            <FiSave className="w-4 h-4" />
            {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : `Save Mapping${includedCount > 0 ? ` (${includedCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
