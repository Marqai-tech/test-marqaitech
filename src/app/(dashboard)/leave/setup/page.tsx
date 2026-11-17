'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiX, FiCheck, FiSearch, FiChevronRight,
  FiInfo, FiRefreshCw, FiLayers, FiFileText, FiSliders, FiGrid,
  FiArrowLeft, FiCopy, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }
const CAT_COLORS: Record<string,string> = { Paid:'bg-blue-50 text-blue-700 border-blue-200', Unpaid:'bg-red-50 text-red-700 border-red-200', Statutory:'bg-purple-50 text-purple-700 border-purple-200', Special:'bg-amber-50 text-amber-700 border-amber-200' };
const LV_COLORS = ['#2563EB','#10B981','#F97316','#9333EA','#EF4444','#0EA5E9','#D97706','#64748B','#DB2777'];
function tint(h:string,a:number){const n=parseInt(h.slice(1),16);return`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`}
function fmtDate(d:string){if(!d)return'—';const dt=new Date(d);return isNaN(dt.getTime())?d:dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}

function CodeChip({code,color}:{code:string;color?:string}){const c=color||'#64748B';return<span className="inline-grid place-items-center min-w-[38px] h-[30px] px-1.5 rounded-lg text-[11px] font-extrabold"style={{background:tint(c,.1),color:c,border:`1px solid ${tint(c,.22)}`}}>{code}</span>}
function Pill({children,cls}:{children:React.ReactNode;cls:string}){return<span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}><span className="w-1.5 h-1.5 rounded-full bg-current"/>{children}</span>}
function CatPill({c}:{c:string}){const cls=CAT_COLORS[c]||CAT_COLORS['Paid'];return<span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{c}</span>}
function StatusPill({s}:{s:string}){const m:any={Active:'bg-emerald-50 text-emerald-700 border-emerald-200',Draft:'bg-amber-50 text-amber-700 border-amber-200',Inactive:'bg-slate-100 text-slate-500 border-slate-200',active:'bg-emerald-50 text-emerald-700 border-emerald-200',inactive:'bg-slate-100 text-slate-500 border-slate-200',draft:'bg-amber-50 text-amber-700 border-amber-200'};return<Pill cls={m[s]||m['Inactive']}>{s==='active'?'Active':s==='inactive'?'Inactive':s}</Pill>}

interface LType{id:string;name:string;code:string;description?:string;category?:string;smallestUnit?:string;displayOrder?:number;calendarColor?:string;status:string;isPaid?:boolean;defaultDays?:number;}
interface LRule{id:string;name:string;leaveTypeId?:string;typeId?:string;status:string;entitledDaysPerYear?:number;entitledDays?:number;minDaysPerRequest?:number;minDays?:number;maxDaysPerRequest?:number;maxDays?:number;advanceNoticeDays?:number;noticeDays?:number;halfDayAllowed?:boolean;halfDay?:boolean;carryForward?:boolean;gender?:string;employmentType?:string;employeeStatus?:string;}
interface LPolicy{id:string;title:string;name?:string;code?:string;status:string;description?:string;category?:string;effectiveDate?:string;expiryDate?:string;}

const STEPS=[
  {key:'types',n:1,label:'Leave Types',desc:'Name, code and category of each leave',single:'Leave Type'},
  {key:'policy',n:2,label:'Leave Policy',desc:'Who it applies to, leave year, crediting',single:'Policy'},
  {key:'rules',n:3,label:'Leave Rules',desc:'Entitlement, limits, carry forward',single:'Rule'},
  {key:'mapping',n:4,label:'Mapping',desc:'Attach types + rules to a policy',single:'Mapping'},
];

