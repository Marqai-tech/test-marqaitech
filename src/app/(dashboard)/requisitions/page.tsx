'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiAlertCircle, FiEye, FiEdit2, FiTrash2,
  FiArrowLeft, FiRotateCcw, FiClock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Requisition {
  id: string; requisitionId: string; positionType: string; numberOfOpenings: number; employmentType: string; priority: string; approvalStatus: string; status: string; skillsRequired: string | null; experienceRequired: string | null; qualification: string | null; salaryBudget: string | null; expectedJoiningDate: string | null; companyId?: string; hiringManagerId?: string; positionTitle?: string;
  department?: { id?: string; name: string } | null; designation?: { id?: string; title: string } | null;
}

interface ApprovalHistoryEntry {
  id: string; action: string; module: string; details: string; createdAt: string;
  user?: { name?: string; email?: string } | null;
}

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

const requisitionsTips = [
  { title: 'Job Requisition Approval', description: 'All requisitions follow: Manager submits → HR approves → Finance approves → Approved. The Manager is the requester, not an approver.' },
  { title: 'Budget Alignment', description: 'Ensure salary budgets in requisitions align with approved departmental budgets and grade-level ranges.' },
  { title: 'Timeline Planning', description: 'Set realistic expected joining dates accounting for notice periods and the interview pipeline duration.' },
  { title: 'Priority Levels', description: 'Use priority levels (Low, Medium, High, Critical) to signal urgency and influence recruitment timelines.' },
];

const requisitionsWorkflowSteps = [
  { step: 1, title: 'Create Requisition', description: 'Manager fills role details (dept, position, vacancies, salary, skills, reason)' },
  { step: 2, title: 'Submit for HR Approval', description: 'Manager submits — HR gets notified to review' },
  { step: 3, title: 'HR Review', description: 'HR approves, rejects, or returns for correction' },
  { step: 4, title: 'Finance/Budget Approval', description: 'After HR approves, Finance reviews the budget' },
  { step: 5, title: 'Fully Approved', description: 'Requisition is approved — ready for job posting' },
  { step: 6, title: 'Create Job Posting', description: 'HR creates a job posting from the approved requisition' },
];

const initialForm = {
  departmentId: '', designationId: '', positionTitle: '', positionType: 'new', numberOfOpenings: 1, employmentType: 'full-time', skillsRequired: '', experienceRequired: '', qualification: '', salaryBudget: '', priority: 'medium', expectedJoiningDate: '', reason: '',
};

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

