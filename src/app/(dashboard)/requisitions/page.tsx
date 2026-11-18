'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiAlertCircle, FiEye, FiEdit2, FiTrash2,
  FiArrowLeft, FiRotateCcw, FiClock, FiSearch, FiBriefcase, FiCalendar,
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

// Task 164: user-facing status labels
function getApprovalLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending HR Approval',
    hr_approved: 'Pending Finance Approval',
    budget_approved: 'Approved',
    rejected: 'Rejected',
    returned: 'Returned for Correction',
  };
  return map[status] || status;
}

function getApprovalBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'thb-badge bg-slate-100 text-slate-600',
    pending: 'thb-badge thb-badge-warning',
    hr_approved: 'thb-badge thb-badge-purple',
    budget_approved: 'thb-badge thb-badge-success',
    rejected: 'thb-badge thb-badge-error',
    returned: 'thb-badge bg-amber-100 text-amber-700',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'thb-badge thb-badge-info',
    medium: 'thb-badge thb-badge-warning',
    high: 'thb-badge thb-badge-error',
    critical: 'thb-badge thb-badge-error',
  };
  return map[priority] || 'thb-badge thb-badge-info';
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'thb-badge bg-slate-100 text-slate-600',
    open: 'thb-badge thb-badge-info',
    approved: 'thb-badge thb-badge-success',
    cancelled: 'thb-badge thb-badge-error',
    closed: 'thb-badge thb-badge-primary',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-white/75 px-4 py-3 ring-1 ring-inset ring-emerald-100"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">{label}</p><p className="mt-1 break-words text-sm font-bold leading-5 text-slate-900" title={value}>{value}</p></div>;
}