export default function LeaveSetupPage(){
  const{user}=useAuthStore();const isAdmin=['super_admin','tenant_admin','admin','hr_admin'].includes(user?.role||'');
  const scopeQuery=useCompanyContextStore(s=>s.scopeQuery);
  const[tab,setTab]=useState('types');const[mode,setMode]=useState<'list'|'form'>('list');const[editId,setEditId]=useState<string|null>(null);
  const[types,setTypes]=useState<LType[]>([]);const[rules,setRules]=useState<LRule[]>([]);const[policies,setPolicies]=useState<LPolicy[]>([]);const[loading,setLoading]=useState(true);
  const sq=scopeQuery();const sep=sq?`&${sq}`:'';

  const fetchAll=useCallback(async()=>{
    try{setLoading(true);const h=getAuthHeaders();
      const[t,r,p]=await Promise.all([
        fetch(`/api/leave-types?limit=100${sep}`,{headers:h}).catch(()=>null),
        fetch(`/api/leave-policy-rules?limit=100${sep}`,{headers:h}).catch(()=>null),
        fetch(`/api/policies?category=leave&limit=100${sq?`&${sq}`:''}`,{headers:h}).catch(()=>null),
      ]);
      if(t?.ok){const d=await t.json();setTypes(d.data||[]);}
      if(r?.ok){const d=await r.json();setRules(d.data||[]);}
      if(p?.ok){const d=await p.json();setPolicies(d.data||d.policies||[]);}
    }catch{toast.error('Failed to load');}finally{setLoading(false);}
  },[sq]);
  useEffect(()=>{if(isAdmin)fetchAll();},[fetchAll,isAdmin]);

  if(!isAdmin)return<div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiSliders className="w-12 h-12 text-slate-300 mx-auto mb-3"/><p className="text-sm text-slate-500">Leave Setup is available to HR/Admin roles only.</p></div></div>;

  const counts={types:types.length,policy:policies.length,rules:rules.length,mapping:0};
  const step=STEPS.find(s=>s.key===tab)!;
  const go=(t:string,m:'list'|'form'='list',id:string|null=null)=>{setTab(t);setMode(m);setEditId(id);window.scrollTo(0,0);};
  const onSaved=()=>{fetchAll();go(tab);};

  return(
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500 font-semibold">
        <span>Leave</span><FiChevronRight className="w-3 h-3"/>
        <span className="cursor-pointer hover:text-slate-700"onClick={()=>go(tab)}>{step.label}</span>
        {mode==='form'&&<><FiChevronRight className="w-3 h-3"/><span className="text-slate-800 font-bold">{editId?'Edit':'Create'}</span></>}
      </div>

      {mode==='list'&&(
        <>
          {/* Page header */}
          <div className="flex items-end gap-4 flex-wrap">
            <div><h1 className="text-2xl font-extrabold tracking-tight">Leave Setup</h1><p className="text-[13px] text-slate-500 mt-1 max-w-2xl">Set up leave in four steps, in this order. Each step uses what the previous step created.</p></div>
            <div className="ml-auto"><button onClick={fetchAll} className="h-8 px-3 text-[12px] font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5"><FiRefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`}/>Refresh</button></div>
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {STEPS.map(s=>(
              <div key={s.key} className={`flex gap-3 items-start p-3.5 cursor-pointer border-r border-slate-100 last:border-r-0 transition-colors ${tab===s.key?'bg-blue-50':'hover:bg-slate-50'}`}onClick={()=>go(s.key)}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-extrabold ${tab===s.key?'bg-blue-500 text-white':'bg-slate-100 text-slate-500'}`}>{s.n}</div>
                <div><b className="text-[13.5px] font-extrabold flex items-center gap-1.5">{s.label}<span className={`text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-full ${tab===s.key?'bg-white text-blue-500':'bg-slate-100 text-slate-400'}`}>{counts[s.key as keyof typeof counts]}</span></b><span className="block text-[11.5px] text-slate-500 font-medium mt-0.5 leading-tight">{s.desc}</span></div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode==='form'&&(
        <div className="flex items-end gap-4 flex-wrap">
          <button onClick={()=>go(tab)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-50"><FiArrowLeft className="w-4 h-4"/>Back</button>
          <div><h1 className="text-2xl font-extrabold tracking-tight">{editId?`Edit ${step.label}`:`Create ${step.label}`}</h1><p className="text-[13px] text-slate-500 mt-1">Step {step.n} of 4 · {step.desc}</p></div>
        </div>
      )}

      {/* Content — all inline, no popups */}
      {mode==='list'&&tab==='types'&&<TypesList types={types} rules={rules} loading={loading} onCreate={()=>go('types','form')} onEdit={(id)=>go('types','form',id)} />}
      {mode==='form'&&tab==='types'&&<TypeForm editId={editId} types={types} onCancel={()=>go('types')} onSaved={onSaved} sq={sq} />}
      {mode==='list'&&tab==='policy'&&<PolicyList policies={policies} loading={loading} onCreate={()=>go('policy','form')} onEdit={(id)=>go('policy','form',id)} />}
      {mode==='list'&&tab==='rules'&&<RulesList rules={rules} types={types} loading={loading} onCreate={()=>go('rules','form')} onEdit={(id)=>go('rules','form',id)} />}
      {mode==='list'&&tab==='mapping'&&<MappingOverview types={types} policies={policies} rules={rules} loading={loading} />}
      {mode==='form'&&tab==='policy'&&<div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-500">Policy form — coming soon. Use <a href="/leave/leave-policy" className="text-blue-600 underline">Leave Policy page</a> for now.</div>}
      {mode==='form'&&tab==='rules'&&<div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-500">Rule form — coming soon. Use <a href="/leave/leave-policy?tab=rules" className="text-blue-600 underline">Leave Policy page</a> for now.</div>}
    </div>
  );
}

/* ═══ Overview component for each tab ═══ */
function Overview({title,items}:{title:string;items:{label:string;value:string|number;color?:string}[]}) {
  return<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">{items.map((it,i)=>(
    <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{it.label}</p>
      <p className={`text-xl font-extrabold mt-1 ${it.color||'text-slate-800'}`}>{it.value}</p>
    </div>
  ))}</div>;
}

