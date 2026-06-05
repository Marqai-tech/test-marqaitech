'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiFileText,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiArchive,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Document {
  id: string;
  name: string;
  type: string;
  fileUrl?: string | null;
  status: string;
  expiryDate?: string | null;
  uploadedDate?: string | null;
  employeeId?: string | null;
  description?: string | null;
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

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    expired: 'nexus-badge nexus-badge-error',
    archived: 'nexus-badge',
  };
  return map[status] || 'nexus-badge';
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    offer_letter: 'Offer Letter',
    id_proof: 'ID Proof',
    address_proof: 'Address Proof',
    tax_document: 'Tax Document',
    contract: 'Contract',
    certificate: 'Certificate',
    policy: 'Policy',
    other: 'Other',
  };
  return map[type] || type;
}

const DOCUMENT_TYPES = ['offer_letter', 'id_proof', 'address_proof', 'tax_document', 'contract', 'certificate', 'policy', 'other'];
const DOCUMENT_STATUSES = ['active', 'expired', 'archived'];

const initialForm = {
  name: '',
  type: '',
  fileUrl: '',
  status: 'active',
  expiryDate: '',
  employeeId: '',
  description: '',
};

/* ── Component ── */
export default function DocumentsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Document | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [docsRes, empRes] = await Promise.all([
        fetch('/api/documents?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load documents');
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

  const handleOpenView = (record: Document) => {
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

  const handleOpenEdit = (doc: Document) => {
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      name: doc.name,
      type: doc.type,
      fileUrl: doc.fileUrl || '',
      status: doc.status,
      expiryDate: doc.expiryDate ? doc.expiryDate.split('T')[0] : '',
      employeeId: doc.employeeId || '',
      description: doc.description || '',
    });
    setEditingId(doc.id);
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
    if (!form.name.trim() || !form.type) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        fileUrl: form.fileUrl.trim() || null,
        status: form.status,
        expiryDate: form.expiryDate || null,
        employeeId: form.employeeId || null,
        description: form.description.trim() || null,
      };

      const url = editingId ? `/api/documents/${editingId}` : '/api/documents';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Document updated successfully' : 'Document uploaded successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save document');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Document deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtering */
  const filtered = documents.filter(d => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.description || '').toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || d.type === filterType;
    const matchStatus = !filterStatus || d.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  /* Summary */
  const total = documents.length;
  const active = documents.filter(d => d.status === 'active').length;
  const expiringSoon = documents.filter(d => {
    if (!d.expiryDate) return false;
    const exp = new Date(d.expiryDate);
    const now = new Date();
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  }).length;
  const expired = documents.filter(d => d.status === 'expired').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiFileText className="w-6 h-6 text-violet-500" />
            Documents
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee documents and records</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Upload Document
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiFileText className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{total}</p>
              <p className="text-xs text-nexus-text-muted">Total</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{active}</p>
              <p className="text-xs text-nexus-text-muted">Active</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiAlertCircle className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{expiringSoon}</p>
              <p className="text-xs text-nexus-text-muted">Expiring Soon</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-red-500" /></div>
            <div>
              <p className="text-2xl font-bold text-nexus-text-primary">{expired}</p>
              <p className="text-xs text-nexus-text-muted">Expired</p>
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
                View Document
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Name</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.name</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Type</p>
                <p className="text-sm text-nexus-text-primary">getTypeLabel(viewingRecord.type)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.status</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">File URL</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.fileUrl || '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Expiry Date</p>
                <p className="text-sm text-nexus-text-primary">formatDate(viewingRecord.expiryDate)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Uploaded Date</p>
                <p className="text-sm text-nexus-text-primary">formatDate(viewingRecord.uploadedDate)</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Description</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">viewingRecord.description || '—'</p>
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
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Document' : 'Upload Document'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Document name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select type</option>
                  {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">File URL</label>
                <input type="text" value={form.fileUrl} onChange={e => setForm(p => ({ ...p, fileUrl: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {DOCUMENT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expiry Date</label>
                <input type="date" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee</label>
                <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Document description..." />
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
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search documents..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Types</option>
            {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {DOCUMENT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Expiry Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiFileText className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No documents found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  <tr key={doc.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === doc.id ? (
                      <td colSpan={6} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{doc.name}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(doc.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{doc.name}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getTypeLabel(doc.type)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{doc.employee ? `${doc.employee.firstName} ${doc.employee.lastName}` : '—'}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(doc.status)}>{doc.status}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(doc.expiryDate)}</td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(doc)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEdit(doc)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                              <button onClick={() => { setDeleteConfirmId(doc.id); setShowForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
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
