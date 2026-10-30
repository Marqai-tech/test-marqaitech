'use client';

/**
 * My Leave Balance page — /leave/balance
 *
 * Shows one card per leave type in the employee's company, with:
 *   - Total allocated days (from LeaveType.defaultDays or LeaveBalance.total)
 *   - Used days (from approved leave)
 *   - Remaining days (total - used)
 *   - Usage percentage (progress bar)
 *   - Carry-forward days (if any)
 *
 * Also shows recent leave history (last 5 requests).
 *
 * Data source:
 *   GET /api/leave/balance?employeeId=<own-id>  — filtered to own balances
 *   GET /api/leave?view=self&limit=5            — recent history
 */

import { useEffect, useState, useCallback } from 'react';
import {
  FiPieChart, FiCalendar, FiRefreshCw, FiTrendingUp, FiCheckCircle,
  FiClock, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface LeaveBalanceCard {
  id: string;
  type: string;
  code: string;
  total: number;
  used: number;
  remaining: number;
  carryForward: number;
  pending: number;
  isPaid: boolean;
  color: string;
  lightColor: string;
  textColor: string;
  bgColor: string;
  icon: string;
}

interface LeaveHistory {
  id: string;
  type: string;
  from: string;
  to: string;
  days: number;
  status: string;
  halfDay?: boolean;
}

/* ── Helpers ── */
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'approved': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'pending': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'rejected': return 'bg-red-50 text-red-700 border border-red-200';
    case 'cancelled': return 'bg-slate-50 text-slate-500 border border-slate-200';
    default: return 'bg-slate-50 text-slate-600 border border-slate-200';
  }
}

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'approved': return <FiCheckCircle className="w-3 h-3" />;
    case 'pending': return <FiClock className="w-3 h-3" />;
    case 'rejected': return <FiAlertCircle className="w-3 h-3" />;
    default: return <FiClock className="w-3 h-3" />;
  }
}

/* ── Color palette per leave type — cycles through vibrant colors ── */
const CARD_STYLES = [
  { color: 'bg-emerald-500', lightColor: 'bg-emerald-50', textColor: 'text-emerald-600', bgColor: 'from-emerald-500 to-green-600', icon: '🌿' },
  { color: 'bg-blue-500', lightColor: 'bg-blue-50', textColor: 'text-blue-600', bgColor: 'from-blue-500 to-indigo-600', icon: '🏖️' },
  { color: 'bg-amber-500', lightColor: 'bg-amber-50', textColor: 'text-amber-600', bgColor: 'from-amber-500 to-orange-600', icon: '⚠️' },
  { color: 'bg-rose-500', lightColor: 'bg-rose-50', textColor: 'text-rose-600', bgColor: 'from-rose-500 to-pink-600', icon: '👶' },
  { color: 'bg-violet-500', lightColor: 'bg-violet-50', textColor: 'text-violet-600', bgColor: 'from-violet-500 to-purple-600', icon: '👨‍🍼' },
  { color: 'bg-cyan-500', lightColor: 'bg-cyan-50', textColor: 'text-cyan-600', bgColor: 'from-cyan-500 to-teal-600', icon: '🤒' },
  { color: 'bg-indigo-500', lightColor: 'bg-indigo-50', textColor: 'text-indigo-600', bgColor: 'from-indigo-500 to-blue-600', icon: '📋' },
  { color: 'bg-teal-500', lightColor: 'bg-teal-50', textColor: 'text-teal-600', bgColor: 'from-teal-500 to-green-600', icon: '🎯' },
  { color: 'bg-orange-500', lightColor: 'bg-orange-50', textColor: 'text-orange-600', bgColor: 'from-orange-500 to-red-600', icon: '📅' },
  { color: 'bg-fuchsia-500', lightColor: 'bg-fuchsia-50', textColor: 'text-fuchsia-600', bgColor: 'from-fuchsia-500 to-pink-600', icon: '✨' },
];

