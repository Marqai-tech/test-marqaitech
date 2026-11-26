'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiClock, FiGift, FiInfo, FiSun } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Balance = {
  leaveTypeName: string; leaveTypeCode?: string; remaining?: number; total?: number; used?: number;
  annualQuota?: number; isPaid?: boolean; probationRestricted?: boolean; eligibleAfterJoining?: boolean; carryForward?: number;
};
type MyLeave = { id: string; leaveTypeName: string; startDate: string; endDate: string; status: string; reason?: string | null; halfDay?: boolean };
type Holiday = { id: string; name: string; date: string; type?: string };

type Data = {
  enabled: boolean; mode: 'provisional' | 'full'; onboardingStatus?: string;
  employeeCode?: string; joiningDate?: string | null; preboardingStage?: string | null;
  balances: Balance[]; myLeaves: MyLeave[]; upcomingHolidays: Holiday[]; note?: string;
};

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function CandidateLeavePage() {
  const [state, setState] = useState<PortalState | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const portal = await fetchPortalState();
      setState(portal);
      if (!portal) { setError('Could not reach the server. Please check your connection and try again.'); return; }
      if (!portal?.preboarding) { setError('Preboarding has not started yet — the Leave module unlocks once HR initiates your preboarding.'); return; }
      const res = await fetch('/api/candidate-portal/leave', { headers: getPortalHeaders() });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Unable to load leave data');
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const joined = data?.mode === 'full';
  const balances = data?.balances || [];

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <CandidatePortalNav state={state} active="leave" />
      <main className="mx-auto max-w-5xl p-4 lg:p-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800"><p className="font-bold">Leave module</p><p className="mt-1 text-sm">{error}</p></div>
        ) : data && (
          <div className="grid gap-4">
            {/* Header */}
            <section className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${joined ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50' : 'border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50'}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${joined ? 'bg-emerald-200 text-emerald-800' : 'bg-sky-200 text-sky-800'}`}><FiSun className="h-6 w-6" /></span>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Leave</h1>
                  <p className="text-xs text-slate-600">{joined ? `Your leave balances for the current year${data.employeeCode ? ` — ${data.employeeCode}` : ''}.` : 'Pre-joining preview — balances activate from your joining date.'}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${joined ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'}`}>{joined ? 'Full Access' : 'Pre-joining Access'}</span>
            </section>

            {data.note && <section className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><FiInfo className="mt-0.5 shrink-0 text-slate-400" />{data.note}</section>}

            {/* Balances */}
            <section>
              <h2 className="mb-2 text-sm font-bold text-slate-700">{joined ? 'Leave Balances' : 'Leave Types (eligible after joining)'}</h2>
              {balances.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No leave types configured yet. They will appear here once HR configures them.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {balances.map((b, i) => (
                    <div key={`${b.leaveTypeName}-${i}`} className={`rounded-2xl border p-4 ${joined ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-800">{b.leaveTypeName}</p>
                        {b.isPaid !== undefined && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${b.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{b.isPaid ? 'Paid' : 'Unpaid'}</span>}
                      </div>
                      {joined ? (
                        <div className="mt-3">
                          <p className="text-2xl font-extrabold text-emerald-700">{b.remaining ?? 0}<span className="text-sm font-medium text-slate-400"> / {b.total ?? 0} days left</span></p>
                          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, b.total ? ((b.remaining || 0) / b.total) * 100 : 0))}%` }} /></div>
                          <p className="mt-2 text-[11px] text-slate-500">Used {b.used ?? 0}{b.carryForward ? ` · Carry-forward ${b.carryForward}` : ''}</p>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <p className="text-lg font-bold text-sky-700">{b.annualQuota ?? 0} days / year</p>
                          <p className="mt-1 text-[11px] text-slate-500">{b.probationRestricted ? 'Not available during probation' : 'Available after probation as per policy'}</p>
                          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700"><FiClock className="h-3 w-3" /> Activates on joining</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* My leave requests (full mode) */}
            {joined && (
              <section>
                <h2 className="mb-2 text-sm font-bold text-slate-700">My Leave Requests</h2>
                {(data.myLeaves || []).length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No leave requests yet. Once you join, apply for leave from the employee HRMS portal — your history appears here.</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Dates</th><th className="px-4 py-2.5">Status</th></tr></thead>
                      <tbody>
                        {data.myLeaves!.map(l => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-4 py-2.5 font-medium">{l.leaveTypeName}{l.halfDay ? ' (½)' : ''}</td>
                            <td className="px-4 py-2.5 text-slate-600">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                            <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : l.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{l.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Upcoming holidays */}
            <section>
              <h2 className="mb-2 text-sm font-bold text-slate-700">Upcoming Holidays</h2>
              {(data.upcomingHolidays || []).length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No upcoming holidays configured.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.upcomingHolidays!.map(h => (
                    <div key={h.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FiGift className="h-5 w-5" /></span>
                      <div><p className="text-sm font-bold text-slate-800">{h.name}</p><p className="text-[11px] text-slate-500">{fmtDate(h.date)}{h.type ? ` · ${h.type}` : ''}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
