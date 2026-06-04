'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiMap,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiNavigation2,
  FiTruck,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Travel {
  id: string;
  employeeId: string;
  purpose: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelMode: string;
  estimatedCost?: number | null;
  actualCost?: number | null;
  status: string;
  approvalNotes?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
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

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    requested: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-info',
    booked: 'nexus-badge nexus-badge-info',
    in_progress: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge';
}

function getTravelModeLabel(mode: string) {
  const map: Record<string, string> = {
    flight: 'Flight',
    train: 'Train',
    bus: 'Bus',
    car: 'Car',
    other: 'Other',
  };
  return map[mode] || mode;
}

const TRAVEL_MODES = ['flight', 'train', 'bus', 'car', 'other'];
const TRAVEL_STATUSES = ['requested', 'approved', 'booked', 'in_progress', 'completed', 'cancelled'];

const initialForm = {
  employeeId: '',
  purpose: '',
  destination: '',
  startDate: '',
  endDate: '',
  travelMode: '',
  estimatedCost: '',
  status: 'requested',
};

/* ── Component ── */
export default function TravelPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [travels, setTravels] = useState<Travel[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTravelMode, setFilterTravelMode] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Travel | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [travelRes, empRes] = await Promise.all([
        fetch('/api/travel?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (travelRes.ok) {
        const data = await travelRes.json();
        setTravels(data.travels || data.travelRequests || []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load travel requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Form handlers */
  const handleOpenAdd = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (record: Travel) => {
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

  const handleOpenEdit = (travel: Travel) => {
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      employeeId: travel.employeeId || '',
      purpose: travel.purpose,
      destination: travel.destination,
      startDate: travel.startDate ? travel.startDate.split('T')[0] : '',
      endDate: travel.endDate ? travel.endDate.split('T')[0] : '',
      travelMode: travel.travelMode,
      estimatedCost: travel.estimatedCost != null ? String(travel.estimatedCost) : '',
      status: travel.status,
    });
    setEditingId(travel.id);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.purpose.trim() || !form.destination.trim() || !form.startDate || !form.endDate || !form.travelMode) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        employeeId: form.employeeId || null,
        purpose: form.purpose.trim(),
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        travelMode: form.travelMode,
        estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
        status: form.status,
      };

      const url = editingId ? `/api/travel/${editingId}` : '/api/travel';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Travel request updated successfully' : 'Travel request submitted successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save travel request');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/travel/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Travel request deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete travel request');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtering */
  const filtered = travels.filter(t => {
    const matchSearch = !search || t.purpose.toLowerCase().includes(search.toLowerCase()) || t.destination.toLowerCase().includes(search.toLowerCase()) || (t.employee ? `${t.employee.firstName} ${t.employee.lastName}`.toLowerCase().includes(search.toLowerCase()) : false);
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchTravelMode = !filterTravelMode || t.travelMode === filterTravelMode;
    return matchSearch && matchStatus && matchTravelMode;
  });

  /* Summary */
  const totalRequests = travels.length;
  const approved = travels.filter(t => t.status === 'approved' || t.status === 'booked').length;
  const inProgress = travels.filter(t => t.status === 'in_progress').length;
  const totalCost = travels.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiMap className="w-6 h-6 text-teal-500" />
            Travel
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage travel requests and bookings</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Request Travel
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiMap className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{totalRequests}</p>
              <p className="text-xs text-nexus-text-muted">Total Requests</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center"><FiNavigation2 className="w-5 h-5 text-cyan-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{approved}</p>
              <p className="text-xs text-nexus-text-muted">Approved</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiTruck className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{inProgress}</p>
              <p className="text-xs text-nexus-text-muted">In Progress</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><span className="text-sm font-bold text-emerald-600">$</span></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{formatCurrency(totalCost)}</p>
              <p className="text-xs text-nexus-text-muted">Total Cost</p>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Form */}
      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Travel Request
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Purpose</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.purpose</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Destination</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.destination</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Start Date</p>
                <p className="text-sm text-nexus-text-primary">formatDate(viewingRecord.startDate)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">End Date</p>
                <p className="text-sm text-nexus-text-primary">formatDate(viewingRecord.endDate)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Travel Mode</p>
                <p className="text-sm text-nexus-text-primary">getTravelModeLabel(viewingRecord.travelMode)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Estimated Cost</p>
                <p className="text-sm text-nexus-text-primary">formatCurrency(viewingRecord.estimatedCost)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Actual Cost</p>
                <p className="text-sm text-nexus-text-primary">formatCurrency(viewingRecord.actualCost)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.status.replace(/_/g, ' ')</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Approval Notes</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.approvalNotes || '—'</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { handleOpenEdit(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
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
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Travel Request' : 'Request Travel'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee</label>
                <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purpose *</label>
                <input type="text" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Business purpose" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Destination *</label>
                <input type="text" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="City, Country" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date *</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} min={form.startDate} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Travel Mode *</label>
                <select value={form.travelMode} onChange={e => setForm(p => ({ ...p, travelMode: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select mode</option>
                  {TRAVEL_MODES.map(m => <option key={m} value={m}>{getTravelModeLabel(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Estimated Cost</label>
                <input type="number" step="0.01" value={form.estimatedCost} onChange={e => setForm(p => ({ ...p, estimatedCost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {TRAVEL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search travel requests..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {TRAVEL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
          <select value={filterTravelMode} onChange={e => setFilterTravelMode(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Modes</option>
            {TRAVEL_MODES.map(m => <option key={m} value={m}>{getTravelModeLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Purpose</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Destination</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Dates</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Est. Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-14 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FiMap className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No travel requests found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(travel => (
                  <tr key={travel.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === travel.id ? (
                      <td colSpan={8} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this travel request?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(travel.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{travel.employee ? `${travel.employee.firstName} ${travel.employee.lastName}` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[180px]">{travel.purpose}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{travel.destination}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(travel.startDate)} – {formatDate(travel.endDate)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getTravelModeLabel(travel.travelMode)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{formatCurrency(travel.estimatedCost)}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(travel.status)}>{travel.status.replace(/_/g, ' ')}</span></td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(travel)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEdit(travel)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                              <button onClick={() => { setDeleteConfirmId(travel.id); setShowForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                            </div>
                          )}
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
