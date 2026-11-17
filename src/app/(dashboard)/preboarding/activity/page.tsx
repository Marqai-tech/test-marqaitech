'use client';

/* ─────────────────────────────────────────────────────────────────────────────
 * Preboarding Activity & History (BRD screen 8)
 * Complete audit trail of preboarding activities as a timeline.
 * API: GET /api/preboarding/brd/activity?candidateEmail=&action=&limit=
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  FiRefreshCw,
  FiSearch,
  FiAlertTriangle,
  FiActivity,
  FiArrowDown,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface ActivityEntry {
  id: string;
  action: string;
  module: string;
  details: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface ActivityResponse {
  activities: ActivityEntry[];
  count: number;
}

type ActivityGroup = 'documents' | 'preboarding' | 'joining' | 'employee' | 'other';

interface GroupMeta {
  label: string;
  dot: string;
  chip: string;
}

/* ── Constants ── */
const LIMIT_TIERS = [50, 100, 250, 500];

const GROUPS: { value: string; label: string }[] = [
  { value: '', label: 'All Activity' },
  { value: 'PREBOARDING_', label: 'Preboarding' },
  { value: 'DOCUMENT_', label: 'Documents' },
  { value: 'JOINING_', label: 'Joining' },
  { value: 'CREATE_EMPLOYEE_', label: 'Employee Creation' },
];

const GROUP_META: Record<ActivityGroup, GroupMeta> = {
  documents: { label: 'Documents', dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700' },
  preboarding: { label: 'Preboarding', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700' },
  joining: { label: 'Joining', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
  employee: { label: 'Employee Creation', dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-600' },
  other: { label: 'Other', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600' },
};

/* ── Helpers ── */
function groupOf(action: string): ActivityGroup {
  if (action.startsWith('DOCUMENT_')) return 'documents';
  if (action.startsWith('PREBOARDING_')) return 'preboarding';
  if (action.startsWith('JOINING_')) return 'joining';
  if (action.startsWith('CREATE_EMPLOYEE_')) return 'employee';
  return 'other';
}

function fmtAbsolute(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return format(dt, 'dd MMM yyyy, HH:mm');
}

function fmtRelative(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  try {
    return formatDistanceToNow(dt, { addSuffix: true });
  } catch {
    return '';
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * Page component
 * ══════════════════════════════════════════════════════════════════════════ */
export default function PreboardingActivityPage() {
  const [group, setGroup] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [fetchLimit, setFetchLimit] = useState<number>(50);
  const [search, setSearch] = useState('');

  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  /* ── Fetch (contract 7 — no candidateEmail = all candidates) ── */
  const load = useCallback(async (isLoadMore = false, limitOverride?: number) => {
    const lim = limitOverride ?? fetchLimit;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);
    if (!isLoadMore) setError(null);
    try {
      const params = new URLSearchParams();
      if (group) params.set('action', group);
      params.set('limit', String(lim));
      const res = await fetch(`/api/preboarding/brd/activity?${params.toString()}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load activity');
      const data = json as ActivityResponse;
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setCount(data.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
      if (!isLoadMore) setActivities([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [group, fetchLimit]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- kick off audit trail load
  useEffect(() => { load(); }, [load]);

  const handleGroupChange = (v: string) => {
    setGroup(v);
    setFetchLimit(limit);
  };

  const handleLimitChange = (v: number) => {
    setLimit(v);
    setFetchLimit(v);
  };

  const hasMore = count === fetchLimit && fetchLimit < LIMIT_TIERS[LIMIT_TIERS.length - 1];
  const loadMore = () => {
    const idx = LIMIT_TIERS.indexOf(fetchLimit);
    const next = idx >= 0 && idx < LIMIT_TIERS.length - 1 ? LIMIT_TIERS[idx + 1] : LIMIT_TIERS[LIMIT_TIERS.length - 1];
    setFetchLimit(next);
    load(false, next);
  };

  /* ── Client-side filter on details/action ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((a) =>
      (a.details || '').toLowerCase().includes(q) || (a.action || '').toLowerCase().includes(q));
  }, [activities, search]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Preboarding Activity &amp; History</h1>
          <p className="text-sm text-slate-500 mt-0.5">Complete audit trail of preboarding activities</p>
        </div>
        <button
          onClick={() => load()}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
        >
          <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label htmlFor="activity-search" className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Search</label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="activity-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by details or action code…"
                className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="activity-group" className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Action Group</label>
            <select
              id="activity-group"
              value={group}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              {GROUPS.map((g) => <option key={g.value || 'all'} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="activity-limit" className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Limit</label>
            <select
              id="activity-limit"
              value={limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              {[50, 100, 250].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="h-3 w-3 rounded-full bg-slate-200 animate-pulse shrink-0 mt-2" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiAlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Failed to load activity</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <button
            onClick={() => load()}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiRefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiActivity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">
            {search ? 'No activities match your search' : 'No activity recorded yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {search ? 'Try a different keyword or clear the search filter.' : 'Preboarding actions will appear here as they happen.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-4 border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg text-sm font-medium"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* ── Timeline ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Audit Timeline</h3>
            <span className="text-xs text-slate-400">
              {filtered.length} of {count} entr{count === 1 ? 'y' : 'ies'}
            </span>
          </div>

          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" aria-hidden />
            <ol className="space-y-4">
              {filtered.map((a) => {
                const g = groupOf(a.action);
                const meta = GROUP_META[g];
                return (
                  <li key={a.id} className="relative pl-10">
                    {/* dot */}
                    <span className={`absolute left-2 top-2.5 h-3 w-3 rounded-full ring-4 ring-white ${meta.dot}`} aria-hidden />
                    <div className="bg-slate-50 hover:bg-slate-100/70 transition-colors rounded-lg border border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium font-mono ${meta.chip}`}>{a.action}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-500">{meta.label}</span>
                        <span className="ml-auto text-xs text-slate-400 text-right">
                          {fmtAbsolute(a.createdAt)}
                          {fmtRelative(a.createdAt) && <span className="ml-1.5 text-slate-400">· {fmtRelative(a.createdAt)}</span>}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700 break-words">{a.details || '—'}</p>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {a.userName || a.userEmail ? (
                          <>by <span className="font-medium text-slate-500">{a.userName || '—'}</span>{a.userEmail ? <span> · {a.userEmail}</span> : null}</>
                        ) : (
                          'by System'
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* ── Load more ── */}
          {hasMore && (
            <div className="mt-5 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              >
                <FiArrowDown className={`h-4 w-4 ${loadingMore ? 'animate-bounce' : ''}`} />
                {loadingMore ? 'Loading…' : `Load more (next ${LIMIT_TIERS[Math.min(LIMIT_TIERS.indexOf(fetchLimit) + 1, LIMIT_TIERS.length - 1)] - fetchLimit} entries)`}
              </button>
              {search && (
                <p className="mt-2 text-xs text-slate-400">
                  Note: the load-more count applies before search filtering.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
