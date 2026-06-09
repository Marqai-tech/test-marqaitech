'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiLayers,
  FiDatabase,
  FiShield,
  FiBarChart2,
  FiEdit3,
  FiPlayCircle,
  FiDollarSign,
  FiGrid,
  FiCalendar,
  FiBook,
  FiFileText,
  FiUsers,
  FiClock,
  FiAlertCircle,
  FiArrowRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Sub-module tile configuration ── */
interface SubModuleTile {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  description: string;
  gradientBg: string;
  iconColor: string;
  ringColor: string;
}

const subModules: SubModuleTile[] = [
  {
    title: 'CTC Templates',
    icon: FiLayers,
    route: '/payroll/ctc-templates',
    description: 'Define and manage Cost to Company salary structures',
    gradientBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500/20',
  },
  {
    title: 'Component Master',
    icon: FiDatabase,
    route: '/payroll/components',
    description: 'Configure payroll earnings, deductions, and allowances',
    gradientBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    ringColor: 'ring-purple-500/20',
  },
  {
    title: 'Statutory Components',
    icon: FiShield,
    route: '/payroll/statutory',
    description: 'Country-specific tax, PF, ESI, and compliance setup',
    gradientBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    ringColor: 'ring-emerald-500/20',
  },
  {
    title: 'Tax Slabs',
    icon: FiBarChart2,
    route: '/payroll/tax-slabs',
    description: 'Configure progressive income tax slab rates',
    gradientBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    ringColor: 'ring-amber-500/20',
  },
  {
    title: 'Payroll Inputs',
    icon: FiEdit3,
    route: '/payroll/inputs',
    description: 'Manage attendance, leave, OT, and variable pay inputs',
    gradientBg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    ringColor: 'ring-rose-500/20',
  },
  {
    title: 'Payroll Processing',
    icon: FiPlayCircle,
    route: '/payroll/processing',
    description: 'Run payroll cycles, review, and approve',
    gradientBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-500',
    ringColor: 'ring-cyan-500/20',
  },
  {
    title: 'Currency & FX',
    icon: FiDollarSign,
    route: '/payroll/currency',
    description: 'Multi-currency configuration and exchange rates',
    gradientBg: 'bg-teal-500/10',
    iconColor: 'text-teal-500',
    ringColor: 'ring-teal-500/20',
  },
  {
    title: 'Dimensions',
    icon: FiGrid,
    route: '/payroll/dimensions',
    description: 'Multi-dimensional cost allocation setup',
    gradientBg: 'bg-orange-500/10',
    iconColor: 'text-orange-500',
    ringColor: 'ring-orange-500/20',
  },
  {
    title: 'Compliance',
    icon: FiCalendar,
    route: '/payroll/compliance',
    description: 'Statutory filing calendar and obligation tracking',
    gradientBg: 'bg-violet-500/10',
    iconColor: 'text-violet-500',
    ringColor: 'ring-violet-500/20',
  },
  {
    title: 'GL Mapping',
    icon: FiBook,
    route: '/payroll/gl-mapping',
    description: 'Map payroll components to general ledger accounts',
    gradientBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-500',
    ringColor: 'ring-indigo-500/20',
  },
  {
    title: 'Reports',
    icon: FiFileText,
    route: '/payroll/reports',
    description: 'Generate payroll, statutory, and compliance reports',
    gradientBg: 'bg-slate-500/10',
    iconColor: 'text-slate-500',
    ringColor: 'ring-slate-500/20',
  },
];

/* ── Stats type ── */
interface SummaryStats {
  totalEmployees: number;
  activeCTCTemplates: number;
  pendingPayrollRuns: number;
  openComplianceItems: number;
}

