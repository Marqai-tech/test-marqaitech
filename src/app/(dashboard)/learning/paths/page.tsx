'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiTarget, FiPlus, FiEdit2, FiTrash2, FiArrowUp, FiArrowDown, FiAward } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PathCourse { id: string; courseId: string; order: number; isRequired: boolean; course?: { id: string; title: string; category: string; durationHours: number; isPromotionGate: boolean } }
interface LPath {
  id: string; name: string; code?: string; description?: string; category: string; targetRole?: string;
  durationWeeks?: number; isPromotionTrack: boolean; status: string; pathCourses?: PathCourse[];
  enrollmentCount?: number; completionRate?: number | null;
}

const CATEGORIES = ['onboarding', 'compliance', 'role_transition', 'promotion', 'skill_upskilling'];

export default function LearningPathsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_manager'].includes(user?.role || '');
  const [paths, setPaths] = useState<LPath[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LPath | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        fetch('/api/learning/paths', { headers: getAuthHeaders() }).then((r) => r.json()),
        fetch('/api/learning/courses', { headers: getAuthHeaders() }).then((r) => r.json()),
      ]);
      if (p.error) throw new Error(p.error);
      setPaths(p.data || []);
      setCourses((c.data || []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load paths'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', category: 'skill_upskilling', status: 'active' }); setPicked([]); setShowForm(true); };
  const openEdit = (p: LPath) => {
    setEditing(p);
    setForm({ name: p.name, code: p.code, description: p.description, category: p.category, targetRole: p.targetRole, durationWeeks: p.durationWeeks, isPromotionTrack: p.isPromotionTrack, status: p.status });
    setPicked((p.pathCourses || []).sort((a, b) => a.order - b.order).map((pc) => pc.courseId));
    setShowForm(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...picked];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPicked(next);
  };

  const submit = async () => {
    try {
      const res = editing
        ? await fetch(`/api/learning/paths/${editing.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ ...form, courseIds: picked }) })
        : await fetch('/api/learning/paths', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, courseIds: picked }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(editing ? 'Path updated' : 'Learning path created');
      setShowForm(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
  };

  const remove = async (p: LPath) => {
    if (!confirm(`Delete path "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/learning/paths/${p.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Path deleted'); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiTarget className="text-emerald-500" /> Learning Paths</h1>
          <p className="text-sm thb-text-secondary mt-1">Structured course sequences for onboarding, compliance and role-based transitions — including promotion tracks.</p>
        </div>
        {isAdmin && <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> New Path</button>}
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="thb-card h-28 animate-pulse" />)}</div> : paths.length === 0 ? (
        <div className="thb-card p-10 text-center thb-text-muted text-sm">No learning paths yet{isAdmin ? ' — build the first one' : ''}.</div>
      ) : (
        <div className="space-y-4">
          {paths.map((p) => (
            <div key={p.id} className="thb-card p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold thb-text-primary">{p.name}</h3>
                    {p.isPromotionTrack ? <span className="thb-badge thb-badge-warning inline-flex items-center gap-1"><FiAward size={10} /> Promotion track{p.targetRole ? ` → ${p.targetRole}` : ''}</span> : null}
                    <span className="thb-badge thb-badge-info">{p.category.replace('_', ' ')}</span>
                    <span className="thb-badge">{p.status}</span>
                  </div>
                  <p className="text-xs thb-text-secondary mt-1">{p.description || 'No description'} {p.durationWeeks ? `· ${p.durationWeeks} weeks` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs thb-text-muted">{p.enrollmentCount || 0} enrolled{p.completionRate !== null && p.completionRate !== undefined ? ` · ${p.completionRate}% complete` : ''}</span>
                  {isAdmin ? (
                    <>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 thb-text-secondary"><FiEdit2 size={14} /></button>
                      <button onClick={() => remove(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><FiTrash2 size={14} /></button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {(p.pathCourses || []).sort((a, b) => a.order - b.order).map((pc, i) => (
                  <span key={pc.id} className="inline-flex items-center gap-1.5">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${pc.isRequired ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 thb-text-secondary'}`}>{i + 1}. {pc.course?.title}{pc.isRequired ? '' : ' (optional)'}</span>
                    <span className="thb-text-muted">→</span>
                  </span>
                ))}
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500 text-white">Path complete</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">{editing ? 'Edit learning path' : 'New learning path'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Path name *" value={(form.name as string) || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.category as string)} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              <input className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Target role (for promotion tracks)" value={(form.targetRole as string) || ''} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} />
              <input type="number" className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Duration (weeks)" value={(form.durationWeeks as number) || ''} onChange={(e) => setForm({ ...form, durationWeeks: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-sm thb-text-primary"><input type="checkbox" checked={Boolean(form.isPromotionTrack)} onChange={(e) => setForm({ ...form, isPromotionTrack: e.target.checked })} /> Promotion readiness track</label>
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.status as string)} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['draft', 'active', 'archived'].map((s) => <option key={s}>{s}</option>)}</select>
              <textarea className="sm:col-span-2 px-3 py-2 rounded-lg border thb-border text-sm" rows={2} placeholder="Description" value={(form.description as string) || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium thb-text-secondary block mb-1.5">Course sequence (pick in order — use arrows to reorder)</label>
              <div className="flex gap-2">
                <select className="flex-1 px-3 py-2 rounded-lg border thb-border text-sm" value="" onChange={(e) => { if (e.target.value) setPicked([...picked, e.target.value]); }}>
                  <option value="">+ Add course to path…</option>
                  {courses.filter((c) => !picked.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="mt-2 space-y-1.5">
                {picked.map((cid, i) => {
                  const c = courses.find((x) => x.id === cid);
                  return (
                    <div key={cid} className="flex items-center gap-2 p-2 rounded-lg border thb-border text-sm">
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[11px] flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="flex-1 thb-text-primary truncate">{c?.title || cid}</span>
                      <button onClick={() => move(i, -1)} className="p-1 rounded hover:bg-gray-100 thb-text-secondary"><FiArrowUp size={13} /></button>
                      <button onClick={() => move(i, 1)} className="p-1 rounded hover:bg-gray-100 thb-text-secondary"><FiArrowDown size={13} /></button>
                      <button onClick={() => setPicked(picked.filter((x) => x !== cid))} className="p-1 rounded hover:bg-red-50 text-red-500"><FiTrash2 size={13} /></button>
                    </div>
                  );
                })}
                {picked.length === 0 ? <p className="text-xs thb-text-muted py-2">No courses selected yet — the path needs at least one course.</p> : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary">Cancel</button>
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">{editing ? 'Save changes' : 'Create path'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
