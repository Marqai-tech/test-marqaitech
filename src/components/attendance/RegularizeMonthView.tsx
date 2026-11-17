'use client';

/**
 * Task 157 — HR month view & one-shot bulk actions for attendance.
 *
 * Gives HR what the regularize page was missing:
 *  - a full MONTH VIEW grid (employees × days) of the attendance module,
 *  - filters (month, department, employee search, status),
 *  - ONE-SHOT actions for a SINGLE or MULTIPLE employees: click day cells to
 *    select (or select a whole row/column), then either
 *      · "Direct Attendance Update" — HR override for payroll (writes
 *        Attendance + audit log via POST /api/attendance/bulk-update), or
 *      · "Raise Regularization Requests" — one regularize request per
 *        selected cell, incl. the "Production Less Hours" type.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiRefreshCw, FiX, FiCheckSquare,
  FiSearch, FiLayers, FiAlertTriangle, FiCheckCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import TimePickerAmPm from '@/components/TimePickerAmPm';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  department?: { name: string } | null;
}

interface Rec {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  notes?: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function getDaysInMonth(month: number, year: number) { return new Date(year, month + 1, 0).getDate(); }

/* Month-safe date key: rows are stored at UTC-midnight of the local day OR at
 * IST midnight (+05:30 = previous day 18:30 UTC) — map both to the calendar
 * date (same technique as the muster-roll grid). */
