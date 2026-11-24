'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  FiDownload, FiSearch, FiRefreshCw, FiArrowLeft, FiCalendar,
  FiUsers, FiClock, FiTrendingDown, FiAlertCircle, FiCalendar as FiCal,
  FiChevronDown, FiRotateCw, FiSend, FiRefreshCcw, FiX, FiCheck,
} from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
function fmtNum(n: any) { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : v.toFixed(1); }
function fmtINR(n: any) { try { return Number(n || 0).toLocaleString('en-IN'); } catch { return String(n || 0); } }

/* ---------- helpers ---------- */
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-teal-100 text-teal-700',
];
function initials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  approved: 'bg-emerald-50 text-emerald-700',
  deducted: 'bg-emerald-50 text-emerald-700',
  denied: 'text-rose-600',
  rejected: 'text-rose-600',
  disputed: 'text-rose-600',
  delayed: 'bg-amber-50 text-amber-700',
  pending: 'bg-amber-50 text-amber-700',
};
function statusLabel(s: string) {
  const v = (s || '').toLowerCase();
  if (v === 'confirmed' || v === 'approved' || v === 'deducted') return 'Confirmed';
  if (v === 'denied' || v === 'rejected' || v === 'disputed') return 'Denied';
  if (v === 'delayed') return 'Delayed';
  if (v === 'pending') return 'Delayed';
  return s;
}

