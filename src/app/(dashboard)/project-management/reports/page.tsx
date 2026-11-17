'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  FiBarChart2, FiBriefcase, FiDollarSign, FiTrendingUp,
  FiDownload, FiCheckCircle, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

/* ── Types ── */
type BudgetVsActual = { id?: string; name: string; type: string; budget: number; actual: number; progress: number };
type RevenueEntry = { name: string; value: number; color: string };
type MonthlyStart = { month: string; projects: number };

interface ReportData {
  revenueByType: RevenueEntry[];
  monthlyStarts: MonthlyStart[];
  budgetVsActual: BudgetVsActual[];
  summaryStats: {
    total: number;
    active: number;
    completed: number;
    totalBudget: number;
    avgProgress: number;
  };
  taskDistribution: Record<string, number>;
  taskSourceSplit?: { internal: number; external: number };
  overdueTasks: { id: string; name: string; priority: string; project: { name: string } }[];
}

/* ── Empty State Component ── */
function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="h-64 flex flex-col items-center justify-center text-slate-400">
      <FiBarChart2 className="w-8 h-8 mb-2 text-slate-300" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchReportData(); }, []);

  async function fetchReportData() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/project-reports', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to load report data');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  const projects = reportData?.budgetVsActual ?? [];
  const revenueData = reportData?.revenueByType ?? [];
  const monthlyStarts = reportData?.monthlyStarts ?? [];
  const taskDist = reportData?.taskDistribution ?? {};
  const sourceSplit = reportData?.taskSourceSplit ?? { internal: 0, external: 0 };
  const overdueTasks = reportData?.overdueTasks ?? [];

  /* Task 152 — revised reports: resource-utilization (removed capacity module)
     replaced by Task Delivery Analytics aligned with the slimmed PM scope. */
  const taskStatusData = useMemo(() => {
    const order: Array<[string, string, string]> = [
      ['todo', 'To Do', '#64748B'],
      ['in_progress', 'In Progress', '#3B82F6'],
      ['review', 'Review', '#F59E0B'],
      ['done', 'Done', '#10B981'],
      ['cancelled', 'Cancelled', '#EF4444'],
    ];
    return order
      .map(([key, label, color]) => ({ key, label, color, value: taskDist[key] || 0 }))
      .filter((d) => d.value > 0 || taskDist[d.key] !== undefined);
  }, [taskDist]);

  const totalTasks = Object.values(taskDist).reduce((a, b) => a + b, 0);
  const sourceData = [
    { name: 'Internal', value: sourceSplit.internal, color: '#3B82F6' },
    { name: 'External (client)', value: sourceSplit.external, color: '#F59E0B' },
  ].filter((d) => d.value > 0);

  const summaryStats = useMemo(() => {
    if (reportData?.summaryStats) return reportData.summaryStats;
    return { total: 0, active: 0, completed: 0, totalBudget: 0, avgProgress: 0 };
  }, [reportData]);

  function handleExport() {
    toast.success('Report export initiated. File will download shortly.');
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Project Reports</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Analytics and insights for project management</p>
        </div>
        <button onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50">
          <FiDownload className="w-4 h-4" /> Export Report
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="thb-card p-4 border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <FiAlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button onClick={fetchReportData} className="mt-2 text-sm text-red-600 underline hover:text-red-800">
            Retry
          </button>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Projects', value: summaryStats.total, icon: FiBriefcase, color: 'text-thb-primary bg-thb-primary/10' },
          { label: 'Active', value: summaryStats.active, icon: FiTrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Completed', value: summaryStats.completed, icon: FiCheckCircle, color: 'text-green-600 bg-green-50' },
          { label: 'Total Budget', value: formatCurrency(summaryStats.totalBudget), icon: FiDollarSign, color: 'text-amber-600 bg-amber-50' },
          { label: 'Avg Progress', value: `${summaryStats.avgProgress}%`, icon: FiBarChart2, color: 'text-teal-600 bg-teal-50' },
        ].map(stat => (
          <div key={stat.label} className="thb-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-thb-text-muted font-medium">{stat.label}</p>
                <p className="text-xl font-bold text-thb-text-primary mt-1">{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Project Type */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Budget by Project Type</h3>
          {loading ? (
            <div className="h-64 animate-pulse bg-slate-100 rounded" />
          ) : revenueData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={revenueData} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                    paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {revenueData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    formatter={((value: number) => formatCurrency(value)) as never} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No budget data available" />
          )}
        </div>

        {/* Monthly Project Starts */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Monthly Project Starts</h3>
          {loading ? (
            <div className="h-64 animate-pulse bg-slate-100 rounded" />
          ) : monthlyStarts.length > 0 && monthlyStarts.some(m => m.projects > 0) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStarts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  <Bar dataKey="projects" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No project start data available" />
          )}
        </div>
      </div>

      {/* Budget vs Actual Table */}
      <div className="thb-card overflow-hidden">
        <div className="px-5 py-3 border-b border-thb-border">
          <h3 className="font-semibold text-thb-text-primary">Budget vs Actual Comparison</h3>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-thb-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-thb-text-secondary">Project</th>
                  <th className="text-left px-4 py-3 font-medium text-thb-text-secondary">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Budget</th>
                  <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Actual</th>
                  <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Variance</th>
                  <th className="text-left px-4 py-3 font-medium text-thb-text-secondary">Progress</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const variance = p.budget - p.actual;
                  const varClass = variance >= 0 ? 'text-emerald-600' : 'text-red-600';
                  return (
                    <tr key={p.id || i} className="border-b border-thb-border hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-thb-text-primary">{p.name}</td>
                      <td className="px-4 py-3 text-thb-text-secondary capitalize">{(p.type || 'internal').replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-thb-text-secondary">{formatCurrency(p.budget)}</td>
                      <td className="px-4 py-3 text-right text-thb-text-secondary">{formatCurrency(p.actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${varClass}`}>
                        {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5">
                            <div className="bg-thb-primary rounded-full h-1.5" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-xs text-thb-text-muted w-8">{p.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            <FiBarChart2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No project budget data available</p>
          </div>
        )}
      </div>

      {/* Task Delivery Analytics (revised) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task status distribution */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Task Status Distribution</h3>
          {loading ? (
            <div className="h-56 animate-pulse bg-slate-100 rounded" />
          ) : taskStatusData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {taskStatusData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState message="No tasks created yet" />
          )}
        </div>

        {/* Internal vs External split */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Task Source</h3>
          {loading ? (
            <div className="h-56 animate-pulse bg-slate-100 rounded" />
          ) : sourceData.length > 0 ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                      paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {sourceData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="rounded-lg bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-700 font-medium">Internal</p>
                  <p className="text-lg font-bold text-blue-800">{sourceSplit.internal}</p>
                  <p className="text-[10px] text-blue-600">raised by the team</p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-700 font-medium">External</p>
                  <p className="text-lg font-bold text-amber-800">{sourceSplit.external}</p>
                  <p className="text-[10px] text-amber-600">client-raised issues</p>
                </div>
              </div>
            </>
          ) : (
            <EmptyChartState message="No tasks created yet" />
          )}
          {totalTasks > 0 && (
            <p className="text-[11px] text-thb-text-muted mt-3">{totalTasks} tasks across all projects</p>
          )}
        </div>

        {/* Overdue tasks */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Overdue Tasks</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-8 bg-slate-100 rounded" />)}
            </div>
          ) : overdueTasks.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overdueTasks.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-2 border border-thb-border rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-thb-text-primary truncate">{t.name}</p>
                    <p className="text-xs text-thb-text-muted truncate">{t.project?.name || '—'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${
                    t.priority === 'critical' || t.priority === 'high' ? 'bg-red-50 text-red-600' :
                    t.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">
              <FiCheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
              <p className="text-sm">No overdue tasks — all on track</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
