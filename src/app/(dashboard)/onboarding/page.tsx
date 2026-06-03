'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClipboard,
  FiPlus,
  FiX,
  FiCheck,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface OnboardingTask {
  id: string;
  employeeId: string;
  task: string;
  category: string;
  status: string;
  dueDate: string | null;
  completedDate: string | null;
  notes: string | null;
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

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    in_progress: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    general: 'nexus-badge nexus-badge-primary',
    it_setup: 'nexus-badge nexus-badge-info',
    hr_docs: 'nexus-badge nexus-badge-purple',
    training: 'nexus-badge nexus-badge-success',
    introduction: 'nexus-badge nexus-badge-warning',
  };
  return map[category] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function OnboardingPage() {
  const _user = useAuthStore();
  void _user;

  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: '', task: '', category: 'general', dueDate: '', notes: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [taskRes, empRes] = await Promise.all([
        fetch('/api/onboarding?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (taskRes.ok) { const d = await taskRes.json(); setTasks(d.tasks || d.onboardingTasks || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load onboarding data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Add Task */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.task) { toast.error('Please fill required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, status: 'pending', dueDate: form.dueDate || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Task added successfully');
      setShowModal(false);
      setForm({ employeeId: '', task: '', category: 'general', dueDate: '', notes: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setSubmitting(false);
    }
  };

  /* Mark as Complete */
  const handleComplete = async (id: string) => {
    try {
      setCompleting(id);
      const res = await fetch(`/api/onboarding/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'completed', completedDate: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task marked as completed');
      fetchData();
    } catch {
      toast.error('Failed to complete task');
    } finally {
      setCompleting(null);
    }
  };

  /* Group tasks by employee */
  const groupedByEmployee: Record<string, OnboardingTask[]> = {};
  tasks.forEach(t => {
    const key = t.employeeId;
    if (!groupedByEmployee[key]) groupedByEmployee[key] = [];
    groupedByEmployee[key].push(t);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiClipboard className="w-6 h-6" />
            Onboarding
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage onboarding tasks for new employees</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Tasks</p>
          <p className="text-xl font-bold text-nexus-text-primary mt-1">{tasks.length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Pending</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{tasks.filter(t => t.status === 'pending').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">In Progress</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{tasks.filter(t => t.status === 'in_progress').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Completed</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{tasks.filter(t => t.status === 'completed').length}</p>
        </div>
      </div>

      {/* Tasks grouped by employee */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="nexus-card p-6 animate-pulse">
              <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="border border-nexus-border/50 rounded-lg p-4">
                    <div className="h-3 w-24 bg-slate-200 rounded mb-2" />
                    <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
                    <div className="h-5 w-14 bg-slate-200 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 nexus-card">
          <FiClipboard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
          <p className="text-nexus-text-secondary font-medium">No onboarding tasks found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByEmployee).map(([empId, empTasks]) => {
            const emp = empTasks[0]?.employee;
            const totalTasks = empTasks.length;
            const completedTasks = empTasks.filter(t => t.status === 'completed').length;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            return (
              <div key={empId} className="nexus-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                      {emp ? `${emp.firstName[0]}${emp.lastName[0]}` : '?'}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-nexus-text-primary">{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</h3>
                      <p className="text-xs text-nexus-text-muted">{emp?.employeeId} • {completedTasks}/{totalTasks} tasks completed</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-nexus-text-secondary">{progress}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {empTasks.map(task => (
                    <div key={task.id} className={`border rounded-lg p-4 transition-colors ${task.status === 'completed' ? 'border-emerald-200 bg-emerald-50/50' : 'border-nexus-border/50 hover:border-nexus-border'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <h4 className={`text-sm font-medium ${task.status === 'completed' ? 'text-emerald-700 line-through' : 'text-nexus-text-primary'}`}>{task.task}</h4>
                        {task.status !== 'completed' && (
                          <button onClick={() => handleComplete(task.id)} disabled={completing === task.id} className="p-1 rounded text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors flex-shrink-0" title="Mark Complete">
                            <FiCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={getCategoryBadge(task.category)}>{task.category.replace('_', ' ')}</span>
                        <span className={getStatusBadge(task.status)}>{task.status.replace('_', ' ')}</span>
                      </div>
                      {task.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-nexus-text-muted">
                          <FiCalendar className="w-3 h-3" />
                          <span>Due: {formatDate(task.dueDate)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Add Onboarding Task</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Task *</label>
                <input type="text" value={form.task} onChange={e => setForm(p => ({ ...p, task: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Task description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="general">General</option>
                    <option value="it_setup">IT Setup</option>
                    <option value="hr_docs">HR Documents</option>
                    <option value="training">Training</option>
                    <option value="introduction">Introduction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional notes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Adding...' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
