'use client';

/**
 * Capacity Planner — live availability across the HRMS.
 * Weekly grid per employee: contracted hours vs allocations (incl. soft bench
 * reservations), approved leaves and company holidays. Over-allocation alerts
 * surface where combined assignments exceed the configured threshold, with a
 * backup hand-off action for extended absences.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiCalendar, FiAlertTriangle, FiRefreshCw, FiUsers } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function isoWeeksAhead(n: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + n * 7 * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function CapacityPlannerPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(6);
  const [range, setRange] = useState(isoWeeksAhead(6));
  const [ackProjects, setAckProjects] = useState<Record<string, boolean>>({});

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=500&excludeInactive=true', { headers: getAuthHeaders() });
      if (res.ok) {
        const j = await res.json();
        setEmployees(j.employees || j.data || []);
      }
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (from: string, to: string, ids: string[]) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (ids.length > 0) params.set('employeeIds', ids.join(','));
      const res = await fetch(`/api/projects/capacity?${params}`, { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to load capacity'); return; }
      setData(j);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { load(range.from, range.to, selected); }, [range, selected.length, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEmployee = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const acknowledge = async (projectId: string, employeeId: string) => {
    const res = await fetch('/api/projects/capacity', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ action: 'acknowledge_backup', projectId, employeeId }),
    });
    if (res.ok) {
      setAckProjects((p) => ({ ...p, [`${projectId}:${employeeId}`]: true }));
      toast.success('Backup hand-off acknowledged');
    } else toast.error('Failed to acknowledge');
  };

  const allWeeks: string[] = data?.employees?.[0]?.weeks?.map((w: any) => w.weekStart) || [];
  const alertCount = data?.alerts?.length || 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FiCalendar className="text-fuchsia-600" /> Capacity Planner</h1>
          <p className="text-xs text-slate-500 mt-1">Live availability from the HRMS: allocations (incl. soft bench reservations), approved leaves, company holidays and contracted weekly hours. Prevent overloading before it happens.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={weeks} onChange={(e) => { const w = Number(e.target.value); setWeeks(w); setRange(isoWeeksAhead(w)); }} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value={4}>Next 4 weeks</option><option value={6}>Next 6 weeks</option><option value={8}>Next 8 weeks</option><option value={12}>Next 12 weeks</option>
          </select>
          <button onClick={() => load(range.from, range.to, selected)} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw /> Refresh</button>
        </div>
      </header>

      {/* employee filter */}
      <div className="border border-slate-200 rounded-xl p-3 mb-4">
        <p className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><FiUsers size={12} /> Team members {selected.length > 0 ? `(${selected.length} selected)` : '(all active)'}</p>
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {employees.map((e: any) => {
            const on = selected.includes(e.id);
            return (
              <button key={e.id} onClick={() => toggleEmployee(e.id)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'bg-white border-slate-200 text-slate-600 hover:border-fuchsia-300'}`}>
                {e.firstName} {e.lastName}
              </button>
            );
          })}
        </div>
      </div>

      {/* over-allocation alerts */}
      {alertCount > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-2"><FiAlertTriangle /> Over-allocation alerts ({alertCount})</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {data.alerts.slice(0, 12).map((a: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'}`}>{a.utilizationPct}%</span>
                <span className="text-amber-800">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* grid */}
      {loading ? (
        <div className="p-10 text-sm text-slate-400 animate-pulse text-center">Computing live availability…</div>
      ) : !data || data.employees.length === 0 ? (
        <p className="text-xs text-slate-400 py-10 text-center">No employee data for this scope.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-3 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[180px]">Employee</th>
                {allWeeks.map((w: string) => <th key={w} className="px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">wk {w.slice(5)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp: any) => (
                <tr key={emp.employeeId} className="border-b border-slate-50">
                  <td className="px-3 py-2.5 sticky left-0 bg-white">
                    <p className="font-medium text-slate-700">{emp.name}</p>
                    <p className="text-[10px] text-slate-400">{emp.designation || '—'} · {emp.weeklyHours}h/wk{emp.timezone ? ` · ${emp.timezone}` : ''}{emp.overallOverAllocatedWeeks > 0 ? ` · ${emp.overallOverAllocatedWeeks} over-allocated wk(s)` : ''}</p>
                  </td>
                  {emp.weeks.map((w: any) => {
                    const tone = w.overAllocated ? 'bg-red-50 border-red-200' : w.utilizationPct >= 80 ? 'bg-emerald-50 border-emerald-100' : w.utilizationPct >= 40 ? 'bg-sky-50 border-sky-100' : 'bg-slate-50 border-slate-100';
                    return (
                      <td key={w.weekStart} className={`px-2 py-2 border ${tone} align-top`}>
                        <p className={`text-[11px] font-bold ${w.overAllocated ? 'text-red-600' : 'text-slate-700'}`}>{w.utilizationPct}%</p>
                        <p className="text-[9px] text-slate-500">{w.allocatedHours}h{w.softReservedHours > 0 ? ` +${w.softReservedHours}h soft` : ''}</p>
                        {w.leaves.length > 0 && <p className="text-[9px] text-amber-600">🌴 {w.leaves.length} leave day range(s)</p>}
                        {w.holidays.length > 0 && <p className="text-[9px] text-sky-600">🎉 {w.holidays.length} holiday(s)</p>}
                        <div className="mt-0.5 space-y-0.5">
                          {w.allocations.slice(0, 3).map((a: any, i: number) => (
                            <p key={i} className={`text-[9px] truncate ${a.soft ? 'text-amber-500 italic' : 'text-slate-400'}`} title={`${a.projectName} — ${a.allocationPct}%`}>{a.soft ? '◦ ' : ''}{a.projectName.slice(0, 16)}</p>
                          ))}
                        </div>
                        {w.leaves.some((l: any) => l.status === 'approved') && (
                          <button
                            onClick={() => {
                              const projAlloc = w.allocations[0];
                              if (projAlloc) acknowledge(projAlloc.projectId, emp.employeeId);
                              else toast.error('No project allocation to arrange a backup for');
                            }}
                            className="mt-1 text-[9px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-100 whitespace-nowrap"
                          >
                            {ackProjects[`${w.allocations[0]?.projectId}:${emp.employeeId}`] ? '✓ backup set' : 'assign backup'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-3">Capacity includes active allocations and (configurable) soft bench reservations; approved leave and company holidays reduce scheduled hours. Threshold and backup-hand-off rules are managed in <b>Project Management → Workflow Configuration</b>.</p>
    </div>
  );
}
