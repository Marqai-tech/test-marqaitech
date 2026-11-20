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
interface LRule { id: string; name: string; leaveTypeId?: string; typeId?: string; status: string; entitledDaysPerYear?: number; entitledDays?: number; minDaysPerRequest?: number; minDays?: number; maxDaysPerRequest?: number; maxDays?: number; advanceNoticeDays?: number; noticeDays?: number; halfDayAllowed?: boolean; halfDay?: boolean; carryForwardToNextYear?: boolean; carryForward?: boolean; gender?: string; genderApplicability?: string; employmentType?: string; employeeStatus?: string; policyId?: string; branchId?: string | null; departmentId?: string | null; branch?: { name: string } | null; department?: { name: string } | null; }
interface LPolicy { id: string; title: string; name?: string; code?: string; version?: string; status: string; description?: string; category?: string; effectiveDate?: string; expiryDate?: string; }
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
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const sq = scopeQuery();
  const sep = sq ? `&${sq}` : '';
  const qsep = sq ? `?${sq}` : '';

  const fetchAll = useCallback(async () => {
    try { setLoading(true); const h = getAuthHeaders();
      const [t, r, p, m] = await Promise.all([
        fetch(`/api/leave-types?limit=100${sep}&includeInactive=1`, { headers: h }).catch(() => null),
        fetch(`/api/leave-policy-rules?limit=100${sep}`, { headers: h }).catch(() => null),
        fetch(`/api/policies?category=leave&limit=100${sep ? `&${sq}` : ''}`, { headers: h }).catch(() => null),
        // BUG 240 FIX: pass includeInactive=1 so deactivated mappings show in the
        // list with an Activate button (otherwise they vanish and can't be re-activated).
        fetch(`/api/leave-type-policy-mappings${qsep ? qsep + '&includeInactive=1' : '?includeInactive=1'}`, { headers: h }).catch(() => null),
      ]);
      if (t?.ok) { const d = await t.json(); setTypes(d.data || []); }
      if (r?.ok) { const d = await r.json(); setRules(d.data || []); }
      if (p?.ok) { const d = await p.json(); setPolicies(d.data || d.policies || []); }
      if (m?.ok) { const d = await m.json(); setMappings(d.data || []); }
    } catch { toast.error('Failed to load leave setup data'); }
    finally { setLoading(false); }
  }, [sq]);

  useEffect(() => { if (isAdmin) fetchAll(); }, [fetchAll, isAdmin]);

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiSliders className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">Leave Setup is available to HR/Admin roles only.</p></div></div>;

  const counts = { types: types.length, policy: policies.length, rules: rules.length, mapping: mappings.length };
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
      {mode === 'list' && tab === 'policy' && <PolicyList policies={policies} types={types} rules={rules} mappings={mappings} loading={loading} onCreate={() => go('policy', 'form')} onEdit={(id) => go('policy', 'form', id)} />}
      {mode === 'form' && tab === 'policy' && <PolicyForm editId={editId} policies={policies} onCancel={() => go('policy')} onSaved={onSaved} sq={sq} />}
      {mode === 'list' && tab === 'rules' && <RulesList rules={rules} types={types} loading={loading} onCreate={() => go('rules', 'form')} onEdit={(id) => go('rules', 'form', id)} />}
      {mode === 'form' && tab === 'rules' && <RuleForm editId={editId} rules={rules} types={types} onCancel={() => go('rules')} onSaved={onSaved} sq={sq} />}
      {mode === 'list' && tab === 'mapping' && <MappingOverview types={types} policies={policies} rules={rules} mappings={mappings} loading={loading} onCreate={() => go('mapping', 'form')} onEdit={(policyId) => go('mapping', 'form', policyId)} onRefresh={fetchAll} />}
      {mode === 'form' && tab === 'mapping' && <MappingForm editPolicyId={editId} types={types} policies={policies} rules={rules} mappings={mappings} onCancel={() => go('mapping')} onSaved={onSaved} onGoToRules={() => go('rules', 'form')} sq={sq} />}
      {/* BUG_234 FIX: bottom padding so floating AI icon doesn't cover buttons */}
      <div className="h-16" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Types List
   ════════════════════════════════════════════════════════════════ */
