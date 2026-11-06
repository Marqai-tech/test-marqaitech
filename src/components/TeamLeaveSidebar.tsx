'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiAlertCircle, FiCheck, FiInfo, FiUsers } from 'react-icons/fi';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }
interface TeamLeave { id: string; employeeId: string; startDate: string; endDate: string; status: string; halfDay?: boolean; leaveType?: { id: string; name: string; code: string }; employee?: { id: string; firstName?: string; lastName?: string; avatar?: string | null }; }
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
function isoDay(d: Date) { return d.toISOString().split('T')[0]; }
function dayKey(d: string | Date) { return new Date(d).toISOString().split('T')[0]; }
function getInitials(n: string) { const p = n.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase(); }
function avatarColor(n: string) { const c = ['bg-blue-500','bg-emerald-500','bg-purple-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-indigo-500']; let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length]; }

export default function TeamLeaveSidebar({ startDate, endDate, scopeQuery, employeeId, onDateSelect }: {
  startDate: string; endDate: string; scopeQuery?: string; employeeId?: string; onDateSelect?: (date: string) => void;
}) {
  const [teamLeaves, setTeamLeaves] = useState<TeamLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const sq = scopeQuery || '';

  const fetchTeamLeaves = useCallback(async () => {
    setLoading(true);
    try { const ms = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}`; const r = await fetch(`/api/leave/team-calendar?month=${ms}&includeSelf=true${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setTeamLeaves(d.leaveRequests || d.leaves || []); } else setTeamLeaves([]); }
    catch { setTeamLeaves([]); } finally { setLoading(false); }
  }, [calMonth, sq]);
  useEffect(() => { fetchTeamLeaves(); }, [fetchTeamLeaves]);

  const leavesByDate = useMemo(() => { const m = new Map<string, TeamLeave[]>(); for (const l of teamLeaves) { if (l.status === 'cancelled' || l.status === 'rejected') continue; const s = new Date(l.startDate); const e = new Date(l.endDate); const c = new Date(s); let g = 0; while (c <= e && g < 400) { g++; const dk = isoDay(c); const a = m.get(dk) || []; a.push(l); m.set(dk, a); c.setDate(c.getDate() + 1); } } return m; }, [teamLeaves]);
  const calendarCells = useMemo(() => { const f = new Date(calMonth.year, calMonth.month, 1); const l = new Date(calMonth.year, calMonth.month + 1, 0); const sw = f.getDay(); const dm = l.getDate(); const cells: { date: string | null; day: number | null }[] = []; for (let i = 0; i < sw; i++) cells.push({ date: null, day: null }); for (let d = 1; d <= dm; d++) cells.push({ date: `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d }); while (cells.length % 7 !== 0) cells.push({ date: null, day: null }); return cells; }, [calMonth]);
  const isInRange = useCallback((date: string) => { if (!startDate || !endDate) return false; return date >= startDate && date <= endDate; }, [startDate, endDate]);
  const todayStr = isoDay(new Date());
  const isFutureRange = startDate && startDate >= todayStr;
  const allOnLeave = teamLeaves.filter(l => l.status !== 'cancelled' && l.status !== 'rejected');
  const teamOnLeaveDuringRange = useMemo(() => { if (!startDate || !endDate || !isFutureRange) return []; const s = new Date(`${startDate}T00:00:00`); const e = new Date(`${endDate}T00:00:00`); return teamLeaves.filter(l => { if (l.status === 'cancelled' || l.status === 'rejected') return false; const ls = new Date(`${dayKey(l.startDate)}T00:00:00`); const le = new Date(`${dayKey(l.endDate)}T00:00:00`); return ls <= e && le >= s; }); }, [startDate, endDate, teamLeaves, isFutureRange]);
  const otherCount = teamOnLeaveDuringRange.filter(l => l.employee?.id !== employeeId).length;
  const hasConflict = otherCount > 0;
  const prevMonth = () => setCalMonth(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const nextMonth = () => setCalMonth(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

  // Avatar component with token + onError fallback
  function EmpAvatar({ emp, name }: { emp?: { avatar?: string | null }; name: string }) {
    const [err, setErr] = useState(false);
    const av = emp?.avatar;
    if (av && !err) { let url = av; if (av.startsWith('/api/employees/')) { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; if (t) url += `${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`; } return <img src={url} alt={name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={() => setErr(true)} />; }
    return <div className={`w-6 h-6 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>{getInitials(name)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><FiCalendar className="w-4 h-4 text-green-600" /> Team Leave Calendar</h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><FiChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-semibold text-slate-700 min-w-[100px] text-center">{MONTH_NAMES[calMonth.month]} {calMonth.year}</span>
              <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><FiChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1"><FiInfo className="w-3 h-3" /> Click a date to set From/To</p>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, i) => { if (!cell.date) return <div key={i} className="aspect-square" />;
              const dl = leavesByDate.get(cell.date) || []; const ha = dl.some(l => l.status === 'approved'); const hp = dl.some(l => l.status === 'pending'); const ir = isInRange(cell.date); const sel = selectedCalDate === cell.date; const d = new Date(`${cell.date}T00:00:00`); const wk = d.getDay() === 0 || d.getDay() === 6; const td = cell.date === todayStr;
              const cls = ['aspect-square rounded-md text-xs flex flex-col items-center justify-center relative cursor-pointer transition-all hover:ring-2 hover:ring-green-400/30'];
              if (ha) cls.push('bg-red-100 ring-1 ring-red-300 text-red-900'); else if (hp) cls.push('bg-amber-100 ring-1 ring-amber-300 text-amber-900'); else if (ir) cls.push('bg-green-100 ring-1 ring-green-300 text-green-900'); else if (wk) cls.push('bg-slate-50 text-slate-400'); else cls.push('bg-white text-slate-700 hover:bg-slate-50');
              if (sel) cls.push('ring-2 ring-green-500');
              const tip = dl.length > 0 ? dl.map(l => `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim() + ` — ${l.leaveType?.name || 'Leave'} (${l.status})`).join(', ') : '';
              return (<button key={i} type="button" title={tip} onClick={() => { setSelectedCalDate(cell.date!); if (onDateSelect) onDateSelect(cell.date!); }} className={cls.join(' ')}>
                <span className={`font-medium ${td ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>{cell.day}</span>
                {dl.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{dl.slice(0, 3).map((l, idx) => <span key={idx} className={`w-1 h-1 rounded-full ${l.status === 'approved' ? 'bg-red-500' : 'bg-amber-500'}`} />)}</span>}
              </button>); })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" />Approved</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" />Pending</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 ring-1 ring-green-300" />Selected</div>
          </div>
        </div>
      </div>

      {!loading && (() => {
        // BUG_120 FIX: count distinct TEAM members (exclude the logged-in employee). Previously the count included the employee's own leaves.
        const distinctTeamMembers = allOnLeave.filter(l => !employeeId || l.employee?.id !== employeeId);
        return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center gap-1.5"><FiUsers className="w-3.5 h-3.5 text-slate-600" /><h4 className="text-xs font-semibold text-slate-700">{distinctTeamMembers.length} team member(s) on leave this month</h4></div>
          {distinctTeamMembers.length > 0 ? (
            <ul className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {/* BUG_120: only list team members (not the logged-in employee). */}
              {distinctTeamMembers.map((l, i) => { const name = l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown'; const ls = dayKey(l.startDate); const le = dayKey(l.endDate); const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' }); const dr = ls === le ? fmt(ls) : `${fmt(ls)} – ${fmt(le)}`; const ia = l.status === 'approved';
                return (<li key={`${l.id || ''}-${i}`} className="flex items-center gap-2 p-2 hover:bg-slate-50">
                  <EmpAvatar emp={l.employee} name={name} />
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-700 truncate">{name}</p><p className="text-[10px] text-slate-500 truncate">{l.leaveType?.name || 'Leave'} · {dr}{l.halfDay && <span className="italic"> (half day)</span>}</p></div>
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${ia ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{ia ? 'APPROVED' : 'PENDING'}</span>
                </li>); })}
            </ul>
          ) : <div className="p-4 text-center"><p className="text-xs text-slate-400">No team members on leave this month.</p></div>}
        </div>
        );
      })()}

      {startDate && endDate && isFutureRange && !loading && (
        <div className={`p-3 rounded-xl border shadow-sm ${hasConflict ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          {/* BUG_119 FIX: if the selected range overlaps the employee's OWN leave, show a warning and DON'T say 'No team conflicts'. */}
          {(() => {
            const ownOverlap = teamOnLeaveDuringRange.filter(l => employeeId && l.employee?.id === employeeId);
            const teamOverlap = teamOnLeaveDuringRange.filter(l => !employeeId || l.employee?.id !== employeeId);
            return (<>
            {ownOverlap.length > 0 && (
              <div className="mb-2"><p className="text-xs font-semibold text-red-800 flex items-start gap-1.5"><FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>Warning: your selected dates overlap your own existing leave.</span></p><p className="text-xs text-red-900 font-semibold pl-5 mt-0.5">→ Please choose different dates.</p></div>
            )}
            {hasConflict ? (<div className="mb-2"><p className="text-xs font-semibold text-amber-800 flex items-start gap-1.5"><FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>Team Conflict — {teamOverlap.length} teammate(s) on leave during your dates</span></p><p className="text-xs text-amber-900 font-semibold pl-5 mt-0.5">→ Approval chances are lower.</p></div>) : ownOverlap.length === 0 && <p className="text-xs text-emerald-700 flex items-center gap-1.5 mb-2"><FiCheck className="w-3.5 h-3.5" /> No team conflicts.</p>}
            </>);
          })()}
          {teamOnLeaveDuringRange.length > 0 && (<><p className="text-[10px] font-medium text-slate-500 mb-1.5 pl-0.5">{teamOnLeaveDuringRange.length} on leave during {(() => { const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' }); return `${fmt(startDate)} → ${fmt(endDate)}`; })()}:</p><ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {teamOnLeaveDuringRange.map((l, i) => { const name = l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown'; const ls = dayKey(l.startDate); const le = dayKey(l.endDate); const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', day: '2-digit' }); const dr = ls === le ? fmt(ls) : `${fmt(ls)} – ${fmt(le)}`; const os = ls > startDate ? ls : startDate; const oe = le < (endDate || startDate) ? le : (endDate || startDate); const ostr = os === oe ? fmt(os) : `${fmt(os)} – ${fmt(oe)}`; const ia = l.status === 'approved'; const isMe = employeeId && l.employee?.id === employeeId;
              return (<li key={`${l.id || ''}-${i}`} className={`flex items-start gap-2 p-2 rounded-md border ${isMe ? 'bg-red-50/50 border-red-200' : 'bg-white border-amber-100'}`}>
                <EmpAvatar emp={l.employee} name={name} />
                <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-800 truncate">{name}{isMe && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold">YOU</span>}<span className="ml-1.5 text-[10px] font-normal text-slate-500">{l.leaveType?.name || 'Leave'}</span></p><p className="text-[10px] text-slate-600 mt-0.5"><span className="text-slate-500">On leave:</span> <span className="font-medium text-slate-700">{dr}</span></p><p className="text-[10px] text-amber-700 mt-0.5"><FiAlertCircle className="w-2.5 h-2.5 inline mr-0.5" />Overlaps: <strong>{ostr}</strong></p></div>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${ia ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{ia ? 'ON LEAVE' : 'PENDING'}</span>
              </li>); })}
          </ul>{hasConflict && <Link href="/leave/team-calendar" className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline hover:text-amber-900 mt-2 pl-0.5"><FiCalendar className="w-3 h-3" /> View Team Calendar</Link>}</>)}
        </div>
      )}
      {loading && <div className="bg-white rounded-xl border border-slate-200 p-4 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2" /><p className="text-xs text-slate-400">Loading...</p></div>}
    </div>
  );
}
