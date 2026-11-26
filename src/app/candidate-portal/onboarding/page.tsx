'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiCalendar, FiCheck, FiCheckCircle, FiClock, FiLock, FiMapPin, FiUsers } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Data = {
  candidateName:string; jobTitle?:string; joiningDate?:string; workLocation?:string; onboardingStatus:string;
  bgvStatus:string; employeeId?:string; companyEmail?:string;
  documents:Array<{status:string}>;
  recentAttendance?:Array<unknown>; leaveBalances?:Array<{leaveTypeName:string;remaining:number}>|null;
};

export default function CandidateOnboardingPage(){
  const router=useRouter();
  const [state,setState]=useState<PortalState|null>(null);
  const [data,setData]=useState<Data|null>(null);
  const load=useCallback(async()=>{
    const portal=await fetchPortalState(); setState(portal);
    const pb=portal?.preboarding;
    const ready=!!pb && (['ready_to_join','joined'].includes(String(pb.stage||'').toLowerCase()) || ['cleared','approved','passed'].includes(String(pb.bgvStatus||'').toLowerCase()) || ['provisional_employee','active_employee'].includes(String(pb.onboardingStatus||'').toLowerCase()));
    if(!ready){router.replace('/candidate-portal/home');return;}
    const response=await fetch('/api/candidate-portal/onboarding',{headers:getPortalHeaders()});
    if(response.ok)setData(await response.json()); else router.replace('/candidate-portal/home');
  },[router]);
  useEffect(()=>{queueMicrotask(() => { void load(); });},[load]);
  if(!data)return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"/></div>;

  const bgvPassed=['cleared','approved','passed'].includes(data.bgvStatus?.toLowerCase());
  const joined=['provisional_employee','active_employee'].includes(data.onboardingStatus);
  const active=data.onboardingStatus==='active_employee';
  return <div className="min-h-screen bg-[#f4f7fb]"><CandidatePortalNav state={state} active="onboarding"/><main className="p-4 lg:p-5"><div className="grid gap-3">
    <section className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-200 text-emerald-800"><FiCheckCircle className="h-6 w-6"/></span><div><h1 className="text-xl font-bold text-emerald-900">{bgvPassed?'BGV Passed — Ready to Join':'Onboarding in Progress'}</h1><p className="text-xs text-emerald-700">Welcome to your onboarding journey for {data.jobTitle||'your new role'}.</p></div></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800">{active?'Full Employee Access':joined?'Provisional Employee':'Pre-joining'}</span></section>
    <section className="grid grid-cols-3 gap-3"><Tile icon={<FiCalendar/>} label="Joining Date" value={data.joiningDate?new Date(data.joiningDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'To be confirmed'}/><Tile icon={<FiClock/>} label="Reporting Time" value="9:30 AM"/><Tile icon={<FiMapPin/>} label="Location" value={data.workLocation||'To be confirmed'}/></section>
    <section className="grid min-h-0 gap-3 lg:grid-cols-2">
      <div className="grid min-h-0 grid-rows-[1fr_auto] gap-3"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold"><FiCheckCircle className="text-emerald-700"/> Day-One Checklist</h2><div className="space-y-2">{[
        ['Employment forms complete',true,'Required joining forms submitted'],
        ['Documents approved',data.documents.length>0&&data.documents.every(d=>d.status==='approved'),'HR verification of documents'],
        ['Company email',!!data.companyEmail,data.companyEmail||'Available after joining'],
        ['Employee ID',!!data.employeeId&&!data.employeeId.startsWith('PROV-'),data.employeeId||'Assigned after final activation'],
      ].map(([label,done,note])=><div key={String(label)} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${done?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{done?<FiCheck/>:<FiClock/>}</span><div><p className="text-sm font-semibold">{String(label)}</p><p className="text-[10px] text-slate-500">{String(note)}</p></div><span className={`ml-auto rounded-full px-2 py-1 text-[10px] font-bold ${done?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{done?'Complete':'Pending'}</span></div>)}</div></div>
      <div className="grid grid-cols-2 gap-3"><AccessCard title="Attendance" active={joined} text={joined?'Attendance access is active.':'Available after joining.'}/><AccessCard title="Leave" active={joined} text={joined?'Leave balances and requests are active.':'Available after joining.'}/></div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-bold"><FiUsers className="text-emerald-700"/> Access Timeline</h2><div className="space-y-3">{[
        ['Candidate Portal',true,'Recruitment access'],
        ['Preboarding Complete',!!state?.preboarding?.submittedAt,'Profile and documents submitted'],
        ['BGV Passed',bgvPassed,'Background verification decision'],
        ['Joined',joined,'Attendance and leave become available'],
        ['Full Employee Access',active,'Employee ID and complete HRMS access'],
      ].map(([label,done,note],index)=><div key={String(label)} className="flex gap-3"><div className="flex flex-col items-center"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${done?'bg-emerald-600 text-white':'border-2 border-slate-300 text-slate-400'}`}>{done?<FiCheck/>:index+1}</span>{index<4&&<span className={`h-7 w-0.5 ${done?'bg-emerald-300':'bg-slate-200'}`}/>}</div><div><p className="text-sm font-semibold">{String(label)}</p><p className="text-[10px] text-slate-500">{String(note)}</p></div></div>)}</div></div>
    </section>
  </div></main></div>
}
function Tile({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700">{icon}</span><div><p className="text-[10px] uppercase text-slate-400">{label}</p><p className="font-bold">{value}</p></div></div>}
function AccessCard({title,active,text}:{title:string;active:boolean;text:string}){return <div className={`rounded-2xl border p-3 ${active?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white'}`}><div className="flex items-center gap-2 font-bold">{active?<FiCheckCircle className="text-emerald-700"/>:<FiLock className="text-slate-400"/>}{title}</div><p className="mt-1 text-[11px] text-slate-500">{text}</p></div>}