/* ═══ Types List ═══ */
function TypesList({types,rules,loading,onCreate,onEdit}:{types:LType[];rules:LRule[];loading:boolean;onCreate:()=>void;onEdit:(id:string)=>void}){
  const[q,setQ]=useState('');const[cat,setCat]=useState('');const[sel,setSel]=useState<string|null>(null);
  const rows=types.filter(t=>(!cat||(t.category||'paid')===cat)&&(t.name+t.code).toLowerCase().includes(q.toLowerCase()));
  const t=sel&&types.find(x=>x.id===sel);const rulesFor=t?rules.filter(r=>r.leaveTypeId===t.id||r.typeId===t.id):[];
  const activeCount=types.filter(t=>t.status==='active').length;const inactiveCount=types.filter(t=>t.status!=='active').length;

  return<div>
    {/* Overview */}
    <Overview title="Leave Types" items={[
      {label:'Total Types',value:types.length},
      {label:'Active',value:activeCount,color:'text-emerald-600'},
      {label:'Inactive',value:inactiveCount,color:'text-slate-400'},
      {label:'With Rules',value:types.filter(t=>rules.some(r=>r.leaveTypeId===t.id||r.typeId===t.id)).length,color:'text-blue-600'},
    ]}/>

    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 flex-wrap">
        <h2 className="text-[15px] font-extrabold">Leave Types</h2><span className="text-[12px] text-slate-500">{types.length} types</span>
        <span className="flex-1"/>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-56"><FiSearch className="w-3.5 h-3.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or code" className="border-0 bg-transparent outline-none text-[13px] w-full"/></div>
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={cat} onChange={e=>setCat(e.target.value)}>
          <option value="">All categories</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="statutory">Statutory</option><option value="special">Special</option>
        </select>
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5"/>Create Leave Type</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['#','Leave type','Category','Smallest unit','Rules','Status','Action'].map((h,i)=><th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i>=5?'text-center':''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading?<tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr>:
             rows.length===0?<tr><td colSpan={7} className="text-center py-10 text-slate-500">No leave types found. Click "Create Leave Type" to add one.</td></tr>:
             rows.map((r,i)=>(
              <tr key={r.id} className={`border-b border-slate-50 cursor-pointer transition-colors ${sel===r.id?'bg-blue-50':'hover:bg-slate-50'}`} onClick={()=>setSel(r.id)}>
                <td className="px-3.5 py-3 text-slate-400 font-bold text-[12px]">{i+1}</td>
                <td className="px-3.5 py-3"><div className="flex items-center gap-2.5"><CodeChip code={r.code} color={r.calendarColor}/><div><div className="font-bold text-[13px]">{r.name}</div><div className="text-[11.5px] text-slate-500 max-w-xs truncate">{r.description||''}</div></div></div></td>
                <td className="px-3.5 py-3"><CatPill c={((r.category||'paid').charAt(0).toUpperCase()+(r.category||'paid').slice(1))}/></td>
                <td className="px-3.5 py-3 text-[13px] text-slate-500 capitalize">{(r.smallestUnit||'full_day').replace('_',' ')}</td>
                <td className="px-3.5 py-3 text-center font-bold text-[13px]">{rulesFor.length}</td>
                <td className="px-3.5 py-3 text-center"><StatusPill s={r.status}/></td>
                <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e=>{e.stopPropagation();onEdit(r.id);}}><FiEdit2 className="w-3 h-3"/>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline detail drawer (not a popup — slides in from right) */}
      {t&&(
        <div className="fixed inset-0 bg-slate-900/30 z-50" onClick={()=>setSel(null)}>
          <div className="absolute top-0 right-0 bottom-0 w-[560px] max-w-full bg-white flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex gap-3 items-start">
              <CodeChip code={t.code} color={t.calendarColor}/>
              <div><h3 className="text-lg font-extrabold">{t.name}</h3><div className="text-[12px] text-slate-500">Code {t.code}</div></div>
              <button onClick={()=>setSel(null)} className="ml-auto w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500"><FiX className="w-4 h-4"/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Basic details</h4>
                <div className="grid grid-cols-2 border border-slate-100 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-r border-slate-100"><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Leave name</label><span className="text-[13px] font-bold">{t.name}</span></div>
                  <div className="p-3 border-b border-slate-100"><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Short code</label><span className="text-[13px] font-bold">{t.code}</span></div>
                  <div className="p-3 border-r border-slate-100"><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Category</label><span className="text-[13px] font-bold">{t.category||'paid'}</span></div>
                  <div className="p-3"><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Status</label><span className="text-[13px] font-bold">{t.status}</span></div>
                  <div className="p-3 col-span-2 border-t border-slate-100"><label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Description</label><span className="text-[13px] font-bold">{t.description||'—'}</span></div>
                </div>
              </div>
              <div className="mb-5"><h4 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Rules defined for this type ({rulesFor.length})</h4>
                {rulesFor.length?<div className="flex flex-col gap-1.5">{rulesFor.map(r=><div key={r.id} className="flex items-center gap-2.5 px-3 py-2 border border-slate-100 rounded-lg text-[12.5px]"><b>{r.name}</b><span className="flex-1"/><span className="text-slate-500">{r.entitledDaysPerYear||r.entitledDays||'—'} days/yr</span><StatusPill s={r.status}/></div>)}</div>
                :<div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12.5px] text-amber-800"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5"/>No rule yet — create one in Step 3 before mapping this type.</div>}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex gap-2 bg-slate-50">
              <button className="h-9 px-3 rounded-lg border border-slate-200 text-[12px] font-bold" onClick={()=>{setSel(null);onEdit(t.id);}}><FiEdit2 className="w-3.5 h-3.5 inline mr-1"/>Edit leave type</button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>;
}

/* ═══ Type Form (inline, not popup) ═══ */
function TypeForm({editId,types,onCancel,onSaved,sq}:{editId:string|null;types:LType[];onCancel:()=>void;onSaved:()=>void;sq:string}){
  const orig=editId&&types.find(t=>t.id===editId);
  const[f,setF]=useState({
    name:orig?.name||'',code:orig?.code||'',category:((orig?.category||'paid').charAt(0).toUpperCase()+(orig?.category||'paid').slice(1)),
    unit:orig?.smallestUnit==='half_day'?'Half day':orig?.smallestUnit==='hourly'?'Hourly':'Full day',
    description:orig?.description||'',color:orig?.calendarColor||'#2563EB',order:orig?.displayOrder||(types.length+1),active:orig?.status!=='inactive',
  });
  const[tried,setTried]=useState(false);const[saving,setSaving]=useState(false);
  const set=(k:string,v:any)=>setF(s=>({...s,[k]:v}));
  const errs:Record<string,string>={};
  if(!f.name.trim())errs.name='Enter a leave name';
  if(!f.code.trim())errs.code='Enter a short code';
  else if(types.some(t=>t.code.toUpperCase()===f.code.trim().toUpperCase()&&t.id!==editId))errs.code='Code already used';
  const show=(k:string)=>tried&&errs[k];

  const save=async()=>{
    setTried(true);if(Object.keys(errs).length)return;
    setSaving(true);
    try{
      const body={name:f.name,code:f.code.toUpperCase(),description:f.description,category:f.category.toLowerCase(),smallestUnit:f.unit.toLowerCase().replace(' ','_'),calendarColor:f.color,displayOrder:Number(f.order)||0,isPaid:f.category==='Paid',status:f.active?'active':'inactive'};
      const sep=sq?`&${sq}`:'';const url=editId?`/api/leave-types/${editId}?${sep}`:`/api/leave-types${sq?`?${sq}`:''}`;const method=editId?'PUT':'POST';
      const res=await fetch(url,{method,headers:getAuthHeaders(),body:JSON.stringify(body)});
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||'Failed');}
      toast.success(`Leave type "${f.name}" saved`);onSaved();
    }catch(e){toast.error(e instanceof Error?e.message:'Failed');}finally{setSaving(false);}
  };

  const inp=`w-full h-10 border rounded-lg px-3 text-[13px] outline-none transition-all ${'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`;

  return<div>
    {/* Form sections inline */}
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">
      <nav className="hidden lg:block sticky top-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-2">
        {[{id:'ty-basic',label:'Basic details'},{id:'ty-display',label:'Display'}].map((it,i)=><a key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50"onClick={()=>document.getElementById(it.id)?.scrollIntoView({behavior:'smooth',block:'start'})}><span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10.5px] font-extrabold text-slate-500">{i+1}</span>{it.label}</a>)}
      </nav>
      <div>
        {/* Section 1: Basic details */}
        <section id="ty-basic" className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">1</div><div><h3 className="text-[14.5px] font-extrabold">Basic details</h3><p className="text-[12px] text-slate-500">What the leave is called and how it is paid.</p></div></div>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-x-6">
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Leave name<span className="text-red-500 ml-0.5">*</span></label><input className={`${inp} ${show('name')?'border-red-300 bg-red-50':''}`} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Casual Leave"/>{show('name')&&<div className="text-[11.5px] text-red-500 mt-1 font-semibold">{errs.name}</div>}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Short code<span className="text-red-500 ml-0.5">*</span></label><input className={`${inp} ${show('code')?'border-red-300 bg-red-50':''}`} value={f.code} onChange={e=>set('code',e.target.value.toUpperCase().slice(0,5))} placeholder="CL"/>{show('code')&&<div className="text-[11.5px] text-red-500 mt-1 font-semibold">{errs.code}</div>}</div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Category</label><select className={inp} value={f.category} onChange={e=>set('category',e.target.value)}><option>Paid</option><option>Unpaid</option><option>Statutory</option><option>Special</option></select></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Smallest unit</label><div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{['Full day','Half day','Hourly'].map(o=><button key={o} type="button" className={`h-8 px-3.5 rounded-md text-[12.5px] font-bold ${f.unit===o?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`} onClick={()=>set('unit',o)}>{o}</button>)}</div></div>
              <div className="pt-3.5 col-span-2"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Description</label><textarea className={`${inp} h-20 resize-vertical`} value={f.description} onChange={e=>set('description',e.target.value)} placeholder="When can this leave be used?"/></div>
            </div>
          </div>
        </section>

        {/* Section 2: Display */}
        <section id="ty-display" className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5"><div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold">2</div><div><h3 className="text-[14.5px] font-extrabold">Display</h3><p className="text-[12px] text-slate-500">How the leave appears in calendars and balance cards.</p></div></div>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-x-6">
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Colour</label><div className="flex gap-2">{LV_COLORS.map(c=><span key={c} className={`w-7 h-7 rounded-lg cursor-pointer border-2 ${f.color===c?'border-slate-800':'border-white shadow'}`} style={{background:c}} onClick={()=>set('color',c)}/>)}</div></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Display order</label><input type="number" className={inp} value={String(f.order)} onChange={e=>set('order',e.target.value)}/></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Status</label><div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">{['Active','Inactive'].map(o=><button key={o} type="button" className={`h-8 px-4 rounded-md text-[12.5px] font-bold ${(f.active?'Active':'Inactive')===o?'bg-white shadow-sm':'text-slate-500'}`} onClick={()=>set('active',o==='Active')}>{o}</button>)}</div></div>
              <div className="pt-3.5"><label className="block text-[12.5px] font-bold text-slate-800 mb-1.5">Preview</label><div className="flex items-center gap-2.5 h-10"><CodeChip code={f.code||'—'} color={f.color}/><div><div className="font-bold text-[13px]">{f.name||'Leave name'}</div><div className="text-[11.5px] text-slate-500">{f.category} · {f.unit}</div></div></div></div>
            </div>
          </div>
        </section>

        <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3 text-[12.5px] text-blue-800 mb-4"><FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5"/><span>A leave type is only a name. Entitlement and limits are set in <b>Step 3 · Leave Rules</b>. The type reaches employees only after <b>Step 4 · Mapping</b>.</span></div>
      </div>
    </div>

    {/* Sticky footer — inline save buttons */}
    <div className="sticky bottom-0 bg-slate-50/90 backdrop-blur border-t border-slate-200 py-3 flex gap-2.5 items-center z-5">
      <span className="text-[12.5px] text-slate-500">Fields marked <b className="text-red-500">*</b> are required</span>
      <span className="flex-1"/>
      <button className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold hover:bg-slate-50" onClick={onCancel}>Cancel</button>
      <button className="h-10 px-5 rounded-xl bg-slate-800 text-white text-[13px] font-bold hover:bg-slate-900 shadow-md disabled:opacity-50" onClick={save} disabled={saving}>{saving?'Saving…':(editId?'Save changes':'Create leave type')}</button>
    </div>
  </div>;
}

