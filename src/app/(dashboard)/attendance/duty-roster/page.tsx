'use client'

/**
 * Duty Roster — dynamic automatic + manual duty scheduling (Attendance module).
 *
 * AUTOMATIC mode: pick employees, map a shift to each weekday (Mon..Sun),
 * choose the effective range (single day / week / month / whole year / custom)
 * and POST /api/attendance/duty-roster creates one anchored weekly roster per
 * employee. MANUAL mode: click any calendar cell to override a single day
 * (PATCH) or clear a 1-day override (DELETE).
 *
 * The calendar is resolved server-side with the SAME rotation math as
 * src/lib/attendance-shift.ts loadEmployeeShiftWindows (latest-startDate-wins
 * assignment, elapsed-days-from-roster-anchor index into the pattern), so what
 * HR sees here is exactly what punch evaluation / auto-present / biometric
 * sync will apply — latest schedule wins.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FiAlertCircle, FiCalendar, FiCheckSquare, FiClock, FiPieChart, FiRefreshCw,
  FiSettings, FiSquare, FiUsers, FiX, FiZap,
} from 'react-icons/fi'
import { PageBreadcrumbs, Panel, StatCard } from '@/components/dashboard/smarthr-widgets'
import { apiFetch, fmtTime } from '@/components/company/useCompanyData'
import { useCompanyContextStore } from '@/store/companyContextStore'

/* ── types (mirror the API payload) ── */

interface ShiftLite {
  id: string; name: string; code: string | null;
  startTime: string; endTime: string; breakDuration: number; status: string;
}
interface AssignmentRow {
  id: string; employeeId: string; currentOffset: number;
  startDate: string; endDate: string | null;
  roster: { id: string; name: string; pattern: unknown; rotationUnit: string; startDate: string; isActive: boolean } | null;
}
interface CalendarCell {
  shiftId: string | null; shiftName: string | null; shiftCode: string | null;
  source: 'roster' | 'policy-default';
}
interface CalendarRow { employeeId: string; employeeCode: string; employeeName: string; days: Record<string, CalendarCell> }
interface DutyData { shifts: ShiftLite[]; assignments: AssignmentRow[]; calendar: CalendarRow[] }

