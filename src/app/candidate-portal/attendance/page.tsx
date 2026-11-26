'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiCalendar, FiCheckCircle, FiClock, FiInfo, FiMapPin, FiMonitor } from 'react-icons/fi';
import CandidatePortalNav, { fetchPortalState, getPortalHeaders, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

type Rec = { date?: string; status?: string; checkInTime?: string | null; checkOutTime?: string | null; workHours?: string | number | null; lateMinutes?: number | null };
type Holiday = { id: string; name: string; date: string; type?: string };

type Data = {
  enabled: boolean; mode: 'provisional' | 'full'; onboardingStatus?: string;
  employeeCode?: string; joiningDate?: string | null; preboardingStage?: string | null;
  workLocation?: string | null; workMode?: string | null; employmentType?: string | null;
  summary?: Record<string, number>; totalRecords?: number; recentAttendance?: Rec[];
  upcomingHolidays?: Holiday[]; note?: string;
};

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (t?: string | null) => { if (!t) return '—'; const d = new Date(t); return isNaN(d.getTime()) ? String(t) : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };

export default function CandidateAttendancePage() {
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
      if (!portal?.preboarding) { setError('Preboarding has not started yet — the Attendance module unlocks once HR initiates your preboarding.'); return; }
      const res = await fetch('/api/candidate-portal/attendance', { headers: getPortalHeaders() });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Unable to load attendance data');
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const joined = data?.mode === 'full';
  const summary = data?.summary || {};
  const present = (summary.present || 0) + (summary.Present || 0) + (summary.half_day || 0);
  const absent = summary.absent || summary.Absent || 0;
  const late = summary.late || summary.Late || 0;
  const wfh = summary.wfh || summary.WFH || 0;

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <CandidatePortalNav state={state} active="attendance" />
      <main className="mx-auto max-w-5xl p-4 lg:p-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800"><p className="font-bold">Attendance module</p><p className="mt-1 text-sm">{error}</p></div>
        ) : data && (
          <div className="grid gap-4">
            {/* Header */}
            <section className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${joined ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50' : 'border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50'}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${joined ? 'bg-emerald-200 text-emerald-800' : 'bg-sky-200 text-sky-800'}`}><FiMonitor className="h-6 w-6" /></span>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
                  <p className="text-xs text-slate-600">{joined ? `Your attendance for the last 30 days${data.employeeCode ? ` — ${data.employeeCode}` : ''}.` : 'Pre-joining access — tracking activates from your joining date.'}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${joined ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'}`}>{joined ? 'Full Access' : 'Pre-joining Access'}</span>
            </section>

            {data.note && <section className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><FiInfo className="mt-0.5 shrink-0 text-slate-400" />{data.note}</section>}

            {/* Joining / schedule details */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile icon={<FiCalendar />} label="Joining Date" value={fmtDate(data.joiningDate)} />
              <Tile icon={<FiMapPin />} label="Work Location" value={data.workLocation || 'To be confirmed'} />
              <Tile icon={<FiMonitor />} label="Work Mode" value={data.workMode || 'To be confirmed'} />
              <Tile icon={<FiClock />} label="Employment Type" value={data.employmentType || 'To be confirmed'} />
            </section>

            {joined && (
              <>
                {/* Summary */}
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Present" value={present} tone="emerald" />
                  <Stat label="Absent" value={absent} tone="rose" />
                  <Stat label="Late" value={late} tone="amber" />
                  <Stat label="WFH" value={wfh} tone="sky" />
                </section>

                {/* Recent records */}
                <section>
                  <h2 className="mb-2 text-sm font-bold text-slate-700">Recent Attendance (last 10 records)</h2>
                  {(data.recentAttendance || []).length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No attendance records yet — your first records appear from your joining date.</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">In</th><th className="px-4 py-2.5">Out</th><th className="px-4 py-2.5">Hours</th></tr></thead>
                        <tbody>
                          {data.recentAttendance!.map((r, i) => (
                            <tr key={`${r.date}-${i}`} className="border-t border-slate-100">
                              <td className="px-4 py-2.5 font-medium">{fmtDate(r.date)}</td>
                              <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${/present|wfh/i.test(String(r.status)) ? 'bg-emerald-100 text-emerald-700' : /absent/i.test(String(r.status)) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                              <td className="px-4 py-2.5 text-slate-600">{fmtTime(r.checkInTime)}</td>
                              <td className="px-4 py-2.5 text-slate-600">{fmtTime(r.checkOutTime)}</td>
                              <td className="px-4 py-2.5 text-slate-600">{r.workHours != null ? String(r.workHours) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
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
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FiCheckCircle className="h-5 w-5" /></span>
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

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-xl text-sky-700">{icon}</span>
      <div><p className="text-[10px] uppercase text-slate-400">{label}</p><p className="font-bold text-slate-800">{value}</p></div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'rose' | 'amber' | 'sky' }) {
  const tones: Record<string, string> = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700', rose: 'border-rose-200 bg-rose-50 text-rose-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', sky: 'border-sky-200 bg-sky-50 text-sky-700' };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] font-bold uppercase opacity-70">{label} · 30 days</p>
    </div>
  );
}
