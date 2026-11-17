'use client'

/**
 * My Duty Roster — self-service, READ-ONLY view of the duty roster.
 *
 * Employees see exactly ONE roster: their own. Managers additionally see
 * their reportees' rosters (solid + dotted line, the same team scope every
 * other module uses). Scheduling / overrides stay with HR/Admin on
 * /attendance/duty-roster — this page never mutates anything.
 *
 * Data: GET /api/attendance/my-roster?month=YYYY-MM[&employeeId=…]
 * The per-date shift resolution is identical to the punch-evaluation engine
 * (latest-startDate-wins assignment → roster anchor → pattern index), so what
 * the employee sees here is exactly what will be applied to their punches.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FiAlertCircle, FiCalendar, FiClock, FiRefreshCw, FiSearch, FiSettings, FiUsers,
} from 'react-icons/fi'
import { PageBreadcrumbs, Panel, StatCard } from '@/components/dashboard/smarthr-widgets'
import { apiFetch, fmtTime } from '@/components/company/useCompanyData'

/* ── types (mirror the API payload) ── */

interface ShiftLite {
  id: string; name: string; code: string | null;
  startTime: string; endTime: string; breakDuration: number; status: string;
}
interface CalendarCell {
  shiftId: string | null; shiftName: string | null; shiftCode: string | null;
  source: 'roster' | 'policy-default';
}
interface CalendarRow {
  employeeId: string; employeeCode: string; employeeName: string;
  relationship: 'self' | 'reportee';
  days: Record<string, CalendarCell>;
}
interface PersonRow { employeeId: string; employeeCode: string; employeeName: string; relationship: 'self' | 'reportee' }
interface Viewer { employeeId: string | null; employeeName: string; isManager: boolean; isAdmin: boolean }
interface MyRosterData {
  viewer: Viewer; people: PersonRow[]; shifts: ShiftLite[];
  calendar: CalendarRow[]; days: string[];
}

/* ── helpers ── */

const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const pad2 = (n: number) => String(n).padStart(2, '0')

// Same stable pastel palette as the admin Duty Roster page — the same shift
// always renders the same colour here, on the admin grid and in the legend.
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

