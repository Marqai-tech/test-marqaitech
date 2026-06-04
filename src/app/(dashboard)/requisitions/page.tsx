'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Requisition {
  id: string; requisitionId: string; positionType: string; numberOfOpenings: number; employmentType: string; priority: string; approvalStatus: string; status: string; skillsRequired: string | null; experienceRequired: string | null; salaryBudget: string | null; expectedJoiningDate: string | null;
  department?: { name: string } | null; designation?: { title: string } | null;
}

const approvalBadge: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  manager_approved: { bg: 'bg-blue-100', text: 'text-blue-700' },
  hr_approved: { bg: 'bg-purple-100', text: 'text-purple-700' },
  budget_approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
};

const priorityBadge: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-blue-100', text: 'text-blue-700' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function RequisitionsPage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    departmentId: '', designationId: '', positionType: 'new', numberOfOpenings: 1, employmentType: 'full-time', skillsRequired: '', experienceRequired: '', qualification: '', salaryBudget: '', priority: 'medium', expectedJoiningDate: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/requisitions', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setRequisitions(Array.isArray(data) ? data : data.requisitions || []); }
    } catch { toast.error('Failed to load requisitions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.departmentId) { toast.error('Department is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/requisitions', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Requisition raised');
      setShowCreateModal(false);
      setForm({ departmentId: '', designationId: '', positionType: 'new', numberOfOpenings: 1, employmentType: 'full-time', skillsRequired: '', experienceRequired: '', qualification: '', salaryBudget: '', priority: 'medium', expectedJoiningDate: '' });
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleApproval = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/requisitions/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ approvalStatus: action }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Requisition ${action.replace('_', ' ')}`);
      fetchData();
    } catch { toast.error('Action failed'); }
  };

  const nextApprovalStep = (current: string) => {
    if (current === 'pending') return 'manager_approved';
    if (current === 'manager_approved') return 'hr_approved';
    if (current === 'hr_approved') return 'budget_approved';
    return '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Manpower Requisitions</h1><p className="text-slate-500 mt-1">Raise and approve hiring requests</p></div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Raise Requisition</button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-4 w-3/4 bg-slate-200 rounded" /></div>))}</div>
      ) : requisitions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiAlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No requisitions found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Req ID', 'Department', 'Designation', 'Openings', 'Type', 'Priority', 'Approval Status', 'Status', 'Actions'].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requisitions.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{r.requisitionId?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.department?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.designation?.title || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.numberOfOpenings}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{r.employmentType}</span></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityBadge[r.priority]?.bg || ''} ${priorityBadge[r.priority]?.text || ''}`}>{r.priority}</span></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${approvalBadge[r.approvalStatus]?.bg || ''} ${approvalBadge[r.approvalStatus]?.text || ''}`}>{r.approvalStatus.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'open' ? 'bg-blue-100 text-blue-700' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.approvalStatus !== 'budget_approved' && r.approvalStatus !== 'rejected' && (
                          <button onClick={() => handleApproval(r.id, nextApprovalStep(r.approvalStatus))} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1"><FiCheck className="w-3 h-3" />Approve</button>
                        )}
                        {r.approvalStatus !== 'rejected' && r.approvalStatus !== 'budget_approved' && (
                          <button onClick={() => handleApproval(r.id, 'rejected')} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 flex items-center gap-1"><FiXCircle className="w-3 h-3" />Reject</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Raise Requisition</h2><button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Department *</label><input required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} placeholder="Department ID" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Designation</label><input value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })} placeholder="Designation ID" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Position Type</label><select value={form.positionType} onChange={(e) => setForm({ ...form, positionType: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="new">New</option><option value="replacement">Replacement</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Openings</label><input type="number" min={1} value={form.numberOfOpenings} onChange={(e) => setForm({ ...form, numberOfOpenings: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Employment</label><select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Skills Required</label><input value={form.skillsRequired} onChange={(e) => setForm({ ...form, skillsRequired: e.target.value })} placeholder="e.g. React, Node.js, Python" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Experience</label><input value={form.experienceRequired} onChange={(e) => setForm({ ...form, experienceRequired: e.target.value })} placeholder="e.g. 3-5 years" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Qualification</label><input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. B.Tech" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Salary Budget</label><input value={form.salaryBudget} onChange={(e) => setForm({ ...form, salaryBudget: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Priority</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Expected Joining</label><input type="date" value={form.expectedJoiningDate} onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
