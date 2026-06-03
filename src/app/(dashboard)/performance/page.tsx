'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiTrendingUp,
  FiX,
  FiTarget,
  FiStar,
  FiAward,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewCycle: string;
  reviewPeriod: string | null;
  rating: number;
  goalsRating: number;
  skillsRating: number;
  behaviorRating: number;
  overallRating: number;
  comments: string | null;
  status: string;
  reviewDate: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getReviewStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    in_progress: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getGoalStatusBadge(status: string) {
  const map: Record<string, string> = {
    not_started: 'nexus-badge nexus-badge-warning',
    in_progress: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'nexus-badge nexus-badge-info',
    medium: 'nexus-badge nexus-badge-warning',
    high: 'nexus-badge nexus-badge-error',
  };
  return map[priority] || 'nexus-badge nexus-badge-info';
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    performance: 'nexus-badge nexus-badge-primary',
    development: 'nexus-badge nexus-badge-purple',
    behavioral: 'nexus-badge nexus-badge-success',
  };
  return map[category] || 'nexus-badge nexus-badge-info';
}

function renderStars(rating: number) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <FiStar key={s} className={`w-3.5 h-3.5 ${s <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
      ))}
      <span className="text-xs text-nexus-text-muted ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

/* ── Component ── */
export default function PerformancePage() {
  const { user } = useAuthStore();
  const _isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');
  void _isAdmin;

  const [activeTab, setActiveTab] = useState<'reviews' | 'goals'>('reviews');
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [reviewForm, setReviewForm] = useState({ employeeId: '', reviewCycle: '', goalsRating: 3, skillsRating: 3, behaviorRating: 3, comments: '' });
  const [goalForm, setGoalForm] = useState({ employeeId: '', title: '', description: '', category: 'performance', priority: 'medium', startDate: '', endDate: '' });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [revRes, goalRes, empRes] = await Promise.all([
        fetch('/api/performance?limit=50', { headers }),
        fetch('/api/goals?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (revRes.ok) { const d = await revRes.json(); setReviews(d.reviews || d.performanceReviews || []); }
      if (goalRes.ok) { const d = await goalRes.json(); setGoals(d.goals || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Review */
  const handleReviewSubmit = async () => {
    if (!reviewForm.employeeId || !reviewForm.reviewCycle) { toast.error('Please fill required fields'); return; }
    try {
      setSubmitting(true);
      const overallRating = (reviewForm.goalsRating + reviewForm.skillsRating + reviewForm.behaviorRating) / 3;
      const res = await fetch('/api/performance', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...reviewForm, rating: overallRating, overallRating, status: 'pending' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Review created successfully');
      setShowReviewModal(false);
      setReviewForm({ employeeId: '', reviewCycle: '', goalsRating: 3, skillsRating: 3, behaviorRating: 3, comments: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create review');
    } finally {
      setSubmitting(false);
    }
  };

  /* Submit Goal */
  const handleGoalSubmit = async () => {
    if (!goalForm.employeeId || !goalForm.title || !goalForm.startDate || !goalForm.endDate) { toast.error('Please fill required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...goalForm, status: 'not_started', progress: 0 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Goal added successfully');
      setShowGoalModal(false);
      setGoalForm({ employeeId: '', title: '', description: '', category: 'performance', priority: 'medium', startDate: '', endDate: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add goal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiTrendingUp className="w-6 h-6" />
            Performance Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track reviews and goals</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReviewModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiAward className="w-4 h-4" /> New Review
          </button>
          <button onClick={() => setShowGoalModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm shadow-sm shadow-violet-500/25 transition-colors">
            <FiTarget className="w-4 h-4" /> Add Goal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setActiveTab('reviews')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'reviews' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Reviews</button>
        <button onClick={() => setActiveTab('goals')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'goals' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Goals</button>
      </div>

      {/* Reviews Tab */}
      {activeTab === 'reviews' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Cycle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Rating</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Overall</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Comments</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    </tr>
                  ))
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <FiAward className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No reviews found</p>
                    </td>
                  </tr>
                ) : (
                  reviews.map(r => (
                    <tr key={r.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{r.reviewCycle}</td>
                      <td className="px-4 py-3">{renderStars(r.rating)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{r.overallRating.toFixed(1)}/5</td>
                      <td className="px-4 py-3"><span className={getReviewStatusBadge(r.status)}>{r.status.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[200px]">{r.comments || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Goals Tab */}
      {activeTab === 'goals' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="nexus-card p-6 animate-pulse">
                <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-20 bg-slate-200 rounded mb-4" />
                <div className="h-3 bg-slate-200 rounded-full" />
              </div>
            ))
          ) : goals.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 text-center py-12 nexus-card">
              <FiTarget className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">No goals found</p>
            </div>
          ) : (
            goals.map(g => (
              <div key={g.id} className="nexus-card nexus-card-hover p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-nexus-text-primary">{g.title}</h3>
                  <span className={getPriorityBadge(g.priority)}>{g.priority}</span>
                </div>
                {g.description && <p className="text-xs text-nexus-text-secondary mb-3 line-clamp-2">{g.description}</p>}
                <div className="flex items-center gap-2 mb-3">
                  <span className={getCategoryBadge(g.category)}>{g.category}</span>
                  <span className={getGoalStatusBadge(g.status)}>{g.status.replace('_', ' ')}</span>
                </div>
                <div className="mb-1 flex justify-between text-xs text-nexus-text-muted">
                  <span>Progress</span>
                  <span>{g.progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${g.progress >= 100 ? 'bg-emerald-500' : g.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(g.progress, 100)}%` }} />
                </div>
                <p className="text-xs text-nexus-text-muted mt-2">{g.employee ? `${g.employee.firstName} ${g.employee.lastName}` : ''}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowReviewModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">New Performance Review</h2>
              <button onClick={() => setShowReviewModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={reviewForm.employeeId} onChange={e => setReviewForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Review Cycle *</label>
                <input type="text" value={reviewForm.reviewCycle} onChange={e => setReviewForm(p => ({ ...p, reviewCycle: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g. Q1 2026, Annual 2026" />
              </div>
              {[
                { key: 'goalsRating' as const, label: 'Goals Rating' },
                { key: 'skillsRating' as const, label: 'Skills Rating' },
                { key: 'behaviorRating' as const, label: 'Behavior Rating' },
              ].map(item => (
                <div key={item.key}>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-nexus-text-secondary">{item.label}</label>
                    <span className="text-xs font-bold text-nexus-text-primary">{reviewForm[item.key]}/5</span>
                  </div>
                  <input type="range" min="1" max="5" step="0.5" value={reviewForm[item.key]} onChange={e => setReviewForm(p => ({ ...p, [item.key]: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  <div className="flex justify-between text-[10px] text-nexus-text-muted"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Comments</label>
                <textarea rows={3} value={reviewForm.comments} onChange={e => setReviewForm(p => ({ ...p, comments: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional comments..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowReviewModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleReviewSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Creating...' : 'Create Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowGoalModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Add Goal</h2>
              <button onClick={() => setShowGoalModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={goalForm.employeeId} onChange={e => setGoalForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                <input type="text" value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Goal title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={goalForm.description} onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Goal description..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                  <select value={goalForm.category} onChange={e => setGoalForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="performance">Performance</option>
                    <option value="development">Development</option>
                    <option value="behavioral">Behavioral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label>
                  <select value={goalForm.priority} onChange={e => setGoalForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                  <input type="date" value={goalForm.startDate} onChange={e => setGoalForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date *</label>
                  <input type="date" value={goalForm.endDate} onChange={e => setGoalForm(p => ({ ...p, endDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowGoalModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleGoalSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 shadow-sm shadow-violet-500/25 transition-colors">
                {submitting ? 'Adding...' : 'Add Goal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
