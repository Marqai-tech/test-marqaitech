'use client';

/* ════════════════════════════════════════════════════════════════════
   AI Insights shared kit (Task 159) — SmartHR "AI Center" style
   building blocks reused by every /ai-insights/* page:
   AiBanner, AiKpi, AiModelChip, AiInsightRow, AiPredictionCard,
   AiPageShell, TrendArea, BarsCompare, DonutSplit, ProgressRow
   ════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FiCpu, FiRefreshCw, FiTrendingUp, FiTrendingDown, FiMinus,
  FiArrowRight, FiEye, FiTrash2, FiCheckCircle,
} from 'react-icons/fi';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { PageBreadcrumbs } from '@/components/dashboard/smarthr-widgets';

/* ── auth header helper (mirrors the rest of the app) ── */
export function aiAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Fetch JSON with auth; returns null (never throws) so pages can fall back to derived/sample analytics. */
export function aiFetch<T>(url: string): Promise<T | null> {
  return fetch(url, { headers: aiAuthHeaders(), cache: 'no-store' })
    .then(r => (r.ok ? r.json() as Promise<T> : null))
    .catch(() => null);
}

/** Hook: run async loader on mount + manual refresh. */
export function useAiLoader<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, loading, refresh };
}

/* ── Page banner ── */
export function AiBanner({ title, trail, right }: {
  title: string; trail: string[];
  right?: React.ReactNode;
}) {
  return (
    <PageBreadcrumbs
      title={title}
      trail={trail}
      right={
        <>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 ring-1 ring-white/25 text-white">
            <FiCpu className="w-3 h-3" /> AI-generated
          </span>
          {right}
        </>
      }
    />
  );
}

/* ── Model provenance chip — keeps the analytics honest about what produced them ── */
export function AiModelChip({ model, updated }: { model: string; updated?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1">
      <FiCpu className="w-3 h-3" />
      {model}{updated ? ` · updated ${updated}` : ''}
    </span>
  );
}

/* ── KPI card ── */
const KPI_TONES: Record<string, { grad: string; ring: string }> = {
  violet: { grad: 'from-violet-500 to-purple-600', ring: 'bg-violet-50 text-violet-600' },
  blue: { grad: 'from-sky-500 to-blue-600', ring: 'bg-sky-50 text-sky-600' },
  emerald: { grad: 'from-emerald-500 to-green-600', ring: 'bg-emerald-50 text-emerald-600' },
  amber: { grad: 'from-amber-500 to-orange-600', ring: 'bg-amber-50 text-amber-600' },
  rose: { grad: 'from-rose-500 to-red-600', ring: 'bg-rose-50 text-rose-600' },
  cyan: { grad: 'from-cyan-500 to-sky-600', ring: 'bg-cyan-50 text-cyan-600' },
};

