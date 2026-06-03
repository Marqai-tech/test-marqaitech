'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiFileText,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Document {
  id: string;
  name: string;
  type: string;
  fileUrl: string | null;
  status: string;
  uploadedAt: string;
  expiryDate: string | null;
  employeeId: string;
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

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    offer_letter: 'nexus-badge nexus-badge-purple',
    id_proof: 'nexus-badge nexus-badge-info',
    contract: 'nexus-badge nexus-badge-success',
    certificate: 'bg-orange-50 text-orange-700 nexus-badge',
    policy: 'nexus-badge nexus-badge-warning',
    other: 'nexus-badge nexus-badge-primary',
  };
  return map[type] || 'nexus-badge nexus-badge-info';
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    offer_letter: 'Offer Letter',
    id_proof: 'ID Proof',
    contract: 'Contract',
    certificate: 'Certificate',
    policy: 'Policy',
    other: 'Other',
  };
  return map[type] || type;
}

/* ── Component ── */
export default function DocumentsPage() {
  useAuthStore();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ name: '', type: 'offer_letter', employeeId: '', fileUrl: '' });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [docRes, empRes] = await Promise.all([
        fetch('/api/documents?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (docRes.ok) { const d = await docRes.json(); setDocuments(d.documents || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Upload Document */
  const handleUpload = async () => {
    if (!form.name || !form.type || !form.employeeId) { toast.error('Please fill all required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, status: 'active' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Document uploaded successfully');
      setShowModal(false);
      setForm({ name: '', type: 'offer_letter', employeeId: '', fileUrl: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document');
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
            <FiFileText className="w-6 h-6" />
            Document Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee documents and records</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiUpload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Documents Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                  </tr>
                ))
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <FiFileText className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No documents found</p>
                  </td>
                </tr>
              ) : (
                documents.map(doc => (
                  <tr key={doc.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FiFileText className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
                        <span className="text-sm font-medium text-nexus-text-primary">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={getTypeBadge(doc.type)}>{getTypeLabel(doc.type)}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">
                      {doc.employee ? `${doc.employee.firstName} ${doc.employee.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={doc.status === 'active' ? 'nexus-badge nexus-badge-success' : doc.status === 'expired' ? 'nexus-badge nexus-badge-error' : 'nexus-badge nexus-badge-warning'}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(doc.uploadedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Upload Document</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Document Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Document name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="offer_letter">Offer Letter</option>
                  <option value="id_proof">ID Proof</option>
                  <option value="contract">Contract</option>
                  <option value="certificate">Certificate</option>
                  <option value="policy">Policy</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">File URL</label>
                <input type="text" value={form.fileUrl} onChange={e => setForm(p => ({ ...p, fileUrl: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="https://..." />
                <p className="text-xs text-nexus-text-muted mt-1">Enter the file URL or path</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleUpload} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
