'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiAlertCircle, FiEdit2, FiTrash2,
  FiArrowLeft, FiRotateCcw, FiClock, FiSearch, FiBriefcase, FiCalendar,
  FiFileText, FiUsers, FiUser, FiDollarSign, FiLayers, FiExternalLink, FiCheckCircle, FiVolume2, FiMapPin,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { BackButton } from '@/components/hrms/BackButton';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Requisition {
  id: string; requisitionId: string; positionType: string; numberOfOpenings: number; employmentType: string; priority: string; approvalStatus: string; status: string; skillsRequired: string | null; experienceRequired: string | null; qualification: string | null; salaryBudget: string | null; expectedJoiningDate: string | null; interviewPlan?: string | null; companyId?: string; hiringManagerId?: string; positionTitle?: string; branchId?: string | null; branch?: { id: string; name: string } | null; grade?: string | null; shiftTimings?: string | null;
  department?: { id?: string; name: string } | null; designation?: { id?: string; title: string } | null;
}

interface ApprovalHistoryEntry {
  id: string; action: string; module: string; details: string; createdAt: string;
  user?: { name?: string; email?: string } | null;
}

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

const initialForm = {
  departmentId: '', designationId: '', positionTitle: '', positionType: 'new', numberOfOpenings: 1, branchId: '', grade: '', shiftTimings: '', employmentType: 'full-time', skillsRequired: '', experienceRequired: '', qualification: '', salaryBudget: '', priority: 'medium', expectedJoiningDate: '', reason: '', interviewPlan: JSON.stringify([{ sequence: 1, name: 'Technical Round 1', type: 'technical' }, { sequence: 2, name: 'HR Round', type: 'hr' }], null, 2),
};

type InterviewPlanRow = { name: string; type: 'technical' | 'hr' | 'ai' | 'client' };
function parseInterviewPlan(value: string): InterviewPlanRow[] {
  try {
    const rows = JSON.parse(value || '[]');
    return Array.isArray(rows) ? rows.map((r: any) => ({ name: String(r.name || ''), type: r.type === 'offline_panel' ? 'client' : ['technical', 'hr', 'ai', 'client'].includes(r.type) ? r.type : 'technical' })) : [];
  } catch { return []; }
}
function serializeInterviewPlan(rows: InterviewPlanRow[]) { return JSON.stringify(rows.map((row, i) => ({ sequence: i + 1, ...row }))); }

// Mock-screen status labels: the pill vocabulary matches the design —
// Draft (slate), Pending Approval (amber), In Finance Review (blue),
// Approved (green), Needs My Action (green, for returned items), Rejected (red).
function getApprovalLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending Approval',
    hr_approved: 'In Finance Review',
    budget_approved: 'Approved',
    rejected: 'Rejected',
    returned: 'Needs My Action',
  };
  return map[status] || status;
}

// Short status label for the narrow list column — full label shown via tooltip.
function getApprovalShortLabel(status: string): string {
  if (/^tier_\d+_approved$/.test(status)) {
    const n = status.match(/^tier_(\d+)_approved$/)?.[1];
    return `Tier ${n} OK`;
  }
  const map: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending',
    manager_approved: 'Manager OK',
    hr_approved: 'In Review',
    budget_approved: 'Approved',
    rejected: 'Rejected',
    returned: 'Returned',
  };
  return map[status] || getApprovalLabel(status);
}

function getApprovalBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600',
    pending: 'inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700',
    hr_approved: 'inline-flex items-center whitespace-nowrap rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700',
    budget_approved: 'inline-flex items-center whitespace-nowrap rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700',
    rejected: 'inline-flex items-center whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700',
    returned: 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700',
  };
  return map[status] || 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'inline-flex items-center whitespace-nowrap rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700',
    medium: 'inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700',
    high: 'inline-flex items-center whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700',
    critical: 'inline-flex items-center whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700',
  };
  return map[priority] || 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600';
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600',
    open: 'inline-flex items-center rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700',
    approved: 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700',
    cancelled: 'inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700',
    closed: 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600',
  };
  return map[status] || 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600';
}

