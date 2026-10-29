'use client';

/**
 * Team Leave Calendar — /leave/team-calendar
 *
 * Shows a month grid with one row per day. For each day, shows the avatars
 * (or initials) of team members who have approved or pending leave that day.
 *
 * Purpose: when an employee is about to apply for leave, they can see who is
 * already out on any given day. If multiple team members are already on
 * leave on the picked date, a hint banner shows: "Approval chances are
 * lower — consider applying for a different date."
 *
 * Clicking a day opens a detail panel listing every leave that covers it.
 *
 * Data source: GET /api/leave/team-calendar?month=YYYY-MM
 */

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiUsers, FiAlertTriangle,
  FiX, FiInfo, FiRefreshCw, FiUser,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ─── Types ─── */
interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  avatar?: string | null;
}
interface LeaveRecord {
  id: string;
  status: 'approved' | 'pending';
  startDate: string;
  endDate: string;
  halfDay: boolean;
  halfDaySlot?: string | null;
  reason?: string | null;
  leaveType: { id: string; name: string; code: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId?: string;
    avatar?: string | null;
  };
}
interface CalendarResponse {
  teamSize: number;
  month: string; // YYYY-MM
  leaves: LeaveRecord[];
  byDate: Record<string, number[]>; // YYYY-MM-DD → indices into leaves
  team: TeamMember[];
  me?: { id: string; firstName: string; lastName: string } | null;
  message?: string;
}

/* ─── Helpers ─── */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function initials(first: string, last: string) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';
}

// Stable colour from a string — for avatar backgrounds
function colorFor(seed: string) {
  const palette = [
    'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-purple-500',
    'bg-violet-500', 'bg-indigo-500', 'bg-blue-500', 'bg-sky-500',
    'bg-cyan-500', 'bg-teal-500', 'bg-emerald-500', 'bg-green-500',
    'bg-lime-500', 'bg-yellow-500', 'bg-amber-500', 'bg-orange-500',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function leaveBadgeColor(status: string) {
  return status === 'approved'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-amber-100 text-amber-700 border-amber-200';
}

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (sStr === eStr) return sStr;
  return `${sStr} – ${eStr}`;
}

/* ─── Avatar component ─── */
function Avatar({ member, size = 'sm' }: { member: { firstName: string; lastName: string; avatar?: string | null }; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  if (member.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar}
        alt={`${member.firstName} ${member.lastName}`}
        className={`${px} rounded-full object-cover border border-white shadow-sm`}
      />
    );
  }
  return (
    <div
      title={`${member.firstName} ${member.lastName}`}
      className={`${px} rounded-full ${colorFor(member.firstName + member.lastName)} text-white font-bold flex items-center justify-center border border-white shadow-sm`}
    >
      {initials(member.firstName, member.lastName)}
    </div>
  );
}