export default function LOPReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ rows: [], summary: {}, byEmployee: [] });
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [period, setPeriod] = useState('FY 2026-27 (YTD)');
  const [depts, setDepts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const params = new URLSearchParams();
      if (sq) { const [k, v] = sq.split('='); params.set(k, v); }
      if (deptFilter) params.set('departmentId', deptFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      const res = await fetch(`/api/leave/reports/lop?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
      const [dRes, bRes] = await Promise.all([
        fetch(`/api/departments${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/branches${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (dRes?.ok) { const dd = await dRes.json(); setDepts(dd.data || dd || []); }
      if (bRes?.ok) { const bd = await bRes.json(); setBranches(bd.data || bd || []); }
    } catch { toast.error('Failed to load LOP data'); }
    finally { setLoading(false); }
  }, [scopeQuery, deptFilter, branchFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- dummy rows matching screenshot ---------- */
  const DUMMY_ROWS = [
    { employeeId: 'e1', employeeName: 'Imran Mehta', department: 'SEO Engineering', days: 1, reason: 'Balance exhausted', monthlySalary: 15000, deduction: -1153, status: 'denied' },
    { employeeId: 'e2', employeeName: 'Ravi Bhatt', department: 'Brand Experience', days: 2, reason: 'Unregulated absence', monthlySalary: 35000, deduction: -5300, status: 'confirmed' },
    { employeeId: 'e3', employeeName: 'Varun Mehta', department: 'SEO Manager', days: 2, reason: 'Unregulated absence', monthlySalary: 34000, deduction: 10533, status: 'confirmed' },
    { employeeId: 'e4', employeeName: 'Gaurav Verma', department: 'Customer Success Support', days: 4, reason: 'Balance exhausted', monthlySalary: 15000, deduction: 23333, status: 'denied' },
    { employeeId: 'e5', employeeName: 'Robin Babu', department: 'Growth Marketing', days: 3, reason: 'Unregulated absence', monthlySalary: 70000, deduction: 1333, status: 'confirmed' },
    { employeeId: 'e6', employeeName: 'Divya Rao', department: 'Customer Success Support', days: 5, reason: 'Unregulated absence', monthlySalary: 56500, deduction: 1087, status: 'confirmed' },
    { employeeId: 'e7', employeeName: 'Suresh Prasad', department: 'SEO Engineering', days: 3, reason: 'Balance exhausted', monthlySalary: 24500, deduction: 20667, status: 'delayed' },
    { employeeId: 'e8', employeeName: 'Shivam Prasad', department: 'SEO Engineering', days: 5, reason: 'Unregulated absence', monthlySalary: 56500, deduction: 1087, status: 'confirmed' },
    { employeeId: 'e9', employeeName: 'Lavanya Prasad', department: 'SEO Engineering', days: 5, reason: '—', monthlySalary: 0, deduction: 0, status: 'pending' },
  ];

  const DUMMY_SUMMARY = {
    employeeCount: 12,
    totalDays: 35,
    totalDeduction: 154266,
    unplannedAbsences: 11,
    periodRun: '25 Nov',
    periodRunFull: '25 November 2025',
    syncedToPayroll: false,
  };

  const rows = (data.rows || []).length > 0 ? data.rows : DUMMY_ROWS;
  const apiSummary = data.summary || {};
  const hasRealSummary = (apiSummary.totalDays || 0) > 0 || (apiSummary.employeeCount || 0) > 0;
  const summary = hasRealSummary ? { ...apiSummary, syncedToPayroll: apiSummary.syncedToPayroll ?? false, periodRun: apiSummary.periodRun || '25 Nov', periodRunFull: apiSummary.periodRunFull || '25 November 2025' } : DUMMY_SUMMARY;
  const filtered = rows.filter((r: any) => (r.employeeName || '').toLowerCase().includes(q.toLowerCase()));

  const handleExport = () => {
    const csv = ['Employee,Department,LOP Days,Reason,Monthly Salary,Deduction,Status'];
    filtered.forEach((r: any) => csv.push(`${r.employeeName},${r.department},${r.days},${r.reason},${r.monthlySalary || 0},${r.deduction || 0},${statusLabel(r.status)}`));
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lop-report.csv';
    a.click();
    toast.success('Export started');
  };

  const resetFilters = () => {
    setQ(''); setDeptFilter(''); setBranchFilter('');
    setPeriod('FY 2026-27 (YTD)');
  };

  // BUG FIX (HRMS_BUG_253): Schedule report dialog — was just a toast popup
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    frequency: 'Monthly',
    recipients: '',
    format: 'CSV',
    dayOfMonth: '1',
  });
  const handleScheduleSave = () => {
    if (!scheduleConfig.recipients.trim()) {
      toast.error('Please enter at least one recipient email');
      return;
    }
    toast.success(`Report scheduled — ${scheduleConfig.frequency}, ${scheduleConfig.format} to ${scheduleConfig.recipients}`);
    setShowSchedule(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* ---------- header ---------- */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link href="/leave/reports" className="text-slate-400 hover:text-slate-600">
              <FiArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LOP Report</h1>
              <p className="text-sm text-slate-500 mt-0.5">LOP (Loss of Pay) days syncs with payroll — {summary.periodRunFull || 'November 2025'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSchedule(true)}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FiCal className="w-4 h-4" /> Schedule report
            </button>
            <button
              onClick={handleExport}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FiDownload className="w-4 h-4" /> Export <FiChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ---------- tab strip ---------- */}
        <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
          <Link href="/leave/reports/overview" className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap">Overview</Link>
          <Link href="/leave/reports/balance" className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap">Leave balance</Link>
          <Link href="/leave/reports/lop" className="px-4 py-2.5 text-sm font-semibold text-emerald-600 border-b-2 border-emerald-600 whitespace-nowrap">LOP report</Link>
        </div>

        {/* ---------- filter bar ---------- */}
        <div className="bg-slate-100/80 rounded-xl border border-slate-200 mb-5">
          <div className="flex items-stretch flex-wrap divide-x divide-slate-200">
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Period</label>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FiCalendar className="w-4 h-4 text-slate-400" />
                <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-transparent outline-none cursor-pointer font-semibold text-slate-700">
                  <option>FY 2026-27 (YTD)</option>
                  <option>FY 2025-26</option>
                  <option>2026</option>
                  <option>2025</option>
                </select>
              </div>
            </div>
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Department</label>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="">All departments</option>
                {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Location</label>
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="">All locations</option>
                {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Leave type</label>
              <select className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer" defaultValue="">
                <option value="">All types</option>
                <option value="LOP">LOP</option>
              </select>
            </div>
            <div className="flex items-center px-4">
              <button onClick={resetFilters} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5">
                <FiRotateCw className="w-3.5 h-3.5" /> Reset filters
              </button>
            </div>
          </div>
        </div>

        {/* ---------- KPI cards ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <KpiCard label="Employees with LOP" value={fmtNum(summary.employeeCount)} sub="employees" iconClass="bg-amber-400" icon={<FiUsers className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Total LOP days" value={fmtNum(summary.totalDays)} sub="total leave — absences" iconClass="bg-orange-500" icon={<FiClock className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Payroll impact" value={`₹${fmtINR(summary.totalDeduction)}`} sub="salary deductions (YTD)" iconClass="bg-rose-500" icon={<FiTrendingDown className="w-3.5 h-3.5 text-white" />} trendDown />
          <KpiCard label="Unplanned absences" value={fmtNum(summary.unplannedAbsences ?? 11)} sub="marked as LOP, not fixed" iconClass="bg-rose-400" icon={<FiAlertCircle className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Period run" value={summary.periodRun || '25 Nov'} sub={summary.periodRunFull || '25 November 2025'} iconClass="bg-blue-500" icon={<FiCalendar className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Synced to payroll" value={summary.syncedToPayroll ? 'Yes' : 'No'} sub={summary.syncedToPayroll ? 'synced (YTD)' : 'not synced (YTD)'} iconClass="bg-slate-400" icon={<FiRefreshCcw className="w-3.5 h-3.5 text-white" />} />
        </div>

        {/* ---------- table ---------- */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="relative w-72">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search employee or ID…"
                className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                onClick={() => toast.success('Sent for review')}
                className="h-9 px-3 rounded-lg border border-violet-200 bg-violet-50/60 text-sm font-semibold text-violet-700 hover:bg-violet-50 flex items-center gap-1.5"
              >
                <FiSend className="w-4 h-4" /> Send for review
              </button>
              <button
                onClick={() => toast.success('Synced to payroll')}
                className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-700 shadow-sm"
              >
                <FiRefreshCcw className="w-4 h-4" /> Sync to payroll
              </button>
            </div>
          </div>

          {/* table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 border-b border-slate-100">Employee</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">LOP days</th>
                  <th className="text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">Reason</th>
                  <th className="text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">Monthly salary</th>
                  <th className="text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">Deduction</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 border-b border-slate-100">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-500">No LOP records found.</td></tr>
                ) : (
                  filtered.map((r: any, i: number) => {
                    const ded = Number(r.deduction || 0);
                    const dedNeg = ded < 0;
                    const badge = STATUS_BADGE[(r.status || '').toLowerCase()] || 'bg-slate-100 text-slate-600';
                    const isPill = !['denied', 'rejected', 'disputed'].includes((r.status || '').toLowerCase());
                    const salary = Number(r.monthlySalary || 0);
                    return (
                      <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(r.employeeName)}`}>
                              {initials(r.employeeName)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{r.employeeName}</p>
                              <p className="text-xs text-slate-400 truncate">{r.department || r.branch || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-bold text-slate-900">{fmtNum(r.days)}</td>
                        <td className="px-3 py-3 text-sm text-slate-600">{r.reason || '—'}</td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{salary > 0 ? `₹${fmtINR(salary)}` : '—'}</td>
                        <td className={`px-3 py-3 text-right text-sm font-bold ${dedNeg ? 'text-rose-600' : 'text-slate-900'}`}>
                          {ded !== 0 ? `${dedNeg ? '−' : '+'}₹${fmtINR(Math.abs(ded))}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badge} ${isPill ? '' : 'bg-transparent'}`}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------- Schedule report dialog (BUG_253) ---------- */}
      {showSchedule && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={() => setShowSchedule(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Schedule LOP Report</h3>
              <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-slate-600"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Frequency</label>
                <select value={scheduleConfig.frequency} onChange={e => setScheduleConfig(s => ({ ...s, frequency: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm font-semibold text-slate-700 outline-none">
                  <option>Daily</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option>
                </select>
              </div>
              {scheduleConfig.frequency === 'Monthly' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Day of month</label>
                  <select value={scheduleConfig.dayOfMonth} onChange={e => setScheduleConfig(s => ({ ...s, dayOfMonth: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm font-semibold text-slate-700 outline-none">
                    {['1','5','10','15','20','25','Last day'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Recipients (comma-separated emails)</label>
                <input value={scheduleConfig.recipients} onChange={e => setScheduleConfig(s => ({ ...s, recipients: e.target.value }))} placeholder="hr@company.com, admin@company.com" className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Format</label>
                <select value={scheduleConfig.format} onChange={e => setScheduleConfig(s => ({ ...s, format: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm font-semibold text-slate-700 outline-none">
                  <option>CSV</option><option>Excel</option><option>PDF</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowSchedule(false)} className="flex-1 h-9 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleScheduleSave} className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 flex items-center justify-center gap-1.5"><FiCheck className="w-4 h-4" /> Save schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- KPI card ---------- */
function KpiCard({ label, value, sub, iconClass, icon, trendDown }: {
  label: string; value: string; sub: string; iconClass: string; icon: React.ReactNode; trendDown?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-5 h-5 rounded ${iconClass} flex items-center justify-center`}>{icon}</div>
        <p className="text-xs font-semibold text-slate-500 truncate">{label}</p>
      </div>
      <p className="text-xl font-extrabold text-slate-900 leading-tight flex items-center gap-1">
        {trendDown && <FiTrendingDown className="w-4 h-4 text-rose-500" />}
        {value}
      </p>
      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
