'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiBriefcase, FiCreditCard, FiFileText, FiLock, FiMail, FiPhone, FiUser } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Onboarding = {
  candidateName?: string; candidateEmail?: string; portalDetails?: Record<string, string | number | null | undefined>;
  documents?: Array<{ id: string; documentLabel: string; status: string }>;
};

export default function CandidateProfilePage() {
  const [state, setState] = useState<PortalState | null>(null);
  const [details, setDetails] = useState<Onboarding | null>(null);
  useEffect(() => { fetchPortalState().then(async portal => {
    setState(portal);
    if (portal?.preboarding) {
      const response = await fetch('/api/candidate-portal/onboarding', { headers: getPortalHeaders() });
      if (response.ok) setDetails(await response.json());
    }
  }); }, []);

  const full = !!state?.preboarding;
  const p = details?.portalDetails || {};
  const profile = state?.profile;
  return <div className="min-h-screen bg-[#f4f7fb]">
    <CandidatePortalNav state={state} active="profile" />
    <main className="p-4 lg:p-5">
      <div className="grid gap-3">
        <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800">{(profile?.name || 'C').split(' ').map(v => v[0]).slice(0,2).join('')}</span><div><h1 className="text-xl font-bold text-slate-900">{profile?.name || 'Candidate Profile'}</h1><p className="text-sm text-slate-500">{profile?.email}</p></div></div>
          <div className="text-right"><span className={`rounded-full px-3 py-1 text-xs font-bold ${full ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{full ? 'Complete profile activated' : 'Basic profile'}</span><p className="mt-1 text-[11px] text-slate-500">{full ? 'Preboarding is active' : 'Full profile unlocks after HR initiates preboarding'}</p></div>
        </section>

        <section className="grid min-h-0 gap-3 lg:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">Basic Candidate Profile</h2>
            <div className="space-y-2.5"><Info icon={<FiUser />} label="Full name" value={profile?.name || '-'} /><Info icon={<FiMail />} label="Email" value={profile?.email || '-'} /><Info icon={<FiPhone />} label="Phone" value={p.mobileNumber || 'Add during preboarding'} /><Info icon={<FiBriefcase />} label="Resume" value="Available with applications" /></div>
            <Link href="/candidate-portal/dashboard" className="mt-4 block rounded-lg border border-emerald-300 py-2 text-center text-xs font-bold text-emerald-700">View Applications & Resume</Link>
          </div>

          {!full ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500"><FiLock className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-bold text-slate-900">Joining profile is locked</h2><p className="mt-2 max-w-lg text-sm text-slate-500">Previous experience, education, address, emergency contacts, bank details, statutory details and joining documents become available only after you accept an offer and HR initiates preboarding.</p><div className="mt-5 grid w-full max-w-xl grid-cols-2 gap-2 text-left text-xs text-slate-500">{['Personal & Address','Education','Previous Experience','Emergency Contact','Bank & Tax Details','Documents & BGV'].map(item => <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5"><FiLock className="text-slate-400" />{item}</div>)}</div></div>
          : <div className="grid min-h-0 grid-cols-2 gap-3">
            <ProfileSection icon={<FiUser />} title="Personal & Address" rows={[['Date of birth',p.dateOfBirth],['Gender',p.gender],['Current address',p.currentAddress || p.address],['Emergency contact',p.emergencyContactName]]} />
            <ProfileSection icon={<FiBriefcase />} title="Education & Experience" rows={[['Qualification',p.qualification || p.highestQualification],['Institution',p.institution],['Previous company',p.previousCompany || p.employerName],['Experience',p.totalExperience || p.experience]]} />
            <ProfileSection icon={<FiCreditCard />} title="Bank & Statutory" rows={[['Bank',p.bankName],['Account',p.accountNumber ? '•••• '+String(p.accountNumber).slice(-4) : null],['PAN',p.panNumber],['Aadhaar',p.aadhaarNumber ? '•••• '+String(p.aadhaarNumber).slice(-4) : null]]} />
            <ProfileSection icon={<FiFileText />} title="Documents & Verification" rows={[['Documents',`${details?.documents?.length || 0} assigned`],['Approved',`${details?.documents?.filter(d => d.status === 'approved').length || 0}`],['BGV status',state?.preboarding?.bgvStatus || 'Pending'],['Joining date',state?.preboarding?.joiningDate ? new Date(state.preboarding.joiningDate).toLocaleDateString() : null]]} />
            <Link href="/candidate-portal/preboarding" className="col-span-2 rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-bold text-white">Update profile in Preboarding</Link>
          </div>}
        </section>
      </div>
    </main>
  </div>;
}
function Info({ icon,label,value }: { icon: React.ReactNode; label:string; value:string }) { return <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="text-emerald-700">{icon}</span><div><p className="text-[10px] uppercase text-slate-400">{label}</p><p className="text-sm font-semibold text-slate-800">{value}</p></div></div>; }
function ProfileSection({ icon,title,rows }: { icon:React.ReactNode; title:string; rows:Array<[string,string | number | null | undefined]> }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><span className="text-emerald-700">{icon}</span>{title}</h3><div className="space-y-1.5">{rows.map(([label,value]) => <div key={label} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-xs last:border-0"><span className="text-slate-500">{label}</span><span className="max-w-[55%] truncate font-semibold text-slate-800">{value || 'Not provided'}</span></div>)}</div></div>; }