/* ── Component ── */
export default function PayrollManagementPage() {
  const router = useRouter();
  useAuthStore();

  const [stats, setStats] = useState<SummaryStats>({
    totalEmployees: 0,
    activeCTCTemplates: 0,
    pendingPayrollRuns: 0,
    openComplianceItems: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  /* Fetch summary stats */
  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const headers = getAuthHeaders();

      const [empRes, ctcRes, runsRes, complianceRes] = await Promise.allSettled([
        fetch('/api/employees?limit=1', { headers }),
        fetch('/api/payroll/ctc-templates?limit=1', { headers }),
        fetch('/api/payroll/runs?limit=100', { headers }),
        fetch('/api/payroll/compliance?limit=100', { headers }),
      ]);

      let totalEmployees = 0;
      let activeCTCTemplates = 0;
      let pendingPayrollRuns = 0;
      let openComplianceItems = 0;

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        totalEmployees = data.pagination?.total || data.employees?.length || 0;
      }

      if (ctcRes.status === 'fulfilled' && ctcRes.value.ok) {
        const data = await ctcRes.value.json();
        activeCTCTemplates = (data.templates || data.ctcTemplates || []).filter(
          (t: { status?: string }) => t.status === 'active'
        ).length || (data.templates || data.ctcTemplates || []).length || 0;
      }

      if (runsRes.status === 'fulfilled' && runsRes.value.ok) {
        const data = await runsRes.value.json();
        const runs = data.runs || data.payrollRuns || [];
        pendingPayrollRuns = runs.filter(
          (r: { status?: string }) => r.status === 'draft' || r.status === 'processing' || r.status === 'pending'
        ).length;
      }

      if (complianceRes.status === 'fulfilled' && complianceRes.value.ok) {
        const data = await complianceRes.value.json();
        const items = data.compliance || data.items || [];
        openComplianceItems = items.filter(
          (c: { status?: string }) => c.status === 'pending' || c.status === 'overdue' || c.status === 'open'
        ).length;
      }

      setStats({ totalEmployees, activeCTCTemplates, pendingPayrollRuns, openComplianceItems });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payroll summary');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchStats());
  }, [fetchStats]);

  /* Navigation handler */
  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route);
    },
    [router]
  );

  /* Stats cards configuration */
  const statsCards = [
    {
      label: 'Total Employees',
      value: stats.totalEmployees,
      icon: FiUsers,
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      ring: 'ring-blue-100',
    },
    {
      label: 'Active CTC Templates',
      value: stats.activeCTCTemplates,
      icon: FiLayers,
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      ring: 'ring-emerald-100',
    },
    {
      label: 'Pending Payroll Runs',
      value: stats.pendingPayrollRuns,
      icon: FiClock,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      ring: 'ring-amber-100',
    },
    {
      label: 'Open Compliance Items',
      value: stats.openComplianceItems,
      icon: FiAlertCircle,
      bg: 'bg-rose-50',
      iconColor: 'text-rose-600',
      ring: 'ring-rose-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiDollarSign className="w-6 h-6 text-emerald-500" />
            Payroll Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">
            Configure salary structures, process payroll, and manage compliance
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => {
          const IconComp = card.icon;
          return (
            <div key={card.label} className="nexus-card nexus-card-hover p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-nexus-text-secondary">{card.label}</p>
                  {loadingStats ? (
                    <div className="h-8 w-12 bg-slate-200 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-nexus-text-primary mt-1">{card.value}</p>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center ${card.iconColor} ring-1 ${card.ring}`}>
                  <IconComp className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub-module Tiles */}
      <div>
        <h2 className="text-sm font-semibold text-nexus-text-secondary uppercase tracking-wider mb-4">
          Payroll Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subModules.map((tile) => {
            const IconComp = tile.icon;
            return (
              <button
                key={tile.route}
                onClick={() => handleNavigate(tile.route)}
                className="nexus-card nexus-card-hover p-5 text-left group transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${tile.gradientBg} flex items-center justify-center ${tile.iconColor} ring-1 ${tile.ringColor} flex-shrink-0 transition-transform duration-200 group-hover:scale-110`}
                  >
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-nexus-text-primary group-hover:text-blue-600 transition-colors">
                        {tile.title}
                      </h3>
                      <FiArrowRight className="w-4 h-4 text-nexus-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-nexus-text-muted mt-1 leading-relaxed">
                      {tile.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
