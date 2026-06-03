'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBookOpen,
  FiPlus,
  FiX,
  FiUsers,
  FiMapPin,
  FiCalendar,
  FiPlay,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Training {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  trainer: string | null;
  startDate: string;
  endDate: string | null;
  location: string | null;
  mode: string;
  status: string;
  maxParticipants: number | null;
  cost: number | null;
  enrollments: { id: string; employeeId: string; status: string; employee?: { firstName: string; lastName: string } }[];
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

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    upcoming: 'nexus-badge nexus-badge-info',
    ongoing: 'nexus-badge nexus-badge-warning',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getModeBadge(mode: string) {
  const map: Record<string, string> = {
    online: 'nexus-badge nexus-badge-primary',
    offline: 'nexus-badge nexus-badge-purple',
    hybrid: 'nexus-badge nexus-badge-warning',
  };
  return map[mode] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function TrainingPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', category: '', trainer: '', startDate: '', endDate: '',
    location: '', mode: 'online', maxParticipants: '', cost: '',
  });

  const [enrollModal, setEnrollModal] = useState<string | null>(null);
  const [enrollEmpId, setEnrollEmpId] = useState('');

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [trainRes, empRes] = await Promise.all([
        fetch('/api/training?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (trainRes.ok) { const d = await trainRes.json(); setTrainings(d.trainings || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load training data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Create Training */
  const handleSubmit = async () => {
    if (!form.title || !form.startDate) { toast.error('Please fill required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...form,
          maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants) : null,
          cost: form.cost ? parseFloat(form.cost) : null,
          status: 'upcoming',
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Training created successfully');
      setShowModal(false);
      setForm({ title: '', description: '', category: '', trainer: '', startDate: '', endDate: '', location: '', mode: 'online', maxParticipants: '', cost: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create training');
    } finally {
      setSubmitting(false);
    }
  };

  /* Enroll */
  const handleEnroll = async () => {
    if (!enrollModal || !enrollEmpId) { toast.error('Select an employee'); return; }
    try {
      setEnrolling(enrollModal);
      const res = await fetch(`/api/training/${enrollModal}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'enroll', employeeId: enrollEmpId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Enrolled successfully');
      setEnrollModal(null);
      setEnrollEmpId('');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll');
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiBookOpen className="w-6 h-6" />
            Training & Development
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage training programs and enrollments</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" /> Create Training
          </button>
        )}
      </div>

      {/* Training Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="nexus-card p-6 animate-pulse">
              <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-24 bg-slate-200 rounded mb-4" />
              <div className="flex gap-2"><div className="h-5 w-16 bg-slate-200 rounded-full" /><div className="h-5 w-16 bg-slate-200 rounded-full" /></div>
            </div>
          ))
        ) : trainings.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 text-center py-12 nexus-card">
            <FiBookOpen className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
            <p className="text-nexus-text-secondary font-medium">No training programs found</p>
          </div>
        ) : (
          trainings.map(t => (
            <div key={t.id} className="nexus-card nexus-card-hover p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-nexus-text-primary">{t.title}</h3>
                <span className={getStatusBadge(t.status)}>{t.status}</span>
              </div>
              {t.description && <p className="text-xs text-nexus-text-secondary mb-3 line-clamp-2">{t.description}</p>}
              <div className="space-y-1.5 mb-3">
                {t.category && <div className="flex items-center gap-2 text-xs text-nexus-text-secondary"><span className="font-medium text-nexus-text-muted w-16">Category</span>{t.category}</div>}
                {t.trainer && <div className="flex items-center gap-2 text-xs text-nexus-text-secondary"><span className="font-medium text-nexus-text-muted w-16">Trainer</span>{t.trainer}</div>}
                <div className="flex items-center gap-2 text-xs text-nexus-text-secondary"><span className="font-medium text-nexus-text-muted w-16">Mode</span><span className={getModeBadge(t.mode)}>{t.mode}</span></div>
                <div className="flex items-center gap-2 text-xs text-nexus-text-secondary"><FiCalendar className="w-3 h-3" />{formatDate(t.startDate)} — {formatDate(t.endDate)}</div>
                {t.location && <div className="flex items-center gap-2 text-xs text-nexus-text-secondary"><FiMapPin className="w-3 h-3" />{t.location}</div>}
              </div>
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-nexus-border/50">
                <div className="flex items-center gap-1 text-xs text-nexus-text-muted">
                  <FiUsers className="w-3.5 h-3.5" />
                  <span>{t.enrollments?.length || 0}{t.maxParticipants ? `/${t.maxParticipants}` : ''} enrolled</span>
                </div>
                {isAdmin && t.status !== 'completed' && t.status !== 'cancelled' && (
                  <button onClick={() => setEnrollModal(t.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 text-xs font-medium transition-colors">
                    <FiPlay className="w-3 h-3" /> Enroll
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Training Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Create Training</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Training title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                  <input type="text" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g. Technical" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Trainer</label>
                  <input type="text" value={form.trainer} onChange={e => setForm(p => ({ ...p, trainer: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Trainer name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Mode</label>
                  <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Max Participants</label>
                  <input type="number" value={form.maxParticipants} onChange={e => setForm(p => ({ ...p, maxParticipants: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="—" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Cost</label>
                  <input type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Location or meeting link" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Creating...' : 'Create Training'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {enrollModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setEnrollModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Enroll Employee</h2>
              <button onClick={() => setEnrollModal(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Select Employee</label>
              <select value={enrollEmpId} onChange={e => setEnrollEmpId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                <option value="">Select Employee</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setEnrollModal(null)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleEnroll} disabled={!!enrolling} className="px-6 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 shadow-sm shadow-violet-500/25 transition-colors">
                {enrolling ? 'Enrolling...' : 'Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
