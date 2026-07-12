'use client';

import {
  FiGrid, FiGitBranch, FiShield, FiClock, FiBarChart2, FiCheckCircle, FiAlertCircle, FiArrowRight,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── KPI Data ── */
const kpis = [
  { label: 'Active Workflows', value: '12', icon: FiGitBranch, color: 'bg-blue-50 text-blue-600', accent: 'bg-blue-500' },
  { label: 'Policy Documents', value: '28', icon: FiShield, color: 'bg-emerald-50 text-emerald-600', accent: 'bg-emerald-500' },
  { label: 'Pending Approvals', value: '5', icon: FiClock, color: 'bg-amber-50 text-amber-600', accent: 'bg-amber-500' },
  { label: 'Compliance Score', value: '94%', icon: FiBarChart2, color: 'bg-teal-50 text-teal-600', accent: 'bg-teal-500' },
];

/* ── Workflow Activity ── */
const workflowActivity = [
  { id: '1', title: 'Access Revocation — John Doe', status: 'Completed', time: '2 hours ago' },
  { id: '2', title: 'Policy Review — Data Privacy v2.3', status: 'In Progress', time: '4 hours ago' },
  { id: '3', title: 'Compliance Audit — Q1 2026', status: 'Pending', time: '1 day ago' },
  { id: '4', title: 'SOC2 Certification Renewal', status: 'In Progress', time: '2 days ago' },
];

function getWorkflowBadge(status: string) {
  switch (status) {
    case 'Completed': return 'bg-emerald-50 text-emerald-700';
    case 'In Progress': return 'bg-blue-50 text-blue-700';
    case 'Pending': return 'bg-amber-50 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getWorkflowIcon(status: string) {
  switch (status) {
    case 'Completed': return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'In Progress': return <FiArrowRight className="w-4 h-4 text-blue-500" />;
    case 'Pending': return <FiClock className="w-4 h-4 text-amber-500" />;
    default: return <FiAlertCircle className="w-4 h-4 text-slate-400" />;
  }
}

/* ── Compliance Data ── */
const complianceItems = [
  { label: 'GDPR', percent: 98, color: 'bg-blue-500' },
  { label: 'SOC2', percent: 85, color: 'bg-emerald-500' },
  { label: 'Data Privacy', percent: 100, color: 'bg-teal-500' },
  { label: 'Audit Readiness', percent: 72, color: 'bg-amber-500' },
];

export default function GovernancePage() {
  useAuthStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50">
          <FiGrid className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Governance Dashboard</h1>
          <p className="text-sm text-thb-text-secondary">Track workflows, compliance, and policy management</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="thb-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`w-1 h-8 rounded-full ${kpi.accent}`} />
              </div>
              <p className="text-2xl font-bold text-thb-text-primary">{kpi.value}</p>
              <p className="text-xs text-thb-text-muted mt-1">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Bottom Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Workflow Activity */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border">
            <h2 className="font-semibold text-thb-text-primary">Recent Workflow Activity</h2>
            <p className="text-xs text-thb-text-muted mt-0.5">Latest governance workflow updates</p>
          </div>
          <div className="divide-y divide-thb-border">
            {workflowActivity.map((wf) => (
              <div key={wf.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                {getWorkflowIcon(wf.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-thb-text-primary font-medium truncate">{wf.title}</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">{wf.time}</p>
                </div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getWorkflowBadge(wf.status)}`}>
                  {wf.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Overview */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border">
            <h2 className="font-semibold text-thb-text-primary">Compliance Overview</h2>
            <p className="text-xs text-thb-text-muted mt-0.5">Current compliance status across frameworks</p>
          </div>
          <div className="p-5 space-y-5">
            {complianceItems.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-thb-text-primary">{item.label}</span>
                  <span className="text-sm font-bold text-thb-text-primary">{item.percent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all duration-700`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
