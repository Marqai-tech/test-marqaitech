'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiBookOpen, FiPlus, FiEdit2, FiTrash2, FiSearch, FiVideo, FiFileText, FiExternalLink, FiHelpCircle } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Module { title: string; type: string; contentUrl?: string; durationMins: number; isAssessment?: boolean }
interface Course {
  id: string; code?: string; title: string; description?: string; category: string; mode: string; provider?: string;
  externalUrl?: string; documentUrl?: string; contentUrl?: string; durationHours: number; level: string;
  skills?: string[]; objectives?: string; isCompliance: boolean; complianceCategory?: string; isPromotionGate: boolean;
  passingScore: number; cost: number; status: string; modules?: Module[];
  enrollmentCount?: number; completionRate?: number | null;
}

const CATEGORIES = ['technical', 'soft_skills', 'compliance', 'leadership', 'onboarding', 'domain'];
const MODES = ['e_learning', 'instructor_led', 'document', 'quiz', 'external_link', 'blended'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

const MODE_ICON = (m: string) => m === 'document' ? <FiFileText /> : m === 'external_link' ? <FiExternalLink /> : m === 'quiz' ? <FiHelpCircle /> : <FiVideo />;

export default function CourseCatalogPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_manager'].includes(user?.role || '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [modulesText, setModulesText] = useState('');

  const emptyForm = {
    title: '', code: '', description: '', category: 'technical', mode: 'e_learning', provider: '', externalUrl: '',
    durationHours: 2, level: 'beginner', skills: '', objectives: '', isCompliance: false, complianceCategory: '',
    isPromotionGate: false, passingScore: 60, cost: 0, status: 'published',
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category !== 'all') params.set('category', category);
      const res = await fetch(`/api/learning/courses?${params}`, { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setCourses(j.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally { setLoading(false); }
  }, [q, category]);

  useEffect(() => { const t = setTimeout(() => queueMicrotask(load), q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModulesText(''); setShowForm(true); };
  const openEdit = (c: Course) => {
    setEditing(c); setForm({ ...emptyForm, ...c, skills: Array.isArray(c.skills) ? c.skills.join(', ') : '' });
    setModulesText((c.modules || []).map((m) => `${m.type}|${m.title}|${m.durationMins}`).join('\n'));
    setShowForm(true);
  };

  const submit = async () => {
    try {
      const modules = modulesText.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
        const [type, title, mins] = l.split('|');
        return { type: type || 'video', title: title || `Module ${i + 1}`, durationMins: Number(mins) || 15 };
      });
      const payload = {
        ...form,
        skills: form.skills ? String(form.skills).split(',').map((s) => s.trim()).filter(Boolean) : [],
        modules,
      };
      const res = editing
        ? await fetch(`/api/learning/courses/${editing.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload) })
        : await fetch('/api/learning/courses', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(editing ? 'Course updated' : 'Course published to catalog');
      setShowForm(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
  };

  const remove = async (c: Course) => {
    if (!confirm(`Delete "${c.title}" and its enrollments?`)) return;
    try {
      const res = await fetch(`/api/learning/courses/${c.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Course deleted'); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiBookOpen className="text-emerald-500" /> Course Catalog &amp; Content Hub</h1>
          <p className="text-sm thb-text-secondary mt-1">Central repository for e-learning videos, documents, quizzes and external links.</p>
        </div>
        {isAdmin && <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> New Course</button>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 thb-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses by title or code…" className="w-full pl-9 pr-3 py-2 rounded-lg border thb-border text-sm bg-white thb-text-primary" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded-lg border thb-border text-sm bg-white thb-text-primary">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <div key={i} className="thb-card h-44 animate-pulse" />)}</div> : (
        courses.length === 0 ? <div className="thb-card p-10 text-center thb-text-muted text-sm">No courses yet{isAdmin ? ' — create the first course' : ''}.</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <div key={c.id} className="thb-card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-600">{MODE_ICON(c.mode)}<span className="text-[11px] uppercase tracking-wide font-semibold">{c.mode.replace('_', ' ')}</span></div>
                  <span className="thb-badge thb-badge-info">{c.level}</span>
                </div>
                <h3 className="font-semibold thb-text-primary mt-2 leading-snug">{c.title}</h3>
                <p className="text-xs thb-text-secondary mt-1 line-clamp-2 flex-1">{c.description || c.objectives || 'No description'}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {c.isCompliance ? <span className="thb-badge thb-badge-warning">Compliance · {c.complianceCategory}</span> : null}
                  {c.isPromotionGate ? <span className="thb-badge thb-badge-info">Promotion gate</span> : null}
                  <span className="thb-badge">{c.durationHours}h · {c.modules?.length || 0} modules</span>
                  {c.cost > 0 ? <span className="thb-badge">₹{Number(c.cost).toLocaleString('en-IN')}</span> : null}
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t thb-border">
                  <span className="text-[11px] thb-text-muted">{c.enrollmentCount || 0} enrolled{c.completionRate !== null && c.completionRate !== undefined ? ` · ${c.completionRate}% complete` : ''}</span>
                  {isAdmin ? (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 thb-text-secondary" title="Edit"><FiEdit2 size={14} /></button>
                      <button onClick={() => remove(c)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete"><FiTrash2 size={14} /></button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create / edit modal */}
      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">{editing ? 'Edit course' : 'New course'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="sm:col-span-2 px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Course title *" value={(form.title as string) || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Code (e.g. POSH-101)" value={(form.code as string) || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <input className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Provider" value={(form.provider as string) || ''} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.category as string)} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.mode as string)} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.level as string)} onChange={(e) => setForm({ ...form, level: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
              <input type="number" min="0" step="0.5" className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Duration (hours)" value={(form.durationHours as number) || ''} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} />
              <input className="sm:col-span-2 px-3 py-2 rounded-lg border thb-border text-sm" placeholder="External link / content URL" value={(form.externalUrl as string) || ''} onChange={(e) => setForm({ ...form, externalUrl: e.target.value })} />
              <input className="sm:col-span-2 px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Skills covered (comma separated — used for TNI matching)" value={(form.skills as string) || ''} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
              <textarea className="sm:col-span-2 px-3 py-2 rounded-lg border thb-border text-sm" rows={2} placeholder="Description / learning objectives" value={(form.description as string) || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label className="flex items-center gap-2 text-sm thb-text-primary"><input type="checkbox" checked={Boolean(form.isCompliance)} onChange={(e) => setForm({ ...form, isCompliance: e.target.checked })} /> Compliance course</label>
              {form.isCompliance ? <select className="px-3 py-2 rounded-lg border thb-border text-sm" value={(form.complianceCategory as string) || 'POSH'} onChange={(e) => setForm({ ...form, complianceCategory: e.target.value })}>{['POSH', 'CYBERSECURITY', 'SAFETY', 'DATA_PRIVACY', 'OTHER'].map((c) => <option key={c}>{c}</option>)}</select> : <span />}
              <label className="flex items-center gap-2 text-sm thb-text-primary"><input type="checkbox" checked={Boolean(form.isPromotionGate)} onChange={(e) => setForm({ ...form, isPromotionGate: e.target.checked })} /> Promotion-gate course</label>
              <input type="number" min="0" max="100" className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Passing score %" value={(form.passingScore as number) || ''} onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-medium thb-text-secondary block mb-1">Modules — one per line: <code>type|title|minutes</code> (type: video/document/quiz/link/live_session/on_job)</label>
              <textarea className="w-full px-3 py-2 rounded-lg border thb-border text-sm font-mono" rows={4} placeholder={'video|Introduction|10\nquiz|Knowledge check|15'} value={modulesText} onChange={(e) => setModulesText(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary">Cancel</button>
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">{editing ? 'Save changes' : 'Publish course'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
