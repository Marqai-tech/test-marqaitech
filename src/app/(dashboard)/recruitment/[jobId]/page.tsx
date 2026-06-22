'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiArrowLeft, FiBriefcase, FiUsers, FiMapPin, FiClock,
  FiCalendar, FiCheckSquare, FiSquare, FiExternalLink,
  FiRefreshCw, FiStar, FiMail, FiPhone, FiXCircle, FiCheckCircle,
  FiAlertCircle, FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getJobStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'nexus-badge nexus-badge-success',
    closed: 'nexus-badge nexus-badge-error',
    on_hold: 'nexus-badge nexus-badge-warning',
    filled: 'nexus-badge nexus-badge-info',
  };
  const labels: Record<string, string> = { open: 'Open', closed: 'Closed', on_hold: 'On Hold', filled: 'Filled' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getAppStatusBadge(status: string) {
  const map: Record<string, string> = {
    applied: 'nexus-badge nexus-badge-info',
    screening: 'nexus-badge nexus-badge-warning',
    interview: 'bg-orange-50 text-orange-700 nexus-badge',
    offered: 'nexus-badge nexus-badge-purple',
    hired: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
  };
  const labels: Record<string, string> = {
    applied: 'Applied', screening: 'Screening', interview: 'Interview',
    offered: 'Offered', hired: 'Hired', rejected: 'Rejected',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getPostingStatusBadge(status: string) {
  const map: Record<string, { className: string; label: string; icon: React.ReactNode }> = {
    pending: { className: 'bg-amber-50 text-amber-700 nexus-badge', label: 'Pending', icon: <FiClock className="w-3 h-3" /> },
    posted: { className: 'nexus-badge nexus-badge-success', label: 'Posted', icon: <FiCheckCircle className="w-3 h-3" /> },
    closed: { className: 'nexus-badge nexus-badge-info', label: 'Closed', icon: <FiXCircle className="w-3 h-3" /> },
    failed: { className: 'nexus-badge nexus-badge-error', label: 'Failed', icon: <FiAlertCircle className="w-3 h-3" /> },
    expired: { className: 'nexus-badge nexus-badge-warning', label: 'Expired', icon: <FiClock className="w-3 h-3" /> },
  };
  return map[status] || { className: 'nexus-badge nexus-badge-info', label: status, icon: null };
}

const AVAILABLE_BOARDS = [
  { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2' },
  { id: 'indeed', label: 'Indeed', color: '#2164f3' },
  { id: 'glassdoor', label: 'Glassdoor', color: '#0caa41' },
  { id: 'stepstone', label: 'StepStone', color: '#7a1fa2' },
  { id: 'naukri', label: 'Naukri', color: '#ff7555' },
];

interface JobPosting {
  id: string;
  title: string;
  position: string;
  location?: string | null;
  type: string;
  experience?: string | null;
  salary?: string | null;
  description: string;
  requirements?: string | null;
  status: string;
  postedDate: string;
  closingDate?: string | null;
  vacancies: number;
  department?: { id: string; name: string } | null;
  applications?: JobApplication[];
}

interface JobApplication {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  source: string;
  status: string;
  appliedDate: string;
  rating?: number | null;
  expectedSalary?: string | null;
  notes?: string | null;
}

interface BoardPosting {
  id: string;
  jobPostingId: string;
  board: string;
  externalJobId?: string | null;
  status: string;
  externalUrl?: string | null;
  errorMessage?: string | null;
  postedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [jobPosting, setJobPosting] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);

  const [boardPostings, setBoardPostings] = useState<BoardPosting[]>([]);
  const [boardSelection, setBoardSelection] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState(false);
  const [closingAll, setClosingAll] = useState(false);

  const jobId = params?.jobId || '';

  const fetchJob = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/recruitment/${jobId}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to load job');
      }
      const data = await res.json();
      setJobPosting(data.jobPosting || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const fetchBoardPostings = useCallback(async () => {
    try {
      const res = await fetch(`/api/job-board-postings?jobPostingId=${jobId}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setBoardPostings(Array.isArray(data.postings) ? data.postings : []);
    } catch {
      // best-effort
    }
  }, [jobId]);

  useEffect(() => {
    if (jobId) {
      queueMicrotask(() => fetchJob());
      queueMicrotask(() => fetchBoardPostings());
    }
  }, [jobId, fetchJob, fetchBoardPostings]);

  /* Funnel counts for this job */
  const funnelCounts = {
    applied: 0, screening: 0, interview: 0, offered: 0, hired: 0,
  };
  (jobPosting?.applications || []).forEach((a) => {
    const s = a.status as keyof typeof funnelCounts;
    if (s in funnelCounts) funnelCounts[s] += 1;
  });

  /* Multi-post to selected boards */
  const handleMultiPost = async () => {
    const selectedBoards = AVAILABLE_BOARDS.filter((b) => boardSelection[b.id]);
    if (selectedBoards.length === 0) {
      toast.error('Please select at least one board');
      return;
    }
    try {
      setPosting(true);
      const results = await Promise.allSettled(
        selectedBoards.map((b) =>
          fetch('/api/job-board-postings', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ jobPostingId: jobId, board: b.id }),
          })
        )
      );
      let okCount = 0;
      let failCount = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          okCount++;
        } else {
          failCount++;
          // Surface error from response if available
          if (r.status === 'fulfilled') {
            r.value.json().then((d: { error?: string; message?: string }) => {
              if (d?.error || d?.message) {
                toast.error(`${selectedBoards[i].label}: ${d.error || d.message}`);
              }
            }).catch(() => {});
          }
        }
      });
      if (okCount > 0) toast.success(`Posted to ${okCount} board(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`);
      else if (failCount > 0) toast.error(`All ${failCount} posting(s) failed`);
      setBoardSelection({});
      fetchBoardPostings();
    } finally {
      setPosting(false);
    }
  };

  /* Close all open board postings (typically when job is filled) */
  const handleCloseAll = async () => {
    const openPostings = boardPostings.filter((p) => p.status === 'posted' || p.status === 'pending');
    if (openPostings.length === 0) {
      toast('No open board postings to close', { icon: 'ℹ️' });
      return;
    }
    try {
      setClosingAll(true);
      const results = await Promise.allSettled(
        openPostings.map((p) =>
          fetch(`/api/job-board-postings/${p.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          })
        )
      );
      const okCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
      toast.success(`Closed ${okCount} of ${openPostings.length} posting(s)`);
      fetchBoardPostings();
    } finally {
      setClosingAll(false);
    }
  };

  /* Mark job as filled and auto-close all board postings (REQ-SRC-03) */
  const handleMarkFilled = async () => {
    if (!jobPosting) return;
    if (!confirm(`Mark "${jobPosting.title}" as filled? All open board postings will be auto-closed.`)) return;
    try {
      const res = await fetch(`/api/recruitment/${jobId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'filled' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update status');
      }
      const data = await res.json();
      const closed = data.autoClosedBoardPostings ?? 0;
      toast.success(`Job marked as filled${closed > 0 ? ` (auto-closed ${closed} board posting(s))` : ''}`);
      fetchJob();
      fetchBoardPostings();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark filled');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-72 bg-slate-200 rounded animate-pulse" />
        <div className="nexus-card p-6 animate-pulse">
          <div className="h-5 w-48 bg-slate-200 rounded mb-3" />
          <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
        </div>
      </div>
    );
  }

  if (!jobPosting) {
    return (
      <div className="space-y-6">
        <Link href="/recruitment" className="inline-flex items-center gap-2 text-sm text-nexus-text-secondary hover:text-nexus-text-primary">
          <FiArrowLeft className="w-4 h-4" /> Back to Recruitment
        </Link>
        <div className="nexus-card p-12 text-center">
          <FiBriefcase className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
          <p className="text-nexus-text-secondary font-medium">Job posting not found</p>
        </div>
      </div>
    );
  }

  const badge = getJobStatusBadge(jobPosting.status);
  const openPostings = boardPostings.filter((p) => p.status === 'posted' || p.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/recruitment" className="inline-flex items-center gap-2 text-sm text-nexus-text-secondary hover:text-nexus-text-primary mb-2">
            <FiArrowLeft className="w-4 h-4" /> Back to Recruitment
          </Link>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiBriefcase className="w-6 h-6 text-violet-500" />
            {jobPosting.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/recruitment/analytics"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
          >
            Analytics
          </Link>
          {isAdmin && jobPosting.status !== 'filled' && (
            <button
              onClick={handleMarkFilled}
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              <FiCheckCircle className="w-4 h-4" /> Mark as Filled
            </button>
          )}
        </div>
      </div>

      {/* Job info card */}
      <div className="nexus-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <span className={badge.className}>{badge.label}</span>
              {jobPosting.department && (
                <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                  <FiUsers className="w-3.5 h-3.5" />{jobPosting.department.name}
                </span>
              )}
              {jobPosting.location && (
                <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                  <FiMapPin className="w-3.5 h-3.5" />{jobPosting.location}
                </span>
              )}
              <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                <FiClock className="w-3.5 h-3.5" />{jobPosting.type}
              </span>
              <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                <FiUsers className="w-3.5 h-3.5" />{jobPosting.vacancies} Vacanc{jobPosting.vacancies > 1 ? 'ies' : 'y'}
              </span>
              <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                <FiCalendar className="w-3.5 h-3.5" />Posted {formatDate(jobPosting.postedDate)}
              </span>
              {jobPosting.closingDate && (
                <span className="text-sm text-nexus-text-secondary flex items-center gap-1">
                  <FiCalendar className="w-3.5 h-3.5" />Closes {formatDate(jobPosting.closingDate)}
                </span>
              )}
            </div>
            <p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{jobPosting.description}</p>
            {jobPosting.requirements && (
              <div className="mt-3 pt-3 border-t border-nexus-border">
                <h4 className="text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider mb-1">Requirements</h4>
                <p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{jobPosting.requirements}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel for this job */}
        <div className="nexus-card p-5">
          <h2 className="text-base font-semibold text-nexus-text-primary mb-4">Hiring Funnel</h2>
          <div className="space-y-2">
            {[
              { key: 'applied', label: 'Applied', color: 'bg-blue-500' },
              { key: 'screening', label: 'Screening', color: 'bg-amber-500' },
              { key: 'interview', label: 'Interview', color: 'bg-orange-500' },
              { key: 'offered', label: 'Offered', color: 'bg-violet-500' },
              { key: 'hired', label: 'Hired', color: 'bg-emerald-500' },
            ].map((stage, i) => {
              const value = (funnelCounts as Record<string, number>)[stage.key] || 0;
              const maxValue = funnelCounts.applied || 1;
              const pct = Math.max(2, Math.round((value / maxValue) * 100));
              const prevValue = i === 0 ? value : ((funnelCounts as Record<string, number>)[(['applied','screening','interview','offered','hired'] as string[])[i-1]]) || 0;
              const conv = prevValue > 0 ? Math.round((value / prevValue) * 100) : 0;
              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-nexus-text-secondary font-medium">{stage.label}</span>
                    <span className="text-nexus-text-primary font-semibold">
                      {value} {i > 0 && value > 0 && <span className="text-nexus-text-muted ml-1">({conv}%)</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${stage.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-post panel */}
        <div className="nexus-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-nexus-text-primary">Multi-Post to Job Boards</h2>
            <button
              onClick={fetchBoardPostings}
              className="p-1.5 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <FiRefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Existing postings list */}
          {boardPostings.length > 0 && (
            <div className="space-y-2 mb-4">
              {boardPostings.map((p) => {
                const sb = getPostingStatusBadge(p.status);
                const boardMeta = AVAILABLE_BOARDS.find((b) => b.id === p.board) || { label: p.board, color: '#94a3b8' };
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: boardMeta.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-nexus-text-primary">{boardMeta.label}</p>
                        <p className="text-xs text-nexus-text-muted">
                          {p.externalJobId ? `ID: ${p.externalJobId}` : 'No external ID'}
                          {p.errorMessage && <span className="text-red-600 ml-1">— {p.errorMessage}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={sb.className}>{sb.icon}{sb.label}</span>
                      {p.externalUrl && (p.status === 'posted') && (
                        <a
                          href={p.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Open external URL"
                        >
                          <FiExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Board selection */}
          {isAdmin && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {AVAILABLE_BOARDS.map((b) => {
                  const alreadyPosted = boardPostings.some((p) => p.board === b.id);
                  const checked = !!boardSelection[b.id];
                  return (
                    <label
                      key={b.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        alreadyPosted
                          ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                          : checked
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-nexus-border hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={alreadyPosted}
                        checked={checked}
                        onChange={(e) => setBoardSelection((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                        className="w-4 h-4 rounded border-nexus-border text-violet-500 focus:ring-violet-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="text-sm font-medium text-nexus-text-primary">{b.label}</span>
                      {alreadyPosted && <span className="text-xs text-nexus-text-muted ml-auto">Already posted</span>}
                    </label>
                  );
                })}
              </div>

              {/* Post + Close buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-nexus-border">
                <button
                  onClick={handleMultiPost}
                  disabled={posting || Object.values(boardSelection).every((v) => !v)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  {posting ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Posting...</> : <><FiSend className="w-4 h-4" /> Post to Selected Boards</>}
                </button>
                {openPostings.length > 0 && (
                  <button
                    onClick={handleCloseAll}
                    disabled={closingAll}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {closingAll ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Closing...</> : <><FiXCircle className="w-4 h-4" /> Close All Board Postings ({openPostings.length})</>}
                  </button>
                )}
              </div>
              {jobPosting.status === 'filled' && (
                <p className="text-xs text-emerald-600 mt-2">
                  Job is filled. Any open board postings should already have been auto-closed. Use "Close All" to force-close remaining ones.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Candidate list */}
      <div className="nexus-card overflow-hidden">
        <div className="p-5 border-b border-nexus-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-nexus-text-primary">
            Candidates ({Array.isArray(jobPosting.applications) ? jobPosting.applications.length : 0})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Applied</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Expected Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Rating</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(jobPosting.applications) ? jobPosting.applications : []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" />
                    <p className="text-sm text-nexus-text-secondary">No applications yet</p>
                  </td>
                </tr>
              ) : (
                (jobPosting.applications || []).slice().sort((a, b) => new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime()).map((app) => {
                  const appBadge = getAppStatusBadge(app.status);
                  return (
                    <tr key={app.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-nexus-text-primary">{app.candidateName}</p>
                        <p className="text-xs text-nexus-text-muted flex items-center gap-1">
                          <FiMail className="w-3 h-3" />{app.candidateEmail}
                        </p>
                        {app.candidatePhone && (
                          <p className="text-xs text-nexus-text-muted flex items-center gap-1 mt-0.5">
                            <FiPhone className="w-3 h-3" />{app.candidatePhone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{app.source}</td>
                      <td className="px-4 py-3"><span className={appBadge.className}>{appBadge.label}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(app.appliedDate)}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{app.expectedSalary || '—'}</td>
                      <td className="px-4 py-3">
                        {app.rating ? (
                          <span className="flex items-center gap-1 text-amber-500">
                            <FiStar className="w-3.5 h-3.5 fill-amber-500" />
                            <span className="text-sm font-medium">{app.rating}</span>
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
