'use client';

import { Suspense } from 'react';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import CompanyManagement from '@/components/hrms/company-management';
import { FiBriefcase, FiGrid, FiDatabase, FiSettings, FiFileText, FiBarChart2 } from 'react-icons/fi';

const companyTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Masters', key: 'masters', icon: <FiDatabase className="w-4 h-4" /> },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" />, isNew: true },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
];

function CompanyDashboardContent() {
  return (
    <ModuleDashboardShell
      moduleKey="company"
      moduleLabel="Company"
      moduleIcon={<FiBriefcase className="w-5 h-5 text-white" />}
      gradientColor="from-indigo-500 to-blue-600"
      tabs={companyTabs}
      overviewContent={<CompanyOverview />}
      children={{
        masters: <CompanyManagement />,
        settings: <CompanySettingsPlaceholder />,
        reports: <CompanyReportsPlaceholder />,
      }}
    />
  );
}

function CompanyOverview() {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Companies', value: '—', icon: <FiBriefcase className="w-4 h-4" />, color: 'text-indigo-500 bg-indigo-50' },
          { label: 'Branches', value: '—', icon: <FiDatabase className="w-4 h-4" />, color: 'text-blue-500 bg-blue-50' },
          { label: 'Departments', value: '—', icon: <FiGrid className="w-4 h-4" />, color: 'text-emerald-500 bg-emerald-50' },
          { label: 'Designations', value: '—', icon: <FiSettings className="w-4 h-4" />, color: 'text-amber-500 bg-amber-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${stat.color} flex items-center justify-center`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-[11px] text-thb-text-secondary font-medium">{stat.label}</p>
                <p className="text-lg font-bold text-thb-text-primary">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links to Dashboard Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Company Masters', desc: 'Manage companies, branches, departments, designations, shifts, holidays & policies', key: 'masters', icon: <FiDatabase className="w-5 h-5" />, color: 'from-indigo-500 to-blue-600' },
          { title: 'Company Settings', desc: 'Configure company-wide settings, preferences & integrations', key: 'settings', icon: <FiSettings className="w-5 h-5" />, color: 'from-blue-500 to-cyan-600', isNew: true },
          { title: 'Company Reports', desc: 'View reports on company structure, headcount & compliance', key: 'reports', icon: <FiFileText className="w-5 h-5" />, color: 'from-cyan-500 to-teal-600', isNew: true },
        ].map((link) => (
          <button
            key={link.key}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('tab', link.key);
              window.location.href = url.pathname + url.search;
            }}
            className="text-left p-4 rounded-xl border border-slate-200 hover:border-blue-300 bg-white hover:shadow-md transition-all group"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-md mb-3 text-white group-hover:scale-105 transition-transform`}>
              {link.icon}
            </div>
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">
              {link.title}
              {link.isNew && (
                <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 border border-emerald-200">NEW</span>
              )}
            </h3>
            <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{link.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompanySettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Settings & Configuration</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        Configure company-wide settings, preferences, and integrations
      </p>
      <a href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
        <FiSettings className="w-4 h-4" /> Go to Settings
      </a>
    </div>
  );
}

function CompanyReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Reports & Analytics</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        View reports on company structure, headcount distribution, and compliance status
      </p>
      <a href="/reports" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}
