'use client';

/**
 * Team Leave Calendar — /leave/team-calendar
 *
 * Professional month-grid calendar showing team members on leave per day.
 * Click any day to see full details. High-impact days (≥30% team out)
 * are flagged with a warning.
 *
 * Data source: GET /api/leave/team-calendar?month=YYYY-MM
 */

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiUsers, FiAlertTriangle,
  FiX, FiInfo, FiRefreshCw, FiUser, FiCheck, FiClock, FiTrendingUp,
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
  month: string;
  leaves: LeaveRecord[];
  byDate: Record<string, number[]>;
  team: TeamMember[];
  me?: { id: string; firstName: string; lastName: string } | null;
  message?: string;
}

/* ─── Constants ─── */
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
function colorFor(seed: string) {
  const palette = [
    'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-purple-500',
    'bg-violet-500', 'bg-indigo-500', 'bg-blue-500', 'bg-sky-500',
    'bg-cyan-500', 'bg-teal-500', 'bg-emerald-500', 'bg-green-500',
    'bg-lime-500', 'bg-amber-500', 'bg-orange-500',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (sStr === eStr) return sStr;
  return `${sStr} – ${eStr}`;
}

/* ─── Avatar ─── */
function Avatar({ member, size = 'sm' }: { member: { firstName: string; lastName: string; avatar?: string | null }; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  if (member.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar}
        alt={`${member.firstName} ${member.lastName}`}
        className={`${px} rounded-full object-cover border-2 border-white shadow-sm`}
      />
    );
  }
  return (
    <div
      title={`${member.firstName} ${member.lastName}`}
      className={`${px} rounded-full ${colorFor(member.firstName + member.lastName)} text-white font-bold flex items-center justify-center border-2 border-white shadow-sm`}
    >
      {initials(member.firstName, member.lastName)}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="thb-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-thb-text-primary">{value}</p>
        <p className="text-[11px] text-thb-text-muted leading-tight">{label}</p>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
function TeamLeaveCalendarContent() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: dateKey(year, month, d) });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const selectedDayLeaves = useMemo(() => {
    if (!selectedDay || !data) return [];
    const indices = data.byDate[selectedDay] || [];
    return indices.map(i => data.leaves[i]).filter(Boolean);
  }, [selectedDay, data]);

  const teamSize = data?.teamSize || 0;
  const highImpactThreshold = Math.max(1, Math.floor(teamSize * 0.3));

  // ── Summary stats ──
  const approvedCount = data?.leaves.filter(l => l.status === 'approved').length || 0;
  const pendingCount = data?.leaves.filter(l => l.status === 'pending').length || 0;
  const totalLeaveRecords = data?.leaves.length || 0;

  // ── Days with leave this month ──
  const daysWithLeave = data ? Object.keys(data.byDate).length : 0;

  // ── Unique people on leave ──
  const uniquePeopleOnLeave = useMemo(() => {
    if (!data) return 0;
    const ids = new Set<string>();
    data.leaves.forEach(l => { if (l.employee) ids.add(l.employee.id); });
    return ids.size;
  }, [data]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <FiUsers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Team Leave Calendar</h1>
            <p className="text-sm text-thb-text-secondary">
              See who's on leave before you apply — avoid dates when your team is short-staffed
            </p>
          </div>
        </div>
        <Link
          href="/leave?action=apply"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-sm"
        >
          <FiCalendar className="w-4 h-4" /> Apply Leave
        </Link>
      </div>

      {/* ── Summary Stats ── */}
      {data && data.teamSize > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<FiUsers className="w-5 h-5 text-violet-600" />}
            label="Team Members"
            value={data.teamSize}
            accent="bg-violet-50"
          />
          <StatCard
            icon={<FiCalendar className="w-5 h-5 text-blue-600" />}
            label="Leave Records This Month"
            value={totalLeaveRecords}
            accent="bg-blue-50"
          />
          <StatCard
            icon={<FiCheck className="w-5 h-5 text-emerald-600" />}
            label="Approved Leaves"
            value={approvedCount}
            accent="bg-emerald-50"
          />
          <StatCard
            icon={<FiClock className="w-5 h-5 text-amber-600" />}
            label="Pending Approval"
            value={pendingCount}
            accent="bg-amber-50"
          />
        </div>
      )}

      {/* ── Month Navigation + Controls ── */}
      <div className="thb-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 hover:border-violet-300 transition-all"
            aria-label="Previous month"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-base font-semibold text-thb-text-primary min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </div>
          <button
            onClick={goNextMonth}
            className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 hover:border-violet-300 transition-all"
            aria-label="Next month"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium text-thb-text-secondary border border-thb-border rounded-lg hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all ${includeSelf ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-thb-border text-thb-text-secondary hover:bg-slate-50'}`}>
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={e => setIncludeSelf(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-violet-500 focus:ring-violet-500/20"
            />
            <FiUser className="w-3.5 h-3.5" />
            Show my leaves
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

      {/* ── Info Banner ── */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <FiInfo className="w-4 h-4 text-violet-600" />
        </div>
        <div className="text-sm text-violet-800">
          <p className="font-medium mb-0.5">How to use this calendar</p>
          <p className="text-xs leading-relaxed text-violet-700">
            Each day shows <strong>other team members</strong> who have approved or pending leave. Days marked with{' '}
            <FiAlertTriangle className="w-3 h-3 inline text-rose-500" /> are <strong>high-impact</strong> (≥{highImpactThreshold} team members out) —
            approval chances are lower. Click any day for full details.
          </p>
        </div>
      </div>

      {/* ── Main Layout: Calendar (left, 2/3) + Team Roster (right, 1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── LEFT COLUMN: Calendar Grid + Selected Day Detail ── */}
      <div className="lg:col-span-2 space-y-6">

      {/* ── Calendar Grid ── */}
      <div className="thb-card p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <FiRefreshCw className="w-5 h-5 text-thb-text-muted animate-spin mr-2" />
            <span className="text-sm text-thb-text-muted">Loading team calendar…</span>
          </div>
        ) : !data || data.teamSize === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <FiUsers className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-thb-text-primary">{data?.message || 'No team members found'}</p>
            <p className="text-xs text-thb-text-secondary mt-1">
              You may not be assigned to a department yet — ask your HR admin.
            </p>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-thb-text-secondary pb-3 border-b border-thb-border">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                Approved leave
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                Pending leave
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
                High-impact day
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-violet-600" />
                Today
              </span>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {WEEKDAY_LABELS.map(w => (
                <div key={w} className="text-center text-[11px] font-bold uppercase tracking-wider text-thb-text-muted py-2">
                  {w}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="min-h-[100px] rounded-lg bg-slate-50/40" />;
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
                const hasApproved = dayLeaves.some(l => l.status === 'approved');
                const hasPending = dayLeaves.some(l => l.status === 'pending');

                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelectedDay(cell.key)}
                    className={`min-h-[100px] p-2 rounded-lg border text-left transition-all flex flex-col gap-1 group ${
                      isSelected
                        ? 'border-violet-500 ring-2 ring-violet-500/20 bg-violet-50'
                        : isHighImpact
                          ? 'border-rose-300 bg-rose-50/40 hover:border-rose-400 hover:shadow-sm'
                          : hasApproved
                            ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm'
                            : hasPending
                              ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:shadow-sm'
                              : isWeekend
                                ? 'border-thb-border bg-slate-50/30 hover:bg-slate-50'
                                : 'border-thb-border bg-white hover:border-violet-200 hover:bg-violet-50/20 hover:shadow-sm'
                    }`}
                  >
                    {/* Day number + indicators */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full ${
                        isToday
                          ? 'bg-violet-600 text-white'
                          : isWeekend
                            ? 'text-thb-text-muted'
                            : 'text-thb-text-primary'
                      }`}>
                        {cell.day}
                      </span>
                      {isHighImpact && (
                        <span title={`${uniquePeople.size} team members on leave — high impact`} className="flex items-center gap-0.5">
                          <FiAlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        </span>
                      )}
                    </div>

                    {/* Status dots + count */}
                    {dayLeaves.length > 0 && (
                      <div className="mt-auto space-y-1">
                        <div className="flex items-center gap-1">
                          <div className="flex flex-wrap gap-0.5">
                            {dayLeaves.slice(0, 5).map(lv => (
                              <span
                                key={lv.id}
                                className={`w-2 h-2 rounded-full ${lv.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                title={`${lv.employee.firstName} ${lv.employee.lastName} — ${lv.leaveType.name} (${lv.status})`}
                              />
                            ))}
                          </div>
                          {uniquePeople.size > 5 && (
                            <span className="text-[9px] text-thb-text-muted font-medium">+{uniquePeople.size - 5}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold ${isHighImpact ? 'text-rose-600' : 'text-thb-text-secondary'}`}>
                            {uniquePeople.size}
                          </span>
                          <span className="text-[9px] text-thb-text-muted">on leave</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Selected Day Detail Panel ── */}
      {selectedDay && data && (
        <div className="thb-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-thb-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <FiCalendar className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-thb-text-primary">
                  {new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <p className="text-xs text-thb-text-secondary mt-0.5">
                  {selectedDayLeaves.length === 0
                    ? 'No team members on leave this day'
                    : `${selectedDayLeaves.length} leave record(s) covering this day`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="p-1.5 rounded-lg text-thb-text-muted hover:bg-slate-50 transition-colors"
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
                    <p className="font-semibold">High-impact day — {uniquePeople.size} of {teamSize} team members are on leave</p>
                    <p className="mt-0.5">Approval chances for new leave on this date are lower. Consider applying for a different date.</p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {selectedDayLeaves.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <FiCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-thb-text-primary">All clear — no team members on leave</p>
              <p className="text-xs text-thb-text-muted mt-1">This is a good day to apply for leave.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {selectedDayLeaves.map(lv => {
                const isMe = data.me && lv.employee.id === data.me.id;
                return (
                  <li key={lv.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isMe ? 'border-violet-200 bg-violet-50/50' : 'border-thb-border hover:bg-slate-50'}`}>
                    <Avatar member={lv.employee} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-thb-text-primary">
                        {lv.employee.firstName} {lv.employee.lastName}
                        {isMe && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">YOU</span>
                        )}
                        {lv.employee.employeeId && (
                          <span className="ml-2 text-xs text-thb-text-muted">({lv.employee.employeeId})</span>
                        )}
                      </p>
                      <p className="text-xs text-thb-text-secondary mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{lv.leaveType.name}</span>
                        <span className="text-thb-text-muted">·</span>
                        <span>{formatRange(lv.startDate, lv.endDate)}</span>
                        {lv.halfDay && (
                          <>
                            <span className="text-thb-text-muted">·</span>
                            <span className="italic">Half day ({lv.halfDaySlot?.replace('_', ' ') || 'slot'})</span>
                          </>
                        )}
                        {lv.reason && (
                          <>
                            <span className="text-thb-text-muted">·</span>
                            <span className="text-thb-text-muted truncate">{lv.reason}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border flex-shrink-0 ${
                      lv.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {lv.status === 'approved' ? 'Approved' : 'Pending'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      </div>{/* ── END LEFT COLUMN ── */}

      {/* ── RIGHT COLUMN: Team Roster ── */}
      <div className="lg:col-span-1">

      {/* ── Team Roster ── */}
      {data && data.teamSize > 0 ? (
        <div className="thb-card p-5 sticky top-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2">
              <FiUsers className="w-4 h-4 text-violet-500" />
              Your Team ({data.teamSize})
            </h3>
            <span className="text-xs text-thb-text-muted">
              {uniquePeopleOnLeave} {uniquePeopleOnLeave === 1 ? 'person' : 'people'} on leave this month
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {data.team.map(m => {
              const personLeaves = data.leaves.filter(lv => lv.employee.id === m.id);
              const personLeaveCount = personLeaves.length;
              const hasPending = personLeaves.some(l => l.status === 'pending');
              const isMe = data.me && m.id === data.me.id;
              return (
                <div key={m.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${isMe ? 'border-violet-200 bg-violet-50/30' : 'border-thb-border bg-white hover:bg-slate-50'}`}>
                  <Avatar member={m} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-thb-text-primary truncate">
                      {m.firstName} {m.lastName}
                      {isMe && <span className="ml-1 text-violet-600 font-semibold">(you)</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {personLeaveCount === 0 ? (
                        <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                          <FiCheck className="w-2.5 h-2.5" /> No leave
                        </span>
                      ) : (
                        <span className="text-[10px] text-thb-text-muted">
                          {personLeaveCount} leave{personLeaveCount > 1 ? 's' : ''} this month
                          {hasPending && <span className="ml-1 text-amber-600">· pending</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="thb-card p-5 text-center">
          <FiUsers className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
          <p className="text-xs text-thb-text-muted">No team members found</p>
        </div>
      )}

      </div>{/* ── END RIGHT COLUMN ── */}

      </div>{/* ── END MAIN LAYOUT GRID ── */}

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
