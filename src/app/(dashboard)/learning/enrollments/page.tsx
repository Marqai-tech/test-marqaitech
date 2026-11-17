'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUsers, FiPlus, FiX, FiSearch } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Enrollment {
  id: string; status: string; progress: number; dueDate: string | null; source: string; score?: number | null;
  preTestScore?: number | null; postTestScore?: number | null; completedAt?: string | null;
  course: { id: string; title: string; category: string; mode: string; passingScore: number };
  employee: { id: string; employeeId: string; firstName: string; lastName: string; department?: { name: string } };
  certificates: { id: string; certificateNo: string }[];
}
interface Course { id: string; title: string }
interface Dept { id: string; name: string }

const STATUS_BADGE: Record<string, string> = {
  assigned: 'thb-badge-warning', in_progress: 'thb-badge-info', completed: 'thb-badge-success', failed: 'thb-badge-error', expired: 'thb-badge-error',
};

export default function AssignmentsPage() {
  const user = useAuthStore((s) => s.user);
  const isApprover = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_manager', 'manager'].includes(user?.role || '');
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number>; overdue: number } | null>(null);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeId: string }[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({ assigneeType: 'individual', isMandatory: true });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/learning/enrollments?${status !== 'all' ? `status=${status}&` : ''}`, { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRows(j.data || []);
      setStats(j.stats);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load enrollments'); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const openAssign = async () => {
    setForm({ assigneeType: 'individual', isMandatory: true });
    setShowAssign(true);
    try {
      const [c, d, e] = await Promise.all([
        fetch('/api/learning/courses', { headers: getAuthHeaders() }).then((r) => r.json()),
        fetch('/api/departments', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch('/api/employees?limit=500', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ employees: [] })),
      ]);
      setCourses((c.data || []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })));
      setDepts((d.data || d.departments || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      const emps = (e.employees || e.data || []) as { id: string; firstName: string; lastName: string; employeeId: string }[];
      setEmployees(emps.map((x) => ({ id: x.id, name: `${x.firstName} ${x.lastName}`, employeeId: x.employeeId })));
    } catch { /* best-effort */ }
  };

  const submitAssign = async () => {
    try {
      const res = await fetch('/api/learning/assignments', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(`Assigned — ${j.data.created} enrolment${j.data.created === 1 ? '' : 's'} created${j.data.notified ? `, ${j.data.notified} notified` : ''}`);
      setShowAssign(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Assignment failed'); }
  };

  const complete = async (e: Enrollment) => {
    const scoreStr = prompt(`Assessment score for "${e.employee.firstName} ${e.employee.lastName}" — "${e.course.title}" (pass ≥ ${e.course.passingScore}%):`, '80');
    if (scoreStr === null) return;
    try {
      const res = await fetch(`/api/learning/enrollments/${e.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'complete', score: Number(scoreStr), preTestScore: 40, postTestScore: Number(scoreStr) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(j.certificate ? `Completed — certificate ${j.certificate.certificateNo} issued` : 'Recorded as failed (below passing score)');
      load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  const filtered = employees.filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiUsers className="text-emerald-500" /> Assignment &amp; Enrolment Engine</h1>
          <p className="text-sm thb-text-secondary mt-1">Assign mandatory or optional training to individuals, teams or departments with automated deadlines and live tracking.</p>
        </div>
        {isApprover && <button onClick={openAssign} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> Assign training</button>}
      </div>

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="thb-card p-3"><div className="text-xl font-bold thb-text-primary">{stats.total}</div><div className="text-[11px] thb-text-secondary">Total enrolments</div></div>
          {['assigned', 'in_progress', 'completed'].map((s) => (
            <div key={s} className="thb-card p-3"><div className="text-xl font-bold thb-text-primary">{stats.byStatus[s] || 0}</div><div className="text-[11px] thb-text-secondary capitalize">{s.replace('_', ' ')}</div></div>
          ))}
          <div className="thb-card p-3"><div className="text-xl font-bold text-amber-600">{stats.overdue}</div><div className="text-[11px] thb-text-secondary">Overdue</div></div>
        </div>
      ) : null}

      <div className="flex gap-2 flex-wrap">
        {['all', 'assigned', 'in_progress', 'completed', 'failed'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${status === s ? 'bg-emerald-500 text-white' : 'bg-gray-100 thb-text-secondary hover:bg-gray-200'}`}>{s.replace('_', ' ')}</button>
        ))}
      </div>

      {loading ? <div className="thb-card h-64 animate-pulse" /> : rows.length === 0 ? (
        <div className="thb-card p-10 text-center thb-text-muted text-sm">No enrolments in this view.</div>
      ) : (
        <div className="thb-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b thb-border text-left thb-text-secondary text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Result</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b thb-border last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3"><div className="font-medium thb-text-primary">{e.employee?.firstName} {e.employee?.lastName}</div><div className="text-[11px] thb-text-muted">{e.employee?.employeeId} · {e.employee?.department?.name || '—'}</div></td>
                  <td className="px-4 py-3"><div className="thb-text-primary">{e.course?.title}</div><div className="text-[11px] thb-text-muted capitalize">{e.course?.category?.replace('_', ' ')}</div></td>
                  <td className="px-4 py-3 text-xs thb-text-secondary">{e.source.replace('_', ' ')}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${e.progress}%` }} /></div><span className="text-[11px] thb-text-muted">{e.progress}%</span></div></td>
                  <td className="px-4 py-3 text-xs">{e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3"><span className={`thb-badge ${STATUS_BADGE[e.status] || ''}`}>{e.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3">
                    {e.status === 'completed' ? (
                      <span className="text-xs text-emerald-600 font-medium">{e.score !== null && e.score !== undefined ? `${e.score}%` : 'Passed'}{e.certificates?.length ? ` · ${e.certificates[0].certificateNo}` : ''}</span>
                    ) : isApprover ? (
                      <button onClick={() => complete(e)} className="px-2.5 py-1 text-xs rounded-md bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100">Record result</button>
                    ) : <span className="text-xs thb-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">Assign training</h2>
            <select className="w-full px-3 py-2 rounded-lg border thb-border text-sm" value={(form.courseId as string) || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              <option value="">Select course *</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              {['individual', 'department', 'company'].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, assigneeType: t })} className={`px-3 py-2 rounded-lg text-xs font-medium capitalize border transition ${form.assigneeType === t ? 'bg-emerald-500 text-white border-emerald-500' : 'thb-border thb-text-secondary'}`}>{t}</button>
              ))}
            </div>
            {form.assigneeType === 'individual' ? (
              <div>
                <div className="relative mb-2"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 thb-text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="w-full pl-9 pr-3 py-2 rounded-lg border thb-border text-sm" /></div>
                <div className="max-h-44 overflow-y-auto space-y-1 border thb-border rounded-lg p-2">
                  {filtered.map((e) => {
                    const selected = Array.isArray(form.employeeIds) && (form.employeeIds as string[]).includes(e.id);
                    return (
                      <button key={e.id} onClick={() => {
                        const cur = Array.isArray(form.employeeIds) ? (form.employeeIds as string[]) : [];
                        setForm({ ...form, employeeIds: selected ? cur.filter((x) => x !== e.id) : [...cur, e.id] });
                      }} className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm ${selected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 thb-text-primary'}`}>
                        <span>{e.name}</span><span className="text-[11px] thb-text-muted">{e.employeeId}{selected ? ' ✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : form.assigneeType === 'department' ? (
              <select className="w-full px-3 py-2 rounded-lg border thb-border text-sm" value={(form.departmentId as string) || ''} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select department *</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : <p className="text-xs thb-text-secondary bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">All active employees in the selected company context will be enrolled.</p>}
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="px-3 py-2 rounded-lg border thb-border text-sm" onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              <label className="flex items-center gap-2 text-sm thb-text-primary"><input type="checkbox" checked={Boolean(form.isMandatory)} onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })} /> Mandatory</label>
            </div>
            <input className="w-full px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Reason (optional)" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAssign(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary inline-flex items-center gap-1"><FiX /> Cancel</button>
              <button onClick={submitAssign} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Create enrolments</button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
