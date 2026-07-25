'use client';

import { useState, useMemo } from 'react';
import {
  FiCreditCard, FiPlus, FiEdit2, FiX, FiFilter,
  FiCheck, FiAlertCircle, FiDollarSign, FiClock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface Subscription {
  id: string;
  companyName: string;
  plan: string;
  status: 'active' | 'expired' | 'trialing' | 'cancelled';
  startDate: string;
  endDate: string;
  amount: number;
  billingCycle: 'monthly' | 'annual';
}

const demoSubscriptions: Subscription[] = [
  { id: 'sub-001', companyName: 'Acme Global Corp', plan: 'Enterprise', status: 'active', startDate: '2025-01-15', endDate: '2026-01-15', amount: 12000, billingCycle: 'annual' },
  { id: 'sub-002', companyName: 'TechStart Solutions', plan: 'Professional', status: 'active', startDate: '2025-03-01', endDate: '2025-09-01', amount: 299, billingCycle: 'monthly' },
  { id: 'sub-003', companyName: 'GlobalHR Services', plan: 'Starter', status: 'trialing', startDate: '2025-06-10', endDate: '2025-07-10', amount: 0, billingCycle: 'monthly' },
  { id: 'sub-004', companyName: 'Nexus Innovations', plan: 'Enterprise', status: 'active', startDate: '2025-02-01', endDate: '2026-02-01', amount: 12000, billingCycle: 'annual' },
  { id: 'sub-005', companyName: 'BrightPath Inc', plan: 'Professional', status: 'expired', startDate: '2024-06-01', endDate: '2025-06-01', amount: 3588, billingCycle: 'annual' },
  { id: 'sub-006', companyName: 'Vertex Dynamics', plan: 'Starter', status: 'active', startDate: '2025-04-20', endDate: '2025-10-20', amount: 49, billingCycle: 'monthly' },
  { id: 'sub-007', companyName: 'Orion Systems', plan: 'Professional', status: 'cancelled', startDate: '2024-11-01', endDate: '2025-05-01', amount: 299, billingCycle: 'monthly' },
  { id: 'sub-008', companyName: 'PeakPerformance Ltd', plan: 'Enterprise', status: 'active', startDate: '2025-01-01', endDate: '2026-01-01', amount: 12000, billingCycle: 'annual' },
  { id: 'sub-009', companyName: 'CloudFirst Tech', plan: 'Starter', status: 'trialing', startDate: '2025-06-20', endDate: '2025-07-20', amount: 0, billingCycle: 'monthly' },
  { id: 'sub-010', companyName: 'QuantumLeap Corp', plan: 'Professional', status: 'active', startDate: '2025-05-15', endDate: '2025-11-15', amount: 299, billingCycle: 'monthly' },
];

const statusBadge: Record<string, string> = {
  active: 'thb-badge thb-badge-success',
  expired: 'thb-badge thb-badge-error',
  trialing: 'thb-badge thb-badge-info',
  cancelled: 'thb-badge thb-badge-warning',
};

const planColors: Record<string, string> = {
  Starter: '#10B981',
  Professional: '#3B82F6',
  Enterprise: '#8B5CF6',
};

export default function SubscriptionsPage() {
  const { user } = useAuthStore();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(demoSubscriptions);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '', plan: 'Starter', status: 'active' as Subscription['status'],
    startDate: '', endDate: '', amount: 0, billingCycle: 'monthly' as 'monthly' | 'annual',
  });

  const filtered = useMemo(() => {
    if (!statusFilter) return subscriptions;
    return subscriptions.filter((s) => s.status === statusFilter);
  }, [subscriptions, statusFilter]);

  // Stats
  const totalSubs = subscriptions.length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const expiringSoon = subscriptions.filter((s) => {
    if (s.status !== 'active') return false;
    const end = new Date(s.endDate);
    const now = new Date();
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff > 0;
  }).length;
  const totalRevenue = subscriptions.filter((s) => s.status === 'active').reduce((sum, s) => sum + s.amount, 0);

  // Pie chart data
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    subscriptions.forEach((s) => { counts[s.plan] = (counts[s.plan] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [subscriptions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.plan) { toast.error('Company name and plan are required'); return; }
    if (editingId) {
      setSubscriptions((prev) => prev.map((s) => s.id === editingId ? { ...s, ...form } : s));
      toast.success('Subscription updated');
    } else {
      setSubscriptions((prev) => [...prev, { ...form, id: `sub-${Date.now()}` }]);
      toast.success('Subscription added');
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ companyName: '', plan: 'Starter', status: 'active', startDate: '', endDate: '', amount: 0, billingCycle: 'monthly' });
  };

  const handleEdit = (sub: Subscription) => {
    setEditingId(sub.id);
    setForm({ companyName: sub.companyName, plan: sub.plan, status: sub.status, startDate: sub.startDate, endDate: sub.endDate, amount: sub.amount, billingCycle: sub.billingCycle });
    setShowForm(true);
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-green-600 via-green-500 to-teal-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <FiCreditCard className="w-7 h-7" /> Subscriptions Management
            </h1>
            <p className="text-green-100 mt-1 text-sm">Monitor and manage all tenant subscriptions across the platform</p>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ companyName: '', plan: 'Starter', status: 'active', startDate: '', endDate: '', amount: 0, billingCycle: 'monthly' }); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors">
            <FiPlus className="w-4 h-4" /> Add Subscription
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Subscriptions', value: totalSubs, icon: <FiCreditCard className="w-5 h-5" />, bg: 'bg-green-50 text-green-500' },
          { label: 'Active', value: activeSubs, icon: <FiCheck className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-500' },
          { label: 'Expiring Soon', value: expiringSoon, icon: <FiAlertCircle className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-500' },
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: <FiDollarSign className="w-5 h-5" />, bg: 'bg-teal-50 text-teal-500' },
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
        {/* Subscription List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter */}
          <div className="thb-card p-4 flex flex-wrap items-center gap-3">
            <FiFilter className="w-4 h-4 text-thb-text-muted" />
            <span className="text-sm text-thb-text-secondary">Filter:</span>
            {['', 'active', 'expired', 'trialing', 'cancelled'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-green-500 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>

          {/* Form */}
          {showForm && (
            <div className="thb-card border-l-4 border-l-green-500 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Subscription' : 'Add Subscription'}</h3>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-lg"><FiX className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Company Name</label><input className={inputCls} value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Plan</label><select className={inputCls} value={form.plan} onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value }))}><option>Starter</option><option>Professional</option><option>Enterprise</option></select></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Subscription['status'] }))}><option value="active">Active</option><option value="trialing">Trialing</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Billing Cycle</label><select className={inputCls} value={form.billingCycle} onChange={(e) => setForm((p) => ({ ...p, billingCycle: e.target.value as 'monthly' | 'annual' }))}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Start Date</label><input type="date" className={inputCls} value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">End Date</label><input type="date" className={inputCls} value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Amount ($)</label><input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))} /></div>
                <div className="flex items-end gap-2"><button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg font-medium text-sm hover:bg-green-600 transition-colors"><FiCheck className="w-4 h-4" />{editingId ? 'Update' : 'Create'}</button></div>
              </form>
            </div>
          )}

          {/* List */}
          <div className="thb-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-thb-text-muted border-b border-thb-border bg-slate-50">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Billing</th>
                  <th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium">End</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {filtered.map((sub) => (
                    <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-thb-text-primary">{sub.companyName}</td>
                      <td className="px-4 py-3"><span className="thb-badge thb-badge-info">{sub.plan}</span></td>
                      <td className="px-4 py-3"><span className={statusBadge[sub.status] || 'thb-badge thb-badge-info'}>{sub.status}</span></td>
                      <td className="px-4 py-3 text-thb-text-secondary">{sub.billingCycle}</td>
                      <td className="px-4 py-3 text-thb-text-secondary">{sub.startDate}</td>
                      <td className="px-4 py-3 text-thb-text-secondary">{sub.endDate}</td>
                      <td className="px-4 py-3 font-medium text-thb-text-primary">${sub.amount.toLocaleString()}</td>
                      <td className="px-4 py-3"><button onClick={() => handleEdit(sub)} className="inline-flex items-center gap-1 text-green-500 hover:text-green-700 text-xs font-medium"><FiEdit2 className="w-3.5 h-3.5" />Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Plan Distribution Chart */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4 flex items-center gap-2"><FiClock className="w-4 h-4" /> Plan Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {planDistribution.map((entry) => <Cell key={entry.name} fill={planColors[entry.name] || '#94A3B8'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {planDistribution.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: planColors[entry.name] || '#94A3B8' }} />
                  <span className="text-thb-text-secondary">{entry.name}</span>
                </div>
                <span className="font-medium text-thb-text-primary">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
