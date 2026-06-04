'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiLayers,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiDollarSign,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface SalaryStructure {
  id: string;
  name: string;
  grade?: string | null;
  basicSalary: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  pf: number;
  esi: number;
  tax: number;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  status: string;
  description?: string | null;
  createdAt: string;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { active: 'nexus-badge nexus-badge-success', inactive: 'nexus-badge nexus-badge-error' };
  return map[status] || 'nexus-badge';
}

const initialForm = { name: '', grade: '', basicSalary: '', hra: '', da: '', conveyance: '', medical: '', specialAllowance: '', pf: '', esi: '', tax: '', status: 'active', description: '' };

export default function SalaryStructuresPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try { setLoading(true); const res = await fetch('/api/salary-structures?limit=100', { headers: getAuthHeaders() }); if (res.ok) { const data = await res.json(); setStructures(data.salaryStructures || []); } }
    catch (err) { console.error(err); toast.error('Failed to load salary structures'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  // Auto-calculate
  const calcGross = () => { const b = parseFloat(form.basicSalary) || 0; const h = parseFloat(form.hra) || 0; const d = parseFloat(form.da) || 0; const c = parseFloat(form.conveyance) || 0; const m = parseFloat(form.medical) || 0; const s = parseFloat(form.specialAllowance) || 0; return b + h + d + c + m + s; };
  const calcDeductions = () => { const p = parseFloat(form.pf) || 0; const e = parseFloat(form.esi) || 0; const t = parseFloat(form.tax) || 0; return p + e + t; };
  const calcNet = () => calcGross() - calcDeductions();

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null); setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };

  const handleOpenEdit = (s: SalaryStructure) => {
    setForm({ name: s.name, grade: s.grade || '', basicSalary: String(s.basicSalary), hra: String(s.hra), da: String(s.da), conveyance: String(s.conveyance), medical: String(s.medical), specialAllowance: String(s.specialAllowance), pf: String(s.pf), esi: String(s.esi), tax: String(s.tax), status: s.status, description: s.description || '' });
    setEditingId(s.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (s: SalaryStructure) => { setViewingId(s.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Please fill in the name'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { name: form.name.trim(), grade: form.grade.trim() || null, basicSalary: form.basicSalary, hra: form.hra, da: form.da, conveyance: form.conveyance, medical: form.medical, specialAllowance: form.specialAllowance, pf: form.pf, esi: form.esi, tax: form.tax, status: form.status, description: form.description.trim() || null };
      const url = editingId ? `/api/salary-structures/${editingId}` : '/api/salary-structures';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Salary structure updated' : 'Salary structure created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/salary-structures/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Salary structure deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = structures.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.grade || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = structures.length;
  const activeCount = structures.filter(s => s.status === 'active').length;
  const avgGross = structures.length > 0 ? structures.reduce((sum, s) => sum + s.grossSalary, 0) / structures.length : 0;

  const viewingItem = viewingId ? structures.find(s => s.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiLayers className="w-6 h-6 text-cyan-500" />Salary Structures</h1><p className="text-nexus-text-secondary mt-1">Define and manage salary components</p></div>
        {isAdmin && (<button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />Add Structure</button>)}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiLayers className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Structures</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{activeCount}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center"><FiDollarSign className="w-5 h-5 text-cyan-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(avgGross)}</p><p className="text-xs text-nexus-text-muted">Avg Gross Salary</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-cyan-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Salary Structure Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Grade</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.grade || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase mb-2">Earnings</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Basic Salary</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.basicSalary)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">HRA</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.hra)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">DA</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.da)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Conveyance</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.conveyance)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Medical</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.medical)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Special Allowance</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.specialAllowance)}</p></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase mb-2">Deductions</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">PF</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.pf)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">ESI</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.esi)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Tax</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.tax)}</p></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase mb-2">Summary</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Gross Salary</p><p className="text-sm font-semibold text-emerald-600 mt-0.5">{formatCurrency(viewingItem.grossSalary)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Total Deductions</p><p className="text-sm font-semibold text-red-600 mt-0.5">{formatCurrency(viewingItem.totalDeductions)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Net Salary</p><p className="text-sm font-bold text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.netSalary)}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.description || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Salary Structure' : 'Add Salary Structure'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Structure name" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Grade</label><input type="text" value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="A1, B2..." /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase">Earnings</p></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Basic Salary</label><input type="number" step="0.01" value={form.basicSalary} onChange={e => setForm(p => ({ ...p, basicSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">HRA</label><input type="number" step="0.01" value={form.hra} onChange={e => setForm(p => ({ ...p, hra: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">DA</label><input type="number" step="0.01" value={form.da} onChange={e => setForm(p => ({ ...p, da: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Conveyance</label><input type="number" step="0.01" value={form.conveyance} onChange={e => setForm(p => ({ ...p, conveyance: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Medical</label><input type="number" step="0.01" value={form.medical} onChange={e => setForm(p => ({ ...p, medical: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Special Allowance</label><input type="number" step="0.01" value={form.specialAllowance} onChange={e => setForm(p => ({ ...p, specialAllowance: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase">Deductions</p></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">PF</label><input type="number" step="0.01" value={form.pf} onChange={e => setForm(p => ({ ...p, pf: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">ESI</label><input type="number" step="0.01" value={form.esi} onChange={e => setForm(p => ({ ...p, esi: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Tax</label><input type="number" step="0.01" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase">Auto-Calculated</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Gross Salary</p><p className="text-sm font-semibold text-emerald-600 mt-0.5">{formatCurrency(calcGross())}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Total Deductions</p><p className="text-sm font-semibold text-red-600 mt-0.5">{formatCurrency(calcDeductions())}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Net Salary</p><p className="text-sm font-bold text-nexus-text-primary mt-0.5">{formatCurrency(calcNet())}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label><textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." /></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search structures..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Grade</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Basic</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Gross</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Net</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiLayers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No salary structures found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === s.id ? (
                      <td colSpan={7} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Delete &quot;{s.name}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(s.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{s.name}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.grade || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-primary">{formatCurrency(s.basicSalary)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(s.grossSalary)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-nexus-text-primary">{formatCurrency(s.netSalary)}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(s.status)}>{s.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-cyan-500 hover:bg-cyan-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                <button onClick={() => { setDeleteConfirmId(s.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                              </>
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
