'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiAlertCircle, FiCheck, FiInfo, FiUsers,
} from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TeamLeave {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
  halfDay?: boolean;
  halfDaySlot?: string;
  leaveType?: { id: string; name: string; code: string; calendarColor?: string };
  employee?: { id: string; firstName?: string; lastName?: string; avatar?: string | null };
}

interface Holiday { id: string; name: string; date: string; type: string; }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isoDay(d: Date): string { return d.toISOString().split('T')[0]; }
function dayKey(d: string | Date): string { return new Date(d).toISOString().split('T')[0]; }

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function TeamLeaveSidebar({
  startDate,
  endDate,
  scopeQuery,
  employeeId,
  onDateSelect,
}: {
  startDate: string;
  endDate: string;
  scopeQuery?: string;
  employeeId?: string;
  onDateSelect?: (date: string) => void;
}) {
  const [teamLeaves, setTeamLeaves] = useState<TeamLeave[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  const sq = scopeQuery || '';

  const fetchTeamLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}`;
      const url = `/api/leave/team-calendar?month=${monthStr}&includeSelf=true${sq ? `&${sq}` : ''}`;
      const r = await fetch(url, { headers: getAuthHeaders() });
      if (r.ok) {
        const d = await r.json();
        setTeamLeaves(d.leaveRequests || d.leaves || []);
      } else {
        setTeamLeaves([]);
      }
    } catch {
      setTeamLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [calMonth, sq]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const r = await fetch(`/api/holidays?limit=100${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
        if (r.ok) {
          const d = await r.json();
          const list = Array.isArray(d) ? d : (d.holidays || d.data || []);
          setHolidays(list.map((h: any) => ({ id: h.id, name: h.name, date: dayKey(h.date), type: h.type })));
        }
      } catch { /* ignore */ }
    };
    fetchHolidays();
  }, [sq]);

  useEffect(() => { fetchTeamLeaves(); }, [fetchTeamLeaves]);

  const leavesByDate = useMemo(() => {
    const map = new Map<string, TeamLeave[]>();
    for (const l of teamLeaves) {
      if (l.status === 'cancelled' || l.status === 'rejected') continue;
      const s = new Date(l.startDate);
      const e = new Date(l.endDate);
      const cursor = new Date(s);
      let guard = 0;
      while (cursor <= e && guard < 400) {
        guard++;
        const dk = isoDay(cursor);
        const arr = map.get(dk) || [];
        arr.push(l);
        map.set(dk, arr);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [teamLeaves]);

  const holidayByDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    holidays.forEach(h => m.set(h.date, h));
    return m;
  }, [holidays]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calMonth.year, calMonth.month, 1);
    const lastDay = new Date(calMonth.year, calMonth.month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d });
    }
    return cells;
  }, [calMonth]);

  const isInRange = useCallback((date: string) => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  }, [startDate, endDate]);

  // Team members on leave during the selected range (ONLY for FUTURE dates —
  // no conflict warning for past dates)
  const todayStr = isoDay(new Date());
  const isFutureRange = startDate && startDate >= todayStr;

  const teamOnLeaveDuringRange = useMemo(() => {
    if (!startDate || !endDate || !isFutureRange) return [];
    const s = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    return teamLeaves.filter(l => {
      if (l.status === 'cancelled' || l.status === 'rejected') return false;
      const lStart = new Date(`${dayKey(l.startDate)}T00:00:00`);
      const lEnd = new Date(`${dayKey(l.endDate)}T00:00:00`);
      return lStart <= e && lEnd >= s;
    });
  }, [startDate, endDate, teamLeaves, isFutureRange]);

  const prevMonth = () => setCalMonth(prev => { const d = new Date(prev.year, prev.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const nextMonth = () => setCalMonth(prev => { const d = new Date(prev.year, prev.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

  const otherCount = teamOnLeaveDuringRange.filter(l => l.employee?.id !== employeeId).length;
  const hasConflict = otherCount > 0;
  const allOnLeave = teamLeaves.filter(l => l.status !== 'cancelled' && l.status !== 'rejected');

  return (
    <div className="space-y-4">
      {/* Mini Calendar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <FiCalendar className="w-4 h-4 text-green-600" /> Team Leave Calendar
            </h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" aria-label="Previous month">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-slate-700 min-w-[100px] text-center">
                {MONTH_NAMES[calMonth.month]} {calMonth.year}
              </span>
              <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" aria-label="Next month">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <FiInfo className="w-3 h-3" /> Click a date to set your From/To dates
          </p>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, i) => {
              if (!cell.date) return <div key={i} className="aspect-square" aria-hidden="true" />;
              const dayLeaves = leavesByDate.get(cell.date) || [];
              const hasApproved = dayLeaves.some(l => l.status === 'approved');
              const hasPending = dayLeaves.some(l => l.status === 'pending');
              const inRange = isInRange(cell.date);
              const isSelected = selectedCalDate === cell.date;
              const dateObj = new Date(`${cell.date}T00:00:00`);
              const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
              const isHoliday = holidayByDate.has(cell.date);
              const isToday = cell.date === todayStr;

              const classes: string[] = ['aspect-square rounded-md text-xs flex flex-col items-center justify-center relative cursor-pointer transition-all hover:ring-2 hover:ring-green-400/30'];
              if (hasApproved) classes.push('bg-red-100 ring-1 ring-red-300 text-red-900');
              else if (hasPending) classes.push('bg-amber-100 ring-1 ring-amber-300 text-amber-900');
              else if (inRange) classes.push('bg-green-100 ring-1 ring-green-300 text-green-900');
              else if (isHoliday) classes.push('bg-teal-50 text-teal-700');
              else if (isWeekend) classes.push('bg-slate-50 text-slate-400');
              else classes.push('bg-white text-slate-700 hover:bg-slate-50');
              if (isSelected) classes.push('ring-2 ring-green-500');

              const tooltip = dayLeaves.length > 0
                ? dayLeaves.map(l => `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim() + ` — ${l.leaveType?.name || 'Leave'} (${l.status})`).join(', ')
                : isHoliday ? `Holiday: ${holidayByDate.get(cell.date)?.name || ''}` : '';

              return (
                <button key={i} type="button" title={tooltip} onClick={() => { setSelectedCalDate(cell.date!); if (onDateSelect) onDateSelect(cell.date!); }} className={classes.join(' ')}>
                  <span className={`font-medium ${isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>{cell.day}</span>
                  {dayLeaves.length > 0 && (
                    <span className="absolute bottom-0.5 flex gap-0.5">
                      {dayLeaves.slice(0, 3).map((l, idx) => (
                        <span key={idx} className={`w-1 h-1 rounded-full ${l.status === 'approved' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" /><span>Approved</span></div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" /><span>Pending</span></div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 ring-1 ring-green-300" /><span>Selected</span></div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal-50 ring-1 ring-teal-200" /><span>Holiday</span></div>
          </div>
        </div>
      </div>

      {/* Team on leave this month — ALWAYS show */}
      {!loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center gap-1.5">
            <FiUsers className="w-3.5 h-3.5 text-slate-600" />
            <h4 className="text-xs font-semibold text-slate-700">
              {allOnLeave.length} team member(s) on leave this month
            </h4>
          </div>
          {allOnLeave.length > 0 ? (
            <ul className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {allOnLeave.map((l, i) => {
                const name = l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown';
                const lvStart = dayKey(l.startDate);
                const lvEnd = dayKey(l.endDate);
                const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const dateRange = lvStart === lvEnd ? fmt(lvStart) : `${fmt(lvStart)} – ${fmt(lvEnd)}`;
                const isApproved = l.status === 'approved';
                const isMe = employeeId && l.employee?.id === employeeId;
                return (
                  <li key={`${l.id || ''}-${i}`} className="flex items-center gap-2 p-2 hover:bg-slate-50">
                    <div className={`w-6 h-6 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                      {getInitials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {name}
                        {isMe && <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">YOU</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {l.leaveType?.name || 'Leave'} · {dateRange}
                        {l.halfDay && <span className="italic"> (half day)</span>}
                      </p>
                    </div>
                    <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${isApproved ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isApproved ? 'APPROVED' : 'PENDING'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-slate-400">No team members on leave this month.</p>
            </div>
          )}
        </div>
      )}

      {/* Conflict warning — ONLY for future dates (not past) */}
      {startDate && endDate && isFutureRange && !loading && (
        <div className={`p-3 rounded-xl border shadow-sm ${hasConflict ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          {hasConflict ? (
            <div className="mb-2">
              <p className="text-xs font-semibold text-amber-800 flex items-start gap-1.5">
                <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Team Conflict — {otherCount} teammate(s) on leave during your selected dates</span>
              </p>
              <p className="text-xs text-amber-900 font-semibold pl-5 mt-0.5">→ Approval chances are lower. Consider applying for a different date.</p>
            </div>
          ) : (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5 mb-2">
              <FiCheck className="w-3.5 h-3.5" /> No team conflicts — approval chances are normal.
            </p>
          )}
          {teamOnLeaveDuringRange.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-slate-500 mb-1.5 pl-0.5">
                {teamOnLeaveDuringRange.length} on leave during {startDate} → {endDate}:
              </p>
              <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                {teamOnLeaveDuringRange.map((l, i) => {
                  const name = l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown';
                  const lvStart = dayKey(l.startDate);
                  const lvEnd = dayKey(l.endDate);
                  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const dateRange = lvStart === lvEnd ? fmt(lvStart) : `${fmt(lvStart)} – ${fmt(lvEnd)}`;
                  const overlapStart = lvStart > startDate ? lvStart : startDate;
                  const overlapEnd = lvEnd < (endDate || startDate) ? lvEnd : (endDate || startDate);
                  const overlapStr = overlapStart === overlapEnd ? fmt(overlapStart) : `${fmt(overlapStart)} – ${fmt(overlapEnd)}`;
                  const isApproved = l.status === 'approved';
                  const isMe = employeeId && l.employee?.id === employeeId;
                  return (
                    <li key={`${l.id || ''}-${i}`} className={`flex items-start gap-2 p-2 rounded-md border ${isMe ? 'bg-violet-50/50 border-violet-200' : 'bg-white border-amber-100'}`}>
                      <div className={`w-7 h-7 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{getInitials(name)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {name}
                          {isMe && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">YOU</span>}
                          <span className="ml-1.5 text-[10px] font-normal text-slate-500">{l.leaveType?.name || 'Leave'}</span>
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          <span className="text-slate-500">On leave:</span> <span className="font-medium text-slate-700">{dateRange}</span>
                          {l.halfDay && <span className="ml-1 italic text-slate-500">(half day)</span>}
                        </p>
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          <FiAlertCircle className="w-2.5 h-2.5 inline mr-0.5" />
                          Overlaps your selection on: <strong>{overlapStr}</strong>
                        </p>
                      </div>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${isApproved ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isApproved ? 'ON LEAVE' : 'PENDING'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {hasConflict && (
                <Link href="/leave/team-calendar" className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline hover:text-amber-900 mt-2 pl-0.5">
                  <FiCalendar className="w-3 h-3" /> View Team Leave Calendar
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading team calendar...</p>
        </div>
      )}
    </div>
  );
}