function DetailField({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 break-words text-sm font-semibold leading-5 text-slate-700 ${capitalize ? 'capitalize' : ''}`}>{value}</p></div>;
}

export default function RequisitionsPage() {
  const { user } = useAuthStore();
  // C-30: company context store — single source of truth for which
  // company the user is operating in (their own company for non-admins,
  // or the company they picked in the company switcher for admins).
  // The requisition page now uses this for both:
  //   1. Resolving the companyId to attach to new requisitions
  //      (previously it incorrectly used user.tenantId, which is the
  //       TENANT/group id, not a single company id)
  //   2. Scoping the Department + Designation dropdowns to that company
  //      via scopeQuery() — same pattern as the ESS / Employees page.
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
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'action' | 'pending' | 'draft' | 'approved'>('all');
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; companyName?: string }>>([]);
  // C-30: designations now carry their departmentId so the dropdown can
  // be cascaded by the selected department (only show designations that
  // belong to the picked department). The previous implementation showed
  // ALL designations from ALL departments, which made the dropdown long
  // and confusing — the user expected a Department → Designation cascade
  // like in ESS.
  const [designations, setDesignations] = useState<Array<{ id: string; title: string; departmentId: string | null }>>([]);

  // C-30: scope dropdowns to the user's selected company (same source as
  // ESS / Employees page). Previously the requisition page called the APIs
  // with no companyId, which returned ALL departments from ALL companies in
  // the tenant — even with the C-29 dedup safety net, that included
  // unrelated companies' departments. Now we mirror the ESS pattern: read
  // scopeQuery() from the company context store and append it to the
  // department/designation fetch URLs.
  // (scopeQuery + effectiveCompanyId are destructured at the top of the
  //  component — see the comment block on the useCompanyContextStore call.)

  // Fetch departments + designations for the dropdowns, scoped to the
  // user's selected company. Re-fetches whenever the scope changes
  // (e.g. user picks a different company in the company switcher).
  const fetchDeptDesignations = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const scopeParam = sq ? `&${sq}` : '';
      // C-31: when no scope (tenant_admin with no company picked in the
      // switcher), pass `noDedupe=1` so ALL departments from ALL companies
      // are returned and the dropdown label can show the company suffix
      // (e.g. "Software Development — Acme Global") for disambiguation.
      // When a scope IS set, dedup is unnecessary (only one company's
      // departments are returned), so we don't pass noDedupe in that case.
      const noDedupeParam = sq ? '' : '&noDedupe=1';
      const [deptRes, desigRes] = await Promise.all([
        fetch(`/api/departments?limit=100${scopeParam}${noDedupeParam}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/designations?limit=100${scopeParam}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (deptRes?.ok) {
        const deptData = await deptRes.json();
        const deptList = deptData.departments || deptData.data || (Array.isArray(deptData) ? deptData : []);
        // C-31: when noDedupe was set on the API call, the server returns
        // ALL departments (with company names). We dedup CLIENT-SIDE by
        // (name + companyName) instead of just name — so "Engineering —
        // CompanyA" and "Engineering — CompanyB" both survive, but
        // "Engineering — CompanyA" appears only once even if it has two
        // rows. This keeps the dropdown free of true duplicates while
        // surfacing cross-company same-name departments.
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
          // designation.departmentId OR designation.department?.id — fall back to null
          const deptId = d.departmentId || d.department?.id || null;
          dedupedDesigs.push({ id: d.id, title: d.title, departmentId: deptId });
        }
        dedupedDesigs.sort((a, b) => a.title.localeCompare(b.title));
        setDesignations(dedupedDesigs);
      }
    } catch { /* non-fatal — fallback to text input */ }
  }, [scopeQuery]);

  // queueMicrotask defers the setState calls inside the async fetch, which
  // keeps the linter happy (matches the existing fetchData() pattern below)
  // while still firing on mount. Re-fetch when scope changes.
  useEffect(() => { queueMicrotask(() => fetchDeptDesignations()); }, [fetchDeptDesignations]);

  // C-30: cascade — when the user picks a department, only show the
  // designations that belong to that department. If no department is
  // selected, the designation dropdown stays empty (the user must pick
  // a department first), matching the ESS pattern.
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

  const handleAddNew = () => {
    setForm(initialForm);
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
    setEditingId(item.id);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  // Task 164: handle both 'draft' and 'submit' actions
  const handleSave = async (action: 'draft' | 'submit') => {
    if (!form.departmentId) { toast.error('Department is required'); return; }
    if (!form.designationId) { toast.error('Position/Designation is required'); return; }
    const interviewRounds = parseInterviewPlan(form.interviewPlan);
    if (interviewRounds.length === 0 || interviewRounds.some(round => !round.name.trim())) { toast.error('Add at least one interview round and enter a name for every round'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        // Update existing + optionally submit
        const res = await fetch(`/api/requisitions/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, action: action === 'submit' ? 'submit' : undefined }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success(action === 'draft' ? 'Draft saved' : 'Requisition submitted for HR approval');
      } else {
        // Create new
        const res = await fetch('/api/requisitions', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, companyId, action }),
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

  // Task 164: role-based approval actions
  const handleApproval = async (id: string, action: string) => {
    let comments = '';
    if (action === 'hr_reject' || action === 'finance_reject') {
      comments = window.prompt('Rejection reason (required):') || '';
      if (!comments.trim()) { toast.error('Rejection reason is required'); return; }
    } else if (action === 'return') {
      comments = window.prompt('Reason for returning (required):') || '';
      if (!comments.trim()) { toast.error('Reason is required'); return; }
    } else if (action === 'hr_approve' || action === 'finance_approve') {
      // Approval comments are optional. Do not use window.prompt here:
      // native prompts are blocked/undiscoverable in the embedded browser
      // and can prevent the approval PATCH from ever being sent.
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
    fetchHistory(id);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // Task 165: create job posting from an approved requisition
  const handleCreateJobPosting = async (r: Requisition) => {
    if (!isHr) { toast.error('Only HR can create job postings'); return; }
    if (r.approvalStatus !== 'budget_approved') { toast.error('Requisition must be fully approved'); return; }
    // Navigate to job-portal with pre-filled data from the requisition
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

  // Task 164: determine which approval buttons to show based on role + status
  const getApprovalButtons = (r: Requisition) => {
    const buttons: React.ReactNode[] = [];
    const isRequester = r.hiringManagerId === user?.id;

    // Requester can resubmit if returned
    if (isRequester && r.approvalStatus === 'returned') {
      buttons.push(
        <button key="resubmit" onClick={() => handleApproval(r.id, 'submit')} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex items-center gap-1">
          <FiRotateCcw className="w-3 h-3" />Resubmit
        </button>
      );
    }

    // HR can approve/reject/return when pending
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

    // Finance can approve/reject when hr_approved
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

    // Task 165: HR can create job posting from approved requisition
    if (isHr && r.approvalStatus === 'budget_approved') {
      buttons.push(
        <button key="create_job" onClick={() => handleCreateJobPosting(r)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700">
          <FiPlus className="h-4 w-4" />Create Job Posting
        </button>
      );
    }

    return buttons.length > 0 ? <div className="flex items-center gap-1">{buttons}</div> : <span className="text-xs text-thb-text-muted">—</span>;
  };

  const colCount = 10;

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
      const matchesFilter = listFilter === 'all'
        || (listFilter === 'action' && needsAction(r))
        || (listFilter === 'pending' && ['pending', 'hr_approved'].includes(r.approvalStatus))
        || (listFilter === 'draft' && ['draft', 'returned'].includes(r.approvalStatus))
        || (listFilter === 'approved' && r.approvalStatus === 'budget_approved');
      return matchesSearch && matchesFilter;
    });
  }, [listFilter, needsAction, requisitions, search]);

  const selectedRequisition = requisitions.find((r) => r.id === viewingId) || filteredRequisitions[0] || null;
  const inApprovalCount = requisitions.filter((r) => ['pending', 'hr_approved'].includes(r.approvalStatus)).length;
  const approvedCount = requisitions.filter((r) => r.approvalStatus === 'budget_approved').length;
  const needsActionCount = requisitions.filter(needsAction).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Manpower Requisitions</h1>
          <p className="text-thb-text-secondary mt-1">Raise and approve hiring requests</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm shadow-sm shadow-green-500/25 transition-colors">
            <FiPlus className="w-4 h-4" /> Raise Requisition
          </button>
        </div>
      </div>

      {/* Master-detail requisition workspace */}
      <section className="space-y-5" aria-label="Requisition workspace">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => setListFilter('action')} className="group flex items-center justify-between rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span><span className="block text-xs font-semibold uppercase tracking-wider text-emerald-700">Needs My Action</span><span className="mt-1 block text-2xl font-bold text-slate-900">{needsActionCount}</span></span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FiCheck className="h-5 w-5" /></span>
          </button>
          <button type="button" onClick={() => setListFilter('pending')} className="group flex items-center justify-between rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span><span className="block text-xs font-semibold uppercase tracking-wider text-amber-700">Pending Approvals</span><span className="mt-1 block text-2xl font-bold text-slate-900">{inApprovalCount}</span></span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><FiClock className="h-5 w-5" /></span>
          </button>
          <button type="button" onClick={() => setListFilter('approved')} className="group flex items-center justify-between rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span><span className="block text-xs font-semibold uppercase tracking-wider text-blue-700">Approved</span><span className="mt-1 block text-2xl font-bold text-slate-900">{approvedCount}</span></span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><FiCalendar className="h-5 w-5" /></span>
          </button>
        </div>

        <div className="grid min-h-[640px] grid-cols-1 gap-5 xl:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.45fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Requisition List</h2><span className="text-xs font-medium text-slate-500">{filteredRequisitions.length} of {requisitions.length}</span></div>
              <div className="relative mt-3"><FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Req ID, job title, or department" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {([['all', 'All'], ['action', 'Needs Action'], ['pending', 'Pending Approval'], ['draft', 'Draft'], ['approved', 'Approved']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setListFilter(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${listFilter === key ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
              </div>
            </div>
            <div className="max-h-[530px] space-y-2 overflow-y-auto p-3">
              {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />) : filteredRequisitions.length === 0 ? <div className="px-5 py-16 text-center"><FiSearch className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No matching requisitions</p><p className="mt-1 text-xs text-slate-400">Try another search or filter.</p></div> : filteredRequisitions.map((r) => {
                const selected = selectedRequisition?.id === r.id;
                return <button type="button" key={r.id} onClick={() => handleView(r.id)} className={`w-full rounded-xl border p-4 text-left transition ${selected ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-500/10' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-semibold text-slate-500">{r.requisitionId || '—'}</p><h3 className="mt-1 truncate text-sm font-bold text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{r.department?.name || 'Department not specified'}</p></div><span className={getPriorityBadge(r.priority)}>{r.priority}</span></div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span><span className="text-[11px] font-medium text-slate-500">{r.numberOfOpenings} opening{r.numberOfOpenings === 1 ? '' : 's'}</span></div>
                </button>;
              })}
            </div>
          </div>

          <div id="view-panel" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!selectedRequisition ? <div className="flex min-h-[600px] flex-col items-center justify-center p-8 text-center"><FiBriefcase className="h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Select a requisition</p><p className="mt-1 text-xs text-slate-400">Choose a request from the list to review its details and actions.</p></div> : (() => {
              const r = selectedRequisition;
              const stageIndex = r.approvalStatus === 'budget_approved' ? 3 : r.approvalStatus === 'hr_approved' ? 2 : r.approvalStatus === 'pending' ? 1 : 0;
              const isFailed = r.approvalStatus === 'rejected';
              return <div className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><span className="inline-flex rounded-lg bg-emerald-100 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">{r.requisitionId || 'REQUISITION'}</span><h2 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{r.designation?.title || r.positionTitle || 'Position not specified'}</h2><p className="mt-1 text-sm text-slate-500">{r.department?.name || 'Department not specified'} · <span className="capitalize">{r.employmentType}</span></p></div>
                  <span className={getPriorityBadge(r.priority)}>{r.priority} priority</span>
                </div>

                <div className="my-5 grid grid-cols-1 gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-4 sm:grid-cols-2 2xl:grid-cols-4">
                  <InfoMetric label="Openings" value={String(r.numberOfOpenings)} />
                  <InfoMetric label="Salary Budget" value={r.salaryBudget || 'Not specified'} />
                  <InfoMetric label="Closing Date" value={r.expectedJoiningDate ? new Date(r.expectedJoiningDate).toLocaleDateString('en-IN') : 'Not specified'} />
                  <InfoMetric label="Interview Rounds" value={String(parseInterviewPlan(r.interviewPlan || '[]').length)} />
                </div>

                <div className="grid auto-rows-fr gap-3 border-b border-slate-100 pb-5 sm:grid-cols-2">
                  <DetailField label="Required Skills" value={r.skillsRequired || 'Not specified'} />
                  <DetailField label="Experience" value={r.experienceRequired || 'Not specified'} />
                  <DetailField label="Qualification" value={r.qualification || 'Not specified'} />
                  <DetailField label="Position Type" value={r.positionType || 'Not specified'} capitalize />
                </div>

                <div className="py-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold text-slate-900">Approval Timeline</h3><span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span></div>
                  <div className="mt-5 overflow-x-auto pb-1">
                    <div className="grid min-w-[560px] grid-cols-4 gap-0 px-2">
                    {['Request Submitted', 'HR Review', 'Finance Review', 'Job Posting'].map((label, index) => { const done = index <= stageIndex && !isFailed; const active = index === stageIndex && r.approvalStatus !== 'budget_approved'; return <div key={label} className="relative px-2 text-center"><div className={`absolute left-1/2 top-5 h-0.5 w-full ${index === 3 ? 'hidden' : done && index < stageIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} /><span className={`relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm ${isFailed && index === stageIndex ? 'border-red-500 bg-red-50 text-red-600' : done ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-slate-300 bg-white text-slate-400'}`}>{done ? <FiCheck /> : index + 1}</span><p className={`mt-2 min-h-8 text-[11px] font-semibold leading-4 ${active ? 'text-amber-700' : done ? 'text-slate-800' : 'text-slate-400'}`}>{label}</p></div>; })}
                    </div>
                  </div>
                </div>

                {approvalHistory.length > 0 && <details className="group rounded-xl border border-slate-200 bg-slate-50"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700"><span>Approval history ({approvalHistory.length})</span><span className="text-slate-400 transition group-open:rotate-90">›</span></summary><div className="max-h-44 space-y-2 overflow-y-auto border-t border-slate-200 p-3">{approvalHistory.map((h) => <div key={h.id} className="rounded-lg border border-slate-100 bg-white p-3 text-xs"><p className="text-slate-700">{h.details}</p><p className="mt-1 text-slate-400">{new Date(h.createdAt).toLocaleString('en-IN')}</p></div>)}</div></details>}

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-5">{getApprovalButtons(r)}{(r.approvalStatus === 'draft' || r.approvalStatus === 'returned') && <button type="button" onClick={() => handleEdit(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FiEdit2 /> Edit</button>}{r.approvalStatus === 'draft' && <button type="button" onClick={() => setDeleteConfirmId(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><FiTrash2 /> Delete</button>}</div>
                {deleteConfirmId === r.id && <div className="mt-3 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold text-red-700">Delete this draft requisition permanently?</p><div className="flex gap-2"><button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">Cancel</button><button type="button" onClick={() => handleDelete(r.id)} disabled={deleting} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete Draft'}</button></div></div>}
              </div>;
            })()}
          </div>
        </div>
      </section>

      {/* View Panel */}
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

              {/* Approval History */}
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

              {/* Role-based approval buttons */}
              <div className="mt-6 pt-4 border-t border-thb-border">
                <h3 className="text-sm font-semibold text-thb-text-primary mb-3">Actions</h3>
                {getApprovalButtons(item)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 shadow-xl shadow-slate-200/40">
          <div className="border-b border-slate-200 bg-gradient-to-r from-white via-white to-emerald-50/60 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    {editingId ? 'Edit Requisition' : 'Raise New Requisition'}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                    <FiEdit2 className="h-3.5 w-3.5" /> {editingId ? 'Editing' : 'Draft'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-500">Create a hiring request with role details, requirements, budget and a position-specific interview plan.</p>
              </div>
              <button onClick={handleCancelForm} className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 hover:shadow-sm" aria-label="Close requisition form"><FiX className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><FiAlertCircle className="h-4 w-4" /></span>
              Required fields are marked with <span className="font-bold text-red-500">*</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:text-sm">
              <span className="mr-1 text-slate-600">Approval Path:</span>
              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">HR</span>
              <span className="text-slate-400">→</span>
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700 ring-1 ring-amber-100">Finance</span>
              <span className="text-slate-400">→</span>
              <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100">Job Posting</span>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FiBriefcase className="h-5 w-5" /></span>
                <div><h3 className="text-lg font-bold text-slate-900">Role &amp; Position</h3><p className="text-xs text-slate-500 sm:text-sm">Define the department, designation and position details.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Department <span className="text-red-500 font-bold">*</span></label>
                {departments.length > 0 ? (
                  <select
                    required
                    value={form.departmentId}
                    onChange={(e) => {
                      // C-30: cascade — when department changes, clear any
                      // previously-picked designation that no longer belongs
                      // to the new department. This keeps the form state
                      // consistent with the visible (filtered) dropdown.
                      const newDeptId = e.target.value;
                      const stillValid = visibleDesignations.some(d => d.id === form.designationId);
                      setForm({
                        ...form,
                        departmentId: newDeptId,
                        designationId: stillValid ? form.designationId : '',
                        positionTitle: stillValid ? form.positionTitle : '',
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                  >
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.companyName ? ` — ${d.companyName}` : ''}</option>)}
                  </select>
                ) : (
                  <input required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} placeholder="Department name" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Position / Designation <span className="text-red-500 font-bold">*</span></label>
                {designations.length > 0 ? (
                  <select
                    value={form.designationId}
                    disabled={!form.departmentId}
                    onChange={(e) => {
                      const desig = visibleDesignations.find(d => d.id === e.target.value);
                      setForm({ ...form, designationId: e.target.value, positionTitle: desig?.title || form.positionTitle });
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 disabled:bg-slate-50 disabled:text-thb-text-muted disabled:cursor-not-allowed"
                  >
                    <option value="">{form.departmentId ? 'Select designation…' : 'Pick a department first…'}</option>
                    {visibleDesignations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                ) : (
                  <input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value, designationId: e.target.value })} placeholder="e.g. Data Engineer 2" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                )}
                {form.departmentId && visibleDesignations.length === 0 && designations.length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">No designations configured for this department yet.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Position Type</label>
                <select value={form.positionType} onChange={(e) => setForm({ ...form, positionType: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  <option value="new">New</option>
                  <option value="replacement">Replacement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Number of Vacancies</label>
                <input type="number" min={1} value={form.numberOfOpenings} onChange={(e) => setForm({ ...form, numberOfOpenings: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Employment Type</label>
                <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FiCalendar className="h-5 w-5" /></span>
                <div><h3 className="text-lg font-bold text-slate-900">Requirements &amp; Budget</h3><p className="text-xs text-slate-500 sm:text-sm">Capture compensation, skills, experience and closing details.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Salary Range / Budget</label>
                <input value={form.salaryBudget} onChange={(e) => setForm({ ...form, salaryBudget: e.target.value })} placeholder="e.g. 500000-700000 INR/year" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Required Skills</label>
                <input value={form.skillsRequired} onChange={(e) => setForm({ ...form, skillsRequired: e.target.value })} placeholder="e.g. React, Node.js, Python, PostgreSQL" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Experience Required</label>
                <input value={form.experienceRequired} onChange={(e) => setForm({ ...form, experienceRequired: e.target.value })} placeholder="e.g. 3-5 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Qualification</label>
                <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. B.Tech / M.Tech" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Position Closing Date</label>
                <input type="date" value={form.expectedJoiningDate} onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                <p className="text-[10px] text-thb-text-muted mt-1">The linked job posting will automatically close when this date is reached.</p>
              </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FiClock className="h-5 w-5" /></span>
                  <div><h3 className="text-lg font-bold text-slate-900">Interview Rounds <span className="text-red-500">*</span></h3><p className="text-xs text-slate-500 sm:text-sm">Define and order the interview rounds for this position.</p></div>
                </div>
                <button type="button" onClick={() => { const rows = parseInterviewPlan(form.interviewPlan); setForm({ ...form, interviewPlan: serializeInterviewPlan([...rows, { name: '', type: 'technical' }]) }); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"><FiPlus className="h-4 w-4" /> Add Round</button>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="hidden grid-cols-[52px_minmax(0,1fr)_minmax(180px,0.65fr)_76px] gap-3 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid"><span>#</span><span>Round Name</span><span>Interview Type</span><span className="text-center">Action</span></div>
                <div className="divide-y divide-slate-100">{parseInterviewPlan(form.interviewPlan).map((row, i, rows) => <div key={i} className="grid grid-cols-1 items-center gap-2 p-3 sm:grid-cols-[52px_minmax(0,1fr)_minmax(180px,0.65fr)_76px] sm:gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">{i + 1}</span><input required value={row.name} placeholder="Enter round name" onChange={e => { const next = [...rows]; next[i] = { ...row, name: e.target.value }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }} className="min-w-0 rounded-lg border border-thb-border px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" aria-label={`Round ${i + 1} name`} /><select value={row.type} onChange={e => { const next = [...rows]; next[i] = { ...row, type: e.target.value as InterviewPlanRow['type'] }; setForm({ ...form, interviewPlan: serializeInterviewPlan(next) }); }} className="rounded-lg border border-thb-border px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" aria-label={`Round ${i + 1} type`}><option value="technical">Technical</option><option value="hr">HR</option><option value="client">Client</option><option value="ai">AI</option></select><button type="button" onClick={() => setForm({ ...form, interviewPlan: serializeInterviewPlan(rows.filter((_, index) => index !== i)) })} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2.5 text-red-600 transition hover:bg-red-50" aria-label={`Remove round ${i + 1}`}><FiTrash2 className="h-4 w-4" /></button></div>)}</div>
                {parseInterviewPlan(form.interviewPlan).length === 0 && <div className="m-3 rounded-lg border border-dashed border-red-200 bg-red-50 p-5 text-center text-xs text-red-700">No interview rounds configured. Click <b>Add Round</b> and enter a round name.</div>}
              </div>
              <p className="mt-3 text-xs text-slate-500">{parseInterviewPlan(form.interviewPlan).length} round(s) configured. At least one named round is required.</p>
            </section>
          </div>
            {/* Task 164: Save as Draft + Submit for Approval */}
            <div className="sticky bottom-0 z-10 flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center">
              <button onClick={handleCancelForm} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleSave('draft')} disabled={submitting} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">{submitting ? 'Saving...' : 'Save as Draft'}</button>
              <button onClick={() => handleSave('submit')} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:opacity-50"><FiCheck className="h-4 w-4" /> {submitting ? 'Saving...' : 'Submit for Approval'}</button>
            </div>
        </div>
      )}

      {/* Table */}
      <div className="hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approval pipeline</p>
          <p className="mt-0.5 text-sm font-medium text-slate-700">HR review <span className="mx-1 text-slate-300">→</span> Finance review <span className="mx-1 text-slate-300">→</span> Job posting</p>
        </div>
        <div className="hidden items-center gap-2 text-[11px] font-semibold sm:flex">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">Pending</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">Approved</span>
        </div>
      </div>
      <div className="hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-thb-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Req ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Position</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Openings</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Approval Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Workflow</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : requisitions.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <FiAlertCircle className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                    <p className="text-thb-text-secondary font-medium">No requisitions found</p>
                    <p className="text-sm text-thb-text-muted mt-1">Raise your first requisition to get started</p>
                  </td>
                </tr>
              ) : (
                requisitions.map((r) => (
                  <tr key={r.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === r.id ? (
                      <td colSpan={colCount} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this requisition?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(r.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-mono text-thb-text-secondary">{r.requisitionId?.slice(0, 8) || '—'}</td>
                        <td className="px-4 py-3 text-sm text-thb-text-primary">{r.department?.name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-thb-text-primary">{r.designation?.title || '—'}</td>
                        <td className="px-4 py-3 text-sm text-thb-text-primary">{r.numberOfOpenings}</td>
                        <td className="px-4 py-3"><span className="thb-badge thb-badge-primary">{r.employmentType}</span></td>
                        <td className="px-4 py-3"><span className={getPriorityBadge(r.priority)}>{r.priority}</span></td>
                        <td className="px-4 py-3"><span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span></td>
                        <td className="px-4 py-3"><span className={getStatusBadge(r.status)}>{r.status}</span></td>
                        <td className="px-4 py-3">{getApprovalButtons(r)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleView(r.id)} className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {(r.approvalStatus === 'draft' || r.approvalStatus === 'returned') && (
                              <button onClick={() => handleEdit(r)} className="p-2 rounded-lg text-thb-text-muted hover:text-green-500 hover:bg-green-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                            )}
                            {r.approvalStatus === 'draft' && (
                              <button onClick={() => setDeleteConfirmId(r.id)} className="p-2 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact mobile layout: keeps approval status and actions visible without horizontal scrolling. */}
      <div className="hidden">
        {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />) : requisitions.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold text-slate-500">{r.requisitionId || '—'}</p>
                <h3 className="mt-1 truncate text-sm font-semibold text-slate-800">{r.designation?.title || r.positionTitle || 'Position not specified'}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{r.department?.name || 'Department not specified'} · {r.numberOfOpenings} opening{r.numberOfOpenings === 1 ? '' : 's'}</p>
              </div>
              <span className={getPriorityBadge(r.priority)}>{r.priority}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span>
              <span className={getStatusBadge(r.status)}>{r.status}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">{getApprovalButtons(r)}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleView(r.id)} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="View"><FiEye className="h-4 w-4" /></button>
                {(r.approvalStatus === 'draft' || r.approvalStatus === 'returned') && <button onClick={() => handleEdit(r)} className="rounded-lg p-2 text-slate-500 hover:bg-green-50 hover:text-green-600" title="Edit"><FiEdit2 className="h-4 w-4" /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