/* ═══ Policy List ═══ */
function PolicyList({policies,loading,onCreate,onEdit}:{policies:LPolicy[];loading:boolean;onCreate:()=>void;onEdit:(id:string)=>void}){
  const[q,setQ]=useState('');const[sel,setSel]=useState<string|null>(null);
  const rows=policies.filter(p=>(p.title+(p.code||'')).toLowerCase().includes(q.toLowerCase()));
  const p=sel&&policies.find(x=>x.id===sel);
  const activeCount=policies.filter(p=>p.status==='active').length;

  return<div>
    <Overview title="Leave Policies" items={[
      {label:'Total Policies',value:policies.length},
      {label:'Active',value:activeCount,color:'text-emerald-600'},
      {label:'Draft',value:policies.filter(p=>p.status==='draft').length,color:'text-amber-600'},
      {label:'Inactive',value:policies.filter(p=>p.status==='inactive').length,color:'text-slate-400'},
    ]}/>
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
        <h2 className="text-[15px] font-extrabold">Leave Policies</h2><span className="text-[12px] text-slate-500">{policies.length} policies</span>
        <span className="flex-1"/>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-56"><FiSearch className="w-3.5 h-3.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search policy" className="border-0 bg-transparent outline-none text-[13px] w-full"/></div>
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5"/>Create Policy</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['Policy','Status','Effective','Action'].map((h,i)=><th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i===3?'text-right':''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading?<tr><td colSpan={4} className="text-center py-8 text-slate-400">Loading…</td></tr>:
             rows.length===0?<tr><td colSpan={4} className="text-center py-10 text-slate-500">No policies found.</td></tr>:
             rows.map(r=>(
              <tr key={r.id} className={`border-b border-slate-50 cursor-pointer ${sel===r.id?'bg-blue-50':'hover:bg-slate-50'}`} onClick={()=>setSel(r.id)}>
                <td className="px-3.5 py-3"><div className="font-bold text-[13px]">{r.title}</div><div className="text-[11.5px] text-slate-500">{r.code||r.category||''}</div></td>
                <td className="px-3.5 py-3"><StatusPill s={r.status}/></td>
                <td className="px-3.5 py-3 text-[13px] text-slate-500">{fmtDate(r.effectiveDate)}</td>
                <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e=>{e.stopPropagation();onEdit(r.id);}}><FiEdit2 className="w-3 h-3"/>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

/* ═══ Rules List ═══ */
function RulesList({rules,types,loading,onCreate,onEdit}:{rules:LRule[];types:LType[];loading:boolean;onCreate:()=>void;onEdit:(id:string)=>void}){
  const[q,setQ]=useState('');const[tf,setTf]=useState('');const[sel,setSel]=useState<string|null>(null);
  const rows=rules.filter(r=>(!tf||r.leaveTypeId===tf||r.typeId===tf)&&r.name.toLowerCase().includes(q.toLowerCase()));
  const r=sel&&rules.find(x=>x.id===sel);const t=r&&types.find(x=>x.id===(r.leaveTypeId||r.typeId));
  const activeCount=rules.filter(r=>r.status==='active').length;

  return<div>
    <Overview title="Leave Rules" items={[
      {label:'Total Rules',value:rules.length},
      {label:'Active',value:activeCount,color:'text-emerald-600'},
      {label:'With Entitlement',value:rules.filter(r=>r.entitledDaysPerYear||r.entitledDays).length,color:'text-blue-600'},
      {label:'Allow Carry Fwd',value:rules.filter(r=>r.carryForward).length,color:'text-purple-600'},
    ]}/>
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
        <h2 className="text-[15px] font-extrabold">Leave Rules</h2><span className="text-[12px] text-slate-500">{rules.length} rules</span>
        <span className="flex-1"/>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-56"><FiSearch className="w-3.5 h-3.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search rule" className="border-0 bg-transparent outline-none text-[13px] w-full"/></div>
        <select className="h-9 border border-slate-200 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-600 outline-none" value={tf} onChange={e=>setTf(e.target.value)}>
          <option value="">All leave types</option>{types.map(t=><option key={t.id} value={t.id}>{t.code} – {t.name}</option>)}
        </select>
        <button className="h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-slate-900" onClick={onCreate}><FiPlus className="w-3.5 h-3.5"/>Create Rule</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>{['Rule','Days/yr','Per req','Notice','Half day','Carry fwd','Status','Action'].map((h,i)=><th key={h} className={`text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50 ${i>=1&&i<=5?'text-center':''} ${i===7?'text-right':''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading?<tr><td colSpan={8} className="text-center py-8 text-slate-400">Loading…</td></tr>:
             rows.length===0?<tr><td colSpan={8} className="text-center py-10 text-slate-500">No rules found.</td></tr>:
             rows.map(x=>{
               const ty=types.find(t=>t.id===(x.leaveTypeId||x.typeId));
               return<tr key={x.id} className={`border-b border-slate-50 cursor-pointer ${sel===x.id?'bg-blue-50':'hover:bg-slate-50'}`} onClick={()=>setSel(x.id)}>
                <td className="px-3.5 py-3"><div className="flex items-center gap-2.5">{ty&&<CodeChip code={ty.code} color={ty.calendarColor}/>}<div><div className="font-bold text-[13px]">{x.name}</div><div className="text-[11.5px] text-slate-500">{x.employmentType||x.employeeStatus||''}</div></div></div></td>
                <td className="px-3.5 py-3 text-center font-bold text-[13px]">{x.entitledDaysPerYear||x.entitledDays||'—'}</td>
                <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{x.minDaysPerRequest||x.minDays||0.5}–{x.maxDaysPerRequest||x.maxDays||'?'}</td>
                <td className="px-3.5 py-3 text-center text-[12px] text-slate-500">{x.advanceNoticeDays||x.noticeDays||0}d</td>
                <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${x.halfDayAllowed||x.halfDay?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{x.halfDayAllowed||x.halfDay?'Yes':'No'}</span></td>
                <td className="px-3.5 py-3 text-center"><span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${x.carryForward?'bg-blue-50 text-blue-700 border-blue-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{x.carryForward?'Yes':'Lapse'}</span></td>
                <td className="px-3.5 py-3"><StatusPill s={x.status}/></td>
                <td className="px-3.5 py-3 text-right"><button className="h-8 px-2.5 rounded-lg border border-slate-200 text-[12px] font-bold flex items-center gap-1 hover:bg-slate-50 ml-auto" onClick={e=>{e.stopPropagation();onEdit(x.id);}}><FiEdit2 className="w-3 h-3"/>Edit</button></td>
               </tr>;
             })}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

/* ═══ Mapping Overview ═══ */
function MappingOverview({types,policies,rules,loading}:{types:LType[];policies:LPolicy[];rules:LRule[];loading:boolean}){
  return<div>
    <Overview title="Mapping" items={[
      {label:'Total Types',value:types.length},
      {label:'Total Policies',value:policies.length},
      {label:'Total Rules',value:rules.length},
      {label:'Ready to Map',value:Math.min(types.length,rules.length),color:'text-emerald-600'},
    ]}/>
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center">
      <FiGrid className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
      <h3 className="text-base font-bold text-slate-700">Policy Mapping</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Connect policy → leave type → rule → employees. Use the <a href="/leave/leave-policy?tab=mapping" className="text-blue-600 underline">Leave Policy page</a> to create and edit mappings.</p>
      <a href="/leave/leave-policy?tab=mapping" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900"><FiGrid className="w-4 h-4"/>Open Mapping</a>
    </div>
  </div>;
}
