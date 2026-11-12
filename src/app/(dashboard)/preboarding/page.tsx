'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiRefreshCw, FiUsers, FiCalendar, FiClock, FiFileText, FiCheckCircle,
  FiXCircle, FiAlertTriangle, FiUserCheck, FiFlag, FiChevronRight,
  FiUserPlus, FiList, FiEye, FiBell, FiEdit2, FiCheckSquare, FiActivity,
  FiSearch, FiFilter, FiAlertCircle, FiArrowRight,
} from 'react-icons/fi';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PreboardingDocument {
  id: string;
  documentType: string | null;
  documentLabel: string | null;
  status: string;
  reviewNotes: string | null;
  uploadedAt: string | null;
  fileName: string | null;
}

interface PreboardingCandidate {
  id: string;
  preboardingId: string | null;
  candidateId: string | null;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  companyEmail: string | null;
  recruiter: string | null;
  hrAssignedTo: string | null;
  joiningDate: string | null;
  offerStatus: string;
  documentStatus: string;
  verificationStatus: string;
  joiningReadiness: string;
  readinessPercent: number;
  stage: string;
  stageLabel: string;
  joiningConfirmed: boolean;
  documents: PreboardingDocument[];
  createdAt: string;
}

interface PipelineMetrics {
  totalPreboarding: number;
  upcomingJoiners: number;
  joiningThisWeek: number;
  documentsPending: number;
  verificationPending: number;
  documentsRejected: number;
  joiningReadinessPending: number;
  joiningConfirmed: number;
  joiningCompleted: number;
  didNotJoin: number;
  stageCounts: Record<string, number>;
}

interface PipelineResponse {
  candidates: PreboardingCandidate[];
  metrics: PipelineMetrics;
  total: number;
}

interface MetricCardDef {
  key: string;
  label: string;
  value: number;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  href: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function PreboardingDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('last30');
  // captured at fetch time so render-time derivations stay pure (no Date.now in render)
  const [nowMs, setNowMs] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as PipelineResponse;
      setNowMs(Date.now());
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preboarding data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  const metrics: PipelineMetrics | null = data?.metrics ?? null;
  const candidates = useMemo(() => data?.candidates ?? [], [data]);

  // ─── Derived widget data ───

  const upcomingJoiners = useMemo(() => {
    const now = nowMs; // timestamp captured at fetch time, not during render
    return candidates
      .filter(c => c.joiningDate && new Date(c.joiningDate).getTime() > now && !['joined', 'did_not_join', 'cancelled'].includes(c.stage))
      .sort((a, b) => new Date(a.joiningDate as string).getTime() - new Date(b.joiningDate as string).getTime());
  }, [candidates, nowMs]);

  const pendingDocs = useMemo(() => {
    const rows: { candidateId: string; candidateName: string; documentLabel: string; status: string }[] = [];
    for (const c of candidates) {
      if (['did_not_join', 'cancelled'].includes(c.stage)) continue;
      for (const d of c.documents || []) {
        if (d.status === 'pending' || d.status === 'rejected') {
          rows.push({
            candidateId: c.id,
            candidateName: c.candidateName,
            documentLabel: d.documentLabel || d.documentType || 'Document',
            status: d.status,
          });
        }
      }
    }
    return rows;
  }, [candidates]);

  const verificationSummary = useMemo(() => {
    let submitted = 0, approved = 0, rejected = 0, pending = 0;
    for (const c of candidates) {
      for (const d of c.documents || []) {
        if (d.status === 'submitted') submitted += 1;
        else if (d.status === 'approved') approved += 1;
        else if (d.status === 'rejected') rejected += 1;
        else pending += 1;
      }
    }
    const total = submitted + approved + rejected + pending;
    return { submitted, approved, rejected, pending, total };
  }, [candidates]);

  const readinessSummary = useMemo(() => {
    const relevant = candidates.filter(c => !['did_not_join', 'cancelled'].includes(c.stage));
    if (!relevant.length) return { avg: 0, ready: 0, notReady: 0 };
    const sum = relevant.reduce((acc, c) => acc + (Number(c.readinessPercent) || 0), 0);
    return {
      avg: Math.round(sum / relevant.length),
      ready: relevant.filter(c => c.joiningReadiness === 'Ready').length,
      notReady: relevant.filter(c => c.joiningReadiness !== 'Ready').length,
    };
  }, [candidates]);

