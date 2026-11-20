'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiCalendar, FiClock, FiTrendingUp, FiAlertCircle, FiBarChart2, FiRefreshCw, FiArrowLeft } from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LeaveOverviewReport() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
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
    } catch { toast.error('Failed to load report data'); }
    finally { setLoading(false); }
  }, [scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalDaysTaken = leaves.reduce((sum, l) => sum + (l.chargeableDays || l.days || 0), 0);
  const empCount = balances.length || 1;
  const avgPerEmp = (totalDaysTaken / empCount).toFixed(1);
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const lopDays = balances.reduce((sum, b) => {
    const lopType = (b.leaveTypeName || b.leaveTypeCode || '').toLowerCase().includes('lop') || (b.leaveTypeName || '').toLowerCase().includes('unpaid');
    return lopType ? sum + (b.used || 0) : sum;
  }, 0);
  const unplannedPct = leaves.length > 0 ? Math.round((leaves.filter(l => !l.advanceNotice || (l.advanceNotice || 0) < 1).length / leaves.length) * 100) : 0;

  const typeDist: Record<string, number> = {};
  for (const b of balances) {
    const name = b.leaveTypeName || b.leaveTypeCode || 'Unknown';
    typeDist[name] = (typeDist[name] || 0) + (b.used || 0);
  }
  const totalTypeUsage = Object.values(typeDist).reduce((a, b) => a + b, 0) || 1;

  const monthlyTrend: Record<string, number> = {};
  for (const l of leaves) {
    const d = l.startDate ? new Date(l.startDate) : null;
    if (d) { const key = d.toLocaleDateString('en', { month: 'short' }); monthlyTrend[key] = (monthlyTrend[key] || 0) + (l.chargeableDays || l.days || 1); }
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const maxMonthly = Math.max(...Object.values(monthlyTrend), 1);

  const byEmp: Record<string, { name: string; days: number }> = {};
  for (const l of leaves) {
    const name = l.employeeName || l.employee?.name || 'Unknown';
    if (!byEmp[name]) byEmp[name] = { name, days: 0 };
    byEmp[name].days += (l.chargeableDays || l.days || 0);
  }
  const topTakers = Object.values(byEmp).sort((a, b) => b.days - a.days).slice(0, 5);

  const kpis = [
    { label: 'Days Taken', value: totalDaysTaken.toLocaleString(), icon: <FiCalendar />, color: 'blue' },
    { label: 'Avg / Employee', value: avgPerEmp, sub: 'days', icon: <FiTrendingUp />, color: 'emerald' },
    { label: 'Pending Approvals', value: pendingLeaves, icon: <FiClock />, color: 'amber' },
    { label: 'Unplanned Leave', value: `${unplannedPct}%`, sub: 'target 25%', icon: <FiAlertCircle />, color: 'orange' },
    { label: 'LOP Days', value: lopDays, icon: <FiBarChart2 />, color: 'rose' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/leave/reports" className="text-slate-500 hover:text-slate-700"><FiArrowLeft className="w-5 h-5" /></Link>
          <div><h1 className="text-xl font-bold text-slate-900">Leave Overview</h1><p className="text-sm text-slate-500">Year-to-date leave utilization across the organization</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={fy} onChange={e => setFy(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-3 text-sm font-semibold text-slate-700 bg-white">
            <option>FY 2026-27</option><option>FY 2025-26</option><option>FY 2024-25</option>
          </select>
          <button onClick={fetchData} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><FiRefreshCw className="w-4 h-4" />Refresh</button>
          <button onClick={() => toast.success('Export started')} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-slate-800"><FiDownload className="w-4 h-4" />Export</button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link href="/leave/reports/overview" className="px-4 py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">Overview</Link>
        <Link href="/leave/reports/balance" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Leave Balance</Link>
        <Link href="/leave/reports/lop" className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">LOP Report</Link>
      </div>

      {loading ? <div className="flex items-center justify-center py-20 text-slate-400">Loading report…</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {kpis.map(k => (
              <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${k.color}-50 text-${k.color}-600`}>{k.icon}</span>
                </div>
                <p className="text-2xl font-extrabold text-slate-900">{k.value}{k.sub && <span className="text-sm font-normal text-slate-400 ml-1">{k.sub}</span>}</p>
                <p className="text-xs font-semibold text-slate-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Leave Trend</h3>
              <div className="flex items-end gap-2 h-40">
                {months.map(m => {
                  const val = monthlyTrend[m] || 0;
                  const h = Math.max((val / maxMonthly) * 100, 2);
                  return <div key={m} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t" style={{ height: `${h}%`, minHeight: '2px', backgroundColor: val > 0 ? '#3b82f6' : '#e2e8f0' }} /><span className="text-[10px] text-slate-400">{m}</span></div>;
                })}
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Leave Type Distribution</h3>
              <div className="space-y-3">
                {Object.entries(typeDist).sort((a, b) => b[1] - a[1]).map(([name, days]) => {
                  const pct = Math.round((days / totalTypeUsage) * 100);
                  return <div key={name} className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-600 w-24 truncate">{name}</span><div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden"><div className="h-full bg-blue-500 rounded-lg flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 2)}%` }}><span className="text-[10px] font-bold text-white">{pct}%</span></div></div><span className="text-xs font-bold text-slate-500 w-12 text-right">{days}d</span></div>;
                })}
                {Object.keys(typeDist).length === 0 && <p className="text-sm text-slate-400">No leave usage data</p>}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Top Leave Takers</h3>
            <table className="w-full">
              <thead><tr><th className="text-left text-xs font-bold text-slate-400 uppercase pb-2">Employee</th><th className="text-right text-xs font-bold text-slate-400 uppercase pb-2">Days Taken</th></tr></thead>
              <tbody>
                {topTakers.map((t, i) => <tr key={i} className="border-b border-slate-50"><td className="py-3 text-sm font-semibold text-slate-700">{t.name}</td><td className="py-3 text-sm font-bold text-slate-900 text-right">{t.days}</td></tr>)}
                {topTakers.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-sm text-slate-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
