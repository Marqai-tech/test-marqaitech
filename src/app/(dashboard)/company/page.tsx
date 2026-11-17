'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useCompanyData } from '@/components/company/useCompanyData';
import {
  FiBriefcase, FiDatabase, FiSettings, FiFileText,
  FiHome, FiMapPin, FiAward, FiLayers,
  FiArrowRight
} from 'react-icons/fi';
/* Task 156e — shared SmartHR widgets: same gradient banner / stat tiles /
   panels as the Employee Module Dashboard (Task 155 gold standard). */
import {
  PageBreadcrumbs, DateChip, Panel, MiniStatTile, StatSkeleton,
} from '@/components/dashboard/smarthr-widgets';

function CompanyDashboardContent() {
  const { companies, branches, departments, designations, loading } = useCompanyData({
    modules: ['companies', 'branches', 'departments', 'designations'],
  });

  const stats = [
    { label: 'Companies', value: companies.length, icon: <FiHome className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/company/companies' },
    { label: 'Branches', value: branches.length, icon: <FiMapPin className="w-4 h-4" />, bg: 'bg-[#10B981]/10 text-[#10B981]', ring: 'ring-[#10B981]/20', href: '/company/branches' },
    { label: 'Departments', value: departments.length, icon: <FiBriefcase className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-[#FF9B44]/25', href: '/company/departments' },
    { label: 'Designations', value: designations.length, icon: <FiAward className="w-4 h-4" />, bg: 'bg-[#009EFB]/10 text-[#009EFB]', ring: 'ring-[#009EFB]/20', href: '/company/designations' },
    { label: 'Grades', value: [...new Set(designations.map(d => d.level))].length, icon: <FiLayers className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/company/grades' },
  ];

  const masterLinks = [
    { title: 'Companies', desc: 'Manage company profiles, locations, and organizational hierarchy', href: '/company/companies', icon: <FiHome className="w-5 h-5" />, color: 'from-emerald-500 to-green-600', count: companies.length },
    { title: 'Branches', desc: 'Set up office locations linked to companies', href: '/company/branches', icon: <FiMapPin className="w-5 h-5" />, color: 'from-green-500 to-cyan-600', count: branches.length },
    { title: 'Departments', desc: 'Define functional departments within the organization', href: '/company/departments', icon: <FiBriefcase className="w-5 h-5" />, color: 'from-cyan-500 to-teal-600', count: departments.length },
    { title: 'Designations', desc: 'Create job titles with grade levels and salary ranges', href: '/company/designations', icon: <FiAward className="w-5 h-5" />, color: 'from-teal-500 to-teal-600', count: designations.length },
    { title: 'Grades', desc: 'View grades derived from designation levels', href: '/company/grades', icon: <FiLayers className="w-5 h-5" />, color: 'from-teal-500 to-pink-600', count: [...new Set(designations.map(d => d.level))].length },
  ];

  const featureLinks = [
    { title: 'Company Reports', desc: 'View reports on company structure, headcount & compliance', href: '/company/reports', icon: <FiFileText className="w-5 h-5" />, color: 'from-teal-500 to-emerald-600', isNew: true },
  ];

  const isLoading = loading.companies || loading.branches || loading.departments;

  /* Header chip date — same pattern as the Employee Module Dashboard banner */
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-8">
      {/* Module Header — SmartHR gradient breadcrumb banner (title matches
          the sidebar label "Company Dashboard") */}
      <PageBreadcrumbs
        title="Company Dashboard"
        trail={['Company', 'Dashboard']}
        right={<DateChip value={todayChip} />}
      />

      {/* Quick Stats — shared SmartHR mini stat tiles (round pastel icon +
          View All link, keeping each tile's original destination) */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {stats.map((stat) => (
            <MiniStatTile
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              bg={stat.bg}
              ring={stat.ring}
              href={stat.href}
            />
          ))}
        </div>
      )}

      {/* Company Masters Section — shared SmartHR panel */}
      <Panel title="Company Masters" icon={<FiDatabase className="w-4 h-4" />} accent="text-[#10B981]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {masterLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform`}>
                  {link.icon}
                </div>
                <span className="text-xs font-semibold text-thb-text-muted bg-slate-50 px-2 py-0.5 rounded-full">{link.count}</span>
              </div>
              <h3 className="text-sm font-bold text-thb-text-primary">{link.title}</h3>
              <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{link.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-500 group-hover:text-emerald-600">
                Open <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      {/* Company Settings & Reports Section — shared SmartHR panel */}
      <Panel title="Configuration & Insights" icon={<FiSettings className="w-4 h-4" />} accent="text-[#6C4FD6]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featureLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-left p-5 rounded-xl border border-slate-200 hover:border-green-300 bg-white hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform`}>
                  {link.icon}
                </div>
                {link.isNew && (
                  <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 border border-emerald-200">NEW</span>
                )}
              </div>
              <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">
                {link.title}
              </h3>
              <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{link.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-green-500 group-hover:text-green-600">
                Open <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" /></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}
