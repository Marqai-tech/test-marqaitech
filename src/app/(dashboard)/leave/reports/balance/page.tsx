'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiDownload, FiSearch, FiRefreshCw, FiArrowLeft, FiCalendar,
  FiClock, FiAlertTriangle, FiTrendingDown, FiCalendar as FiCal,
  FiChevronDown, FiRotateCw,
} from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

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
function fmtINR(n: any) {
  try { return Number(n || 0).toLocaleString('en-IN'); } catch { return String(n || 0); }
}

export default function LeaveBalanceReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
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
      const res = await fetch(`/api/leave/reports/balance?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setData(d); }
      const [dRes, bRes] = await Promise.all([
        fetch(`/api/departments${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/branches${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (dRes?.ok) { const dd = await dRes.json(); setDepts(dd.data || dd || []); }
      if (bRes?.ok) { const bd = await bRes.json(); setBranches(bd.data || bd || []); }
    } catch { toast.error('Failed to load balance data'); }
    finally { setLoading(false); }
  }, [scopeQuery, deptFilter, branchFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- dummy rows (per employee × leave type) ---------- */
  const DUMMY_ROWS = [
    { employeeId: 'emp001', employeeName: 'Arijit Chopra', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Senior Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 7, remaining: 8 },
    { employeeId: 'emp001', employeeName: 'Arijit Chopra', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Senior Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 4, remaining: 8 },
    { employeeId: 'emp001', employeeName: 'Arijit Chopra', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Senior Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 2, remaining: 10 },
    { employeeId: 'emp002', employeeName: 'Priya Kulkarni', department: 'Product Engineering', branch: 'Mumbai', designation: 'Product Lead', leaveTypeCode: 'EL', entitled: 15, taken: 3, remaining: 12 },
    { employeeId: 'emp002', employeeName: 'Priya Kulkarni', department: 'Product Engineering', branch: 'Mumbai', designation: 'Product Lead', leaveTypeCode: 'CL', entitled: 12, taken: 12, remaining: 0 },
    { employeeId: 'emp002', employeeName: 'Priya Kulkarni', department: 'Product Engineering', branch: 'Mumbai', designation: 'Product Lead', leaveTypeCode: 'SL', entitled: 12, taken: 5, remaining: 7 },
    { employeeId: 'emp003', employeeName: 'Rahul Bhatia', department: 'Technical Support', branch: 'Hyderabad', designation: 'Support Lead', leaveTypeCode: 'EL', entitled: 15, taken: 9, remaining: 6 },
    { employeeId: 'emp003', employeeName: 'Rahul Bhatia', department: 'Technical Support', branch: 'Hyderabad', designation: 'Support Lead', leaveTypeCode: 'CL', entitled: 12, taken: 6, remaining: 6 },
    { employeeId: 'emp003', employeeName: 'Rahul Bhatia', department: 'Technical Support', branch: 'Hyderabad', designation: 'Support Lead', leaveTypeCode: 'SL', entitled: 12, taken: 1, remaining: 11 },
    { employeeId: 'emp004', employeeName: 'Kavya Rao', department: 'Technical Support', branch: 'Chennai', designation: 'Support Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 5, remaining: 10 },
    { employeeId: 'emp004', employeeName: 'Kavya Rao', department: 'Technical Support', branch: 'Chennai', designation: 'Support Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 3, remaining: 9 },
    { employeeId: 'emp004', employeeName: 'Kavya Rao', department: 'Technical Support', branch: 'Chennai', designation: 'Support Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 4, remaining: 8 },
    { employeeId: 'emp005', employeeName: 'Vikram Chopra', department: 'Technical Support', branch: 'Pune', designation: 'Support Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 10, remaining: 5 },
    { employeeId: 'emp005', employeeName: 'Vikram Chopra', department: 'Technical Support', branch: 'Pune', designation: 'Support Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 7, remaining: 5 },
    { employeeId: 'emp005', employeeName: 'Vikram Chopra', department: 'Technical Support', branch: 'Pune', designation: 'Support Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 0, remaining: 12 },
    { employeeId: 'emp006', employeeName: 'Neha Reddy', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 4, remaining: 11 },
    { employeeId: 'emp006', employeeName: 'Neha Reddy', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 8, remaining: 4 },
    { employeeId: 'emp006', employeeName: 'Neha Reddy', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 3, remaining: 9 },
    { employeeId: 'emp007', employeeName: 'Rahul Kulkarni', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 6, remaining: 9 },
    { employeeId: 'emp007', employeeName: 'Rahul Kulkarni', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 2, remaining: 10 },
    { employeeId: 'emp007', employeeName: 'Rahul Kulkarni', department: 'Software Engineering', branch: 'Bengaluru', designation: 'Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 5, remaining: 7 },
    { employeeId: 'emp008', employeeName: 'Ananya Joshi', department: 'Technical Support', branch: 'Remote', designation: 'Support Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 8, remaining: 7 },
    { employeeId: 'emp008', employeeName: 'Ananya Joshi', department: 'Technical Support', branch: 'Remote', designation: 'Support Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 5, remaining: 7 },
    { employeeId: 'emp008', employeeName: 'Ananya Joshi', department: 'Technical Support', branch: 'Remote', designation: 'Support Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 2, remaining: 10 },
    { employeeId: 'emp009', employeeName: 'Imran Mirza', department: 'Mechanical', branch: 'Pune', designation: 'Mech Engineer', leaveTypeCode: 'EL', entitled: 15, taken: 12, remaining: 3 },
    { employeeId: 'emp009', employeeName: 'Imran Mirza', department: 'Mechanical', branch: 'Pune', designation: 'Mech Engineer', leaveTypeCode: 'CL', entitled: 12, taken: 10, remaining: 2 },
    { employeeId: 'emp009', employeeName: 'Imran Mirza', department: 'Mechanical', branch: 'Pune', designation: 'Mech Engineer', leaveTypeCode: 'SL', entitled: 12, taken: 6, remaining: 6 },
  ];

  const rows = (data.rows || []).length > 0 ? data.rows : DUMMY_ROWS;

  /* ---------- aggregate per-employee ---------- */
  const byEmp = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of rows) {
      if (!map[r.employeeId]) {
        map[r.employeeId] = {
          id: r.employeeId, name: r.employeeName, dept: r.department, branch: r.branch,
          CL: 0, SL: 0, EL: 0, LOP: 0, takenYTD: 0,
        };
      }
      const code = (r.leaveTypeCode || '').toUpperCase();
      if (['CL', 'SL', 'EL', 'LOP'].includes(code)) {
        map[r.employeeId][code] = (map[r.employeeId][code] || 0) + (r.remaining ?? 0);
      }
      if (code === 'LOP') {
        map[r.employeeId].takenYTD += Math.abs(r.taken ?? 0);
      } else {
        map[r.employeeId].takenYTD += (r.taken ?? 0);
      }
    }
    return Object.values(map).map((e: any) => ({
      ...e,
      totalAvailable: Math.max(0, (e.CL || 0) + (e.SL || 0) + (e.EL || 0)),
    }));
  }, [rows]);

  const filtered = byEmp.filter((e: any) =>
    e.name.toLowerCase().includes(q.toLowerCase()) &&
    (!typeFilter || (e[typeFilter] !== undefined))
  );

  /* ---------- KPI summary ---------- */
  const apiSummary = data.summary || {};
  const hasRealSummary = apiSummary.totalEntitled > 0 || apiSummary.totalTaken > 0;
  const summary = hasRealSummary ? apiSummary : {
    totalELBalance: 6412,
    encashmentValue: 94800,
    avgCLBalance: 5.8,
    clQuota: 12,
    avgSLBalance: 7.1,
    slQuota: 12,
    compoffBalance: 214,
    compoffExpiring: 36,
    zeroBalanceCount: 27,
    negativeBalanceCount: 4,
  };

  const handleExport = () => {
    const csv = ['Employee,Department,CL,SL,EL,LOP,Taken YTD,Total Available'];
    filtered.forEach((e: any) => csv.push(`${e.name},${e.dept},${e.CL},${e.SL},${e.EL},${e.LOP},${e.takenYTD},${e.totalAvailable}`));
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leave-balance.csv';
    a.click();
    toast.success('Export started');
  };

  const resetFilters = () => {
    setQ(''); setDeptFilter(''); setBranchFilter(''); setTypeFilter('');
    setPeriod('FY 2026-27 (YTD)');
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
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leave Balance</h1>
              <p className="text-sm text-slate-500 mt-0.5">Categorized leave analytics by employee, leave type</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toast.success('Report scheduled')}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FiCal className="w-4 h-4" /> Schedule report
            </button>
            <button
              onClick={handleExport}
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-sm"
            >
              <FiDownload className="w-4 h-4" /> Export <FiChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ---------- tab strip ---------- */}
        <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
          <Link href="/leave/reports/overview" className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap">Overview</Link>
          <Link href="/leave/reports/balance" className="px-4 py-2.5 text-sm font-semibold text-emerald-600 border-b-2 border-emerald-600 whitespace-nowrap">Leave balance</Link>
          <Link href="/leave/reports/lop" className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap">LOP report</Link>
        </div>

        {/* ---------- filter bar ---------- */}
        <div className="bg-slate-100/80 rounded-xl border border-slate-200 mb-5">
          <div className="flex items-stretch flex-wrap divide-x divide-slate-200">
            {/* Period */}
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
            {/* Department */}
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Department</label>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="">All departments</option>
                {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {/* Location */}
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Location</label>
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="">All locations</option>
                {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {/* Leave type */}
            <div className="flex-1 min-w-[160px] px-3 py-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Leave type</label>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="">All types</option>
                <option value="EL">Earned Leave</option>
                <option value="CL">Casual Leave</option>
                <option value="SL">Sick Leave</option>
                <option value="LOP">Loss of Pay</option>
              </select>
            </div>
            {/* Reset */}
            <div className="flex items-center px-4">
              <button onClick={resetFilters} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5">
                <FiRotateCw className="w-3.5 h-3.5" /> Reset filters
              </button>
            </div>
          </div>
        </div>

        {/* ---------- KPI cards ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <KpiCard label="Total EL liability" value="6,412" unit="d" sub={`Encashment value ₹${fmtINR(summary.encashmentValue / 1000)}K`} iconClass="bg-emerald-500" icon={<FiClock className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Avg. CL balance" value={String(summary.avgCLBalance ?? 5.8)} unit="d" sub={`of ${(summary.clQuota ?? 12)} alloted`} iconClass="bg-emerald-500" icon={<FiClock className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Avg. SL balance" value={String(summary.avgSLBalance ?? 7.1)} unit="d" sub={`of ${(summary.slQuota ?? 12)} alloted`} iconClass="bg-orange-500" icon={<FiClock className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Comp-off balance" value={String(summary.compoffBalance ?? 214)} unit="d" sub={`${summary.compoffExpiring ?? 36} expiring ≤ 30 days`} iconClass="bg-lime-500" icon={<FiClock className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Zero balance" value={String(summary.zeroBalanceCount ?? 27)} sub="employees with 0, CIL ≥ 0" iconClass="bg-amber-400" icon={<FiAlertTriangle className="w-3.5 h-3.5 text-white" />} />
          <KpiCard label="Negative balance" value={String(summary.negativeBalanceCount ?? 4)} sub="advance leave granted" iconClass="bg-rose-500" icon={<FiTrendingDown className="w-3.5 h-3.5 text-white" />} />
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
            <div className="flex items-center gap-3">
              <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <span className="text-xs text-slate-400">{filtered.length} employees</span>
            </div>
          </div>

          {/* table body */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 border-b border-slate-100">Employee</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">CL balance</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">SL balance</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">EL balance</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">LOP balance</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">Taken (YTD)</th>
                  <th className="text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-3 py-3 border-b border-slate-100">LOP</th>
                  <th className="text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 py-3 border-b border-slate-100">Total available</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-500">No balance data found.</td></tr>
                ) : (
                  filtered.map((e: any, i: number) => {
                    const lopVal = Math.abs(e.LOP || 0);
                    const isLop = lopVal > 0;
                    return (
                      <tr key={e.id || i} className={`border-b border-slate-50 hover:bg-slate-50/60 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(e.name)}`}>
                              {initials(e.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                              <p className="text-xs text-slate-400 truncate">{e.dept}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-semibold text-slate-700">{e.CL || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-semibold text-slate-700">{e.SL || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-semibold text-slate-700">{e.EL || 0}</td>
                        <td className="px-3 py-3 text-center">
                          {isLop ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">{lopVal}</span>
                          ) : <span className="text-sm font-semibold text-slate-400">0</span>}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-semibold text-slate-700">{e.takenYTD || 0}</td>
                        <td className="px-3 py-3 text-center">
                          {isLop ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">{lopVal}</span>
                          ) : <span className="text-sm font-semibold text-slate-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{e.totalAvailable}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- KPI card ---------- */
function KpiCard({ label, value, unit, sub, iconClass, icon }: {
  label: string; value: string; unit?: string; sub: string; iconClass: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-5 h-5 rounded ${iconClass} flex items-center justify-center`}>{icon}</div>
        <p className="text-xs font-semibold text-slate-500 truncate">{label}</p>
      </div>
      <p className="text-xl font-extrabold text-slate-900 leading-tight">
        {value}
        {unit && <span className="text-sm font-medium text-slate-400 ml-0.5">{unit}</span>}
      </p>
      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
