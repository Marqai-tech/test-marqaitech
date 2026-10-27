'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiPlus, FiX, FiClock } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TReq {
  id: string; status: string; requestType: string; title?: string; reason?: string; expectedCost?: number | null;
  reviewComments?: string; createdAt: string;
  employee: { id: string; employeeId: string; firstName: string; lastName: string; department?: { name: string } };
  course?: { id: string; title: string; cost: number } | null;
}

export default function CourseRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const isApprover = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_manager', 'manager'].includes(user?.role || '');
  const [rows, setRows] = useState<TReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [courses, setCourses] = useState<{ id: string; title: string; cost: number }[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({ requestType: 'self' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/learning/requests', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRows(j.data || []);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load requests'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const openForm = async () => {
    setForm({ requestType: 'self' });
    setShowForm(true);
    try {
      const c = await fetch('/api/learning/courses', { headers: getAuthHeaders() }).then((r) => r.json());
      setCourses((c.data || []).map((x: { id: string; title: string; cost: number }) => ({ id: x.id, title: x.title, cost: x.cost })));
    } catch { /* best effort */ }
  };

  const submit = async () => {
    try {
      const res = await fetch('/api/learning/requests', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success('Request submitted — your supervisor / L&D admin will review it');
      setShowForm(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Submit failed'); }
  };

  const act = async (r: TReq, action: 'approve' | 'reject') => {
    const comments = action === 'reject' ? prompt('Rejection reason:') : prompt('Approval note (optional):') || '';
    if (action === 'reject' && comments === null) return;
    try {
      const res = await fetch('/api/learning/requests', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ id: r.id, action, reviewComments: comments }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(action === 'approve' ? 'Approved — employee auto-enrolled' : 'Request rejected');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed'); }
  };

  const badge = (s: string) => (s === 'pending' ? 'thb-badge-warning' : s === 'approved' ? 'thb-badge-success' : s === 'rejected' ? 'thb-badge-error' : 'thb-badge-info');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiCheckCircle className="text-emerald-500" /> Course Nomination &amp; Approval</h1>
          <p className="text-sm thb-text-secondary mt-1">Employees request courses or HR assigns mandatory paths — supervisors and L&amp;D admins review based on budget and priorities.</p>
        </div>
        <button onClick={openForm} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> Request training</button>
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="thb-card h-20 animate-pulse" />)}</div> : rows.length === 0 ? (
        <div className="thb-card p-10 text-center thb-text-muted text-sm">No training requests yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="thb-card p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium thb-text-primary text-sm">{r.course?.title || r.title || 'Ad-hoc course'}</span>
                  <span className={`thb-badge ${badge(r.status)}`}>{r.status}</span>
                  <span className="thb-badge">{r.requestType.replace('_', ' ')}</span>
                  {r.expectedCost ? <span className="thb-badge">₹{Number(r.expectedCost).toLocaleString('en-IN')}</span> : null}
                </div>
                <div className="text-xs thb-text-secondary mt-1">
                  {r.employee?.firstName} {r.employee?.lastName} · {r.employee?.employeeId} · {r.employee?.department?.name || '—'} · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                </div>
                {r.reason ? <p className="text-xs thb-text-muted mt-1">Reason: {r.reason}</p> : null}
                {r.reviewComments ? <p className="text-xs thb-text-muted mt-1">Reviewer: {r.reviewComments}</p> : null}
              </div>
              {r.status === 'pending' && isApprover ? (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => act(r, 'approve')} className="px-3 py-1.5 text-xs rounded-md bg-emerald-500 text-white font-medium hover:bg-emerald-600">Approve &amp; enrol</button>
                  <button onClick={() => act(r, 'reject')} className="px-3 py-1.5 text-xs rounded-md border border-red-200 text-red-600 font-medium hover:bg-red-50">Reject</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">Request training</h2>
            <select className="w-full px-3 py-2 rounded-lg border thb-border text-sm" value={(form.courseId as string) || ''} onChange={(e) => {
              const c = courses.find((x) => x.id === e.target.value);
              setForm({ ...form, courseId: e.target.value, expectedCost: c?.cost || undefined });
            }}>
              <option value="">Select a course from the catalog</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <input className="w-full px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Or an external course title" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.requestType as string)} onChange={(e) => setForm({ ...form, requestType: e.target.value })}>
                <option value="self">Self nomination</option>
                <option value="manager_suggested">Manager suggested</option>
              </select>
              <input type="number" className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Expected cost (₹)" onChange={(e) => setForm({ ...form, expectedCost: Number(e.target.value) })} />
            </div>
            <textarea className="w-full px-3 py-2 rounded-lg border thb-border text-sm" rows={3} placeholder="Why do you need this training? (skill gap, project need, career goal…)" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary inline-flex items-center gap-1"><FiX /> Cancel</button>
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 inline-flex items-center gap-1"><FiClock /> Submit request</button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