function recordDateKey(v: string): string {
  const raw = String(v || '');
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.split('T')[0];
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getDayColor(status: string) {
  const colors: Record<string, string> = {
    present: 'bg-emerald-500',
    absent: 'bg-red-500',
    late: 'bg-orange-400',
    half_day: 'bg-amber-400',
    holiday: 'bg-green-400',
    weekend: 'bg-slate-200',
    on_leave: 'bg-teal-400',
    '': 'bg-slate-100',
  };
  return colors[status] || 'bg-slate-100';
}
function getDayText(status: string) {
  return status === 'weekend' || status === '' ? 'text-slate-600' : 'text-white';
}
function getDayLabel(status: string) {
  const labels: Record<string, string> = { present: 'P', absent: 'A', late: 'L', half_day: 'H', holiday: 'Hd', weekend: 'W', on_leave: 'Lv', '': '-' };
  return labels[status] || '-';
}
export const STATUS_LABELS: Record<string, string> = {
  present: 'Present', absent: 'Absent', late: 'Late', half_day: 'Half Day',
  holiday: 'Holiday', weekend: 'Week Off', on_leave: 'On Leave', '': 'No Record',
};
function fmtCellTime(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', 'a').replace(' PM', 'p').replace(':00', '');
}

/* Compact work-hours figure for cell sub-lines / tooltips (e.g. "7.8h"). */
function fmtHoursShort(v: number | null | undefined): string {
  if (v == null || isNaN(Number(v))) return '';
  return `${Math.round(Number(v) * 10) / 10}h`;
}
/* Under-8-hours half days come from the auto production-shortfall rule at
 * checkout — they feed payroll LOP 0.5, so HR must see WHY it is a half day. */
function isShortHalfDay(status: string, workHours: number | null | undefined): boolean {
  return status === 'half_day' && workHours != null && workHours < 8;
}
/* One-line note for the cell tooltip (truncated to ~80 chars). */
function truncateNote(v: string | null | undefined, max: number): string {
  const s = (v || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const PUNCH_TYPE_LABELS: Record<string, string> = {
  check_in: 'Check-In (forgot to clock in)',
  check_out: 'Check-Out (forgot to clock out)',
  break_in: 'Break-In (incorrect break start)',
  break_out: 'Break-Out (incorrect break return)',
  production_shortfall: 'Production Less Hours (worked under 8 hours)',
};

interface Props {
  /** Refresh callback for the parent page (requests table). */
  onChanged: () => void;
}

export default function RegularizeMonthView({ onChanged }: Props) {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const canManage = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '');

  const [monthNav, setMonthNav] = useState(() => ({ month: new Date().getMonth(), year: new Date().getFullYear() }));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Map<string, Map<string, Rec>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [departmentFilter, setDepartmentFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selection, setSelection] = useState<Set<string>>(new Set());

  // Bulk dialog state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'direct' | 'request'>('direct');
  const [bulkStatus, setBulkStatus] = useState('present');
  const [bulkCheckIn, setBulkCheckIn] = useState('');
  const [bulkCheckOut, setBulkCheckOut] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkPunchType, setBulkPunchType] = useState('check_in');
  const [bulkTime, setBulkTime] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number; skip: number; fail: number; errors: string[] } | null>(null);

  const todayKey = new Date().toLocaleDateString('en-CA');
  const days = useMemo(() => Array.from({ length: getDaysInMonth(monthNav.month, monthNav.year) }, (_, i) => i + 1), [monthNav]);
  const monthPrefix = `${monthNav.year}-${pad2(monthNav.month + 1)}-`;

  /* ── Data fetching ── */
  const fetchAll = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    try {
      const sq = scopeQuery();
      const eRes = await fetch(`/api/employees?limit=500&excludeInactive=true${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const eData = await eRes.json();
      const emps: Employee[] = eData.employees || [];
      setEmployees(emps);

      if (emps.length === 0) { setAttendanceMap(new Map()); return; }
      const monthNum = monthNav.month + 1;
      const lastDay = getDaysInMonth(monthNav.month, monthNav.year);
      const startDate = `${monthNav.year}-${pad2(monthNum)}-01`;
      const endDate = `${monthNav.year}-${pad2(monthNum)}-${pad2(lastDay)}`;
      const aRes = await fetch(
        `/api/attendance?employeeIds=${encodeURIComponent(emps.map(e => e.id).join(','))}&startDate=${startDate}&endDate=${endDate}&limit=10000`,
        { headers: getAuthHeaders() },
      );
      const aData = await aRes.json();
      const records: Rec[] = aData.attendance || [];
      const map = new Map<string, Map<string, Rec>>();
      records.forEach(record => {
        const key = recordDateKey(record.date);
        if (!key.startsWith(monthPrefix)) return;
        if (!map.has(record.employeeId)) map.set(record.employeeId, new Map());
        map.get(record.employeeId)!.set(key, record);
      });
      setAttendanceMap(map);
    } catch {
      toast.error('Failed to load month view data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeQuery, selectedTenantId, monthNav.year, monthNav.month]);

  useEffect(() => { queueMicrotask(() => fetchAll(false)); }, [fetchAll]);

  /* ── Filters ── */
  const departments = useMemo(
    () => Array.from(new Set(employees.map(e => e.department?.name).filter(Boolean) as string[])).sort(),
    [employees],
  );

  const visibleEmployees = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return employees.filter(e => {
      if (departmentFilter && e.department?.name !== departmentFilter) return false;
      if (q && !(`${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q))) return false;
      if (statusFilter) {
        const empMap = attendanceMap.get(e.id);
        if (statusFilter === 'none') {
          // employee has at least one past day in the month without a record
          const hasGap = days.some(d => {
            const dk = `${monthPrefix}${pad2(d)}`;
            return dk <= todayKey && !empMap?.get(dk);
          });
          if (!hasGap) return false;
        } else {
          const hasStatus = Array.from(empMap?.values() || []).some(r => r.status === statusFilter);
          if (!hasStatus) return false;
        }
      }
      return true;
    });
  }, [employees, departmentFilter, searchFilter, statusFilter, attendanceMap, days, monthPrefix, todayKey]);

  /* ── Selection ── */
  const cellKey = (empId: string, dateKey: string) => `${empId}|${dateKey}`;
  const toggleCell = (empId: string, dateKey: string) => {
    setSelection(prev => {
      const next = new Set(prev);
      const k = cellKey(empId, dateKey);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const rowSelected = (empId: string) => days.every(d => selection.has(cellKey(empId, `${monthPrefix}${pad2(d)}`)));
  const toggleRow = (empId: string) => {
    setSelection(prev => {
      const next = new Set(prev);
      const allSelected = days.every(d => next.has(cellKey(empId, `${monthPrefix}${pad2(d)}`)));
      days.forEach(d => {
        const k = cellKey(empId, `${monthPrefix}${pad2(d)}`);
        if (allSelected) next.delete(k); else next.add(k);
      });
      return next;
    });
  };
  const columnSelected = (dateKey: string) => visibleEmployees.length > 0 && visibleEmployees.every(e => selection.has(cellKey(e.id, dateKey)));
  const toggleColumn = (dateKey: string) => {
    setSelection(prev => {
      const next = new Set(prev);
      const allSelected = visibleEmployees.every(e => next.has(cellKey(e.id, dateKey)));
      visibleEmployees.forEach(e => {
        const k = cellKey(e.id, dateKey);
        if (allSelected) next.delete(k); else next.add(k);
      });
      return next;
    });
  };

  /* ── Bulk submit ── */
  const openBulk = () => {
    setProgress(null);
    setBulkStatus('present'); setBulkCheckIn(''); setBulkCheckOut(''); setBulkNote('');
    setBulkReason(''); setBulkPunchType('check_in'); setBulkTime('');
    setBulkOpen(true);
  };

  const submitBulk = async () => {
    const keys = Array.from(selection);
    if (keys.length === 0) return;
    if (bulkMode === 'direct' && !bulkReason.trim()) { toast.error('Audit reason is required'); return; }
    if (bulkMode === 'request') {
      if (!bulkReason.trim()) { toast.error('Reason is required'); return; }
      if (bulkPunchType !== 'production_shortfall' && !bulkTime) { toast.error('Actual time is required for this punch type'); return; }
    }

    setBulkBusy(true);
    setProgress({ done: 0, total: keys.length, ok: 0, skip: 0, fail: 0, errors: [] });

    const nameOf = (empId: string) => {
      const e = employees.find(x => x.id === empId);
      return e ? `${e.firstName} ${e.lastName}` : empId;
    };

    try {
      if (bulkMode === 'direct') {
        const updates = keys.map(k => {
          const [empId, dateKey] = k.split('|');
          return {
            employeeId: empId,
            date: dateKey,
            status: bulkStatus,
            checkIn: bulkCheckIn ? `${dateKey}T${bulkCheckIn}:00` : undefined,
            checkOut: bulkCheckOut ? `${dateKey}T${bulkCheckOut}:00` : undefined,
            note: bulkNote || undefined,
            reason: bulkReason,
          };
        });
        const r = await fetch('/api/attendance/bulk-update', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ updates }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Bulk update failed');
        setProgress({ done: keys.length, total: keys.length, ok: d.updated || 0, skip: 0, fail: d.failedCount || 0, errors: (d.failed || []).map((f: { employeeId: string; date: string; error?: string }) => `${nameOf(f.employeeId)} ${f.date}: ${f.error || 'failed'}`) });
        toast.success(`${d.updated || 0} attendance record(s) updated`);
      } else {
        // One regularize request per selected cell, small concurrency pool.
        let ok = 0, skip = 0, fail = 0, done = 0;
        const errors: string[] = [];
        let idx = 0;
        const worker = async () => {
          while (idx < keys.length) {
            const i = idx++;
            const k = keys[i];
            const [empId, dateKey] = k.split('|');
            try {
              const r = await fetch('/api/attendance/regularize', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  employeeId: empId,
                  date: dateKey,
                  punchType: bulkPunchType,
                  requestedTime: bulkPunchType === 'production_shortfall' ? null : new Date(`${dateKey}T${bulkTime}`),
                  reason: bulkReason,
                  clientToday: todayKey,
                }),
              });
              const d = await r.json().catch(() => ({}));
              if (r.ok) ok++;
              else {
                if (r.status === 409) skip++; else fail++;
                const msg = d.error || 'failed';
                if (errors.length < 12) errors.push(`${nameOf(empId)} ${dateKey}: ${msg}`);
              }
            } catch {
              fail++;
              if (errors.length < 12) errors.push(`${nameOf(empId)} ${dateKey}: network error`);
            }
            done++;
            setProgress({ done, total: keys.length, ok, skip, fail, errors: [...errors] });
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, keys.length) }, worker));
        toast.success(`${ok} request(s) raised · ${skip} duplicate(s) skipped${fail ? ` · ${fail} failed` : ''}`);
      }

      await fetchAll(true);
      onChanged();
      setSelection(new Set());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  };

  if (!canManage) return null;

  const selCount = selection.size;
  const selEmployees = new Set(Array.from(selection).map(k => k.split('|')[0])).size;

  return (
    <div className="thb-card overflow-hidden">
      {/* ─── Header + filters ─── */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
        <FiCalendar className="w-4 h-4 text-cyan-600" />
        <h3 className="text-sm font-semibold text-slate-800 mr-2">Month View &amp; One-Shot Regularize</h3>

        <div className="flex items-center gap-1">
          <button onClick={() => setMonthNav(p => ({ month: p.month === 0 ? 11 : p.month - 1, year: p.month === 0 ? p.year - 1 : p.year }))} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100" title="Previous month"><FiChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-slate-700 px-2 min-w-[130px] text-center">{MONTHS[monthNav.month]} {monthNav.year}</span>
          <button onClick={() => setMonthNav(p => ({ month: p.month === 11 ? 0 : p.month + 1, year: p.month === 11 ? p.year + 1 : p.year }))} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100" title="Next month"><FiChevronRight className="w-4 h-4" /></button>
        </div>

        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="3boxes-input !w-auto !py-1.5 text-xs">
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="3boxes-input !w-auto !py-1.5 text-xs">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <div className="relative">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Search employee…" className="3boxes-input !w-auto !py-1.5 pl-8 text-xs" />
        </div>

        <button onClick={() => fetchAll(true)} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100" title="Refresh">
          <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ─── Bulk action bar ─── */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-cyan-50/50 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-600">
          Click day cells to select — then act on <b>single or multiple employees at once</b>. Row header selects the whole employee, a date header selects that day for everyone.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {selCount > 0 && (
            <span className="text-xs font-semibold text-cyan-800 bg-cyan-100 rounded-full px-3 py-1">
              {selCount} cell{selCount > 1 ? 's' : ''} · {selEmployees} employee{selEmployees > 1 ? 's' : ''}
            </span>
          )}
          {selCount > 0 && (
            <button onClick={() => setSelection(new Set())} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Clear</button>
          )}
          <button onClick={openBulk} disabled={selCount === 0} className="3boxes-btn-primary !py-1.5 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <FiCheckSquare className="w-4 h-4" /> Update / Regularize Selected
          </button>
        </div>
      </div>

      {/* ─── Grid ─── */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading month view…</div>
      ) : visibleEmployees.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">No employees match the current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">
                  <span className="flex items-center gap-2">
                    <FiLayers className="w-3.5 h-3.5" /> Employee
                  </span>
                </th>
                {days.map(day => {
                  const dateKey = `${monthPrefix}${pad2(day)}`;
                  const dow = new Date(`${dateKey}T00:00:00`).getDay();
                  const isToday = dateKey === todayKey;
                  return (
                    <th key={day} className="px-1 py-2 min-w-[48px]">
                      <button
                        onClick={() => toggleColumn(dateKey)}
                        title={`Select ${MONTHS[monthNav.month]} ${day} for all filtered employees`}
                        className={`w-full rounded py-1 text-center text-[11px] font-bold transition-colors hover:ring-2 hover:ring-cyan-300 ${columnSelected(dateKey) ? 'bg-cyan-600 text-white' : isToday ? 'bg-cyan-100 text-cyan-700' : dow === 0 || dow === 6 ? 'text-slate-400' : 'text-slate-600'}`}
                      >
                        {day}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEmployees.map(emp => {
                const empMap = attendanceMap.get(emp.id);
                const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 bg-white px-3 py-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rowSelected(emp.id)}
                          onChange={() => toggleRow(emp.id)}
                          title="Select all days of the month for this employee"
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{initials}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-slate-800 truncate">{emp.firstName} {emp.lastName}</span>
                          <span className="block text-[11px] text-slate-400 truncate">{emp.employeeId}{emp.department?.name ? ` · ${emp.department.name}` : ''}</span>
                        </span>
                      </label>
                    </td>
                    {days.map(day => {
                      const dateKey = `${monthPrefix}${pad2(day)}`;
                      const record = empMap?.get(dateKey);
                      const status = record?.status || '';
                      const isFuture = dateKey > todayKey;
                      const dow = new Date(`${dateKey}T00:00:00`).getDay();
                      const shownStatus = status || (dow === 0 || dow === 6 ? 'weekend' : '');
                      const selected = selection.has(cellKey(emp.id, dateKey));
                      const inTime = fmtCellTime(record?.checkIn);
                      const outTime = fmtCellTime(record?.checkOut);
                      // Half-day reason visibility: under-8-hours days carry a
                      // production shortfall that becomes 0.5 LOP in payroll.
                      const hoursLabel = fmtHoursShort(record?.workHours);
                      const shortHalf = isShortHalfDay(shownStatus, record?.workHours);
                      const noteLine = truncateNote(record?.notes, 80);
                      const tooltipBase = `${MONTHS[monthNav.month]} ${day}: ${STATUS_LABELS[shownStatus] || 'No Record'}`
                        + (inTime ? ` · In ${inTime}` : '')
                        + (outTime ? ` · Out ${outTime}` : '')
                        + (hoursLabel ? ` · ${hoursLabel}` : '')
                        + (selected ? ' (selected)' : '');
                      const tooltip = isFuture
                        ? `${MONTHS[monthNav.month]} ${day} — future date`
                        : shortHalf
                          ? `Production Less Hours (worked ${hoursLabel || '0h'} of 8h)\n${tooltipBase}${noteLine ? `\n${noteLine}` : ''}`
                          : `${tooltipBase}${noteLine ? `\n${noteLine}` : ''}`;
                      return (
                        <td key={day} className="px-1 py-1.5">
                          <button
                            onClick={() => !isFuture && toggleCell(emp.id, dateKey)}
                            disabled={isFuture}
                            title={tooltip}
                            className={`relative w-11 rounded flex flex-col items-center justify-center py-1 transition-all ${getDayColor(shownStatus)} ${selected ? 'ring-2 ring-cyan-600 ring-offset-1' : 'hover:ring-2 hover:ring-cyan-300/70'} ${isFuture ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {shortHalf && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-700 ring-1 ring-white/80" aria-hidden="true" />}
                            <span className={`text-[11px] font-bold leading-none ${getDayText(shownStatus)}`}>{getDayLabel(shownStatus)}</span>
                            {(inTime || outTime || hoursLabel) && (
                              <span className={`mt-0.5 text-[8px] leading-none whitespace-nowrap ${shownStatus === 'weekend' || shownStatus === '' ? 'text-slate-500' : 'text-white/95'}`}>
                                {inTime || outTime
                                  ? `${inTime || '—'}${outTime ? `–${outTime}` : ''}${hoursLabel ? ` · ${hoursLabel}` : ''}`
                                  : hoursLabel}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {[['present', 'Present'], ['absent', 'Absent'], ['late', 'Late'], ['half_day', 'Half Day'], ['on_leave', 'On Leave'], ['holiday', 'Holiday'], ['weekend', 'Week Off'], ['', 'No Record']].map(([s, l]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${getDayColor(s)}`}></span>{l}
          </span>
        ))}
      </div>

      {/* ─── Bulk action dialog ─── */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => { if (!bulkBusy) setBulkOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FiCheckSquare className="w-5 h-5 text-cyan-500" /> One-Shot Update / Regularize
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selCount} day-cell(s) across {selEmployees} employee(s) selected
                </p>
              </div>
              <button onClick={() => !bulkBusy && setBulkOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => setBulkMode('direct')}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${bulkMode === 'direct' ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="text-sm font-semibold text-slate-800">Direct Attendance Update</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">HR override — sets attendance immediately for payroll (audit-logged)</p>
                </button>
                <button
                  onClick={() => setBulkMode('request')}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${bulkMode === 'request' ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="text-sm font-semibold text-slate-800">Raise Regularization Requests</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">One regularize request per cell (approval workflow)</p>
                </button>
              </div>

              {bulkMode === 'direct' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Status <span className="text-red-500 font-bold">*</span></label>
                      <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="3boxes-input w-full">
                        {Object.entries(STATUS_LABELS).filter(([v]) => v).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Check-In <span className="text-slate-400">(optional)</span></label>
                      <TimePickerAmPm value={bulkCheckIn} onChange={setBulkCheckIn} className="w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Check-Out <span className="text-slate-400">(optional)</span></label>
                      <TimePickerAmPm value={bulkCheckOut} onChange={setBulkCheckOut} className="w-full" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Note <span className="text-slate-400">(optional, saved on the attendance record)</span></label>
                      <input type="text" value={bulkNote} onChange={e => setBulkNote(e.target.value)} className="3boxes-input w-full" placeholder="e.g. System missed the punch — verified from biometric log" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Audit Reason <span className="text-red-500 font-bold">*</span></label>
                      <input type="text" value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="3boxes-input w-full" placeholder="e.g. Payroll correction for September — approved by HR" />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Writes directly to attendance for the selected employee-day cells and records an audit entry per change. Use for payroll finalization.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Punch Type <span className="text-red-500 font-bold">*</span></label>
                      <select value={bulkPunchType} onChange={e => setBulkPunchType(e.target.value)} className="3boxes-input w-full">
                        {Object.entries(PUNCH_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Actual Time {bulkPunchType === 'production_shortfall' ? <span className="text-slate-400">(Not applicable)</span> : <span className="text-red-500 font-bold">*</span>}</label>
                      <TimePickerAmPm value={bulkTime} onChange={setBulkTime} className="w-full" disabled={bulkPunchType === 'production_shortfall'} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500 font-bold">*</span></label>
                      <input type="text" value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="3boxes-input w-full" placeholder="e.g. Biometric device was down" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    Creates one pending regularize request per selected cell (duplicates are skipped automatically). Requests follow the normal approval workflow.
                  </p>
                </>
              )}

              {/* Progress */}
              {progress && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                    <span>{bulkBusy ? `Processing ${progress.done}/${progress.total}…` : 'Completed'}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-emerald-600">{progress.ok} ok</span>
                      {progress.skip > 0 && <span className="text-amber-600">{progress.skip} skipped</span>}
                      {progress.fail > 0 && <span className="text-red-600">{progress.fail} failed</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  {progress.errors.length > 0 && (
                    <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                      {progress.errors.map((er, i) => (
                        <p key={i} className="text-[11px] text-red-600 flex items-start gap-1"><FiAlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{er}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setBulkOpen(false)} disabled={bulkBusy} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close</button>
              <button onClick={submitBulk} disabled={bulkBusy || selCount === 0} className="3boxes-btn-primary flex items-center gap-2 disabled:opacity-50">
                {bulkBusy ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiCheckCircle className="w-4 h-4" />}
                {bulkMode === 'direct' ? `Update ${selCount} Cell(s)` : `Raise ${selCount} Request(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
