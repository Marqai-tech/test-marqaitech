'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiGrid, FiShield, FiUser, FiBriefcase, FiUsers, FiDollarSign,
  FiTarget, FiClock, FiCreditCard, FiMonitor, FiPackage, FiHeadphones,
  FiArrowRight, FiZap,
} from 'react-icons/fi';
/* Task 156-f — shared SmartHR widgets so the picker matches the restyled
   dashboards (same gradient banner + white-card system as /employees/dashboard). */
import { PageBreadcrumbs, DateChip, Panel } from '@/components/dashboard/smarthr-widgets';
import { useAuthStore } from '@/store/authStore';
import { ADMIN_DASHBOARD_ROLES } from '@/lib/roleAccess';

interface DashboardTile {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  /* Tailwind classes for the round pastel icon chip (SmartHR palette). */
  iconTone: string;
  isNew?: boolean;
  /* Task 163 — admin-only dashboards are hidden from non-admin roles. */
  adminOnly?: boolean;
}

const DASHBOARD_CATEGORIES: { label: string; icon: React.ComponentType<{ className?: string }>; dashboards: DashboardTile[] }[] = [
  {
    label: 'General',
    icon: FiGrid,
    dashboards: [
      {
        /* Task 163 — /home is the ADMIN DASHBOARD (renamed from "Home"). */
        title: 'Admin Dashboard',
        description: 'Organization-wide admin overview — employees, attendance, payroll, recruitment, and company analytics',
        icon: FiShield,
        route: '/home',
        iconTone: 'bg-[#3A57C4]/10 text-[#3A57C4]',
        adminOnly: true,
      },
      {
        /* Redirects to the Company masters dashboard (/company). */
        title: 'Company Dashboard',
        description: 'Company masters — companies, branches, departments, designations, grades, and company reports',
        icon: FiShield,
        route: '/dashboards/admin',
        iconTone: 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
        adminOnly: true,
      },
      {
        /* Personal self-service dashboard (any role). */
        title: 'Personal Dashboard',
        description: 'Personal view — attendance, leave balance, payslips, schedule, and announcements',
        icon: FiUser,
        route: '/dashboards/employee',
        iconTone: 'bg-[#FF9B44]/15 text-[#FF9B44]',
      },
    ],
  },
  {
    label: 'HR & Recruitment',
    icon: FiUsers,
    dashboards: [
      {
        title: 'HR Dashboard',
        description: 'HR analytics — headcount, attrition, recruitment funnel, engagement, and pending HR actions',
        icon: FiUsers,
        route: '/dashboards/hr',
        iconTone: 'bg-[#009EFB]/10 text-[#009EFB]',
        isNew: true,
      },
      {
        title: 'Recruitment Dashboard',
        description: 'Talent acquisition — open positions, applications pipeline, interviews, offers, and time-to-hire',
        icon: FiBriefcase,
        route: '/dashboards/recruitment',
        iconTone: 'bg-[#FFC107]/20 text-amber-600',
        isNew: true,
      },
    ],
  },
  {
    label: 'Finance & Payroll',
    icon: FiDollarSign,
    dashboards: [
      {
        title: 'Payroll Dashboard',
        description: 'Payroll analytics — gross pay, deductions, net pay, monthly trends, department breakdown, and compliance',
        icon: FiDollarSign,
        route: '/dashboards/payroll',
        iconTone: 'bg-[#10B981]/10 text-[#10B981]',
        isNew: true,
      },
      {
        title: 'Finance Dashboard',
        description: 'Financial overview — revenue, expenses, invoices, budget utilization, and profit analysis',
        icon: FiCreditCard,
        route: '/dashboards/finance',
        iconTone: 'bg-[#3A57C4]/10 text-[#3A57C4]',
        isNew: true,
      },
    ],
  },
  {
    label: 'Operations',
    icon: FiZap,
    dashboards: [
      {
        title: 'Attendance Dashboard',
        description: 'Attendance analytics — present/absent rates, late arrivals, department attendance, and trends',
        icon: FiClock,
        route: '/dashboards/attendance',
        iconTone: 'bg-[#009EFB]/10 text-[#009EFB]',
        isNew: true,
      },
      {
        title: 'Asset Dashboard',
        description: 'Asset management — inventory, allocation, maintenance, depreciation, and lifecycle tracking',
        icon: FiPackage,
        route: '/dashboards/asset',
        iconTone: 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
        isNew: true,
      },
      {
        title: 'IT Admin Dashboard',
        description: 'IT operations — device management, security alerts, system health, tickets, and storage',
        icon: FiMonitor,
        route: '/dashboards/it-admin',
        iconTone: 'bg-slate-100 text-slate-600',
        isNew: true,
      },
      {
        title: 'Help Desk Dashboard',
        description: 'Support analytics — open tickets, SLA compliance, response times, agent performance, and satisfaction',
        icon: FiHeadphones,
        route: '/dashboards/helpdesk',
        iconTone: 'bg-[#F43F5E]/10 text-[#F43F5E]',
        isNew: true,
      },
    ],
  },
  {
    label: 'Sales & CRM',
    icon: FiTarget,
    dashboards: [
      {
        title: 'Deals Dashboard',
        description: 'CRM deal pipeline — won/lost deals, pipeline value, win rates, and revenue forecasting',
        icon: FiBriefcase,
        route: '/dashboards/deals',
        iconTone: 'bg-[#FF9B44]/15 text-[#FF9B44]',
      },
      {
        title: 'Leads Dashboard',
        description: 'Lead management — lead sources, qualification, conversion rates, scoring, and assignment',
        icon: FiTarget,
        route: '/dashboards/leads',
        iconTone: 'bg-[#10B981]/10 text-[#10B981]',
      },
    ],
  },
];

