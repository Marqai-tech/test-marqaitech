'use client';

/**
 * Team Leave Calendar — /leave/team-calendar
 *
 * UI inspired by Zimyo HRMS calendar layout:
 *   - Left (wide): Calendar grid + selected day detail
 *   - Middle (narrow): Leave balance summary + upcoming holidays
 *   - Right (narrow): Team roster with leave status
 *
 * Clean white cards, subtle borders, color-coded calendar days.
 */

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiUsers, FiAlertTriangle,
  FiX, FiRefreshCw, FiCheck, FiExternalLink, FiGrid,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TeamMember { id: string; firstName: string; lastName: string; employeeCode?: string; avatar?: string | null; }
interface LeaveRecord {
  id: string; status: 'approved' | 'pending'; startDate: string; endDate: string;
  halfDay: boolean; halfDaySlot?: string | null; reason?: string | null;
  leaveType: { id: string; name: string; code: string };
  employee: { id: string; firstName: string; lastName: string; employeeId?: string; avatar?: string | null; };
}
interface Holiday { id: string; name: string; date: string; type: string; }
interface CalendarResponse {
  teamSize: number; month: string; leaves: LeaveRecord[];
  byDate: Record<string, number[]>; team: TeamMember[];
  me?: { id: string; firstName: string; lastName: string } | null;
  message?: string;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateKey(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function initials(first: string, last: string) { return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?'; }
function colorFor(seed: string) {
  const p = ['bg-rose-500','bg-pink-500','bg-violet-500','bg-indigo-500','bg-blue-500','bg-sky-500','bg-cyan-500','bg-teal-500','bg-emerald-500','bg-amber-500','bg-orange-500'];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; return p[h % p.length];
}
function formatRange(s: string, e: string) {
  const sd = new Date(s), ed = new Date(e);
  const ss = sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const es = ed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return ss === es ? ss : `${ss} – ${es}`;
}
function formatHolidayDate(d: string) { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

function Avatar({ member, size = 'sm' }: { member: { firstName: string; lastName: string; avatar?: string | null }; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-9 h-9 text-xs';
  if (member.avatar) return <img src={member.avatar} alt={`${member.firstName} ${member.lastName}`} className={`${px} rounded-full object-cover border-2 border-white shadow-sm`} />;
  return <div title={`${member.firstName} ${member.lastName}`} className={`${px} rounded-full ${colorFor(member.firstName + member.lastName)} text-white font-bold flex items-center justify-center border-2 border-white shadow-sm`}>{initials(member.firstName, member.lastName)}</div>;
}

function Card({ title, icon, action, children, className = '' }: { title?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-semibold text-slate-800">{title}</h3></div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function TeamLeaveCalendarContent() {
  useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [includeSelf, setIncludeSelf] = useState(false);

  const monthStr = `${year}-${pad(month + 1)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const sq = scopeQuery();
    const headers = getAuthHeaders();
    try {
      const [calRes, holRes] = await Promise.all([
        fetch(`/api/leave/team-calendar?month=${monthStr}&includeSelf=${includeSelf ? 'true' : 'false'}${sq ? `&${sq}` : ''}`, { headers }),
        fetch(`/api/holidays?year=${year}${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
      ]);
      if (calRes.ok) setData(await calRes.json());
      if (holRes?.ok) {
        const hd = await holRes.json();
        setHolidays((hd.holidays || hd.data || []).filter((h: Holiday) => {
          const d = new Date(h.date); return d.getFullYear() === year && d.getMonth() === month;
        }));
      }
    } catch { toast.error('Failed to load calendar'); }
    finally { setLoading(false); }
  }, [monthStr, year, includeSelf, scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goPrev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); setSelectedDay(null); };
  const goNext = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); setSelectedDay(null); };
  const goToday = () => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); setSelectedDay(null); };

  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: dateKey(year, month, d) });
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const selectedDayLeaves = useMemo(() => {
    if (!selectedDay || !data) return [];
    return (data.byDate[selectedDay] || []).map(i => data.leaves[i]).filter(Boolean);
  }, [selectedDay, data]);

  const teamSize = data?.teamSize || 0;
  const highImpactThreshold = Math.max(1, Math.floor(teamSize * 0.3));
  const approvedCount = data?.leaves.filter(l => l.status === 'approved').length || 0;
  const pendingCount = data?.leaves.filter(l => l.status === 'pending').length || 0;
  const uniquePeopleOnLeave = useMemo(() => {
    if (!data) return 0;
    const ids = new Set<string>(); data.leaves.forEach(l => { if (l.employee) ids.add(l.employee.id); });
    return ids.size;
  }, [data]);

  if (loading) return <div className="flex items-center justify-center py-20"><FiRefreshCw className="w-5 h-5 text-slate-400 animate-spin mr-2" /><span className="text-sm text-slate-400">Loading calendar…</span></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Team Leave Calendar</h1>
          <p className="text-xs text-slate-500 mt-0.5">See who's on leave before you apply</p>
        </div>
        <Link href="/leave?action=apply" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <FiCalendar className="w-4 h-4" /> Apply Leave
        </Link>
      </div>

      {/* 3-Column Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ═══ LEFT (7/12): Calendar + Selected Day ═══ */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="overflow-hidden">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button onClick={goPrev} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><FiChevronLeft className="w-4 h-4" /></button>
                <select value={monthStr} onChange={e => { const [y, m] = e.target.value.split('-'); setYear(Number(y)); setMonth(Number(m) - 1); setSelectedDay(null); }} className="text-sm font-semibold text-slate-800 border-none bg-transparent cursor-pointer focus:outline-none">
                  {(() => { const o: { l: string; v: string }[] = []; const b = new Date(); for (let i = -12; i <= 12; i++) { const d = new Date(b.getFullYear(), b.getMonth() + i, 1); o.push({ l: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, v: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }); } return o.map(o => <option key={o.v} value={o.v}>{o.l}</option>); })()}
                </select>
                <button onClick={goNext} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><FiChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={goToday} className="px-2.5 py-1 text-[11px] font-medium text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50">Today</button>
                <label className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer ${includeSelf ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={includeSelf} onChange={e => setIncludeSelf(e.target.checked)} className="w-3 h-3 rounded border-slate-300 text-violet-500" /> My leaves
                </label>
                <button onClick={fetchData} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400"><FiRefreshCw className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {/* Calendar grid */}
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAY_LABELS.map(w => <div key={w} className="text-center text-[10px] font-bold uppercase text-slate-400 py-1">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((cell, idx) => {
                  if (!cell) return <div key={`e-${idx}`} className="h-12 rounded-md bg-slate-50/40" />;
                  const indices = data?.byDate[cell.key] || [];
                  const dayLeaves = indices.map(i => data!.leaves[i]).filter(Boolean);
                  const uniquePeople = new Map<string, LeaveRecord['employee']>();
                  dayLeaves.forEach(lv => { if (lv.employee) uniquePeople.set(lv.employee.id, lv.employee); });
                  const isToday = cell.key === todayKey;
                  const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                  const isHighImpact = uniquePeople.size >= highImpactThreshold;
                  const isSelected = cell.key === selectedDay;
                  const hasApproved = dayLeaves.some(l => l.status === 'approved');
                  const hasPending = dayLeaves.some(l => l.status === 'pending');
                  const isHoliday = holidays.some(h => { const d = new Date(h.date); return dateKey(d.getFullYear(), d.getMonth(), d.getDate()) === cell.key; });
                  return (
                    <button key={cell.key} onClick={() => setSelectedDay(cell.key)} className={`h-12 rounded-md text-xs font-medium flex flex-col items-center justify-center relative transition-all ${
                      isSelected ? 'bg-blue-600 text-white shadow-md' :
                      isHighImpact ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100' :
                      hasApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100' :
                      hasPending ? 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100' :
                      isHoliday ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                      isWeekend ? 'bg-slate-50 text-slate-400' :
                      'bg-white text-slate-700 border border-slate-100 hover:bg-slate-50'
                    }`}>
                      <span className={`leading-none ${isToday && !isSelected ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>{cell.day}</span>
                      {dayLeaves.length > 0 && !isSelected && <span className="absolute bottom-1 flex gap-0.5">{dayLeaves.slice(0, 3).map(lv => <span key={lv.id} className={`w-1 h-1 rounded-full ${lv.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}`} />)}</span>}
                      {isHighImpact && !isSelected && <FiAlertTriangle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-rose-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Legend */}
            <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> Approved</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200" /> Pending</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-200" /> High impact</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-teal-100 border border-teal-200" /> Holiday</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-600" /> Today</span>
            </div>
          </Card>

          {/* Selected Day Detail */}
          {selectedDay && data && (
            <Card title={new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} icon={<FiCalendar className="w-4 h-4 text-blue-500" />} action={<button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-slate-600"><FiX className="w-4 h-4" /></button>}>
              {selectedDayLeaves.length === 0 ? (
                <div className="text-center py-6"><FiCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" /><p className="text-sm text-slate-500">All clear — no one on leave</p></div>
              ) : (
                <ul className="space-y-2">
                  {selectedDayLeaves.map(lv => {
                    const isMe = data.me && lv.employee.id === data.me.id;
                    return (
                      <li key={lv.id} className={`flex items-center gap-3 p-2.5 rounded-lg ${isMe ? 'bg-violet-50' : 'bg-slate-50'}`}>
                        <Avatar member={lv.employee} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{lv.employee.firstName} {lv.employee.lastName}{isMe && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">YOU</span>}</p>
                          <p className="text-[11px] text-slate-500">{lv.leaveType.name} · {formatRange(lv.startDate, lv.endDate)}{lv.halfDay ? ' · ½ day' : ''}</p>
                        </div>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${lv.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lv.status}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* ═══ MIDDLE (3/12): Stats + Holidays ═══ */}
        <div className="lg:col-span-3 space-y-5">
          <Card title="This Month" icon={<FiGrid className="w-4 h-4 text-blue-500" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Team Members</span><span className="text-sm font-bold text-slate-800">{teamSize}</span></div>
              <div className="flex items-center justify-between"><span className="text-xs text-slate-500">On Leave</span><span className="text-sm font-bold text-amber-600">{uniquePeopleOnLeave}</span></div>
              <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Approved</span><span className="text-sm font-bold text-emerald-600">{approvedCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Pending</span><span className="text-sm font-bold text-amber-500">{pendingCount}</span></div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100"><span className="text-xs text-slate-500">Total Records</span><span className="text-sm font-bold text-slate-800">{data?.leaves.length || 0}</span></div>
            </div>
          </Card>

          <Card title="Holidays" icon={<FiCalendar className="w-4 h-4 text-teal-500" />} action={<Link href="/leave/holidays"><FiExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" /></Link>}>
            {holidays.length === 0 ? <p className="text-xs text-slate-400 text-center py-3">No holidays this month</p> : (
              <ul className="space-y-2">
                {holidays.slice(0, 5).map(h => <li key={h.id} className="flex items-center justify-between"><span className="text-xs text-slate-700 font-medium">{h.name}</span><span className="text-[10px] text-slate-400">{formatHolidayDate(h.date)}</span></li>)}
                {holidays.length > 5 && <li className="text-[10px] text-slate-400 text-center pt-1">+ {holidays.length - 5} more</li>}
              </ul>
            )}
          </Card>
        </div>

        {/* ═══ RIGHT (2/12): Team Roster ═══ */}
        <div className="lg:col-span-2">
          <Card title={`Team (${teamSize})`} icon={<FiUsers className="w-4 h-4 text-violet-500" />}>
            {teamSize === 0 ? <p className="text-xs text-slate-400 text-center py-3">No team members</p> : (
              <ul className="space-y-2">
                {data!.team.map(m => {
                  const pl = data!.leaves.filter(lv => lv.employee.id === m.id);
                  const isMe = data!.me && m.id === data!.me.id;
                  return (
                    <li key={m.id} className={`flex items-center gap-2 p-1.5 rounded-lg ${isMe ? 'bg-violet-50' : ''}`}>
                      <Avatar member={m} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-slate-700 truncate">{m.firstName} {m.lastName}{isMe && <span className="ml-1 text-violet-600">(you)</span>}</p>
                        <p className={`text-[9px] ${pl.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{pl.length > 0 ? `${pl.length} leave${pl.length > 1 ? 's' : ''}` : '✓ No leave'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function TeamLeaveCalendarPage() {
  return <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Loading Team Leave Calendar…</div>}><TeamLeaveCalendarContent /></Suspense>;
}
