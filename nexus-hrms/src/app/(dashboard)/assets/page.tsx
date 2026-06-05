'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPackage,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiMonitor,
  FiSmartphone,
  FiPrinter,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Asset {
  id: string;
  name: string;
  assetTag: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  currentValue?: number | null;
  status: string;
  assignedToId?: string | null;
  location?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
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
    available: 'nexus-badge nexus-badge-success',
    assigned: 'nexus-badge nexus-badge-info',
    under_repair: 'nexus-badge nexus-badge-warning',
    disposed: 'nexus-badge nexus-badge-error',
    lost: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge';
}

function getCategoryLabel(cat: string) {
  const map: Record<string, string> = {
    laptop: 'Laptop',
    desktop: 'Desktop',
    phone: 'Phone',
    tablet: 'Tablet',
    monitor: 'Monitor',
    printer: 'Printer',
    furniture: 'Furniture',
    vehicle: 'Vehicle',
    other: 'Other',
  };
  return map[cat] || cat;
}

const CATEGORIES = ['laptop', 'desktop', 'phone', 'tablet', 'monitor', 'printer', 'furniture', 'vehicle', 'other'];
const STATUSES = ['available', 'assigned', 'under_repair', 'disposed', 'lost'];

const initialForm = {
  name: '',
  assetTag: '',
  category: '',
  brand: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseCost: '',
  currentValue: '',
  status: 'available',
  assignedToId: '',
  location: '',
  warrantyExpiry: '',
  notes: '',
};

/* ── Component ── */
export default function AssetsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Asset | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [assetsRes, empRes] = await Promise.all([
        fetch('/api/assets?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (assetsRes.ok) {
        const data = await assetsRes.json();
        setAssets(data.assets || []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load assets');
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

  const handleOpenView = (record: Asset) => {
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

  const handleOpenEdit = (asset: Asset) => {
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      name: asset.name,
      assetTag: asset.assetTag,
      category: asset.category,
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.split('T')[0] : '',
      purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : '',
      currentValue: asset.currentValue != null ? String(asset.currentValue) : '',
      status: asset.status,
      assignedToId: asset.assignedToId || '',
      location: asset.location || '',
      warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.split('T')[0] : '',
      notes: asset.notes || '',
    });
    setEditingId(asset.id);
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
    if (!form.name.trim() || !form.assetTag.trim() || !form.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        assetTag: form.assetTag.trim(),
        category: form.category,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        purchaseDate: form.purchaseDate || null,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : null,
        currentValue: form.currentValue ? parseFloat(form.currentValue) : null,
        status: form.status,
        assignedToId: form.assignedToId || null,
        location: form.location.trim() || null,
        warrantyExpiry: form.warrantyExpiry || null,
        notes: form.notes.trim() || null,
      };

      const url = editingId ? `/api/assets/${editingId}` : '/api/assets';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Asset updated successfully' : 'Asset created successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Asset deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete asset');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtering */
  const filtered = assets.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.assetTag.toLowerCase().includes(search.toLowerCase()) || (a.brand || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || a.category === filterCategory;
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  /* Summary */
  const total = assets.length;
  const available = assets.filter(a => a.status === 'available').length;
  const assigned = assets.filter(a => a.status === 'assigned').length;
  const underRepair = assets.filter(a => a.status === 'under_repair').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiPackage className="w-6 h-6 text-blue-500" />
            Assets
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage company assets</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Asset
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiPackage className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{total}</p>
              <p className="text-xs text-nexus-text-muted">Total</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiMonitor className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{available}</p>
              <p className="text-xs text-nexus-text-muted">Available</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center"><FiSmartphone className="w-5 h-5 text-cyan-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{assigned}</p>
              <p className="text-xs text-nexus-text-muted">Assigned</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiPrinter className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{underRepair}</p>
              <p className="text-xs text-nexus-text-muted">Under Repair</p>
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
                View Asset
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Name</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Asset Tag</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.assetTag}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Category</p>
                <p className="text-sm text-nexus-text-primary">{getCategoryLabel(viewingRecord.category)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Brand</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.brand || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Model</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.model || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Serial Number</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.serialNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Purchase Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.purchaseDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Purchase Cost</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.purchaseCost)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Current Value</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.currentValue)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.status.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Condition</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.status}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Assigned To</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.assignedTo ? `${viewingRecord.assignedTo.firstName} ${viewingRecord.assignedTo.lastName}` : 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Location</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.location || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Warranty Expiry</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.warrantyExpiry)}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Notes</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.notes || '—'}</p>
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
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Asset name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Asset Tag *</label>
                <input type="text" value={form.assetTag} onChange={e => setForm(p => ({ ...p, assetTag: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g. AST-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category *</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Brand</label>
                <input type="text" value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Brand name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Model</label>
                <input type="text" value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Model name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Serial Number</label>
                <input type="text" value={form.serialNumber} onChange={e => setForm(p => ({ ...p, serialNumber: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Serial number" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purchase Date</label>
                <input type="date" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purchase Cost</label>
                <input type="number" step="0.01" value={form.purchaseCost} onChange={e => setForm(p => ({ ...p, purchaseCost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Current Value</label>
                <input type="number" step="0.01" value={form.currentValue} onChange={e => setForm(p => ({ ...p, currentValue: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Assigned To</label>
                <select value={form.assignedToId} onChange={e => setForm(p => ({ ...p, assignedToId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Unassigned</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Office location" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Warranty Expiry</label>
                <input type="date" value={form.warrantyExpiry} onChange={e => setForm(p => ({ ...p, warrantyExpiry: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional notes..." />
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
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search assets..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Asset Tag</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Brand/Model</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Assigned To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Location</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FiPackage className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No assets found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(asset => (
                  <tr key={asset.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === asset.id ? (
                      <td colSpan={8} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{asset.name}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(asset.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-mono font-medium text-blue-600">{asset.assetTag}</td>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{asset.name}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getCategoryLabel(asset.category)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{[asset.brand, asset.model].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(asset.status)}>{asset.status.replace(/_/g, ' ')}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{asset.location || '—'}</td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(asset)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEdit(asset)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                              <button onClick={() => { setDeleteConfirmId(asset.id); setShowForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
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
