'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiTrendingUp,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiStar,
  FiUser,
  FiMessageSquare,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewCycle: string;
  reviewPeriod?: string | null;
  reviewerId?: string | null;
  rating: number;
  goalsRating: number;
  skillsRating: number;
  behaviorRating: number;
  overallRating: number;
  comments?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  status: string;
  reviewDate?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    avatar?: string | null;
  } | null;
  reviewer?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    in_review: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
    acknowledged: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  const labels: Record<string, string> = { pending: 'Pending', in_review: 'In Review', completed: 'Completed', acknowledged: 'Acknowledged' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function StarDisplay({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <FiStar
          key={i}
          className={`w-3.5 h-3.5 ${i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
        />
      ))}
      <span className="text-xs text-nexus-text-muted ml-1">({rating.toFixed(1)})</span>
    </div>
  );
}

function RatingSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
      >
        {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => (
          <option key={v} value={v}>{v} - {v === 0 ? 'N/A' : v <= 1 ? 'Poor' : v <= 2 ? 'Below Average' : v <= 3 ? 'Average' : v <= 4 ? 'Good' : 'Excellent'}</option>
        ))}
      </select>
    </div>
  );
}

const initialForm = {
  employeeId: '',
  reviewerId: '',
  reviewCycle: '',
  reviewPeriod: '',
  goalsRating: '3',
  skillsRating: '3',
  behaviorRating: '3',
  overallRating: '3',
  comments: '',
  strengths: '',
  improvements: '',
  status: 'pending',
};

/* ── Component ── */
export default function PerformancePage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<PerformanceReview | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCycle, setFilterCycle] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCycle) params.set('reviewCycle', filterCycle);
      params.set('limit', '50');

      const [reviewRes, empRes] = await Promise.allSettled([
        fetch(`/api/performance?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (reviewRes.status === 'fulfilled' && reviewRes.value.ok) {
        const data = await reviewRes.value.json();
        setReviews(data.reviews || data.performanceReviews || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCycle]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Open Add Form */
  const handleOpenAddForm = () => {
    setEditingId(null);
    setViewingId(null);
    setViewingRecord(null);
    setForm(initialForm);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (record: PerformanceReview) => {
    setViewingId(record.id);
    setViewingRecord(record);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  /* Open Edit Form */
  const handleOpenEditForm = (r: PerformanceReview) => {
    setEditingId(r.id);
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      employeeId: r.employeeId,
      reviewerId: r.reviewerId || '',
      reviewCycle: r.reviewCycle,
      reviewPeriod: r.reviewPeriod || '',
      goalsRating: String(r.goalsRating),
      skillsRating: String(r.skillsRating),
      behaviorRating: String(r.behaviorRating),
      overallRating: String(r.overallRating),
      comments: r.comments || '',
      strengths: r.strengths || '',
      improvements: r.improvements || '',
      status: r.status,
    });
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  /* Create / Update Review */
  const handleSave = async () => {
    if (!form.employeeId || !form.reviewCycle) {
      toast.error('Please fill in required fields: Employee, Review Cycle');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        employeeId: form.employeeId,
        reviewerId: form.reviewerId || null,
        reviewCycle: form.reviewCycle,
        reviewPeriod: form.reviewPeriod || null,
        goalsRating: parseFloat(form.goalsRating) || 0,
        skillsRating: parseFloat(form.skillsRating) || 0,
        behaviorRating: parseFloat(form.behaviorRating) || 0,
        overallRating: parseFloat(form.overallRating) || 0,
        comments: form.comments || null,
        strengths: form.strengths || null,
        improvements: form.improvements || null,
        status: form.status,
      };

      if (editingId) {
        const res = await fetch(`/api/performance/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Performance review updated successfully');
      } else {
        const res = await fetch('/api/performance', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Performance review created successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save performance review');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete Review */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/performance/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Performance review deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete performance review');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtered reviews */
  const filteredReviews = reviews.filter(r => {
    if (!search) return true;
    const empName = `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.toLowerCase();
    const revName = `${r.reviewer?.firstName || ''} ${r.reviewer?.lastName || ''}`.toLowerCase();
    const q = search.toLowerCase();
    return empName.includes(q) || revName.includes(q) || (r.reviewCycle || '').toLowerCase().includes(q);
  });

  /* Unique review cycles for filter */
  const reviewCycles = Array.from(new Set(reviews.map(r => r.reviewCycle).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiTrendingUp className="w-6 h-6 text-amber-500" />
            Performance
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage employee performance reviews</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Create Review
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input
              type="text"
              placeholder="Search by employee, reviewer, or cycle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="completed">Completed</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
            <select value={filterCycle} onChange={e => setFilterCycle(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Cycles</option>
              {reviewCycles.map(c => <option key={c} value={c}>{c}</option>)}
              {reviewCycles.length === 0 && (
                <>
                  <option value="Q1 2025">Q1 2025</option>
                  <option value="Q2 2025">Q2 2025</option>
                  <option value="Annual 2025">Annual 2025</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Embedded Form (Add/Edit) */}
      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Performance Review
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Reviewer</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.reviewer ? `${viewingRecord.reviewer.firstName} ${viewingRecord.reviewer.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Review Cycle</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.reviewCycle}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Review Period</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.reviewPeriod || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Goals Rating</p>
                <p className="text-sm text-nexus-text-primary"><StarDisplay rating={viewingRecord.goalsRating} /></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Skills Rating</p>
                <p className="text-sm text-nexus-text-primary"><StarDisplay rating={viewingRecord.skillsRating} /></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Behavior Rating</p>
                <p className="text-sm text-nexus-text-primary"><StarDisplay rating={viewingRecord.behaviorRating} /></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Overall Rating</p>
                <p className="text-sm text-nexus-text-primary"><StarDisplay rating={viewingRecord.overallRating} /></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status).className}>{getStatusBadge(viewingRecord.status).label}</span></p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Comments</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.comments || '—'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Strengths</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.strengths || '—'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Areas for Improvement</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.improvements || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { handleOpenEditForm(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                <FiEdit2 className="w-4 h-4 inline mr-1" /> Edit
              </button>
              <button onClick={handleCloseView} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 transition-all duration-300 ease-in-out ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Performance Review' : 'Create Performance Review'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Employee & Reviewer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                  <select
                    value={form.employeeId}
                    onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                    disabled={!!editingId}
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted"
                  >
                    <option value="">Select Employee</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reviewer</label>
                  <select
                    value={form.reviewerId}
                    onChange={e => setForm(p => ({ ...p, reviewerId: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    <option value="">Select Reviewer</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cycle & Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Review Cycle *</label>
                  <input
                    type="text"
                    value={form.reviewCycle}
                    onChange={e => setForm(p => ({ ...p, reviewCycle: e.target.value }))}
                    placeholder="e.g., Q1 2025, Annual 2025"
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Review Period</label>
                  <input
                    type="text"
                    value={form.reviewPeriod}
                    onChange={e => setForm(p => ({ ...p, reviewPeriod: e.target.value }))}
                    placeholder="e.g., Jan - Mar 2025"
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Ratings */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                  <FiStar className="w-4 h-4 text-amber-400" /> Ratings
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <RatingSelect label="Goals Rating" value={parseFloat(form.goalsRating)} onChange={v => setForm(p => ({ ...p, goalsRating: String(v) }))} />
                  <RatingSelect label="Skills Rating" value={parseFloat(form.skillsRating)} onChange={v => setForm(p => ({ ...p, skillsRating: String(v) }))} />
                  <RatingSelect label="Behavior Rating" value={parseFloat(form.behaviorRating)} onChange={v => setForm(p => ({ ...p, behaviorRating: String(v) }))} />
                  <RatingSelect label="Overall Rating" value={parseFloat(form.overallRating)} onChange={v => setForm(p => ({ ...p, overallRating: String(v) }))} />
                </div>
              </div>

              {/* Comments & Feedback */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                  <FiMessageSquare className="w-4 h-4 text-blue-500" /> Feedback
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Comments</label>
                    <textarea
                      rows={3}
                      value={form.comments}
                      onChange={e => setForm(p => ({ ...p, comments: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                      placeholder="General comments about the review..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Strengths</label>
                      <textarea
                        rows={3}
                        value={form.strengths}
                        onChange={e => setForm(p => ({ ...p, strengths: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                        placeholder="Key strengths identified..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Areas for Improvement</label>
                      <textarea
                        rows={3}
                        value={form.improvements}
                        onChange={e => setForm(p => ({ ...p, improvements: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                        placeholder="Areas that need improvement..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status (only on edit) */}
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="pending">Pending</option>
                    <option value="in_review">In Review</option>
                    <option value="completed">Completed</option>
                    <option value="acknowledged">Acknowledged</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submitting ? 'Saving...' : editingId ? 'Update Review' : 'Create Review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Reviews Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Reviewer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Cycle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Overall Rating</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiTrendingUp className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No performance reviews found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Create a review to get started</p>
                  </td>
                </tr>
              ) : (
                filteredReviews.map(r => {
                  const badge = getStatusBadge(r.status);
                  const isDeleting = deleteConfirmId === r.id;
                  return (
                    <tr key={r.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <FiTrash2 className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this review? This action cannot be undone.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(r.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <FiUser className="w-4 h-4 text-blue-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-nexus-text-primary">{r.employee?.firstName} {r.employee?.lastName}</p>
                                <p className="text-xs text-nexus-text-muted">{r.employee?.employeeId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {r.reviewer ? (
                              <p className="text-sm text-nexus-text-secondary">{r.reviewer.firstName} {r.reviewer.lastName}</p>
                            ) : (
                              <span className="text-xs text-nexus-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{r.reviewCycle}</td>
                          <td className="px-4 py-3"><StarDisplay rating={r.overallRating} /></td>
                          <td className="px-4 py-3"><span className={badge.className}>{badge.label}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && (
                                <>
                                  <button onClick={() => handleOpenView(r)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                                  <button onClick={() => handleOpenEditForm(r)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                    <FiEdit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(r.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
