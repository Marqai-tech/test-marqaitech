'use client';
import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiSearch, FiRefreshCw, FiArrowLeft } from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

export default function LOPReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ rows: [], summary: {}, byEmployee: [] });
  const [q, setQ] = useState('');
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

  const rows = data.rows || [];
  const summary = data.summary || {};
  const byEmp = data.byEmployee || [];
  const filtered = rows.filter((r: any) => r.employeeName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/leave/reports" className="text-slate-500 hover:text-slate-700"><FiArrowLeft className="w-5 h-5" /></Link>
          <div><h1 className="text-xl font-bold text-slate-900">LOP Report</h1><p className="text-sm text-slate-500">Loss of Pay leaves with deduction calculation</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={() => { const csv = ['Employee,Dept,LeaveType,Start,End,Days,Deduction']; filtered.forEach((r:any) => csv.push(`${r.employeeName},${r.department},${r.leaveType},${r.startDate},${r.endDate},${r.days},${r.deduction}`)); const blob = new Blob([csv.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lop-report.csv'; a.click(); }} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-slate-800"><FiDownload className="w-4 h-4" />Export CSV</button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link href="/leave/reports/overview" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Overview</Link>
        <Link href="/leave/reports/balance" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Leave Balance</Link>
        <Link href="/leave/reports/lop" className="px-4 py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">LOP Report</Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{summary.totalDays || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">Total LOP Days</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{summary.employeeCount || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">Employees with LOP</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{summary.requestCount || 0}</p><p className="text-xs font-semibold text-slate-500 mt-1">LOP Requests</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-rose-600">₹{(summary.totalDeduction || 0).toLocaleString('en-IN')}</p><p className="text-xs font-semibold text-slate-500 mt-1">Total Deduction</p></div>
      </div>

      {/* By Employee summary */}
      {byEmp.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm mb-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">By Employee</h3>
          <table className="w-full"><thead><tr><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Employee</th><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Department</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">LOP Days</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">Deduction</th></tr></thead><tbody>{byEmp.map((e: any, i: number) => <tr key={i} className="border-b border-slate-50"><td className="py-3 text-sm font-semibold text-slate-700">{e.name}</td><td className="py-3 text-sm text-slate-500">{e.dept}</td><td className="py-3 text-sm font-bold text-slate-900 text-right">{e.days}</td><td className="py-3 text-sm font-bold text-rose-600 text-right">₹{e.deduction.toLocaleString('en-IN')}</td></tr>)}</tbody></table>
        </div>
      )}

      {/* Detail table with filters */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
          <div className="relative flex-1 max-w-xs"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee…" className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" /></div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm font-semibold text-slate-700 bg-white"><option value="">All Departments</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm font-semibold text-slate-700 bg-white"><option value="">All Branches</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <span className="text-sm text-slate-400">{filtered.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full"><thead><tr className="bg-slate-50/50"><th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Employee</th><th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Department</th><th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Leave Type</th><th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Start</th><th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">End</th><th className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Days</th><th className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Deduction</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr> :
             filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-slate-500">No LOP records found.</td></tr> :
             filtered.map((r: any, i: number) => <tr key={i} className="border-b border-slate-50 hover:bg-slate-50"><td className="px-3.5 py-3 text-sm font-semibold text-slate-700">{r.employeeName}</td><td className="px-3.5 py-3 text-sm text-slate-500">{r.department}</td><td className="px-3.5 py-3 text-sm text-slate-600">{r.leaveType}</td><td className="px-3.5 py-3 text-xs text-slate-500">{new Date(r.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td><td className="px-3.5 py-3 text-xs text-slate-500">{new Date(r.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td><td className="px-3.5 py-3 text-center text-sm font-bold text-slate-900">{r.days}</td><td className="px-3.5 py-3 text-right text-sm font-bold text-rose-600">₹{r.deduction.toLocaleString('en-IN')}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