export default function MyDutyRosterPage() {
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [month, setMonth] = useState(todayKey.slice(0, 7))
  const [data, setData] = useState<MyRosterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  // Which person's roster is on the calendar. Defaults to the viewer's own
  // employeeId once the first load lands (relationship: 'self').
  const [selectedId, setSelectedId] = useState<string>('')
  const [personQuery, setPersonQuery] = useState('')

  const people = useMemo(() => data?.people || [], [data])
  const shifts = useMemo(() => data?.shifts || [], [data])
  const calendarRows = useMemo(() => data?.calendar || [], [data])

  /* ── data fetching ── */
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true)
    try {
      const res = await apiFetch<MyRosterData>(`/api/attendance/my-roster?month=${month}`)
      setData(res)
      setError('')
      // Keep the current selection valid; default to the viewer's own roster.
      setSelectedId(prev => {
        if (prev && res.people.some(p => p.employeeId === prev)) return prev
        return res.viewer?.employeeId && res.people.some(p => p.employeeId === res.viewer.employeeId)
          ? res.viewer.employeeId
          : (res.people[0]?.employeeId || '')
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your duty roster')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [month])

  useEffect(() => {
    // Defer the fetch to a macrotask so no setState runs synchronously inside
    // the effect body (react-hooks/set-state-in-effect).
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  /* ── month grid data ── */
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => {
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

  /* ── selection + stats ── */
  const selectedRow = useMemo(
    () => calendarRows.find(r => r.employeeId === selectedId) || null,
    [calendarRows, selectedId],
  )

  const scheduledDays = useMemo(
    () => days.filter(d => selectedRow?.days[d.key]?.source === 'roster' && selectedRow.days[d.key].shiftId).length,
    [days, selectedRow],
  )
  const defaultDays = useMemo(
    () => days.filter(d => selectedRow && !(selectedRow.days[d.key]?.source === 'roster' && selectedRow.days[d.key].shiftId)).length,
    [days, selectedRow],
  )

  // This-week strip: Mon..Sun around today (within the visible month where possible).
  const weekStrip = useMemo(() => {
    const d = new Date(`${todayKey}T00:00:00Z`)
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday)
      dd.setUTCDate(monday.getUTCDate() + i)
      const key = dd.toISOString().slice(0, 10)
      return { key, num: dd.getUTCDate(), dow: dd.getUTCDay() }
    })
  }, [todayKey])

  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    return people.filter(p => !q || p.employeeName.toLowerCase().includes(q) || (p.employeeCode || '').toLowerCase().includes(q))
  }, [people, personQuery])

  const shiftOf = (cell: CalendarCell | undefined) =>
    cell?.source === 'roster' && cell.shiftId ? shifts.find(s => s.id === cell.shiftId) : undefined

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        title="My Duty Roster"
        trail={['Attendance', 'My Duty Roster']}
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
        {data?.viewer?.isManager
          ? 'This is your duty roster and your reportees\u2019. Pick a person below — scheduling and changes are managed by HR/Admin on the Duty Roster page.'
          : 'Your personal duty roster — the shift shown here is exactly what the attendance engine applies to your punches. Scheduling and changes are managed by HR/Admin.'}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Scheduled Days" value={scheduledDays} sub={`roster-assigned in ${monthLabel}`} icon={<FiCalendar className="w-5 h-5 text-[#3A57C4]" />} bg="bg-[#3A57C4]/10" ring="ring-[#3A57C4]/20" />
        <StatCard label="Default-Shift Days" value={defaultDays} sub="no roster assignment — policy default" icon={<FiClock className="w-5 h-5 text-[#6C4FD6]" />} bg="bg-[#6C4FD6]/10" ring="ring-[#6C4FD6]/20" />
        <StatCard label="People Visible" value={people.length} sub={data?.viewer?.isManager ? 'you + your reportees' : 'your own roster'} icon={<FiUsers className="w-5 h-5 text-[#FF9B44]" />} bg="bg-[#FF9B44]/15" ring="ring-[#FF9B44]/25" />
        <StatCard label="Shifts Defined" value={shifts.length} sub={`${shifts.filter(s => s.status === 'active').length} active`} icon={<FiSettings className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" ring="ring-emerald-100" />
      </div>

      {/* Person selector (manager: own + reportees; employee: self only) */}
      <Panel
        title={data?.viewer?.isManager || data?.viewer?.isAdmin ? 'Choose Person' : 'Viewing'}
        icon={<FiUsers className="w-4 h-4" />}
      >
        {people.length === 0 && !loading ? (
          <p className="text-sm text-slate-400 py-2">No roster visibility — your account has no employee profile linked.</p>
        ) : people.length <= 8 ? (
          <div className="flex flex-wrap gap-2">
            {people.map(p => (
              <button
                key={p.employeeId}
                onClick={() => setSelectedId(p.employeeId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedId === p.employeeId
                  ? 'bg-[#3A57C4] text-white border-[#3A57C4]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#3A57C4]/40'}`}
                title={p.relationship === 'self' ? 'Your own roster' : `${p.employeeName}'s roster (your reportee)`}
              >
                {p.relationship === 'self' ? '★ ' : ''}{p.employeeName}
                {p.employeeCode ? <span className="ml-1.5 font-normal opacity-70">{p.employeeCode}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="relative mb-2 max-w-sm">
              <FiSearch className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={personQuery}
                onChange={e => setPersonQuery(e.target.value)}
                placeholder="Search people..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4]"
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {filteredPeople.map(p => (
                <button
                  key={p.employeeId}
                  onClick={() => setSelectedId(p.employeeId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedId === p.employeeId
                    ? 'bg-[#3A57C4] text-white border-[#3A57C4]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#3A57C4]/40'}`}
                  title={p.relationship === 'self' ? 'Your own roster' : `${p.employeeName}'s roster (your reportee)`}
                >
                  {p.relationship === 'self' ? '★ ' : ''}{p.employeeName}
                  {p.employeeCode ? <span className="ml-1.5 font-normal opacity-70">{p.employeeCode}</span> : null}
                </button>
              ))}
              {filteredPeople.length === 0 && <p className="text-xs text-slate-400 py-2">No people match.</p>}
            </div>
          </div>
        )}
      </Panel>

      {/* This-week strip */}
      {selectedRow ? (
        <Panel title={`This Week — ${selectedRow.employeeName}`} icon={<FiCalendar className="w-4 h-4" />}>
          <div className="grid grid-cols-7 gap-2">
            {weekStrip.map(d => {
              const cell = selectedRow.days[d.key]
              const sh = shiftOf(cell)
              return (
                <div key={d.key} className={`rounded-xl border p-2.5 text-center ${d.key === todayKey ? 'ring-2 ring-[#3A57C4]/40 border-[#3A57C4]/30' : 'border-slate-100'} ${d.dow === 0 || d.dow === 6 ? 'bg-slate-50/70' : 'bg-white'}`}>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">{DOW_LETTER[d.dow]}</p>
                  <p className="text-sm font-bold text-slate-700 leading-tight">{d.num}</p>
                  <span className={`mt-1.5 inline-block w-full px-1 py-1 rounded-md border text-[10px] font-semibold truncate ${sh ? chipColor(sh.id) : 'bg-slate-100 text-slate-400 border-slate-200'}`} title={sh ? `${sh.name} ${fmtTime(sh.startTime)}–${fmtTime(sh.endTime)}` : 'Company default shift'}>
                    {sh ? (sh.code || sh.name) : 'Default'}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}

      {/* Month calendar */}
      <Panel
        title={`Calendar — ${monthLabel}${selectedRow ? ` — ${selectedRow.employeeName}` : ''}`}
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
        ) : !selectedRow ? (
          <div className="text-center py-10 text-sm text-slate-400">No person selected.</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-max w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 min-w-[190px]">
                      <span className="block text-sm font-medium text-slate-700 leading-tight truncate max-w-[180px]" title={selectedRow.employeeName}>{selectedRow.employeeName}</span>
                      <span className="block text-[10px] text-slate-400 font-normal normal-case">{selectedRow.employeeCode}{selectedRow.relationship === 'self' ? ' — you' : ' — your reportee'}</span>
                    </th>
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
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-400">Shift per day</td>
                    {days.map(d => {
                      const cell = selectedRow.days[d.key]
                      const sh = shiftOf(cell)
                      return (
                        <td key={d.key} className={`border-b border-l border-slate-100 p-0.5 ${d.dow === 0 || d.dow === 6 ? 'bg-slate-50/70' : ''} ${d.key === todayKey ? 'ring-1 ring-inset ring-[#3A57C4]/30' : ''}`}>
                          <div
                            className={`w-full h-7 px-1 rounded-md border text-[10px] font-semibold truncate flex items-center justify-center ${sh ? chipColor(sh.id) : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                            title={sh
                              ? `${sh.name} — ${fmtTime(sh.startTime)}–${fmtTime(sh.endTime)} (duty roster)`
                              : 'Company default shift — no duty-roster assignment for this day'}
                          >
                            {sh ? (sh.code || sh.name || 'Shift') : 'Default'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
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
            <p className="text-[11px] text-slate-400 mt-2">
              Read-only — this mirrors exactly what HR/Admin scheduled. Weekend columns are tinted; today is outlined. Need a change? Raise it with HR/Admin on the Duty Roster page.
            </p>
          </>
        )}
      </Panel>
    </div>
  )
}
