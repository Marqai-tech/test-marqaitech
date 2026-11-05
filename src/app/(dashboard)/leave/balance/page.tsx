'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPieChart, FiRefreshCw, FiClock, FiCheckCircle, FiXCircle,
  FiChevronRight, FiArrowLeft, FiCalendar, FiTrendingUp,
} from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface LeaveBalance {
  id: string;
  leaveTypeId: string;
  leaveType: { id: string; name: string; code: string; isPaid: boolean; calendarColor?: string };
  year: number;
  total: number;
  used: number;
  remaining: number;
  carryForward: number;
}

interface PendingInfo {
  leaveTypeId: string;
  pendingDays: number;
}

export default function MyLeaveBalancePage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [pendingByType, setPendingByType] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const [balRes, leaveRes] = await Promise.all([
        fetch(`/api/leave/balance?${sq || ''}&limit=50`, { headers: getAuthHeaders() }),
        fetch(`/api/leave?status=pending&limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (balRes.ok) {
        const data = await balRes.json();
        setBalances(data.balances || data.data || []);
      }
      if (leaveRes?.ok) {
        const leaveData = await leaveRes.json();
        const leaves = leaveData.leaveRequests || [];
        const pMap = new Map<string, number>();
        leaves.forEach((lr: any) => {
          const ltId = lr.leaveTypeId;
          const days = lr.chargeableDays || (lr.halfDay ? 0.5 : Math.ceil((new Date(lr.endDate).getTime() - new Date(lr.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
          pMap.set(ltId, (pMap.get(ltId) || 0) + days);
        });
        setPendingByType(pMap);
      }
    } catch {
      toast.error('Failed to load leave balance');
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchLedger = async (leaveTypeId: string) => {
    setLedgerLoading(true);
    setSelectedType(leaveTypeId);
    try {
      // The ledger API doesn't exist yet as a separate route, but we can
      // fetch it via a query param on the balance API. For now, show a
      // placeholder with the balance breakdown.
      setLedgerHistory([]);
    } catch {
      setLedgerHistory([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const totalAllocated = balances.reduce((s, b) => s + b.total, 0);
  const totalUsed = balances.reduce((s, b) => s + b.used, 0);
  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0);
  const totalPending = Array.from(pendingByType.values()).reduce((s, d) => s + d, 0);
  const totalCarryForward = balances.reduce((s, b) => s + b.carryForward, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
          <Link href="/leave" className="hover:text-green-600 transition-colors inline-flex items-center gap-1">
            <FiArrowLeft className="w-3.5 h-3.5" /> Leave
          </Link>
          <FiChevronRight className="w-3 h-3 text-slate-300" />
          <span className="text-slate-700 font-medium">My Leave Balance</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FiPieChart className="w-6 h-6 text-green-600" /> My Leave Balance
            </h1>
            <p className="text-sm text-slate-500 mt-1">Allocated, used, pending, available and carry-forward balances by leave type.</p>
          </div>
          <button onClick={fetchData} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Refresh">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Allocated" value={totalAllocated} icon={<FiTrendingUp className="w-5 h-5" />} color="blue" />
        <SummaryCard label="Carry Forward" value={totalCarryForward} icon={<FiTrendingUp className="w-5 h-5" />} color="purple" />
        <SummaryCard label="Used" value={totalUsed} icon={<FiCheckCircle className="w-5 h-5" />} color="emerald" />
        <SummaryCard label="Pending" value={totalPending} icon={<FiClock className="w-5 h-5" />} color="amber" />
        <SummaryCard label="Available" value={Math.max(0, totalRemaining - totalPending)} icon={<FiPieChart className="w-5 h-5" />} color="green" />
      </div>

      {/* Balance table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Balance by Leave Type</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading balances...</div>
        ) : balances.length === 0 ? (
          <div className="p-12 text-center">
            <FiPieChart className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No leave balances found. Contact HR to configure your leave types.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Leave Type</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Allocated</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Carry Fwd</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Used</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Pending</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Available</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => {
                  const pending = pendingByType.get(b.leaveTypeId) || 0;
                  const available = Math.max(0, b.remaining - pending);
                  const usedPct = b.total > 0 ? (b.used / b.total) * 100 : 0;
                  const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
                  const colorDot = b.leaveType.calendarColor || '#10b981';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => fetchLedger(b.leaveTypeId)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorDot }} />
                          <div>
                            <div className="font-medium text-slate-900">{b.leaveType.name}</div>
                            <div className="text-xs text-slate-400 font-mono">{b.leaveType.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700 font-medium">{b.total}</td>
                      <td className="px-4 py-3 text-center text-purple-600">{b.carryForward || 0}</td>
                      <td className="px-4 py-3 text-center text-emerald-600 font-medium">{b.used}</td>
                      <td className="px-4 py-3 text-center text-amber-600 font-medium">{pending}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-bold">{available}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                            <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8">{Math.round(usedPct)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-4 py-2 font-bold text-slate-700">Total</td>
                  <td className="px-4 py-2 text-center font-bold text-slate-700">{totalAllocated}</td>
                  <td className="px-4 py-2 text-center font-bold text-purple-700">{totalCarryForward}</td>
                  <td className="px-4 py-2 text-center font-bold text-emerald-700">{totalUsed}</td>
                  <td className="px-4 py-2 text-center font-bold text-amber-700">{totalPending}</td>
                  <td className="px-4 py-2 text-center font-bold text-green-700">{Math.max(0, totalRemaining - totalPending)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Apply leave CTA */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-green-900">Need time off?</h3>
          <p className="text-xs text-green-700 mt-0.5">Apply for leave and track your request status.</p>
        </div>
        <Link href="/leave/apply" className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
          <FiCalendar className="w-4 h-4" /> Apply Leave
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-50 to-blue-50/30 text-blue-600 bg-blue-500',
    purple: 'from-purple-50 to-purple-50/30 text-purple-600 bg-purple-500',
    emerald: 'from-emerald-50 to-emerald-50/30 text-emerald-600 bg-emerald-500',
    amber: 'from-amber-50 to-amber-50/30 text-amber-600 bg-amber-500',
    green: 'from-green-50 to-green-50/30 text-green-600 bg-green-500',
  };
  const [gradient, textColor, bgColor] = colorMap[color]?.split(' ') || colorMap.blue.split(' ');
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 bg-gradient-to-r ${gradient}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center text-white flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <h4 className={`text-xl font-bold ${textColor}`}>{value}</h4>
        </div>
      </div>
    </div>
  );
}
