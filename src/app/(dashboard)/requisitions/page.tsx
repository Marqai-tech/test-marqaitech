'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiAlertCircle, FiEdit2, FiTrash2,
  FiArrowLeft, FiRotateCcw, FiClock, FiSearch, FiBriefcase, FiCalendar,
  FiFileText, FiUsers, FiUser, FiDollarSign, FiLayers, FiExternalLink, FiCheckCircle, FiHome, FiVolume2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Requisition {
  id: string; requisitionId: string; positionType: string; numberOfOpenings: number; employmentType: string; priority: string; approvalStatus: string; status: string; skillsRequired: string | null; experienceRequired: string | null; qualification: string | null; salaryBudget: string | null; expectedJoiningDate: string | null; interviewPlan?: string | null; companyId?: string; hiringManagerId?: string; positionTitle?: string;
  department?: { id?: string; name: string } | null; designation?: { id?: string; title: string } | null;
}

interface ApprovalHistoryEntry {
  id: string; action: string; module: string; details: string; createdAt: string;
  user?: { name?: string; email?: string } | null;
}

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

const initialForm = {
  departmentId: '', designationId: '', positionTitle: '', positionType: 'new', numberOfOpenings: 1, employmentType: 'full-time', skillsRequired: '', experienceRequired: '', qualification: '', salaryBudget: '', priority: 'medium', expectedJoiningDate: '', reason: '', interviewPlan: JSON.stringify([{ sequence: 1, name: 'Technical Round 1', type: 'technical' }, { sequence: 2, name: 'HR Round', type: 'hr' }], null, 2),
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

function getApprovalBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600',
    pending: 'inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700',
    hr_approved: 'inline-flex items-center rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700',
    budget_approved: 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700',
    rejected: 'inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700',
    returned: 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700',
  };
  return map[status] || 'inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700',
    medium: 'inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700',
    high: 'inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700',
    critical: 'inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700',
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
// colored icon on top, gray label, bold value.
function StatTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <span className="flex h-4 items-center">{icon}</span>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
      <p className="mt-px truncate text-xs font-bold text-slate-900" title={value}>{value}</p>
    </div>
  );
}

