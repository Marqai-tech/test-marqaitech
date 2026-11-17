'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiPlus, FiEdit2, FiX, FiCheck, FiSearch, FiChevronRight, FiChevronLeft,
  FiCopy, FiInfo, FiAlertCircle, FiRefreshCw, FiLayers, FiFileText,
  FiSliders, FiGrid, FiArrowLeft, FiArrowRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

/* ═══ Colors & helpers ═══ */
const CAT_COLORS: Record<string, string> = { Paid: 'bg-blue-50 text-blue-700 border-blue-200', Unpaid: 'bg-red-50 text-red-700 border-red-200', Statutory: 'bg-purple-50 text-purple-700 border-purple-200', Special: 'bg-amber-50 text-amber-700 border-amber-200' };
const STATUS_COLORS: Record<string, string> = { Active: 'bg-emerald-50 text-emerald-700 border-emerald-200', Draft: 'bg-amber-50 text-amber-700 border-amber-200', Inactive: 'bg-slate-100 text-slate-500 border-slate-200' };
const LV_COLORS = ['#2563EB', '#10B981', '#F97316', '#9333EA', '#EF4444', '#0EA5E9', '#D97706', '#64748B', '#DB2777'];
function tint(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function fmtDate(d: string) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

/* ═══ UI primitives ═══ */
function CodeChip({ code, color }: { code: string; color?: string }) {
  const c = color || '#64748B';
  return <span className="inline-grid place-items-center min-w-[38px] h-[30px] px-1.5 rounded-lg text-[11px] font-extrabold" style={{ background: tint(c, .1), color: c, border: `1px solid ${tint(c, .22)}` }}>{code}</span>;
}
function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{children}</span>;
}
function CatPill({ c }: { c: string }) { const cls = CAT_COLORS[c] || CAT_COLORS['Paid']; return <span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{c}</span>; }
function StatusPill({ s }: { s: string }) { const cls = STATUS_COLORS[s] || STATUS_COLORS['Inactive']; return <Pill cls={cls}>{s}</Pill>; }

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-56"><FiSearch className="w-3.5 h-3.5 text-slate-400" /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Search'} className="border-0 bg-transparent outline-none text-[13px] w-full" /></div>;
}

