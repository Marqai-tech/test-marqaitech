'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiSearch, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiClipboard, FiSave, FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  companyId: string;
  employmentType: string;
  branchId: string | null;
  branchName?: string;
  departmentId: string | null;
  departmentName?: string;
  leaveTypeAllocations: string;
  sandwichRuleEnabled: boolean;
  proRataEnabled: boolean;
  probationRestriction: boolean;
  probationMonths: number;
  encashmentAllowed: boolean;
  carryForwardGlobal: boolean;
  maxCarryForwardDays: number;
  priority: number;
  status: string;
  // Extended fields
  annualQuota?: number;
  accrualFrequency?: string;
  accrualAmount?: number;
  maxBalance?: number;
  openingBalance?: number;
  prorateNewJoiners?: boolean;
  accrualStartDate?: string;
  minAdvanceNotice?: number;
  maxFutureDays?: number;
  backdatedAllowed?: boolean;
  backdatedMaxDays?: number;
  minConsecutiveDays?: number;
  maxConsecutiveDays?: number;
  halfDayEligible?: boolean;
  requireAttachment?: boolean;
  requireAttachmentAfterDays?: number;
  overlappingLeaveAllowed?: boolean;
  genderApplicability?: string;
  employeeIds?: string;
  effectiveFromDate?: string;
  effectiveToDate?: string;
  yearEndProcessingMode?: string;
  yearEndMaxCarryForward?: number;
  yearEndMaxEncashment?: number;
  yearEndExpiryDays?: number;
  encashmentBasis?: string;
  encashmentMaxDays?: number;
  encashmentAutoYearEnd?: boolean;
  encashmentEmployeeInitiated?: boolean;
}

