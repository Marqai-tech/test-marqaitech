'use client';

import {
  FiPieChart, FiCalendar,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── Data ── */
const leaveBalances = [
  { type: 'Casual Leave', code: 'CL', total: 12, used: 4, pending: 1, color: 'bg-blue-500', lightColor: 'bg-blue-100', textColor: 'text-blue-600' },
  { type: 'Sick Leave', code: 'SL', total: 10, used: 2, pending: 0, color: 'bg-rose-500', lightColor: 'bg-rose-100', textColor: 'text-rose-600' },
  { type: 'Earned Leave', code: 'EL', total: 15, used: 5, pending: 2, color: 'bg-emerald-500', lightColor: 'bg-emerald-100', textColor: 'text-emerald-600' },
  { type: 'Comp Off', code: 'CO', total: 3, used: 1, pending: 0, color: 'bg-amber-500', lightColor: 'bg-amber-100', textColor: 'text-amber-600' },
];

const recentHistory = [
  { id: '1', type: 'Casual Leave', from: '2026-01-15', to: '2026-01-16', days: 2, status: 'Approved' },
  { id: '2', type: 'Sick Leave', from: '2026-01-20', to: '2026-01-20', days: 1, status: 'Approved' },
  { id: '3', type: 'Earned Leave', from: '2026-02-05', to: '2026-02-09', days: 5, status: 'Pending' },
  { id: '4', type: 'Casual Leave', from: '2026-02-15', to: '2026-02-15', days: 1, status: 'Rejected' },
  { id: '5', type: 'Comp Off', from: '2026-03-01', to: '2026-03-01', days: 1, status: 'Approved' },
];

/* ── Helpers ── */
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'Approved': return 'thb-badge thb-badge-success';
    case 'Pending': return 'thb-badge thb-badge-warning';
    case 'Rejected': return 'thb-badge thb-badge-error';
    default: return 'thb-badge thb-badge-info';
  }
}

export default function LeaveBalancePage() {
  useAuthStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50">
          <FiPieChart className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">My Leave Balance</h1>
          <p className="text-sm text-thb-text-secondary">Overview of your leave entitlements and usage</p>
        </div>
      </div>

      {/* Leave Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {leaveBalances.map((lb) => {
          const available = lb.total - lb.used - lb.pending;
          const usagePercent = Math.round((lb.used / lb.total) * 100);
          return (
            <div key={lb.code} className="thb-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${lb.lightColor} flex items-center justify-center`}>
                    <FiCalendar className={`w-5 h-5 ${lb.textColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-thb-text-primary">{lb.type}</h3>
                    <p className={`text-2xl font-bold ${lb.textColor}`}>{available} <span className="text-sm font-normal text-thb-text-muted">available</span></p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-thb-text-secondary">Usage</span>
                  <span className="text-xs font-medium text-thb-text-primary">{usagePercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${lb.color} transition-all duration-500`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-thb-border">
                <div className="text-center">
                  <p className="text-lg font-bold text-thb-text-primary">{lb.total}</p>
                  <p className="text-xs text-thb-text-muted">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-thb-text-primary">{lb.used}</p>
                  <p className="text-xs text-thb-text-muted">Used</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-thb-text-primary">{available}</p>
                  <p className="text-xs text-thb-text-muted">Available</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Leave History */}
      <div className="thb-card">
        <div className="px-5 py-4 border-b border-thb-border">
          <h2 className="font-semibold text-thb-text-primary">Recent Leave History</h2>
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
              {recentHistory.map((item) => (
                <tr key={item.id} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-thb-text-primary font-medium">{item.type}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-secondary">{formatDate(item.from)}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-secondary">{formatDate(item.to)}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-primary text-center">{item.days}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={getStatusBadge(item.status)}>{item.status}</span>
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
