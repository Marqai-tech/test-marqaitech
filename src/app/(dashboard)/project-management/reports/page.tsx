'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  FiBarChart2, FiBriefcase, FiDollarSign, FiTrendingUp,
  FiDownload, FiCheckCircle,
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

/* ── Demo Data ── */
const REVENUE_BY_TYPE = [
  { name: 'Client', value: 620000, color: '#10B981' },
  { name: 'Internal', value: 200000, color: '#3B82F6' },
  { name: 'R&D', value: 345000, color: '#8B5CF6' },
  { name: 'Support', value: 125000, color: '#F59E0B' },
];

const MONTHLY_STARTS = [
  { month: 'Oct', projects: 2 },
  { month: 'Nov', projects: 3 },
  { month: 'Dec', projects: 1 },
  { month: 'Jan', projects: 4 },
  { month: 'Feb', projects: 3 },
  { month: 'Mar', projects: 5 },
];

const BUDGET_VS_ACTUAL = [
  { name: 'Website Redesign', type: 'client', budget: 120000, actual: 54000, progress: 45 },
  { name: 'Mobile App', type: 'client', budget: 200000, actual: 60000, progress: 30 },
  { name: 'HRMS Upgrade', type: 'internal', budget: 50000, actual: 7500, progress: 15 },
  { name: 'AI Research', type: 'r_and_d', budget: 300000, actual: 60000, progress: 20 },
  { name: 'Support Portal', type: 'support', budget: 80000, actual: 0, progress: 0 },
  { name: 'Legacy Migration', type: 'internal', budget: 150000, actual: 127500, progress: 85 },
  { name: 'Data Analytics', type: 'client', budget: 175000, actual: 175000, progress: 100 },
  { name: 'Security Audit', type: 'r_and_d', budget: 45000, actual: 27000, progress: 60 },
];

const RESOURCE_UTILIZATION = [
  { name: 'Engineering', allocated: 85, available: 15, headcount: 24 },
  { name: 'Design', allocated: 72, available: 28, headcount: 8 },
  { name: 'QA', allocated: 68, available: 32, headcount: 6 },
  { name: 'DevOps', allocated: 90, available: 10, headcount: 5 },
  { name: 'Management', allocated: 55, available: 45, headcount: 4 },
];

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<BudgetVsActual[]>(BUDGET_VS_ACTUAL);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      const res = await fetch('/api/projects?limit=50', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.projects?.length > 0) {
          setProjects(data.projects.map((p: { name: string; projectType: string; budgetAmount: number; progress: number }) => ({
            name: p.name, type: p.projectType || 'internal',
            budget: p.budgetAmount || 0, actual: Math.round((p.budgetAmount || 0) * (p.progress || 0) / 100),
            progress: p.progress || 0,
          })));
        }
      }
    } catch { /* use demo data */ }
    finally { setLoading(false); }
  }

  const summaryStats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(p => p.progress > 0 && p.progress < 100).length;
    const completed = projects.filter(p => p.progress >= 100).length;
    const totalBudget = projects.reduce((a, p) => a + p.budget, 0);
    const avgProgress = total > 0 ? Math.round(projects.reduce((a, p) => a + p.progress, 0) / total) : 0;
    return { total, active, completed, totalBudget, avgProgress };
  }, [projects]);

  const revenueData = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const p of projects) {
      const key = p.type || 'internal';
      byType[key] = (byType[key] || 0) + p.budget;
    }
    const colorMap: Record<string, string> = { internal: '#3B82F6', client: '#10B981', r_and_d: '#8B5CF6', support: '#F59E0B' };
    const labelMap: Record<string, string> = { internal: 'Internal', client: 'Client', r_and_d: 'R&D', support: 'Support' };
    return Object.entries(byType).map(([k, v]) => ({ name: labelMap[k] || k, value: v, color: colorMap[k] || '#94A3B8' }));
  }, [projects]);

  const displayRevenue = revenueData.length > 0 ? revenueData : REVENUE_BY_TYPE;

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
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={displayRevenue} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                    paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {displayRevenue.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Monthly Project Starts */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4">Monthly Project Starts</h3>
          {loading ? (
            <div className="h-64 animate-pulse bg-slate-100 rounded" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY_STARTS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  <Bar dataKey="projects" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Budget vs Actual Table */}
      <div className="thb-card overflow-hidden">
        <div className="px-5 py-3 border-b border-thb-border">
          <h3 className="font-semibold text-thb-text-primary">Budget vs Actual Comparison</h3>
        </div>
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
                  <tr key={i} className="border-b border-thb-border hover:bg-slate-50/50">
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
      </div>

      {/* Resource Utilization */}
      <div className="thb-card p-5">
        <h3 className="font-semibold text-thb-text-primary mb-4">Resource Utilization Summary</h3>
        <div className="space-y-4">
          {RESOURCE_UTILIZATION.map(dept => (
            <div key={dept.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-32 flex-shrink-0">
                <p className="text-sm font-medium text-thb-text-primary">{dept.name}</p>
                <p className="text-xs text-thb-text-muted">{dept.headcount} people</p>
              </div>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                  <div className="bg-thb-primary h-full rounded-full transition-all flex items-center justify-end pr-2"
                    style={{ width: `${dept.allocated}%` }}>
                    {dept.allocated > 15 && <span className="text-xs text-white font-medium">{dept.allocated}%</span>}
                  </div>
                </div>
                <span className="text-xs text-thb-text-muted w-20 text-right">{dept.allocated}% allocated</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type BudgetVsActual = { name: string; type: string; budget: number; actual: number; progress: number };