/* ── helpers ── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const pad2 = (n: number) => String(n).padStart(2, '0')

const addDaysKey = (key: string, delta: number) => {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
const mondayOnOrBefore = (key: string) => {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const lastDayOfMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate() // m1 is 1-based

// Stable pastel palette — chip colour is a hash of the shift id so the same
// shift always renders the same colour across the grid and the legend.
const CHIP_COLORS = [
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
]
const chipColor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHIP_COLORS[h % CHIP_COLORS.length]
}

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom'

export default function DutyRosterPage() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery)

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [month, setMonth] = useState(todayKey.slice(0, 7))
  const [data, setData] = useState<DutyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  /* ── automatic (Auto-Schedule) form state ── */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [empQuery, setEmpQuery] = useState('')
  const [pattern, setPattern] = useState<string[]>(new Array(7).fill(''))
  const [preset, setPreset] = useState<Preset>('week')
  // Default to the current week (Monday..Sunday) to match the initial preset.
  const initialStart = mondayOnOrBefore(todayKey)
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(addDaysKey(initialStart, 6))
  const [rosterName, setRosterName] = useState('')
  const [applying, setApplying] = useState(false)

  /* ── manual override modal state ── */
  const [override, setOverride] = useState<{ employeeId: string; employeeName: string; employeeCode: string; date: string; cell: CalendarCell } | null>(null)
  const [overrideShiftId, setOverrideShiftId] = useState('')
  const [overrideBusy, setOverrideBusy] = useState(false)

  const shifts = useMemo(() => data?.shifts || [], [data])
  const activeShifts = useMemo(() => shifts.filter(s => s.status === 'active'), [shifts])
  const defaultShiftId = activeShifts[0]?.id || ''

  /* ── data fetching ── */
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true)
    try {
      const sq = scopeQuery()
      const res = await apiFetch<DutyData>(`/api/attendance/duty-roster?month=${month}${sq ? `&${sq}` : ''}`)
      setData(res)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load duty roster')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [month, scopeQuery])

  useEffect(() => {
    // Defer the fetch to a macrotask so no setState runs synchronously inside
    // the effect body (react-hooks/set-state-in-effect).
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  /* ── month grid data ── */
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return Array.from({ length: lastDayOfMonth(y, m) }, (_, i) => {
      const key = `${month}-${pad2(i + 1)}`
      return { key, num: i + 1, dow: new Date(`${key}T00:00:00Z`).getUTCDay() }
    })
  }, [month])

  const monthLabel = useMemo(
    () => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [month],
  )

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`)
  }

  /* ── stats ── */
  const scheduledIds = useMemo(() => {
    const s = new Set<string>()
    ;(data?.assignments || []).forEach(a => {
      if (!a.roster || a.roster.isActive === false) return
      const end = (a.endDate || '').slice(0, 10)
      if (end && end < todayKey) return
      s.add(a.employeeId)
    })
    return s
  }, [data, todayKey])

  const overrideCount = useMemo(
    () =>
      (data?.assignments || []).filter(a => {
        const s = (a.startDate || '').slice(0, 10)
        const e = (a.endDate || '').slice(0, 10)
        return !!e && s === e && e.startsWith(month)
      }).length,
    [data, month],
  )

  const totalActive = data?.calendar.length || 0
  const coverage = totalActive ? Math.min(100, Math.round((scheduledIds.size / totalActive) * 100)) : 0

  /* ── auto-schedule interactions ── */

  const filteredEmployees = useMemo(() => {
    const q = empQuery.trim().toLowerCase()
    return (data?.calendar || []).filter(
      r => !q || r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q),
    )
  }, [data, empQuery])

  const toggleEmployee = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    // Convenience: scheduling for exactly one employee prefills the weekly
    // pattern from that employee's currently resolved shift on the start date.
    if (next.size === 1) {
      const row = (data?.calendar || []).find(r => r.employeeId === [...next][0])
      const cell = row?.days[startDate]
      if (cell?.source === 'roster' && cell.shiftId) setPattern(new Array(7).fill(cell.shiftId))
    }
  }

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'day') {
      setEndDate(startDate)
    } else if (p === 'week') {
      const anchor = mondayOnOrBefore(startDate)
      setStartDate(anchor)
      setEndDate(addDaysKey(anchor, 6))
    } else if (p === 'month') {
      const [y, m] = startDate.split('-').map(Number)
      setStartDate(`${startDate.slice(0, 7)}-01`)
      setEndDate(`${startDate.slice(0, 7)}-${pad2(lastDayOfMonth(y, m))}`)
    } else if (p === 'year') {
      const y = startDate.slice(0, 4)
      setStartDate(`${y}-01-01`)
      setEndDate(`${y}-12-31`)
    }
    // 'custom' leaves both inputs as the user set them
  }

  const applySchedule = async () => {
    if (!selected.size) { toast.error('Select at least one employee'); return }
    if (!activeShifts.length) { toast.error('Define at least one active shift first'); return }
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) { toast.error('Choose a valid start and end date'); return }
    if (startDate > endDate) { toast.error('Start date must be on or before end date'); return }
    setApplying(true)
    try {
      // Unmapped weekdays fall back to the tenant's first active shift.
      const effPattern = pattern.map(id => id || defaultShiftId)
      const body: Record<string, unknown> = {
        employeeIds: [...selected],
        pattern: { mon: effPattern[0], tue: effPattern[1], wed: effPattern[2], thu: effPattern[3], fri: effPattern[4], sat: effPattern[5], sun: effPattern[6] },
        startDate,
        endDate,
      }
      if (rosterName.trim()) body.name = rosterName.trim()
      const res = await apiFetch<{ created: number; warnings?: string[] }>('/api/attendance/duty-roster', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success(`Duty roster scheduled for ${res.created} employee${res.created === 1 ? '' : 's'}`)
      ;(res.warnings || []).slice(0, 3).forEach(w => toast(w, { duration: 6000 }))
      setSelected(new Set())
      setRosterName('')
      load(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to schedule duty roster')
    } finally {
      setApplying(false)
    }
  }

  /* ── manual override interactions ── */

  const openOverride = (row: CalendarRow, date: string) => {
    const cell = row.days[date] || { shiftId: null, shiftName: null, shiftCode: null, source: 'policy-default' as const }
    setOverride({ employeeId: row.employeeId, employeeName: row.employeeName, employeeCode: row.employeeCode, date, cell })
    setOverrideShiftId(cell.shiftId || activeShifts[0]?.id || '')
  }

  // A cell is a 1-day override when an assignment starts AND ends on that date.
  const overrideAssignmentId = useMemo(() => {
    if (!override) return null
    const a = (data?.assignments || []).find(
      a => a.employeeId === override.employeeId
        && (a.startDate || '').slice(0, 10) === override.date
        && (a.endDate || '').slice(0, 10) === override.date,
    )
    return a?.id || null
  }, [override, data])

  const saveOverride = async () => {
    if (!override || !overrideShiftId) { toast.error('Choose a shift for this day'); return }
    setOverrideBusy(true)
    try {
      await apiFetch('/api/attendance/duty-roster', {
        method: 'PATCH',
        body: JSON.stringify({ employeeId: override.employeeId, date: override.date, shiftId: overrideShiftId }),
      })
      toast.success(`Override saved for ${override.date}`)
      setOverride(null)
      load(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to override day')
    } finally {
      setOverrideBusy(false)
    }
  }

  const clearOverride = async () => {
    if (!override || !overrideAssignmentId) return
    setOverrideBusy(true)
    try {
      await apiFetch(`/api/attendance/duty-roster?assignmentId=${overrideAssignmentId}`, { method: 'DELETE' })
      toast.success('Override cleared')
      setOverride(null)
      load(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear override')
    } finally {
      setOverrideBusy(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4]'
  const presetBtn = (p: Preset, label: string) => (
    <button
      onClick={() => applyPreset(p)}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${preset === p ? 'bg-[#3A57C4] text-white border-[#3A57C4]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#3A57C4]/40'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        title="Duty Roster"
        trail={['Attendance', 'Duty Roster']}
        right={
          <button
            onClick={() => load(false)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/25 bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      {/* Info banner */}
      <div className="rounded-xl border border-[#3A57C4]/20 bg-[#3A57C4]/[0.06] px-4 py-3 text-sm text-slate-700">
        Roster feeds punch evaluation, auto-present and biometric sync automatically — latest schedule wins.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Employees Scheduled" value={`${scheduledIds.size}/${totalActive}`} sub="have an active roster assignment" icon={<FiUsers className="w-5 h-5 text-[#3A57C4]" />} bg="bg-[#3A57C4]/10" ring="ring-[#3A57C4]/20" />
        <StatCard label="Shifts Defined" value={shifts.length} sub={`${activeShifts.length} active shift definition${activeShifts.length === 1 ? '' : 's'}`} icon={<FiClock className="w-5 h-5 text-[#6C4FD6]" />} bg="bg-[#6C4FD6]/10" ring="ring-[#6C4FD6]/20" />
        <StatCard label="Overrides This Month" value={overrideCount} sub="single-day manual overrides" icon={<FiZap className="w-5 h-5 text-[#FF9B44]" />} bg="bg-[#FF9B44]/15" ring="ring-[#FF9B44]/25" />
        <StatCard label="Coverage" value={`${coverage}%`} sub="scheduled vs active employees" icon={<FiPieChart className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" ring="ring-emerald-100" />
      </div>

      {/* Automatic mode — Auto-Schedule */}
      <Panel
        title="Auto-Schedule"
        icon={<FiZap className="w-4 h-4" />}
        action={
          <button
            onClick={applySchedule}
            disabled={applying || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3A57C4] text-white text-sm font-semibold hover:bg-[#2C43A3] disabled:opacity-50 transition-colors"
          >
            <FiZap className="w-4 h-4" /> {applying ? 'Scheduling...' : 'Apply Schedule'}
          </button>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Employee multi-select */}
          <div className="xl:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Employees ({selected.size} selected)</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set(filteredEmployees.map(r => r.employeeId)))} className="text-[11px] font-semibold text-[#3A57C4] hover:underline inline-flex items-center gap-1">
                  <FiCheckSquare className="w-3 h-3" /> All
                </button>
                <button onClick={() => setSelected(new Set())} className="text-[11px] font-semibold text-slate-500 hover:underline inline-flex items-center gap-1">
                  <FiSquare className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>
            <input value={empQuery} onChange={e => setEmpQuery(e.target.value)} placeholder="Search employees..." className={inputClass + ' mb-2'} />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
              {filteredEmployees.length === 0 ? (
                <p className="text-xs text-slate-400 px-3 py-4">No employees match.</p>
              ) : filteredEmployees.map(r => (
                <label key={r.employeeId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(r.employeeId)} onChange={() => toggleEmployee(r.employeeId)} className="rounded border-slate-300 text-[#3A57C4] focus:ring-[#3A57C4]/30" />
                  <span className="text-sm text-slate-700 truncate">{r.employeeName}</span>
                  <span className="text-[11px] text-slate-400 ml-auto font-medium">{r.employeeCode}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Weekday → shift mapping */}
          <div className="xl:col-span-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Weekly Pattern (Mon..Sun)</p>
            <div className="grid grid-cols-1 gap-2">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-9 text-xs font-semibold text-slate-500">{d}</span>
                  <select
                    value={pattern[i] || defaultShiftId}
                    onChange={e => setPattern(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    className={inputClass + ' flex-1'}
                  >
                    <option value="">Select shift...</option>
                    {activeShifts.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({fmtTime(s.startTime)}–{fmtTime(s.endTime)})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Effective range */}
          <div className="xl:col-span-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Effective Range</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {presetBtn('day', 'Single day')}
              {presetBtn('week', 'This week')}
              {presetBtn('month', 'This month')}
              {presetBtn('year', 'Whole year')}
              {presetBtn('custom', 'Custom')}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Start date</label>
                <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value || todayKey); if (preset === 'day') setEndDate(e.target.value || todayKey); if (preset !== 'custom') setPreset('custom') }} className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">End date</label>
                <input type="date" value={endDate} min={startDate} onChange={e => { setEndDate(e.target.value || startDate); if (preset !== 'custom') setPreset('custom') }} className={inputClass} />
              </div>
            </div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Roster name (optional)</label>
            <input value={rosterName} onChange={e => setRosterName(e.target.value)} placeholder={`Duty ${startDate}..${endDate}`} className={inputClass} />
            <p className="text-[11px] text-slate-400 mt-2">
              One anchored weekly roster is created per selected employee; older assignments are superseded automatically (history kept).
            </p>
          </div>
        </div>
      </Panel>

      {/* Manual mode — month calendar grid */}
      <Panel
        title={`Calendar — ${monthLabel}`}
        icon={<FiCalendar className="w-4 h-4" />}
        action={
          <div className="flex items-center gap-1.5">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300" title="Previous month"><span className="text-sm">&#8249;</span></button>
            <button onClick={() => setMonth(todayKey.slice(0, 7))} className="px-2.5 h-8 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300" title="Current month">Today</button>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300" title="Next month"><span className="text-sm">&#8250;</span></button>
          </div>
        }
      >
        {error ? (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-3">
            <FiAlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-14"><FiSettings className="w-8 h-8 animate-spin text-[#3A57C4]/50" /></div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-max w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 min-w-[190px]">Employee</th>
                    {days.map(d => (
                      <th
                        key={d.key}
                        className={`px-1 py-1.5 border-b border-slate-200 border-l border-slate-100 text-center min-w-[52px] ${d.dow === 0 || d.dow === 6 ? 'bg-slate-100/80 text-slate-500' : 'text-slate-600'} ${d.key === todayKey ? 'text-[#3A57C4]' : ''}`}
                      >
                        <span className="block text-[10px] font-medium leading-none">{DOW_LETTER[d.dow]}</span>
                        <span className="block text-xs font-bold leading-tight">{d.num}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.calendar || []).map(row => (
                    <tr key={row.employeeId} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-slate-100">
                        <span className="block text-sm font-medium text-slate-700 leading-tight truncate max-w-[180px]" title={row.employeeName}>{row.employeeName}</span>
                        <span className="block text-[10px] text-slate-400">{row.employeeCode}</span>
                      </td>
                      {days.map(d => {
                        const cell = row.days[d.key]
                        const isRoster = cell?.source === 'roster' && !!cell.shiftId
                        return (
                          <td key={d.key} className={`border-b border-l border-slate-100 p-0.5 ${d.dow === 0 || d.dow === 6 ? 'bg-slate-50/70' : ''} ${d.key === todayKey ? 'ring-1 ring-inset ring-[#3A57C4]/30' : ''}`}>
                            <button
                              onClick={() => openOverride(row, d.key)}
                              className={`w-full h-7 px-1 rounded-md border text-[10px] font-semibold truncate transition-colors ${isRoster ? chipColor(cell.shiftId!) + ' hover:brightness-95' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200/70'}`}
                              title={isRoster ? `${cell.shiftName} (${cell.shiftId ? (shifts.find(s => s.id === cell.shiftId)?.startTime || '') : ''}–${cell.shiftId ? (shifts.find(s => s.id === cell.shiftId)?.endTime || '') : ''}) — click to override` : 'Company default shift — click to override'}
                            >
                              {isRoster ? (cell.shiftCode || cell.shiftName || 'Shift') : 'Default'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {totalActive === 0 ? (
                    <tr><td colSpan={days.length + 1} className="text-center py-10 text-sm text-slate-400">No active employees found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mr-1">Legend:</span>
              {shifts.map(s => (
                <span key={s.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold ${chipColor(s.id)} ${s.status !== 'active' ? 'opacity-50' : ''}`} title={`${s.name} — ${s.status}`}>
                  {s.code || s.name}
                  <span className="font-normal opacity-70">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</span>
                </span>
              ))}
              <span className="inline-flex items-center px-2 py-1 rounded-md border text-[11px] font-semibold bg-slate-100 text-slate-400 border-slate-200">Default</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Click any cell to override that single day. Weekend columns are tinted; today is outlined.</p>
          </>
        )}
      </Panel>

      {/* Manual override modal */}
      {override ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !overrideBusy && setOverride(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Override Duty</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {override.employeeName} ({override.employeeCode}) — {override.date}
                </p>
              </div>
              <button onClick={() => setOverride(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Close"><FiX className="w-4 h-4" /></button>
            </div>

            <p className="text-xs text-slate-500 mb-2">
              Current: {override.cell.source === 'roster' && override.cell.shiftId
                ? `${override.cell.shiftName || 'Shift'} (roster)`
                : 'Company default shift'}
            </p>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Shift for this day</label>
            <select value={overrideShiftId} onChange={e => setOverrideShiftId(e.target.value)} className={inputClass + ' mb-4'}>
              <option value="">Select shift...</option>
              {activeShifts.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({fmtTime(s.startTime)}–{fmtTime(s.endTime)})</option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-2">
              {overrideAssignmentId ? (
                <button onClick={clearOverride} disabled={overrideBusy} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50">
                  Clear override
                </button>
              ) : <span />}
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setOverride(null)} disabled={overrideBusy} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">Cancel</button>
                <button onClick={saveOverride} disabled={overrideBusy || !overrideShiftId} className="px-4 py-2 rounded-lg bg-[#3A57C4] text-white text-xs font-semibold hover:bg-[#2C43A3] disabled:opacity-50">
                  {overrideBusy ? 'Saving...' : 'Override this day'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