/* ── Main component ── */
export default function LeaveBalancePage() {
  useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [balances, setBalances] = useState<LeaveBalanceCard[]>([]);
  const [history, setHistory] = useState<LeaveHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeName, setEmployeeName] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const headers = getAuthHeaders();

      // ── 1. Get the current user's employee.id ──
      let employeeId = '';
      try {
        const meRes = await fetch('/api/auth/me', { headers });
        if (meRes.ok) {
          const meData = await meRes.json();
          employeeId = meData?.employee?.id || '';
          setEmployeeName(
            meData?.employee
              ? `${meData.employee.firstName || ''} ${meData.employee.lastName || ''}`.trim()
              : meData?.name || ''
          );
        }
      } catch { /* non-fatal */ }

      // ── 2. Fetch ALL leave types from the DB (the source of truth) ──
      // This ensures every leave type in the company shows a card, even if
      // the balance API hasn't created a LeaveBalance row yet.
      const ltRes = await fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers });
      let leaveTypes: Array<{
        id: string; name: string; code: string; defaultDays: number;
        isPaid: boolean; carryForward: boolean; maxCarryForward: number;
      }> = [];
      if (ltRes.ok) {
        const ltData = await ltRes.json();
        leaveTypes = (ltData.data || ltData.leaveTypes || []).map((lt: Record<string, unknown>) => ({
          id: String(lt.id || ''),
          name: String(lt.name || ''),
          code: String(lt.code || ''),
          defaultDays: Number(lt.defaultDays || 0),
          isPaid: Boolean(lt.isPaid),
          carryForward: Boolean(lt.carryForward),
          maxCarryForward: Number(lt.maxCarryForward || 0),
        }));
      }

      // ── 3. Fetch leave balances (filtered to own employeeId) ──
      // Overlay the balance data (used/remaining) on top of the leave types.
      const balUrl = employeeId
        ? `/api/leave/balance?employeeId=${employeeId}${sq ? `&${sq}` : ''}`
        : `/api/leave/balance${sq ? `?${sq}` : ''}`;
      const balRes = await fetch(balUrl, { headers });
      let balanceMap = new Map<string, { total: number; used: number; remaining: number; carryForward: number }>();
      if (balRes.ok) {
        const balData = await balRes.json();
        const rawBalances = (balData.balances || balData.leaveBalances || []) as Array<{
          leaveType?: { code?: string } | null;
          total?: number; used?: number; remaining?: number; carryForward?: number;
        }>;
        for (const b of rawBalances) {
          const code = String(b.leaveType?.code || '');
          if (!code) continue;
          // Keep the first non-zero entry per code (dedupe cross-company dupes)
          const existing = balanceMap.get(code);
          if (!existing || (Number(b.total ?? 0) > 0 && existing.total === 0)) {
            balanceMap.set(code, {
              total: Number(b.total ?? 0),
              used: Number(b.used ?? 0),
              remaining: Number(b.remaining ?? 0),
              carryForward: Number(b.carryForward ?? 0),
            });
          }
        }
      }

      // ── 4. Build cards: one per leave type from the DB ──
      // For each leave type, use the balance data if available; otherwise
      // fall back to the leave type's defaultDays as the total with 0 used.
      const mapped: LeaveBalanceCard[] = leaveTypes.map((lt, idx) => {
        const colors = CARD_STYLES[idx % CARD_STYLES.length];
        const bal = balanceMap.get(lt.code);
        const total = bal?.total ?? lt.defaultDays;
        const used = bal?.used ?? 0;
        const remaining = bal?.remaining ?? Math.max(0, total - used);
        const carryForward = bal?.carryForward ?? 0;
        return {
          id: lt.id,
          type: lt.name,
          code: lt.code,
          total,
          used,
          remaining,
          carryForward,
          pending: 0,
          isPaid: lt.isPaid,
          ...colors,
        };
      });

      setBalances(mapped);

      // ── 3. Fetch recent leave history ──
      const histUrl = `/api/leave?view=self&limit=5${sq ? `&${sq}` : ''}`;
      const histRes = await fetch(histUrl, { headers });
      if (histRes.ok) {
        const histData = await histRes.json();
        const rawHistory = histData.leaveRequests || histData.leaves || histData.applications || histData.data || [];
        const mappedHistory: LeaveHistory[] = (Array.isArray(rawHistory) ? rawHistory : []).map((l: Record<string, unknown>) => ({
          id: String(l.id || ''),
          type: String(
            (l as any).leaveType?.name ||
            (l as any).leaveTypeName ||
            l.type ||
            ''
          ),
          from: String(l.startDate || l.from || ''),
          to: String(l.endDate || l.to || ''),
          days: Number(l.totalDays || l.days || 0),
          status: String(l.status || '').replace(/^\w/, c => c.toUpperCase()),
          halfDay: Boolean((l as any).halfDay),
        }));
        setHistory(mappedHistory);
      } else {
        setHistory([]);
      }
    } catch {
      setBalances([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [scopeQuery, selectedTenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Summary stats ──
  const totalAllocated = balances.reduce((s, b) => s + b.total, 0);
  const totalUsed = balances.reduce((s, b) => s + b.used, 0);
  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0);
  const overallUsage = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <FiRefreshCw className="w-5 h-5 text-thb-text-muted animate-spin" />
        <span className="ml-2 text-sm text-thb-text-muted">Loading leave balance…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-50">
            <FiPieChart className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">My Leave Balance</h1>
            <p className="text-sm text-thb-text-secondary">
              {employeeName ? `${employeeName}'s leave overview` : 'Overview of your leave entitlements and usage'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 text-thb-text-secondary hover:text-thb-text-primary rounded-lg text-sm transition-colors border border-thb-border hover:bg-slate-50"
          title="Refresh"
        >
          <FiRefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary bar — total allocated / used / remaining across all types */}
      {balances.length > 0 && (
        <div className="thb-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-thb-text-primary">{balances.length}</p>
            <p className="text-xs text-thb-text-muted">Leave Types</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{totalAllocated}</p>
            <p className="text-xs text-thb-text-muted">Total Allocated</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{totalUsed}</p>
            <p className="text-xs text-thb-text-muted">Total Used</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{totalRemaining}</p>
            <p className="text-xs text-thb-text-muted">Total Remaining</p>
          </div>
        </div>
      )}

      {/* Leave Balance Cards — one per leave type */}
      {balances.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <FiPieChart className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-thb-text-primary">No leave balance data available</p>
          <p className="text-xs text-thb-text-muted mt-1">
            Leave balance cards will appear here once leave types are configured for your company.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map((lb) => {
            const available = lb.remaining;
            const usagePercent = lb.total > 0 ? Math.round((lb.used / lb.total) * 100) : 0;
            const isLowBalance = lb.total > 0 && available <= Math.ceil(lb.total * 0.2);
            return (
              <div
                key={lb.id}
                className={`thb-card p-5 relative overflow-hidden ${isLowBalance && available > 0 ? 'border-amber-300' : ''}`}
              >
                {/* Gradient accent bar at top */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${lb.bgColor}`} />

                {/* Header — icon + name + available count */}
                <div className="flex items-start justify-between mb-4 mt-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${lb.lightColor} flex items-center justify-center text-xl`}>
                      {lb.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-thb-text-primary text-sm">{lb.type}</h3>
                      <p className="text-xs text-thb-text-muted font-mono">{lb.code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${lb.textColor}`}>{available}</p>
                    <p className="text-[10px] text-thb-text-muted">available</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-thb-text-secondary flex items-center gap-1">
                      <FiTrendingUp className="w-3 h-3" /> Usage
                    </span>
                    <span className={`text-[10px] font-bold ${usagePercent > 80 ? 'text-amber-600' : 'text-thb-text-secondary'}`}>
                      {usagePercent}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${lb.bgColor} transition-all duration-500`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid — Total / Used / Remaining */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-thb-border">
                  <div className="text-center">
                    <p className="text-base font-bold text-thb-text-primary">{lb.total}</p>
                    <p className="text-[10px] text-thb-text-muted">Allocated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-amber-600">{lb.used}</p>
                    <p className="text-[10px] text-thb-text-muted">Used</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-base font-bold ${available > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{available}</p>
                    <p className="text-[10px] text-thb-text-muted">Remaining</p>
                  </div>
                </div>

                {/* Carry-forward + pending badges */}
                {(lb.carryForward > 0 || lb.pending > 0) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-thb-border">
                    {lb.carryForward > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">
                        CF: {lb.carryForward}d
                      </span>
                    )}
                    {lb.pending > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        Pending: {lb.pending}d
                      </span>
                    )}
                  </div>
                )}

                {/* Low balance warning */}
                {isLowBalance && available > 0 && (
                  <div className="mt-2 text-[10px] text-amber-600 flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3" /> Low balance — {available} day(s) left
                  </div>
                )}
                {available === 0 && lb.total > 0 && (
                  <div className="mt-2 text-[10px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3" /> Fully used
                  </div>
                )}
                {lb.total === 0 && (
                  <div className="mt-2 text-[10px] text-thb-text-muted flex items-center gap-1">
                    <FiClock className="w-3 h-3" /> No quota allocated
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Leave History */}
      <div className="thb-card">
        <div className="px-5 py-4 border-b border-thb-border flex items-center justify-between">
          <h2 className="font-semibold text-thb-text-primary">Recent Leave History</h2>
          {history.length > 0 && (
            <span className="text-xs text-thb-text-muted">Last {history.length} requests</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-thb-border bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">From</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">To</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Days</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10">
                    <FiCalendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-thb-text-muted">No recent leave history</p>
                    <p className="text-xs text-thb-text-muted mt-1">Your leave applications will appear here.</p>
                  </td>
                </tr>
              ) : history.map((item) => (
                <tr key={item.id} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-thb-text-primary font-medium">{item.type}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-secondary">{formatDate(item.from)}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-secondary">{formatDate(item.to)}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-primary text-center">
                    {item.days}{item.halfDay && ' (½)'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${getStatusBadge(item.status)}`}>
                      {getStatusIcon(item.status)}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