export default function DashboardsIndexPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const userRole = (user?.role || '').toLowerCase();
  const isAdmin = ADMIN_DASHBOARD_ROLES.includes(userRole);
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  /* Task 163 — tiles the current role may open + live quick stats computed
     from the SAME list (no hardcoded 12/6/5 dummy numbers). */
  const visibleCategories = useMemo(
    () => DASHBOARD_CATEGORIES
      .map((c) => ({ ...c, dashboards: c.dashboards.filter((d) => !d.adminOnly || isAdmin) }))
      .filter((c) => c.dashboards.length > 0),
    [isAdmin]
  );
  const totalDashboards = visibleCategories.reduce((s, c) => s + c.dashboards.length, 0);
  const newDashboards = visibleCategories.reduce((s, c) => s + c.dashboards.filter((d) => d.isNew).length, 0);

  return (
    <div className="space-y-8">
      {/* Header — shared SmartHR gradient banner (Task 156-f) */}
      <PageBreadcrumbs
        title="Dashboards"
        trail={['Dashboards']}
        right={<DateChip value={todayChip} />}
      />
      <p className="text-sm text-slate-500">
        Access all specialized dashboards across 3Boxes HRMS — from HR and payroll to IT operations and sales CRM.
      </p>

      {/* Dashboard Categories */}
      {visibleCategories.map((category) => {
        const CatIcon = category.icon;
        return (
          <section key={category.label}>
            <div className="flex items-center gap-2 mb-4">
              <CatIcon className="w-4 h-4 text-[#3A57C4]" />
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                {category.label}
              </h2>
              <span className="text-xs text-slate-400">({category.dashboards.length})</span>
            </div>
            <div className={`grid gap-4 ${
              category.dashboards.length === 1 ? 'grid-cols-1' :
              category.dashboards.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              category.dashboards.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}>
              {category.dashboards.map((dashboard) => {
                const Icon = dashboard.icon;
                return (
                  <button
                    key={dashboard.route}
                    onClick={() => router.push(dashboard.route)}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-left group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full ${dashboard.iconTone} ring-1 ring-black/5 flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#3A57C4] transition-colors inline-flex items-center gap-2">
                            {dashboard.title}
                            {dashboard.isNew && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#3A57C4]/10 text-[#3A57C4] uppercase tracking-wide">New</span>
                            )}
                          </h3>
                          <FiArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                          {dashboard.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Quick Stats — shared SmartHR Panel; every number below is computed
          from the role-filtered category list above (dynamic, no dummies). */}
      <Panel title="Dashboard Overview" icon={<FiGrid className="w-4 h-4" />} accent="text-[#FF9B44]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-3">
            <p className="text-2xl font-bold text-[#3A57C4]">{totalDashboards}</p>
            <p className="text-xs text-slate-500 mt-1">Dashboards Available</p>
          </div>
          <div className="text-center p-3">
            <p className="text-2xl font-bold text-[#10B981]">{newDashboards}</p>
            <p className="text-xs text-slate-500 mt-1">New Dashboards</p>
          </div>
          <div className="text-center p-3">
            <p className="text-2xl font-bold text-amber-600">{visibleCategories.length}</p>
            <p className="text-xs text-slate-500 mt-1">Categories</p>
          </div>
          <div className="text-center p-3">
            <p className="text-2xl font-bold text-[#009EFB]">{isAdmin ? 'Admin' : 'Personal'}</p>
            <p className="text-xs text-slate-500 mt-1">Your Access Level</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
