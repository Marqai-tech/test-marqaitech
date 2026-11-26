'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiFileText, FiLock, FiRefreshCw, FiShield, FiUser } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Doc = { id:string; documentLabel:string; fileName?:string; fileUrl?:string; status:string; rejectionReason?:string };

// Shape returned by GET /api/candidate-portal/bgv
type BgvCheckRow = { checkType:string; label:string; status:string; result:string|null; completedAt:string|null };
type BgvData = {
  request: null | {
    id:string; caseNumber:string|null; status:string; vendorName:string|null;
    instructions:string|null; dueDate:string|null; assignedAt:string|null; reworkReason:string|null;
    initiatedAt:string|null; updatedAt:string|null;
    checks: BgvCheckRow[];
    report: null | { summary:string|null; overallResult:string|null; status:string; hrDecision:string|null; hrDecisionReason:string|null; hrDecisionAt:string|null; submittedAt:string|null };
  };
};

const BGV_LABEL: Record<string, string> = {
  pending: 'Not Initiated',
  awaiting_assignment: 'Initiated — Vendor Assignment Pending',
  assigned: 'Vendor Assigned',
  in_progress: 'Verification In Progress',
  submitted_for_hr_review: 'Report Submitted to HR',
  approved_by_hr: 'Approved by HR',
  rejected_by_hr: 'Not Cleared',
};

export default function CandidateDocumentsPage() {
  const [state,setState]=useState<PortalState|null>(null);
  const [docs,setDocs]=useState<Doc[]>([]);
  const [bgv,setBgv]=useState<BgvData['request']>(null);
  const [bgvLoaded,setBgvLoaded]=useState(false);
  useEffect(()=>{ fetchPortalState().then(async portal=>{ setState(portal); if(portal?.preboarding){
    const r=await fetch('/api/candidate-portal/onboarding',{headers:getPortalHeaders()});
    if(r.ok){const d=await r.json();setDocs(d.documents||[]);}
    const b=await fetch('/api/candidate-portal/bgv',{headers:getPortalHeaders()});
    if(b.ok){const d=await b.json();setBgv(d.request??null);}
    setBgvLoaded(true);
  } });},[]);

  const active=!!state?.preboarding;
  const approved=docs.filter(d=>d.status==='approved').length;
  const rejected=docs.filter(d=>['rejected','resubmission_requested'].includes(d.status)).length;
  const pending=docs.filter(d=>!['approved','rejected','resubmission_requested'].includes(d.status)).length;
  const bgvStatusRaw = bgv?.status || state?.preboarding?.bgvStatus || 'pending';
  const bgvMetricLabel = BGV_LABEL[bgvStatusRaw] || (bgvStatusRaw==='pending'?'Not Initiated':bgvStatusRaw.replaceAll('_',' '));

  return <div className="min-h-screen bg-[#f4f7fb]"><CandidatePortalNav state={state} active="documents" /><main className="p-4 lg:p-5">
    {!active ? <div className="flex min-h-[60vh] items-center justify-center"><div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><FiLock className="mx-auto h-10 w-10 text-slate-400"/><h1 className="mt-3 text-xl font-bold">Documents are not active yet</h1><p className="mt-2 text-sm text-slate-500">This section activates automatically after offer acceptance and HR preboarding initiation.</p><Link href="/candidate-portal/home" className="mt-5 inline-block rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white">Back to Dashboard</Link></div></div>
    : <div className="grid gap-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Approved" value={approved} icon={<FiCheckCircle/>} color="emerald"/><Metric label="Pending Review" value={pending} icon={<FiClock/>} color="amber"/><Metric label="Needs Action" value={rejected} icon={<FiAlertTriangle/>} color="rose"/><Metric label="BGV Status" value={bgvMetricLabel} icon={<FiShield/>} color="blue"/></section>
      <section className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h1 className="font-bold">Submitted Documents</h1><p className="text-xs text-slate-500">Upload and re-upload files from the Preboarding document step.</p></div><Link href="/candidate-portal/preboarding" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Manage Documents</Link></div><div className="p-3"><div className="grid grid-cols-[1.2fr_1fr_.7fr_.7fr] rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase text-slate-500"><span>Document</span><span>File</span><span>Status</span><span>Action</span></div>{docs.map(doc=><div key={doc.id} className="grid grid-cols-[1.2fr_1fr_.7fr_.7fr] items-center border-b border-slate-100 px-3 py-2.5 text-xs last:border-0"><span className="flex items-center gap-2 font-semibold"><FiFileText className="text-slate-400"/>{doc.documentLabel}</span><span className="truncate text-slate-500">{doc.fileName||'Not uploaded'}</span><span><Badge status={doc.status}/></span><span>{['rejected','resubmission_requested'].includes(doc.status)?<Link href="/candidate-portal/preboarding" className="inline-flex items-center gap-1 font-bold text-rose-600"><FiRefreshCw/> Re-upload</Link>:<span className="text-slate-400">View</span>}</span>{doc.rejectionReason&&<p className="col-span-4 mt-1 rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">Reason: {doc.rejectionReason}</p>}</div>)}{docs.length===0&&<p className="py-12 text-center text-sm text-slate-400">HR has not assigned documents yet.</p>}</div></div>
        <BgvPanel bgv={bgv} loaded={bgvLoaded} bgvStatusRaw={bgvStatusRaw} />
      </section>
    </div>}
  </main></div>;
}

