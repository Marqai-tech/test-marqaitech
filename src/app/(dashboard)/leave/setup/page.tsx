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
      {mode === 'form' && tab === 'policy' && <PolicyForm editId={editId} policies={policies} onCancel={() => go('policy')} onSaved={onSaved} sq={sq} />}
      {mode === 'list' && tab === 'rules' && <RulesList rules={rules} types={types} loading={loading} onCreate={() => go('rules', 'form')} onEdit={(id) => go('rules', 'form', id)} />}
      {mode === 'form' && tab === 'rules' && <RuleForm editId={editId} rules={rules} types={types} onCancel={() => go('rules')} onSaved={onSaved} sq={sq} />}
      {mode === 'list' && tab === 'mapping' && <MappingOverview types={types} policies={policies} rules={rules} loading={loading} />}
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

/* ═══ Policy Form (inline, 5-step) ═══ */
function PolicyForm({ editId, policies, onCancel, onSaved, sq }: { editId: string | null; policies: LPolicy[]; onCancel: () => void; onSaved: () => void; sq: string }) {
  const orig = editId && policies.find(p => p.id === editId);
  const [f, setF] = useState({
    title: orig?.title || '', code: orig?.code || '', description: orig?.description || '',
    status: orig?.status || 'draft', effectiveDate: orig?.effectiveDate || '',
    expiryDate: orig?.expiryDate || '', category: 'leave',
  });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const errs: Record<string, string> = {};
  if (!f.title.trim()) errs.title = 'Enter a policy name';
  const show = (k: string) => tried && errs[k];
  const inp = 'w-full h-10 border border-slate-200 rounded-lg px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

  const save = async () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { title: f.title, code: f.code, description: f.description, status: f.status, category: 'leave', effectiveDate: f.effectiveDate || null, expiryDate: f.expiryDate || null };
      const sep = sq ? `&${sq}` : '';
      const url = editId ? `/api/policies/${editId}?${sep}` : `/api/policies${sq ? `?${sq}` : ''}`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      toast.success(`Policy "${f.title}" saved`);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">
        <nav className="hidden lg:block sticky top-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-2">
          {[{ id: 'po-basic', label: 'Policy details' }, { id: 'po-period', label: 'Leave period' }].map((it, i) => (
            <a key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50" onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10.5px] font-extrabold text-slate-500">{i + 1}</span>{it.label}
            </a>
          ))}
        </nav>
        <div>
          <section id="po-basic" className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">1</div><div><h3 className="text-[14.5px] font-extrabold">Policy details</h3><p className="text-[12px] text-slate-500">Name the policy so HR can recognise it.</p></div></div>
            <div className="px-5 pb-4">
              <div className="grid grid-cols-2 gap-x-6">
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Policy name<span className="text-red-500 ml-0.5">*</span></label><input className={`${inp} ${show('title') ? 'border-red-300 bg-red-50' : ''}`} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Staff Leave Policy 2026"/>{show('title') && <div className="text-[11.5px] text-red-500 mt-1 font-semibold">{errs.title}</div>}</div>
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Policy code</label><input className={inp} value={f.code} onChange={e => set('code', e.target.value)} placeholder="POL-STF-26"/></div>
                <div className="pt-3.5 col-span-2"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Description</label><textarea className={`${inp} h-20 resize-vertical`} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Who is this policy for?"/></div>
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Status</label><div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{['Draft', 'Active', 'Inactive'].map(o => <button key={o} type="button" className={`h-8 px-4 rounded-md text-[12.5px] font-bold ${f.status === o.toLowerCase() ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => set('status', o.toLowerCase())}>{o}</button>)}</div><p className="text-[11.5px] text-slate-500 mt-1">Draft policies are not applied to employees</p></div>
              </div>
            </div>
          </section>
          <section id="po-period" className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">2</div><div><h3 className="text-[14.5px] font-extrabold">Leave period</h3><p className="text-[12px] text-slate-500">The leave accounting year.</p></div></div>
            <div className="px-5 pb-4">
              <div className="grid grid-cols-2 gap-x-6">
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Effective from</label><input type="date" className={inp} value={f.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} /></div>
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Effective to</label><input type="date" className={inp} value={f.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="sticky bottom-0 bg-slate-50/90 backdrop-blur border-t border-slate-200 py-3 flex gap-2.5 items-center z-5">
        <span className="text-[12.5px] text-slate-500">Fields marked <b className="text-red-500">*</b> are required</span>
        <span className="flex-1" />
        <button className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold hover:bg-slate-50" onClick={onCancel}>Cancel</button>
        <button className="h-10 px-5 rounded-xl bg-slate-800 text-white text-[13px] font-bold hover:bg-slate-900 shadow-md disabled:opacity-50" onClick={save} disabled={saving}>{saving ? 'Saving…' : (editId ? 'Save changes' : 'Create policy')}</button>
      </div>
    </div>
  );
}

/* ═══ Rule Form (inline) ═══ */
function RuleForm({ editId, rules, types, onCancel, onSaved, sq }: { editId: string | null; rules: LRule[]; types: LType[]; onCancel: () => void; onSaved: () => void; sq: string }) {
  const orig = editId && rules.find(r => r.id === editId);
  const [f, setF] = useState({
    name: orig?.name || '', leaveTypeId: orig?.leaveTypeId || orig?.typeId || '',
    status: orig?.status || 'draft',
    // Section 2: Entitlement & credit
    entitled: true, entitledDaysPerYear: String(orig?.entitledDaysPerYear || ''),
    creditFrequency: 'Monthly', creditDays: '',
    prorata: true, applyNextYear: false,
    // Section 3: Applying rules
    advanceNoticeDays: String(orig?.advanceNoticeDays || 0),
    minDaysPerRequest: String(orig?.minDaysPerRequest || 0.5),
    maxDaysPerRequest: String(orig?.maxDaysPerRequest || ''),
    maxStretch: '', halfDayAllowed: orig?.halfDayAllowed ?? true,
    monthlyLimit: false, monthlyMaxDays: '', monthlyMaxTimes: '',
    backDate: false, backDateWithin: '',
    docRequired: false, docAfterDays: '', docWithin: '',
    // Section 4: Day counting
    excludeHoliday: true, excludeWeeklyOff: true,
    // Section 5: Eligibility
    gender: orig?.gender || 'both', marital: 'both',
    empStatus: ['Confirmed'] as string[],
    workingReq: false, workingDays: '',
    esi: false, esiSalary: '',
    // Section 6: Carry forward & encash
    carryForward: orig?.carryForward ?? false, cfMode: 'Limited', cfDays: '',
    maxAccum: '', expiryDays: '',
    encash: false, encashLimit: '',
  });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const t = types.find(x => x.id === f.leaveTypeId);
  const errs: Record<string, string> = {};
  if (!f.leaveTypeId) errs.leaveTypeId = 'Select a leave type';
  if (!f.name.trim()) errs.name = 'Enter a rule name';
  if (f.entitled && !f.entitledDaysPerYear) errs.entitledDaysPerYear = 'Enter days per year';
  if (!f.maxDaysPerRequest) errs.maxDaysPerRequest = 'Enter maximum days';
  if (!f.empStatus.length) errs.empStatus = 'Select at least one status';
  const show = (k: string) => tried && errs[k];
  const inp = 'w-full h-10 border border-slate-200 rounded-lg px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const yn = (k: string) => <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5"><button type="button" className={'h-8 px-4 rounded-md text-[12.5px] font-bold ' + (f[k] ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500')} onClick={() => set(k, true)}>Yes</button><button type="button" className={'h-8 px-4 rounded-md text-[12.5px] font-bold ' + (!f[k] ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500')} onClick={() => set(k, false)}>No</button></div>;
  const seg = (k: string, opts: string[]) => <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{opts.map(o => <button key={o} type="button" className={'h-8 px-3.5 rounded-md text-[12.5px] font-bold ' + (f[k] === o.toLowerCase() || f[k] === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')} onClick={() => set(k, o.toLowerCase())}>{o}</button>)}</div>;
  const fld = (label: string, req?: boolean, hint?: string, err?: string, full?: boolean, children: React.ReactNode) => <div className={'pt-3.5 min-w-0 ' + (full ? 'col-span-2' : '')}>{label && <label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>}{children}{err ? <div className="text-[11.5px] text-red-500 mt-1 font-semibold">{err}</div> : hint ? <div className="text-[11.5px] text-slate-500 mt-1">{hint}</div> : null}</div>;
  const sec = (n: number, title: string, desc: string, id: string, children: React.ReactNode) => <section id={id} className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4"><div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">{n}</div><div><h3 className="text-[14.5px] font-extrabold">{title}</h3><p className="text-[12px] text-slate-500">{desc}</p></div></div><div className="px-5 pb-4">{children}</div></section>;

  // Live summary
  const summary: React.ReactNode[] = [];
  if (f.entitled && f.entitledDaysPerYear) summary.push(<li key="s1">Entitled to <b>{f.entitledDaysPerYear} days</b> per year{f.creditFrequency === 'Monthly' ? <>, credited <b>{(Number(f.entitledDaysPerYear) / 12).toFixed(1)} day(s) every month</b></> : f.creditFrequency === 'Yearly' ? <>, credited <b>at the start of the year</b></> : <>, granted <b>on request</b></>}{f.prorata ? ' (pro-rata for mid-year joiners)' : ''}.</li>);
  else summary.push(<li key="s1">No fixed yearly entitlement.</li>);
  summary.push(<li key="s2">Apply at least <b>{f.advanceNoticeDays || 0} day(s)</b> in advance; <b>{f.minDaysPerRequest || '?'}&ndash;{f.maxDaysPerRequest || '?'} days</b> per request{f.maxStretch ? <>, max <b>{f.maxStretch}</b> at a stretch</> : ''}. Half day: <b>{f.halfDayAllowed ? 'Yes' : 'No'}</b>.</li>);
  if (f.monthlyLimit) summary.push(<li key="s3">Monthly cap: <b>{f.monthlyMaxDays || '?'} days</b> or <b>{f.monthlyMaxTimes || '?'} times</b>.</li>);
  if (f.docRequired) summary.push(<li key="s4">Document needed if leave exceeds <b>{f.docAfterDays || 0} day(s)</b>, submit within <b>{f.docWithin || '?'} days</b>.</li>);
  summary.push(<li key="s5">{f.backDate ? <>Back-dated requests allowed up to <b>{f.backDateWithin || '?'} days</b>.</> : <>Back-dated requests <b>not allowed</b>.</>}</li>);
  summary.push(<li key="s6">Holidays {f.excludeHoliday ? <b>not counted</b> : <b>counted</b>}; weekly offs {f.excludeWeeklyOff ? <b>not counted</b> : <b>counted</b>}.</li>);
  const who = [f.gender !== 'both' && f.gender, f.marital !== 'both' && f.marital, f.empStatus.join(' / ')].filter(Boolean).join(', ');
  summary.push(<li key="s7">For <b>{who || 'all'}</b> employees{f.workingReq ? <>, after <b>{f.workingDays || '?'} working days</b></> : ''}{f.esi ? <>, ESI: salary up to <b>\u20B9{Number(f.esiSalary || 0).toLocaleString('en-IN')}</b></> : ''}.</li>);
  summary.push(<li key="s8">{f.carryForward ? <>Carry forward <b>{f.cfMode === 'All' ? 'all unused days' : 'up to ' + (f.cfDays || '?') + ' days'}</b>{f.maxAccum ? <>; max balance <b>{f.maxAccum} days</b></> : ''}.</> : <>Unused balance <b>lapses</b> at year end.</>}</li>);
  if (f.encash) summary.push(<li key="s9">Encashment allowed up to <b>{f.encashLimit || '?'} days</b>.</li>);
  if (f.expiryDays) summary.push(<li key="s10">Credit expires after <b>{f.expiryDays} days</b>.</li>);

  const save = async () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = {
        name: f.name, leaveTypeId: f.leaveTypeId, status: f.status,
        gender: f.gender, entitledDaysPerYear: Number(f.entitledDaysPerYear) || 0,
        minDaysPerRequest: Number(f.minDaysPerRequest) || 0.5, maxDaysPerRequest: Number(f.maxDaysPerRequest) || 0,
        advanceNoticeDays: Number(f.advanceNoticeDays) || 0, halfDayAllowed: f.halfDayAllowed,
        carryForwardToNextYear: f.carryForward, leaveEncashmentApplicable: f.encash,
        employmentType: 'all',
        // New spec fields
        creditFrequency: f.creditFrequency, creditDays: Number(f.creditDays) || (f.creditFrequency === 'Monthly' ? Number(f.entitledDaysPerYear) / 12 : Number(f.entitledDaysPerYear)),
        prorata: f.prorata, applyNextYear: f.applyNextYear,
        maxStretch: Number(f.maxStretch) || 0,
        monthlyLimit: f.monthlyLimit, monthlyMaxDays: Number(f.monthlyMaxDays) || 0, monthlyMaxTimes: Number(f.monthlyMaxTimes) || 0,
        backDate: f.backDate, backDateWithin: Number(f.backDateWithin) || 0,
        docRequired: f.docRequired, docAfterDays: Number(f.docAfterDays) || 0, docWithin: Number(f.docWithin) || 0,
        excludeHoliday: f.excludeHoliday, excludeWeeklyOff: f.excludeWeeklyOff,
        marital: f.marital, empStatus: f.empStatus,
        workingReq: f.workingReq, workingDays: Number(f.workingDays) || 0,
        esi: f.esi, esiSalary: Number(f.esiSalary) || 0,
        cfMode: f.cfMode, cfDays: Number(f.cfDays) || 0,
        maxAccum: Number(f.maxAccum) || 0, expiryDays: Number(f.expiryDays) || 0,
        encashLimit: Number(f.encashLimit) || 0,
      };
      const sep = sq ? '&' + sq : '';
      const url = editId ? '/api/leave-policy-rules/' + editId + '?' + sep : '/api/leave-policy-rules' + (sq ? '?' + sq : '');
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      toast.success('Rule "' + f.name + '" saved');
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_300px] gap-5 items-start">
        {/* Left nav */}
        <nav className="hidden lg:block sticky top-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-2">
          {[{id:'ru-basic',l:'Rule details'},{id:'ru-ent',l:'Entitlement & credit'},{id:'ru-apply',l:'Applying rules'},{id:'ru-count',l:'Day counting'},{id:'ru-elig',l:'Eligibility'},{id:'ru-cf',l:'Carry forward & encash'}].map((it,i) => (
            <a key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50" onClick={() => document.getElementById(it.id)?.scrollIntoView({behavior:'smooth',block:'start'})}>
              <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10.5px] font-extrabold text-slate-500">{i+1}</span>{it.l}
            </a>
          ))}
        </nav>

        {/* Main form */}
        <div>
          {/* Section 1: Rule details */}
          {sec(1, 'Rule details', 'Which leave type these rules are for.', 'ru-basic',
            <div className="grid grid-cols-2 gap-x-6">
              {fld('Leave type', true, undefined, show('leaveTypeId'), false, <select className={inp + (show('leaveTypeId')?' border-red-300 bg-red-50':'')} value={f.leaveTypeId} onChange={e => { set('leaveTypeId', e.target.value); if (!f.name) { const ty = types.find(x => x.id === e.target.value); ty && set('name', ty.code + ' \u2013 Standard'); } }}><option value="">Select leave type\u2026</option>{types.filter(x => x.status === 'active').map(x => <option key={x.id} value={x.id}>{x.code} \u2013 {x.name}</option>)}</select>)}
              {fld('Rule name', true, undefined, show('name'), false, <input className={inp + (show('name')?' border-red-300 bg-red-50':'')} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. CL \u2013 Standard"/>)}
              {fld('Status', undefined, undefined, undefined, false, seg('status', ['Draft', 'Active', 'Inactive']))}
            </div>
          )}

          {/* Section 2: Entitlement & credit */}
          {sec(2, 'Entitlement & credit', 'How many days the employee gets and when they are added.', 'ru-ent',
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100">
                <div><b className="block text-[13px] font-bold">Entitled days required?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">No = leave without a fixed balance (e.g. LOP, Comp Off)</span></div>
                {yn('entitled')}
              </div>
              {f.entitled && <div className="grid grid-cols-3 gap-x-6 py-3">
                {fld('Entitled days per year', true, undefined, show('entitledDaysPerYear'), false, <input type="number" className={inp + (show('entitledDaysPerYear')?' border-red-300 bg-red-50':'')} value={f.entitledDaysPerYear} onChange={e => { set('entitledDaysPerYear', e.target.value); if (f.creditFrequency === 'Monthly') set('creditDays', String((Number(e.target.value) / 12).toFixed(1))); }} placeholder="12"/>)}
                {fld('Credit frequency', undefined, undefined, undefined, false, <select className={inp} value={f.creditFrequency} onChange={e => { set('creditFrequency', e.target.value); if (e.target.value === 'Monthly' && f.entitledDaysPerYear) set('creditDays', String((Number(f.entitledDaysPerYear) / 12).toFixed(1))); if (e.target.value === 'Yearly' && f.entitledDaysPerYear) set('creditDays', f.entitledDaysPerYear); }}><option>Monthly</option><option>Quarterly</option><option>Yearly</option><option>On request</option></select>)}
                {fld('Credit days', undefined, f.creditFrequency === 'Monthly' ? 'Auto = yearly \u00F7 12' : '', undefined, false, <input type="number" className={inp} value={f.creditDays} onChange={e => set('creditDays', e.target.value)} placeholder="1"/>)}
              </div>}
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Pro-rata applicable?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Mid-year joiners get days in proportion</span></div>{yn('prorata')}</div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3"><div><b className="block text-[13px] font-bold">Can employees apply for next year\u2019s leave?</b></div>{yn('applyNextYear')}</div>
            </div>
          )}

          {/* Section 3: Applying rules */}
          {sec(3, 'Applying rules', 'Limits checked when an employee submits a request.', 'ru-apply',
            <div>
              <div className="grid grid-cols-3 gap-x-6 pb-3">
                {fld('Apply how many days before?', '0 = same day allowed', undefined, undefined, false, <input type="number" className={inp} value={f.advanceNoticeDays} onChange={e => set('advanceNoticeDays', e.target.value)} placeholder="0"/>)}
                {fld('Minimum days per request', undefined, undefined, undefined, false, <input type="number" step="0.5" className={inp} value={f.minDaysPerRequest} onChange={e => set('minDaysPerRequest', e.target.value)} placeholder="0.5"/>)}
                {fld('Maximum days per request', true, undefined, show('maxDaysPerRequest'), false, <input type="number" className={inp + (show('maxDaysPerRequest')?' border-red-300 bg-red-50':'')} value={f.maxDaysPerRequest} onChange={e => set('maxDaysPerRequest', e.target.value)} placeholder="3"/>)}
                {fld('Maximum at a stretch', 'Continuous days incl. adjoining leave', undefined, undefined, false, <input type="number" className={inp} value={f.maxStretch} onChange={e => set('maxStretch', e.target.value)} placeholder="3"/>)}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Half day leave applicable?</b></div>{yn('halfDayAllowed')}</div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Monthly limit applicable?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Restrict how much can be taken in one month</span></div>{yn('monthlyLimit')}</div>
              {f.monthlyLimit && <div className="grid grid-cols-2 gap-x-6 py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                {fld('Maximum days per month', undefined, undefined, undefined, false, <input type="number" className={inp} value={f.monthlyMaxDays} onChange={e => set('monthlyMaxDays', e.target.value)} placeholder="2"/>)}
                {fld('Maximum times per month', undefined, undefined, undefined, false, <input type="number" className={inp} value={f.monthlyMaxTimes} onChange={e => set('monthlyMaxTimes', e.target.value)} placeholder="2"/>)}
              </div>}
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Back-dated leave allowed?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Apply for a date that has already passed</span></div>{yn('backDate')}</div>
              {f.backDate && <div className="py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100"><div className="grid grid-cols-2 gap-x-6">{fld('Within how many days?', true, undefined, undefined, false, <input type="number" className={inp} value={f.backDateWithin} onChange={e => set('backDateWithin', e.target.value)} placeholder="7"/>)}</div></div>}
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3"><div><b className="block text-[13px] font-bold">Document required?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">e.g. medical certificate for sick leave</span></div>{yn('docRequired')}</div>
              {f.docRequired && <div className="py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100"><div className="grid grid-cols-2 gap-x-6">
                {fld('Required when leave is more than', '0 = always required', undefined, undefined, false, <input type="number" className={inp} value={f.docAfterDays} onChange={e => set('docAfterDays', e.target.value)} placeholder="2"/>)}
                {fld('Submit document within', true, undefined, undefined, false, <input type="number" className={inp} value={f.docWithin} onChange={e => set('docWithin', e.target.value)} placeholder="3"/>)}
              </div></div>}
            </div>
          )}

          {/* Section 4: Day counting */}
          {sec(4, 'Day counting', 'Whether non-working days inside a leave are deducted.', 'ru-count',
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Exclude holidays?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Yes = public holidays within the leave are not deducted</span></div>{yn('excludeHoliday')}</div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3"><div><b className="block text-[13px] font-bold">Exclude weekly offs?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Yes = Saturdays/Sundays within the leave are not deducted</span></div>{yn('excludeWeeklyOff')}</div>
            </div>
          )}

          {/* Section 5: Eligibility */}
          {sec(5, 'Eligibility', 'Who can use this leave under this rule.', 'ru-elig',
            <div>
              <div className="grid grid-cols-2 gap-x-6 pb-3">
                {fld('Gender', undefined, undefined, undefined, false, seg('gender', ['Both', 'Male', 'Female', 'Others']))}
                {fld('Marital status', undefined, undefined, undefined, false, seg('marital', ['Both', 'Married', 'Unmarried']))}
              </div>
              {fld('Employee status', true, undefined, show('empStatus'), true, <div className="flex flex-wrap gap-2 mt-1">{['Probation','Confirmed','Intern','Notice period'].map(o => { const on = f.empStatus.includes(o); return <span key={o} className={'inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[12.5px] font-semibold cursor-pointer ' + (on ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600')} onClick={() => set('empStatus', on ? f.empStatus.filter(x => x !== o) : [...f.empStatus, o])}><span className={'w-4 h-4 rounded border ' + (on ? 'bg-blue-500 border-blue-500' : 'border-slate-300') + ' flex items-center justify-center'}>{on && <FiCheck className="w-2.5 h-2.5 text-white"/>}</span>{o}</span>; })}</div>)}
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100 mt-3"><div><b className="block text-[13px] font-bold">Minimum working days required?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Employee must complete these days before using the leave</span></div>{yn('workingReq')}</div>
              {f.workingReq && <div className="py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100"><div className="grid grid-cols-2 gap-x-6">{fld('Within how many working days', undefined, undefined, undefined, false, <input type="number" className={inp} value={f.workingDays} onChange={e => set('workingDays', e.target.value)} placeholder="90"/>)}</div></div>}
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3"><div><b className="block text-[13px] font-bold">ESI applicable?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Only for employees under the ESI salary limit</span></div>{yn('esi')}</div>
              {f.esi && <div className="py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100"><div className="grid grid-cols-2 gap-x-6">{fld('Gross salary up to', undefined, undefined, undefined, false, <input type="number" className={inp} value={f.esiSalary} onChange={e => set('esiSalary', e.target.value)} placeholder="21000"/>)}</div></div>}
            </div>
          )}

          {/* Section 6: Carry forward & encashment */}
          {sec(6, 'Carry forward & encashment', 'What happens to unused balance at year end.', 'ru-cf',
            <div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Carry forward to next year?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">No = unused balance lapses</span></div>{yn('carryForward')}</div>
              {f.carryForward && <div className="grid grid-cols-2 gap-x-6 py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                {fld('Carry forward', undefined, undefined, undefined, false, seg('cfMode', ['All', 'Limited']))}
                {f.cfMode === 'Limited' && fld('Carry forward days', true, undefined, undefined, false, <input type="number" className={inp} value={f.cfDays} onChange={e => set('cfDays', e.target.value)} placeholder="6"/>)}
              </div>}
              <div className="grid grid-cols-2 gap-x-6 py-3">
                {fld('Maximum accumulation', 'Highest balance an employee can hold', undefined, undefined, false, <input type="number" className={inp} value={f.maxAccum} onChange={e => set('maxAccum', e.target.value)} placeholder="30"/>)}
                {fld('Credit expires after', 'Used for Comp Off; blank if no expiry', undefined, undefined, false, <input type="number" className={inp} value={f.expiryDays} onChange={e => set('expiryDays', e.target.value)} placeholder="60"/>)}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3 border-b border-dashed border-slate-100"><div><b className="block text-[13px] font-bold">Leave encashment applicable?</b><span className="block text-[11.5px] text-slate-500 mt-0.5">Unused days paid out at year end / exit</span></div>{yn('encash')}</div>
              {f.encash && <div className="py-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100"><div className="grid grid-cols-2 gap-x-6">{fld('Encashment limit', true, undefined, undefined, false, <input type="number" className={inp} value={f.encashLimit} onChange={e => set('encashLimit', e.target.value)} placeholder="30"/>)}</div></div>}
            </div>
          )}

          <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3 text-[12.5px] text-blue-800 mb-4"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5"/><span>A rule is created against one leave type chosen in Step 1. It becomes effective for employees only after a mapping references it in Step 4.</span></div>
        </div>

        {/* Right: Live Summary */}
        <aside className="hidden lg:block sticky top-4">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
            <div className="flex gap-2.5 items-center mb-2.5">
              {t && <CodeChip code={t.code} color={t.calendarColor}/>}
              <div><div className="text-[11px] font-extrabold tracking-wide uppercase text-slate-400">Live summary</div><div className="font-bold text-[13px]">{f.name || 'New rule'}</div></div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[12.5px] leading-relaxed"><ul className="list-disc pl-4 space-y-1 m-0">{summary}</ul></div>
            <p className="text-[11.5px] text-slate-500 mt-2.5">This is how the rule will read to HR and in the employee\u2019s leave policy page.</p>
          </div>
        </aside>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-slate-50/90 backdrop-blur border-t border-slate-200 py-3 flex gap-2.5 items-center z-5">
        <span className={'text-[12.5px] ' + (Object.keys(errs).length && tried ? 'text-red-500 font-semibold' : 'text-slate-500')}>{Object.keys(errs).length && tried ? Object.keys(errs).length + ' required field(s) missing' : <>Fields marked <b className="text-red-500">*</b> are required</>}</span>
        <span className="flex-1"/>
        <button className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold hover:bg-slate-50" onClick={onCancel}>Cancel</button>
        <button className="h-10 px-5 rounded-xl bg-slate-800 text-white text-[13px] font-bold hover:bg-slate-900 shadow-md disabled:opacity-50" onClick={save} disabled={saving}>{saving ? 'Saving\u2026' : (editId ? 'Save changes' : 'Create rule')}</button>
      </div>
    </div>
  );
}

