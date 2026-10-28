'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiTrendingUp, FiUsers, FiDollarSign, FiBookOpen, FiRefreshCw } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Analytics {
  totals: { total: number; completed: number; completionRate: number; inProgress: number };
  categories: { name: string; total: number; completed: number; completionPct: number }[];
  departments: { name: string; total: number; completed: number; completionPct: number }[];
  topCourses: { title: string; completions: number; avgRating: number | null }[];
  kirkpatrick: {
    l1: { responses: number; overall: number | null; instructor: number | null; content: number | null; promoters: number; detractors: number };
    l2: { tested: number; avgPre: number | null; avgPost: number | null; delta: number | null; retentionPct: number | null; avgScore: number | null };
    l3: { pairedEmployees: number; avgBefore: number | null; avgAfter: number | null; delta?: number | null; improved: number };
    l4: { spendINR: number; estimatedBenefitINR: number; roiPct: number | null; trainedHeadcount: number; blendedHourlyRateINR: number; formula: string };
  };
  promotionReadiness: { name: string; required: number; eligible: number; inProgress: number }[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const bar = (pct: number, tone = 'bg-emerald-500') => <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${tone} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} /></div>;

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/learning/analytics', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load analytics'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiTrendingUp className="text-emerald-500" /> Training Analytics &amp; ROI — Kirkpatrick Model</h1>
          <p className="text-sm thb-text-secondary mt-1">Four-level evaluation: Reaction → Learning → Behavior → Results, plus financial ROI on training spend.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary hover:bg-gray-50"><FiRefreshCw /> Refresh</button>
      </div>

      {loading || !data ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="thb-card h-48 animate-pulse" />)}</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="thb-card p-4"><div className="text-2xl font-bold thb-text-primary">{data.totals.completionRate}%</div><div className="text-xs thb-text-secondary">Completion rate</div><div className="mt-2">{bar(data.totals.completionRate)}</div></div>
            <div className="thb-card p-4"><div className="text-2xl font-bold thb-text-primary">{data.totals.total}</div><div className="text-xs thb-text-secondary">Total enrolments</div><div className="text-[11px] thb-text-muted mt-1">{data.totals.completed} completed · {data.totals.inProgress} in progress</div></div>
            <div className="thb-card p-4"><div className="text-2xl font-bold text-emerald-600">{data.kirkpatrick.l4.roiPct !== null ? `${data.kirkpatrick.l4.roiPct}%` : '—'}</div><div className="text-xs thb-text-secondary">Training ROI</div><div className="text-[11px] thb-text-muted mt-1">{inr(data.kirkpatrick.l4.spendINR)} spend · {data.kirkpatrick.l4.trainedHeadcount} trained</div></div>
            <div className="thb-card p-4"><div className="text-2xl font-bold thb-text-primary">{data.kirkpatrick.l2.delta !== null ? `+${data.kirkpatrick.l2.delta}` : '—'}</div><div className="text-xs thb-text-secondary">Knowledge gain (L2)</div><div className="text-[11px] thb-text-muted mt-1">{data.kirkpatrick.l2.avgPre ?? '—'} → {data.kirkpatrick.l2.avgPost ?? '—'} pts</div></div>
          </div>

          {/* Kirkpatrick levels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary flex items-center gap-2 mb-3"><FiUsers className="text-emerald-500" /> Level 1 — Reaction (Feedback)</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-xl font-bold text-emerald-600">{data.kirkpatrick.l1.overall ?? '—'}</div><div className="text-[11px] thb-text-secondary">Overall (of 5)</div></div>
                <div><div className="text-xl font-bold thb-text-primary">{data.kirkpatrick.l1.instructor ?? '—'}</div><div className="text-[11px] thb-text-secondary">Instructor</div></div>
                <div><div className="text-xl font-bold thb-text-primary">{data.kirkpatrick.l1.content ?? '—'}</div><div className="text-[11px] thb-text-secondary">Content relevance</div></div>
              </div>
              <p className="text-xs thb-text-muted mt-3">{data.kirkpatrick.l1.responses} feedback responses · {data.kirkpatrick.l1.promoters} promoters (4–5★) · {data.kirkpatrick.l1.detractors} detractors (≤2★)</p>
            </div>

            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary flex items-center gap-2 mb-3"><FiBookOpen className="text-sky-500" /> Level 2 — Learning (Assessments)</h2>
              <div className="flex items-end gap-6">
                <div><div className="text-2xl font-bold thb-text-primary">{data.kirkpatrick.l2.avgPre ?? '—'}</div><div className="text-[11px] thb-text-secondary">Avg pre-test</div></div>
                <div className="text-emerald-500 text-xl pb-1">→</div>
                <div><div className="text-2xl font-bold text-emerald-600">{data.kirkpatrick.l2.avgPost ?? '—'}</div><div className="text-[11px] thb-text-secondary">Avg post-test</div></div>
                <div className="ml-auto text-right"><div className="text-lg font-bold thb-text-primary">{data.kirkpatrick.l2.retentionPct !== null ? `${data.kirkpatrick.l2.retentionPct}%` : '—'}</div><div className="text-[11px] thb-text-secondary">improved score</div></div>
              </div>
              <p className="text-xs thb-text-muted mt-3">{data.kirkpatrick.l2.tested} employees with paired pre/post-test data · avg completion score {data.kirkpatrick.l2.avgScore ?? '—'}%</p>
            </div>

            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary flex items-center gap-2 mb-3"><FiTrendingUp className="text-violet-500" /> Level 3 — Behavior (Performance impact)</h2>
              <div className="flex items-end gap-6">
                <div><div className="text-2xl font-bold thb-text-primary">{data.kirkpatrick.l3.avgBefore ?? '—'}</div><div className="text-[11px] thb-text-secondary">Skills rating 90d before</div></div>
                <div className="text-emerald-500 text-xl pb-1">→</div>
                <div><div className="text-2xl font-bold text-emerald-600">{data.kirkpatrick.l3.avgAfter ?? '—'}</div><div className="text-[11px] thb-text-secondary">Skills rating 90d after</div></div>
                <div className="ml-auto text-right"><div className="text-lg font-bold text-emerald-600">{data.kirkpatrick.l3.delta ? `+${data.kirkpatrick.l3.delta}` : '—'}</div><div className="text-[11px] thb-text-secondary">delta</div></div>
              </div>
              <p className="text-xs thb-text-muted mt-3">{data.kirkpatrick.l3.pairedEmployees} employees with before/after performance reviews · {data.kirkpatrick.l3.improved} improved</p>
            </div>

            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary flex items-center gap-2 mb-3"><FiDollarSign className="text-amber-500" /> Level 4 — Results (Financial ROI)</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold thb-text-primary">{inr(data.kirkpatrick.l4.spendINR)}</div><div className="text-[11px] thb-text-secondary">Total spend</div></div>
                <div><div className="text-lg font-bold thb-text-primary">{inr(data.kirkpatrick.l4.estimatedBenefitINR)}</div><div className="text-[11px] thb-text-secondary">Est. annual benefit</div></div>
                <div><div className="text-lg font-bold text-emerald-600">{data.kirkpatrick.l4.roiPct !== null ? `${data.kirkpatrick.l4.roiPct}%` : '—'}</div><div className="text-[11px] thb-text-secondary">ROI</div></div>
              </div>
              <p className="text-[11px] thb-text-muted mt-3 leading-relaxed">{data.kirkpatrick.l4.formula}</p>
            </div>
          </div>

          {/* Categories + departments + top courses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary mb-3">By category</h2>
              <div className="space-y-2.5">
                {data.categories.map((c) => (
                  <div key={c.name}><div className="flex justify-between text-xs mb-1"><span className="thb-text-primary capitalize">{c.name.replace('_', ' ')}</span><span className="thb-text-secondary">{c.completionPct}% of {c.total}</span></div>{bar(c.completionPct)}</div>
                ))}
                {data.categories.length === 0 ? <p className="text-xs thb-text-muted">No data yet.</p> : null}
              </div>
            </div>
            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary mb-3">By department</h2>
              <div className="space-y-2.5">
                {data.departments.slice(0, 6).map((d) => (
                  <div key={d.name}><div className="flex justify-between text-xs mb-1"><span className="thb-text-primary">{d.name}</span><span className="thb-text-secondary">{d.completionPct}% of {d.total}</span></div>{bar(d.completionPct, 'bg-sky-500')}</div>
                ))}
                {data.departments.length === 0 ? <p className="text-xs thb-text-muted">No data yet.</p> : null}
              </div>
            </div>
            <div className="thb-card p-5">
              <h2 className="font-semibold thb-text-primary mb-3">Top courses</h2>
              <div className="space-y-2">
                {data.topCourses.map((c) => (
                  <div key={c.title} className="flex justify-between items-center text-xs">
                    <span className="thb-text-primary truncate pr-2">{c.title}</span>
                    <span className="thb-text-secondary shrink-0">{c.completions} done{c.avgRating ? ` · ★${c.avgRating}` : ''}</span>
                  </div>
                ))}
                {data.topCourses.length === 0 ? <p className="text-xs thb-text-muted">No completions yet.</p> : null}
              </div>
              {data.promotionReadiness.length > 0 ? (
                <div className="mt-4 pt-3 border-t thb-border">
                  <h3 className="text-xs font-semibold thb-text-secondary uppercase mb-2">Promotion readiness</h3>
                  {data.promotionReadiness.map((p) => (
                    <div key={p.name} className="flex justify-between text-xs py-1"><span className="thb-text-primary truncate pr-2">{p.name}</span><span className="text-emerald-600 font-medium">{p.eligible} eligible · {p.inProgress} in progress</span></div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
