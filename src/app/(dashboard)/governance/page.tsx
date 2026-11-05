'use client';

import { useState, useEffect } from 'react';
import {
  FiGrid, FiGitBranch, FiShield, FiClock, FiBarChart2, FiCheckCircle, FiAlertCircle, FiArrowRight,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
/* Task 156e — shared SmartHR widgets: same gradient banner / stat cards /
   panels as the Employee Module Dashboard (Task 155 gold standard). */
import {
  PageBreadcrumbs, DateChip, Panel, StatCard, StatSkeleton, SkeletonBlock,
} from '@/components/dashboard/smarthr-widgets';

/* ── Types ── */
interface KpiData {
  activeWorkflows: number;
  policyDocuments: number;
  pendingApprovals: number;
  complianceScore: number;
}

interface WorkflowActivityItem {
  id: string;
  title: string;
  status: string;
  time: string;
  module: string;
}

interface ComplianceItem {
  label: string;
  percent: number;
}

interface DashboardData {
  kpis: KpiData;
  workflowActivity: WorkflowActivityItem[];
  complianceItems: ComplianceItem[];
  metrics?: {
    auditLogsLast30Days: number;
    notificationsLast30Days: number;
    totalWorkflowInstances: number;
    completedWorkflowInstances: number;
  };
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  } catch {
    return isoString;
  }
}

function getWorkflowBadge(status: string) {
  switch (status) {
    case 'Completed': return 'bg-emerald-50 text-emerald-700';
    case 'In Progress': return 'bg-green-50 text-green-700';
    case 'Pending': return 'bg-amber-50 text-amber-700';
    case 'Rejected': return 'bg-red-50 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getWorkflowIcon(status: string) {
  switch (status) {
    case 'Completed': return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'In Progress': return <FiArrowRight className="w-4 h-4 text-green-500" />;
    case 'Pending': return <FiClock className="w-4 h-4 text-amber-500" />;
    case 'Rejected': return <FiAlertCircle className="w-4 h-4 text-red-500" />;
    default: return <FiAlertCircle className="w-4 h-4 text-slate-400" />;
  }
}

function getComplianceColor(percent: number) {
  if (percent >= 90) return 'bg-green-500';
  if (percent >= 75) return 'bg-emerald-500';
  if (percent >= 60) return 'bg-teal-500';
  if (percent >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function GovernancePage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Header chip date — same pattern as the Employee Module Dashboard banner */
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/governance/dashboard', { headers: getAuthHeaders() });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to fetch dashboard data (${res.status})`);
        }
        const dashboardData = await res.json();
        setData(dashboardData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load governance dashboard';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchDashboard();
    }
  }, [token]);

  /* ── KPI cards derived from API data (values unchanged — SmartHR StatCard
        styling with the rotating pastel accent palette) ── */
  const kpiCards = data
    ? [
        { label: 'Active Workflows', value: String(data.kpis.activeWorkflows), sub: 'Workflow definitions currently active', icon: FiGitBranch, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20' },
        { label: 'Policy Documents', value: String(data.kpis.policyDocuments), sub: 'Policies published in the library', icon: FiShield, bg: 'bg-[#10B981]/10 text-[#10B981]', ring: 'ring-[#10B981]/20' },
        { label: 'Pending Approvals', value: String(data.kpis.pendingApprovals), sub: 'Approvals waiting on action', icon: FiClock, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-[#FF9B44]/25' },
        { label: 'Compliance Score', value: `${data.kpis.complianceScore}%`, sub: 'Across tracked frameworks', icon: FiBarChart2, bg: 'bg-[#009EFB]/10 text-[#009EFB]', ring: 'ring-[#009EFB]/20' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header — SmartHR gradient breadcrumb banner (Task 156e) */}
      <PageBreadcrumbs
        title="Governance Dashboard"
        trail={['Governance', 'Dashboard']}
        right={<DateChip value={todayChip} />}
      />

      {/* Loading State — SmartHR skeleton pattern (same as /dashboard) */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="thb-card p-8 text-center">
          <FiAlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Data Loaded */}
      {!loading && !error && data && (
        <>
          {/* KPI Cards — shared SmartHR StatCard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <StatCard
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  sub={kpi.sub}
                  icon={<Icon className="w-5 h-5" />}
                  bg={kpi.bg}
                  ring={kpi.ring}
                />
              );
            })}
          </div>

          {/* Bottom Cards — shared SmartHR panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Workflow Activity */}
            <Panel
              title="Recent Workflow Activity"
              icon={<FiGitBranch className="w-4 h-4" />}
              accent="text-[#009EFB]"
              action={<span className="text-xs text-slate-500">Latest governance workflow updates</span>}
            >
              {data.workflowActivity.length === 0 ? (
                <div className="py-10 text-center">
                  <FiGitBranch className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No workflow activity yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {data.workflowActivity.map((wf) => (
                    <div key={wf.id} className="flex items-center gap-3 py-3.5 hover:bg-slate-50 transition-colors">
                      {getWorkflowIcon(wf.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-thb-text-primary font-medium truncate">{wf.title}</p>
                        <p className="text-xs text-thb-text-muted mt-0.5">{formatRelativeTime(wf.time)}</p>
                      </div>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getWorkflowBadge(wf.status)}`}>
                        {wf.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Compliance Overview */}
            <Panel
              title="Compliance Overview"
              icon={<FiShield className="w-4 h-4" />}
              accent="text-[#10B981]"
              action={<span className="text-xs text-slate-500">Current compliance status across frameworks</span>}
            >
              {data.complianceItems.length === 0 ? (
                <div className="py-10 text-center">
                  <FiShield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No compliance data available</p>
                  <p className="text-xs text-thb-text-muted mt-1">Add active policies to see compliance metrics</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {data.complianceItems.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-thb-text-primary">{item.label}</span>
                        <span className="text-sm font-bold text-thb-text-primary">{item.percent}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getComplianceColor(item.percent)} transition-all duration-700`}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Additional Metrics */}
          {data.metrics && (
            <Panel
              title="Additional Metrics"
              icon={<FiBarChart2 className="w-4 h-4" />}
              accent="text-[#6C4FD6]"
              action={<span className="text-xs text-slate-500">Last 30 days vs lifetime counts</span>}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-thb-text-primary">{data.metrics.auditLogsLast30Days}</p>
                  <p className="text-xs text-thb-text-muted mt-1">Audit Logs (30d)</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-thb-text-primary">{data.metrics.notificationsLast30Days}</p>
                  <p className="text-xs text-thb-text-muted mt-1">Notifications (30d)</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-thb-text-primary">{data.metrics.totalWorkflowInstances}</p>
                  <p className="text-xs text-thb-text-muted mt-1">Total Instances</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-thb-text-primary">{data.metrics.completedWorkflowInstances}</p>
                  <p className="text-xs text-thb-text-muted mt-1">Completed Instances</p>
                </div>
              </div>
            </Panel>
          )}
        </>
      )}

      {/* Empty state when no data and no error (e.g. no token) */}
      {!loading && !error && !data && (
        <div className="thb-card p-8 text-center">
          <FiGrid className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-thb-text-muted">No governance data available</p>
        </div>
      )}
    </div>
  );
}