export default function RequisitionsPage() {
  const { user } = useAuthStore();
  const companyId = user?.tenantId || '';
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
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  // Department + Designation dropdowns: fetched from the DB so the manager
  // selects a valid record instead of typing free text that may not match.
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string }>>([]);

  // Fetch departments + designations for the dropdowns.
  const fetchDeptDesignations = useCallback(async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        fetch('/api/departments?limit=100', { headers: getAuthHeaders() }).catch(() => null),
        fetch('/api/designations?limit=100', { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (deptRes?.ok) {
        const deptData = await deptRes.json();
        const deptList = deptData.departments || deptData.data || (Array.isArray(deptData) ? deptData : []);
        setDepartments(deptList.map((d: any) => ({ id: d.id, name: d.name })));
      }
    } catch { /* non-fatal — fallback to text input */ }
    try {
      if (desigRes?.ok) {
        const desigData = await desigRes.json();
        const desigList = desigData.designations || desigData.data || (Array.isArray(desigData) ? desigData : []);
        setDesignations(desigList.map((d: any) => ({ id: d.id, title: d.title })));
      }
    } catch { /* non-fatal — fallback to text input */ }
  }, []);

  useEffect(() => { fetchDeptDesignations(); }, [fetchDeptDesignations]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/requisitions?limit=100${scope === 'mine' ? '&scope=mine' : ''}`, { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setRequisitions(Array.isArray(data) ? data : data.requisitions || []); }
    } catch { toast.error('Failed to load requisitions'); }
    finally { setLoading(false); }
  }, [scope]);

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
    if (action === 'submit' && !form.reason) { toast.error('Reason for hiring is required to submit'); return; }
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
      comments = window.prompt('Comments (optional):') || '';
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
        <button key="create_job" onClick={() => handleCreateJobPosting(r)} className="px-2 py-1 text-xs font-medium text-violet-700 bg-violet-50 rounded hover:bg-violet-100 flex items-center gap-1">
          <FiPlus className="w-3 h-3" />Create Job Posting
        </button>
      );
    }

    return buttons.length > 0 ? <div className="flex items-center gap-1">{buttons}</div> : <span className="text-xs text-thb-text-muted">—</span>;
  };

  const colCount = 10;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Manpower Requisitions</h1>
          <p className="text-thb-text-secondary mt-1">Raise and approve hiring requests</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Task 164: scope filter */}
          <button onClick={() => setScope(scope === 'all' ? 'mine' : 'all')} className="px-3 py-2 rounded-lg border border-thb-border text-xs font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            {scope === 'all' ? 'All Requests' : 'My Requests'}
          </button>
          <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm shadow-sm shadow-green-500/25 transition-colors">
            <FiPlus className="w-4 h-4" /> Raise Requisition
          </button>
        </div>
      </div>

      <ModuleTips moduleKey="requisitions" title="Requisition Tips" tips={requisitionsTips} userRole={user?.role} />
      <ModuleWorkflow moduleKey="requisitions" title="How to Process Job Requisitions" subtitle="Follow this workflow to manage hiring requests" steps={requisitionsWorkflowSteps} accentColor="violet" userRole={user?.role} />

      {/* View Panel */}
      {viewingId && (() => {
        const item = requisitions.find(i => i.id === viewingId);
        if (!item) return null;
        return (
          <div id="view-panel" className="thb-card border-l-4 border-l-emerald-500">
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
                <div><span className="text-xs font-medium text-thb-text-secondary">Expected Joining</span><p className="text-sm font-medium text-thb-text-primary mt-0.5">{item.expectedJoiningDate ? new Date(item.expectedJoiningDate).toLocaleDateString() : '—'}</p></div>
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
        <div id="crud-form" className="thb-card border-l-4 border-l-green-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">
                {editingId ? 'Edit Requisition' : 'Raise New Requisition'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Department <span className="text-red-500 font-bold">*</span></label>
                {departments.length > 0 ? (
                  <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : (
                  <input required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} placeholder="Department name" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Position / Designation</label>
                {designations.length > 0 ? (
                  <select value={form.designationId} onChange={(e) => { const desig = designations.find(d => d.id === e.target.value); setForm({ ...form, designationId: e.target.value, positionTitle: desig?.title || form.positionTitle }); }} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                    <option value="">Select designation…</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                ) : (
                  <input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value, designationId: e.target.value })} placeholder="e.g. Data Engineer 2" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
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
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Salary Range / Budget</label>
                <input value={form.salaryBudget} onChange={(e) => setForm({ ...form, salaryBudget: e.target.value })} placeholder="e.g. 500000-700000 INR/year" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
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
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Expected Joining Date</label>
                <input type="date" value={form.expectedJoiningDate} onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              {/* Task 164: reason field */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Hiring <span className="text-red-500 font-bold">*</span> <span className="text-thb-text-muted">(required to submit)</span></label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Need additional developer for the new product launch in Q1 2027" rows={2} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
            </div>
            {/* Task 164: Save as Draft + Submit for Approval */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => handleSave('draft')} disabled={submitting} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 disabled:opacity-50 transition-colors">{submitting ? 'Saving...' : 'Save as Draft'}</button>
              <button onClick={() => handleSave('submit')} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm shadow-green-500/25 transition-colors">{submitting ? 'Saving...' : 'Submit for Approval'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="thb-card overflow-hidden">
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
    </div>
  );
}
