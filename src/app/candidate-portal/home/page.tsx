'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiAward, FiBriefcase, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiFileText, FiMapPin } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Dashboard = {
  profile: { name: string; email: string };
  stats: { total: number; interviewing: number; offered: number };
  applications: Array<{ id: string; jobTitle: string; position: string; location?: string; type: string; status: string; appliedDate: string }>;
  interviews: { upcoming: Array<{ id: string; jobTitle?: string; type?: string; interviewDate?: string; meetingUrl?: string }> };
};

export default function CandidateHomePage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [state, setState] = useState<PortalState | null>(null);
  useEffect(() => {
    if (!localStorage.getItem('tb_candidate_token')) { router.push('/candidate-portal/login'); return; }
    Promise.allSettled([
      fetch('/api/candidate-portal/dashboard', { headers: getPortalHeaders() }).then(r => r.ok ? r.json() : Promise.reject(new Error('Dashboard unavailable'))),
      fetchPortalState(),
    ]).then(([dashboardResult, portalResult]) => {
      const portal = portalResult.status === 'fulfilled' ? portalResult.value : null;
      setState(portal);
      if (dashboardResult.status === 'fulfilled') setData(dashboardResult.value);
      else setData({
        profile: { name: portal?.profile?.name || 'Candidate', email: portal?.profile?.email || '' },
        stats: { total: 0, interviewing: 0, offered: 0 },
        applications: [],
        interviews: { upcoming: [] },
      });
    });
  }, [router]);

  if (!data) return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" /></div>;
  const active = data.applications.find(app => ['interview', 'offered'].includes(app.status)) || data.applications[0];
  const interview = data.interviews.upcoming[0];
  const preboarding = state?.preboarding;

  return <div className="h-screen overflow-hidden bg-[#f4f7fb]">
    <CandidatePortalNav state={state} active="home" />
    <main className="h-[calc(100vh-64px)] overflow-hidden p-4 lg:p-5">
      <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<FiBriefcase />} label="Applications" value={data.stats.total} href="/candidate-portal/dashboard" />
          <Metric icon={<FiCalendar />} label="Interviews" value={data.stats.interviewing} href="/candidate-portal/interviews" />
          <Metric icon={<FiAward />} label="Offers" value={data.stats.offered} href="/candidate-portal/offers" />
          <Metric icon={<FiFileText />} label="Preboarding" value={preboarding ? (preboarding.submittedAt ? 'Submitted' : 'Active') : 'Locked'} href={preboarding ? '/candidate-portal/preboarding' : '#'} muted={!preboarding} />
        </section>

        {!preboarding && (state?.awaitingHR?.length || 0) > 0 && <section className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><div><p className="text-sm font-bold text-amber-900">Offer accepted — awaiting HR initiation</p><p className="text-xs text-amber-700">Preboarding, complete profile and documents will activate automatically after HR starts the process.</p></div><FiClock className="h-6 w-6 text-amber-600" /></section>}

        <section className="grid min-h-0 gap-3 lg:grid-cols-[1.25fr_.75fr]">
          <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">Current Application</h2><Link href="/candidate-portal/dashboard" className="text-xs font-semibold text-emerald-700">View all</Link></div>
            {active ? <div className="flex h-[calc(100%-36px)] flex-col">
              <div className="flex items-start justify-between rounded-xl bg-slate-50 p-4"><div><h3 className="text-xl font-bold text-slate-900">{active.jobTitle || active.position}</h3><p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><FiMapPin /> {active.location || 'Location not specified'} · {active.type}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold capitalize text-emerald-800">{active.status}</span></div>
              <div className="my-auto grid grid-cols-5 gap-1">
                {['Applied','Screening','Interview','Offer','Preboarding'].map((step,index) => <div key={step} className="text-center"><span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${index <= (active.status === 'offered' ? 3 : active.status === 'interview' ? 2 : active.status === 'screening' ? 1 : 0) ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 text-slate-400'}`}>{index < 3 ? <FiCheck className="h-4 w-4" /> : index + 1}</span><p className="mt-1 text-[11px] font-medium text-slate-600">{step}</p></div>)}
              </div>
              {preboarding && <Link href="/candidate-portal/preboarding" className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white">Continue Preboarding</Link>}
            </div> : <Empty text="No applications yet" href="/careers" />}
          </div>

          <div className="grid min-h-0 grid-rows-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold"><FiCalendar className="text-emerald-600" /> Upcoming Interview</h2>{interview ? <><p className="font-bold text-slate-900">{interview.type || 'Interview'}</p><p className="text-sm text-slate-500">{interview.jobTitle}</p><p className="mt-2 text-xs text-slate-600">{interview.interviewDate ? new Date(interview.interviewDate).toLocaleString() : 'Schedule pending'}</p>{interview.meetingUrl && <a href={interview.meetingUrl} className="mt-3 block rounded-lg bg-emerald-600 py-2 text-center text-xs font-bold text-white">Join Meeting</a>}</> : <Empty text="No upcoming interviews" href="/candidate-portal/interviews" />}</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold"><FiCheckCircle className="text-emerald-600" /> Next Steps</h2><ul className="space-y-2 text-xs">{[
              ['Track applications', true],
              ['Accept offer', (state?.awaitingHR?.length || 0) > 0 || !!preboarding],
              ['Complete preboarding', !!preboarding?.submittedAt],
              ['BGV and onboarding', ['cleared','approved'].includes(String(preboarding?.bgvStatus || '').toLowerCase())],
            ].map(([label,done]) => <li key={String(label)} className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}><FiCheck /></span><span className={done ? 'text-slate-800' : 'text-slate-500'}>{String(label)}</span></li>)}</ul></div>
          </div>
        </section>
      </div>
    </main>
  </div>;
}

function Metric({ icon, label, value, href, muted }: { icon: React.ReactNode; label: string; value: string | number; href: string; muted?: boolean }) {
  return <Link href={href} className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-sm ${muted ? 'border-slate-200 opacity-65' : 'border-slate-200 hover:border-emerald-300'}`}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700">{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900">{value}</p></div></Link>;
}
function Empty({ text, href }: { text: string; href: string }) { return <div className="flex h-28 flex-col items-center justify-center text-sm text-slate-400"><p>{text}</p><Link href={href} className="mt-2 text-xs font-semibold text-emerald-700">View details</Link></div>; }

