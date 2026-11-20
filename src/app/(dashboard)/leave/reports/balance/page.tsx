'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiSearch, FiRefreshCw, FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LeaveBalanceReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [fy, setFy] = useState('FY 2026-27');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/leave/balance?${sq || ''}&limit=500`, { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setBalances(d.balances || d.data || []); }
    } catch { toast.error('Failed to load balance data'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group balances by employee
  const byEmp: Record<string, { empName: string; dept: string; balances: Record<string, number> }> = {};
  for (const b of balances) {
    const empId = b.employeeId || b.empId || 'unknown';
    const empName = b.employeeName || b.employee?.name || b.employee?.firstName || 'Unknown';
    const dept = b.department || b.employee?.department?.name || '—';
    if (!byEmp[empId]) byEmp[empId] = { empName, dept, balances: {} };
    const ltName = b.leaveTypeName || b.leaveTypeCode || 'Unknown';
    byEmp[empId].balances[ltName] = b.remaining || b.total - b.used || 0;
  }
  const empRows = Object.values(byEmp);
  const filtered = empRows.filter(e => e.empName.toLowerCase().includes(q.toLowerCase()));

  // All leave types for table headers
  const allTypes = [...new Set(empRows.flatMap(e => Object.keys(e.balances)))].sort();

  // KPIs
  const totalBalance = empRows.reduce((sum, e) => sum + Object.values(e.balances).reduce((a, b) => a + b, 0), 0);
  const avgPerEmp = empRows.length > 0 ? (totalBalance / empRows.length).toFixed(1) : '0';
  const negativeBalance = empRows.filter(e => Object.values(e.balances).some(v => v < 0)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/leave/reports" className="text-slate-500 hover:text-slate-700"><FiArrowLeft className="w-5 h-5" /></Link>
          <div><h1 className="text-xl font-bold text-slate-900">Leave Balance Report</h1><p className="text-sm text-slate-500">Employee-wise leave balances across all leave types</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={fy} onChange={e => setFy(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-3 text-sm font-semibold text-slate-700 bg-white">
            <option>FY 2026-27</option><option>FY 2025-26</option>
          </select>
          <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><FiRefreshCw className="w-4 h-4" />Refresh</button>
          <button onClick={() => toast.success('Export started')} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-slate-800"><FiDownload className="w-4 h-4" />Export</button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link href="/leave/reports/overview" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Overview</Link>
        <Link href="/leave/reports/balance" className="px-4 py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">Leave Balance</Link>
        <Link href="/leave/reports/lop" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">LOP Report</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{totalBalance.toLocaleString()}</p><p className="text-xs font-semibold text-slate-500 mt-1">Total Balance (days)</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{avgPerEmp}</p><p className="text-xs font-semibold text-slate-500 mt-1">Avg Balance / Employee</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{allTypes.length}</p><p className="text-xs font-semibold text-slate-500 mt-1">Leave Types Tracked</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-rose-600">{negativeBalance}</p><p className="text-xs font-semibold text-slate-500 mt-1">Negative Balance Employees</p></div>
      </div>

      {/* Search + table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-xs">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee…" className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
          <span className="text-sm text-slate-400">{filtered.length} employees</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-slate-50/50">
              <th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Employee</th>
              <th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Department</th>
              {allTypes.map(t => <th key={t} className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3 py-2.5 border-b border-slate-100">{t}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={2 + allTypes.length} className="text-center py-8 text-slate-400">Loading…</td></tr> :
               filtered.length === 0 ? <tr><td colSpan={2 + allTypes.length} className="text-center py-10 text-slate-500">No balance data found.</td></tr> :
               filtered.map((e, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3.5 py-3 text-sm font-semibold text-slate-700">{e.empName}</td>
                  <td className="px-3.5 py-3 text-sm text-slate-500">{e.dept}</td>
                  {allTypes.map(t => {
                    const val = e.balances[t] ?? 0;
                    return <td key={t} className="px-3 py-3 text-center text-sm font-bold text-slate-700">{val !== 0 ? val : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