// Detail mini-stat tile per the mock: white card, hairline border, small
// colored icon on top, gray label, bold value. Values wrap instead of
// truncate — no wording may ever be cropped/hidden (user requirement).
function StatTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="flex h-5 items-center">{icon}</span>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function DetailField({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-xs text-slate-500">{label}</p><p className={`mt-0.5 break-words text-sm font-semibold text-slate-800 ${capitalize ? 'capitalize' : ''}`}>{value}</p></div>;
}

// Vertical approval timeline: pick the most relevant history entry for a
// step (by keyword match) and fall back to stage-aware copy that mirrors
// the mock's wording.
function findHistory(history: ApprovalHistoryEntry[], keywords: string[]): ApprovalHistoryEntry | undefined {
  return history.find((h) => keywords.some((k) => `${h.action} ${h.module} ${h.details}`.toLowerCase().includes(k)));
}
function stepDescription(index: number, stageIndex: number, history: ApprovalHistoryEntry[]): string {
  const keywordSets = [
    ['submit', 'create', 'requested', 'submitted'],
    ['hr', 'hr_approve', 'hr_reject'],
    ['finance', 'budget'],
    ['posting', 'job'],
  ];
  const entry = findHistory(history, keywordSets[index] || []);
  if (entry) {
    const when = new Date(entry.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    return `${entry.details} · ${when}`;
  }
  if (index === 0) return 'Requisition submitted by hiring manager';
  if (index === 1) return stageIndex >= 1 ? 'Approved by HR Team' : 'Waiting for HR review';
  if (index === 2) return stageIndex >= 2 ? 'Approved by Finance' : stageIndex === 2 ? 'Pending approval from Finance' : 'Waiting for Finance approval';
  return stageIndex >= 3 ? 'Job posting published' : 'Will start after all approvals are completed';
}


// --- Merged from mock form screen: input/badge helpers + salary range split ---
function parseSalaryRange(value: string | null | undefined): [string, string] {
  const raw = String(value || '').trim();
  if (!raw) return ['', ''];
  const idx = raw.indexOf('-');
  if (idx === -1) return [raw, ''];
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
}
function composeSalaryRange(min: string, max: string): string {
  const a = min.trim(), b = max.trim();
  if (a && b) return `${a}-${b}`;
  return a || b;
}
const INPUT_CLS = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const LABEL_CLS = 'text-sm font-medium text-slate-600';
const BADGE = 'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold';
// Employee-module action button style — used by every detail-panel action so
// wording is never cropped and buttons never overlap (they wrap on narrow screens).
const ACTION_BTN_CLS = 'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold shadow-sm transition';
export default function RequisitionsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  // C-30: company context store — single source of truth for which
  // company the user is operating in (their own company for non-admins,
  // or the company they picked in the company switcher for admins).
  const { scopeQuery, effectiveCompanyId } = useCompanyContextStore();
  const companyId = effectiveCompanyId() || user?.company?.id || '';
  const userRole = user?.role || '';
  const isHr = HR_ROLES.includes(userRole);
  const isFinance = FINANCE_ROLES.includes(userRole);

  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [form, setForm] = useState(initialForm);
  // Company-module master data for the new form fields:
  //   Location → Company → Branches,  Shift Timings → Company → Shifts,
  //   Grade → Designation levels (company module). Budget auto-fills from the
  //   designation's salary band. All fetched in fetchDeptDesignations below.
  const [branches, setBranches] = useState<Array<{ id: string; name: string; city?: string | null }>>([]);
  const [shifts, setShifts] = useState<Array<{ id: string; name: string; startTime?: string | null; endTime?: string | null }>>([]);
  const [skillChips, setSkillChips] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'requisitions' | 'approvals'>('requisitions');
  // Switching tabs must reset the list filter — a stale "Approved" filter
  // from the Requisitions tab previously made My Approvals look broken
  // (the intersection filtered out every pending row).
  const switchTab = (tab: 'requisitions' | 'approvals') => {
    setActiveTab(tab);
    setListFilter('all');
    // With the "Back to list" button removed (user request), clicking a tab is
    // the way back — always exit any open requisition detail.
    setViewingId(null);
  };
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [listFilter, setListFilter] = useState<'all' | 'action' | 'pending' | 'draft' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setEditingId(null);
      setForm(initialForm);
      setShowForm(true);
    }
  }, []);

  // Sidebar deep-links: /requisitions?view=form opens the requisition form,
  // /requisitions?view=list shows the list (Requisition Form / Requisition
  // List sub-tabs under the Requisitions sidebar item). Reactive on the
  // search params so switching sub-tabs without a remount still works.
  const urlViewParams = useSearchParams();
  const urlView = urlViewParams?.get('view');
  useEffect(() => {
    if (urlView === 'form') setShowForm(true);
    if (urlView === 'list') setShowForm(false);
  }, [urlView]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; companyName?: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string; departmentId: string | null; level?: number | null; minSalary?: number | null; maxSalary?: number | null }>>([]);
  // NEW-8: the logged-in user's managed department (if they are a department
  // head). When set, the requisition form locks the department to it — the
  // API enforces the same rule server-side.
  const [managerDepartment, setManagerDepartment] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const r = await fetch('/api/departments?limit=200&noDedupe=1', { headers: getAuthHeaders() });
        const json = await r.json().catch(() => null);
        const rows: any[] = json?.data || [];
        const mine = rows.find((d) => d?.head?.userId === user.id);
        if (!cancelled && mine) setManagerDepartment({ id: mine.id, name: mine.name });
      } catch { /* non-fatal — falls back to unrestricted view */ }
    })();
    return () => { cancelled = true };
  }, [user?.id]);

  // NEW-8: lock the form department to the manager's department whenever it
  // is known AND the create-form is open. This must also re-run when the form
  // opens: handleAddNew() resets departmentId to '' and this effect (keyed
  // only on managerDepartment, which never changes again) never re-fired, so
  // the locked select *displayed* the department while the submitted form
  // state was still empty — "Department is required" on save and an empty,
  // disabled position dropdown. Editing keeps the draft's own department, so
  // it is skipped; the equality guard prevents redundant state updates.
  useEffect(() => {
    if (managerDepartment && showForm && !editingId && form.departmentId !== managerDepartment.id) {
      setForm(prev => ({ ...prev, departmentId: managerDepartment.id }));
    }
  }, [managerDepartment, showForm, editingId, form.departmentId]);

  const fetchDeptDesignations = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const scopeParam = sq ? `&${sq}` : '';
      // Departments must match the Employee module dropdown EXACTLY: same
      // company scope (scopeQuery → ?companyId=…) and the same server-side
      // name-dedupe. Never request ?noDedupe=1 here — without a scope it
      // exposed every company's own copy of "Finance"/"Accounts" in this
      // dropdown, which is how requisition showed departments that don't
      // belong to the company the employee module works with.
      // Master-data dropdowns use high limits so large tenants never have
      // their lists silently truncated by the default page size.
      // Designations keep noDedupe: this page scopes them by department
      // client-side, and server-side title-dedup would otherwise hide
      // another department's same-titled designation (two departments can
      // legitimately both have "Manager").
      const [deptRes, desigRes, branchRes, shiftRes] = await Promise.all([
        fetch(`/api/departments?limit=500${scopeParam}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/designations?limit=1000${scopeParam}&noDedupe=1`, { headers: getAuthHeaders() }).catch(() => null),
        // Company-module master data: branches (locations) + shifts (timings)
        fetch(`/api/branches?limit=500${scopeParam}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/shifts?limit=500${scopeParam}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      let anyFailed = false;
      if (deptRes?.ok) {
        try {
          const deptData = await deptRes.json();
          const deptList = deptData.departments || deptData.data || (Array.isArray(deptData) ? deptData : []);
          const seenDept = new Set<string>();
          const dedupedDepts: Array<{ id: string; name: string; companyName?: string }> = [];
          for (const d of deptList) {
            if (!d?.id || !d?.name) continue;
            const companyName = d.company?.name;
            const key = `${String(d.name).toLowerCase().trim()}|${(companyName || '').toLowerCase().trim()}`;
            if (seenDept.has(key)) continue;
            seenDept.add(key);
            dedupedDepts.push({ id: d.id, name: d.name, companyName });
          }
          dedupedDepts.sort((a, b) => {
            const n = a.name.localeCompare(b.name);
            if (n !== 0) return n;
            return (a.companyName || '').localeCompare(b.companyName || '');
          });
          setDepartments(dedupedDepts);
        } catch { anyFailed = true; }
      } else {
        anyFailed = true;
      }
      if (desigRes?.ok) {
        try {
          const desigData = await desigRes.json();
          const desigList = desigData.designations || desigData.data || (Array.isArray(desigData) ? desigData : []);
          const seenDesig = new Set<string>();
          const dedupedDesigs: Array<{ id: string; title: string; departmentId: string | null; level?: number | null; minSalary?: number | null; maxSalary?: number | null }> = [];
          for (const d of desigList) {
            if (!d?.id || !d?.title) continue;
            // Dedupe by ID, never by title — same-titled designations in
            // different departments are all valid choices.
            if (seenDesig.has(d.id)) continue;
            seenDesig.add(d.id);
            const deptId = d.departmentId || d.department?.id || null;
            dedupedDesigs.push({ id: d.id, title: d.title, departmentId: deptId, level: d.level ?? null, minSalary: d.minSalary ?? null, maxSalary: d.maxSalary ?? null });
          }
          dedupedDesigs.sort((a, b) => a.title.localeCompare(b.title));
          setDesignations(dedupedDesigs);
        } catch { anyFailed = true; }
      } else {
        anyFailed = true;
      }
      if (branchRes?.ok) {
        try {
          const branchData = await branchRes.json();
          const branchList = branchData.data || branchData.branches || (Array.isArray(branchData) ? branchData : []);
          if (branchList.length) setBranches(branchList.filter((b: any) => b?.id && b?.name).map((b: any) => ({ id: b.id, name: String(b.name), city: b.city ?? null })));
        } catch { /* non-fatal — Location select stays empty */ }
      }
      if (shiftRes?.ok) {
        try {
          const shiftData = await shiftRes.json();
          const shiftList = shiftData.data || shiftData.shifts || (Array.isArray(shiftData) ? shiftData : []);
          if (shiftList.length) setShifts(shiftList.filter((s: any) => s?.id && s?.name).map((s: any) => ({ id: s.id, name: String(s.name), startTime: s.startTime ?? '', endTime: s.endTime ?? '' })));
        } catch { /* non-fatal — Shift select stays empty */ }
      }
      if (anyFailed) {
        console.error('Requisition master-data fetch failed', {
          departments: deptRes ? `HTTP ${deptRes.status}` : 'network error',
          designations: desigRes ? `HTTP ${desigRes.status}` : 'network error',
        });
        toast.error('Could not load departments/positions. Please refresh the page and try again.');
      }
    } catch {
      toast.error('Could not load departments/positions. Please refresh the page and try again.');
    }
  }, [scopeQuery, companyId]);

  useEffect(() => { queueMicrotask(() => fetchDeptDesignations()); }, [fetchDeptDesignations]);

  // When the company context switches, drop any department/designation
  // chosen under the previous company — otherwise the form can submit a
  // stale cross-company selection. managerDepartment is read from closure
  // on purpose: it loads once at mount and must not re-trigger this reset.
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      designationId: '',
      departmentId: managerDepartment ? managerDepartment.id : '',
    }));
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleDesignations = useMemo(() => {
    if (!form.departmentId) return [];
    return designations.filter(d => d.departmentId === form.departmentId);
  }, [designations, form.departmentId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/requisitions?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setRequisitions(Array.isArray(data) ? data : data.requisitions || []); }
    } catch { toast.error('Failed to load requisitions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const resetFormExtras = () => { setSkillChips([]); setSkillInput(''); setSalaryMin(''); setSalaryMax(''); };

  const handleEdit = (item: Requisition) => {
    setForm({
      departmentId: item.department?.id || item.department?.name || '',
      designationId: item.designation?.id || item.designation?.title || '',
      positionTitle: item.positionTitle || item.designation?.title || '',
      positionType: item.positionType || 'new',
      numberOfOpenings: item.numberOfOpenings || 1,
      employmentType: item.employmentType || 'full-time',
      skillsRequired: item.skillsRequired || '',
      experienceRequired: item.experienceRequired || '',
      qualification: item.qualification || '',
      salaryBudget: item.salaryBudget || '',
      branchId: item.branchId || '',
      grade: item.grade || '',
      shiftTimings: item.shiftTimings || '',
      priority: item.priority || 'medium',
      expectedJoiningDate: item.expectedJoiningDate ? new Date(item.expectedJoiningDate).toISOString().split('T')[0] : '',
      reason: '',
      interviewPlan: item.interviewPlan || initialForm.interviewPlan,
    });
    setSkillChips((item.skillsRequired || '').split(',').map(s => s.trim()).filter(Boolean));
    setSkillInput('');
    setEditingId(item.id);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    resetFormExtras();
  };

  const addSkillChips = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = Array.from(new Set([...skillChips, ...parts]));
    setSkillChips(next);
    setForm(f => ({ ...f, skillsRequired: next.join(', ') }));
    setSkillInput('');
  };
  const removeSkillChip = (chip: string) => {
    const next = skillChips.filter(c => c !== chip);
    setSkillChips(next);
    setForm(f => ({ ...f, skillsRequired: next.join(', ') }));
  };
  const focusRoundName = (i: number) => {
    const el = document.getElementById(`round-name-${i}`) as HTMLInputElement | null;
    if (el) { el.focus(); el.select(); }
  };

  const handleSave = async (action: 'draft' | 'submit') => {
    if (!form.departmentId) { toast.error('Department is required'); return; }
    if (!form.designationId) { toast.error('Position/Designation is required'); return; }
    if (skillChips.length === 0) { toast.error('Add at least one required skill'); return; }
    const interviewRounds = parseInterviewPlan(form.interviewPlan);
    if (interviewRounds.length === 0 || interviewRounds.some(round => !round.name.trim())) { toast.error('Add at least one interview round and enter a name for every round'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/requisitions/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, skillsRequired: skillChips.join(', '), action: action === 'submit' ? 'submit' : undefined }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success(action === 'draft' ? 'Draft saved' : 'Requisition submitted for HR approval');
      } else {
        const res = await fetch('/api/requisitions', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, skillsRequired: skillChips.join(', '), companyId, action }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success(action === 'draft' ? 'Draft saved' : 'Requisition submitted for HR approval');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/requisitions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Requisition deleted');
      setDeleteConfirmId(null);
      if (viewingId === id) setViewingId(null);
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  const handleApproval = async (id: string, action: string) => {
    let comments = '';
    if (action === 'hr_reject' || action === 'finance_reject') {
      comments = window.prompt('Rejection reason (required):') || '';
      if (!comments.trim()) { toast.error('Rejection reason is required'); return; }
    } else if (action === 'return') {
      comments = window.prompt('Reason for returning (required):') || '';
      if (!comments.trim()) { toast.error('Reason is required'); return; }
    } else if (action === 'hr_approve' || action === 'finance_approve') {
      comments = '';
    }
    try {
      const res = await fetch(`/api/requisitions/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, comments: comments || undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Requisition ${action.replace('_', ' ')}`);
      fetchData();
      if (viewingId === id) fetchHistory(id);
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Action failed'); }
  };

  const fetchHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/requisitions/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setApprovalHistory(data.approvalHistory || []);
      }
    } catch { /* non-fatal */ }
  };

  const handleView = (id: string) => {
    setViewingId(id);
    setShowFullDetails(false);
    fetchHistory(id);
  };

  const handleCreateJobPosting = async (r: Requisition) => {
    if (!isHr) { toast.error('Only HR can create job postings'); return; }
    if (r.approvalStatus !== 'budget_approved') { toast.error('Requisition must be fully approved'); return; }
    // Route to the NEW simplified create-job wizard in Recruitment. The wizard
    // reads ?fromRequisition=<id>, loads the requisition and auto-fills the
    // form (title, department, openings, type, experience, salary, skills).
    // (Previously this jumped to the retired /job-portal create screen.)
    router.push(`/recruitment?fromRequisition=${encodeURIComponent(r.id)}`);
    toast.success('Opening the job form — details auto-filled from the requisition');
  };

  // Legacy compact action buttons (kept for the hidden table/mobile views below)
  const getApprovalButtons = (r: Requisition) => {
    const buttons: React.ReactNode[] = [];
    const isRequester = r.hiringManagerId === user?.id;

    if (isRequester && r.approvalStatus === 'returned') {
      buttons.push(
        <button key="resubmit" onClick={() => handleApproval(r.id, 'submit')} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex items-center gap-1">
          <FiRotateCcw className="w-3 h-3" />Resubmit
        </button>
      );
    }

    if (isHr && r.approvalStatus === 'pending') {
      buttons.push(
        <button key="hr_approve" onClick={() => handleApproval(r.id, 'hr_approve')} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1">
          <FiCheck className="w-3 h-3" />Approve
        </button>,
        <button key="hr_reject" onClick={() => handleApproval(r.id, 'hr_reject')} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 flex items-center gap-1">
          <FiXCircle className="w-3 h-3" />Reject
        </button>,
        <button key="return" onClick={() => handleApproval(r.id, 'return')} className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100 flex items-center gap-1">
          <FiArrowLeft className="w-3 h-3" />Return
        </button>
      );
    }

    if (isFinance && r.approvalStatus === 'hr_approved') {
      buttons.push(
        <button key="fin_approve" onClick={() => handleApproval(r.id, 'finance_approve')} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1">
          <FiCheck className="w-3 h-3" />Approve
        </button>,
        <button key="fin_reject" onClick={() => handleApproval(r.id, 'finance_reject')} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 flex items-center gap-1">
          <FiXCircle className="w-3 h-3" />Reject
        </button>
      );
    }

    if (isHr && r.approvalStatus === 'budget_approved') {
      buttons.push(
        <button key="create_job" onClick={() => handleCreateJobPosting(r)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700">
          <FiPlus className="h-4 w-4" />Create Job Posting
        </button>
      );
    }

    return buttons.length > 0 ? <div className="flex items-center gap-1">{buttons}</div> : <span className="text-xs text-thb-text-muted">—</span>;
  };

  const needsAction = useCallback((r: Requisition) => {
    // Tier-aware first: the list API annotates `nextTier.eligible` for ANY
    // approval chain (department_head / specific_user / tier 3+ / custom),
    // so this works even when the legacy role checks below would miss it.
    if ((r as any).nextTier?.eligible) return true;
    if (isHr && r.approvalStatus === 'pending') return true;
    if (isFinance && r.approvalStatus === 'hr_approved') return true;
    return r.hiringManagerId === user?.id && ['draft', 'returned'].includes(r.approvalStatus);
  }, [isFinance, isHr, user?.id]);

  // Grade options come from the company module: the designation levels
  // configured for the selected department (Company → Departments → Designations).
  const gradeOptions = useMemo(() => {
    const levels = Array.from(new Set(visibleDesignations.map((d) => d.level).filter((l): l is number => l != null))).sort((a, b) => a - b);
    return levels.map((l) => `Grade ${l}`);
  }, [visibleDesignations]);

  const filteredRequisitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requisitions.filter((r) => {
      const matchesSearch = !query || [r.requisitionId, r.designation?.title, r.positionTitle, r.department?.name]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const matchesTab = activeTab === 'requisitions' || needsAction(r);
      const matchesFilter = listFilter === 'all'
        || (listFilter === 'action' && needsAction(r))
        || (listFilter === 'pending' && ['pending', 'hr_approved'].includes(r.approvalStatus))
        || (listFilter === 'draft' && ['draft', 'returned'].includes(r.approvalStatus))
        || (listFilter === 'approved' && r.approvalStatus === 'budget_approved')
        || (listFilter === 'rejected' && r.approvalStatus === 'rejected');
      return matchesSearch && matchesTab && matchesFilter;
    });
  }, [activeTab, listFilter, needsAction, requisitions, search]);

  // No auto-selection: clicking a requisition opens it full-screen; the list
  // stays clean until the user picks one.
  const selectedRequisition = requisitions.find((r) => r.id === viewingId) || null;
  const inApprovalCount = requisitions.filter((r) => ['pending', 'hr_approved'].includes(r.approvalStatus)).length;
  const approvedCount = requisitions.filter((r) => r.approvalStatus === 'budget_approved').length;
  const needsActionCount = requisitions.filter(needsAction).length;
  const draftCount = requisitions.filter((r) => ['draft', 'returned'].includes(r.approvalStatus)).length;
  const rejectedCount = requisitions.filter((r) => r.approvalStatus === 'rejected').length;

  // Mock-styled primary/negative actions for the detail panel.
  // Every button here is wired to a real API action — Approve / Reject /
  // Return are always visible when it is the user's turn to act.
  const detailActions = (r: Requisition) => {
    const actions: React.ReactNode[] = [];
    const isRequester = r.hiringManagerId === user?.id;

    if (isRequester && r.approvalStatus === 'returned') {
      actions.push(
        <button key="resubmit" onClick={() => handleApproval(r.id, 'submit')} className={`${ACTION_BTN_CLS} border border-blue-300 bg-white text-blue-700 hover:bg-blue-50`}>
          <FiRotateCcw className="h-4 w-4" />Resubmit
        </button>
      );
    }
    // Legacy role blocks run ONLY when the API did not annotate a next tier —
    // otherwise the default HR/Finance chains would show both the legacy and
    // tier-aware buttons (duplicated Approve/Reject rows).
    const annotatedTier: { approverType: string; label: string; eligible: boolean } | null = (r as any).nextTier || null;
    if (!annotatedTier) {
      if (isHr && r.approvalStatus === 'pending') {
      actions.push(
        <button key="hr_approve" onClick={() => handleApproval(r.id, 'hr_approve')} className={`${ACTION_BTN_CLS} bg-green-600 text-white hover:bg-green-700`}>
          <FiCheck className="h-4 w-4" />Approve
        </button>,
        <button key="hr_reject" onClick={() => handleApproval(r.id, 'hr_reject')} className={`${ACTION_BTN_CLS} border border-red-300 bg-white text-red-600 hover:bg-red-50`}>
          <FiXCircle className="h-4 w-4" />Reject
        </button>,
        <button key="return" onClick={() => handleApproval(r.id, 'return')} className={`${ACTION_BTN_CLS} border border-amber-300 bg-white text-amber-700 hover:bg-amber-50`}>
          <FiRotateCcw className="h-4 w-4" />Return for Changes
        </button>
      );
      }
      if (isFinance && r.approvalStatus === 'hr_approved') {
        actions.push(
          <button key="fin_approve" onClick={() => handleApproval(r.id, 'finance_approve')} className={`${ACTION_BTN_CLS} bg-green-600 text-white hover:bg-green-700`}>
            <FiCheck className="h-4 w-4" />Approve
          </button>,
          <button key="fin_reject" onClick={() => handleApproval(r.id, 'finance_reject')} className={`${ACTION_BTN_CLS} border border-red-300 bg-white text-red-600 hover:bg-red-50`}>
            <FiXCircle className="h-4 w-4" />Reject
          </button>,
          <button key="fin_return" onClick={() => handleApproval(r.id, 'return')} className={`${ACTION_BTN_CLS} border border-amber-300 bg-white text-amber-700 hover:bg-amber-50`}>
            <FiRotateCcw className="h-4 w-4" />Return for Changes
          </button>
        );
      }
    }
    if (isHr && r.approvalStatus === 'budget_approved') {
      actions.push(
        <button key="create_job" onClick={() => handleCreateJobPosting(r)} className={`${ACTION_BTN_CLS} bg-green-600 text-white hover:bg-green-700`}>
          <FiPlus className="h-4 w-4" />Create Job Posting
        </button>
      );
    }
    // NEW-8/NEW-9: tier-aware actions for ANY chain state (department_head,
    // specific_user, tier_3+, custom chains). The API annotates each row with
    // `nextTier` = the next pending tier + whether the current user is
    // eligible. Approve advances whatever tier is next; Reject and Return
    // are wired to the generic 'reject' / 'return' actions.
    const nextTier = annotatedTier;
    if (nextTier?.eligible) {
      actions.push(
        <button key="tier_approve" onClick={() => handleApproval(r.id, 'approve')} className={`${ACTION_BTN_CLS} bg-green-600 text-white hover:bg-green-700`}>
          <FiCheck className="h-4 w-4" />Approve{nextTier?.label ? ` by ${String(nextTier.label).replace(/\s*Approval\s*$/i, '').trim()}` : ''}
        </button>,
        <button key="tier_reject" onClick={() => handleApproval(r.id, 'reject')} className={`${ACTION_BTN_CLS} border border-red-300 bg-white text-red-600 hover:bg-red-50`}>
          <FiXCircle className="h-4 w-4" />Reject
        </button>,
        <button key="tier_return" onClick={() => handleApproval(r.id, 'return')} className={`${ACTION_BTN_CLS} border border-amber-300 bg-white text-amber-700 hover:bg-amber-50`}>
          <FiRotateCcw className="h-4 w-4" />Return for Changes
        </button>
      );
    }
    return actions;
  };

  if (showForm) {
    const roundRows = parseInterviewPlan(form.interviewPlan);
    return (
      <div className="space-y-5">
        {/* Back button + breadcrumb — required on every screen */}
        <div className="flex items-center gap-3">
          <BackButton onClick={handleCancelForm} fallbackHref="/requisitions?view=list" label="Back to List" />
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
            <Link href="/recruitment" className="transition hover:text-green-600">Recruitment</Link>
            <span className="text-slate-400">/</span>
            <span className="font-medium text-slate-700">{editingId ? 'Edit Requisition' : 'Raise Requisition'}</span>
          </nav>
        </div>

        {/* Title row */}
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Edit Requisition' : 'Raise New Requisition'}</h2>
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-green-100 px-2.5 text-xs font-bold text-green-700"><FiFileText className="h-3.5 w-3.5" />{editingId ? 'Editing' : 'Draft'}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Create a hiring request with role details, requirements, budget and interview rounds.</p>
        </div>

        {/* Required-field note + compact approval path */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm text-slate-500">Required fields are marked with <span className="font-bold text-red-500">*</span></span>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-600">Approval Path:</span>
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-green-50 px-2.5 font-semibold text-green-700 ring-1 ring-inset ring-green-100"><FiUser className="h-3.5 w-3.5" />HR</span>
            <span className="text-slate-400">→</span>
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-green-50 px-2.5 font-semibold text-green-700 ring-1 ring-inset ring-green-100"><FiDollarSign className="h-3.5 w-3.5" />Finance</span>
            <span className="text-slate-400">→</span>
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-green-50 px-2.5 font-semibold text-green-700 ring-1 ring-inset ring-green-100"><FiVolume2 className="h-3.5 w-3.5" />Job Posting</span>
          </div>
        </div>

        {/* Two-column cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Role & Position */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiBriefcase className="h-4 w-4" /></span>
              <h3 className="text-base font-bold text-slate-900">Role &amp; Position</h3>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <label className={`${LABEL_CLS} mb-1 block`}>Department <span className="text-red-500">*</span></label>
              {managerDepartment ? (
                // NEW-8: Department Manager — locked to their own department.
                // The API also forces this server-side, so it cannot be bypassed.
                <div>
                  <select required disabled value={managerDepartment.id} className={`${INPUT_CLS} bg-slate-100 text-slate-600`} title="Locked to your department">
                    <option value={managerDepartment.id}>{managerDepartment.name} (your department)</option>
                  </select>
                  <p className="mt-0.5 text-[10px] text-slate-500">You can raise requisitions only for your own department. Hiring Manager is set to you automatically.</p>
                </div>
              ) : departments.length > 0 ? (
                <select required value={form.departmentId} onChange={(e) => {
                  const newDeptId = e.target.value;
                  const stillValid = visibleDesignations.some(d => d.id === form.designationId);
                  setForm({ ...form, departmentId: newDeptId, designationId: stillValid ? form.designationId : '', positionTitle: stillValid ? form.positionTitle : '' });
                }} className={INPUT_CLS}>
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.companyName ? ` — ${d.companyName}` : ''}</option>)}
                </select>
              ) : (
                // Departments come ONLY from company master data
                // (Company → Departments). Never let users type one here.
                <div>
                  <select required disabled value="" className={`${INPUT_CLS} bg-slate-50 text-slate-400`}>
                    <option value="">No departments found</option>
                  </select>
                  <p className="mt-0.5 text-xs text-amber-600">No departments exist yet — HR/Admin must create them under Company → Departments, then refresh this page.</p>
                </div>
              )}
              </div>

              <div>
                <label className={`${LABEL_CLS} mb-1 block`}>Position / Designation <span className="text-red-500">*</span></label>
                {visibleDesignations.length > 0 ? (
                  <select value={form.designationId} disabled={!form.departmentId} onChange={(e) => {
                    const desig = visibleDesignations.find(d => d.id === e.target.value);
                    // Company-module auto-fill: Grade comes from the designation
                    // level, Budget from the designation's company salary band.
                    const band = (desig?.minSalary != null && desig?.maxSalary != null)
                      ? `₹${Number(desig.minSalary).toLocaleString('en-IN')} – ₹${Number(desig.maxSalary).toLocaleString('en-IN')}`
                      : form.salaryBudget;
                    const grade = desig?.level != null ? `Grade ${desig.level}` : form.grade;
                    setForm({ ...form, designationId: e.target.value, positionTitle: desig?.title || form.positionTitle, salaryBudget: band, grade });
                  }} className={INPUT_CLS}>
                    <option value="">{form.departmentId ? 'Select designation…' : 'Pick a department first…'}</option>
                    {visibleDesignations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                ) : (
                  <input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value, designationId: e.target.value })} placeholder="e.g. Data Engineer 2" className={INPUT_CLS} />
                )}
                {form.departmentId && visibleDesignations.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">No designations configured for this department — type the position name above.</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Position Type <span className="text-red-500">*</span></label>
                  <select value={form.positionType} onChange={(e) => setForm({ ...form, positionType: e.target.value })} className={INPUT_CLS}>
                    <option value="new">New</option>
                    <option value="replacement">Replacement</option>
                  </select>
                </div>
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Vacancies <span className="text-red-500">*</span></label>
                  <input type="number" min={1} value={form.numberOfOpenings} onChange={(e) => setForm({ ...form, numberOfOpenings: parseInt(e.target.value) || 1 })} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Employment Type <span className="text-red-500">*</span></label>
                  <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className={INPUT_CLS}>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Priority <span className="text-red-500">*</span></label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={INPUT_CLS}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Company-module linked fields: Location ← Company → Branches,
                  Grade ← designation levels, Shift Timings ← Company → Shifts. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Location <span className="text-red-500">*</span></label>
                  <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={INPUT_CLS}>
                    <option value="">{branches.length ? 'Select location…' : 'No locations found'}</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>)}
                  </select>
                  <p className="mt-0.5 text-[10px] text-slate-500">Locations come from Company → Branches master data.</p>
                </div>
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Grade <span className="text-red-500">*</span></label>
                  <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={INPUT_CLS}>
                    <option value="">{gradeOptions.length ? 'Select grade…' : 'Pick a department first…'}</option>
                    {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <p className="mt-0.5 text-[10px] text-slate-500">Grades come from the designation levels in the company module.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className={`${LABEL_CLS} mb-1 block`}>Shift Timings</label>
                  <select value={form.shiftTimings} onChange={(e) => setForm({ ...form, shiftTimings: e.target.value })} className={INPUT_CLS}>
                    <option value="">{shifts.length ? 'Select shift…' : 'No shifts configured'}</option>
                    {shifts.map(s => <option key={s.id} value={`${s.name}${s.startTime ? ` (${s.startTime}${s.endTime ? `–${s.endTime}` : ''})` : ''}`}>{s.name}{s.startTime ? ` — ${s.startTime}${s.endTime ? `–${s.endTime}` : ''}` : ''}</option>)}
                  </select>
                  <p className="mt-0.5 text-[10px] text-slate-500">Shift timings come from Company → Shifts master data.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Requirements & Budget */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiDollarSign className="h-4 w-4" /></span>
              <h3 className="text-base font-bold text-slate-900">Requirements &amp; Budget</h3>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <label className={`${LABEL_CLS} mb-1 block`}>Budget <span className="text-red-500">*</span></label>
                <input value={form.salaryBudget} onChange={(e) => setForm({ ...form, salaryBudget: e.target.value })} placeholder="e.g. ₹9,00,000 – ₹12,00,000" className={INPUT_CLS} inputMode="text" />
                <p className="mt-0.5 text-[10px] text-slate-500">Auto-filled from the company module — picking a Position inserts its salary band; you can adjust it.</p>
              </div>

              <div>
                <label className={`${LABEL_CLS} mb-1 block`}>Required Skills <span className="text-red-500">*</span></label>
                <div className="flex min-h-[42px] w-full flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 transition focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/15">
                  {skillChips.map((chip) => (
                    <span key={chip} className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                      {chip}
                      <button type="button" onClick={() => removeSkillChip(chip)} className="text-green-600 transition hover:text-red-500" aria-label={`Remove skill ${chip}`}><FiX className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkillChips(skillInput); } else if (e.key === 'Backspace' && !skillInput && skillChips.length > 0) { removeSkillChip(skillChips[skillChips.length - 1]); } }}
                    onBlur={() => { if (skillInput.trim()) addSkillChips(skillInput); }}
                    placeholder={skillChips.length === 0 ? 'Type a skill and press Enter' : 'Add skill…'}
                    className="h-7 min-w-[120px] flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    aria-label="Add required skill"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Experience Required <span className="text-red-500">*</span></label>
                  <input value={form.experienceRequired} onChange={(e) => setForm({ ...form, experienceRequired: e.target.value })} placeholder="e.g. 3-5 years" list="exp-suggestions" className={INPUT_CLS} />
                  <datalist id="exp-suggestions">
                    <option value="0-1 years" /><option value="1-3 years" /><option value="3-5 years" /><option value="5-8 years" /><option value="8+ years" />
                  </datalist>
                </div>
                <div>
                  <label className={`${LABEL_CLS} mb-1 block`}>Qualification <span className="text-red-500">*</span></label>
                  <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. B.E. / B.Tech" list="qual-suggestions" className={INPUT_CLS} />
                  <datalist id="qual-suggestions">
                    <option value="B.E. / B.Tech" /><option value="M.Tech" /><option value="MBA" /><option value="Any Graduate" /><option value="Post Graduate" />
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <label className={`${LABEL_CLS} mb-1 block`}>Position Closing Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.expectedJoiningDate} onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Interview Rounds — full width table, grows with the page (no inner scroll) */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiUsers className="h-4 w-4" /></span>
            <h3 className="text-base font-bold text-slate-900">Interview Rounds <span className="text-red-500">*</span></h3>
          </div>
          <div id="interview-rounds-list" className="mt-3 rounded-lg border border-slate-200">
            <div className="grid grid-cols-[36px_minmax(0,1fr)_170px_90px] gap-2 rounded-t-lg bg-green-50 px-3 py-2 text-xs font-bold text-slate-700">
              <span>#</span><span>Round Name</span><span>Round Type</span><span className="text-center">Actions</span>
            </div>
            {roundRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[36px_minmax(0,1fr)_170px_90px] items-center gap-2 border-t border-slate-100 px-3 py-1.5">
                <span className="text-sm font-semibold text-slate-500">{i + 1}</span>
                <input
                  id={`round-name-${i}`}
                  value={row.name}
                  placeholder="Enter round name"
                  onChange={e => { const next = [...roundRows]; next[i] = { ...row, name: e.target.value }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }}
                  className={INPUT_CLS}
                  aria-label={`Round ${i + 1} name`}
                />
                <select
                  value={row.type}
                  onChange={e => { const next = [...roundRows]; next[i] = { ...row, type: e.target.value as InterviewPlanRow['type'] }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }}
                  className={INPUT_CLS}
                  aria-label={`Round ${i + 1} type`}
                >
                  <option value="technical">Technical</option>
                  <option value="hr">HR</option>
                  <option value="client">Client</option>
                  <option value="ai">AI</option>
                </select>
                <div className="flex items-center justify-center gap-1">
                  <button type="button" onClick={() => focusRoundName(i)} className="flex h-8 w-8 items-center justify-center rounded-md text-green-600 transition hover:bg-green-50" aria-label={`Edit round ${i + 1}`}><FiEdit2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setForm({ ...form, interviewPlan: serializeInterviewPlan(roundRows.filter((_, index) => index !== i)) })} className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50" aria-label={`Delete round ${i + 1}`}><FiTrash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {roundRows.length === 0 && <div className="border-t border-slate-100 px-3 py-5 text-center text-sm text-red-600">No interview rounds configured. Click <b>Add Round</b> and enter a round name.</div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => { const next = [...roundRows, { name: '', type: 'technical' as const }]; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-green-600 bg-white px-4 text-sm font-bold text-green-700 transition hover:bg-green-50"><FiPlus className="h-4 w-4" />Add Round</button>
            <p className="text-xs text-slate-400">{roundRows.length} round(s) configured · at least one named round is required to submit</p>
          </div>
        </section>

        {/* Bottom action bar */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button onClick={handleCancelForm} className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button onClick={() => handleSave('draft')} disabled={submitting} className="inline-flex h-10 items-center rounded-lg border-2 border-green-600 bg-white px-4 text-sm font-bold text-green-700 transition hover:bg-green-50 disabled:opacity-50">{submitting ? 'Saving…' : 'Save as Draft'}</button>
          <button onClick={() => handleSave('submit')} disabled={submitting} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-green-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"><FiCheck className="h-4 w-4" />{submitting ? 'Saving…' : 'Submit for Approval'}</button>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Back button — required on every screen */}
      <div>
        <BackButton fallbackHref="/recruitment" />
      </div>

      {/* Header — Employee-module typography */}
      <div className="-mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Requisitions</h2>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
            <button type="button" onClick={() => router.push('/recruitment')} className="transition hover:text-green-600">Recruitment</button>
            <span className="text-slate-400">/</span>
            <span className="font-medium text-slate-700">Requisitions</span>
          </nav>
        </div>
        <p className="text-sm text-slate-500">Raise, review, and approve hiring requests in one place</p>
      </div>

      {/* Tabs — Employee-module underline style. switchTab resets the list
          filter so My Approvals is never silently filtered to empty. */}
      <div className="flex items-center gap-1 border-b border-thb-border overflow-x-auto">
        <button type="button" onClick={() => switchTab('requisitions')} className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'requisitions' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Requisition</button>
        <button type="button" onClick={() => switchTab('approvals')} className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'approvals' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>My Approvals ({needsActionCount})</button>
      </div>

      {/* Stat cards — Employee-module white card style */}
      <section aria-label="Requisition workspace" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button type="button" onClick={() => { switchTab('requisitions'); setListFilter('action'); }} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-green-300">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-500">Needs My Action</span>
              <span className="mt-1 block text-2xl font-bold text-slate-900">{needsActionCount}</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600"><FiCheck className="h-5 w-5" /></span>
          </button>
          <button type="button" onClick={() => { switchTab('requisitions'); setListFilter('pending'); }} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-500">Pending Approvals</span>
              <span className="mt-1 block text-2xl font-bold text-slate-900">{inApprovalCount}</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><FiClock className="h-5 w-5" /></span>
          </button>
          <button type="button" onClick={() => { switchTab('requisitions'); setListFilter('approved'); }} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-500">Approved This Month</span>
              <span className="mt-1 block text-2xl font-bold text-slate-900">{approvedCount}</span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><FiCheckCircle className="h-5 w-5" /></span>
          </button>
        </div>

        <div className="space-y-4">
          {/* Requisition List — full width; hidden while a requisition is open full-screen */}
          {!selectedRequisition && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{activeTab === 'approvals' ? 'Awaiting My Action' : 'Requisition'}</h3>
                {activeTab === 'approvals' && <span className="inline-flex h-7 items-center rounded-md bg-green-50 px-2.5 text-xs font-bold text-green-700">Approval queue</span>}
              </div>
              <div className="relative mt-3"><FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, title, or department..." className="h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/10" /></div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([['all', `All (${requisitions.length})`], ['action', `Needs Action (${needsActionCount})`], ['pending', `Pending (${inApprovalCount})`], ['draft', `Draft (${draftCount})`], ['approved', `Approved (${approvedCount})`], ['rejected', `Rejected (${rejectedCount})`]] as const).map(([key, label]) => <button type="button" key={key} onClick={() => { switchTab('requisitions'); setListFilter(key); }} className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${listFilter === key ? 'bg-green-700 text-white shadow-sm' : 'border border-slate-300 bg-white text-slate-700 hover:border-green-400 hover:text-green-700'}`}>{label}</button>)}
              </div>
            </div>
            {/* Columns sized so every badge fits without cropping. The grid keeps
                a 920px min-width and scrolls horizontally on phones — columns
                never overlap. */}
            <div className="overflow-x-auto">
            <div className="min-w-[920px]">
            <div className="grid grid-cols-[70px_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_42px_76px_96px_minmax(0,0.8fr)_minmax(0,1.05fr)] items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span className="whitespace-nowrap">Req ID</span><span className="whitespace-nowrap">Position</span><span className="whitespace-nowrap">Department</span><span className="whitespace-nowrap">Location</span><span className="whitespace-nowrap text-center">Open</span><span className="whitespace-nowrap text-center">Priority</span><span className="whitespace-nowrap text-center">Status</span><span className="whitespace-nowrap">Requested By</span><span className="whitespace-nowrap text-right">View</span>
            </div>
            <div className="space-y-1.5 p-3">
              {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />) : filteredRequisitions.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <FiSearch className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">{activeTab === 'approvals' ? 'Nothing needs your action right now' : 'No matching requisitions'}</p>
                  <p className="mt-1 text-xs text-slate-400">{activeTab === 'approvals' ? 'Requisitions waiting for your approval will appear here automatically.' : 'Try another search or filter.'}</p>
                </div>
              ) : filteredRequisitions.map((r) => {
                const selected = selectedRequisition?.id === r.id;
                // Dynamic status naming: say WHO it is waiting on, taken from
                // the workflow tier (e.g. "Pending HR", "Pending Finance").
                const tier = (r as any).nextTier as { label?: string; eligible?: boolean } | null | undefined;
                const tierName = tier?.label ? String(tier.label).replace(/\s*Approval\s*$/i, '').trim() : '';
                const inFlight = ['pending', 'hr_approved'].includes(r.approvalStatus) || /^tier_\d+_approved$/.test(r.approvalStatus);
                const statusText = inFlight && tierName ? `Pending ${tierName}` : getApprovalShortLabel(r.approvalStatus);
                const statusTitle = inFlight && tierName ? `Waiting for ${tierName} approval` : getApprovalLabel(r.approvalStatus);
                return <div key={r.id} role="button" tabIndex={0} onClick={() => handleView(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleView(r.id); }} className={`grid min-h-[56px] w-full cursor-pointer grid-cols-[70px_minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_42px_76px_96px_minmax(0,0.8fr)_minmax(0,1.05fr)] items-center gap-1.5 rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-green-500 bg-green-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-green-300 hover:bg-slate-50'}`}>
                  <span className="text-[11px] font-bold text-slate-900" title={r.requisitionId || '—'}>{r.requisitionId || '—'}</span>
                  <span className="min-w-0" title={r.designation?.title || r.positionTitle || 'Position not specified'}><span className="block truncate text-[13px] font-bold text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</span></span>
                  <span className="min-w-0" title={r.department?.name || 'Not specified'}><span className="block truncate text-xs font-semibold text-slate-700">{r.department?.name || 'Not specified'}</span></span>
                  <span className="min-w-0" title={branches.find((b) => b.id === r.branchId)?.name || 'Not specified'}><span className="block truncate text-xs font-semibold text-slate-700">{branches.find((b) => b.id === r.branchId)?.name || 'Not specified'}</span></span>
                  <span className="text-center text-[13px] font-bold tabular-nums text-slate-900">{r.numberOfOpenings}</span>
                  <span className="flex min-w-0 justify-center"><span className={`${getPriorityBadge(r.priority)} max-w-full`} title={r.priority}><span className="capitalize">{r.priority}</span></span></span>
                  <span className="flex min-w-0 justify-center"><span className={`${getApprovalBadge(r.approvalStatus)} max-w-full`} title={statusTitle}>{statusText}</span></span>
                  <span className="min-w-0" title={(r as any).managerName || 'Not specified'}><span className="block truncate text-xs font-semibold text-slate-700">{(r as any).managerName || 'Not specified'}</span></span>
                  {/* Single "View Requisition" action (user request): approvals
                      and edits happen inside the full-screen view. */}
                  <span className="flex min-w-0 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button type="button" title="Open the full requisition view" onClick={() => handleView(r.id)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-green-600 bg-white px-2.5 py-1.5 text-[11px] font-bold text-green-700 transition hover:bg-green-50"><FiFileText className="h-3 w-3" /> View Requisition</button>
                  </span>
                </div>;
              })}
            </div>
            </div>
            </div>
          </div>
          )}

          {/* Requisition Detail — full-screen: shows ONLY the selected
              requisition. No back button (user request) — the "Requisition
              List" tab returns to the list. */}
          {selectedRequisition && (
          <div id="view-panel" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {(() => {
              const r = selectedRequisition;
              const stageIndex = r.approvalStatus === 'budget_approved' ? 3 : r.approvalStatus === 'hr_approved' ? 2 : r.approvalStatus === 'pending' ? 1 : 0;
              const isFailed = r.approvalStatus === 'rejected';
              const skillList = (r.skillsRequired || '').split(',').map(s => s.trim()).filter(Boolean);
              return <div className="p-4">
                {/* Detail header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiFileText className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">{r.requisitionId || 'REQUISITION'}</p>
                      <h3 className="break-words text-base font-bold tracking-tight text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">{r.department?.name || 'Department not specified'}</p>
                    </div>
                  </div>
                  <span className="shrink-0"><span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600"><span className="capitalize">{r.priority}</span><span>Priority</span></span></span>
                </div>

                {/* Mini stat tiles */}
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatTile label="Openings" value={String(r.numberOfOpenings)} icon={<FiUsers className="h-4 w-4 text-green-600" />} />
                  <StatTile label="Budget" value={r.salaryBudget || 'Not specified'} icon={<FiDollarSign className="h-4 w-4 text-amber-500" />} />
                  <StatTile label="Closing Date" value={r.expectedJoiningDate ? new Date(r.expectedJoiningDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not specified'} icon={<FiCalendar className="h-4 w-4 text-green-600" />} />
                  <StatTile label="Interview Rounds" value={String(parseInterviewPlan(r.interviewPlan || '[]').length)} icon={<FiLayers className="h-4 w-4 text-green-600" />} />
                  <StatTile label="Grade" value={r.grade || 'Not specified'} icon={<FiLayers className="h-4 w-4 text-violet-500" />} />
                  <StatTile label="Location" value={branches.find((b) => b.id === r.branchId)?.name || 'Not specified'} icon={<FiMapPin className="h-4 w-4 text-cyan-500" />} />
                  <StatTile label="Shift Timings" value={r.shiftTimings || 'Not specified'} icon={<FiClock className="h-4 w-4 text-slate-500" />} />
                </div>

                {/* Required skills */}
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-slate-900">Required Skills</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {skillList.length > 0 ? skillList.map((skill) => <span key={skill} className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">{skill}</span>) : <span className="text-xs text-slate-400">Not specified</span>}
                  </div>
                </div>

                {/* Approval timeline — labels never crop: text sits in its own
                    non-shrinking span, connectors absorb the remaining width */}
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-slate-900">Approval Timeline</h4>
                  <div className="mt-2 flex items-center gap-1">
                    {['Submitted', 'HR Review', 'Finance', 'Job Posting'].map((label, index) => {
                      const done = index < stageIndex || (index === 3 && r.approvalStatus === 'budget_approved');
                      const current = index === stageIndex && r.approvalStatus !== 'budget_approved';
                      const isLast = index === 3;
                      return (
                        <div key={label} className="flex items-center gap-1 flex-1 min-w-0">
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isFailed && current ? 'border-red-500 bg-red-50 text-red-600' : done ? 'border-green-600 bg-green-600 text-white' : current ? 'border-green-500 bg-white' : 'border-slate-300 bg-white'}`}>
                              {done ? <FiCheck className="h-3 w-3" /> : <span className={`h-1.5 w-1.5 rounded-full ${current ? 'bg-green-500' : 'bg-slate-200'}`} />}
                            </span>
                            <span className={`text-xs font-semibold ${current || done ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                          </div>
                          {!isLast && <span className={`h-px min-w-[8px] flex-1 ${done ? 'bg-green-500' : 'bg-slate-200'}`} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full details (toggled by View Full Details) */}
                {showFullDetails && (
                  <div className="mt-4 grid auto-rows-fr gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <DetailField label="Experience" value={r.experienceRequired || 'Not specified'} />
                    <DetailField label="Qualification" value={r.qualification || 'Not specified'} />
                    <DetailField label="Position Type" value={r.positionType || 'Not specified'} capitalize />
                    <DetailField label="Employment Type" value={r.employmentType || 'Not specified'} capitalize />
                    <DetailField label="Grade" value={r.grade || 'Not specified'} />
                    <DetailField label="Location" value={branches.find((b) => b.id === r.branchId)?.name || (r as any).branch?.name || 'Not specified'} />
                    <DetailField label="Shift Timings" value={r.shiftTimings || 'Not specified'} />
                  </div>
                )}

                {/* Approval history */}
                {approvalHistory.length > 0 && !showFullDetails && <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700"><span>Approval history ({approvalHistory.length})</span><span className="text-slate-400 transition group-open:rotate-90">›</span></summary><div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-slate-200 p-2">{approvalHistory.map((h) => <div key={h.id} className="rounded-md border border-slate-100 bg-white p-2 text-xs"><p className="text-slate-700">{h.details}</p><p className="mt-0.5 text-slate-400">{new Date(h.createdAt).toLocaleString('en-IN')}</p></div>)}</div></details>}

                {/* Actions — buttons wrap, never overlap; Approve / Reject are
                    always shown when it is the user's turn to act */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {(() => { const actions = detailActions(r); return actions.length > 0 ? actions : <span className="text-sm text-slate-400">No actions available for your role at this stage.</span>; })()}
                  <button type="button" onClick={() => setShowFullDetails((v) => !v)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-green-600 bg-white px-3 py-1.5 text-xs font-bold text-green-700 transition hover:bg-green-50">
                    <FiExternalLink className="h-3.5 w-3.5" />{showFullDetails ? 'Hide' : 'View Full Details'}
                  </button>
                  {(r.approvalStatus === 'draft' || r.approvalStatus === 'returned') && <button type="button" onClick={() => handleEdit(r)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"><FiEdit2 className="h-3.5 w-3.5" /> Edit</button>}
                  {r.approvalStatus === 'draft' && <button type="button" onClick={() => setDeleteConfirmId(r.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"><FiTrash2 className="h-3.5 w-3.5" /> Delete</button>}
                </div>
                {deleteConfirmId === r.id && <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-red-700">Delete this draft requisition permanently?</p><div className="flex gap-2"><button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Cancel</button><button type="button" onClick={() => handleDelete(r.id)} disabled={deleting} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete Draft'}</button></div></div>}
              </div>;
            })()}
          </div>
          )}
        </div>
      </section>

      {/* Hidden legacy sections kept for parity (table / mobile cards / old view panel) */}
      {viewingId && (() => {
        const item = requisitions.find(i => i.id === viewingId);
        if (!item) return null;
        return (
          <div className="hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-thb-text-primary">Requisition Details</h2>
                <div className="flex items-center gap-2">
                  {(item.approvalStatus === 'draft' || item.approvalStatus === 'returned') && (
                    <button onClick={() => handleEdit(item)} className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors flex items-center gap-1"><FiEdit2 className="w-3.5 h-3.5" />Edit</button>
                  )}
                  <button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><span className="text-xs font-medium text-thb-text-secondary">Req ID</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.requisitionId || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Department</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.department?.name || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Designation</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.designation?.title || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Position Type</span><p className="text-sm font-medium text-thb-text-primary mt-0.5 capitalize">{item.positionType || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Openings</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.numberOfOpenings}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Employment</span><p className="text-sm font-medium text-thb-text-primary mt-0.5 capitalize">{item.employmentType}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Priority</span><p className="mt-0.5"><span className={getPriorityBadge(item.priority)}>{item.priority}</span></p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Approval Status</span><p className="mt-0.5"><span className={getApprovalBadge(item.approvalStatus)}>{getApprovalLabel(item.approvalStatus)}</span></p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Status</span><p className="mt-0.5"><span className={getStatusBadge(item.status)}>{item.status}</span></p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Skills Required</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.skillsRequired || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Experience</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.experienceRequired || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Qualification</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.qualification || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Salary Budget</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.salaryBudget || '—'}</p></div>
                <div><span className="text-xs font-medium text-thb-text-secondary">Position Closing Date</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.expectedJoiningDate ? new Date(item.expectedJoiningDate).toLocaleDateString() : '—'}</p></div>
              </div>
              {approvalHistory.length > 0 && (
                <div className="mt-6 pt-4 border-t border-thb-border">
                  <h3 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2"><FiClock className="w-4 h-4" />Approval History</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {approvalHistory.map((h) => (
                      <div key={h.id} className="text-xs flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                        <span className="text-thb-text-muted whitespace-nowrap">{new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        <span className="text-thb-text-secondary flex-1">{h.details}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 pt-4 border-t border-thb-border">
                <h3 className="text-sm font-semibold text-thb-text-primary mb-3">Actions</h3>
                {getApprovalButtons(item)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Embedded Form */}
    </div>
  );
}