function TypesList({ types, rules, loading, onCreate, onEdit }: { types: LType[]; rules: LRule[]; loading: boolean; onCreate: () => void; onEdit: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  // BUG_219 FIX: show ALL types (active + inactive) — filter by status only if user selects a filter
  const rows = types.filter(t =>
    (!cat || (t.category || 'paid') === cat) &&
    (!statusFilter || t.status === statusFilter) &&
    (t.name + t.code).toLowerCase().includes(q.toLowerCase())
  );
  const t = sel && types.find(x => x.id === sel);
  const rulesFor = t ? rules.filter(r => r.leaveTypeId === t.id || r.typeId === t.id) : [];

  // BUG_219 FIX: Activate/Deactivate handler
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/leave-types/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Leave type ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      // Refresh data — need to call parent's fetchAll
      window.location.reload();
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 flex-wrap">
        <h2 className="text-[15px] font-extrabold">Leave Types</h2><span className="text-[12px] text-slate-500">{types.length} types ({types.filter(t => t.status === 'active').length} active, {types.filter(t => t.status !== 'active').length} inactive)</span>
        <span className="flex-1" />
        <SearchBox value={q} onChange={setQ} placeholder="Search name or code" />
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All categories</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="statutory">Statutory</option><option value="special">Special</option>
        </select>
        {/* BUG_219 FIX: status filter */}
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
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
              <tr key={r.id} className={`border-b border-slate-50 cursor-pointer transition-colors ${sel === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'} ${r.status !== 'active' ? 'opacity-60' : ''}`} onClick={() => setSel(r.id)}>
                <td className="px-3.5 py-3 text-slate-400 font-bold text-[12px]">{i + 1}</td>
                <td className="px-3.5 py-3"><div className="flex items-center gap-2.5"><CodeChip code={r.code} color={r.calendarColor} /><div><div className="font-bold text-[13px]">{r.name}</div><div className="text-[11.5px] text-slate-500 max-w-xs truncate">{r.description || ''}</div></div></div></td>
                <td className="px-3.5 py-3"><CatPill c={(r.category || 'paid').charAt(0).toUpperCase() + (r.category || 'paid').slice(1)} /></td>
                <td className="px-3.5 py-3 text-[13px] text-slate-500 capitalize">{(r.smallestUnit || 'full_day').replace('_', ' ')}</td>
                <td className="px-3.5 py-3 text-center font-bold text-[13px]">{rules.filter(rr => rr.leaveTypeId === r.id || rr.typeId === r.id).length}</td>
                <td className="px-3.5 py-3 text-center"><StatusPill s={r.status === 'active' ? 'Active' : 'Inactive'} /></td>
                <td className="px-3.5 py-3 text-right">
                  <div className="flex items-center gap-1 ml-auto justify-end">
                    {/* BUG_219 FIX: Activate/Deactivate button */}
                    {r.status === 'active' ? (
                      <button className="h-8 px-2 rounded-lg border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-50" onClick={e => { e.stopPropagation(); handleToggleStatus(r.id, r.status); }} title="Deactivate">Deactivate</button>
                    ) : (
                      <button className="h-8 px-2 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-bold hover:bg-emerald-50" onClick={e => { e.stopPropagation(); handleToggleStatus(r.id, r.status); }} title="Activate">Activate</button>
                    )}
                    <button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50" onClick={e => { e.stopPropagation(); onEdit(r.id); }}><FiEdit2 className="w-3 h-3" />Edit</button>
                  </div>
                </td>
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
function PolicyList({ policies, types, rules, mappings, loading, onCreate, onEdit }: { policies: LPolicy[]; types: LType[]; rules: LRule[]; mappings: any[]; loading: boolean; onCreate: () => void; onEdit: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const rows = policies.filter(p => (p.title + (p.code || '')).toLowerCase().includes(q.toLowerCase()));
  const p = sel && policies.find(x => x.id === sel);

  // Derive "Applies To" and "Leave Types" for each policy from mappings + rules
  function policyInfo(policyId: string): { appliesTo: string; leaveTypeCodes: string[]; leaveTypeNames: string[] } {
    // Find mappings where the linked rule's policyId matches this policy
    const policyMappings = mappings.filter(m => {
      const rule = rules.find(r => r.id === m.policyRuleId);
      return rule?.policyId === policyId || m.policyId === policyId;
    });
    // Get leave type codes from the mappings
    const ltIds = [...new Set(policyMappings.map(m => m.leaveTypeId).filter(Boolean))];
    const ltCodes = ltIds.map(id => types.find(t => t.id === id)?.code).filter(Boolean) as string[];
    const ltNames = ltIds.map(id => types.find(t => t.id === id)?.name).filter(Boolean) as string[];
    // Derive "Applies To" from the rules' empStatusJson
    const policyRules = policyMappings.map(m => rules.find(r => r.id === m.policyRuleId)).filter(Boolean) as LRule[];
    let appliesTo = 'All employees';
    for (const r of policyRules) {
      const esj = (r as any).empStatusJson;
      if (esj) {
        try {
          const statuses: string[] = JSON.parse(esj);
          if (Array.isArray(statuses) && statuses.length > 0 && !statuses.map(s => s.toLowerCase()).includes('all')) {
            appliesTo = statuses.join(', ');
            break;
          }
        } catch {}
      }
    }
    return { appliesTo, leaveTypeCodes: ltCodes, leaveTypeNames: ltNames };
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
        <h2 className="text-[15px] font-extrabold">Leave Policies</h2><span className="text-[12px] text-slate-500">{policies.length} policies</span>
        <span className="flex-1" /><SearchBox value={q} onChange={setQ} placeholder="Search policy" />
        <button className="h-8 px-3 rounded-lg bg-slate-900 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-800" onClick={onCreate}><FiPlus className="w-3.5 h-3.5" />Create Policy</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['Policy Name', 'Applies To', 'Leave Types', 'Employees', 'Effective Date', 'Status', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 1 && i <= 4 ? '' : i === 6 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-500">No policies found. Click <b>+ Create Policy</b> to define who gets which leaves.</td></tr> :
             rows.map(r => {
               const info = policyInfo(r.id);
               return (
                <tr key={r.id} className={`border-b border-slate-50 cursor-pointer transition-colors ${sel === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSel(r.id)}>
                  <td className="px-3.5 py-3">
                    <div className="font-bold text-[13px] text-slate-900">{r.title}</div>
                    {r.code && <div className="text-[11px] text-slate-400 font-mono">{r.code}</div>}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="text-[12px] font-medium text-slate-700">{info.appliesTo}</span>
                  </td>
                  <td className="px-3.5 py-3">
                    {info.leaveTypeCodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {info.leaveTypeCodes.map((code, i) => (
                          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{code}</span>
                        ))}
                      </div>
                    ) : <span className="text-[12px] text-slate-300">—</span>}
                  </td>
                  <td className="px-3.5 py-3 text-center">
                    <span className="text-[13px] font-bold text-slate-700">—</span>
                  </td>
                  <td className="px-3.5 py-3 text-[12px] text-slate-500">{fmtDate(r.effectiveDate)}</td>
                  <td className="px-3.5 py-3"><StatusPill s={r.status === 'active' ? 'Active' : r.status === 'draft' ? 'Draft' : 'Inactive'} /></td>
                  <td className="px-3.5 py-3 text-right">
                    <button className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 hover:border-slate-400 transition-colors ml-auto" onClick={e => { e.stopPropagation(); onEdit(r.id); }}><FiEdit2 className="w-3 h-3" />Edit</button>
                  </td>
                </tr>
               );
             })}
          </tbody>
        </table>
      </div>
      {p && <Drawer onClose={() => setSel(null)} head={<div><h3 className="text-lg font-extrabold">{p.title}</h3><div className="text-[12px] text-slate-500">{p.code || ''}</div></div>} foot={<button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={() => onEdit(p.id)}><FiEdit2 className="w-3.5 h-3.5 inline mr-1" />Edit policy</button>}><KV items={[['Policy name', p.title], ['Applies to', policyInfo(p.id).appliesTo], ['Leave types', policyInfo(p.id).leaveTypeNames.join(', ') || '—'], ['Status', p.status], ['Effective', fmtDate(p.effectiveDate)], ['Description', p.description || '—', true]]} /></Drawer>}
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
          {/* BUG_223 FIX: added Document + Encash columns */}
          <thead><tr>{['Rule', 'Days/yr', 'Per req', 'Notice', 'Half day', 'Document', 'Carry fwd', 'Encash', 'Status', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 1 && i <= 7 ? 'text-center' : i === 9 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             rows.length === 0 ? <tr><td colSpan={10} className="text-center py-10 text-slate-500">No rules found.</td></tr> :
             rows.map(x => {
               const ty = types.find(t => t.id === (x.leaveTypeId || x.typeId));
               // BUG_224 FIX: derive actual values from the rule's fields
               const daysYr = x.entitledDaysPerYear ?? x.entitledDays ?? 0;
               const minReq = x.minDaysPerRequest ?? x.minDays ?? 0.5;
               const maxReq = x.maxDaysPerRequest ?? x.maxDays ?? 0;
               const perReqStr = maxReq > 0 ? `${minReq}–${maxReq}d` : `${minReq}d`;
               const notice = x.advanceNoticeDays ?? x.noticeDays ?? 0;
               const halfDay = x.halfDayAllowed ?? x.halfDay ?? false;
               // BUG_223 FIX: document requirement
               const docReq = (x as any).requireAttachment ?? (x as any).documentRequired ?? false;
               const docAfterDays = (x as any).requireAttachmentAfterDays ?? 0;
               const docStr = docReq ? (docAfterDays > 0 ? `>${docAfterDays}d` : 'Yes') : 'No';
               const carryFwd = x.carryForwardToNextYear ?? x.carryForward ?? false;
               // BUG_223 FIX: encashment
               const encash = (x as any).encashmentAllowed ?? (x as any).leaveEncashmentApplicable ?? false;
               // BUG_229 FIX: applicable to label derived from rule scope
               const applicableParts: string[] = [];
               const g = (x.genderApplicability || x.gender || 'all').toLowerCase();
               if (g !== 'all' && g !== 'both') applicableParts.push(g.charAt(0).toUpperCase() + g.slice(1));
               if (x.employmentType && x.employmentType !== 'all') applicableParts.push(x.employmentType.charAt(0).toUpperCase() + x.employmentType.slice(1));
               if (x.branch?.name) applicableParts.push(x.branch.name);
               if (x.department?.name) applicableParts.push(x.department.name);
               const applicableStr = applicableParts.length > 0 ? applicableParts.join(', ') : 'All';
               return (
                <tr key={x.id} className={`border-b border-slate-50 cursor-pointer ${sel === x.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSel(x.id)}>
                  {/* BUG_222 FIX: show colour-coded leave type code chip before rule name + applicable population below */}
                  <td className="px-3.5 py-3"><div className="flex items-center gap-2.5">{ty && <CodeChip code={ty.code} color={ty.calendarColor} />}<div><div className="font-bold text-[13px]">{x.name}</div><div className="text-[11.5px] text-slate-500">{applicableStr}</div></div></div></td>
                  {/* BUG_224 FIX: show actual values */}
                  <td className="px-3.5 py-3 text-center font-bold text-[13px]">{daysYr > 0 ? daysYr : '—'}</td>
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{perReqStr}</td>
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{notice}d</td>
                  <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${halfDay ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{halfDay ? 'Yes' : 'No'}</span></td>
                  {/* BUG_223 FIX: Document column */}
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{docStr}</td>
                  <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${carryFwd ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{carryFwd ? 'Yes' : 'Lapse'}</span></td>
                  {/* BUG_223 FIX: Encash column */}
                  <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${encash ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{encash ? 'Yes' : 'No'}</span></td>
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
function PolicyForm({ editId, policies, types, onCancel, onSaved, sq }: { editId: string | null; policies: LPolicy[]; onCancel: () => void; onSaved: () => void; sq: string }) {
  const orig = editId && policies.find(p => p.id === editId);
  // Parse original scope fields from the policy (stored as JSON arrays in runtime columns)
  const parseJsonArray = (val: any): string[] => { try { const a = typeof val === 'string' ? JSON.parse(val) : val; return Array.isArray(a) ? a : []; } catch { return []; } };
  const [f, setF] = useState({
    title: orig?.title || '', code: orig?.code || '', description: orig?.description || '',
    status: orig?.status || 'draft', effectiveDate: orig?.effectiveDate || '',
    expiryDate: orig?.expiryDate || '', category: 'leave',
    // Section 2: Applies to — dynamic IDs from company APIs
    empStatus: parseJsonArray((orig as any)?.empStatus || ['Confirmed']),
    branchIds: parseJsonArray((orig as any)?.branchIds),
    departmentIds: parseJsonArray((orig as any)?.departmentIds),
    designationIds: parseJsonArray((orig as any)?.designationIds),
    // Section: Leave types — one policy can cover multiple leave types
    leaveTypeIds: parseJsonArray((orig as any)?.leaveTypeIds),
    // Section 3: Leave period
    yearStart: (orig as any)?.yearStart || 'January',
    // Section 4: Leave crediting
    creditMode: (orig as any)?.creditMode || 'Pro-rata monthly', creditDay: (orig as any)?.creditDay || 'First day of month', roundOff: (orig as any)?.roundOff || 'Nearest 0.5', schedulerDate: '',
    // Section 6: Approval & workflow
    approval: (orig as any)?.approvalFlow || 'Reporting Manager',
    wfManagerSelf: false, wfAllowHoliday: false, wfShowYearWise: false, wfRequireReason: true,
    wfCheckRules: true, wfAutoMonthly: false, wfShowTeam: false, wfShowEncash: false,
    wfCurrentYearOnly: false, wfYearEndPending: false,
  });
  const [pdfFile, setPdfFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  // Dynamic dropdown data
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const errs: Record<string, string> = {};
  if (!f.title.trim()) errs.title = 'Enter a policy name';
  if (!f.empStatus.length) errs.empStatus = 'Select at least one employee status';
  const show = (k: string) => tried && errs[k];
  const inp = 'w-full h-10 border border-slate-200 rounded-lg px-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const sec = (n: number, title: string, desc: string, id: string, children: React.ReactNode) => <section id={id} className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4"><div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">{n}</div><div><h3 className="text-[14.5px] font-extrabold">{title}</h3><p className="text-[12px] text-slate-500">{desc}</p></div></div><div className="px-5 pb-4">{children}</div></section>;
  const checks = (k: string, opts: string[], allLabel?: string) => {
    const isAll = allLabel && (f as any)[k].includes('All');
    const toggle = (o: string) => { const cur = (f as any)[k] as string[]; if (o === 'All') return set(k, isAll ? [] : ['All']); const base = cur.filter(v => v !== 'All'); set(k, base.includes(o) ? base.filter(v => v !== o) : [...base, o]); };
    const list = allLabel ? ['All', ...opts] : opts;
    return <div className="flex flex-wrap gap-2">{list.map(o => { const on = o === 'All' ? isAll : (f as any)[k].includes(o); return <span key={o} className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[12.5px] font-semibold cursor-pointer ${on ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => toggle(o)}><span className={`w-4 h-4 rounded border ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>{on && <FiCheck className="w-2.5 h-2.5 text-white" />}</span>{o === 'All' ? allLabel : o}</span>; })}</div>;
  };
  // Multi-select for ID-based dropdowns (branches, departments, designations, leave types)
  const multiSelectIds = (k: string, items: any[], labelKey: string, idKey: string, placeholder: string) => {
    const selectedIds: string[] = (f as any)[k] || [];
    const toggle = (id: string) => {
      const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
      set(k, next);
    };
    return (
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-[12px] text-slate-400">No {placeholder} available. Create some in Company setup first.</span>}
        {items.map(item => {
          const on = selectedIds.includes(item[idKey]);
          return (
            <span key={item[idKey]} className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[12.5px] font-semibold cursor-pointer ${on ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => toggle(item[idKey])}>
              <span className={`w-4 h-4 rounded border ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>{on && <FiCheck className="w-2.5 h-2.5 text-white" />}</span>
              {item[labelKey]}
            </span>
          );
        })}
      </div>
    );
  };
  const wfCheck = (k: string, label: string) => <div className="flex items-center gap-2.5 py-1.5"><span className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${(f as any)[k] ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`} onClick={() => set(k, !(f as any)[k])}>{(f as any)[k] && <FiCheck className="w-2.5 h-2.5 text-white" />}</span><span className="text-[12.5px] font-semibold text-slate-700">{label}</span></div>;

  // Fetch branches, departments, designations when company changes
  useEffect(() => {
    const cid = sq ? sq.split('=')[1] : '';
    if (!cid) return;
    const h = getAuthHeaders();
    Promise.all([
      fetch(`/api/branches?companyId=${cid}`, { headers: h }).catch(() => null),
      fetch(`/api/departments?companyId=${cid}`, { headers: h }).catch(() => null),
      fetch(`/api/designations?companyId=${cid}`, { headers: h }).catch(() => null),
    ]).then(async ([b, d, dg]) => {
      if (b?.ok) { const data = await b.json(); setBranches(data.data || data.branches || []); }
      if (d?.ok) { const data = await d.json(); setDepartments(data.data || data.departments || []); }
      if (dg?.ok) { const data = await dg.json(); setDesignations(data.data || data.designations || []); }
    });
  }, [sq]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError('');
    if (file.type !== 'application/pdf') { setPdfError('Only PDF files are allowed'); return; }
    if (file.size > 3 * 1024 * 1024) { setPdfError('File size must not exceed 3MB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setPdfFile({ name: file.name, dataUrl: reader.result as string }); };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body: any = {
        title: f.title, code: f.code, description: f.description, status: f.status, category: 'leave',
        effectiveDate: f.effectiveDate || null, expiryDate: f.expiryDate || null,
        // Scope fields — stored as JSON arrays in runtime columns
        empStatus: f.empStatus,
        branchIds: f.branchIds,
        departmentIds: f.departmentIds,
        designationIds: f.designationIds,
        leaveTypeIds: f.leaveTypeIds,
        creditMode: f.creditMode, creditDay: f.creditDay, roundOff: f.roundOff, yearStart: f.yearStart,
        approvalFlow: f.approval,
      };
      if (pdfFile) { body.fileUrl = pdfFile.dataUrl; body.fileName = pdfFile.name; body.fileMimeType = 'application/pdf'; body.fileSize = pdfFile.dataUrl.length; }
      if (editId) { body.id = editId; }
      const companyId = sq ? sq.split('=')[1] : '';
      const url = '/api/policies' + (companyId ? `?companyId=${companyId}` : '');
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
          {[{id:'po-basic',l:'Policy details'},{id:'po-types',l:'Leave types'},{id:'po-who',l:'Applies to'},{id:'po-period',l:'Leave period'},{id:'po-credit',l:'Leave crediting'},{id:'po-doc',l:'Policy document'},{id:'po-flow',l:'Approval & workflow'}].map((it,i) => (
            <a key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50" onClick={() => document.getElementById(it.id)?.scrollIntoView({behavior:'smooth',block:'start'})}>
              <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10.5px] font-extrabold text-slate-500">{i+1}</span>{it.l}
            </a>
          ))}
        </nav>
        <div>
          {/* Section 1: Policy details */}
          {sec(1,'Policy details','Name the policy so HR can recognise it.','po-basic',
            <div className="grid grid-cols-2 gap-x-6">
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Policy name<span className="text-red-500 ml-0.5">*</span></label><input className={`${inp} ${show('title')?'border-red-300 bg-red-50':''}`} value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Staff Leave Policy 2026"/>{show('title')&&<div className="text-[11.5px] text-red-500 mt-1 font-semibold">{errs.title}</div>}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Policy code</label><input className={inp} value={f.code} onChange={e=>set('code',e.target.value)} placeholder="POL-STF-26"/></div>
              <div className="pt-3.5 col-span-2"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Description</label><textarea className={`${inp} h-20 resize-vertical`} value={f.description} onChange={e=>set('description',e.target.value)} placeholder="Who is this policy for?"/></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Status</label><div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{['Draft','Active','Inactive'].map(o=><button key={o} type="button" className={`h-8 px-4 rounded-md text-[12.5px] font-bold ${f.status===o.toLowerCase()?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`} onClick={()=>set('status',o.toLowerCase())}>{o}</button>)}</div><p className="text-[11.5px] text-slate-500 mt-1">Draft policies are not applied to employees</p></div>
            </div>
          )}

          {/* Section 2: Leave types — one policy can cover multiple leave types */}
          {sec(2,'Leave types','Select which leave types this policy covers. One policy can be used for multiple leave types.','po-types',
            <div className="pt-3.5">
              <label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Applicable leave types</label>
              {types.filter(t => t.status === 'active').length === 0
                ? <p className="text-[12px] text-slate-400">No active leave types found. Create leave types in Step 1 first.</p>
                : multiSelectIds('leaveTypeIds', types.filter(t => t.status === 'active'), 'name', 'id', 'leave types')
              }
              <p className="text-[11.5px] text-slate-500 mt-2">Selected: {f.leaveTypeIds.length} leave type(s)</p>
            </div>
          )}

          {/* Section 3: Applies to — dynamic dropdowns from company APIs */}
          {sec(3,'Applies to','Employees matching ALL of these filters get this policy. Data is fetched from your company setup.','po-who',
            <div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Employee status<span className="text-red-500 ml-0.5">*</span></label>{checks('empStatus',['Probation','Confirmed','Intern','Notice period'])}{show('empStatus')&&<div className="text-[11.5px] text-red-500 mt-1 font-semibold">{errs.empStatus}</div>}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Branches</label>{multiSelectIds('branchIds', branches, 'name', 'id', 'branches')}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Departments</label>{multiSelectIds('departmentIds', departments, 'name', 'id', 'departments')}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Designations</label>{multiSelectIds('designationIds', designations, 'title', 'id', 'designations')}</div>
            </div>
          )}

          {/* Section 4: Leave period */}
          {sec(4,'Leave period','The leave accounting year — balances reset or carry forward at its end.','po-period',
            <div>
              <div className="grid grid-cols-3 gap-x-6">
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Leave year starts in</label><select className={inp} value={f.yearStart} onChange={e=>set('yearStart',e.target.value)}>{months.map(m=><option key={m}>{m}</option>)}</select></div>
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Effective from</label><input type="date" className={inp} value={f.effectiveDate} onChange={e=>set('effectiveDate',e.target.value)}/></div>
                <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Effective to</label><input type="date" className={inp} value={f.expiryDate} onChange={e=>set('expiryDate',e.target.value)}/></div>
              </div>
              <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3 mt-3 text-[12.5px] text-blue-800"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5"/><span>Leave year: <b>{f.yearStart} – {months[(months.indexOf(f.yearStart)+11)%12]}</b>. Year-end processing (carry forward, lapse, encashment) runs at the end of this period.</span></div>
            </div>
          )}

          {/* Section 5: Leave crediting */}
          {sec(5,'Leave crediting','When the leave balance is added to employee accounts.','po-credit',
            <div className="grid grid-cols-2 gap-x-6">
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Credit method</label><div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{['Pro-rata monthly','Advance (on joining)'].map(o=><button key={o} type="button" className={`h-8 px-3.5 rounded-md text-[12px] font-bold ${f.creditMode===o?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`} onClick={()=>set('creditMode',o)}>{o}</button>)}</div><p className="text-[11.5px] text-slate-500 mt-1">{f.creditMode==='Pro-rata monthly'?'Yearly entitlement ÷ 12, credited every month':'Full yearly entitlement credited upfront'}</p></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Credited on</label><select className={inp} value={f.creditDay} onChange={e=>set('creditDay',e.target.value)}>{f.creditMode==='Pro-rata monthly'?<><option>First day of month</option><option>Last day of month</option><option>Specific date of month</option></>:<><option>On policy assignment</option><option>Start of leave year</option><option>Specific date</option></>}</select></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Round off fractional days</label><select className={inp} value={f.roundOff} onChange={e=>set('roundOff',e.target.value)}><option>Nearest 0.5</option><option>Lower (0.5)</option><option>Higher (0.5)</option><option>Nearest whole day</option><option>No rounding</option></select><p className="text-[11.5px] text-slate-500 mt-1">e.g. 1.25 → 1.5 (nearest 0.5)</p></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Balance scheduler start date</label><input type="date" className={inp} value={f.schedulerDate} onChange={e=>set('schedulerDate',e.target.value)}/><p className="text-[11.5px] text-slate-500 mt-1">First date the system credits leave automatically</p></div>
            </div>
          )}

          {/* Section 6: Policy document (PDF upload, max 3MB) */}
          {sec(6,'Policy document','Upload the policy PDF (max 3MB, PDF only)','po-doc',
            <div className="pt-3.5">
              <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${pdfError?'border-red-300 bg-red-50':pdfFile?'border-emerald-400 bg-emerald-50':'border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'}`}>
                <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload}/>
                <FiFileText className={`w-5 h-5 flex-shrink-0 ${pdfError?'text-red-400':pdfFile?'text-emerald-500':'text-slate-400'}`}/>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate ${pdfError?'text-red-600':pdfFile?'text-emerald-700':'text-slate-600'}`}>{pdfFile?pdfFile.name:pdfError?pdfError:'Upload policy document (PDF only, max 3MB)'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{pdfFile?`${(pdfFile.dataUrl.length/1024).toFixed(0)} KB`:'Click to browse'}</p>
                </div>
                {pdfFile&&<button type="button" className="text-red-500 hover:text-red-700 p-1" onClick={e=>{e.preventDefault();setPdfFile(null);}}><FiX className="w-4 h-4"/></button>}
              </label>
              {pdfError&&<div className="text-[11.5px] text-red-500 mt-1.5 font-semibold">{pdfError}</div>}
            </div>
          )}

          {/* Section 7: Approval & workflow */}
          {sec(7,'Approval & workflow','How leave requests under this policy are approved and shown.','po-flow',
            <div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Approval flow</label><select className={inp} value={f.approval} onChange={e=>set('approval',e.target.value)}><option>Reporting Manager</option><option>Reporting Manager → HR</option><option>Reporting Manager → Dept. Head</option><option>Auto-approve</option></select></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Workflow settings</label><div className="grid grid-cols-2 gap-x-4">
                {wfCheck('wfManagerSelf','Manager can approve their own leave')}
                {wfCheck('wfAllowHoliday','Allow exceptions for holidays / working days')}
                {wfCheck('wfShowYearWise','Show year-wise leave balance')}
                {wfCheck('wfRequireReason','Leave reason is mandatory')}
                {wfCheck('wfCheckRules','Check rules when employee applies')}
                {wfCheck('wfAutoMonthly','Credit monthly leave automatically')}
                {wfCheck('wfShowTeam','Show team members on leave while applying')}
                {wfCheck('wfShowEncash','Show encashable balance in leave summary')}
                {wfCheck('wfCurrentYearOnly','Show only current-year summary to employees')}
                {wfCheck('wfYearEndPending','Allow year-end processing with pending requests')}
              </div></div>
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 bg-slate-50/90 backdrop-blur border-t border-slate-200 py-3 flex gap-2.5 items-center z-5">
        <span className={'text-[12.5px] '+(Object.keys(errs).length&&tried?'text-red-500 font-semibold':'text-slate-500')}>{Object.keys(errs).length&&tried?Object.keys(errs).length+' required field(s) missing':<>Fields marked <b className="text-red-500">*</b> are required</>}</span>
        <span className="flex-1"/>
        <button className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold hover:bg-slate-50" onClick={onCancel}>Cancel</button>
        <button className="h-10 px-5 rounded-xl bg-slate-800 text-white text-[13px] font-bold hover:bg-slate-900 shadow-md disabled:opacity-50" onClick={save} disabled={saving}>{saving?'Saving…':(editId?'Save changes':'Create policy')}</button>
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
      // BUG FIX: There is no /api/leave-policy-rules/[id]/route.ts — the PUT
      // handler lives in route.ts and reads `id` from the JSON body. Sending
      // PUT to /api/leave-policy-rules/{id} causes a 404 in Next.js App Router.
      // Send PUT to /api/leave-policy-rules with id in the body instead.
      if (editId) { body.id = editId; }
      const url = '/api/leave-policy-rules' + (sq ? '?' + sq : '');
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
              {fld('Leave type', true, undefined, show('leaveTypeId'), false, <select className={inp + (show('leaveTypeId')?' border-red-300 bg-red-50':'')} value={f.leaveTypeId} onChange={e => { set('leaveTypeId', e.target.value); if (!f.name) { const ty = types.find(x => x.id === e.target.value); ty && set('name', ty.code + ' \u2013 Standard'); } }}><option value="">Select leave type…</option>{types.filter(x => x.status === 'active').map(x => <option key={x.id} value={x.id}>{x.code} \u2013 {x.name}</option>)}</select>)}
              {fld('Rule name', true, undefined, show('name'), false, <input className={inp + (show('name')?' border-red-300 bg-red-50':'')} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. CL – Standard"/>)}
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
              <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center py-3"><div><b className="block text-[13px] font-bold">Can employees apply for next year's leave?</b></div>{yn('applyNextYear')}</div>
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
            <p className="text-[11.5px] text-slate-500 mt-2.5">This is how the rule will read to HR and in the employee's leave policy page.</p>
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


/* ═══ Mapping Overview — List view only (Matrix removed BUG 246) ═══ */
function MappingOverview({ types, policies, rules, mappings, loading, onCreate, onEdit, onRefresh }: {
  types: LType[]; policies: LPolicy[]; rules: LRule[]; mappings: any[];
  loading: boolean; onCreate: () => void; onEdit: (policyId: string) => void;
  onRefresh?: () => void;
}) {
  const [pf, setPf] = useState('');
  const [selRow, setSelRow] = useState<number | null>(null);
  const activeTypes = types.filter(t => t.status === 'active');

  // Build mapping rows from actual LeaveTypePolicyMapping data
  // BUG 244 FIX: Look up the policy from the mapping's policyRuleId → rule → policyId,
  // and as a fallback check the mapping row itself for a policyId column.
  const mappingRows: Array<{ policy: LPolicy | undefined; type: LType | undefined; rule: LRule | undefined; mapping: any }> = [];
  for (const m of mappings) {
    const lt = types.find(t => t.id === m.leaveTypeId);
    const rule = rules.find(r => r.id === m.policyRuleId);
    // Try multiple paths to find the policy: rule.policyId, mapping.policyId, mapping.policyRuleId→rule→policyId
    const policyId = rule?.policyId || m.policyId || m.policyId_;
    const policy = policyId ? policies.find(p => p.id === policyId) : undefined;
    mappingRows.push({ policy, type: lt, rule, mapping: m });
  }
  // BUG 242 FIX: Sort inactive mappings to the bottom. Active first (alphabetical
  // by policy then type), then inactive (alphabetical).
  mappingRows.sort((a, b) => {
    const sa = (a.mapping?.status || 'active') === 'active' ? 0 : 1;
    const sb = (b.mapping?.status || 'active') === 'active' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const pa = (a.policy?.title || '—').toLowerCase();
    const pb = (b.policy?.title || '—').toLowerCase();
    if (pa !== pb) return pa.localeCompare(pb);
    return (a.type?.name || '').toLowerCase().localeCompare((b.type?.name || '').toLowerCase());
  });
  // BUG 245 FIX: When a policy filter is selected, show mappings for that policy.
  // Previously the filter checked m.policy?.id which was undefined when the policy
  // wasn't found via rule.policyId. Now also match by the mapping's own policyId.
  const filtered = pf ? mappingRows.filter(m => m.policy?.id === pf || m.mapping?.policyId === pf) : mappingRows;

  // Side panel selected row
  const selected = selRow !== null ? filtered[selRow] : null;

  // Plain-words rule summary
  function ruleSummary(rule?: LRule): string {
    if (!rule) return 'No rule linked.';
    const parts: string[] = [];
    const days = rule.entitledDaysPerYear || rule.entitledDays || 0;
    if (days > 0) parts.push(`Entitled to ${days} days per year`);
    else parts.push('Unlimited days (e.g. LOP)');
    if (rule.halfDayAllowed || rule.halfDay) parts.push('Half-day allowed');
    const notice = rule.advanceNoticeDays || rule.noticeDays || 0;
    if (notice > 0) parts.push(`${notice} day(s) advance notice required`);
    if (rule.carryForwardToNextYear || rule.carryForward) parts.push('Carry forward: Yes');
    else parts.push('Carry forward: Lapse');
    const g = (rule.genderApplicability || rule.gender || 'all').toLowerCase();
    if (g !== 'all' && g !== 'both') parts.push(`Gender: ${g}`);
    if (rule.employmentType && rule.employmentType !== 'all') parts.push(`Employment: ${rule.employmentType}`);
    return parts.join('. ') + '.';
  }

  // BUG 240/243 FIX (CR-01): Replace Remove/Delete with Deactivate/Activate.
  // No mapping is ever deleted — only toggled. BUG 243: do NOT reload the page
  // (that sends the user back to Leave Types). Instead, update the mapping's
  // status in-place so the user stays on the Mapping tab and the row moves.
  const handleToggleStatus = async (mappingId: string, currentStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = currentStatus === 'active' ? 'inactive' : 'active';
    const msg = next === 'inactive'
      ? 'Deactivating this mapping will hide the leave type from new applications for affected employees. Existing balances and history are preserved. Continue?'
      : 'Activating this mapping will make the leave type available again for new applications. Continue?';
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/leave-type-policy-mappings/${mappingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(next === 'inactive' ? 'Mapping deactivated' : 'Mapping activated');
      setSelRow(null);
      // BUG 243 FIX: Refresh data from the server instead of reloading the page.
      // This keeps the user on the Mapping tab; the row re-sorts to the bottom
      // (inactive) or top (active) thanks to the BUG 242 sort fix.
      if (onRefresh) { onRefresh(); }
    } catch { toast.error('Failed to update mapping'); }
  };

  return (
    <div>
      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-400 uppercase">Total Types</p><p className="text-xl font-extrabold mt-1">{types.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-400 uppercase">Total Policies</p><p className="text-xl font-extrabold mt-1">{policies.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-400 uppercase">Total Rules</p><p className="text-xl font-extrabold mt-1">{rules.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-400 uppercase">Mappings</p><p className="text-xl font-extrabold mt-1 text-emerald-600">{mappings.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
          <h2 className="text-[15px] font-extrabold">Policy Mapping</h2><span className="text-[12px] text-slate-500">{mappings.length} mappings</span>
          <span className="flex-1" />
          {/* BUG 246 FIX: Matrix tab removed — list view only. */}
          <select className="h-8 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={pf} onChange={e => setPf(e.target.value)}>
            <option value="">All policies</option>{policies.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {/* BUG 252 FIX: Use navy/slate-900 button to match other Create buttons. */}
          <button onClick={onCreate} className="h-8 px-3.5 rounded-lg bg-slate-900 text-white text-[12.5px] font-bold flex items-center gap-1.5 hover:bg-slate-800 shadow-sm">
            <FiPlus className="w-3.5 h-3.5" /> Create Mapping
          </button>
        </div>

        {/* BUG 246 FIX: Matrix view removed — list view only. */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>{['Policy', 'Leave type', 'Rule applied', 'Days/year', 'Effective from', 'Status', 'Action'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i >= 3 && i <= 4 ? 'text-center' : i === 6 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {/* BUG 253 FIX: Add pb-16 to the table so the floating AI icon doesn't overlap the last row's action buttons. */}
              {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr> :
               filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-500">{pf ? 'No mappings for this policy yet. Click + Create Mapping to add one.' : 'No mappings yet. Click + Create Mapping to attach leave types and rules to a policy.'}</td></tr> :
               filtered.map((m, i) => (
                <tr key={m.mapping?.id || i} className={`border-b border-slate-50 cursor-pointer transition-colors ${selRow === i ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => setSelRow(i)}>
                  <td className="px-3.5 py-3 font-bold text-[13px]">{m.policy?.title || m.mapping?.policyName || '—'}</td>
                  <td className="px-3.5 py-3"><div className="flex items-center gap-2.5">{m.type && <CodeChip code={m.type.code} color={m.type.calendarColor} />}<span className="text-[13px]">{m.type?.name || m.mapping?.leaveTypeName || '—'}</span></div></td>
                  <td className="px-3.5 py-3 text-[13px] text-slate-600">{m.rule?.name || m.mapping?.policyRuleName || '—'}</td>
                  {/* BUG 250 FIX: Show days/year from the rule even when the rule object is found but entitledDaysPerYear is 0 — use 0 not '—'. Only show '—' when there's genuinely no rule. */}
                  <td className="px-3.5 py-3 text-center font-bold text-[13px]">{m.rule ? (m.rule.entitledDaysPerYear || m.rule.entitledDays || 0) : '—'}</td>
                  {/* BUG 249 FIX: Show effective from from the mapping's own effectiveFrom field (stored on LeaveTypePolicyMapping), not just from the policy. */}
                  <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{m.mapping?.effectiveFrom ? fmtDate(m.mapping.effectiveFrom) : (m.policy?.effectiveDate ? fmtDate(m.policy.effectiveDate) : '—')}</td>
                  <td className="px-3.5 py-3"><StatusPill s={(m.mapping?.status || 'active') === 'active' ? 'Active' : 'Inactive'} /></td>
                  <td className="px-3.5 py-3 text-right">
                    {/* BUG 241 FIX: The Edit button is a real clickable button (not just a hover icon) with a solid border and label. */}
                    <div className="flex items-center gap-1 ml-auto justify-end">
                      <button onClick={e => { e.stopPropagation(); if (m.policy?.id) onEdit(m.policy.id); else if (m.mapping?.policyId) onEdit(m.mapping.policyId); }} className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 hover:border-slate-400 transition-colors" title="Edit this policy's mapping"><FiEdit2 className="w-3 h-3" />Edit</button>
                      {m.mapping?.id && (m.mapping?.status || 'active') === 'active'
                        ? <button onClick={e => handleToggleStatus(m.mapping.id, 'active', e)} className="h-8 px-2 rounded-lg border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-50" title="Deactivate this mapping — hides leave from new applications, keeps history"><FiX className="w-3 h-3" />Deactivate</button>
                        : m.mapping?.id && <button onClick={e => handleToggleStatus(m.mapping.id, 'inactive', e)} className="h-8 px-2 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-bold hover:bg-emerald-50" title="Activate this mapping — makes leave available again"><FiCheck className="w-3 h-3" />Activate</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
              <tr><td colSpan={7} className="h-16" /></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Side panel — plain-words rule summary */}
      {selected && (
        <Drawer onClose={() => setSelRow(null)}
          head={<>
            {selected.type && <CodeChip code={selected.type.code} color={selected.type.calendarColor} />}
            <div><h3 className="text-lg font-extrabold">{selected.type?.name || '—'}</h3><div className="text-[12px] text-slate-500">{selected.policy?.title || '—'} · {selected.rule?.name || '—'}</div></div>
          </>}
          foot={<>
            <button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={() => { if (selected.policy?.id) onEdit(selected.policy.id); }}><FiEdit2 className="w-3.5 h-3.5 inline mr-1" />Edit mapping</button>
            {selected.mapping?.id && ((selected.mapping?.status || 'active') === 'active'
              ? <button className="h-9 px-3 rounded-lg border border-amber-200 text-amber-700 text-[12px] font-bold" onClick={() => handleToggleStatus(selected.mapping.id, 'active', { stopPropagation: () => {} } as any)}><FiX className="w-3.5 h-3.5 inline mr-1" />Deactivate</button>
              : <button className="h-9 px-3 rounded-lg border border-emerald-200 text-emerald-700 text-[12px] font-bold" onClick={() => handleToggleStatus(selected.mapping.id, 'inactive', { stopPropagation: () => {} } as any)}><FiCheck className="w-3.5 h-3.5 inline mr-1" />Activate</button>
            )}
          </>}>
          <div className="mb-5">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Mapping details</h4>
            <KV items={[
              ['Policy', selected.policy?.title || '—'],
              ['Leave type', selected.type?.name || '—'],
              ['Rule applied', selected.rule?.name || '—'],
              ['Days/year', String(selected.rule?.entitledDaysPerYear || selected.rule?.entitledDays || '—')],
              ['Effective from', selected.policy?.effectiveDate ? fmtDate(selected.policy.effectiveDate) : (selected.mapping?.effectiveFrom ? fmtDate(selected.mapping.effectiveFrom) : '—')],
              ['Status', (selected.mapping?.status || 'active')],
            ]} />
          </div>
          <div className="mb-5">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Rule summary</h4>
            <div className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[13px] text-slate-700 leading-relaxed">{ruleSummary(selected.rule)}</div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

/* ═══ Mapping Form — Create/Edit with Effective from + Policy banner + Replace logic ═══ */
function MappingForm({ editPolicyId, types, policies, rules, mappings, onCancel, onSaved, onGoToRules, sq }: {
  editPolicyId: string | null;
  types: LType[];
  policies: LPolicy[];
  rules: LRule[];
  mappings: any[];
  onCancel: () => void;
  onSaved: () => void;
  onGoToRules?: () => void;
  sq: string;
}) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(editPolicyId || '');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [rows, setRows] = useState<Array<{
    leaveTypeId: string; leaveTypeName: string; leaveTypeCode: string; calendarColor?: string;
    included: boolean; ruleId: string;
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId);

  // Initialize: when policy is selected or editPolicyId is set, load existing mappings
  useEffect(() => {
    if (editPolicyId && !selectedPolicyId) {
      setSelectedPolicyId(editPolicyId);
    }
  }, [editPolicyId]);

  useEffect(() => {
    if (!selectedPolicyId) {
      setRows([]);
      setEffectiveFrom('');
      return;
    }
    const policy = policies.find(p => p.id === selectedPolicyId);
    // Default effective from to policy's effectiveDate
    if (policy?.effectiveDate) {
      const d = new Date(policy.effectiveDate);
      setEffectiveFrom(d.toISOString().split('T')[0]);
    }
    // Load existing mappings for this policy — check the leave types that are already mapped
    const existingMappings = mappings.filter(m => {
      const rule = rules.find(r => r.id === m.policyRuleId);
      return rule?.policyId === selectedPolicyId;
    });
    const existingByLeaveType = new Map<string, string>(); // leaveTypeId → ruleId
    for (const m of existingMappings) {
      existingByLeaveType.set(m.leaveTypeId, m.policyRuleId);
    }
    // Build rows: all active leave types, pre-checked if they have existing mappings
    setRows(types.filter(t => t.status === 'active').sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map(lt => {
      const existingRuleId = existingByLeaveType.get(lt.id) || '';
      // Pre-select first active rule if no existing mapping but the type has rules
      const ltRules = rules.filter(r => (r.leaveTypeId || r.typeId) === lt.id && r.status === 'active');
      const firstRuleId = existingRuleId || (ltRules.length > 0 ? ltRules[0].id : '');
      return {
        leaveTypeId: lt.id, leaveTypeName: lt.name, leaveTypeCode: lt.code, calendarColor: lt.calendarColor,
        included: !!existingRuleId, // checked if it has an existing mapping
        ruleId: firstRuleId,
      };
    }));
  }, [selectedPolicyId, policies, types, rules, mappings]);

  const toggleInclude = (leaveTypeId: string) => {
    setRows(prev => prev.map(r => {
      if (r.leaveTypeId !== leaveTypeId) return r;
      const newIncluded = !r.included;
      // When including, auto-select first active rule if none selected
      if (newIncluded && !r.ruleId) {
        const ltRules = rules.filter(rr => (rr.leaveTypeId || rr.typeId) === leaveTypeId && rr.status === 'active');
        return { ...r, included: true, ruleId: ltRules[0]?.id || '' };
      }
      return { ...r, included: newIncluded };
    }));
  };

  const updateRule = (leaveTypeId: string, ruleId: string) => {
    setRows(prev => prev.map(r => r.leaveTypeId === leaveTypeId ? { ...r, ruleId } : r));
  };

  // Validation
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!selectedPolicyId) errors.policy = 'Select a policy';
    if (!effectiveFrom) errors.effectiveFrom = 'Set effective date';
    const includedRows = rows.filter(r => r.included);
    if (includedRows.length === 0) errors.rows = 'Tick at least one leave type';
    for (const r of includedRows) {
      if (!r.ruleId) errors[`rule_${r.leaveTypeId}`] = 'Select a rule';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error(`${Object.keys(validationErrors).length} item(s) need attention`);
      return;
    }
    setSaving(true);
    try {
      const includedRows = rows.filter(r => r.included && r.ruleId);
      const policy = policies.find(p => p.id === selectedPolicyId);
      const mappingStatus = (policy?.status || '').toLowerCase() === 'active' ? 'active' : 'draft';

      // BUG 240/CR-01 FIX: Deactivate (not delete) old mappings for this policy
      // before creating new ones. Per CR-01, no mapping is ever deleted — only
      // deactivated. History and balances are preserved.
      const oldMappings = mappings.filter(m => {
        const rule = rules.find(r => r.id === m.policyRuleId);
        return rule?.policyId === selectedPolicyId;
      });
      for (const old of oldMappings) {
        try { await fetch(`/api/leave-type-policy-mappings/${old.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status: 'inactive' }) }); } catch {}
      }

      // Create new mappings
      let ok = 0, fail = 0;
      for (const row of includedRows) {
        const rule = rules.find(r => r.id === row.ruleId);
        const payload = {
          leaveTypeId: row.leaveTypeId,
          policyRuleId: row.ruleId,
          priority: 10,
          employmentType: rule?.employmentType || 'all',
          genderApplicability: rule?.genderApplicability || rule?.gender || 'all',
          branchId: rule?.branchId || null,
          departmentId: rule?.departmentId || null,
          employeeIds: null,
          status: mappingStatus,
        };
        try {
          const res = await fetch('/api/leave-type-policy-mappings', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
          if (res.ok) ok++; else fail++;
        } catch { fail++; }
      }
      if (ok > 0) {
        toast.success(`${ok} leave type(s) mapped to "${policy?.title || 'policy'}"${fail > 0 ? `, ${fail} failed` : ''}`);
        onSaved();
      } else {
        toast.error('Failed to save mappings');
      }
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const includedCount = rows.filter(r => r.included).length;
  const missingCount = rows.filter(r => r.included && !r.ruleId).length;
  const errorCount = Object.keys(validationErrors).length;

  // Derive "Who" from a rule
  function whoBadges(rule?: LRule): Array<{ label: string; cls: string }> {
    if (!rule) return [{ label: '—', cls: 'bg-slate-100 text-slate-400' }];
    const badges: Array<{ label: string; cls: string }> = [];
    const g = (rule.genderApplicability || rule.gender || 'all').toLowerCase();
    if (g === 'male') badges.push({ label: 'Male', cls: 'bg-blue-50 text-blue-700' });
    else if (g === 'female') badges.push({ label: 'Female', cls: 'bg-pink-50 text-pink-700' });
    else if (g === 'other') badges.push({ label: 'Other', cls: 'bg-amber-50 text-amber-700' });
    if (rule.employmentType && rule.employmentType !== 'all') {
      if (rule.employmentType === 'internship') badges.push({ label: 'Probation', cls: 'bg-amber-50 text-amber-700' });
      else badges.push({ label: rule.employmentType.charAt(0).toUpperCase() + rule.employmentType.slice(1), cls: 'bg-teal-50 text-teal-700' });
    }
    if (rule.branch?.name) badges.push({ label: rule.branch.name, cls: 'bg-emerald-50 text-emerald-700' });
    if (rule.department?.name) badges.push({ label: rule.department.name, cls: 'bg-indigo-50 text-indigo-700' });
    if (badges.length === 0) badges.push({ label: 'All', cls: 'bg-slate-100 text-slate-600' });
    return badges;
  }

  // Check if rule's employment type mismatches policy's scope
  function statusMismatch(rule?: LRule): boolean {
    if (!rule || !selectedPolicy) return false;
    const policyDesc = (selectedPolicy.description || '').toLowerCase();
    const ruleEmpType = (rule.employmentType || 'all').toLowerCase();
    if (policyDesc.includes('probation') && ruleEmpType === 'full-time') return true;
    if (policyDesc.includes('confirmed') && ruleEmpType === 'internship') return true;
    return false;
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Leave</span><span className="text-slate-300">›</span>
          <span>Setup</span><span className="text-slate-300">›</span>
          <span>Mapping</span><span className="text-slate-300">›</span>
          <span className="text-violet-600 font-medium">{editPolicyId ? 'Edit Mapping' : 'Create Mapping'}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FiGrid className="w-5 h-5 text-violet-500" /> {editPolicyId ? 'Edit Mapping' : 'Create Mapping'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Select a policy, then tick the leave types to include and pick the applicable rule for each.</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
        </div>

        {/* Section 1 — Select Policy + Effective from + Info banner */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h3 className="text-sm font-semibold text-slate-900">Select Policy <span className="text-red-500">*</span></h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <div>
              <label className={`block text-xs font-medium mb-1 ${validationErrors.policy ? 'text-red-500' : 'text-slate-600'}`}>Leave Policy {validationErrors.policy && <span className="text-red-500">— {validationErrors.policy}</span>}</label>
              <select value={selectedPolicyId} onChange={e => { setSelectedPolicyId(e.target.value); setValidationErrors({}); }} className={`w-full px-3 py-2 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-violet-500/20 ${validationErrors.policy ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                <option value="">— Select a policy —</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.title}{(p.status || '').toLowerCase() === 'active' ? ' — Active' : ` — ${p.status}`}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${validationErrors.effectiveFrom ? 'text-red-500' : 'text-slate-600'}`}>Effective from <span className="text-red-500">*</span> {validationErrors.effectiveFrom && <span className="text-red-500">— {validationErrors.effectiveFrom}</span>}</label>
              <input type="date" value={effectiveFrom} onChange={e => { setEffectiveFrom(e.target.value); setValidationErrors(prev => { const c = {...prev}; delete c.effectiveFrom; return c; }); }} className={`w-full px-3 py-2 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-violet-500/20 ${validationErrors.effectiveFrom ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
            </div>
          </div>
          {/* Blue info banner */}
          {selectedPolicy && (
            <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold"><FiInfo className="w-3.5 h-3.5" />{selectedPolicy.title}</div>
              <div className="ml-5 space-y-0.5">
                <p><b>Applies to:</b> {selectedPolicy.description || 'All employees'}</p>
                <p><b>Leave year:</b> {selectedPolicy.effectiveDate ? fmtDate(selectedPolicy.effectiveDate) : '—'} → {selectedPolicy.expiryDate ? fmtDate(selectedPolicy.expiryDate) : '—'}</p>
                <p><b>Status:</b> {(selectedPolicy.status || '').toLowerCase() === 'active' ? 'Active' : selectedPolicy.status}</p>
                {mappings.filter(m => { const r = rules.find(rr => rr.id === m.policyRuleId); return r?.policyId === selectedPolicyId; }).length > 0 && (
                  <p className="text-blue-600 font-medium">✓ {mappings.filter(m => { const r = rules.find(rr => rr.id === m.policyRuleId); return r?.policyId === selectedPolicyId; }).length} existing mapping(s) loaded — editing will replace them.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2 — Leave Types & Rules */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            <h3 className="text-sm font-semibold text-slate-900">Leave Types &amp; Rules</h3>
            {validationErrors.rows && <span className="text-xs text-red-500 font-medium">— {validationErrors.rows}</span>}
          </div>
          {types.length === 0 ? (
            <div className="text-sm text-slate-500 bg-white rounded-lg p-4 border border-slate-200">No leave types configured. Create leave types first in Step 1.</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase w-16 text-center">Include</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Leave Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Rule to Apply</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase w-24">Days/Year</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Who</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => {
                    const ltRules = rules.filter(r => (r.leaveTypeId || r.typeId) === row.leaveTypeId && r.status === 'active');
                    const selectedRule = rules.find(r => r.id === row.ruleId);
                    const daysYr = selectedRule?.entitledDaysPerYear || selectedRule?.entitledDays || 0;
                    const hasRuleError = validationErrors[`rule_${row.leaveTypeId}`];
                    const mismatch = row.included && statusMismatch(selectedRule);
                    return (
                      <tr key={row.leaveTypeId} className={`transition-colors ${row.included ? '' : 'bg-slate-50/30 opacity-60'}`}>
                        <td className="px-4 py-3 text-center">
                          {/* BUG-LM-013 FIX: Disable the include checkbox when the leave type has no active rules. */}
                          <input type="checkbox" checked={row.included} onChange={() => toggleInclude(row.leaveTypeId)} disabled={ltRules.length === 0} className={`w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 ${ltRules.length === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.leaveTypeCode && <CodeChip code={row.leaveTypeCode} color={row.calendarColor} />}
                            <span className={`font-medium text-[13px] ${row.included ? 'text-slate-900' : 'text-slate-500'}`}>{row.leaveTypeName}</span>
                          </div>
                          {ltRules.length === 0 && (onGoToRules
                            ? <button type="button" onClick={onGoToRules} className="text-[10px] text-amber-600 font-semibold ml-1 underline underline-offset-2 hover:text-amber-700 hover:no-underline cursor-pointer transition-colors">No rule — create in Step 3 →</button>
                            : <span className="text-[10px] text-amber-600 font-medium ml-1">No rule — create in Step 3</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select value={row.ruleId} onChange={e => updateRule(row.leaveTypeId, e.target.value)} disabled={!row.included || ltRules.length === 0} className={`w-full text-xs px-2 py-1.5 rounded border bg-white outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 ${hasRuleError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                            <option value="">— Select rule —</option>
                            {ltRules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          {hasRuleError && <p className="text-[10px] text-red-500 mt-0.5">{hasRuleError}</p>}
                          {mismatch && <p className="text-[10px] text-amber-600 mt-0.5 font-medium">⚠ Rule's employee status doesn't match policy scope</p>}
                        </td>
                        <td className="px-4 py-3">
                          {row.included && selectedRule ? <><span className="font-bold text-slate-900 text-sm">{daysYr}</span><span className="text-xs text-slate-400 ml-1">days</span></> : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.included ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {whoBadges(selectedRule).map(b => <span key={b.label} className={`text-xs px-1.5 py-0.5 rounded ${b.cls}`}>{b.label}</span>)}
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Validation footer */}
          {errorCount > 0 && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {errorCount} item(s) need attention — highlighted in red above
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {includedCount > 0 ? `${includedCount} leave type(s) included${missingCount > 0 ? ` · ${missingCount} missing rule` : ''}` : 'No leave types included yet'}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-violet-500/25 flex items-center gap-2">
              {saving ? 'Saving...' : editPolicyId ? 'Save Changes' : `Save Mapping${includedCount > 0 ? ` (${includedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