  const deptJoiners = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of upcomingJoiners.slice(0, 300)) {
      const dept = c.department || 'Unassigned';
      map.set(dept, (map.get(dept) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [upcomingJoiners]);

  const delayedActivities = useMemo(() => {
    const now = nowMs; // timestamp captured at fetch time, not during render
    return candidates
      .filter(c => c.joiningDate && new Date(c.joiningDate).getTime() < now && !['joined', 'did_not_join', 'cancelled'].includes(c.stage))
      .map(c => ({
        ...c,
        daysOverdue: Math.max(1, Math.floor((now - new Date(c.joiningDate as string).getTime()) / DAY_MS)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 6);
  }, [candidates, nowMs]);

  const departments = useMemo(
    () => Array.from(new Set(candidates.map(c => c.department).filter((d): d is string => Boolean(d)))).sort(),
    [candidates],
  );
  const recruiters = useMemo(
    () => Array.from(new Set(candidates.map(c => c.recruiter).filter((r): r is string => Boolean(r)))).sort(),
    [candidates],
  );

  // ─── Metric cards ───

  const row1: MetricCardDef[] = [
    {
      key: 'total', label: 'Total Preboarding', value: metrics?.totalPreboarding ?? 0,
      delta: 'All candidates undergoing preboarding',
      icon: FiUsers, iconBg: 'bg-teal-50', iconColor: 'text-teal-600',
      href: '/preboarding/candidates',
    },
    {
      key: 'upcoming', label: 'Upcoming Joiners', value: metrics?.upcomingJoiners ?? 0,
      delta: 'Future joining dates scheduled',
      icon: FiCalendar, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
      href: '/preboarding/candidates?stage=initiated',
    },
    {
      key: 'week', label: 'Joining This Week', value: metrics?.joiningThisWeek ?? 0,
      delta: 'Expected to join within 7 days',
      icon: FiClock, iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
      href: '/preboarding/candidates',
    },
    {
      key: 'docs_pending', label: 'Documents Pending', value: metrics?.documentsPending ?? 0,
      delta: 'Awaiting document submission',
      icon: FiFileText, iconBg: 'bg-violet-50', iconColor: 'text-violet-600',
      href: '/preboarding/candidates?filter=documents_pending',
    },
    {
      key: 'verif_pending', label: 'Verification Pending', value: metrics?.verificationPending ?? 0,
      delta: 'Documents under HR review',
      icon: FiEye, iconBg: 'bg-slate-100', iconColor: 'text-slate-600',
      href: '/preboarding/candidates?filter=verification_pending',
    },
  ];

  const row2: MetricCardDef[] = [
    {
      key: 'docs_rejected', label: 'Documents Rejected', value: metrics?.documentsRejected ?? 0,
      delta: 'Sent back for correction',
      icon: FiXCircle, iconBg: 'bg-red-50', iconColor: 'text-red-600',
      href: '/preboarding/candidates?filter=documents_pending',
    },
    {
      key: 'readiness_pending', label: 'Joining Readiness Pending', value: metrics?.joiningReadinessPending ?? 0,
      delta: 'Readiness checklist incomplete',
      icon: FiAlertTriangle, iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
      href: '/preboarding/candidates?readiness=Not%20Ready',
    },
    {
      key: 'confirmed', label: 'Joining Confirmed', value: metrics?.joiningConfirmed ?? 0,
      delta: 'Candidates confirmed to join',
      icon: FiCheckCircle, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
      href: '/preboarding/candidates?readiness=Ready',
    },
    {
      key: 'completed', label: 'Joining Completed', value: metrics?.joiningCompleted ?? 0,
      delta: 'Successfully onboarded',
      icon: FiUserCheck, iconBg: 'bg-teal-50', iconColor: 'text-teal-600',
      href: '/preboarding/candidates?stage=joined',
    },
    {
      key: 'dnj', label: 'Did Not Join', value: metrics?.didNotJoin ?? 0,
      delta: 'No-shows after offer acceptance',
      icon: FiFlag, iconBg: 'bg-red-50', iconColor: 'text-red-600',
      href: '/preboarding/candidates?stage=did_not_join',
    },
  ];

  // ─── Pipeline stepper ───

  const stageCounts = metrics?.stageCounts ?? {};
  const pipelineNodes: { label: string; count: number; color: string; ring: string }[] = [
    { label: 'Offer Accepted', count: metrics?.totalPreboarding ?? 0, color: 'bg-teal-600', ring: 'ring-teal-600' },
    { label: 'Initiated', count: stageCounts['initiated'] ?? 0, color: 'bg-teal-600', ring: 'ring-teal-600' },
    { label: 'Details Pending', count: stageCounts['details_pending'] ?? 0, color: 'bg-amber-500', ring: 'ring-amber-500' },
    { label: 'Verification', count: stageCounts['verification'] ?? 0, color: 'bg-violet-500', ring: 'ring-violet-500' },
    { label: 'Ready to Join', count: stageCounts['ready_to_join'] ?? 0, color: 'bg-emerald-500', ring: 'ring-emerald-500' },
    { label: 'Joined', count: stageCounts['joined'] ?? 0, color: 'bg-emerald-600', ring: 'ring-emerald-600' },
  ];

  // ─── Donut for verification queue ───

  const donutSegments = useMemo(() => {
    const { submitted, approved, rejected, total } = verificationSummary;
    if (!total) return { gradient: 'bg-slate-100', empty: true };
    const pct = (n: number) => (n / total) * 360;
    const a1 = 0;
    const a2 = a1 + pct(approved);
    const a3 = a2 + pct(submitted);
    const a4 = a3 + pct(rejected);
    // conic-gradient stops: approved (emerald), submitted (violet), rejected (red), pending (amber)
    const gradient = `conic-gradient(#059669 0deg ${a2}deg, #7c3aed ${a2}deg ${a3}deg, #dc2626 ${a3}deg ${a4}deg, #f59e0b ${a4}deg 360deg)`;
    return { gradient, empty: false };
  }, [verificationSummary]);

  // ─── Filters navigation ───

  const [fDepartment, setFDepartment] = useState('');
  const [fStage, setFStage] = useState('');
  const [fVerification, setFVerification] = useState('');
  const [fDateRange, setFDateRange] = useState('');
  const [fRecruiter, setFRecruiter] = useState('');

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (fDepartment) params.set('department', fDepartment);
    if (fStage) params.set('stage', fStage);
    if (fVerification) params.set('verification', fVerification);
    if (fDateRange) params.set('dateRange', fDateRange);
    if (fRecruiter) params.set('recruiter', fRecruiter);
    router.push(`/preboarding/candidates${params.toString() ? `?${params.toString()}` : ''}`);
  };

  // ─── Render ───

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="h-10 w-72 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
              <div className="h-7 w-16 rounded bg-slate-200 animate-pulse" />
              <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
              <div className="h-7 w-16 rounded bg-slate-200 animate-pulse" />
              <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="h-5 w-48 rounded bg-slate-200 animate-pulse mb-6" />
          <div className="h-16 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6 flex items-start gap-4">
          <FiAlertCircle className="text-red-500 text-xl mt-0.5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-red-700">Failed to load preboarding dashboard</h2>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button
              onClick={() => fetchData()}
              className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
            >
              <FiRefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasAnyData = (metrics?.totalPreboarding ?? 0) > 0 || candidates.length > 0;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Page header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-10 w-1.5 rounded-full bg-teal-600 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Preboarding Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track candidates from offer acceptance to joining</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Reporting period"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700"
          >
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="last90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={() => { fetchData(); toast.success('Dashboard refreshed'); }}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </header>

      {!hasAnyData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <FiUsers className="text-slate-300 text-3xl mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-slate-700">No candidates in preboarding yet</h2>
          <p className="text-sm text-slate-500 mt-1">Initiate preboarding from accepted offers to see dashboard data.</p>
          <button
            onClick={() => router.push('/offers')}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiUserPlus className="w-4 h-4" /> Go to Offers
          </button>
        </div>
      )}

      {/* 2. Metric cards row 1 */}
      <section aria-label="Preboarding metrics overview">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {row1.map(card => (
            <button
              key={card.key}
              type="button"
              onClick={() => router.push(card.href)}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left hover:border-teal-300 hover:shadow transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <div className={`h-9 w-9 rounded-full ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="text-sm font-medium text-slate-700 mt-0.5">{card.label}</div>
              <div className="text-xs text-slate-400 mt-1">{card.delta}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Metric cards row 2 */}
      <section aria-label="Preboarding outcome metrics">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {row2.map(card => (
            <button
              key={card.key}
              type="button"
              onClick={() => router.push(card.href)}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left hover:border-teal-300 hover:shadow transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <div className={`h-9 w-9 rounded-full ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="text-sm font-medium text-slate-700 mt-0.5">{card.label}</div>
              <div className="text-xs text-slate-400 mt-1">{card.delta}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Preboarding Pipeline stepper */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" aria-label="Preboarding pipeline">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-slate-900">Preboarding Pipeline</h2>
          <span className="text-xs text-slate-400">{metrics?.totalPreboarding ?? 0} candidates in flow</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center overflow-x-auto">
          {pipelineNodes.map((node, idx) => (
            <div key={node.label} className="flex items-center flex-1 min-w-[150px]">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div
                  className={`h-12 w-12 rounded-full ${node.color} text-white flex items-center justify-center text-sm font-bold shadow-sm ring-4 ${node.ring} ring-opacity-20`}
                >
                  {node.count}
                </div>
                <span className="text-xs font-medium text-slate-600 text-center whitespace-nowrap">{node.label}</span>
              </div>
              {idx < pipelineNodes.length - 1 && (
                <div className="flex-1 h-0.5 bg-slate-200 mx-3 mb-6 min-w-[24px]" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 4. Widget grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Preboarding widgets">
        {/* Upcoming Joiners */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiCalendar className="text-teal-600 w-4 h-4" /> Upcoming Joiners
            </h3>
            <button
              onClick={() => router.push('/preboarding/candidates')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto flex-1 space-y-1">
            {upcomingJoiners.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No upcoming joiners scheduled.</p>
            ) : (
              upcomingJoiners.slice(0, 6).map(c => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/preboarding/candidates/${c.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.candidateName}</div>
                    <div className="text-xs text-slate-500 truncate">{c.jobTitle || '—'}</div>
                  </div>
                  <div className="text-xs text-slate-600 whitespace-nowrap ml-3 flex items-center gap-1.5">
                    <FiCalendar className="w-3.5 h-3.5 text-slate-400" />
                    {formatDate(c.joiningDate)}
                    <FiChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Pending Documents */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiFileText className="text-amber-600 w-4 h-4" /> Pending Documents
            </h3>
            <button
              onClick={() => router.push('/preboarding/documents')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto flex-1 space-y-1.5">
            {pendingDocs.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No pending documents — all caught up.</p>
            ) : (
              pendingDocs.slice(0, 8).map((d, idx) => (
                <div key={`${d.candidateId}-${idx}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.candidateName}</div>
                    <div className="text-xs text-slate-500 truncate">{d.documentLabel}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ml-3 ${
                      d.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {d.status === 'rejected' ? 'Rejected' : 'Pending'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Verification Queue */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiEye className="text-violet-600 w-4 h-4" /> Verification Queue
            </h3>
            <button
              onClick={() => router.push('/preboarding/verification')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-6 flex-1 py-2">
            <div className="relative shrink-0">
              <div
                className="h-24 w-24 rounded-full"
                style={{ background: donutSegments.empty ? undefined : donutSegments.gradient }}
                role="img"
                aria-label={`Verification queue: ${verificationSummary.approved} approved, ${verificationSummary.submitted} submitted, ${verificationSummary.rejected} rejected, ${verificationSummary.pending} pending`}
              />
              <div className="absolute inset-3 rounded-full bg-white flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-900">{verificationSummary.total}</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Docs</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm flex-1 min-w-0">
              <li className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-slate-600 truncate">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" /> Approved
                </span>
                <span className="font-semibold text-slate-900">{verificationSummary.approved}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-slate-600 truncate">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500 shrink-0" /> Submitted
                </span>
                <span className="font-semibold text-slate-900">{verificationSummary.submitted}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-slate-600 truncate">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" /> Rejected
                </span>
                <span className="font-semibold text-slate-900">{verificationSummary.rejected}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-slate-600 truncate">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" /> Pending
                </span>
                <span className="font-semibold text-slate-900">{verificationSummary.pending}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Joining Readiness */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiActivity className="text-emerald-600 w-4 h-4" /> Joining Readiness
            </h3>
            <button
              onClick={() => router.push('/preboarding/readiness')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center py-2">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-900">{readinessSummary.avg}%</span>
              <span className="text-xs text-slate-400 mb-1.5">average readiness</span>
            </div>
            <div className="mt-3 h-2.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={readinessSummary.avg} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`h-full rounded-full ${readinessSummary.avg >= 70 ? 'bg-emerald-500' : readinessSummary.avg >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                style={{ width: `${Math.min(100, Math.max(2, readinessSummary.avg))}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <div className="text-lg font-bold text-emerald-700">{readinessSummary.ready}</div>
                <div className="text-xs text-emerald-600">Ready</div>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <div className="text-lg font-bold text-amber-700">{readinessSummary.notReady}</div>
                <div className="text-xs text-amber-600">Not Ready</div>
              </div>
            </div>
          </div>
        </div>

        {/* Department-wise Joiners */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiList className="text-teal-600 w-4 h-4" /> Department-wise Joiners
            </h3>
            <button
              onClick={() => router.push('/preboarding/candidates')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-3 py-1">
            {deptJoiners.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No upcoming joiners by department.</p>
            ) : (
              deptJoiners.map(d => {
                const max = deptJoiners[0]?.count || 1;
                const pct = Math.round((d.count / max) * 100);
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 truncate">{d.name}</span>
                      <span className="text-slate-500 shrink-0 ml-2">{d.count}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Delayed Activities */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
              <FiAlertTriangle className="text-red-500 w-4 h-4" /> Delayed Activities
            </h3>
            <button
              onClick={() => router.push('/preboarding/joining-formalities')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            >
              View All <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto flex-1 space-y-1">
            {delayedActivities.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No delayed activities — everything on schedule.</p>
            ) : (
              delayedActivities.map(c => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/preboarding/candidates/${c.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{c.candidateName}</div>
                    <div className="text-xs text-slate-500 truncate">Joined date: {formatDate(c.joiningDate)}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 whitespace-nowrap ml-3">
                    {c.daysOverdue}d overdue
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 5. Quick Actions bar */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" aria-label="Quick actions">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/offers')}
            className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiUserPlus className="w-4 h-4" /> Initiate Preboarding
          </button>
          <button
            onClick={() => router.push('/preboarding/candidates')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiList className="w-4 h-4" /> View Candidates
          </button>
          <button
            onClick={() => router.push('/preboarding/verification')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiEye className="w-4 h-4" /> Verify Documents
          </button>
          <button
            onClick={() => router.push('/preboarding/candidates?filter=remind')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiBell className="w-4 h-4" /> Send Reminder
          </button>
          <button
            onClick={() => router.push('/preboarding/joining-formalities')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiEdit2 className="w-4 h-4" /> Update Joining Date
          </button>
          <button
            onClick={() => router.push('/preboarding/joining-formalities')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiCheckSquare className="w-4 h-4" /> Mark Joining Confirmed
          </button>
          <button
            onClick={() => router.push('/preboarding/readiness')}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white"
          >
            <FiActivity className="w-4 h-4" /> View Joining Readiness
          </button>
        </div>
      </section>

      {/* 6. Filters row */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" aria-label="Filters">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
          <FiFilter className="text-slate-400 w-4 h-4" /> Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="flt-dept" className="block text-xs font-medium text-slate-500 mb-1">Department</label>
            <select
              id="flt-dept"
              value={fDepartment}
              onChange={e => setFDepartment(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="flt-stage" className="block text-xs font-medium text-slate-500 mb-1">Preboarding Status</label>
            <select
              id="flt-stage"
              value={fStage}
              onChange={e => setFStage(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            >
              <option value="">All Stages</option>
              <option value="initiated">Initiated</option>
              <option value="details_pending">Details Pending</option>
              <option value="verification">Verification</option>
              <option value="ready_to_join">Ready to Join</option>
              <option value="joined">Joined</option>
              <option value="did_not_join">Did Not Join</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label htmlFor="flt-verif" className="block text-xs font-medium text-slate-500 mb-1">Verification Status</label>
            <select
              id="flt-verif"
              value={fVerification}
              onChange={e => setFVerification(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            >
              <option value="">Any Verification</option>
              <option value="Pending">Pending</option>
              <option value="In Review">In Review</option>
              <option value="Verified">Verified</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label htmlFor="flt-date" className="block text-xs font-medium text-slate-500 mb-1">Joining Date Range</label>
            <select
              id="flt-date"
              value={fDateRange}
              onChange={e => setFDateRange(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            >
              <option value="">Any Date</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <label htmlFor="flt-rec" className="block text-xs font-medium text-slate-500 mb-1">Recruiter</label>
            <select
              id="flt-rec"
              value={fRecruiter}
              onChange={e => setFRecruiter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
            >
              <option value="">All Recruiters</option>
              {recruiters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={applyFilters}
            className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiSearch className="w-4 h-4" /> Apply Filters <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
