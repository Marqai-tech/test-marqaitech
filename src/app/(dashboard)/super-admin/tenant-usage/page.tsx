'use client';

import { useState } from 'react';
import {
  FiBarChart2, FiDatabase, FiUsers, FiCpu, FiHardDrive,
  FiActivity, FiLayers,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface TenantUsage {
  id: string;
  tenantName: string;
  employeesUsed: number;
  employeesLimit: number;
  storageUsed: number;
  storageLimit: number;
  modules: string[];
  lastActive: string;
  apiCallsToday: number;
}

const demoUsage: TenantUsage[] = [
  { id: 'tu-001', tenantName: 'Acme Global Corp', employeesUsed: 420, employeesLimit: 500, storageUsed: 7200, storageLimit: 10000, modules: ['Payroll', 'Recruitment', 'Attendance', 'Performance'], lastActive: '2025-06-30', apiCallsToday: 4521 },
  { id: 'tu-002', tenantName: 'TechStart Solutions', employeesUsed: 45, employeesLimit: 50, storageUsed: 1800, storageLimit: 2000, modules: ['Payroll', 'Attendance'], lastActive: '2025-06-30', apiCallsToday: 892 },
  { id: 'tu-003', tenantName: 'GlobalHR Services', employeesUsed: 12, employeesLimit: 25, storageUsed: 320, storageLimit: 500, modules: ['Payroll'], lastActive: '2025-06-29', apiCallsToday: 145 },
  { id: 'tu-004', tenantName: '3Boxes Innovations', employeesUsed: 380, employeesLimit: 500, storageUsed: 8500, storageLimit: 10000, modules: ['Payroll', 'Recruitment', 'Attendance', 'Performance', 'Projects'], lastActive: '2025-06-30', apiCallsToday: 3780 },
  { id: 'tu-005', tenantName: 'BrightPath Inc', employeesUsed: 180, employeesLimit: 200, storageUsed: 4100, storageLimit: 5000, modules: ['Payroll', 'Recruitment', 'Attendance'], lastActive: '2025-06-28', apiCallsToday: 1230 },
  { id: 'tu-006', tenantName: 'Vertex Dynamics', employeesUsed: 8, employeesLimit: 50, storageUsed: 450, storageLimit: 2000, modules: ['Payroll', 'Attendance'], lastActive: '2025-06-27', apiCallsToday: 67 },
  { id: 'tu-007', tenantName: 'Orion Systems', employeesUsed: 150, employeesLimit: 200, storageUsed: 3900, storageLimit: 5000, modules: ['Payroll', 'Recruitment'], lastActive: '2025-06-25', apiCallsToday: 0 },
  { id: 'tu-008', tenantName: 'PeakPerformance Ltd', employeesUsed: 950, employeesLimit: 9999, storageUsed: 22000, storageLimit: 50000, modules: ['Payroll', 'Recruitment', 'Attendance', 'Performance', 'Projects', 'AI'], lastActive: '2025-06-30', apiCallsToday: 8920 },
];

const employeeDistribution = [
  { tenant: 'Acme', employees: 420 },
  { tenant: 'TechStart', employees: 45 },
  { tenant: 'GlobalHR', employees: 12 },
  { tenant: '3Boxes', employees: 380 },
  { tenant: 'BrightPath', employees: 180 },
  { tenant: 'Vertex', employees: 8 },
  { tenant: 'Orion', employees: 150 },
  { tenant: 'PeakPerf', employees: 950 },
];

function getUsageColor(pct: number) {
  if (pct > 90) return 'bg-red-500';
  if (pct > 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getUsageText(pct: number) {
  if (pct > 90) return 'text-red-600';
  if (pct > 70) return 'text-amber-600';
  return 'text-emerald-600';
}

function formatMB(mb: number) {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

export default function TenantUsagePage() {
  const { user } = useAuthStore();
  const [usage] = useState<TenantUsage[]>(demoUsage);

  const totalStorage = usage.reduce((s, u) => s + u.storageUsed, 0);
  const avgEmployees = Math.round(usage.reduce((s, u) => s + u.employeesUsed, 0) / usage.length);
  const allModules = [...new Set(usage.flatMap((u) => u.modules))];
  const totalApiCalls = usage.reduce((s, u) => s + u.apiCallsToday, 0);

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-cyan-600 via-green-500 to-emerald-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><FiBarChart2 className="w-7 h-7" /> Tenant Usage Metrics</h1>
            <p className="text-green-100 mt-1 text-sm">Monitor resource utilization and usage patterns across all tenants</p>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Storage Used', value: formatMB(totalStorage), icon: <FiHardDrive className="w-5 h-5" />, bg: 'bg-cyan-50 text-cyan-500' },
          { label: 'Avg Employee Count', value: avgEmployees, icon: <FiUsers className="w-5 h-5" />, bg: 'bg-green-50 text-green-500' },
          { label: 'Active Modules', value: allModules.length, icon: <FiLayers className="w-5 h-5" />, bg: 'bg-teal-50 text-teal-500' },
          { label: 'API Calls Today', value: totalApiCalls.toLocaleString(), icon: <FiCpu className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-500' },
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
        {/* Usage Table */}
        <div className="lg:col-span-2 thb-card overflow-hidden">
          <div className="p-4 border-b border-thb-border">
            <h3 className="font-semibold text-thb-text-primary flex items-center gap-2"><FiDatabase className="w-4 h-4" /> Per-Tenant Usage</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-thb-text-muted border-b border-thb-border bg-slate-50">
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Employees</th>
                <th className="px-4 py-3 font-medium">Storage</th>
                <th className="px-4 py-3 font-medium">Modules</th>
                <th className="px-4 py-3 font-medium">API Today</th>
                <th className="px-4 py-3 font-medium">Last Active</th>
              </tr></thead>
              <tbody>
                {usage.map((u) => {
                  const empPct = Math.round((u.employeesUsed / u.employeesLimit) * 100);
                  const stoPct = Math.round((u.storageUsed / u.storageLimit) * 100);
                  return (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-thb-text-primary">{u.tenantName}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-thb-text-secondary">{u.employeesUsed}/{u.employeesLimit}</span>
                            <span className={`font-medium ${getUsageText(empPct)}`}>{empPct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${getUsageColor(empPct)}`} style={{ width: `${Math.min(empPct, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-thb-text-secondary">{formatMB(u.storageUsed)}/{formatMB(u.storageLimit)}</span>
                            <span className={`font-medium ${getUsageText(stoPct)}`}>{stoPct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${getUsageColor(stoPct)}`} style={{ width: `${Math.min(stoPct, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">{u.modules.slice(0, 3).map((m) => <span key={m} className="thb-badge thb-badge-info text-[10px]">{m}</span>)}{u.modules.length > 3 && <span className="thb-badge thb-badge-warning text-[10px]">+{u.modules.length - 3}</span>}</div>
                      </td>
                      <td className="px-4 py-3 text-thb-text-primary font-medium">{u.apiCallsToday.toLocaleString()}</td>
                      <td className="px-4 py-3 text-thb-text-secondary">{u.lastActive}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Employee Distribution Chart */}
        <div className="thb-card p-5">
          <h3 className="font-semibold text-thb-text-primary mb-4 flex items-center gap-2"><FiActivity className="w-4 h-4" /> Employee Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={employeeDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis dataKey="tenant" type="category" tick={{ fontSize: 11 }} stroke="#94A3B8" width={70} />
                <Tooltip formatter={(value: number) => [value, 'Employees']} />
                <Bar dataKey="employees" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