/* ─── Main component ─── */
function TeamLeaveCalendarContent() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);

  // Default to current month
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
  // Default: hide the user's own leaves — calendar shows OTHER team members
  // only. Toggle on to also include self.
  const [includeSelf, setIncludeSelf] = useState(false);

  const monthStr = `${year}-${pad(month + 1)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const url = `/api/leave/team-calendar?month=${monthStr}&includeSelf=${includeSelf ? 'true' : 'false'}${sq ? `&${sq}` : ''}`;
      const r = await fetch(url, { headers: getAuthHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${r.status})`);
      }
      const d: CalendarResponse = await r.json();
      setData(d);
    } catch (e) {
      console.error('Team calendar fetch error:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to load team calendar');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [monthStr, includeSelf, scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goPrevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const goNextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDay(null);
  };

  // Build the calendar grid. Calculate the first weekday of the month + total days.
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: dateKey(year, month, d) });
    }
    // Pad to a multiple of 7
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // Leaves covering the selected day
  const selectedDayLeaves = useMemo(() => {
    if (!selectedDay || !data) return [];
    const indices = data.byDate[selectedDay] || [];
    return indices.map(i => data.leaves[i]).filter(Boolean);
  }, [selectedDay, data]);

  // 30% threshold — if a day has >= 30% of the team on leave, show a "high impact" badge
  const teamSize = data?.teamSize || 0;
  const highImpactThreshold = Math.max(1, Math.floor(teamSize * 0.3));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <FiUsers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Team Leave Calendar</h1>
            <p className="text-sm text-thb-text-secondary">
              See who's on leave before you apply — avoid dates when your team is already short-staffed.
            </p>
          </div>
        </div>
        <Link
          href="/leave?action=apply"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
        >
          Apply Leave
        </Link>
      </div>

      {/* Month navigation */}
      <div className="thb-card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors"
            aria-label="Previous month"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-base font-semibold text-thb-text-primary min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </div>
          <button
            onClick={goNextMonth}
            className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors"
            aria-label="Next month"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium text-thb-text-secondary border border-thb-border rounded-lg hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
          {/* Show/Hide my own leaves — by default OFF so the calendar
              shows OTHER team members only (the user already knows their
              own leaves). */}
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${includeSelf ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-thb-border text-thb-text-secondary hover:bg-slate-50'}`}>
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={e => setIncludeSelf(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-violet-500 focus:ring-violet-500/20"
            />
            <FiUser className="w-3.5 h-3.5" />
            Show my leaves too
          </label>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-thb-text-secondary border border-thb-border rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 flex items-start gap-3">
        <FiInfo className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-violet-800">
          <p className="font-medium mb-1">How to use this calendar</p>
          <p className="text-xs leading-relaxed">
            Shows <strong>other team members</strong> who have approved or pending leave on each date — your own leaves are hidden by default (toggle "Show my leaves too" above to include them).
            Days with <span className="font-semibold">3+ team members out (or 30%+ of your team)</span> are marked as
            "high impact" — approval chances for new leave on those dates are lower. Click any day to see full details.
          </p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="thb-card p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-thb-text-muted">
            <FiRefreshCw className="w-4 h-4 animate-spin mr-2" />
            Loading team calendar…
          </div>
        ) : !data || data.teamSize === 0 ? (
          <div className="py-16 text-center">
            <FiUsers className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-thb-text-primary">{data?.message || 'No team members found.'}</p>
            <p className="text-xs text-thb-text-secondary mt-1">
              You may not be assigned to a department yet — ask your HR admin.
            </p>
          </div>
        ) : (
          <>
            {/* Team summary */}
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-thb-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <FiUsers className="w-3.5 h-3.5" />
                <strong className="text-thb-text-primary">{data.teamSize}</strong> team members
              </span>
              <span className="text-thb-text-muted">·</span>
              <span>
                <strong className="text-thb-text-primary">{data.leaves.length}</strong> leave record(s) this month
              </span>
              <span className="text-thb-text-muted">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> approved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> pending
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> high impact (≥{highImpactThreshold} out)
              </span>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map(w => (
                <div key={w} className="text-center text-[10px] font-bold uppercase tracking-wide text-thb-text-muted py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="min-h-[96px] rounded-lg bg-slate-50/50" />;
                }
                const indices = data.byDate[cell.key] || [];
                const dayLeaves = indices.map(i => data.leaves[i]).filter(Boolean);
                const uniquePeople = new Map<string, typeof dayLeaves[number]['employee']>();
                for (const lv of dayLeaves) {
                  if (lv.employee) uniquePeople.set(lv.employee.id, lv.employee);
                }
                const isToday = cell.key === todayKey;
                const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                const isHighImpact = uniquePeople.size >= highImpactThreshold;
                const isSelected = cell.key === selectedDay;

                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelectedDay(cell.key)}
                    className={`min-h-[96px] p-1.5 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                      isSelected
                        ? 'border-violet-500 ring-2 ring-violet-500/20 bg-violet-50'
                        : isHighImpact
                          ? 'border-rose-300 bg-rose-50/50 hover:border-rose-400'
                          : isWeekend
                            ? 'border-thb-border bg-slate-50/30 hover:bg-slate-50'
                            : 'border-thb-border bg-white hover:border-violet-300 hover:bg-violet-50/30'
                    }`}
                  >
                    {/* Day number + indicators */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isToday ? 'bg-violet-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : isWeekend ? 'text-thb-text-muted' : 'text-thb-text-primary'}`}>
                        {cell.day}
                      </span>
                      {isHighImpact && (
                        <span title={`${uniquePeople.size} team members on leave — high impact`}>
                          <FiAlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        </span>
                      )}
                    </div>

                    {/* Avatars (max 3, "+N" for the rest) */}
                    {dayLeaves.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-auto">
                        {Array.from(uniquePeople.values()).slice(0, 3).map(emp => (
                          <Avatar key={emp.id} member={emp} size="sm" />
                        ))}
                        {uniquePeople.size > 3 && (
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center border border-white">
                            +{uniquePeople.size - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status dots row */}
                    {dayLeaves.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {dayLeaves.slice(0, 4).map(lv => (
                          <span
                            key={lv.id}
                            className={`w-1.5 h-1.5 rounded-full ${lv.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            title={`${lv.employee.firstName} ${lv.employee.lastName} — ${lv.leaveType.name} (${lv.status})`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Selected day detail panel */}
      {selectedDay && data && (
        <div className="thb-card p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-thb-border">
            <div>
              <h2 className="text-base font-semibold text-thb-text-primary">
                {new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h2>
              <p className="text-xs text-thb-text-secondary mt-0.5">
                {selectedDayLeaves.length === 0
                  ? 'No team members on leave this day.'
                  : `${selectedDayLeaves.length} leave record(s) covering this day.`}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1.5 rounded-lg text-thb-text-muted hover:bg-slate-50"
              aria-label="Close detail panel"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          {/* High-impact warning */}
          {(() => {
            const uniquePeople = new Map<string, typeof selectedDayLeaves[number]['employee']>();
            for (const lv of selectedDayLeaves) {
              if (lv.employee) uniquePeople.set(lv.employee.id, lv.employee);
            }
            if (uniquePeople.size >= highImpactThreshold && uniquePeople.size > 0) {
              return (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2">
                  <FiAlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-700">
                    <p className="font-semibold">High-impact day — {uniquePeople.size} of {teamSize} team members are on leave.</p>
                    <p className="mt-0.5">Approval chances for new leave on this date are lower. Consider applying for a different date, or check with your manager first.</p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {selectedDayLeaves.length === 0 ? (
            <p className="text-sm text-thb-text-muted text-center py-6">
              <FiCalendar className="w-6 h-6 mx-auto mb-2 text-thb-text-muted" />
              This day is clear — no team members are on leave.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedDayLeaves.map(lv => (
                <li key={lv.id} className="flex items-center gap-3 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                  <Avatar member={lv.employee} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-thb-text-primary">
                      {lv.employee.firstName} {lv.employee.lastName}
                      {lv.employee.employeeId && (
                        <span className="ml-2 text-xs text-thb-text-muted">({lv.employee.employeeId})</span>
                      )}
                      {data.me && lv.employee.id === data.me.id && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">You</span>
                      )}
                    </p>
                    <p className="text-xs text-thb-text-secondary mt-0.5">
                      {lv.leaveType.name} ({lv.leaveType.code}) · {formatRange(lv.startDate, lv.endDate)}
                      {lv.halfDay && ` · Half day (${lv.halfDaySlot?.replace('_', ' ') || 'slot'})`}
                      {lv.reason ? ` · ${lv.reason}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full border ${leaveBadgeColor(lv.status)}`}>
                    {lv.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Team roster */}
      {data && data.teamSize > 0 && (
        <div className="thb-card p-5">
          <h3 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2">
            <FiUser className="w-4 h-4 text-violet-500" />
            Your team ({data.teamSize})
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.team.map(m => {
              // Count this person's leaves in the current month
              const personLeaveCount = data.leaves.filter(lv => lv.employee.id === m.id).length;
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-thb-border bg-white">
                  <Avatar member={m} size="sm" />
                  <div className="text-xs">
                    <p className="font-medium text-thb-text-primary">
                      {m.firstName} {m.lastName}
                      {data.me && m.id === data.me.id && (
                        <span className="ml-1 text-violet-600">(you)</span>
                      )}
                    </p>
                    <p className="text-thb-text-muted">
                      {personLeaveCount === 0 ? 'No leave this month' : `${personLeaveCount} leave record${personLeaveCount > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamLeaveCalendarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Team Leave Calendar…</div>}>
      <TeamLeaveCalendarContent />
    </Suspense>
  );
}
