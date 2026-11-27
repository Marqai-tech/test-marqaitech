'use client';

/**
 * Bulk Policy Mapping — assign ONE leave policy to MANY employees at once.
 *
 * Flow (3-step wizard, matches the approved design):
 *   1. Choose policy    — policy cards fetched from the backend, grouped by leave type
 *   2. Select employees — company roster with each employee's CURRENT policy for
 *                          the chosen leave type; search / filters / CSV upload
 *   3. Review & apply   — summary, then POST maps the policy onto the employees
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FiCheck, FiChevronLeft, FiChevronRight, FiUpload, FiUsers, FiSearch,
  FiList, FiMove, FiFileText, FiX, FiArrowRight, FiRefreshCw, FiInfo,
  FiCheckCircle, FiAlertTriangle, FiDownload, FiLayers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ──────────────────────────────────────────────────────────────── types
interface PolicyCard {
  id: string;
  name: string;
  ruleCode: string;
  description?: string | null;
  daysPerYear: number;
  carryForward: boolean;
  maxCarryForwardDays: number;
  maxForLabel: string | null;
  meantFor: string;
  mappedCount: number;
  leaveTypeId: string;
  isOpenEnded: boolean;
}

interface PolicyGroup {
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  color?: string | null;
  policies: PolicyCard[];
}

interface EmployeeRow {
  id: string;
  empCode: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  location: string;
  employeeStatus: string;
  status: string;
  currentPolicy: { id: string; name: string; ruleCode: string } | null;
}

interface ApplyResult {
  success: boolean;
  policy: { id: string; name: string; ruleCode: string; leaveTypeId: string };
  applied: number;
  alreadyOnIt: number;
  movedFromOther: number;
  invalidEmployees: number;
  mappingsSynced: number;
  totalMappedNow: number;
}

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ──────────────────────────────────────────────────────────────── page
export default function BulkPolicyMappingPage() {
  const role = useAuthStore(s => s.user?.role || 'employee');
  const scopeQueryStr = useCompanyContextStore(s => s.scopeQuery());

  // BUG FIX: Fetch policies directly from the Policy table (where the user
  // creates them in Leave Setup Step 2), NOT from LeavePolicyRule (Step 3).
  // The previous code used /api/leave/bulk-policy-mapping?mode=policies which
  // reads from LeavePolicyRule — if no rules were created, it returned empty
  // or seed data. Now we fetch from /api/policies?category=leave which has
  // the company fallback and reads the actual Policy table.
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string>('');
  useEffect(() => {
    if (scopeQueryStr) return;
    (async () => {
      try {
        // Try to get companyId from own employee record
        const r = await fetch('/api/employees?own=1&limit=1', { headers: getAuthHeaders() });
        if (r.ok) {
          const d = await r.json();
          const emp = d.employees?.[0];
          if (emp?.companyId) { setResolvedCompanyId(emp.companyId); return; }
        }
        // Fallback: look up "TechCorp Global" company by name
        const cr = await fetch('/api/companies?limit=100', { headers: getAuthHeaders() });
        if (cr.ok) {
          const cd = await cr.json();
          const companies = cd.data || cd.companies || cd || [];
          const techcorp = companies.find((c: any) => 
            (c.name || '').toLowerCase().includes('techcorp') ||
            (c.name || '').toLowerCase().includes('acme')
          );
          if (techcorp?.id) setResolvedCompanyId(techcorp.id);
          else if (companies[0]?.id) setResolvedCompanyId(companies[0].id);
        }
      } catch {}
    })();
  }, [scopeQueryStr]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [groups, setGroups] = useState<PolicyGroup[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [selectedPolicies, setSelectedPolicies] = useState<PolicyCard[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PolicyGroup | null>(null);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [listTab, setListTab] = useState<'list' | 'drag' | 'csv'>('list');

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(role);

  // Helper: parse JSON array from a runtime TEXT column
  const parseJsonArr = (v: any): string[] => {
    try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; }
  };

  // ─── fetch policies from Policy table (NOT LeavePolicyRule) ───
  const loadPolicies = useCallback(async () => {
    setLoadingPolicies(true);
    try {
      // Fetch policies from /api/policies?category=leave (has company fallback)
      const qs = scopeQueryStr ? `?${scopeQueryStr}` : '';
      const polRes = await fetch(`/api/policies?category=leave&limit=100${qs ? '&' + scopeQueryStr : ''}`, { headers: getAuthHeaders() });
      const polData = polRes.ok ? await polRes.json() : {};
      const allPolicies = polData.data || polData.policies || [];

      // Fetch leave types to get names/codes for grouping
      const ltRes = await fetch(`/api/leave-types?limit=100${qs ? '&' + scopeQueryStr : ''}`, { headers: getAuthHeaders() }).catch(() => null);
      const ltData = ltRes?.ok ? await ltRes.json() : {};
      const allTypes = ltData.data || [];

      // Build groups: one per leave type, with policies that include that type
      const groupMap = new Map<string, PolicyGroup>();
      for (const p of allPolicies) {
        if (p.status !== 'active') continue;
        const ltIds = parseJsonArr(p.leaveTypeIds);
        if (ltIds.length === 0) continue;

        for (const ltId of ltIds) {
          const lt = allTypes.find((t: any) => t.id === ltId);
          if (!groupMap.has(ltId)) {
            groupMap.set(ltId, {
              leaveTypeId: ltId,
              leaveTypeName: lt?.name || 'Unknown',
              leaveTypeCode: lt?.code || '—',
              color: lt?.calendarColor || null,
              policies: [],
            });
          }
          groupMap.get(ltId)!.policies.push({
            id: p.id,
            name: p.title || p.name || 'Untitled',
            ruleCode: p.code || p.version || '—',
            description: p.description || null,
            daysPerYear: lt?.defaultDays || 0,
            carryForward: false,
            maxCarryForwardDays: 0,
            maxForLabel: null,
            meantFor: 'All employees',
            mappedCount: 0,
            leaveTypeId: ltId,
            isOpenEnded: false,
          });
        }
      }

      const resultGroups = Array.from(groupMap.values()).sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));
      setGroups(resultGroups);
      if (resultGroups.length === 0) {
        toast('No leave policies found. Create policies in Leave Setup first.', { icon: 'ℹ️' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load policies');
      setGroups([]);
    } finally {
      setLoadingPolicies(false);
    }
  }, [scopeQueryStr, resolvedCompanyId]);

  // ─── fetch policies (initial load; uses loadPolicies which fetches from Policy table) ───
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        // Fetch policies from /api/policies?category=leave (Policy table, not LeavePolicyRule)
        const polRes = await fetch(`/api/policies?category=leave&limit=100`, { headers: getAuthHeaders() });
        const polData = polRes.ok ? await polRes.json() : {};
        const allPolicies = polData.data || polData.policies || [];
        // Fetch leave types for grouping
        const ltRes = await fetch(`/api/leave-types?limit=100`, { headers: getAuthHeaders() }).catch(() => null);
        const ltData = ltRes?.ok ? await ltRes.json() : {};
        const allTypes = ltData.data || [];
        if (cancelled) return;

        // Build groups from Policy.leaveTypeIds
        const groupMap = new Map<string, PolicyGroup>();
        for (const p of allPolicies) {
          if (p.status !== 'active') continue;
          const ltIds = parseJsonArr(p.leaveTypeIds);
          if (ltIds.length === 0) continue;
          for (const ltId of ltIds) {
            const lt = allTypes.find((t: any) => t.id === ltId);
            if (!groupMap.has(ltId)) {
              groupMap.set(ltId, { leaveTypeId: ltId, leaveTypeName: lt?.name || 'Unknown', leaveTypeCode: lt?.code || '—', color: lt?.calendarColor || null, policies: [] });
            }
            groupMap.get(ltId)!.policies.push({ id: p.id, name: p.title || p.name || 'Untitled', ruleCode: p.code || '—', description: p.description || null, daysPerYear: lt?.defaultDays || 0, carryForward: false, maxCarryForwardDays: 0, maxForLabel: null, meantFor: 'All employees', mappedCount: 0, leaveTypeId: ltId, isOpenEnded: false });
          }
        }
        const resultGroups = Array.from(groupMap.values()).sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));
        setGroups(resultGroups);
        if (resultGroups.length === 0) {
          toast('No leave policies found. Create policies in Leave Setup first.', { icon: 'ℹ️' });
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load policies');
          setGroups([]);
        }
      } finally {
        if (!cancelled) setLoadingPolicies(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, scopeQueryStr, resolvedCompanyId]);

  // ─── fetch employees for chosen policy's leave type ───
  const loadEmployees = useCallback(async (policy: PolicyCard) => {
    setLoadingEmployees(true);
    try {
      const qs = scopeQueryStr ? `&${scopeQueryStr}` : (resolvedCompanyId ? `&companyId=${resolvedCompanyId}` : '');
      const r = await fetch(
        `/api/leave/bulk-policy-mapping?mode=employees&leaveTypeId=${policy.leaveTypeId}${qs}`,
        { headers: getAuthHeaders() },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setEmployees(j.employees || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load employees');
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, [scopeQueryStr, resolvedCompanyId]);

  // ─── step transitions ───
  const goStep2 = () => {
    if (selectedPolicies.length === 0) return;
    setSelectedIds(new Set());
    setSearch(''); setDeptFilter(''); setLocFilter(''); setStatusFilter('');
    setBranchFilter(''); setDesignationFilter('');
    setListTab('list');
    setStep(2);
    loadEmployees(selectedPolicies[0]);
  };

  const goStep3 = () => {
    if (selectedIds.size === 0) { toast.error('Select at least one employee'); return; }
    setStep(3);
  };

  const applyMapping = async () => {
    if (selectedPolicies.length === 0) return;
    setApplying(true);
    try {
      const qs = scopeQueryStr ? `?${scopeQueryStr}` : '';
      const r = await fetch(`/api/leave/bulk-policy-mapping${qs}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ policyId: selectedPolicies[0].id, policyIds: selectedPolicies.map(p => p.id), employeeIds: [...selectedIds] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      toast.success(`Mapped ${j.applied} employee(s) to ${j.policy.name}`);
      // refresh mapped counts on cards
      loadPolicies();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply mapping');
    } finally {
      setApplying(false);
    }
  };

  const resetAll = () => {
    setStep(1); setSelectedPolicies([]); setSelectedGroup(null);
    setSelectedIds(new Set()); setEmployees([]); setResult(null);
    loadPolicies();
  };

  // ─── CSV handling ───
  const downloadTemplate = () => {
    const rows = [
      'employeeId,email,name,department',
      'EMP001,aarav.sharma@company.com,Aarav Sharma,Engineering',
      'EMP002,priya.sharma@company.com,Priya Sharma,Sales',
      '',
      '# Fill one row per employee (employeeId OR email is enough), then upload this file in step 2.',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bulk-policy-template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCsvText = (text: string, source: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith('#'));
    if (lines.length === 0) { toast.error('The file appears to be empty'); return; }
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('employeeid') || header.includes('email');
    const rows = hasHeader ? lines.slice(1) : lines;

    const byCode = new Map<string, EmployeeRow>();
    const byEmail = new Map<string, EmployeeRow>();
    for (const e of employees) {
      if (e.empCode) byCode.set(e.empCode.toLowerCase(), e);
      if (e.email) byEmail.set(e.email.toLowerCase(), e);
    }

    const matched = new Set<string>();
    let unmatched = 0;
    for (const line of rows) {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const hit = cols.map(c => byCode.get(c.toLowerCase()) || byEmail.get(c.toLowerCase())).find(Boolean);
      if (hit) matched.add(hit.id); else unmatched++;
    }

    if (matched.size === 0) {
      toast.error(`No matching employees found in ${source}. Use employeeId or email columns.`);
      return;
    }
    setSelectedIds(prev => new Set([...prev, ...matched]));
    toast.success(`${matched.size} employee(s) selected from ${source}${unmatched ? `, ${unmatched} row(s) not matched` : ''}`);
    setListTab('list');
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleCsvText(String(reader.result || ''), file.name);
    reader.onerror = () => toast.error('Could not read the file');
    reader.readAsText(file);
  };

  // ─── filter + search employees ───
  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(d => d && d !== '—'))].sort(), [employees]);
  const locations = useMemo(() => [...new Set(employees.map(e => e.location).filter(l => l && l !== '—'))].sort(), [employees]);
  const branches = useMemo(() => [...new Set(employees.map(e => e.location).filter(l => l && l !== '—'))].sort(), [employees]);
  const designations = useMemo(() => [...new Set(employees.map(e => e.designation).filter(d => d && d !== '—'))].sort(), [employees]);
  const statuses = useMemo(() => [...new Set(employees.map(e => e.employeeStatus).filter(Boolean))].sort(), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => {
      if (q && !(e.name.toLowerCase().includes(q) || e.empCode.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))) return false;
      if (deptFilter && e.department !== deptFilter) return false;
      if (locFilter && e.location !== locFilter) return false;
      if (branchFilter && e.location !== branchFilter) return false;
      if (designationFilter && e.designation !== designationFilter) return false;
      if (statusFilter && e.employeeStatus !== statusFilter) return false;
      return true;
    });
  }, [employees, search, deptFilter, locFilter, branchFilter, designationFilter, statusFilter]);

  const selectedEmployees = useMemo(
    () => employees.filter(e => selectedIds.has(e.id)),
    [employees, selectedIds],
  );

  const toggleEmployee = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (selectedPolicies.length === 0) return { newMap: 0, switched: 0, already: 0 };
    let newMap = 0, switched = 0, already = 0;
    for (const e of selectedEmployees) {
      if (!e.currentPolicy) newMap++;
      else if (e.currentPolicy.id === selectedPolicies[0].id) already++;
      else switched++;
    }
    return { newMap, switched, already };
  }, [selectedEmployees, selectedPolicies]);

  // ───────────────────────────────────────────── access guard ───
  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4"><FiAlertTriangle className="w-6 h-6" /></div>
          <h2 className="text-lg font-semibold text-slate-900">Admin access required</h2>
          <p className="text-sm text-slate-500 mt-1">Bulk policy mapping is available to HR and admin roles only.</p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 3 — Review & apply
  // ════════════════════════════════════════════════════════════════
  if (step === 3 && selectedPolicies.length > 0 && !result) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
          <span>Leave</span><FiChevronRight className="w-3 h-3" /><span>Policies</span><FiChevronRight className="w-3 h-3" /><span className="text-slate-900 font-medium">Bulk policy mapping</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900">Review &amp; apply</h1>
        <p className="text-sm text-slate-500 mt-1">Confirm the mapping below. Applying updates each selected employee&apos;s leave policy instantly.</p>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {/* Policy summary */}
          <div className="md:col-span-1 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Mapping to</p>
            <p className="text-lg font-bold text-slate-900 mt-2">{selectedPolicies[0].name}</p>
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600">{selectedPolicies[0].ruleCode}</span>
            <div className="mt-4 space-y-1.5 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">{selectedPolicies[0].daysPerYear}</span> days / year</p>
              <p>Carry forward: <span className="font-medium">{selectedPolicies[0].carryForward ? 'Yes' : 'No'}</span></p>
              <p>Meant for: <span className="font-medium">{selectedPolicies[0].meantFor}</span></p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">New mappings</span><span className="font-semibold text-emerald-600">{stats.newMap}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Switched from another policy</span><span className="font-semibold text-amber-600">{stats.switched}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Already on it</span><span className="font-semibold text-slate-400">{stats.already}</span></p>
            </div>
          </div>

          {/* Employee list */}
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{selectedEmployees.length} employee{selectedEmployees.length === 1 ? '' : 's'} selected</p>
              <button onClick={() => setStep(2)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Edit selection</button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {selectedEmployees.map(e => {
                const onIt = e.currentPolicy?.id === selectedPolicies[0].id;
                const switched = e.currentPolicy && e.currentPolicy.id !== selectedPolicies[0].id;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(e.id)}`}>{initials(e.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{e.name}</p>
                      <p className="text-xs text-slate-400 truncate">{e.designation} · {e.department}</p>
                    </div>
                    {onIt && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">Already on it</span>}
                    {switched && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                        <span className="max-w-32 truncate">{e.currentPolicy?.ruleCode || e.currentPolicy?.name}</span>
                        <FiArrowRight className="w-3 h-3 text-emerald-500" />
                        <span className="max-w-32 truncate font-medium text-slate-700">{selectedPolicies[0].ruleCode}</span>
                      </span>
                    )}
                    {!e.currentPolicy && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 shrink-0">New mapping</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedPolicies[0].isOpenEnded && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
            <p>This policy currently has no explicit employee list (it applies to everyone who matches its rules). Applying will restrict it to the selected employees {selectedPolicies[0].mappedCount > 0 ? `plus the ${selectedPolicies[0].mappedCount} already mapped` : ''}.</p>
          </div>
        )}

        {applying && (
          <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex items-center gap-3">
              <FiRefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
              <span className="text-sm font-medium text-slate-700">Applying policy mapping…</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="fixed bottom-0 inset-x-0 lg:pl-64 bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-30">
          <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-50">
            <FiChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={applyMapping}
            disabled={applying}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {applying ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiCheckCircle className="w-4 h-4" />}
            Apply mapping
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 3 success screen (rendered after a successful apply)
  // ════════════════════════════════════════════════════════════════
  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <FiCheckCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-5">Mapping applied</h1>
        <p className="text-sm text-slate-500 mt-1">
          {result.applied} employee{result.applied === 1 ? '' : 's'} now on <span className="font-semibold text-slate-700">{result.policy.name}</span>.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-8">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-emerald-600">{result.applied - result.alreadyOnIt}</p>
            <p className="text-xs text-slate-500 mt-1">New mappings</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-amber-600">{result.movedFromOther}</p>
            <p className="text-xs text-slate-500 mt-1">Switched from other policies</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-slate-700">{result.totalMappedNow}</p>
            <p className="text-xs text-slate-500 mt-1">Total on this policy</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 mt-10">
          <button onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FiLayers className="w-4 h-4" /> Map another policy
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 2 — Select employees
  // ════════════════════════════════════════════════════════════════
  if (step === 2 && selectedPolicies.length > 0) {
    return (
      <div className="px-4 sm:px-6 py-6 pb-32">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
          <span>Leave</span><FiChevronRight className="w-3 h-3" /><span>Policies</span><FiChevronRight className="w-3 h-3" /><span className="text-slate-900 font-medium">Bulk policy mapping</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900">Bulk policy mapping</h1>
        <p className="text-sm text-slate-500 mt-1">Assign one leave policy to many employees at once — pick from the list, drag them in, or upload a sheet.</p>

        {/* Sub-stepper with chosen policy chip */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
            <FiCheck className="w-3.5 h-3.5" />
            <span>Choose policy:</span>
            <span className="font-semibold">{selectedPolicies[0].name}{selectedPolicies.length > 1 ? ` +${selectedPolicies.length - 1}` : ''}</span>
            <span className="px-1.5 py-0.5 rounded bg-white/80 border border-emerald-200 text-[10px] font-semibold text-emerald-700">{selectedPolicies[0].ruleCode}</span>
          </button>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
            Select employees
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-slate-400">
            <span className="w-5 h-5 rounded-full border border-slate-300 text-[11px] font-semibold flex items-center justify-center">3</span>
            Review &amp; apply
          </span>
        </div>

        <div className="mt-5 flex flex-col xl:flex-row gap-5 items-start">
          {/* Left: roster */}
          <div className="flex-1 min-w-0 w-full rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1 px-3 pt-2.5 border-b border-slate-100">
              {([
                { key: 'list', label: 'Select from list', icon: FiList },
                { key: 'drag', label: 'Drag & drop', icon: FiMove },
                { key: 'csv', label: 'Upload CSV', icon: FiUpload },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setListTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${listTab === t.key ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>

            {listTab === 'list' && (
              <>
                {/* Search + filters */}
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                  <div className="relative sm:col-span-2 lg:col-span-1">
                    <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search name, ID or designation"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                    />
                  </div>
                  <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Department: All</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Location: All</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Branch: All</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={designationFilter} onChange={e => setDesignationFilter(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Designation: All</option>
                    {designations.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm rounded-lg border border-slate-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Status: All</option>
                    {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>

                {/* Table */}
                {loadingEmployees ? (
                  <div className="py-16 text-center">
                    <FiRefreshCw className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 mt-2">Loading employees…</p>
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="py-16 text-center text-sm text-slate-400">No employees match the current filters.</div>
                ) : (
                  <div className="max-h-[26rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                        <tr className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                          <th className="pl-3 pr-1 py-2 w-10">
                            <input
                              type="checkbox"
                              aria-label="Select all filtered employees"
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              checked={filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.has(e.id))}
                              onChange={e => {
                                if (e.target.checked) setSelectedIds(prev => new Set([...prev, ...filteredEmployees.map(x => x.id)]));
                                else setSelectedIds(prev => new Set([...prev].filter(id => !filteredEmployees.some(x => x.id === id))));
                              }}
                            />
                          </th>
                          <th className="px-2 py-2">Employee</th>
                          <th className="px-2 py-2 hidden md:table-cell">Department</th>
                          <th className="px-2 py-2 hidden lg:table-cell">Location</th>
                          <th className="px-2 py-2 pr-3">Current {selectedGroup?.leaveTypeName || 'leave'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredEmployees.map(e => {
                          const checked = selectedIds.has(e.id);
                          const onIt = e.currentPolicy?.id === selectedPolicies[0].id;
                          return (
                            <tr
                              key={e.id}
                              className={`cursor-pointer transition-colors ${checked ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                              onClick={() => toggleEmployee(e.id)}
                            >
                              <td className="pl-3 pr-1 py-2.5" onClick={ev => ev.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${e.name}`}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  checked={checked}
                                  onChange={() => toggleEmployee(e.id)}
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${avatarColor(e.id)}`}>{initials(e.name)}</span>
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900 truncate max-w-48">{e.name}</p>
                                    <p className="text-[11px] text-slate-400 truncate max-w-48">{e.designation} · {e.empCode}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2.5 text-slate-600 hidden md:table-cell">{e.department}</td>
                              <td className="px-2 py-2.5 text-slate-600 hidden lg:table-cell">{e.location}</td>
                              <td className="px-2 py-2.5 pr-3">
                                {e.currentPolicy ? (
                                  <span className={`inline-flex items-center gap-1.5 text-[11px] ${onIt ? 'text-emerald-700' : 'text-slate-600'}`}>
                                    <span className={`px-1.5 py-0.5 rounded font-medium border ${onIt ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                      {e.currentPolicy.name.replace(selectedGroup ? `${selectedGroup.leaveTypeName} - ` : '', '')}
                                    </span>
                                    <span className="text-slate-400">{onIt ? 'already on it' : 'on another'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-50 border border-slate-200 text-slate-400">Not mapped</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {listTab === 'drag' && (
              <div
                className="m-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors py-14 flex flex-col items-center justify-center text-center px-6"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleCsvFile(f);
                }}
              >
                <FiMove className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600 mt-3">Drag &amp; drop your CSV here</p>
                <p className="text-xs text-slate-400 mt-1">Drop a sheet containing employeeId or email — matched employees get selected instantly.</p>
                <button onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  <FiUpload className="w-3.5 h-3.5" /> or browse files
                </button>
              </div>
            )}

            {listTab === 'csv' && (
              <div className="m-4 rounded-xl border border-slate-200 bg-slate-50/50 py-12 px-6 text-center">
                <FiFileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-600 mt-3">Upload a CSV of employee IDs or emails</p>
                <p className="text-xs text-slate-400 mt-1">One row per employee. Columns: employeeId, email (name/department optional).</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <FiUpload className="w-3.5 h-3.5" /> Choose file
                </button>
                <button onClick={downloadTemplate} className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <FiDownload className="w-3.5 h-3.5" /> Template
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleCsvFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Right: mapping panel */}
          <div className="w-full xl:w-80 shrink-0 rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-4">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Mapping to</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: selectedGroup?.color || '#10b981' }} />
              <p className="text-base font-bold text-slate-900">{selectedPolicies[0].name}</p>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">{selectedPolicies[0].ruleCode}</span>
            </div>

            <div className="border-t border-slate-100 my-4" />

            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-slate-900 leading-none">{selectedIds.size}</p>
                <p className="text-xs text-slate-400 mt-1.5">employees selected</p>
              </div>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())} className="text-xs font-medium text-slate-400 hover:text-rose-500 underline underline-offset-2">Clear</button>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> On another policy</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Already on it</span>
            </div>

            <div className="border-t border-slate-100 my-4" />

            <div className="max-h-64 overflow-y-auto space-y-2.5 -mx-1 px-1">
              {selectedEmployees.length === 0 && <p className="text-xs text-slate-400 py-3 text-center">No employees selected yet — tick rows on the left.</p>}
              {selectedEmployees.map(e => {
                const onIt = e.currentPolicy?.id === selectedPolicies[0].id;
                const other = e.currentPolicy && !onIt;
                return (
                  <div key={e.id} className="flex items-center gap-2.5">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarColor(e.id)}`}>{initials(e.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate">{e.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{e.department}</p>
                    </div>
                    {onIt && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">Already on it</span>}
                    {other && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 shrink-0">On another</span>}
                    <button onClick={() => toggleEmployee(e.id)} aria-label={`Remove ${e.name}`} className="text-slate-300 hover:text-rose-500 shrink-0"><FiX className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="fixed bottom-0 inset-x-0 lg:pl-64 bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-30">
          <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-50">
            <FiChevronLeft className="w-4 h-4" /> Back
          </button>
          <p className="hidden sm:block text-sm text-slate-500 truncate">
            <span className="font-semibold text-slate-700">{selectedIds.size}</span> selected for {selectedPolicies[0].name}
          </p>
          <button
            onClick={goStep3}
            disabled={selectedIds.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 1 — Choose policy
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="px-4 sm:px-6 py-6 pb-32">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
        <span>Leave</span><FiChevronRight className="w-3 h-3" /><span>Policies</span><FiChevronRight className="w-3 h-3" /><span className="text-slate-900 font-medium">Bulk policy mapping</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk policy mapping</h1>
          <p className="text-sm text-slate-500 mt-1">Assign one leave policy to many employees at once — pick from the list, drag them in, or upload a sheet.</p>
        </div>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <FiUpload className="w-3.5 h-3.5" /> Upload template
        </button>
      </div>

      {/* Stepper */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">1</span>
          Choose policy
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-slate-400">
          <span className="w-5 h-5 rounded-full border border-slate-300 text-[11px] font-semibold flex items-center justify-center">2</span>
          Select employees
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-slate-400">
          <span className="w-5 h-5 rounded-full border border-slate-300 text-[11px] font-semibold flex items-center justify-center">3</span>
          Review &amp; apply
        </span>
      </div>

      {/* Policy groups */}
      {loadingPolicies ? (
        <div className="py-24 text-center">
          <FiRefreshCw className="w-7 h-7 text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 mt-3">Loading leave policies…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center mx-auto"><FiLayers className="w-6 h-6" /></div>
          <p className="text-sm font-medium text-slate-600 mt-4">No leave policies yet</p>
          <p className="text-xs text-slate-400 mt-1">Create leave types and policies in Leave Setup, then come back to map them in bulk.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(g => (
            <section key={g.leaveTypeId}>
              <h2 className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <span className="w-2 h-2 rounded-full" style={{ background: g.color || '#10b981' }} />
                {g.leaveTypeName}
              </h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {g.policies.map(p => {
                  const selected = selectedPolicies.some(sp => sp.id === p.id);
                  const togglePolicy = () => {
                    setSelectedPolicies(prev => {
                      const exists = prev.some(sp => sp.id === p.id);
                      if (exists) return prev.filter(sp => sp.id !== p.id);
                      return [...prev, p];
                    });
                    setSelectedGroup(g);
                  };
                  return (
                    <button
                      key={p.id}
                      onClick={togglePolicy}
                      aria-pressed={selected}
                      className={`relative text-left rounded-xl border bg-white p-5 transition-all ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/15 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                    >
                      {/* radio / check */}
                      <span className={`absolute top-4 left-4 w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${selected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                        {selected && <FiCheck className="w-3 h-3" />}
                      </span>
                      <span className="absolute top-4 right-4 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-500">{p.ruleCode}</span>

                      <div className="pl-8 pt-1">
                        <p className="text-sm font-semibold text-slate-900 pr-14 leading-snug">{p.name}</p>
                        <p className="mt-1.5"><span className="text-2xl font-bold text-slate-900">{p.daysPerYear}</span> <span className="text-xs text-slate-400">days / year</span></p>
                        <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
                          <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" /> Carry forward: {p.carryForward ? `Yes${p.maxCarryForwardDays ? ` (up to ${p.maxCarryForwardDays} days)` : ''}` : 'No'}</li>
                          {p.maxForLabel && <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" /> Max for: {p.maxForLabel}</li>}
                          <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-teal-400 shrink-0" /> Meant for: {p.meantFor}</li>
                        </ul>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <FiUsers className="w-3.5 h-3.5" /> {p.mappedCount} employee{p.mappedCount === 1 ? '' : 's'} mapped today
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-0 inset-x-0 lg:pl-64 bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-30">
        <button disabled className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 px-3 py-2 cursor-not-allowed">
          <FiChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          {selectedPolicies.length > 0 && (
            <span className="hidden sm:block text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{selectedPolicies.length}</span> policy{selectedPolicies.length === 1 ? '' : 'ies'} selected
            </span>
          )}
          <button
            onClick={goStep2}
            disabled={selectedPolicies.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {selectedPolicies.length > 0 ? `Continue with ${selectedPolicies.length} policy(ies)` : 'Continue'} <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
