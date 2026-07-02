'use client';

import { useState, useMemo } from 'react';
import {
  FiShoppingCart, FiDollarSign, FiCalendar, FiDownload,
  FiFilter, FiTrendingUp, FiRefreshCw, FiCreditCard,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface Transaction {
  id: string;
  companyName: string;
  plan: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  paymentMethod: string;
  date: string;
}

const demoTransactions: Transaction[] = [
  { id: 'TXN-1001', companyName: 'Acme Global Corp', plan: 'Enterprise', amount: 12000, status: 'completed', paymentMethod: 'Credit Card', date: '2025-01-15' },
  { id: 'TXN-1002', companyName: 'TechStart Solutions', plan: 'Professional', amount: 299, status: 'completed', paymentMethod: 'PayPal', date: '2025-03-01' },
  { id: 'TXN-1003', companyName: 'Nexus Innovations', plan: 'Enterprise', amount: 12000, status: 'completed', paymentMethod: 'Wire Transfer', date: '2025-02-01' },
  { id: 'TXN-1004', companyName: 'BrightPath Inc', plan: 'Professional', amount: 3588, status: 'refunded', paymentMethod: 'Credit Card', date: '2025-01-20' },
  { id: 'TXN-1005', companyName: 'Vertex Dynamics', plan: 'Starter', amount: 49, status: 'completed', paymentMethod: 'Credit Card', date: '2025-04-20' },
  { id: 'TXN-1006', companyName: 'Orion Systems', plan: 'Professional', amount: 299, status: 'failed', paymentMethod: 'PayPal', date: '2025-05-01' },
  { id: 'TXN-1007', companyName: 'PeakPerformance Ltd', plan: 'Enterprise', amount: 12000, status: 'completed', paymentMethod: 'Wire Transfer', date: '2025-01-01' },
  { id: 'TXN-1008', companyName: 'CloudFirst Tech', plan: 'Starter', amount: 0, status: 'completed', paymentMethod: 'Free Trial', date: '2025-06-20' },
  { id: 'TXN-1009', companyName: 'QuantumLeap Corp', plan: 'Professional', amount: 299, status: 'completed', paymentMethod: 'Credit Card', date: '2025-05-15' },
  { id: 'TXN-1010', companyName: 'StellarHR Inc', plan: 'Enterprise', amount: 12000, status: 'pending', paymentMethod: 'Wire Transfer', date: '2025-06-25' },
  { id: 'TXN-1011', companyName: 'NovaCorp', plan: 'Starter', amount: 49, status: 'completed', paymentMethod: 'Credit Card', date: '2025-03-15' },
  { id: 'TXN-1012', companyName: 'Acme Global Corp', plan: 'Enterprise', amount: 12000, status: 'completed', paymentMethod: 'Credit Card', date: '2024-07-15' },
  { id: 'TXN-1013', companyName: 'TechStart Solutions', plan: 'Professional', amount: 299, status: 'completed', paymentMethod: 'PayPal', date: '2024-09-01' },
  { id: 'TXN-1014', companyName: 'Zenith Works', plan: 'Professional', amount: 299, status: 'failed', paymentMethod: 'Credit Card', date: '2025-04-10' },
  { id: 'TXN-1015', companyName: 'Atlas Digital', plan: 'Enterprise', amount: 12000, status: 'completed', paymentMethod: 'Wire Transfer', date: '2025-06-01' },
  { id: 'TXN-1016', companyName: 'Momentum Labs', plan: 'Starter', amount: 49, status: 'pending', paymentMethod: 'Credit Card', date: '2025-06-28' },
];

const statusBadge: Record<string, string> = {
  completed: 'thb-badge thb-badge-success',
  pending: 'thb-badge thb-badge-warning',
  failed: 'thb-badge thb-badge-error',
  refunded: 'thb-badge thb-badge-info',
};

const monthlyRevenue = [
  { month: 'Jan', revenue: 24000 },
  { month: 'Feb', revenue: 12000 },
  { month: 'Mar', revenue: 15347 },
  { month: 'Apr', revenue: 7488 },
  { month: 'May', revenue: 12598 },
  { month: 'Jun', revenue: 24098 },
];

export default function PurchaseTransactionsPage() {
  const { user } = useAuthStore();
  const [transactions] = useState<Transaction[]>(demoTransactions);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    let result = transactions;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    if (dateFrom) result = result.filter((t) => t.date >= dateFrom);
    if (dateTo) result = result.filter((t) => t.date <= dateTo);
    return result;
  }, [transactions, statusFilter, dateFrom, dateTo]);

  const totalRevenue = transactions.filter((t) => t.status === 'completed').reduce((s, t) => s + t.amount, 0);
  const thisMonth = transactions.filter((t) => t.status === 'completed' && t.date.startsWith('2025-06')).reduce((s, t) => s + t.amount, 0);
  const pendingAmount = transactions.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const refundedAmount = transactions.filter((t) => t.status === 'refunded').reduce((s, t) => s + t.amount, 0);

  const handleExport = () => {
    const csv = ['ID,Company,Plan,Amount,Status,Payment Method,Date', ...filtered.map((t) => `${t.id},${t.companyName},${t.plan},${t.amount},${t.status},${t.paymentMethod},${t.date}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully');
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><FiShoppingCart className="w-7 h-7" /> Purchase Transactions</h1>
            <p className="text-amber-100 mt-1 text-sm">Track all platform payment transactions, invoices, and refunds</p>
          </div>
          <button onClick={handleExport} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors">
            <FiDownload className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: <FiDollarSign className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-500' },
          { label: 'This Month', value: `$${thisMonth.toLocaleString()}`, icon: <FiTrendingUp className="w-5 h-5" />, bg: 'bg-blue-50 text-blue-500' },
          { label: 'Pending', value: `$${pendingAmount.toLocaleString()}`, icon: <FiRefreshCw className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-500' },
          { label: 'Refunded', value: `$${refundedAmount.toLocaleString()}`, icon: <FiCreditCard className="w-5 h-5" />, bg: 'bg-red-50 text-red-500' },
        ].map((card) => (
          <div key={card.label} className="thb-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-thb-text-muted">{card.label}</p>
                <p className="text-2xl font-bold text-thb-text-primary mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="thb-card p-4 flex flex-wrap items-center gap-3">
            <FiFilter className="w-4 h-4 text-thb-text-muted" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <div className="flex items-center gap-2">
              <FiCalendar className="w-3.5 h-3.5 text-thb-text-muted" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <span className="text-thb-text-muted text-xs">to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <span className="text-xs text-thb-text-muted ml-auto">{filtered.length} transactions</span>
          </div>

          {/* Table */}
          <div className="thb-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-thb-text-muted border-b border-thb-border bg-slate-50">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr></thead>
                <tbody>
                  {filtered.map((txn) => (
                    <tr key={txn.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-thb-text-secondary">{txn.id}</td>
                      <td className="px-4 py-3 font-medium text-thb-text-primary">{txn.companyName}</td>
                      <td className="px-4 py-3"><span className="thb-badge thb-badge-info">{txn.plan}</span></td>
                      <td className="px-4 py-3 font-medium text-thb-text-primary">${txn.amount.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={statusBadge[txn.status]}>{txn.status}</span></td>
                      <td className="px-4 py-3 text-thb-text-secondary text-xs">{txn.paymentMethod}</td>
                      <td className="px-4 py-3 text-thb-text-secondary">{txn.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4 flex items-center gap-2"><FiTrendingUp className="w-4 h-4" /> Monthly Revenue</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
