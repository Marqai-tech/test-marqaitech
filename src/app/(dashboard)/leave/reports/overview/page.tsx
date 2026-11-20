'use client';
import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiCalendar, FiClock, FiTrendingUp, FiAlertCircle, FiBarChart2, FiRefreshCw, FiArrowLeft, FiSearch } from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

export default function LeaveOverviewReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const [deptFilter, setDeptFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [depts, setDepts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const params = new URLSearchParams();
      if (sq) { const [k,v] = sq.split('='); params.set(k, v); }
      if (deptFilter) params.set('departmentId', deptFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      const res = await fetch(`/api/leave/reports/overview?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
      const [dRes, bRes] = await Promise.all([
        fetch(`/api/departments${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/branches${sq ? '?' + sq : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (dRes?.ok) { const dd = await dRes.json(); setDepts(dd.data || dd || []); }
      if (bRes?.ok) { const bd = await bRes.json(); setBranches(bd.data || bd || []); }
    } catch { toast.error('Failed to load report data'); }
    finally { setLoading(false); }
  }, [scopeQuery, deptFilter, branchFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const s = data.summary || {};
  const typeDist = data.typeDist || {};
  const monthlyTrend = data.monthlyTrend || {};
  const topTakers = data.topTakers || [];
  const recentLeaves = data.recentLeaves || [];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const maxMonthly = Math.max(...Object.values(monthlyTrend), 1);
  const totalTypeUsage = Object.values(typeDist).reduce((a: number, b: any) => a + (b.days || 0), 0) || 1;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/leave/reports" className="text-slate-500 hover:text-slate-700"><FiArrowLeft className="w-5 h-5" /></Link>
          <div><h1 className="text-xl font-bold text-slate-900">Leave Overview</h1><p className="text-sm text-slate-500">Year-to-date leave utilization across the organization</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={() => toast.success('Export started')} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-slate-800"><FiDownload className="w-4 h-4" />Export</button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link href="/leave/reports/overview" className="px-4 py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">Overview</Link>
        <Link href="/leave/reports/balance" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Leave Balance</Link>
        <Link href="/leave/reports/lop" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">LOP Report</Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm font-semibold text-slate-700 bg-white">
          <option value="">All Departments</option>
          {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm font-semibold text-slate-700 bg-white">
          <option value="">All Branches</option>
          {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? <div className="flex items-center justify-center py-20 text-slate-400">Loading report…</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2"><FiCalendar className="w-4 h-4" /></div><p className="text-2xl font-extrabold text-slate-900">{s.totalDaysTaken || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">Days Taken</p></div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2"><FiTrendingUp className="w-4 h-4" /></div><p className="text-2xl font-extrabold text-slate-900">{s.employeeCount ? ((s.totalDaysTaken || 0) / s.employeeCount).toFixed(1) : '0'}</p><p className="text-xs font-semibold text-slate-500 mt-1">Avg / Employee</p></div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-2"><FiClock className="w-4 h-4" /></div><p className="text-2xl font-extrabold text-slate-900">{s.pending || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">Pending Approvals</p></div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-2"><FiAlertCircle className="w-4 h-4" /></div><p className="text-2xl font-extrabold text-rose-600">{s.lopDays || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">LOP Days</p></div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center mb-2"><FiBarChart2 className="w-4 h-4" /></div><p className="text-2xl font-extrabold text-slate-900">{s.approved || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">Approved Leaves</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Leave Trend</h3>
              <div className="flex items-end gap-2 h-40">{months.map(m => { const val = monthlyTrend[m] || 0; const h = Math.max((val / maxMonthly) * 100, 2); return <div key={m} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t" style={{ height: `${h}%`, minHeight: '2px', backgroundColor: val > 0 ? '#3b82f6' : '#e2e8f0' }} /><span className="text-[10px] text-slate-400">{m}</span></div>; })}</div>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Leave Type Distribution</h3>
              <div className="space-y-3">{Object.entries(typeDist).sort((a: any, b: any) => b[1].days - a[1].days).map(([name, info]: any) => { const pct = Math.round((info.days / totalTypeUsage) * 100); return <div key={name} className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-600 w-24 truncate">{name}</span><div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden"><div className="h-full bg-blue-500 rounded-lg flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 2)}%` }}><span className="text-[10px] font-bold text-white">{pct}%</span></div></div><span className="text-xs font-bold text-slate-500 w-12 text-right">{info.days}d</span></div>; })}{Object.keys(typeDist).length === 0 && <p className="text-sm text-slate-400">No leave usage data</p>}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Top Leave Takers</h3>
              <table className="w-full"><thead><tr><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Employee</th><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Dept</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">Days</th></tr></thead><tbody>{topTakers.map((t: any, i: number) => <tr key={i} className="border-b border-slate-50"><td className="py-3 text-sm font-semibold text-slate-700">{t.name}</td><td className="py-3 text-sm text-slate-500">{t.dept}</td><td className="py-3 text-sm font-bold text-slate-900 text-right">{t.days}</td></tr>)}{topTakers.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-sm text-slate-400">No data</td></tr>}</tbody></table>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Recent Leave Requests</h3>
              <table className="w-full"><thead><tr><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Employee</th><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Type</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">Days</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">Status</th></tr></thead><tbody>{recentLeaves.map((l: any, i: number) => <tr key={i} className="border-b border-slate-50"><td className="py-2 text-xs font-semibold text-slate-700">{l.employeeName}</td><td className="py-2 text-xs text-slate-500">{l.leaveType}</td><td className="py-2 text-xs font-bold text-slate-900 text-right">{l.days}</td><td className="py-2 text-right"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${l.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : l.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{l.status}</span></td></tr>)}{recentLeaves.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-400">No leave requests</td></tr>}</tbody></table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
