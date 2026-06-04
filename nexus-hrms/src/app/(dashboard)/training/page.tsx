'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBookOpen,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiCalendar,
  FiMapPin,
  FiMonitor,
  FiUsers,
  FiDollarSign,
  FiUserPlus,
  FiCheck,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Training {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  trainer?: string | null;
  startDate: string;
  endDate?: string | null;
  location?: string | null;
  mode: string;
  maxParticipants?: number | null;
  cost?: number | null;
  status: string;
  _count?: { enrollments: number } | null;
  enrollments?: Array<{ id: string }>;
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

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    technical: 'bg-blue-100 text-blue-700 nexus-badge',
    soft_skills: 'bg-purple-100 text-purple-700 nexus-badge',
    compliance: 'bg-orange-100 text-orange-700 nexus-badge',
    leadership: 'bg-amber-100 text-amber-700 nexus-badge',
    onboarding: 'bg-emerald-100 text-emerald-700 nexus-badge',
  };
  const labels: Record<string, string> = { technical: 'Technical', soft_skills: 'Soft Skills', compliance: 'Compliance', leadership: 'Leadership', onboarding: 'Onboarding' };
  return { className: map[category] || 'nexus-badge nexus-badge-info', label: labels[category] || category };
}

function getModeBadge(mode: string) {
  const map: Record<string, string> = {
    online: 'bg-cyan-100 text-cyan-700 nexus-badge',
    offline: 'bg-violet-100 text-violet-700 nexus-badge',
    hybrid: 'bg-teal-100 text-teal-700 nexus-badge',
  };
  const labels: Record<string, string> = { online: 'Online', offline: 'Offline', hybrid: 'Hybrid' };
  return { className: map[mode] || 'nexus-badge nexus-badge-info', label: labels[mode] || mode };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    upcoming: 'nexus-badge nexus-badge-info',
    ongoing: 'nexus-badge nexus-badge-warning',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  const labels: Record<string, string> = { upcoming: 'Upcoming', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const initialForm = {
  title: '',
  description: '',
  category: 'technical',
  trainer: '',
  startDate: '',
  endDate: '',
  location: '',
  mode: 'online',
  maxParticipants: '',
  cost: '',
  status: 'upcoming',
};

/* ── Component ── */
export default function TrainingPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  /* Enroll state */
  const [enrollTrainingId, setEnrollTrainingId] = useState<string | null>(null);
  const [enrollEmployeeId, setEnrollEmployeeId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Training | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterMode) params.set('mode', filterMode);
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '50');

      const [trainingRes, empRes] = await Promise.allSettled([
        fetch(`/api/training?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (trainingRes.status === 'fulfilled' && trainingRes.value.ok) {
        const data = await trainingRes.value.json();
        setTrainings(data.trainings || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load training data');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterMode, filterStatus]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenView = (record: Training) => {
    setViewingId(record.id);
    setViewingRecord(record);
    setShowForm(false);
    setDeleteConfirmId(null);
    setEnrollTrainingId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  /* Open Add Form */
  const handleOpenAddForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setDeleteConfirmId(null);
    setEnrollTrainingId(null);
    setViewingId(null);
    setViewingRecord(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  /* Open Edit Form */
  const handleOpenEditForm = (t: Training) => {
    setEditingId(t.id);
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      title: t.title,
      description: t.description || '',
      category: t.category,
      trainer: t.trainer || '',
      startDate: t.startDate ? t.startDate.split('T')[0] : '',
      endDate: t.endDate ? t.endDate.split('T')[0] : '',
      location: t.location || '',
      mode: t.mode,
      maxParticipants: t.maxParticipants ? String(t.maxParticipants) : '',
      cost: t.cost ? String(t.cost) : '',
      status: t.status,
    });
    setShowForm(true);
    setDeleteConfirmId(null);
    setEnrollTrainingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  /* Create / Update Training */
  const handleSave = async () => {
    if (!form.title || !form.category || !form.startDate || !form.mode) {
      toast.error('Please fill in required fields: Title, Category, Start Date, Mode');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        title: form.title,
        description: form.description || null,
        category: form.category,
        trainer: form.trainer || null,
        startDate: form.startDate,
        endDate: form.endDate || null,
        location: form.location || null,
        mode: form.mode,
        maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants) : null,
        cost: form.cost ? parseFloat(form.cost) : null,
        status: form.status,
      };

      if (editingId) {
        const res = await fetch(`/api/training/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Training updated successfully');
      } else {
        const res = await fetch('/api/training', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Training created successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save training');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete Training */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/training/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Training deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete training');
    } finally {
      setDeleting(false);
    }
  };

  /* Enroll Employee */
  const handleOpenEnroll = (trainingId: string) => {
    setEnrollTrainingId(trainingId);
    setEnrollEmployeeId('');
    setShowForm(false);
    setDeleteConfirmId(null);
  };

  const handleCancelEnroll = () => {
    setEnrollTrainingId(null);
    setEnrollEmployeeId('');
  };

  const handleEnroll = async (trainingId: string) => {
    if (!enrollEmployeeId) {
      toast.error('Please select an employee to enroll');
      return;
    }
    try {
      setEnrolling(true);
      const res = await fetch(`/api/training/${trainingId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'enroll', employeeId: enrollEmployeeId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Employee enrolled successfully');
      handleCancelEnroll();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll employee');
    } finally {
      setEnrolling(false);
    }
  };

  /* Filtered trainings */
  const filteredTrainings = trainings.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) || (t.trainer || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiBookOpen className="w-6 h-6 text-violet-500" />
            Training
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage training programs and employee enrollments</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Training
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
              placeholder="Search by title, trainer, or category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Categories</option>
              <option value="technical">Technical</option>
              <option value="soft_skills">Soft Skills</option>
              <option value="compliance">Compliance</option>
              <option value="leadership">Leadership</option>
              <option value="onboarding">Onboarding</option>
            </select>
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Modes</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="hybrid">Hybrid</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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
                View Training
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Title</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.title}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Category</p>
                <p className="text-sm text-nexus-text-primary">{getCategoryBadge(viewingRecord.category).label}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Trainer</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.trainer || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Mode</p>
                <p className="text-sm text-nexus-text-primary">{getModeBadge(viewingRecord.mode).label}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Start Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.startDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">End Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.endDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Location</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.location || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Max Participants</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.maxParticipants || 'Unlimited'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Cost</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.cost)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Enrolled</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord._count?.enrollments ?? viewingRecord.enrollments?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status).className}>{getStatusBadge(viewingRecord.status).label}</span></p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Description</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.description || '—'}</p>
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
                {editingId ? 'Edit Training' : 'Add Training'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                  <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Training program title" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category *</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="technical">Technical</option>
                    <option value="soft_skills">Soft Skills</option>
                    <option value="compliance">Compliance</option>
                    <option value="leadership">Leadership</option>
                    <option value="onboarding">Onboarding</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Trainer</label>
                  <input type="text" value={form.trainer} onChange={e => setForm(p => ({ ...p, trainer: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Trainer name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Mode *</label>
                  <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} min={form.startDate} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label>
                  <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Training location" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Max Participants</label>
                  <input type="number" min="1" value={form.maxParticipants} onChange={e => setForm(p => ({ ...p, maxParticipants: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Leave empty for unlimited" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Cost</label>
                  <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Training cost" />
                </div>
                {editingId && (
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="upcoming">Upcoming</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Training program description..." />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submitting ? 'Saving...' : editingId ? 'Update Training' : 'Add Training'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="nexus-card p-6 animate-pulse">
              <div className="h-5 w-40 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-24 bg-slate-200 rounded mb-4" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-slate-200 rounded" />
                <div className="h-3 w-3/4 bg-slate-200 rounded" />
              </div>
              <div className="flex gap-2 mt-4">
                <div className="h-5 w-16 bg-slate-200 rounded-full" />
                <div className="h-5 w-16 bg-slate-200 rounded-full" />
              </div>
            </div>
          ))
        ) : filteredTrainings.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3 text-center py-12 nexus-card">
            <FiBookOpen className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
            <p className="text-nexus-text-secondary font-medium">No training programs found</p>
            <p className="text-sm text-nexus-text-muted mt-1">Add a training program to get started</p>
          </div>
        ) : (
          filteredTrainings.map(t => {
            const catBadge = getCategoryBadge(t.category);
            const modeBadge = getModeBadge(t.mode);
            const statusBadge = getStatusBadge(t.status);
            const isDeleting = deleteConfirmId === t.id;
            const isEnrolling = enrollTrainingId === t.id;
            const enrolledCount = t._count?.enrollments ?? t.enrollments?.length ?? 0;

            return (
              <div key={t.id} className={`nexus-card overflow-hidden transition-colors ${isDeleting ? 'border-red-200 bg-red-50/30' : ''}`}>
                {isDeleting ? (
                  <div className="p-6 bg-red-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <FiTrash2 className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">Delete Training?</p>
                        <p className="text-xs text-red-500">Are you sure you want to delete &quot;{t.title}&quot;?</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                        {deleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-6">
                      {/* Title & Badges */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="text-base font-semibold text-nexus-text-primary line-clamp-2">{t.title}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        <span className={catBadge.className}>{catBadge.label}</span>
                        <span className={modeBadge.className}>{modeBadge.label}</span>
                        <span className={statusBadge.className}>{statusBadge.label}</span>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 mb-4">
                        {t.trainer && (
                          <div className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                            <FiUsers className="w-3.5 h-3.5 text-nexus-text-muted flex-shrink-0" />
                            <span className="truncate">{t.trainer}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                          <FiCalendar className="w-3.5 h-3.5 text-nexus-text-muted flex-shrink-0" />
                          <span>{formatDate(t.startDate)}{t.endDate ? ` — ${formatDate(t.endDate)}` : ''}</span>
                        </div>
                        {t.location && (
                          <div className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                            <FiMapPin className="w-3.5 h-3.5 text-nexus-text-muted flex-shrink-0" />
                            <span className="truncate">{t.location}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                            <FiMonitor className="w-3.5 h-3.5 text-nexus-text-muted flex-shrink-0" />
                            <span>Enrolled: <strong className="text-nexus-text-primary">{enrolledCount}</strong>{t.maxParticipants ? ` / ${t.maxParticipants}` : ''}</span>
                          </div>
                          {t.cost != null && (
                            <div className="flex items-center gap-1 text-sm text-nexus-text-secondary">
                              <FiDollarSign className="w-3.5 h-3.5 text-nexus-text-muted flex-shrink-0" />
                              <span className="font-medium">{formatCurrency(t.cost)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {t.description && (
                        <p className="text-xs text-nexus-text-muted line-clamp-2 mb-4">{t.description}</p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-nexus-border">
                        {isAdmin && (
                          <>
                            <button onClick={() => handleOpenEnroll(t.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 transition-colors">
                              <FiUserPlus className="w-3.5 h-3.5" />
                              Enroll
                            </button>
                            <button onClick={() => handleOpenView(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            <button onClick={() => handleOpenEditForm(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                              <FiEdit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline Enroll Form */}
                    {isEnrolling && (
                      <div className="border-t border-nexus-border p-4 bg-emerald-50/50">
                        <h4 className="text-xs font-semibold text-nexus-text-primary mb-3 flex items-center gap-1.5">
                          <FiUserPlus className="w-3.5 h-3.5 text-emerald-500" />
                          Enroll Employee
                        </h4>
                        <div className="space-y-3">
                          <select
                            value={enrollEmployeeId}
                            onChange={e => setEnrollEmployeeId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                          >
                            <option value="">Select Employee</option>
                            {employees.map(e => (
                              <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEnroll(t.id)}
                              disabled={enrolling || !enrollEmployeeId}
                              className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                            >
                              {enrolling ? 'Enrolling...' : 'Confirm Enroll'}
                            </button>
                            <button onClick={handleCancelEnroll} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
