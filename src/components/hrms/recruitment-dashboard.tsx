'use client';

/**
 * Recruitment Dashboard — sidebar entry under RECRUITMENT.
 *
 * Visual overview of the recruitment funnel. Reuses the existing
 * /api/recruitment GET response which already returns:
 *   - stats: openPositions, totalApplications, interviewsScheduled,
 *            offersPending, hiresThisMonth, avgTimeToHire
 *   - pipelineData: stage → count
 *   - monthlyTrend: applications + hires per month (last 6 months)
 *   - sourceData: source channel → count
 *   - upcomingInterviews: next 5 scheduled interviews
 *
 * Charts are built with inline SVG + CSS — no extra chart library
 * dependency. Recharts is already in the project, but the dashboard
 * doesn't need axis-level interactivity; simple bars + funnel are
 * clearer for an executive overview.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Briefcase, TrendingUp, Users, CalendarClock, Award, Clock, Target, Zap,
  RefreshCw, AlertTriangle, Loader2, ArrowUpRight, ArrowDownRight, BarChart3, FunnelIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/store/app-store';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Stats {
  openPositions: number;
  totalApplications: number;
  interviewsScheduled: number;
  offersPending: number;
  hiresThisMonth: number;
  avgTimeToHire: number | null;
}

interface PipelineItem { stage: string; key: string; count: number; }

interface MonthlyTrendItem { month: string; applications: number; hires: number; }

interface SourceItem { source: string; count: number; }

interface UpcomingInterview {
  id?: string;
  candidateName?: string;
  candidateEmail?: string;
  date: string;
  time?: string;
  jobTitle?: string;
  jobApplication?: { candidateName?: string; jobPosting?: { title?: string } };
}

interface DashboardData {
  stats: Stats;
  pipelineData: PipelineItem[];
  monthlyTrend: MonthlyTrendItem[];
  sourceData: SourceItem[];
  upcomingInterviews: UpcomingInterview[];
}

const EMPTY: DashboardData = {
  stats: { openPositions: 0, totalApplications: 0, interviewsScheduled: 0, offersPending: 0, hiresThisMonth: 0, avgTimeToHire: null },
  pipelineData: [], monthlyTrend: [], sourceData: [], upcomingInterviews: [],
};

// Approximate month-over-month change calculation (simple visual indicator)
function calcMoM(trend: MonthlyTrendItem[]): { appsDelta: number | null; hiresDelta: number | null } {
  if (trend.length < 2) return { appsDelta: null, hiresDelta: null };
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const appsDelta = prev.applications === 0
    ? (last.applications > 0 ? 100 : 0)
    : Math.round(((last.applications - prev.applications) / prev.applications) * 100);
  const hiresDelta = prev.hires === 0
    ? (last.hires > 0 ? 100 : 0)
    : Math.round(((last.hires - prev.hires) / prev.hires) * 100);
  return { appsDelta, hiresDelta };
}

export function RecruitmentDashboard() {
  const { setActiveModule } = useAppStore();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      setData({
        stats: json.stats || EMPTY.stats,
        pipelineData: json.pipelineData || [],
        monthlyTrend: json.monthlyTrend || [],
        sourceData: json.sourceData || [],
        upcomingInterviews: json.upcomingInterviews || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const mom = useMemo(() => calcMoM(data.monthlyTrend), [data.monthlyTrend]);

  // Pipeline funnel: each stage's bar width is proportional to its count
  const maxStageCount = useMemo(
    () => Math.max(1, ...data.pipelineData.map((p) => p.count)),
    [data.pipelineData],
  );

  // Monthly chart: bar heights proportional to max applications
  const maxMonthlyApps = useMemo(
    () => Math.max(1, ...data.monthlyTrend.map((m) => m.applications)),
    [data.monthlyTrend],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-600" /> Recruitment Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Snapshot of your hiring funnel — applications, interviews, offers, and hires.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={<Briefcase className="h-4 w-4" />} label="Open Positions" value={data.stats.openPositions} color="bg-blue-100 text-blue-700" />
            <StatCard icon={<Users className="h-4 w-4" />} label="Total Applications" value={data.stats.totalApplications} color="bg-slate-100 text-slate-700" delta={mom.appsDelta} />
            <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Interviews Scheduled" value={data.stats.interviewsScheduled} color="bg-amber-100 text-amber-700" />
            <StatCard icon={<Award className="h-4 w-4" />} label="Offers Pending" value={data.stats.offersPending} color="bg-violet-100 text-violet-700" />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Hires This Month" value={data.stats.hiresThisMonth} color="bg-emerald-100 text-emerald-700" delta={mom.hiresDelta} />
            <StatCard icon={<Clock className="h-4 w-4" />} label="Avg Time to Hire" value={data.stats.avgTimeToHire != null ? `${data.stats.avgTimeToHire}d` : '—'} color="bg-cyan-100 text-cyan-700" />
          </div>

          {/* Quick actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Quick Actions</span>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('pipeline_kanban')}>
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> View Pipeline
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('schedule_interview')}>
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5" /> Schedule Interview
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('submissions')}>
                  <Users className="h-3.5 w-3.5 mr-1.5" /> View Submissions
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('resumes')}>
                  <Briefcase className="h-3.5 w-3.5 mr-1.5" /> Review Resumes
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('talent_pool')}>
                  <Target className="h-3.5 w-3.5 mr-1.5" /> Talent Pool
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveModule('recruitment')}>
                  <Zap className="h-3.5 w-3.5 mr-1.5" /> All Jobs (ATS)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Two-column: pipeline funnel + monthly chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pipeline funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FunnelIcon className="h-4 w-4 text-emerald-600" /> Pipeline Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.pipelineData.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No pipeline data yet.</p>
                )}
                {data.pipelineData.map((stage) => {
                  const widthPct = (stage.count / maxStageCount) * 100;
                  const colors: Record<string, string> = {
                    applied: 'bg-slate-400', screening: 'bg-blue-500', interview: 'bg-amber-500',
                    offered: 'bg-violet-500', hired: 'bg-emerald-500', rejected: 'bg-red-500',
                  };
                  return (
                    <div key={stage.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{stage.stage}</span>
                        <span className="text-muted-foreground">{stage.count}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${colors[stage.key] || 'bg-slate-400'}`}
                          style={{ width: `${Math.max(widthPct, stage.count > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                  Total in pipeline: <strong>{data.pipelineData.reduce((sum, s) => sum + s.count, 0)}</strong>
                </div>
              </CardContent>
            </Card>

            {/* Monthly applications + hires chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-600" /> Applications vs Hires (6 months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.monthlyTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No trend data yet.</p>
                ) : (
                  <div className="flex items-end justify-between gap-2 h-40">
                    {data.monthlyTrend.map((m) => {
                      const appHeight = (m.applications / maxMonthlyApps) * 100;
                      const maxHires = Math.max(1, ...data.monthlyTrend.map((x) => x.hires));
                      const hireHeight = (m.hires / maxHires) * 100;
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                          <div className="flex items-end justify-center gap-0.5 h-32 w-full">
                            <div
                              className="w-1/2 bg-emerald-500 rounded-t-sm transition-all hover:bg-emerald-600"
                              style={{ height: `${Math.max(appHeight, m.applications > 0 ? 4 : 0)}%` }}
                              title={`${m.applications} applications`}
                            />
                            <div
                              className="w-1/2 bg-blue-500 rounded-t-sm transition-all hover:bg-blue-600"
                              style={{ height: `${Math.max(hireHeight, m.hires > 0 ? 4 : 0)}%` }}
                              title={`${m.hires} hires`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium">{m.month}</span>
                          <div className="text-[10px] flex gap-1">
                            <span className="text-emerald-600">{m.applications}</span>
                            <span className="text-blue-600">{m.hires}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500"></span> Applications
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-blue-500"></span> Hires
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Two-column: sources + upcoming interviews */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Source breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-600" /> Candidate Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.sourceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No source data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.sourceData.map((s) => {
                      const total = data.sourceData.reduce((sum, x) => sum + x.count, 0) || 1;
                      const pct = Math.round((s.count / total) * 100);
                      return (
                        <div key={s.source} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium capitalize">{s.source}</span>
                            <span className="text-muted-foreground">{s.count} ({pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming interviews */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-emerald-600" /> Upcoming Interviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.upcomingInterviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No upcoming interviews.</p>
                ) : (
                  <div className="space-y-2">
                    {data.upcomingInterviews.slice(0, 5).map((iv, idx) => {
                      const name = iv.candidateName || iv.jobApplication?.candidateName || 'Candidate';
                      const title = iv.jobTitle || iv.jobApplication?.jobPosting?.title || 'Position TBD';
                      const dateStr = iv.date
                        ? new Date(iv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'TBD';
                      return (
                        <div key={iv.id || idx} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0">
                            {name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{name}</div>
                            <div className="text-xs text-muted-foreground truncate">{title}</div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground shrink-0">
                            <div>{dateStr}</div>
                            {iv.time && <div>{iv.time}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, color, delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  delta?: number | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${color}`}>
            {icon}
          </div>
          {delta != null && delta !== 0 && (
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${delta > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {delta > 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
              {Math.abs(delta)}%
            </Badge>
          )}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