interface Branch { id: string; name: string; }
interface Department { id: string; name: string; }
interface LeaveType { id: string; name: string; code: string; defaultDays: number; }

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
const ACCRUAL_FREQ = [
  { value: 'yearly', label: 'Yearly (lump sum at year start)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'fixed', label: 'Fixed (no accrual — set opening balance)' },
  { value: 'none', label: 'None' },
];
const YEAR_END_MODES = [
  { value: 'carry_forward', label: 'Carry forward all eligible balance' },
  { value: 'expire', label: 'All unused leave expires / resets' },
  { value: 'payout_all', label: 'Pay out all eligible balance' },
  { value: 'pay_n_carry_rest', label: 'Pay N days, carry forward the rest' },
  { value: 'carry_n_pay_rest', label: 'Carry N days, pay out the rest' },
];
const ENCASHMENT_BASIS = [
  { value: 'basic', label: 'Basic salary' },
  { value: 'gross', label: 'Gross salary' },
  { value: 'monthly_salary', label: 'Monthly salary' },
];

export default function LeavePoliciesTab() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<PolicyRule | null>(null);
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // BUG FIX: pass scopeQuery() so the API filters by the selected company.
      // Previously the GET fetched ALL policies across the tenant, and the POST
      // fell back to the first company in the DB — so policies were stored in
      // the wrong company.
      const sq = scopeQuery();
      const [pRes, bRes, dRes, ltRes] = await Promise.all([
        fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
        fetch(`/api/branches${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/departments${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }),
      ]);
      const pData = await pRes.json();
      setPolicies(pData.data || []);
      if (bRes?.ok) { const b = await bRes.json(); setBranches(b.data || b || []); }
      if (dRes?.ok) { const d = await dRes.json(); setDepartments(d.data || d || []); }
      const ltData = await ltRes.json();
      setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
    } catch (e) {
      toast.error('Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = policies.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (item: PolicyRule) => {
    if (!confirm(`Delete policy "${item.name}"? Mappings referencing it will also be removed.`)) return;
    try {
      const res = await fetch(`/api/leave-policy-rules?id=${item.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Policy deleted');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search policies..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setEditItem(null); setShowDialog(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <FiPlus className="w-4 h-4" /> Add Leave Policy
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading policies...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FiClipboard className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">{search ? 'No policies match your search.' : 'No policies yet. Click "Add Leave Policy" to create one.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Policy Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Quota</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Year-End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {p.employmentType !== 'all' && <span className="mr-1">{p.employmentType}</span>}
                      {p.branchName && <span className="mr-1">📍{p.branchName}</span>}
                      {p.departmentName && <span>🏛{p.departmentName}</span>}
                      {p.employmentType === 'all' && !p.branchName && !p.departmentName && <span className="text-gray-400">All</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.annualQuota || '—'} days</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{YEAR_END_MODES.find(m => m.value === p.yearEndProcessingMode)?.label?.split(' ')[0] || 'Carry'}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{p.priority}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {p.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => { setEditItem(p); setShowDialog(true); }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(p)}
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
        <PolicyDialog
          mode={editItem ? 'edit' : 'add'}
          editItem={editItem}
          branches={branches}
          departments={departments}
          leaveTypes={leaveTypes}
          existingPolicies={policies}
          onClose={() => setShowDialog(false)}
          onSaved={() => { setShowDialog(false); fetchAll(); }}
        />
      )}
    </div>
  );
}

/* ───────── Full Policy Editor Dialog ───────── */
function PolicyDialog({ mode, editItem, branches, departments, leaveTypes, existingPolicies, onClose, onSaved }: {
  mode: 'add' | 'edit';
  editItem: PolicyRule | null;
  branches: Branch[];
  departments: Department[];
  leaveTypes: LeaveType[];
  existingPolicies: PolicyRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Basic
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [priority, setPriority] = useState(0);
  // Applicability
  const [employmentType, setEmploymentType] = useState('all');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [genderApplicability, setGenderApplicability] = useState('all');
  // Quota & Accrual
  const [annualQuota, setAnnualQuota] = useState('0');
  const [accrualFrequency, setAccrualFrequency] = useState('yearly');
  const [accrualAmount, setAccrualAmount] = useState('0');
  const [maxBalance, setMaxBalance] = useState('0');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [prorateNewJoiners, setProrateNewJoiners] = useState(true);
  // Restrictions
  const [minAdvanceNotice, setMinAdvanceNotice] = useState('0');
  const [maxFutureDays, setMaxFutureDays] = useState('0');
  const [backdatedAllowed, setBackdatedAllowed] = useState(false);
  const [backdatedMaxDays, setBackdatedMaxDays] = useState('0');
  const [minConsecutiveDays, setMinConsecutiveDays] = useState('0');
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState('0');
  const [halfDayEligible, setHalfDayEligible] = useState(true);
  const [requireAttachment, setRequireAttachment] = useState(false);
  const [requireAttachmentAfterDays, setRequireAttachmentAfterDays] = useState('0');
  const [overlappingLeaveAllowed, setOverlappingLeaveAllowed] = useState(false);
  // Holidays & Weekoffs
  const [sandwichRuleEnabled, setSandwichRuleEnabled] = useState(true);
  // Probation — BUG_152: default off (consistent with Leave Type form)
  const [probationRestriction, setProbationRestriction] = useState(false);
  const [probationMonths, setProbationMonths] = useState('6');
  const [proRataEnabled, setProRataEnabled] = useState(false);
  // Year-End
  const [yearEndProcessingMode, setYearEndProcessingMode] = useState('carry_forward');
  const [yearEndMaxCarryForward, setYearEndMaxCarryForward] = useState('0');
  const [yearEndMaxEncashment, setYearEndMaxEncashment] = useState('0');
  const [yearEndExpiryDays, setYearEndExpiryDays] = useState('0');
  // Carry-Forward — BUG_152: default off (consistent with Leave Type form)
  const [carryForwardGlobal, setCarryForwardGlobal] = useState(false);
  const [maxCarryForwardDays, setMaxCarryForwardDays] = useState('5');
  // Encashment
  const [encashmentAllowed, setEncashmentAllowed] = useState(false);
  const [encashmentBasis, setEncashmentBasis] = useState('basic');
  const [encashmentMaxDays, setEncashmentMaxDays] = useState('0');
  const [encashmentAutoYearEnd, setEncashmentAutoYearEnd] = useState(false);
  const [encashmentEmployeeInitiated, setEncashmentEmployeeInitiated] = useState(true);
  // Leave type allocations
  const [allocations, setAllocations] = useState<Array<{ leaveTypeId: string; quota: number; carryForward: boolean; maxCarryForward: number }>>([]);
  // Custom rules (per-policy)
  const [customRules, setCustomRules] = useState<Array<{ title: string; description: string }>>([]);
  // Policy document upload
  const [policyDocName, setPolicyDocName] = useState('');
  const [policyDocUrl, setPolicyDocUrl] = useState('');
  const [policyDocMime, setPolicyDocMime] = useState('');
  const [policyDocSize, setPolicyDocSize] = useState(0);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['basic', 'applicability']));

  useEffect(() => {
    if (mode === 'edit' && editItem) {
      setName(editItem.name);
      setDescription(editItem.description || '');
      setStatus(editItem.status || 'active');
      setPriority(editItem.priority || 0);
      setEmploymentType(editItem.employmentType || 'all');
      setBranchId(editItem.branchId || '');
      setDepartmentId(editItem.departmentId || '');
      setGenderApplicability(editItem.genderApplicability || 'all');
      setAnnualQuota(String(editItem.annualQuota || 0));
      setAccrualFrequency(editItem.accrualFrequency || 'yearly');
      setAccrualAmount(String(editItem.accrualAmount || 0));
      setMaxBalance(String(editItem.maxBalance || 0));
      setOpeningBalance(String(editItem.openingBalance || 0));
      setProrateNewJoiners(editItem.prorateNewJoiners ?? true);
      setMinAdvanceNotice(String(editItem.minAdvanceNotice || 0));
      setMaxFutureDays(String(editItem.maxFutureDays || 0));
      setBackdatedAllowed(editItem.backdatedAllowed ?? false);
      setBackdatedMaxDays(String(editItem.backdatedMaxDays || 0));
      setMinConsecutiveDays(String(editItem.minConsecutiveDays || 0));
      setMaxConsecutiveDays(String(editItem.maxConsecutiveDays || 0));
      setHalfDayEligible(editItem.halfDayEligible ?? true);
      setRequireAttachment(editItem.requireAttachment ?? false);
      setRequireAttachmentAfterDays(String(editItem.requireAttachmentAfterDays || 0));
      setOverlappingLeaveAllowed(editItem.overlappingLeaveAllowed ?? false);
      setSandwichRuleEnabled(editItem.sandwichRuleEnabled ?? true);
      setProbationRestriction(editItem.probationRestriction ?? true);
      setProbationMonths(String(editItem.probationMonths || 6));
      setProRataEnabled(editItem.proRataEnabled ?? false);
      setYearEndProcessingMode(editItem.yearEndProcessingMode || 'carry_forward');
      setYearEndMaxCarryForward(String(editItem.yearEndMaxCarryForward || 0));
      setYearEndMaxEncashment(String(editItem.yearEndMaxEncashment || 0));
      setYearEndExpiryDays(String(editItem.yearEndExpiryDays || 0));
      setCarryForwardGlobal(editItem.carryForwardGlobal ?? true);
      setMaxCarryForwardDays(String(editItem.maxCarryForwardDays || 5));
      setEncashmentAllowed(editItem.encashmentAllowed ?? false);
      setEncashmentBasis(editItem.encashmentBasis || 'basic');
      setEncashmentMaxDays(String(editItem.encashmentMaxDays || 0));
      setEncashmentAutoYearEnd(editItem.encashmentAutoYearEnd ?? false);
      setEncashmentEmployeeInitiated(editItem.encashmentEmployeeInitiated ?? true);
      try {
        const alloc = JSON.parse(editItem.leaveTypeAllocations || '[]');
        setAllocations(Array.isArray(alloc) ? alloc : []);
      } catch { setAllocations([]); }
    }
  }, [mode, editItem]);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Policy name is required'); return; }
    // BUG_148: duplicate name validation (client-side)
    if (mode === 'add') {
      const existing = existingPolicies.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) { toast.error(`A policy named "${name.trim()}" already exists. Please use a different name.`); return; }
    } else if (mode === 'edit' && editItem) {
      const existing = existingPolicies.find(p => p.id !== editItem.id && p.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) { toast.error(`A policy named "${name.trim()}" already exists. Please use a different name.`); return; }
    }
    setSaving(true);
    try {
      // BUG FIX: send companyId from the company switcher so the policy is
      // stored in the SELECTED company, not the first company in the DB.
      // effectiveCompanyId() returns the selected company for admins, or the
      // employee's own company for non-admins.
      const currentCompanyId = effectiveCompanyId();
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status, priority: Number(priority),
        employmentType, branchId: branchId || null, departmentId: departmentId || null,
        genderApplicability,
        annualQuota: Number(annualQuota), accrualFrequency, accrualAmount: Number(accrualAmount),
        maxBalance: Number(maxBalance), openingBalance: Number(openingBalance), prorateNewJoiners,
        minAdvanceNotice: Number(minAdvanceNotice), maxFutureDays: Number(maxFutureDays),
        backdatedAllowed, backdatedMaxDays: Number(backdatedMaxDays),
        minConsecutiveDays: Number(minConsecutiveDays), maxConsecutiveDays: Number(maxConsecutiveDays),
        halfDayEligible, requireAttachment, requireAttachmentAfterDays: Number(requireAttachmentAfterDays),
        overlappingLeaveAllowed, sandwichRuleEnabled,
        probationRestriction, probationMonths: Number(probationMonths), proRataEnabled,
        yearEndProcessingMode, yearEndMaxCarryForward: Number(yearEndMaxCarryForward),
        yearEndMaxEncashment: Number(yearEndMaxEncashment), yearEndExpiryDays: Number(yearEndExpiryDays),
        carryForwardGlobal, maxCarryForwardDays: Number(maxCarryForwardDays),
        encashmentAllowed, encashmentBasis, encashmentMaxDays: Number(encashmentMaxDays),
        encashmentAutoYearEnd, encashmentEmployeeInitiated,
        leaveTypeAllocations: allocations,
        // Custom rules (stored as JSON in the description field alongside the text description)
        customRules: customRules.filter(r => r.title.trim() || r.description.trim()),
        // Policy document (stored as data URL)
        policyDocName: policyDocName || undefined,
        policyDocUrl: policyDocUrl || undefined,
        policyDocMime: policyDocMime || undefined,
        policyDocSize: policyDocSize || undefined,
        // BUG FIX: explicitly send the selected company's id.
        companyId: currentCompanyId || undefined,
      };
      const url = mode === 'edit' ? '/api/leave-policy-rules' : '/api/leave-policy-rules';
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const body = mode === 'edit' ? JSON.stringify({ id: editItem!.id, ...payload }) : JSON.stringify(payload);
      const res = await fetch(url, { method, headers: getAuthHeaders(), body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success(mode === 'edit' ? 'Policy updated' : 'Policy created');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Details', icon: FiClipboard },
    { id: 'applicability', label: 'Policy Applicability', icon: FiClipboard },
    { id: 'quota', label: 'Quota & Accrual', icon: FiClipboard },
    { id: 'restrictions', label: 'Leave Restrictions', icon: FiClipboard },
    { id: 'holidays', label: 'Holidays & Weekoffs', icon: FiClipboard },
    { id: 'yearEnd', label: 'Year-End Processing', icon: FiClipboard },
    { id: 'carryForward', label: 'Carry-Forward', icon: FiClipboard },
    { id: 'encashment', label: 'Encashment', icon: FiClipboard },
    { id: 'allocations', label: 'Leave Type Allocations', icon: FiClipboard },
    { id: 'rules', label: 'Custom Rules', icon: FiClipboard },
    { id: 'document', label: 'Policy Document', icon: FiClipboard },
  ];

  // ─── File upload handler ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('File too large — max 3 MB. Use a smaller PDF or Word document.');
      return;
    }
    setUploadingDoc(true);
    try {
      // Read file as data URL (base64) — works for small files ≤3MB
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPolicyDocUrl(result);
        setPolicyDocName(file.name);
        setPolicyDocMime(file.type);
        setPolicyDocSize(file.size);
        setUploadingDoc(false);
        toast.success(`Document "${file.name}" uploaded (${(file.size / 1024).toFixed(0)} KB)`);
      };
      reader.onerror = () => {
        setUploadingDoc(false);
        toast.error('Failed to read file');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingDoc(false);
      toast.error('Upload failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-gray-900">{mode === 'edit' ? 'Edit Leave Policy' : 'Add Leave Policy'}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Configure restrictions, year-end processing, carry-forward & encashment rules.</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><FiX className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-2">
          {/* Section: Basic */}
          <Section id="basic" title="Basic Details" openSections={openSections} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Policy Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard CL Policy"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority (higher = more specific)</label>
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </Section>

          {/* Section: Applicability */}
          <Section id="applicability" title="Policy Applicability" openSections={openSections} onToggle={toggleSection}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
                <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Gender Applicability</label>
              <select value={genderApplicability} onChange={(e) => setGenderApplicability(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Use "Female only" for Maternity Leave, "Male only" for Paternity Leave.</p>
            </div>
          </Section>

          {/* Section: Quota & Accrual */}
          <Section id="quota" title="Quota & Accrual" openSections={openSections} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual Quota (days)</label>
                <input type="number" min={0} value={annualQuota} onChange={(e) => setAnnualQuota(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Accrual Frequency</label>
                <select value={accrualFrequency} onChange={(e) => setAccrualFrequency(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ACCRUAL_FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Accrual Amount (per period)</label>
                <input type="number" min={0} step="0.5" value={accrualAmount} onChange={(e) => setAccrualAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Balance (0 = unlimited)</label>
                <input type="number" min={0} value={maxBalance} onChange={(e) => setMaxBalance(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Opening Balance (new employees)</label>
                <input type="number" min={0} value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-end">
                <Toggle label="Pro-rate for new joiners" checked={prorateNewJoiners} onChange={setProrateNewJoiners} hint="Reduce quota for mid-year joiners" />
              </div>
            </div>
          </Section>

          {/* Section: Restrictions */}
          <Section id="restrictions" title="Leave Restrictions" openSections={openSections} onToggle={toggleSection}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Advance Notice (days)</label>
                <input type="number" min={0} value={minAdvanceNotice} onChange={(e) => setMinAdvanceNotice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Future Days (0 = unlimited)</label>
                <input type="number" min={0} value={maxFutureDays} onChange={(e) => setMaxFutureDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Consecutive Days</label>
                <input type="number" min={0} value={minConsecutiveDays} onChange={(e) => setMinConsecutiveDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Consecutive Days (0 = unlimited)</label>
                <input type="number" min={0} value={maxConsecutiveDays} onChange={(e) => setMaxConsecutiveDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Backdated Max Days</label>
                <input type="number" min={0} value={backdatedMaxDays} onChange={(e) => setBackdatedMaxDays(e.target.value)}
                  disabled={!backdatedAllowed}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Attachment Required After (days)</label>
                <input type="number" min={0} value={requireAttachmentAfterDays} onChange={(e) => setRequireAttachmentAfterDays(e.target.value)}
                  disabled={!requireAttachment}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Toggle label="Allow Backdated Applications" checked={backdatedAllowed} onChange={setBackdatedAllowed} />
              <Toggle label="Allow Half-Day Leave" checked={halfDayEligible} onChange={setHalfDayEligible} />
              <Toggle label="Require Supporting Document" checked={requireAttachment} onChange={setRequireAttachment} hint="E.g. medical certificate for sick leave > N days" />
              <Toggle label="Allow Overlapping Leave" checked={overlappingLeaveAllowed} onChange={setOverlappingLeaveAllowed} hint="Allow overlap with other leave types" />
            </div>
          </Section>

          {/* Section: Holidays & Weekoffs */}
          <Section id="holidays" title="Holidays & Weekoffs" openSections={openSections} onToggle={toggleSection}>
            {/* BUG_150/151 FIX: clarify which settings win when both Leave Type and Leave Policy have them */}
            <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <strong>Note:</strong> These settings override the Leave Type's settings when a mapping exists. The Leave Type's settings are the default; this policy's settings take precedence for employees in scope.
            </div>
            <Toggle label="Sandwich Rule" checked={sandwichRuleEnabled} onChange={setSandwichRuleEnabled}
              hint="If enabled, holidays/weekends between two leave days are counted as leave." />
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Probation Restricted (months)</label>
                <input type="number" min={0} value={probationMonths} onChange={(e) => setProbationMonths(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Toggle label="Probation Restriction" checked={probationRestriction} onChange={setProbationRestriction} hint="Block leave during probation" />
              <Toggle label="Pro-Rata Enabled" checked={proRataEnabled} onChange={setProRataEnabled} />
            </div>
          </Section>

          {/* Section: Year-End Processing */}
          <Section id="yearEnd" title="Year-End Processing" openSections={openSections} onToggle={toggleSection}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Processing Mode</label>
              <select value={yearEndProcessingMode} onChange={(e) => setYearEndProcessingMode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {YEAR_END_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Carry Forward (days)</label>
                <input type="number" min={0} value={yearEndMaxCarryForward} onChange={(e) => setYearEndMaxCarryForward(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Encashment (days)</label>
                <input type="number" min={0} value={yearEndMaxEncashment} onChange={(e) => setYearEndMaxEncashment(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Days (carried balance)</label>
                <input type="number" min={0} value={yearEndExpiryDays} onChange={(e) => setYearEndExpiryDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded p-2">
              Note: Year-end processing execution runs as a scheduled job. Configuration is saved here; the cron job will be enabled in a follow-up release.
            </p>
          </Section>

          {/* Section: Carry-Forward */}
          <Section id="carryForward" title="Carry-Forward" openSections={openSections} onToggle={toggleSection}>
            <Toggle label="Carry-Forward Enabled (global)" checked={carryForwardGlobal} onChange={setCarryForwardGlobal} />
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Carry-Forward Days</label>
                <input type="number" min={0} value={maxCarryForwardDays} onChange={(e) => setMaxCarryForwardDays(e.target.value)}
                  disabled={!carryForwardGlobal}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded p-2">
              Conditional carry-forward rules (balance-threshold-based) can be configured per policy after saving. Use the Carry-Forward Rules API to add them.
            </p>
          </Section>

          {/* Section: Encashment */}
          <Section id="encashment" title="Encashment" openSections={openSections} onToggle={toggleSection}>
            <Toggle label="Encashment Allowed" checked={encashmentAllowed} onChange={setEncashmentAllowed} />
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Encashment Basis</label>
                <select value={encashmentBasis} onChange={(e) => setEncashmentBasis(e.target.value)}
                  disabled={!encashmentAllowed}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                  {ENCASHMENT_BASIS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Encashment Days (0 = use leave-type default)</label>
                <input type="number" min={0} value={encashmentMaxDays} onChange={(e) => setEncashmentMaxDays(e.target.value)}
                  disabled={!encashmentAllowed}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Toggle label="Auto-Encash at Year-End" checked={encashmentAutoYearEnd} onChange={setEncashmentAutoYearEnd} />
              <Toggle label="Employee-Initiated Encashment" checked={encashmentEmployeeInitiated} onChange={setEncashmentEmployeeInitiated} hint="Allow employees to request encashment" />
            </div>
          </Section>

          {/* Section: Allocations */}
          <Section id="allocations" title="Leave Type Allocations (per-type quota override)" openSections={openSections} onToggle={toggleSection}>
            <p className="text-xs text-gray-500 mb-2">Override the annual quota for specific leave types under this policy. If empty, the leave type's own default quota applies.</p>
            {allocations.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No per-type allocations. The policy's annual quota applies to all mapped leave types.</div>
            ) : (
              <div className="space-y-2">
                {allocations.map((a, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <select value={a.leaveTypeId} onChange={(e) => {
                      const next = [...allocations]; next[i].leaveTypeId = e.target.value; setAllocations(next);
                    }} className="col-span-5 px-2 py-1.5 text-xs border border-gray-300 rounded">
                      <option value="">— Select —</option>
                      {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
                    </select>
                    <input type="number" placeholder="Quota" value={a.quota} onChange={(e) => {
                      const next = [...allocations]; next[i].quota = Number(e.target.value); setAllocations(next);
                    }} className="col-span-2 px-2 py-1.5 text-xs border border-gray-300 rounded" />
                    <label className="col-span-3 flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={a.carryForward} onChange={(e) => {
                        const next = [...allocations]; next[i].carryForward = e.target.checked; setAllocations(next);
                      }} /> Carry Fwd
                    </label>
                    <input type="number" placeholder="Max CF" value={a.maxCarryForward} onChange={(e) => {
                      const next = [...allocations]; next[i].maxCarryForward = Number(e.target.value); setAllocations(next);
                    }} className="col-span-1 px-2 py-1.5 text-xs border border-gray-300 rounded" />
                    <button onClick={() => setAllocations(allocations.filter((_, idx) => idx !== i))}
                      className="col-span-1 p-1 text-red-500 hover:bg-red-50 rounded"><FiTrash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setAllocations([...allocations, { leaveTypeId: '', quota: 0, carryForward: false, maxCarryForward: 0 }])}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <FiPlus className="w-3 h-3" /> Add Allocation
            </button>
          </Section>

          {/* Section: Custom Rules */}
          <Section id="rules" title="Custom Rules (per-policy)" openSections={openSections} onToggle={toggleSection}>
            <p className="text-xs text-gray-500 mb-2">Add specific rules that apply to this policy. Each rule has a title and description. These are stored with the policy for reference.</p>
            {customRules.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No custom rules added. Click "Add Rule" to define policy-specific rules.</div>
            ) : (
              <div className="space-y-2">
                {customRules.map((rule, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rule.title}
                        onChange={(e) => { const next = [...customRules]; next[i].title = e.target.value; setCustomRules(next); }}
                        placeholder="Rule title (e.g. 'No leave during peak season')"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={() => setCustomRules(customRules.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"><FiTrash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <textarea
                      value={rule.description}
                      onChange={(e) => { const next = [...customRules]; next[i].description = e.target.value; setCustomRules(next); }}
                      placeholder="Rule description — explain what this rule does and when it applies..."
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setCustomRules([...customRules, { title: '', description: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <FiPlus className="w-3 h-3" /> Add Rule
            </button>
          </Section>

          {/* Section: Policy Document */}
          <Section id="document" title="Policy Document Upload" openSections={openSections} onToggle={toggleSection}>
            <p className="text-xs text-gray-500 mb-2">Upload the official policy document (PDF, DOCX — max 3 MB). The document is stored with the policy and can be downloaded by employees.</p>
            {policyDocUrl ? (
              <div className="border border-green-200 bg-green-50 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FiFileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">{policyDocName}</p>
                    <p className="text-xs text-green-600">{(policyDocSize / 1024).toFixed(0)} KB · {policyDocMime || 'file'}</p>
                  </div>
                </div>
                <button onClick={() => { setPolicyDocUrl(''); setPolicyDocName(''); setPolicyDocMime(''); setPolicyDocSize(0); }}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded flex-shrink-0" title="Remove document">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                <FiFileText className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">{uploadingDoc ? 'Uploading...' : 'Click to upload policy document'}</span>
                <span className="text-xs text-gray-400 mt-1">PDF or DOCX, max 3 MB</span>
                <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" disabled={uploadingDoc} />
              </label>
            )}
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white z-[80] pr-20">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2">
            {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
            {mode === 'edit' ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, openSections, onToggle, children }: {
  id: string;
  title: string;
  openSections: Set<string>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const open = openSections.has(id);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => onToggle(id)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-sm font-medium text-gray-800">{title}</span>
        {open ? <FiChevronDown className="w-4 h-4 text-gray-400" /> : <FiChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
      <button type="button" onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
