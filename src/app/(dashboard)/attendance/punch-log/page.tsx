'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FiList, FiRefreshCw, FiMapPin, FiClock, FiCoffee, FiLogIn, FiLogOut,
  FiUser, FiFilter, FiDownload, FiCalendar, FiMap,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';
import { reverseGeocode } from '@/lib/reverse-geocode';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(ds?: string | null): string {
  if (!ds) return '—';
  const d = new Date(`${ds}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ds;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Hook that reverse-geocodes any GPS coordinates missing a stored label.
 * Returns a map of eventId → area name. Fetches in the background; the
 * component re-renders when each geocode resolves so the user sees the
 * area name appear progressively (without blocking the table render).
 */
function useGeocodedLabels(events: PunchEvent[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const pending = events.filter(e => e.gps && e.gps.lat && e.gps.lng && !e.gps.label);
    if (pending.length === 0) return;
    // Sequentially geocode (BigDataCloud allows parallel but we keep it
    // gentle — avoids a thundering herd of network requests on big lists).
    (async () => {
      for (const e of pending) {
        if (cancelled) break;
        if (!e.gps) continue;
        const label = await reverseGeocode(e.gps.lat, e.gps.lng);
        if (label && !cancelled) {
          setLabels(prev => ({ ...prev, [e.id]: label }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [events]);
  return labels;
}

interface PunchEvent {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  type: 'checkin' | 'checkout' | 'breakin' | 'breakout' | string;
  date: string | null;
  timestamp: string | null;
  gps: { lat: number; lng: number; accuracy?: number; label?: string } | null;
  method: string | null;
  notes: string | null;
}

interface DaySummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  breakIn: string | null;
  breakOut: string | null;
  breakMinutes: number;
  workHours: number;
  overtime: number;
  status: string;
  location: string | null;
  // Task 59: per-action GPS so the client can reverse-geocode on render
  checkInGps?: { lat: number; lng: number; label: string | null } | null;
  checkOutGps?: { lat: number; lng: number; label: string | null } | null;
}

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  checkin:  { label: 'Check In',  icon: <FiLogIn className="w-3.5 h-3.5" />,  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  checkout: { label: 'Check Out', icon: <FiLogOut className="w-3.5 h-3.5" />,  color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200' },
  breakin:  { label: 'Break In',  icon: <FiCoffee className="w-3.5 h-3.5" />, color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  breakout: { label: 'Break Out', icon: <FiCoffee className="w-3.5 h-3.5" />, color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200' },
};

export default function PunchLogPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');

  const [events, setEvents] = useState<PunchEvent[]>([]);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [summary, setSummary] = useState({ totalEvents: 0, totalDays: 0, totalWorkHours: 0, totalBreakMinutes: 0, totalOvertime: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'events' | 'daily'>('events');

  // Filters
  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86400000);
  const [fromDate, setFromDate] = useState(thirtyAgo.toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate, limit: '1000' });
      const res = await fetch(`/api/attendance/punch-log?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setEvents(j.events || []);
      setDays(j.days || []);
      setSummary(j.summary || { totalEvents: 0, totalDays: 0, totalWorkHours: 0, totalBreakMinutes: 0, totalOvertime: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load punch log');
      setEvents([]); setDays([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter events by selected day
  const [selectedDate, setSelectedDate] = useState<string>('');
  const filteredEvents = useMemo(() => {
    if (!selectedDate) return events;
    return events.filter(e => e.date === selectedDate);
  }, [events, selectedDate]);

  // Task 59: reverse-geocode any events that have GPS coords but no stored label
  // (e.g. punches captured before the area-name fix landed). Returns a map of
  // eventId → area name; the table re-renders progressively as labels resolve.
  const geocodedLabels = useGeocodedLabels(filteredEvents);

  /** Detect if a stored location string is raw "lat,lng" coords (from old
   *  punches captured before the area-name fix). If so, we prefer the
   *  reverse-geocoded label from the per-action GPS instead. */
  const looksLikeRawCoords = (s: string | null | undefined): boolean => {
    if (!s) return false;
    // "12.345678,89.012345" or "12.345678, 89.012345"
    return /^-?\d+\.\d{3,},?\s*-?\d+\.\d{3,}$/.test(s.trim());
  };

  /** For the Daily Summary view, find the best display label for a day's
   *  location. Priority: stored label > reverse-geocoded label > raw coords. */
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    // For each day row that has raw GPS but no usable location string,
    // reverse-geocode the check-in GPS (most reliable per-day location).
    (async () => {
      for (const d of days) {
        if (cancelled) break;
        const hasUsableLocation = d.location && !looksLikeRawCoords(d.location);
        if (hasUsableLocation) continue;
        const gps = d.checkInGps || d.checkOutGps;
        if (!gps || !gps.lat || !gps.lng) continue;
        if (gps.label) {
          setDayLabels(prev => ({ ...prev, [d.employeeId + '|' + d.date]: gps.label! }));
          continue;
        }
        const label = await reverseGeocode(gps.lat, gps.lng);
        if (label && !cancelled) {
          setDayLabels(prev => ({ ...prev, [d.employeeId + '|' + d.date]: label }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const fmtHours = (h: number) => {
    const total = Math.round(h * 60);
    const hr = Math.floor(total / 60);
    const min = total % 60;
    return `${hr}h ${min}m`;
  };

  const exportCSV = () => {
    const rows = view === 'events' ? filteredEvents : days;
    if (rows.length === 0) { toast.error('Nothing to export'); return; }
    let csv = '';
    if (view === 'events') {
      csv = 'Employee Code,Employee Name,Department,Date,Time,Event Type,Method,GPS Lat,GPS Lng,GPS Accuracy,GPS Label,Notes\n';
      for (const e of filteredEvents) {
        csv += `"${e.employeeCode}","${e.employeeName}","${e.department}","${e.date || ''}","${fmtTime(e.timestamp)}","${e.type}","${e.method || ''}","${e.gps?.lat ?? ''}","${e.gps?.lng ?? ''}","${e.gps?.accuracy ?? ''}","${e.gps?.label ?? ''}","${(e.notes || '').replace(/"/g, '""')}"\n`;
      }
    } else {
      csv = 'Employee Code,Employee Name,Department,Date,Check In,Check Out,Break In,Break Out,Break Minutes,Work Hours,Overtime,Status,Location\n';
      for (const d of days) {
        csv += `"${d.employeeCode}","${d.employeeName}","${d.department}","${d.date}","${fmtTime(d.checkIn)}","${fmtTime(d.checkOut)}","${fmtTime(d.breakIn)}","${fmtTime(d.breakOut)}","${d.breakMinutes}","${d.workHours}","${d.overtime}","${d.status}","${d.location || ''}"\n`;
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `punch_log_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <FiList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Punch Activity Log</h1>
            <p className="text-sm text-thb-text-secondary">Every check-in / check-out / break-in / break-out with GPS coordinates + hours summary</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiDownload className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="thb-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <FiCalendar className="w-4 h-4 text-thb-text-muted" />
          <label className="text-xs font-medium text-thb-text-secondary">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white" />
        </div>
        <div className="flex items-center gap-1.5">
          <FiCalendar className="w-4 h-4 text-thb-text-muted" />
          <label className="text-xs font-medium text-thb-text-secondary">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white" />
        </div>
        <div className="ml-auto flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button onClick={() => setView('events')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'events' ? 'bg-white text-thb-text-primary shadow-sm' : 'text-thb-text-secondary hover:text-thb-text-primary'}`}>
            <FiList className="w-3.5 h-3.5 inline mr-1" />Event Log
          </button>
          <button onClick={() => setView('daily')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'daily' ? 'bg-white text-thb-text-primary shadow-sm' : 'text-thb-text-secondary hover:text-thb-text-primary'}`}>
            <FiClock className="w-3.5 h-3.5 inline mr-1" />Daily Summary
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Total Events</p>
          <p className="text-2xl font-bold text-thb-text-primary mt-1">{summary.totalEvents}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Total Days</p>
          <p className="text-2xl font-bold text-thb-text-primary mt-1">{summary.totalDays}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Work Hours</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtHours(summary.totalWorkHours)}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Break Time</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmtHours(summary.totalBreakMinutes / 60)}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Overtime</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{fmtHours(summary.totalOvertime)}</p>
        </div>
      </div>

      {loading ? (
        <div className="thb-card p-12 text-center">
          <div className="animate-spin inline-block h-8 w-8 border-4 border-slate-200 border-t-teal-500 rounded-full mb-3" />
          <p className="text-sm text-thb-text-secondary">Loading punch log…</p>
        </div>
      ) : view === 'events' ? (
        /* ─── Event Log View ─── */
        <div className="thb-card overflow-hidden">
          <div className="p-4 border-b border-thb-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-thb-text-primary">Event Log ({filteredEvents.length})</h3>
            {selectedDate && (
              <button onClick={() => setSelectedDate('')} className="text-xs text-teal-600 hover:underline">Clear date filter: {selectedDate}</button>
            )}
          </div>
          {filteredEvents.length === 0 ? (
            <div className="p-10 text-center">
              <FiList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-thb-text-muted">No punch events found in the selected date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Time</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Event</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Method</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">GPS Location</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map(e => {
                    const meta = EVENT_META[e.type] || { label: e.type, icon: <FiClock className="w-3.5 h-3.5" />, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' };
                    return (
                      <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 px-4">
                          <p className="font-medium text-thb-text-primary">{e.employeeName}</p>
                          <p className="text-xs text-thb-text-muted">{e.employeeCode} · {e.department}</p>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-thb-text-primary">{fmtDate(e.date)}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-thb-text-primary font-mono">{fmtTime(e.timestamp)}</td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color}`}>
                            {meta.icon} {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-thb-text-secondary capitalize">{e.method || '—'}</td>
                        <td className="py-2.5 px-4">
                          {e.gps ? (
                            (() => {
                              // Use the stored label if present, else the on-the-fly
                              // reverse-geocoded label from the geocodedLabels map.
                              // Fallback to the raw coordinates only if both are missing.
                              const areaName = e.gps.label || geocodedLabels[e.id] || '';
                              return (
                                <div className="flex items-start gap-1.5 text-xs">
                                  <FiMapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5" />
                                  <div>
                                    {areaName ? (
                                      <p className="text-thb-text-primary font-medium">{areaName}</p>
                                    ) : (
                                      <p className="text-thb-text-muted italic">Resolving area…</p>
                                    )}
                                    <p className="text-thb-text-muted text-[10px] font-mono">
                                      {e.gps.lat.toFixed(5)}, {e.gps.lng.toFixed(5)}
                                      {e.gps.accuracy != null && ` · ±${e.gps.accuracy.toFixed(0)}m`}
                                    </p>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-thb-text-muted">No GPS</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ─── Daily Summary View ─── */
        <div className="thb-card overflow-hidden">
          <div className="p-4 border-b border-thb-border">
            <h3 className="text-sm font-semibold text-thb-text-primary">Daily Summary ({days.length})</h3>
          </div>
          {days.length === 0 ? (
            <div className="p-10 text-center">
              <FiClock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-thb-text-muted">No attendance data found in the selected date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Check In</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Break In</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Break Out</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Check Out</th>
                    <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Break</th>
                    <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Work Hrs</th>
                    <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">OT</th>
                    <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(d => (
                    <tr key={d.employeeId + d.date} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-thb-text-primary">{d.employeeName}</p>
                        <p className="text-xs text-thb-text-muted">{d.employeeCode} · {d.department}</p>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-thb-text-primary">{fmtDate(d.date)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-emerald-700 font-mono">{fmtTime(d.checkIn)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-amber-700 font-mono">{fmtTime(d.breakIn)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-teal-700 font-mono">{fmtTime(d.breakOut)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-rose-700 font-mono">{fmtTime(d.checkOut)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-700 font-medium">{fmtHours(d.breakMinutes / 60)}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-700 font-medium">{fmtHours(d.workHours)}</td>
                      <td className="py-2.5 px-4 text-right text-rose-700 font-medium">{d.overtime > 0 ? fmtHours(d.overtime) : '—'}</td>
                      <td className="py-2.5 px-4 text-xs text-thb-text-muted">
                        {(() => {
                          const dayKey = d.employeeId + '|' + d.date;
                          // Prefer stored location if it's NOT raw coords (i.e. it's a real area name).
                          // Otherwise use the reverse-geocoded dayLabel. If neither, show raw coords
                          // or "—" if no GPS at all.
                          const storedIsRaw = looksLikeRawCoords(d.location);
                          const areaName = (!storedIsRaw && d.location) ? d.location : (dayLabels[dayKey] || (storedIsRaw ? d.location : ''));
                          if (areaName) {
                            return (
                              <div className="flex items-start gap-1">
                                <FiMapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5" />
                                <span>{areaName}</span>
                              </div>
                            );
                          }
                          // No stored label AND we haven't geocoded yet — show "Resolving…" if we have GPS, else "—"
                          const hasGps = (d.checkInGps && d.checkInGps.lat) || (d.checkOutGps && d.checkOutGps.lat);
                          return hasGps ? (
                            <span className="text-thb-text-muted italic text-xs">Resolving area…</span>
                          ) : '—';
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModuleTips
        moduleKey="attendance-punch-log"
        title="Punch Log Tips"
        tips={[
          { title: 'GPS Accuracy', description: 'GPS coordinates are captured automatically by the browser when an employee clicks Check In / Check Out / Break In / Break Out. Accuracy ±10m is typical outdoors.' },
          { title: 'Break Minutes', description: 'Break duration is computed as (breakOut − breakIn) and subtracted from the total span to derive actual work hours.' },
          { title: 'Date Filtering', description: 'Use the From / To filters to scope the report. Default is last 30 days. CSV export preserves the current filter and view.' },
          { title: 'Two Views', description: 'Event Log shows every individual punch; Daily Summary aggregates per employee per day with totals.' },
        ]}
      />
    </div>
  );
}
