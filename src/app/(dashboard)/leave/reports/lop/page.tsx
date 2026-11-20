'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiSearch, FiRefreshCw, FiArrowLeft, FiAlertTriangle, FiClock } from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LOPReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [fy, setFy] = useState('FY 2026-27');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const sep = sq ? '&' : '';
      const [balRes, leaveRes] = await Promise.all([
        fetch(`/api/leave/balance?${sq || ''}&limit=500`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/leave?status=approved&limit=500${sep}${sq || ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (balRes?.ok) { const d = await balRes.json(); setBalances(d.balances || d.data || []); }
      if (leaveRes?.ok) { const d = await leaveRes.json(); setLeaves(d.data || d.requests || []); }
    } catch { toast.error('Failed to load LOP data'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter LOP / unpaid leave types
  const isLOP = (name: string) => {
    const n = (name || '').toLowerCase();
    return n.includes('lop') || n.includes('unpaid') || n.includes('loss of pay') || n.includes('without pay');
  };

  // Build LOP entries from balances
  const lopEntries: Array<{ empName: string; dept: string; days: number; reason: string }> = [];
  const byEmp: Record<string, { empName: string; dept: string }> = {};
  for (const b of balances) {
    if (isLOP(b.leaveTypeName || b.leaveTypeCode || '')) {
      const days = b.used || 0;
      if (days > 0) {
        const empId = b.employeeId || 'unknown';
        const empName = b.employeeName || b.employee?.name || 'Unknown';
        const dept = b.department || b.employee?.department?.name || '—';
        byEmp[empId] = { empName, dept };
        lopEntries.push({ empName, dept, days, reason: 'Balance exhausted' });
      }
    }
  }

  // Also check approved leave requests for LOP types
  for (const l of leaves) {
    const ltName = l.leaveTypeName || l.leaveTypeCode || '';
    if (isLOP(ltName)) {
      const name = l.employeeName || l.employee?.name || 'Unknown';
      const dept = l.department || l.employee?.department?.name || '—';
      const existing = lopEntries.find(e => e.empName === name);
      if (existing) {
        existing.days += (l.chargeableDays || l.days || 0);
      } else {
        lopEntries.push({ empName: name, dept, days: l.chargeableDays || l.days || 0, reason: 'Unapproved absence' });
      }
    }
  }

  const filtered = lopEntries.filter(e => e.empName.toLowerCase().includes(q.toLowerCase()));
  const totalLOPDays = lopEntries.reduce((s, e) => s + e.days, 0);
  const lopEmpCount = lopEntries.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/leave/reports" className="text-slate-500 hover:text-slate-700"><FiArrowLeft className="w-5 h-5" /></Link>
          <div><h1 className="text-xl font-bold text-slate-900">LOP Report</h1><p className="text-sm text-slate-500">Loss of Pay days and salary deductions</p></div>
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
        <Link href="/leave/reports/balance" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Leave Balance</Link>
        <Link href="/leave/reports/lop" className="px-4 py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">LOP Report</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">{lopEmpCount}</p><p className="text-xs font-semibold text-slate-500 mt-1">LOP Employees</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-rose-600">{totalLOPDays}</p><p className="text-xs font-semibold text-slate-500 mt-1">Total LOP Days</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-2xl font-extrabold text-slate-900">—</p><p className="text-xs font-semibold text-slate-500 mt-1">Salary Deduction (₹)</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex items-center gap-2"><FiAlertTriangle className="w-5 h-5 text-amber-500" /><div><p className="text-sm font-bold text-slate-900">Not synced</p><p className="text-xs font-semibold text-slate-500">to payroll</p></div></div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => toast.success('Sent for review')} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">Send for review</button>
        <button onClick={() => toast.success('Syncing to payroll…')} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 flex items-center gap-1.5"><FiClock className="w-4 h-4" />Sync to payroll</button>
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
              <th className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">LOP Days</th>
              <th className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Reason</th>
              <th className="text-center text-[10.5px] font-bold uppercase tracking-wide text-slate-400 px-3.5 py-2.5 border-b border-slate-100">Status</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading…</td></tr> :
               filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-slate-500">No LOP records found.</td></tr> :
               filtered.map((e, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3.5 py-3 text-sm font-semibold text-slate-700">{e.empName}</td>
                  <td className="px-3.5 py-3 text-sm text-slate-500">{e.dept}</td>
                  <td className="px-3.5 py-3 text-center text-sm font-bold text-rose-600">{e.days}</td>
                  <td className="px-3.5 py-3 text-sm text-slate-500">{e.reason}</td>
                  <td className="px-3.5 py-3 text-center"><span className="inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pending</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