export function AiKpi({ label, value, delta, deltaTone = 'up', icon, tone = 'violet', sub }: {
  label: string; value: string | number;
  delta?: string; deltaTone?: 'up' | 'down' | 'flat';
  icon: React.ReactNode; tone?: keyof typeof KPI_TONES; sub?: string;
}) {
  const t = KPI_TONES[tone] || KPI_TONES.violet;
  const DeltaIcon = deltaTone === 'up' ? FiTrendingUp : deltaTone === 'down' ? FiTrendingDown : FiMinus;
  const deltaCls = deltaTone === 'up' ? 'bg-emerald-50 text-emerald-600'
    : deltaTone === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500';
  return (
    <div className="thb-card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.grad} text-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-thb-text-secondary uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-2xl font-bold text-thb-text-primary">{value}</span>
          {delta && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${deltaCls}`}>
              <DeltaIcon className="w-3 h-3" /> {delta}
            </span>
          )}
        </div>
        {sub && <p className="text-[11px] text-thb-text-muted mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ── AI narrative / prediction card ── */
export type AiBadge = { label: string; tone: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' };
const BADGE_CLS: Record<AiBadge['tone'], string> = {
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function AiPredictionCard({ title, body, badges, accent = 'violet', onView, onDelete }: {
  title: string; body: string; badges: AiBadge[]; accent?: keyof typeof KPI_TONES;
  onView?: () => void; onDelete?: () => void;
}) {
  const t = KPI_TONES[accent] || KPI_TONES.violet;
  return (
    <div className="thb-card p-4 border-l-4 border-l-violet-500">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${t.ring} flex items-center justify-center flex-shrink-0`}>
          <FiCpu className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-thb-text-primary">{title}</h4>
          <p className="text-sm text-thb-text-secondary mt-1 leading-relaxed">{body}</p>
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {badges.map(b => (
              <span key={b.label} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${BADGE_CLS[b.tone]}`}>{b.label}</span>
            ))}
            <span className="ml-auto flex items-center gap-1">
              {onView && (
                <button onClick={onView} className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 transition-colors">
                  <FiEye className="w-3 h-3" /> View
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors">
                  <FiTrash2 className="w-3 h-3" /> Dismiss
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Irregularity / insight row (compact list item) ── */
export function AiInsightRow({ time, title, subtitle, tone = 'amber' }: {
  time: string; title: string; subtitle: string; tone?: 'amber' | 'rose' | 'sky' | 'violet' | 'emerald';
}) {
  const dot: Record<string, string> = {
    amber: 'bg-amber-400', rose: 'bg-rose-500', sky: 'bg-sky-500', violet: 'bg-violet-500', emerald: 'bg-emerald-500',
  };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-thb-border/60 last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dot[tone]}`} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-thb-text-muted">{time}</p>
        <p className="text-sm font-medium text-thb-text-primary mt-0.5">{title}</p>
        <p className="text-xs text-thb-text-secondary mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

/* ── Charts (recharts wrappers with the shared AI palette) ── */
export const AI_PALETTE = ['#8B5CF6', '#009EFB', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4', '#6366F1'];

const AXIS = { fontSize: 11, fill: '#94a3b8' };
const TIP_STYLE = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 };

export function TrendArea({ data, xKey, series, height = 260, bandKey }: {
  data: Array<Record<string, unknown>>; xKey: string; height?: number;
  series: Array<{ key: string; label: string; color: string; dashed?: boolean }>;
  bandKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`aiGrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={46} />
        <Tooltip contentStyle={TIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bandKey && (
          <Area type="monotone" dataKey={bandKey} name="Confidence band" stroke="none" fill="#8B5CF6" fillOpacity={0.08} legendType="none" />
        )}
        {series.map(s => (
          <Area
            key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined}
            fill={`url(#aiGrad-${s.key})`} dot={false} activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsCompare({ data, xKey, series, height = 260, stacked = false, layout = 'horizontal' }: {
  data: Array<Record<string, unknown>>; xKey: string; height?: number;
  series: Array<{ key: string; label: string; color: string }>;
  stacked?: boolean; layout?: 'horizontal' | 'vertical';
}) {
  const vertical = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
          </>
        )}
        <Tooltip contentStyle={TIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={26} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutSplit({ data, height = 240, unit = '' }: {
  data: Array<{ name: string; value: number }>; height?: number; unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={AI_PALETTE[i % AI_PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={TIP_STYLE} formatter={(value) => `${String(value)}${unit}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Progress row (label + bar + value) ── */
export function ProgressRow({ label, value, pct, color = 'bg-violet-500' }: {
  label: string; value: string; pct: number; color?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-thb-text-secondary">{label}</span>
        <span className="font-semibold text-thb-text-primary">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

/* ── Page shell with refresh ── */
export function AiPageShell({ children, loading, onRefresh }: {
  children: React.ReactNode; loading?: boolean; onRefresh?: () => void;
}) {
  return (
    <div className="space-y-6">
      {children}
      {onRefresh && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-thb-text-muted inline-flex items-center gap-1.5">
            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Analytics derived from live HRMS data where available; heuristics are labelled on each panel.
          </p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border border-thb-border text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary disabled:opacity-50 transition-colors"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Refresh insights'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Module card for the hub page ── */
export function AiHubCard({ href, icon, title, description, accent, stat, statLabel }: {
  href: string; icon: React.ReactNode; title: string; description: string;
  accent: keyof typeof KPI_TONES; stat?: string | number; statLabel?: string;
}) {
  const t = KPI_TONES[accent] || KPI_TONES.violet;
  return (
    <Link href={href} className="thb-card p-5 group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 block">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.grad} text-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <FiArrowRight className="w-4 h-4 text-thb-text-muted group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="text-base font-semibold text-thb-text-primary mt-4">{title}</h3>
      <p className="text-sm text-thb-text-secondary mt-1 leading-relaxed">{description}</p>
      {stat !== undefined && (
        <div className="mt-3 pt-3 border-t border-thb-border flex items-baseline gap-2">
          <span className="text-lg font-bold text-thb-text-primary">{stat}</span>
          {statLabel && <span className="text-xs text-thb-text-muted">{statLabel}</span>}
        </div>
      )}
    </Link>
  );
}

/* ── shared helpers ── */
export const AI_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function localDateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${(n / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