/* ─── Dynamic Background Verification panel ───
   Driven by GET /api/candidate-portal/bgv (BgvRequest + checks + report).
   Timeline: Initiated → Vendor Assigned → Verification In Progress → Report Submitted → HR Decision */
function BgvPanel({ bgv, loaded, bgvStatusRaw }: { bgv: BgvData['request']; loaded: boolean; bgvStatusRaw: string }) {
  const steps = [
    { key: 'initiated', label: 'BGV Initiated', desc: 'HR initiated background verification' },
    { key: 'vendor', label: 'Vendor Assigned', desc: bgv?.vendorName ? `Verification partner: ${bgv.vendorName}` : 'Verification partner assignment' },
    { key: 'progress', label: 'Verification In Progress', desc: 'Source checks and document verification' },
    { key: 'report', label: 'Report Submitted', desc: 'Vendor submits report to HR' },
    { key: 'decision', label: 'HR Decision', desc: 'HR records final decision' },
  ] as const;

  // Current step index derived from the live request status.
  let current = -1;
  let decisionTone: 'pass'|'fail'|null = null;
  if (bgv) {
    switch (bgv.status) {
      case 'awaiting_assignment': current = 0; break;
      case 'assigned': current = 1; break;
      case 'in_progress': current = 2; break;
      case 'submitted_for_hr_review': current = 3; break;
      case 'approved_by_hr': current = 4; decisionTone = 'pass'; break;
      case 'rejected_by_hr': current = 4; decisionTone = 'fail'; break;
      default: current = 0;
    }
  }
  const stepState = (index: number): 'done'|'current'|'pending'|'fail' => {
    if (decisionTone === 'fail' && index === 4) return 'fail';
    if (index < current) return 'done';
    if (index === current) return decisionTone === 'pass' ? 'done' : 'current';
    return 'pending';
  };
  const checksTotal = bgv?.checks?.length || 0;
  const checksDone = bgv?.checks?.filter(c => c.status === 'completed').length || 0;
  const overall = bgv?.report?.overallResult;

  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="flex items-center gap-2 font-bold"><FiShield className="text-emerald-700"/> Background Verification</h2>

    {!loaded ? <p className="mt-4 text-sm text-slate-400">Loading BGV status…</p>
    : !bgv ? (
      /* Nothing initiated yet — keep the guidance copy, now reflecting live state. */
      ['in_progress','cleared','approved','passed'].includes(bgvStatusRaw) ? (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
          <strong className="flex items-center gap-1.5"><FiCheckCircle className="h-3.5 w-3.5"/> Background verification cleared</strong>
          <p className="mt-1">HR verified your background check and your verification is marked <b>cleared</b>. No further action is needed from you.</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><strong>BGV starts after all required documents are approved.</strong><p className="mt-1">HR selects a vendor and initiates verification. Once started, you can track live progress here.</p></div>
      )
    ) : (
      <>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">{bgv.caseNumber || 'BGV Case'}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bgv.status==='approved_by_hr'?'bg-emerald-100 text-emerald-700':bgv.status==='rejected_by_hr'?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-700'}`}>{BGV_LABEL[bgv.status] || bgv.status.replaceAll('_',' ')}</span>
          </div>
          {bgv.vendorName && <p className="mt-1 flex items-center gap-1 text-slate-500"><FiUser className="h-3 w-3"/> Vendor: <span className="font-semibold text-slate-700">{bgv.vendorName}</span></p>}
          {checksTotal > 0 && <p className="mt-1 text-slate-500">Checks completed: <span className="font-semibold text-slate-700">{checksDone}/{checksTotal}</span></p>}
        </div>

        <div className="mt-4 space-y-3">
          {steps.map((step, index) => {
            const st = stepState(index);
            const circle = st==='done' ? 'border-emerald-600 bg-emerald-600 text-white' : st==='current' ? 'border-emerald-600 bg-white' : st==='fail' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white';
            return <div key={step.key} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${circle}`}>
                {st==='done' && <FiCheckCircle className="h-3 w-3"/>}
                {st==='fail' && <span className="text-[10px] font-black">✕</span>}
                {st==='current' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"/>}
              </span>
              <div>
                <p className={`text-sm font-semibold ${st==='pending'?'text-slate-400':st==='fail'?'text-rose-700':'text-slate-900'}`}>{step.label}</p>
                <p className="text-[11px] text-slate-500">{step.desc}</p>
              </div>
            </div>;
          })}
        </div>

        {checksTotal > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Verification Checks</p>
            <div className="mt-2 space-y-1.5">
              {bgv!.checks.map(c => <div key={c.checkType+c.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{c.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status==='completed' ? (c.result==='Clear'?'bg-emerald-100 text-emerald-700':c.result?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700') : c.status==='in_progress'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-500'}`}>{c.status==='completed' ? (c.result || 'Done') : c.status==='in_progress' ? 'In Progress' : 'Pending'}</span>
              </div>)}
            </div>
          </div>
        )}

        {bgv.report?.hrDecision && (
          <div className={`mt-4 rounded-xl p-3 text-xs ${bgv.report.hrDecision==='approved'?'bg-emerald-50 text-emerald-800':'bg-rose-50 text-rose-800'}`}>
            <strong>{bgv.report.hrDecision==='approved' ? 'BGV Approved by HR' : 'BGV not cleared — see notes'}</strong>
            {bgv.report.hrDecisionReason && <p className="mt-1">{bgv.report.hrDecisionReason}</p>}
          </div>
        )}
        {overall && <p className="mt-2 text-[11px] text-slate-400">Vendor overall result: <span className="font-semibold text-slate-600">{overall}</span></p>}
        {bgv.reworkReason && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><strong>HR requested rework.</strong><p className="mt-1">{bgv.reworkReason}</p></div>}
      </>
    )}
  </div>;
}
function Metric({label,value,icon,color}:{label:string;value:string|number;icon:React.ReactNode;color:string}){const c:Record<string,string>={emerald:'bg-emerald-50 text-emerald-700',amber:'bg-amber-50 text-amber-700',rose:'bg-rose-50 text-rose-700',blue:'bg-blue-50 text-blue-700'};return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${c[color]}`}>{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-bold leading-tight">{value}</p></div></div>}
function Badge({status}:{status:string}){const s=status.toLowerCase();const c=s==='approved'?'bg-emerald-100 text-emerald-700':s.includes('reject')||s.includes('resubmission')?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-700';return <span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${c}`}>{status.replaceAll('_',' ')}</span>}
