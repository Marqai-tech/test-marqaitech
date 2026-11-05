'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { FiDownload, FiCalendar, FiUsers, FiClock, FiBarChart2, FiFileText, FiGrid, FiRefreshCw, FiUserX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyData } from '@/components/company/useCompanyData';

/* ────────────────────────────── helpers ────────────────────────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function fmtTimeCell(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2024, i).toLocaleString('default', { month: 'long' }),
}));

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', late: 'Late', absent: 'Absent', on_leave: 'On Leave',
  wfh: 'WFH', half_day: 'Half Day', holiday: 'Holiday', weekend: 'Weekend',
};

const STATUS_COLOR: Record<string, string> = {
  present: 'text-emerald-600 bg-emerald-50',
  late: 'text-amber-600 bg-amber-50',
  absent: 'text-red-500 bg-red-50',
  on_leave: 'text-blue-600 bg-blue-50',
  wfh: 'text-teal-600 bg-teal-50',
  half_day: 'text-orange-600 bg-orange-50',
};

type ReportType = 'daily-summary' | 'monthly-attendance' | 'late-arrivals' | 'absenteeism-trends';

const REPORTS: { key: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'daily-summary', label: 'Daily Summary', icon: <FiCalendar className="w-5 h-5" />, desc: 'Day-wise attendance overview' },
  { key: 'monthly-attendance', label: 'Monthly Attendance', icon: <FiUsers className="w-5 h-5" />, desc: 'Monthly trends & per-employee summary' },
  { key: 'late-arrivals', label: 'Late Arrivals', icon: <FiClock className="w-5 h-5" />, desc: 'Late check-in patterns' },
  { key: 'absenteeism-trends', label: 'Absenteeism Trends', icon: <FiBarChart2 className="w-5 h-5" />, desc: 'Absenteeism rate analysis' },
];

/* API shapes (from /api/reports?type=attendance_report) */
interface ByDateBucket { present: number; late: number; absent: number; leave: number; wfh: number; other: number }
interface DeptBucket { present: number; late: number; absent: number; leave: number; wfh: number; total: number }
interface AttRecord {
  employeeCode: string; name: string; department: string; designation: string;
  date: string; status: string; checkIn: string | null; checkOut: string | null;
  workHours: number | null; overtime: number | null;
}
interface AttendanceReportData {
  month: number; year: number; daysInMonth: number;
  attendanceRate: number; lateArrivals: number; totalOvertime: number; totalWorkHours: number;
  byStatus: Record<string, number>;
  byDate: Record<string, ByDateBucket>;
  byDepartment: Record<string, DeptBucket>;
  records: AttRecord[];
  total: number;
  dataScope: string;
}

interface DeptOption { id: string; name: string }

/* ────────────────────────────── component ────────────────────────────── */