function DetailField({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-px break-words text-xs font-semibold text-slate-800 ${capitalize ? 'capitalize' : ''}`}>{value}</p></div>;
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
const INPUT_CLS = 'h-[34px] w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-[12px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const BADGE = 'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold';
export default function RequisitionsPage() {
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
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [skillChips, setSkillChips] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'requisitions' | 'approvals'>('requisitions');
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [listFilter, setListFilter] = useState<'all' | 'action' | 'pending' | 'draft' | 'approved'>('all');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setEditingId(null);
      setForm(initialForm);
      setShowForm(true);
    }
  }, []);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; companyName?: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string; departmentId: string | null }>>([]);

  const fetchDeptDesignations = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const scopeParam = sq ? `&${sq}` : '';
      const noDedupeParam = sq ? '' : '&noDedupe=1';
      const [deptRes, desigRes] = await Promise.all([
        fetch(`/api/departments?limit=100${scopeParam}${noDedupeParam}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/designations?limit=100${scopeParam}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (deptRes?.ok) {
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
      }
      if (desigRes?.ok) {
        const desigData = await desigRes.json();
        const desigList = desigData.designations || desigData.data || (Array.isArray(desigData) ? desigData : []);
        const seenDesig = new Set<string>();
        const dedupedDesigs: Array<{ id: string; title: string; departmentId: string | null }> = [];
        for (const d of desigList) {
          if (!d?.id || !d?.title) continue;
          const key = String(d.title).toLowerCase().trim();
          if (seenDesig.has(key)) continue;
          seenDesig.add(key);
          const deptId = d.departmentId || d.department?.id || null;
          dedupedDesigs.push({ id: d.id, title: d.title, departmentId: deptId });
        }
        dedupedDesigs.sort((a, b) => a.title.localeCompare(b.title));
        setDesignations(dedupedDesigs);
      }
    } catch { /* non-fatal — fallback to text input */ }
  }, [scopeQuery]);

  useEffect(() => { queueMicrotask(() => fetchDeptDesignations()); }, [fetchDeptDesignations]);

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

  const handleAddNew = () => {
    setForm(initialForm);
    resetFormExtras();
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

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
      priority: item.priority || 'medium',
      expectedJoiningDate: item.expectedJoiningDate ? new Date(item.expectedJoiningDate).toISOString().split('T')[0] : '',
      reason: '',
      interviewPlan: item.interviewPlan || initialForm.interviewPlan,
    });
    const [sm, sx] = parseSalaryRange(item.salaryBudget);
    setSalaryMin(sm);
    setSalaryMax(sx);
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
    const params = new URLSearchParams({
      requisitionId: r.id,
      title: r.designation?.title || 'Position',
      departmentId: r.department?.name || '',
      vacancies: String(r.numberOfOpenings || 1),
      type: r.employmentType || 'full-time',
      experience: r.experienceRequired || '',
      salary: r.salaryBudget || '',
      skills: r.skillsRequired || '',
      qualification: r.qualification || '',
      closingDate: r.expectedJoiningDate ? new Date(r.expectedJoiningDate).toISOString().split('T')[0] : '',
    });
    window.location.href = `/job-portal?${params.toString()}`;
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
    if (isHr && r.approvalStatus === 'pending') return true;
    if (isFinance && r.approvalStatus === 'hr_approved') return true;
    return r.hiringManagerId === user?.id && ['draft', 'returned'].includes(r.approvalStatus);
  }, [isFinance, isHr, user?.id]);

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
        || (listFilter === 'approved' && r.approvalStatus === 'budget_approved');
      return matchesSearch && matchesTab && matchesFilter;
    });
  }, [activeTab, listFilter, needsAction, requisitions, search]);

  const selectedRequisition = requisitions.find((r) => r.id === viewingId) || filteredRequisitions[0] || null;
  const inApprovalCount = requisitions.filter((r) => ['pending', 'hr_approved'].includes(r.approvalStatus)).length;
  const approvedCount = requisitions.filter((r) => r.approvalStatus === 'budget_approved').length;
  const needsActionCount = requisitions.filter(needsAction).length;
  const draftCount = requisitions.filter((r) => ['draft', 'returned'].includes(r.approvalStatus)).length;

  // Mock-styled primary/negative actions for the detail panel
  const detailActions = (r: Requisition) => {
    const actions: React.ReactNode[] = [];
    const isRequester = r.hiringManagerId === user?.id;

    if (isRequester && r.approvalStatus === 'returned') {
      actions.push(
        <button key="resubmit" onClick={() => handleApproval(r.id, 'submit')} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-50">
          <FiRotateCcw className="h-4 w-4" />Resubmit
        </button>
      );
    }
    if (isHr && r.approvalStatus === 'pending') {
      actions.push(
        <button key="hr_approve" onClick={() => handleApproval(r.id, 'hr_approve')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-green-600/25 transition hover:bg-green-700">
          <FiCheck className="h-4 w-4" />Approve
        </button>,
        <button key="return" onClick={() => handleApproval(r.id, 'return')} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50">
          <FiRotateCcw className="h-4 w-4" />Return for Changes
        </button>,
        <button key="hr_reject" onClick={() => handleApproval(r.id, 'hr_reject')} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50">
          <FiXCircle className="h-4 w-4" />Reject
        </button>
      );
    }
    if (isFinance && r.approvalStatus === 'hr_approved') {
      actions.push(
        <button key="fin_approve" onClick={() => handleApproval(r.id, 'finance_approve')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-green-600/25 transition hover:bg-green-700">
          <FiCheck className="h-4 w-4" />Approve Finance
        </button>,
        <button key="fin_reject" onClick={() => handleApproval(r.id, 'finance_reject')} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50">
          <FiRotateCcw className="h-4 w-4" />Return for Changes
        </button>
      );
    }
    if (isHr && r.approvalStatus === 'budget_approved') {
      actions.push(
        <button key="create_job" onClick={() => handleCreateJobPosting(r)} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-green-600/25 transition hover:bg-green-700">
          <FiPlus className="h-4 w-4" />Create Job Posting
        </button>
      );
    }
    return actions;
  };

  if (showForm) {
    const roundRows = parseInterviewPlan(form.interviewPlan);
    return (
      <div className="-m-3 flex flex-col gap-2 overflow-y-auto bg-slate-50 p-3 lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <a href="/dashboard" className="text-slate-400 transition hover:text-green-700" aria-label="Home"><FiHome className="h-3.5 w-3.5" /></a>
          <span className="text-slate-300">/</span>
          <a href="/recruitment" className="transition hover:text-green-700">Recruitment</a>
          <span className="text-slate-300">/</span>
          <button type="button" onClick={handleCancelForm} className="transition hover:text-green-700">Requisitions</button>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-green-700">{editingId ? 'Edit Requisition' : 'Raise Requisition'}</span>
        </nav>

        {/* Compact title row */}
        <div className="flex shrink-0 items-center gap-2.5">
          <h1 className="text-[22px] font-bold leading-[26px] text-slate-900">{editingId ? 'Edit Requisition' : 'Raise New Requisition'}</h1>
          <span className="inline-flex h-6 items-center gap-1 rounded-md bg-green-100 px-2 text-[10px] font-bold text-green-700"><FiFileText className="h-3 w-3" />{editingId ? 'Editing' : 'Draft'}</span>
        </div>
        <p className="shrink-0 text-[12px] leading-4 text-slate-500">Create a hiring request with role details, requirements, budget and interview rounds.</p>

        {/* Required-field note + compact approval path */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-[11px] text-slate-500">Required fields are marked with <span className="font-bold text-red-500">*</span></span>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-bold text-slate-600">Approval Path:</span>
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-green-50 px-2 font-bold text-green-700 ring-1 ring-inset ring-green-100"><FiUser className="h-3 w-3" />HR</span>
            <span className="text-slate-400">→</span>
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-green-50 px-2 font-bold text-green-700 ring-1 ring-inset ring-green-100"><FiDollarSign className="h-3 w-3" />Finance</span>
            <span className="text-slate-400">→</span>
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-green-50 px-2 font-bold text-green-700 ring-1 ring-inset ring-green-100"><FiVolume2 className="h-3 w-3" />Job Posting</span>
          </div>
        </div>

        {/* Two-column cards */}
        <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Role & Position */}
          <section className="rounded-[10px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiBriefcase className="h-4 w-4" /></span>
              <h2 className="text-[15px] font-bold text-slate-900">Role &amp; Position</h2>
            </div>
            <div className="mt-2.5 grid grid-cols-[124px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Department <span className="text-red-500">*</span></label>
              {departments.length > 0 ? (
                <select required value={form.departmentId} onChange={(e) => {
                  const newDeptId = e.target.value;
                  const stillValid = visibleDesignations.some(d => d.id === form.designationId);
                  setForm({ ...form, departmentId: newDeptId, designationId: stillValid ? form.designationId : '', positionTitle: stillValid ? form.positionTitle : '' });
                }} className={INPUT_CLS}>
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.companyName ? ` — ${d.companyName}` : ''}</option>)}
                </select>
              ) : (
                <input required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} placeholder="Department name" className={INPUT_CLS} />
              )}

              <label className="text-[11px] font-semibold text-slate-600">Position / Designation <span className="text-red-500">*</span></label>
              {designations.length > 0 ? (
                <select value={form.designationId} disabled={!form.departmentId} onChange={(e) => {
                  const desig = visibleDesignations.find(d => d.id === e.target.value);
                  setForm({ ...form, designationId: e.target.value, positionTitle: desig?.title || form.positionTitle });
                }} className={INPUT_CLS}>
                  <option value="">{form.departmentId ? 'Select designation…' : 'Pick a department first…'}</option>
                  {visibleDesignations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              ) : (
                <input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value, designationId: e.target.value })} placeholder="e.g. Data Engineer 2" className={INPUT_CLS} />
              )}

              <label className="text-[11px] font-semibold text-slate-600">Position Type <span className="text-red-500">*</span></label>
              <select value={form.positionType} onChange={(e) => setForm({ ...form, positionType: e.target.value })} className={INPUT_CLS}>
                <option value="new">New</option>
                <option value="replacement">Replacement</option>
              </select>

              <label className="text-[11px] font-semibold text-slate-600">Vacancies <span className="text-red-500">*</span></label>
              <input type="number" min={1} value={form.numberOfOpenings} onChange={(e) => setForm({ ...form, numberOfOpenings: parseInt(e.target.value) || 1 })} className={INPUT_CLS} />

              <label className="text-[11px] font-semibold text-slate-600">Employment Type <span className="text-red-500">*</span></label>
              <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className={INPUT_CLS}>
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>

              <label className="text-[11px] font-semibold text-slate-600">Priority <span className="text-red-500">*</span></label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={INPUT_CLS}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </section>

          {/* Requirements & Budget */}
          <section className="rounded-[10px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiDollarSign className="h-4 w-4" /></span>
              <h2 className="text-[15px] font-bold text-slate-900">Requirements &amp; Budget</h2>
            </div>
            <div className="mt-2.5 grid grid-cols-[124px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Salary Range / Budget <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-1.5">
                <input value={salaryMin} onChange={(e) => { const v = e.target.value; setSalaryMin(v); setForm(f => ({ ...f, salaryBudget: composeSalaryRange(v, salaryMax) })); }} placeholder="Min" className={INPUT_CLS} inputMode="text" />
                <span className="shrink-0 text-[12px] text-slate-400">−</span>
                <input value={salaryMax} onChange={(e) => { const v = e.target.value; setSalaryMax(v); setForm(f => ({ ...f, salaryBudget: composeSalaryRange(salaryMin, v) })); }} placeholder="Max" className={INPUT_CLS} inputMode="text" />
              </div>

              <label className="text-[11px] font-semibold text-slate-600">Required Skills <span className="text-red-500">*</span></label>
              <div className="flex min-h-[34px] w-full flex-wrap items-center gap-1 rounded-[7px] border border-slate-300 bg-white px-1.5 py-1 transition focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/15">
                {skillChips.map((chip) => (
                  <span key={chip} className="inline-flex items-center gap-1 rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
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
                  className="h-6 min-w-[100px] flex-1 border-0 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
                  aria-label="Add required skill"
                />
              </div>

              <label className="text-[11px] font-semibold text-slate-600">Experience Required <span className="text-red-500">*</span></label>
              <input value={form.experienceRequired} onChange={(e) => setForm({ ...form, experienceRequired: e.target.value })} placeholder="e.g. 3-5 years" list="exp-suggestions" className={INPUT_CLS} />
              <datalist id="exp-suggestions">
                <option value="0-1 years" /><option value="1-3 years" /><option value="3-5 years" /><option value="5-8 years" /><option value="8+ years" />
              </datalist>

              <label className="text-[11px] font-semibold text-slate-600">Qualification <span className="text-red-500">*</span></label>
              <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. B.E. / B.Tech" list="qual-suggestions" className={INPUT_CLS} />
              <datalist id="qual-suggestions">
                <option value="B.E. / B.Tech" /><option value="M.Tech" /><option value="MBA" /><option value="Any Graduate" /><option value="Post Graduate" />
              </datalist>

              <label className="text-[11px] font-semibold text-slate-600">Position Closing Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.expectedJoiningDate} onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })} className={INPUT_CLS} />
            </div>
          </section>
        </div>

        {/* Interview Rounds — full width, compact table */}
        <section className="flex min-h-0 flex-col rounded-[10px] border border-slate-200 bg-white p-3 shadow-sm lg:flex-1">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiUsers className="h-4 w-4" /></span>
            <h2 className="text-[15px] font-bold text-slate-900">Interview Rounds <span className="text-red-500">*</span></h2>
          </div>
          <div className="mt-2 min-h-0 overflow-y-auto rounded-[8px] border border-slate-200">
            <div className="grid grid-cols-[36px_minmax(0,1fr)_150px_80px] gap-2 rounded-t-[8px] bg-green-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">
              <span>#</span><span>Round Name</span><span>Round Type</span><span className="text-center">Actions</span>
            </div>
            {roundRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[36px_minmax(0,1fr)_150px_80px] items-center gap-2 border-t border-slate-100 px-2.5 py-1">
                <span className="text-[12px] font-semibold text-slate-500">{i + 1}</span>
                <input
                  id={`round-name-${i}`}
                  value={row.name}
                  placeholder="Enter round name"
                  onChange={e => { const next = [...roundRows]; next[i] = { ...row, name: e.target.value }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }}
                  className="h-[30px] w-full rounded-[7px] border border-slate-300 bg-white px-2 text-[12px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
                  aria-label={`Round ${i + 1} name`}
                />
                <select
                  value={row.type}
                  onChange={e => { const next = [...roundRows]; next[i] = { ...row, type: e.target.value as InterviewPlanRow['type'] }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }}
                  className="h-[30px] w-full rounded-[7px] border border-slate-300 bg-white px-1.5 text-[12px] text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
                  aria-label={`Round ${i + 1} type`}
                >
                  <option value="technical">Technical</option>
                  <option value="hr">HR</option>
                  <option value="client">Client</option>
                  <option value="ai">AI</option>
                </select>
                <div className="flex items-center justify-center gap-1">
                  <button type="button" onClick={() => focusRoundName(i)} className="flex h-7 w-7 items-center justify-center rounded-md text-green-600 transition hover:bg-green-50" aria-label={`Edit round ${i + 1}`}><FiEdit2 className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setForm({ ...form, interviewPlan: serializeInterviewPlan(roundRows.filter((_, index) => index !== i)) })} className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50" aria-label={`Delete round ${i + 1}`}><FiTrash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {roundRows.length === 0 && <div className="border-t border-slate-100 px-3 py-4 text-center text-[11px] text-red-600">No interview rounds configured. Click <b>Add Round</b> and enter a round name.</div>}
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
            <button type="button" onClick={() => setForm({ ...form, interviewPlan: serializeInterviewPlan([...roundRows, { name: '', type: 'technical' }]) })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-green-600 bg-white px-3 text-[11px] font-bold text-green-700 transition hover:bg-green-50"><FiPlus className="h-3.5 w-3.5" />Add Round</button>
            <p className="text-[10px] text-slate-400">{roundRows.length} round(s) configured · at least one named round is required to submit</p>
          </div>
        </section>

        {/* Bottom action bar */}
        <div className="flex shrink-0 items-center justify-end gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <button onClick={handleCancelForm} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button onClick={() => handleSave('draft')} disabled={submitting} className="inline-flex h-9 items-center rounded-md border-2 border-green-600 bg-white px-4 text-[12px] font-bold text-green-700 transition hover:bg-green-50 disabled:opacity-50">{submitting ? 'Saving…' : 'Save as Draft'}</button>
          <button onClick={() => handleSave('submit')} disabled={submitting} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-5 text-[12px] font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"><FiCheck className="h-3.5 w-3.5" />{submitting ? 'Saving…' : 'Submit for Approval'}</button>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-2.5">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[11px]">
        <a href="/recruitment" className="font-semibold text-green-600 hover:text-green-700 hover:underline">Recruitment</a>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600">Requisitions</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900">Requisitions</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">Raise, review, and approve hiring requests in one place</p>
        </div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-green-600/25 transition hover:bg-green-700">
          <FiPlus className="h-3.5 w-3.5" /> Raise Requisition
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-1 border-b border-transparent">
        <button type="button" onClick={() => setActiveTab('requisitions')} className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${activeTab === 'requisitions' ? 'bg-green-50 text-green-700 shadow-[inset_0_-2px_0_0_#16a34a]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>Requisitions</button>
        <button type="button" onClick={() => setActiveTab('approvals')} className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${activeTab === 'approvals' ? 'bg-green-50 text-green-700 shadow-[inset_0_-2px_0_0_#16a34a]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>My Approvals ({needsActionCount})</button>
      </div>

      {/* Stat cards */}
      <section aria-label="Requisition workspace" className="space-y-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => { setActiveTab('requisitions'); setListFilter('action'); }} className="flex items-center gap-2.5 rounded-xl bg-green-50 p-2.5 text-left transition hover:bg-green-100/70">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-green-600 shadow-sm"><FiCheck className="h-4 w-4" /></span>
            <span><span className="block text-[11px] font-bold text-slate-900">Needs My Action</span><span className="mt-px block text-lg font-bold text-slate-900">{needsActionCount}</span></span>
          </button>
          <button type="button" onClick={() => { setActiveTab('requisitions'); setListFilter('pending'); }} className="flex items-center gap-2.5 rounded-xl bg-amber-50 p-2.5 text-left transition hover:bg-amber-100/70">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-500 shadow-sm"><FiClock className="h-4 w-4" /></span>
            <span><span className="block text-[11px] font-bold text-slate-900">Pending Approvals</span><span className="mt-px block text-lg font-bold text-slate-900">{inApprovalCount}</span></span>
          </button>
          <button type="button" onClick={() => { setActiveTab('requisitions'); setListFilter('approved'); }} className="flex items-center gap-2.5 rounded-xl bg-blue-50 p-2.5 text-left transition hover:bg-blue-100/70">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-500 shadow-sm"><FiCheckCircle className="h-4 w-4" /></span>
            <span><span className="block text-[11px] font-bold text-slate-900">Approved This Month</span><span className="mt-px block text-lg font-bold text-slate-900">{approvedCount}</span></span>
          </button>
        </div>

        <div className="grid min-h-[460px] grid-cols-1 gap-2.5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.35fr)]">
          {/* Requisition List */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-2.5">
              <h2 className="text-xs font-bold text-slate-900">Requisition List</h2>
              <div className="relative mt-2"><FiSearch className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, title, or department..." className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-7 pr-2 text-[11px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/10" /></div>
              <div className="mt-2 flex flex-wrap gap-1">
                {([['all', `All (${requisitions.length})`], ['action', `Needs Action (${needsActionCount})`], ['draft', `Draft (${draftCount})`], ['approved', `Approved (${approvedCount})`]] as const).map(([key, label]) => <button type="button" key={key} onClick={() => { setActiveTab('requisitions'); setListFilter(key); }} className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${listFilter === key ? 'bg-green-700 text-white shadow-sm' : 'border border-slate-300 bg-white text-slate-700 hover:border-green-400 hover:text-green-700'}`}>{label}</button>)}
              </div>
            </div>
            <div className="max-h-[400px] space-y-1.5 overflow-y-auto p-2">
              {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />) : filteredRequisitions.length === 0 ? <div className="px-4 py-10 text-center"><FiSearch className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No matching requisitions</p><p className="mt-1 text-[10px] text-slate-400">Try another search or filter.</p></div> : filteredRequisitions.map((r) => {
                const selected = selectedRequisition?.id === r.id;
                return <button type="button" key={r.id} onClick={() => handleView(r.id)} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${selected ? 'border-green-500 bg-green-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-green-300 hover:bg-slate-50'}`}>
                  <span className="w-[60px] shrink-0 text-[11px] font-bold text-slate-900">{r.requisitionId || '—'}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</span><span className="block truncate text-[10px] text-slate-500">{r.department?.name || 'Department not specified'}</span></span>
                  <span className="w-10 shrink-0"><span className="block text-[9px] text-slate-500">Open</span><span className="block text-[11px] font-bold text-slate-900">{r.numberOfOpenings}</span></span>
                  <span className="shrink-0"><span className={getPriorityBadge(r.priority)}><span className="capitalize">{r.priority}</span></span></span>
                  <span className="shrink-0"><span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span></span>
                </button>;
              })}
            </div>
          </div>

          {/* Requisition Detail */}
          <div id="view-panel" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {!selectedRequisition ? <div className="flex min-h-[440px] flex-col items-center justify-center p-6 text-center"><FiBriefcase className="h-8 w-8 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">Select a requisition</p><p className="mt-1 text-[10px] text-slate-400">Choose a request from the list to review its details and actions.</p></div> : (() => {
              const r = selectedRequisition;
              const stageIndex = r.approvalStatus === 'budget_approved' ? 3 : r.approvalStatus === 'hr_approved' ? 2 : r.approvalStatus === 'pending' ? 1 : 0;
              const isFailed = r.approvalStatus === 'rejected';
              const skillList = (r.skillsRequired || '').split(',').map(s => s.trim()).filter(Boolean);
              return <div className="p-3 sm:p-4">
                {/* Detail header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600"><FiFileText className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-900">{r.requisitionId || 'REQUISITION'}</p>
                      <h2 className="truncate text-base font-bold tracking-tight text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</h2>
                      <p className="mt-px text-[11px] text-slate-500">{r.department?.name || 'Department not specified'}</p>
                    </div>
                  </div>
                  <span className="shrink-0"><span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600"><span className="capitalize">{r.priority}</span> Priority</span></span>
                </div>

                {/* Mini stat tiles */}
                <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <StatTile label="Openings" value={String(r.numberOfOpenings)} icon={<FiUsers className="h-3.5 w-3.5 text-green-600" />} />
                  <StatTile label="Salary Budget" value={r.salaryBudget || 'Not specified'} icon={<FiDollarSign className="h-3.5 w-3.5 text-amber-500" />} />
                  <StatTile label="Closing Date" value={r.expectedJoiningDate ? new Date(r.expectedJoiningDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not specified'} icon={<FiCalendar className="h-3.5 w-3.5 text-green-600" />} />
                  <StatTile label="Interview Rounds" value={String(parseInterviewPlan(r.interviewPlan || '[]').length)} icon={<FiLayers className="h-3.5 w-3.5 text-green-600" />} />
                </div>

                {/* Required skills */}
                <div className="mt-2.5">
                  <h3 className="text-[11px] font-bold text-slate-900">Required Skills</h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skillList.length > 0 ? skillList.map((skill) => <span key={skill} className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">{skill}</span>) : <span className="text-[10px] text-slate-400">Not specified</span>}
                  </div>
                </div>

                {/* Approval timeline (horizontal compact strip, replaces tall vertical) */}
                <div className="mt-2.5">
                  <h3 className="text-[11px] font-bold text-slate-900">Approval Timeline</h3>
                  <div className="mt-1.5 flex items-center gap-1">
                    {['Submitted', 'HR Review', 'Finance', 'Job Posting'].map((label, index) => {
                      const done = index < stageIndex || (index === 3 && r.approvalStatus === 'budget_approved');
                      const current = index === stageIndex && r.approvalStatus !== 'budget_approved';
                      const isLast = index === 3;
                      return (
                        <div key={label} className="flex items-center gap-1 flex-1">
                          <div className="flex items-center gap-1">
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isFailed && current ? 'border-red-500 bg-red-50 text-red-600' : done ? 'border-green-600 bg-green-600 text-white' : current ? 'border-green-500 bg-white' : 'border-slate-300 bg-white'}`}>
                              {done ? <FiCheck className="h-2.5 w-2.5" /> : <span className={`h-1.5 w-1.5 rounded-full ${current ? 'bg-green-500' : 'bg-slate-200'}`} />}
                            </span>
                            <span className={`text-[9px] font-semibold ${current || done ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                          </div>
                          {!isLast && <span className={`h-px flex-1 ${done ? 'bg-green-500' : 'bg-slate-200'}`} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full details (toggled by View Full Details) */}
                {showFullDetails && (
                  <div className="mt-2.5 grid auto-rows-fr gap-2 border-t border-slate-100 pt-2.5 sm:grid-cols-2">
                    <DetailField label="Experience" value={r.experienceRequired || 'Not specified'} />
                    <DetailField label="Qualification" value={r.qualification || 'Not specified'} />
                    <DetailField label="Position Type" value={r.positionType || 'Not specified'} capitalize />
                    <DetailField label="Employment Type" value={r.employmentType || 'Not specified'} capitalize />
                  </div>
                )}

                {/* Approval history */}
                {approvalHistory.length > 0 && !showFullDetails && <details className="group mt-2.5 rounded-lg border border-slate-200 bg-slate-50"><summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><span>Approval history ({approvalHistory.length})</span><span className="text-slate-400 transition group-open:rotate-90">›</span></summary><div className="max-h-32 space-y-1.5 overflow-y-auto border-t border-slate-200 p-2">{approvalHistory.map((h) => <div key={h.id} className="rounded-md border border-slate-100 bg-white p-2 text-[10px]"><p className="text-slate-700">{h.details}</p><p className="mt-px text-slate-400">{new Date(h.createdAt).toLocaleString('en-IN')}</p></div>)}</div></details>}

                {/* Actions */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                  {(() => { const actions = detailActions(r); return actions.length > 0 ? actions : <span className="text-[11px] text-slate-400">No actions available for your role at this stage.</span>; })()}
                  <button type="button" onClick={() => setShowFullDetails((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-green-600 bg-white px-2.5 py-1 text-[11px] font-bold text-green-700 transition hover:bg-green-50">
                    <FiExternalLink className="h-3 w-3" />{showFullDetails ? 'Hide' : 'View Full Details'}
                  </button>
                  {(r.approvalStatus === 'draft' || r.approvalStatus === 'returned') && <button type="button" onClick={() => handleEdit(r)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"><FiEdit2 className="h-3 w-3" /> Edit</button>}
                  {r.approvalStatus === 'draft' && <button type="button" onClick={() => setDeleteConfirmId(r.id)} className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-50"><FiTrash2 className="h-3 w-3" /> Delete</button>}
                </div>
                {deleteConfirmId === r.id && <div className="mt-2 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] font-semibold text-red-700">Delete this draft requisition permanently?</p><div className="flex gap-1.5"><button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold">Cancel</button><button type="button" onClick={() => handleDelete(r.id)} disabled={deleting} className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete Draft'}</button></div></div>}
              </div>;
            })()}
          </div>
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