function Drawer({ onClose, head, foot, children }: { onClose: () => void; head: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <><div className="fixed inset-0 bg-slate-900/30 z-50" onClick={onClose} /><aside className="fixed top-0 right-0 bottom-0 w-[560px] max-w-full bg-white z-50 flex flex-col shadow-2xl"><div className="px-5 pt-5 pb-4 border-b border-slate-100 flex gap-3 items-start">{head}<button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><FiX className="w-4 h-4" /></button></div><div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>{foot && <div className="px-5 py-3 border-t border-slate-100 flex gap-2 bg-slate-50">{foot}</div>}</aside></>;
}

function KV({ items }: { items: Array<[string, any, boolean?]> }) {
  return <div className="grid grid-cols-2 border border-slate-100 rounded-xl overflow-hidden">{items.filter(Boolean).map(([l, v, full], i) => <div key={i} className={`p-3 border-b border-r border-slate-100 ${full ? 'col-span-2 border-r-0' : ''} ${i >= items.length - 2 ? 'border-b-0' : ''}`}><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">{l}</label><span className="text-[13px] font-bold">{v === '' || v == null ? '—' : String(v)}</span></div>)}</div>;
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{options.map(o => <button key={o} type="button" className={`h-8 px-3.5 rounded-md text-[12.5px] font-bold ${value === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => onChange(o)}>{o}</button>)}</div>;
}

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5"><button type="button" className={`h-8 px-4 rounded-md text-[12.5px] font-bold ${value ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`} onClick={() => onChange(true)}>Yes</button><button type="button" className={`h-8 px-4 rounded-md text-[12.5px] font-bold ${!value ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`} onClick={() => onChange(false)}>No</button></div>;
}

function Checks({ value = [], onChange, options, allLabel }: { value: string[]; onChange: (v: string[]) => void; options: string[]; allLabel?: string }) {
  const isAll = allLabel && value.includes('All');
  const toggle = (o: string) => { if (o === 'All') return onChange(isAll ? [] : ['All']); const base = value.filter(v => v !== 'All'); onChange(base.includes(o) ? base.filter(v => v !== o) : [...base, o]); };
  const list = allLabel ? ['All', ...options] : options;
  return <div className="flex flex-wrap gap-2">{list.map(o => { const on = o === 'All' ? isAll : value.includes(o); return <span key={o} className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[12.5px] font-semibold cursor-pointer ${on ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => toggle(o)}><span className={`w-4 h-4 rounded border ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>{on && <FiCheck className="w-2.5 h-2.5 text-white" />}</span>{o === 'All' ? allLabel : o}</span>; })}</div>;
}

function Field({ label, req, hint, err, full, children }: { label?: string; req?: boolean; hint?: string; err?: string; full?: boolean; children: React.ReactNode }) {
  return <div className={`pt-3.5 min-w-0 ${full ? 'col-span-2' : ''}`}>{label && <label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>}{children}{err ? <div className="text-[11.5px] text-red-500 mt-1 font-semibold">{err}</div> : hint ? <div className="text-[11.5px] text-slate-500 mt-1">{hint}</div> : null}</div>;
}

function Input({ value, onChange, suffix, bad, ...rest }: { value?: string; onChange: (v: string) => void; suffix?: string; bad?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const el = <input className={`w-full h-10 border rounded-lg px-3 text-[13px] outline-none transition-all ${bad ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`} value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} />;
  return suffix ? <div className="relative">{el}<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-slate-400 font-bold pointer-events-none">{suffix}</span></div> : el;
}

function Select({ value, onChange, options, placeholder, bad }: { value: string; onChange: (v: string) => void; options: Array<string | { value: string; label: string }>; placeholder?: string; bad?: boolean }) {
  return <select className={`w-full h-10 border rounded-lg px-3 text-[13px] font-semibold outline-none ${bad ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>{placeholder && <option value="">{placeholder}</option>}{options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

function FSec({ n, title, desc, children }: { n: number; title: string; desc?: string; children: React.ReactNode }) {
  return <section className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4"><div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">{n}</div><div><h3 className="text-[14.5px] font-extrabold">{title}</h3>{desc && <p className="text-[12px] text-slate-500">{desc}</p>}</div></div><div className="px-5 pb-4">{children}</div></section>;
}

function Q({ title, help, value, onChange, children }: { title: string; help?: string; value: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100 last:border-b-0"><div><b className="block text-[13px] font-bold">{title}</b>{help && <span className="block text-[11.5px] text-slate-500 mt-0.5">{help}</span>}</div><YesNo value={value} onChange={onChange} />{value && children && <div className="col-span-2 bg-slate-50 border border-slate-100 rounded-xl p-3.5">{children}</div>}</div>;
}

function FormFooter({ onCancel, onSave, isEdit, errCount, saveLabel }: { onCancel: () => void; onSave: () => void; isEdit: boolean; errCount: number; saveLabel?: string }) {
  return <div className="sticky bottom-0 bg-slate-50/90 backdrop-blur border-t border-slate-200 -mx-7 px-7 py-3 flex gap-2.5 items-center z-5"><span className={`text-[12.5px] ${errCount ? 'text-red-500 font-semibold' : 'text-slate-500'}`}>{errCount ? `${errCount} required field${errCount > 1 ? 's' : ''} missing` : <>Fields marked <b className="text-red-500">*</b> are required</>}</span><span className="flex-1" /><button className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold hover:bg-slate-50" onClick={onCancel}>Cancel</button><button className="h-10 px-5 rounded-xl bg-slate-800 text-white text-[13px] font-bold hover:bg-slate-900 shadow-md" onClick={onSave}>{saveLabel || (isEdit ? 'Save changes' : 'Create')}</button></div>;
}

/* ═══ Types ═══ */
interface LType { id: string; name: string; code: string; description?: string; category?: string; smallestUnit?: string; displayOrder?: number; calendarColor?: string; status: string; isPaid?: boolean; }
interface LRule { id: string; name: string; leaveTypeId?: string; typeId?: string; status: string; entitledDaysPerYear?: number; entitledDays?: number; minDaysPerRequest?: number; minDays?: number; maxDaysPerRequest?: number; maxDays?: number; advanceNoticeDays?: number; noticeDays?: number; halfDayAllowed?: boolean; halfDay?: boolean; carryForwardToNextYear?: boolean; carryForward?: boolean; gender?: string; employmentType?: string; employeeStatus?: string; }
interface LPolicy { id: string; title: string; name?: string; code?: string; status: string; description?: string; category?: string; effectiveDate?: string; expiryDate?: string; }
interface LMapping { id: string; policyId: string; typeId: string; ruleId: string; effectiveFrom: string; status: string; }

const STEPS = [
  { key: 'types', n: 1, label: 'Leave Types', desc: 'Name, code and category of each leave' },
  { key: 'policy', n: 2, label: 'Leave Policy', desc: 'Who it applies to, leave year, crediting' },
  { key: 'rules', n: 3, label: 'Leave Rules', desc: 'Entitlement, limits, carry forward' },
  { key: 'mapping', n: 4, label: 'Mapping', desc: 'Attach types + rules to a policy' },
];

export default function LeaveSetupPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [tab, setTab] = useState('types');
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editId, setEditId] = useState<string | null>(null);

  const [types, setTypes] = useState<LType[]>([]);
  const [rules, setRules] = useState<LRule[]>([]);
  const [policies, setPolicies] = useState<LPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const sq = scopeQuery();
  const sep = sq ? `&${sq}` : '';

  const fetchAll = useCallback(async () => {
    try { setLoading(true); const h = getAuthHeaders();
      const [t, r, p] = await Promise.all([
        fetch(`/api/leave-types?limit=100${sep}`, { headers: h }).catch(() => null),
        fetch(`/api/leave-policy-rules?limit=100${sep}`, { headers: h }).catch(() => null),
        fetch(`/api/policies?category=leave&limit=100${sep ? `&${sq}` : ''}`, { headers: h }).catch(() => null),
      ]);
      if (t?.ok) { const d = await t.json(); setTypes(d.data || []); }
      if (r?.ok) { const d = await r.json(); setRules(d.data || []); }
      if (p?.ok) { const d = await p.json(); setPolicies(d.data || d.policies || []); }
    } catch { toast.error('Failed to load leave setup data'); }
    finally { setLoading(false); }
  }, [sq]);

  useEffect(() => { if (isAdmin) fetchAll(); }, [fetchAll, isAdmin]);

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiSliders className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">Leave Setup is available to HR/Admin roles only.</p></div></div>;

  const counts = { types: types.length, policy: policies.length, rules: rules.length, mapping: 0 };
  const step = STEPS.find(s => s.key === tab)!;

  const go = (t: string, m: 'list' | 'form' = 'list', id: string | null = null) => { setTab(t); setMode(m); setEditId(id); window.scrollTo(0, 0); };
  const onSaved = () => { fetchAll(); go(tab); };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500 font-semibold">
        <span>Leave</span><FiChevronRight className="w-3 h-3" />
        <span onClick={() => go(tab)} className="cursor-pointer hover:text-slate-700">{step.label}</span>
        {mode === 'form' && <><FiChevronRight className="w-3 h-3" /><span className="text-slate-800 font-bold">{editId ? 'Edit' : 'Create'}</span></>}
      </div>

      {mode === 'list' ? (
        <>
          {/* Page header */}
          <div className="flex items-end gap-4 flex-wrap">
            <div><h1 className="text-2xl font-extrabold tracking-tight">Leave Setup</h1><p className="text-[13px] text-slate-500 mt-1 max-w-2xl">Set up leave in four steps, in this order. Each step uses what the previous step created — a leave reaches employees only after it is mapped to a policy.</p></div>
            <div className="ml-auto flex gap-2.5">
              <button onClick={fetchAll} className="h-8 px-3 text-[12px] font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5"><FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            </div>
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {STEPS.map(s => (
              <div key={s.key} className={`flex gap-3 items-start p-3.5 cursor-pointer border-r border-slate-100 last:border-r-0 transition-colors ${tab === s.key ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => go(s.key)}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-extrabold ${tab === s.key ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{s.n}</div>
                <div><b className="text-[13.5px] font-extrabold flex items-center gap-1.5">{s.label}<span className={`text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-full ${tab === s.key ? 'bg-white text-blue-500' : 'bg-slate-100 text-slate-400'}`}>{counts[s.key as keyof typeof counts]}</span></b><span className="block text-[11.5px] text-slate-500 font-medium mt-0.5 leading-tight">{s.desc}</span></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-end gap-4 flex-wrap">
          <button onClick={() => go(tab)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-50"><FiArrowLeft className="w-4 h-4" />Back</button>
          <div><h1 className="text-2xl font-extrabold tracking-tight">{editId ? `Edit ${step.label}` : `Create ${step.label}`}</h1><p className="text-[13px] text-slate-500 mt-1">Step {step.n} of 4 · {step.desc}</p></div>
        </div>
      )}

      {/* Content */}
      {mode === 'list' && tab === 'types' && <TypesList types={types} rules={rules} loading={loading} onCreate={() => go('types', 'form')} onEdit={(id) => go('types', 'form', id)} />}
      {mode === 'form' && tab === 'types' && <TypeForm editId={editId} types={types} onCancel={() => go('types')} onSaved={onSaved} scopeQuery={sq} />}
      {mode === 'list' && tab === 'policy' && <PolicyList policies={policies} loading={loading} onCreate={() => go('policy', 'form')} onEdit={(id) => go('policy', 'form', id)} />}
      {mode === 'list' && tab === 'rules' && <RulesList rules={rules} types={types} loading={loading} onCreate={() => go('rules', 'form')} onEdit={(id) => go('rules', 'form', id)} />}
      {mode === 'list' && tab === 'mapping' && <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center text-slate-500">Mapping view — select a policy to configure type + rule mappings.</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Types List
   ════════════════════════════════════════════════════════════════ */
function TypesList({ types, rules, loading, onCreate, onEdit }: { types: LType[]; rules: LRule[]; loading: boolean; onCreate: () => void; onEdit: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const rows = types.filter(t => (!cat || (t.category || 'paid') === cat) && (t.name + t.code).toLowerCase().includes(q.toLowerCase()));
  const t = sel && types.find(x => x.id === sel);
  const rulesFor = t ? rules.filter(r => r.leaveTypeId === t.id || r.typeId === t.id) : [];

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 flex-wrap">
        <h2 className="text-[15px] font-extrabold">Leave Types</h2><span className="text-[12px] text-slate-500">{types.length} types</span>
        <span className="flex-1" />
        <SearchBox value={q} onChange={setQ} placeholder="Search name or code" />
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All categories</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="statutory">Statutory</option><option value="special">Special</option>
        </select>
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5" />Create Leave Type</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['#', 'Leave type', 'Category', 'Smallest unit', 'Rules', 'Status', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 5 ? 'text-center' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-500">No leave types found.</td></tr> :
             rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-slate-50 cursor-pointer transition-colors ${sel === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSel(r.id)}>
                <td className="px-3.5 py-3 text-slate-400 font-bold text-[12px]">{i + 1}</td>
                <td className="px-3.5 py-3"><div className="flex items-center gap-2.5"><CodeChip code={r.code} color={r.calendarColor} /><div><div className="font-bold text-[13px]">{r.name}</div><div className="text-[11.5px] text-slate-500 max-w-xs truncate">{r.description || ''}</div></div></div></td>
                <td className="px-3.5 py-3"><CatPill c={(r.category || 'paid').charAt(0).toUpperCase() + (r.category || 'paid').slice(1)} /></td>
                <td className="px-3.5 py-3 text-[13px] text-slate-500 capitalize">{(r.smallestUnit || 'full_day').replace('_', ' ')}</td>
                <td className="px-3.5 py-3 text-center font-bold text-[13px]">{rulesFor.length}</td>
                <td className="px-3.5 py-3 text-center"><StatusPill s={r.status === 'active' ? 'Active' : 'Inactive'} /></td>
                <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e => { e.stopPropagation(); onEdit(r.id); }}><FiEdit2 className="w-3 h-3" />Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {t && (
        <Drawer onClose={() => setSel(null)}
          head={<><CodeChip code={t.code} color={t.calendarColor} /><div><h3 className="text-lg font-extrabold">{t.name}</h3><div className="text-[12px] text-slate-500">Code {t.code}</div></div></>}
          foot={<><button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={() => onEdit(t.id)}><FiEdit2 className="w-3.5 h-3.5 inline mr-1" />Edit leave type</button></>}>
          <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Basic details</h4>
            <KV items={[['Leave name', t.name], ['Short code', t.code], ['Category', t.category || 'paid'], ['Smallest unit', (t.smallestUnit || 'full_day').replace('_', ' ')], ['Status', t.status], ['Description', t.description || '—', true]]} />
          </div>
          <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Rules defined for this type ({rulesFor.length})</h4>
            {rulesFor.length ? <div className="flex flex-col gap-1.5">{rulesFor.map(r => <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 border border-slate-100 rounded-lg text-[12.5px]"><b>{r.name}</b><span className="flex-1" /><span className="text-slate-500">{r.entitledDaysPerYear || r.entitledDays || '—'} days/yr</span><StatusPill s={r.status === 'active' ? 'Active' : 'Inactive'} /></div>)}</div>
              : <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12.5px] text-amber-800"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5" />No rule yet — create one in Step 3 before mapping this type.</div>}
          </div>
        </Drawer>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Type Form (2-step wizard)
   ════════════════════════════════════════════════════════════════ */
function TypeForm({ editId, types, onCancel, onSaved, scopeQuery: sq }: { editId: string | null; types: LType[]; onCancel: () => void; onSaved: () => void; scopeQuery: string }) {
  const orig = editId && types.find(t => t.id === editId);
  const [f, setF] = useState({
    name: orig?.name || '', code: orig?.code || '', category: (orig?.category || 'paid').charAt(0).toUpperCase() + (orig?.category || 'paid').slice(1),
    unit: orig?.smallestUnit === 'half_day' ? 'Half day' : orig?.smallestUnit === 'hourly' ? 'Hourly' : 'Full day',
    description: orig?.description || '', color: orig?.calendarColor || '#2563EB', order: orig?.displayOrder || (types.length + 1), active: orig?.status !== 'inactive',
  });
  const [tried, setTried] = useState(false);
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const errs: Record<string, string> = {};
  if (!f.name.trim()) errs.name = 'Enter a leave name';
  if (!f.code.trim()) errs.code = 'Enter a short code';
  else if (types.some(t => t.code.toUpperCase() === f.code.trim().toUpperCase() && t.id !== editId)) errs.code = 'This code is already used';
  const show = (k: string) => tried && errs[k];

  const save = async () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    try {
      const body = {
        name: f.name, code: f.code.toUpperCase(), description: f.description,
        category: f.category.toLowerCase(), smallestUnit: f.unit.toLowerCase().replace(' ', '_'),
        calendarColor: f.color, displayOrder: Number(f.order) || 0,
        isPaid: f.category === 'Paid', status: f.active ? 'active' : 'inactive',
      };
      const sep = sq ? `&${sq}` : '';
      const url = editId ? `/api/leave-types/${editId}?${sep}` : `/api/leave-types?${sq || ''}`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      toast.success(`Leave type "${f.name}" saved`);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <>
      <div className="grid grid-cols-[1fr] lg:grid-cols-[200px_1fr] gap-5 items-start">
        <nav className="hidden lg:block sticky top-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-2">
          {[{ id: 'ty-basic', label: 'Basic details' }, { id: 'ty-display', label: 'Display' }].map((it, i) => <a key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50" onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10.5px] font-extrabold text-slate-500">{i + 1}</span>{it.label}</a>)}
        </nav>
        <div>
          <FSec n={1} title="Basic details" desc="What the leave is called and how it is paid.">
            <div className="grid grid-cols-2 gap-x-6">
              <Field label="Leave name" req err={show('name')} hint="As employees will see it"><Input value={f.name} onChange={v => set('name', v)} placeholder="e.g. Casual Leave" bad={show('name')} /></Field>
              <Field label="Short code" req err={show('code')} hint="2–5 letters, unique"><Input value={f.code} onChange={v => set('code', v.toUpperCase().slice(0, 5))} placeholder="CL" bad={show('code')} /></Field>
              <Field label="Category" hint="Paid · Unpaid · Statutory · Special"><Select value={f.category} onChange={v => set('category', v)} options={['Paid', 'Unpaid', 'Statutory', 'Special']} /></Field>
              <Field label="Smallest unit employees can apply" hint="Half day allows 0.5 day requests"><Seg value={f.unit} onChange={v => set('unit', v)} options={['Full day', 'Half day', 'Hourly']} /></Field>
              <Field label="Description" full><textarea className="w-full h-20 border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-vertical" value={f.description} onChange={e => set('description', e.target.value)} placeholder="When can this leave be used?" /></Field>
            </div>
          </FSec>
          <FSec n={2} title="Display" desc="How the leave appears in calendars and balance cards.">
            <div className="grid grid-cols-2 gap-x-6">
              <Field label="Colour"><div className="flex gap-2">{LV_COLORS.map(c => <span key={c} className={`w-7 h-7 rounded-lg cursor-pointer border-2 ${f.color === c ? 'border-slate-800' : 'border-white shadow'}`} style={{ background: c }} onClick={() => set('color', c)} />)}</div></Field>
              <Field label="Display order" hint="Order in employee lists"><Input type="number" value={String(f.order)} onChange={v => set('order', v)} /></Field>
              <Field label="Status"><Seg value={f.active ? 'Active' : 'Inactive'} onChange={v => set('active', v === 'Active')} options={['Active', 'Inactive']} /></Field>
              <Field label="Preview"><div className="flex items-center gap-2.5 h-10"><CodeChip code={f.code || '—'} color={f.color} /><div><div className="font-bold text-[13px]">{f.name || 'Leave name'}</div><div className="text-[11.5px] text-slate-500">{f.category} · {f.unit}</div></div></div></Field>
            </div>
          </FSec>
          <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3 text-[12.5px] text-blue-800"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>A leave type is only a name. Entitlement, limits and carry-forward are set in <b>Step 3 · Leave Rules</b>, and the type reaches employees only after <b>Step 4 · Mapping</b>.</span></div>
        </div>
      </div>
      <FormFooter onCancel={onCancel} onSave={save} isEdit={!!editId} errCount={tried ? Object.keys(errs).length : 0} saveLabel={editId ? 'Save changes' : 'Create leave type'} />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   Policy List
   ════════════════════════════════════════════════════════════════ */
function PolicyList({ policies, loading, onCreate, onEdit }: { policies: LPolicy[]; loading: boolean; onCreate: () => void; onEdit: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const rows = policies.filter(p => (p.title + (p.code || '')).toLowerCase().includes(q.toLowerCase()));
  const p = sel && policies.find(x => x.id === sel);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
        <h2 className="text-[15px] font-extrabold">Leave Policies</h2><span className="text-[12px] text-slate-500">{policies.length} policies</span>
        <span className="flex-1" /><SearchBox value={q} onChange={setQ} placeholder="Search policy" />
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5" />Create Policy</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['Policy', 'Status', 'Effective', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 1 && i <= 2 ? '' : i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-500">No policies found.</td></tr> :
             rows.map(r => (
              <tr key={r.id} className={`border-b border-slate-50 cursor-pointer ${sel === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSel(r.id)}>
                <td className="px-3.5 py-3"><div className="font-bold text-[13px]">{r.title}</div><div className="text-[11.5px] text-slate-500">{r.code || r.category || ''}</div></td>
                <td className="px-3.5 py-3"><StatusPill s={r.status === 'active' ? 'Active' : r.status === 'draft' ? 'Draft' : 'Inactive'} /></td>
                <td className="px-3.5 py-3 text-[13px] text-slate-500">{fmtDate(r.effectiveDate)}</td>
                <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e => { e.stopPropagation(); onEdit(r.id); }}><FiEdit2 className="w-3 h-3" />Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p && <Drawer onClose={() => setSel(null)} head={<div><h3 className="text-lg font-extrabold">{p.title}</h3><div className="text-[12px] text-slate-500">{p.code || ''}</div></div>} foot={<button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={() => onEdit(p.id)}><FiEdit2 className="w-3.5 h-3.5 inline mr-1" />Edit policy</button>}><KV items={[['Policy name', p.title], ['Status', p.status], ['Effective', fmtDate(p.effectiveDate)], ['Description', p.description || '—', true]]} /></Drawer>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Rules List
   ════════════════════════════════════════════════════════════════ */
function RulesList({ rules, types, loading, onCreate, onEdit }: { rules: LRule[]; types: LType[]; loading: boolean; onCreate: () => void; onEdit: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [tf, setTf] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const rows = rules.filter(r => (!tf || r.leaveTypeId === tf || r.typeId === tf) && r.name.toLowerCase().includes(q.toLowerCase()));
  const r = sel && rules.find(x => x.id === sel);
  const t = r && types.find(x => x.id === (r.leaveTypeId || r.typeId));

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
        <h2 className="text-[15px] font-extrabold">Leave Rules</h2><span className="text-[12px] text-slate-500">{rules.length} rules</span>
        <span className="flex-1" /><SearchBox value={q} onChange={setQ} placeholder="Search rule" />
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={tf} onChange={e => setTf(e.target.value)}>
          <option value="">All leave types</option>{types.map(t => <option key={t.id} value={t.id}>{t.code} – {t.name}</option>)}
        </select>
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5" />Create Rule</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['Rule', 'Days/yr', 'Per req', 'Notice', 'Half day', 'Carry fwd', 'Status', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 1 && i <= 5 ? 'text-center' : i === 7 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-slate-500">No rules found.</td></tr> :
             rows.map(x => {
               const ty = types.find(t => t.id === (x.leaveTypeId || x.typeId));
               return (
                <tr key={x.id} className={`border-b border-slate-50 cursor-pointer ${sel === x.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSel(x.id)}>
                  <td className="px-3.5 py-3"><div className="flex items-center gap-2.5">{ty && <CodeChip code={ty.code} color={ty.calendarColor} />}<div><div className="font-bold text-[13px]">{x.name}</div><div className="text-[11.5px] text-slate-500">{x.employmentType || x.employeeStatus || ''}</div></div></div></td>
                  <td className="px-3.5 py-3 text-center font-bold text-[13px]">{x.entitledDaysPerYear || x.entitledDays || '—'}</td>
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{x.minDaysPerRequest || x.minDays || 0.5}–{x.maxDaysPerRequest || x.maxDays || '?'}</td>
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{x.advanceNoticeDays || x.noticeDays || 0}d</td>
                  <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${x.halfDayAllowed || x.halfDay ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{x.halfDayAllowed || x.halfDay ? 'Yes' : 'No'}</span></td>
                  <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${x.carryForwardToNextYear || x.carryForward ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{x.carryForwardToNextYear || x.carryForward ? 'Yes' : 'Lapse'}</span></td>
                  <td className="px-3.5 py-3"><StatusPill s={x.status === 'active' ? 'Active' : 'Inactive'} /></td>
                  <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e => { e.stopPropagation(); onEdit(x.id); }}><FiEdit2 className="w-3 h-3" />Edit</button></td>
                </tr>
               );
             })}
          </tbody>
        </table>
      </div>
      {r && t && <Drawer onClose={() => setSel(null)} head={<><CodeChip code={t.code} color={t.calendarColor} /><div><h3 className="text-lg font-extrabold">{r.name}</h3><div className="text-[12px] text-slate-500">Rule for {t.name}</div></div></>} foot={<button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={() => onEdit(r.id)}><FiEdit2 className="w-3.5 h-3.5 inline mr-1" />Edit rule</button>}>
        <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Entitlement & credit</h4><KV items={[['Entitled days/year', r.entitledDaysPerYear || r.entitledDays || '—'], ['Min days/request', r.minDaysPerRequest || r.minDays || 0.5], ['Max days/request', r.maxDaysPerRequest || r.maxDays || '—'], ['Advance notice', (r.advanceNoticeDays || r.noticeDays || 0) + ' days'], ['Half day', (r.halfDayAllowed || r.halfDay) ? 'Yes' : 'No'], ['Gender', r.gender || 'Both'], ['Status', r.status]]} /></div>
        <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Carry forward & encashment</h4><KV items={[['Carry forward', (r.carryForwardToNextYear || r.carryForward) ? 'Yes' : 'No'], ['Status', r.status]]} /></div>
      </Drawer>}
    </div>
  );
}