export default function AttendanceReportsPage() {
  const { selectedCompanyId } = useCompanyData();
  const [activeReport, setActiveReport] = useState<ReportType>('daily-summary');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<AttendanceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  /* department options */
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  useEffect(() => {
    fetch('/api/departments?limit=100', { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : { departments: [] }))
      .then(d => setDepartments(d.departments || d.data || []))
      .catch(() => setDepartments([]));
  }, []);

  /* fetch report data */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type: 'attendance_report',
        month: String(month),
        year: String(year),
      });
      if (selectedCompanyId) params.set('companyId', selectedCompanyId);
      if (departmentId) params.set('departmentId', departmentId);
      const res = await fetch(`/api/reports?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [month, year, departmentId, selectedCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodLabel = `${MONTHS[month - 1]?.label || ''} ${year}`;

  /* ── derived datasets ── */
  const dailyRows = useMemo(() => {
    if (!data?.byDate) return [];
    return Object.entries(data.byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({ date, ...b }));
  }, [data]);

  const lateRecords = useMemo(
    () => (data?.records || []).filter(r => r.status === 'late'),
    [data],
  );

  const absenceRecords = useMemo(
    () => (data?.records || []).filter(r => r.status === 'absent' || r.status === 'on_leave'),
    [data],
  );

  const perEmployee = useMemo(() => {
    const map = new Map<string, {
      code: string; name: string; department: string; designation: string;
      present: number; late: number; absent: number; leave: number; wfh: number; halfDay: number;
      hours: number; overtime: number; days: number;
    }>();
    (data?.records || []).forEach(r => {
      const key = r.employeeCode + '|' + r.name;
      const e = map.get(key) || {
        code: r.employeeCode, name: r.name, department: r.department, designation: r.designation,
        present: 0, late: 0, absent: 0, leave: 0, wfh: 0, halfDay: 0, hours: 0, overtime: 0, days: 0,
      };
      if (r.status === 'present') e.present++;
      else if (r.status === 'late') e.late++;
      else if (r.status === 'absent') e.absent++;
      else if (r.status === 'on_leave') e.leave++;
      else if (r.status === 'wfh') e.wfh++;
      else if (r.status === 'half_day') e.halfDay++;
      e.days++;
      e.hours += r.workHours || 0;
      e.overtime += r.overtime || 0;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.days - a.days);
  }, [data]);

  const deptRows = useMemo(() => {
    if (!data?.byDepartment) return [];
    return Object.entries(data.byDepartment)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, b]) => ({ name, ...b }));
  }, [data]);

  /* absenteeism rate per working day */
  const absenceTrend = useMemo(() => {
    return dailyRows.map(d => {
      const total = d.present + d.late + d.absent + d.leave + d.wfh + d.other;
      const absentPct = total > 0 ? Math.round(((d.absent + d.leave) / total) * 1000) / 10 : 0;
      return { ...d, total, absentPct };
    });
  }, [dailyRows]);

  const absenteeismRate = useMemo(() => {
    const total = data?.total || 0;
    const absentish = (data?.byStatus?.absent || 0) + (data?.byStatus?.on_leave || 0);
    return total > 0 ? Math.round((absentish / total) * 1000) / 10 : 0;
  }, [data]);

  /* ── export ── */
  const exportViaAPI = async (
    format: 'pdf' | 'excel' | 'csv',
    payload: { title: string; summary?: Record<string, unknown>; rows: Record<string, unknown>[]; filename: string },
  ) => {
    const key = `${payload.filename}_${format}`;
    setExportingKey(key);
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reportType: 'custom', format,
          title: payload.title, summary: payload.summary,
          filename: payload.filename, data: payload.rows,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.filename}.${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingKey(null);
    }
  };

  const exportButtons = (payload: { title: string; summary?: Record<string, unknown>; rows: Record<string, unknown>[]; filename: string }) => (
    <div className="flex items-center gap-2 flex-wrap">
      {(['pdf', 'excel', 'csv'] as const).map(fmt => {
        const key = `${payload.filename}_${fmt}`;
        const label = fmt === 'pdf' ? 'PDF' : fmt === 'excel' ? 'Excel' : 'CSV';
        const Icon = fmt === 'pdf' ? FiFileText : fmt === 'excel' ? FiGrid : FiDownload;
        return (
          <button
            key={fmt}
            onClick={() => exportViaAPI(fmt, payload)}
            disabled={exportingKey === key}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary transition-colors disabled:opacity-50"
          >
            {exportingKey === key ? <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-300 border-t-green-500 rounded-full" /> : <Icon className="w-4 h-4" />}
            {exportingKey === key ? 'Exporting…' : `Export ${label}`}
          </button>
        );
      })}
    </div>
  );

  const summaryPayload = {
    'Attendance Rate': `${data?.attendanceRate ?? 0}%`,
    'Total Records': data?.total ?? 0,
    'Present': data?.byStatus?.present || 0,
    'Late Arrivals': data?.lateArrivals || 0,
    'Absent': data?.byStatus?.absent || 0,
    'On Leave': data?.byStatus?.on_leave || 0,
    'WFH': data?.byStatus?.wfh || 0,
    'Half Day': data?.byStatus?.half_day || 0,
    'Total Work Hours': data?.totalWorkHours ?? 0,
    'Total Overtime Hours': data?.totalOvertime ?? 0,
  };

  /* ── empty / loading / error states ── */
  const renderState = () => {
    if (loading) {
      return (
        <div className="thb-card p-12 text-center">
          <span className="animate-spin inline-block h-8 w-8 border-4 border-slate-200 border-t-green-500 rounded-full mb-3" />
          <p className="text-sm text-thb-text-secondary">Loading {periodLabel} attendance data…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="thb-card p-12 text-center">
          <FiUserX className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-thb-text-primary">Could not load report</h3>
          <p className="text-sm text-thb-text-muted mt-2">{error}</p>
          <button onClick={fetchData} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium">
            <FiRefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    return null;
  };

  const EmptyRecords = ({ what }: { what: string }) => (
    <div className="p-10 text-center">
      <FiCalendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <h3 className="text-md font-semibold text-thb-text-primary">No {what} found</h3>
      <p className="text-sm text-thb-text-muted mt-1">There is no attendance data for {periodLabel}. Try another month or clear filters.</p>
    </div>
  );

  /* ══════════════════════════ render ══════════════════════════ */
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Attendance Reports</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Generate and export attendance-related reports</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 border border-thb-border rounded-lg text-sm bg-white text-thb-text-primary"
          >
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-thb-border rounded-lg text-sm bg-white text-thb-text-primary"
          >
            {[year + 1, year, year - 1, year - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={departmentId}
            onChange={e => setDepartmentId(e.target.value)}
            className="px-3 py-2 border border-thb-border rounded-lg text-sm bg-white text-thb-text-primary max-w-[200px]"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* report type cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            className={`thb-card p-4 text-left hover:shadow-md transition-all ${activeReport === r.key ? 'ring-2 ring-green-500 shadow-md' : ''}`}
          >
            <div className={`p-2 rounded-lg inline-flex ${activeReport === r.key ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'} mb-2`}>{r.icon}</div>
            <p className="text-sm font-semibold text-thb-text-primary">{r.label}</p>
            <p className="text-xs text-thb-text-muted mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>

      {renderState()}

      {!loading && !error && data && (
        <div className="space-y-4">
          {/* KPI strip — shared across all report tabs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Attendance Rate</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{data.attendanceRate}%</p>
            </div>
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Records</p>
              <p className="text-2xl font-bold text-thb-text-primary mt-1">{data.total}</p>
            </div>
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Present</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{(data.byStatus?.present || 0) + (data.byStatus?.late || 0) + (data.byStatus?.wfh || 0) + (data.byStatus?.half_day || 0)}</p>
            </div>
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Late</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{data.lateArrivals}</p>
            </div>
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Absent</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{data.byStatus?.absent || 0}</p>
            </div>
            <div className="thb-card p-4">
              <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">On Leave</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{data.byStatus?.on_leave || 0}</p>
            </div>
          </div>

          {/* ══════ DAILY SUMMARY ══════ */}
          {activeReport === 'daily-summary' && (
            <div className="thb-card overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-thb-text-primary">Daily Attendance Summary</h3>
                  <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · {dailyRows.length} day(s) with records</p>
                </div>
                {dailyRows.length > 0 && exportButtons({
                  title: `Daily Attendance Summary — ${periodLabel}`,
                  summary: summaryPayload,
                  filename: `daily_attendance_summary_${year}_${month}`,
                  rows: dailyRows.map(d => ({
                    'Date': fmtDate(d.date), 'Present': d.present, 'Late': d.late, 'Absent': d.absent,
                    'On Leave': d.leave, 'WFH': d.wfh, 'Other': d.other, 'Total': d.present + d.late + d.absent + d.leave + d.wfh + d.other,
                  })),
                })}
              </div>
              {dailyRows.length === 0 ? <EmptyRecords what="daily attendance" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Present</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Late</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Absent</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">On Leave</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">WFH</th>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary w-48">Distribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRows.map(d => {
                        const total = d.present + d.late + d.absent + d.leave + d.wfh + d.other || 1;
                        return (
                          <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-2.5 px-4 font-medium text-thb-text-primary whitespace-nowrap">{fmtDate(d.date)}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{d.present}</td>
                            <td className="py-2.5 px-4 text-right text-amber-600 font-medium">{d.late}</td>
                            <td className="py-2.5 px-4 text-right text-red-500 font-medium">{d.absent}</td>
                            <td className="py-2.5 px-4 text-right text-blue-600 font-medium">{d.leave}</td>
                            <td className="py-2.5 px-4 text-right text-teal-600 font-medium">{d.wfh}</td>
                            <td className="py-2.5 px-4">
                              <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100">
                                <div className="bg-emerald-500" style={{ width: `${(d.present / total) * 100}%` }} />
                                <div className="bg-amber-500" style={{ width: `${(d.late / total) * 100}%` }} />
                                <div className="bg-red-400" style={{ width: `${(d.absent / total) * 100}%` }} />
                                <div className="bg-blue-400" style={{ width: `${(d.leave / total) * 100}%` }} />
                                <div className="bg-teal-400" style={{ width: `${(d.wfh / total) * 100}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════ MONTHLY ATTENDANCE ══════ */}
          {activeReport === 'monthly-attendance' && (
            <>
              <div className="thb-card overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-thb-text-primary">Department Overview</h3>
                    <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · work hours {data.totalWorkHours} · overtime {data.totalOvertime}</p>
                  </div>
                  {deptRows.length > 0 && exportButtons({
                    title: `Monthly Attendance — Department Overview (${periodLabel})`,
                    summary: summaryPayload,
                    filename: `monthly_attendance_departments_${year}_${month}`,
                    rows: deptRows.map(d => ({
                      'Department': d.name, 'Total Records': d.total, 'Present': d.present, 'Late': d.late,
                      'Absent': d.absent, 'On Leave': d.leave, 'WFH': d.wfh,
                      'Attendance %': d.total > 0 ? Math.round((((d.present + d.late + d.wfh) / d.total) * 1000) / 10) : 0,
                    })),
                  })}
                </div>
                {deptRows.length === 0 ? <EmptyRecords what="department data" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Records</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Present</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Late</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Absent</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Leave</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">WFH</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptRows.map(d => {
                          const rate = d.total > 0 ? Math.round((((d.present + d.late + d.wfh) / d.total) * 1000) / 10) : 0;
                          return (
                            <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <td className="py-2.5 px-4 font-medium text-thb-text-primary">{d.name}</td>
                              <td className="py-2.5 px-4 text-right text-thb-text-secondary">{d.total}</td>
                              <td className="py-2.5 px-4 text-right text-emerald-600">{d.present}</td>
                              <td className="py-2.5 px-4 text-right text-amber-600">{d.late}</td>
                              <td className="py-2.5 px-4 text-right text-red-500">{d.absent}</td>
                              <td className="py-2.5 px-4 text-right text-blue-600">{d.leave}</td>
                              <td className="py-2.5 px-4 text-right text-teal-600">{d.wfh}</td>
                              <td className="py-2.5 px-4 text-right font-semibold text-thb-text-primary">{rate}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="thb-card overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-thb-text-primary">Per-Employee Summary</h3>
                    <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · {perEmployee.length} employee(s)</p>
                  </div>
                  {perEmployee.length > 0 && exportButtons({
                    title: `Monthly Attendance — Per-Employee Summary (${periodLabel})`,
                    summary: summaryPayload,
                    filename: `monthly_attendance_employees_${year}_${month}`,
                    rows: perEmployee.map(e => ({
                      'Employee ID': e.code, 'Name': e.name, 'Department': e.department, 'Designation': e.designation,
                      'Days Recorded': e.days, 'Present': e.present, 'Late': e.late, 'Absent': e.absent,
                      'On Leave': e.leave, 'WFH': e.wfh, 'Half Day': e.halfDay,
                      'Work Hours': Math.round(e.hours * 10) / 10, 'Overtime Hours': Math.round(e.overtime * 10) / 10,
                    })),
                  })}
                </div>
                {perEmployee.length === 0 ? <EmptyRecords what="employee data" /> : (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Present</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Late</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Absent</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Leave</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">WFH</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Hours</th>
                          <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">OT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perEmployee.map(e => (
                          <tr key={e.code + e.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-2.5 px-4">
                              <p className="font-medium text-thb-text-primary">{e.name}</p>
                              <p className="text-xs text-thb-text-muted">{e.code} · {e.designation}</p>
                            </td>
                            <td className="py-2.5 px-4 text-thb-text-secondary">{e.department}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-600">{e.present}</td>
                            <td className="py-2.5 px-4 text-right text-amber-600">{e.late}</td>
                            <td className="py-2.5 px-4 text-right text-red-500">{e.absent}</td>
                            <td className="py-2.5 px-4 text-right text-blue-600">{e.leave}</td>
                            <td className="py-2.5 px-4 text-right text-teal-600">{e.wfh}</td>
                            <td className="py-2.5 px-4 text-right text-thb-text-primary font-medium">{Math.round(e.hours * 10) / 10}</td>
                            <td className="py-2.5 px-4 text-right text-thb-text-secondary">{Math.round(e.overtime * 10) / 10}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════ LATE ARRIVALS ══════ */}
          {activeReport === 'late-arrivals' && (
            <div className="thb-card overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-thb-text-primary">Late Arrivals</h3>
                  <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · {lateRecords.length} late check-in(s)</p>
                </div>
                {lateRecords.length > 0 && exportButtons({
                  title: `Late Arrivals Report — ${periodLabel}`,
                  summary: summaryPayload,
                  filename: `late_arrivals_${year}_${month}`,
                  rows: lateRecords.map(r => ({
                    'Employee ID': r.employeeCode, 'Name': r.name, 'Department': r.department, 'Designation': r.designation,
                    'Date': fmtDate(r.date), 'Check-In': fmtTimeCell(r.checkIn), 'Check-Out': fmtTimeCell(r.checkOut),
                    'Work Hours': r.workHours ?? '—', 'Status': STATUS_LABEL[r.status] || r.status,
                  })),
                })}
              </div>
              {lateRecords.length === 0 ? <EmptyRecords what="late arrivals" /> : (
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Check-In</th>
                        <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Check-Out</th>
                        <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Work Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lateRecords.map((r, i) => (
                        <tr key={`${r.employeeCode}_${r.date}_${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2.5 px-4">
                            <p className="font-medium text-thb-text-primary">{r.name}</p>
                            <p className="text-xs text-thb-text-muted">{r.employeeCode}</p>
                          </td>
                          <td className="py-2.5 px-4 text-thb-text-secondary">{r.department}</td>
                          <td className="py-2.5 px-4 text-thb-text-primary whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-2.5 px-4 text-amber-600 font-medium">{fmtTimeCell(r.checkIn)}</td>
                          <td className="py-2.5 px-4 text-thb-text-secondary">{fmtTimeCell(r.checkOut)}</td>
                          <td className="py-2.5 px-4 text-right text-thb-text-secondary">{r.workHours ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════ ABSENTEEISM TRENDS ══════ */}
          {activeReport === 'absenteeism-trends' && (
            <>
              <div className="thb-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-thb-text-primary">Absenteeism Rate</h3>
                    <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · absent + on-leave ÷ total records</p>
                  </div>
                  <p className={`text-3xl font-bold ${absenteeismRate > 10 ? 'text-red-500' : absenteeismRate > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>{absenteeismRate}%</p>
                </div>
                <div className="mt-4 flex items-end gap-1 h-32">
                  {absenceTrend.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center group relative min-w-[6px]" title={`${fmtDate(d.date)}: ${d.absent} absent, ${d.leave} on leave`}>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-red-400 to-red-300 hover:from-red-500 hover:to-red-400 transition-all"
                        style={{ height: `${Math.max((d.absentPct / 100) * 100, 2)}%` }}
                      />
                      <span className="text-[9px] text-thb-text-muted mt-1">{d.date.split('-')[2]}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-thb-text-muted mt-2 text-center">Day-of-month bars show % of records absent or on leave</p>
              </div>

              <div className="thb-card overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-thb-text-primary">Absent & On-Leave Records</h3>
                    <p className="text-sm text-thb-text-muted mt-0.5">{periodLabel} · {absenceRecords.length} record(s)</p>
                  </div>
                  {absenceRecords.length > 0 && exportButtons({
                    title: `Absenteeism Report — ${periodLabel}`,
                    summary: { ...summaryPayload, 'Absenteeism Rate': `${absenteeismRate}%` },
                    filename: `absenteeism_${year}_${month}`,
                    rows: absenceRecords.map(r => ({
                      'Employee ID': r.employeeCode, 'Name': r.name, 'Department': r.department, 'Designation': r.designation,
                      'Date': fmtDate(r.date), 'Status': STATUS_LABEL[r.status] || r.status,
                    })),
                  })}
                </div>
                {absenceRecords.length === 0 ? <EmptyRecords what="absence records" /> : (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date</th>
                          <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceRecords.map((r, i) => (
                          <tr key={`${r.employeeCode}_${r.date}_${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-2.5 px-4">
                              <p className="font-medium text-thb-text-primary">{r.name}</p>
                              <p className="text-xs text-thb-text-muted">{r.employeeCode}</p>
                            </td>
                            <td className="py-2.5 px-4 text-thb-text-secondary">{r.department}</td>
                            <td className="py-2.5 px-4 text-thb-text-primary whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="py-2.5 px-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-600'}`}>
                                {STATUS_LABEL[r.status] || r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* data scope footer */}
          <p className="text-xs text-thb-text-muted text-center">
            Data scope: {data.dataScope === 'all' ? 'Organization-wide' : data.dataScope === 'team' ? 'Your department/team' : 'Your own records'} · {data.total} record(s) for {periodLabel}
          </p>
        </div>
      )}
    </div>
  );
}
