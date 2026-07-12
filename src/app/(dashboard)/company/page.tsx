'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useCompanyData } from '@/components/company/useCompanyData';
import {
  FiBriefcase, FiGrid, FiDatabase, FiSettings, FiFileText,
  FiHome, FiMapPin, FiAward, FiLayers, FiClock, FiCalendar,
  FiArrowRight
} from 'react-icons/fi';

function CompanyDashboardContent() {
  const { companies, branches, departments, designations, shifts, holidays, policies, loading } = useCompanyData();

  const stats = [
    { label: 'Companies', value: companies.length, icon: <FiHome className="w-4 h-4" />, color: 'text-indigo-500 bg-indigo-50', href: '/company/companies' },
    { label: 'Branches', value: branches.length, icon: <FiMapPin className="w-4 h-4" />, color: 'text-blue-500 bg-blue-50', href: '/company/branches' },
    { label: 'Departments', value: departments.length, icon: <FiBriefcase className="w-4 h-4" />, color: 'text-emerald-500 bg-emerald-50', href: '/company/departments' },
    { label: 'Designations', value: designations.length, icon: <FiAward className="w-4 h-4" />, color: 'text-violet-500 bg-violet-50', href: '/company/designations' },
    { label: 'Grades', value: [...new Set(designations.map(d => d.level))].length, icon: <FiLayers className="w-4 h-4" />, color: 'text-purple-500 bg-purple-50', href: '/company/grades' },
    { label: 'Shifts', value: shifts.length, icon: <FiClock className="w-4 h-4" />, color: 'text-amber-500 bg-amber-50', href: '/company/shifts' },
    { label: 'Holidays', value: holidays.length, icon: <FiCalendar className="w-4 h-4" />, color: 'text-red-500 bg-red-50', href: '/company/holidays' },
    { label: 'Policies', value: policies.length, icon: <FiFileText className="w-4 h-4" />, color: 'text-teal-500 bg-teal-50', href: '/company/policies' },
  ];

  const masterLinks = [
    { title: 'Companies', desc: 'Manage company profiles, locations, and organizational hierarchy', href: '/company/companies', icon: <FiHome className="w-5 h-5" />, color: 'from-indigo-500 to-blue-600', count: companies.length },
    { title: 'Branches', desc: 'Set up office locations linked to companies', href: '/company/branches', icon: <FiMapPin className="w-5 h-5" />, color: 'from-blue-500 to-cyan-600', count: branches.length },
    { title: 'Departments', desc: 'Define functional departments within the organization', href: '/company/departments', icon: <FiBriefcase className="w-5 h-5" />, color: 'from-cyan-500 to-teal-600', count: departments.length },
    { title: 'Designations', desc: 'Create job titles with grade levels and salary ranges', href: '/company/designations', icon: <FiAward className="w-5 h-5" />, color: 'from-violet-500 to-purple-600', count: designations.length },
    { title: 'Grades', desc: 'View grades derived from designation levels', href: '/company/grades', icon: <FiLayers className="w-5 h-5" />, color: 'from-purple-500 to-pink-600', count: [...new Set(designations.map(d => d.level))].length },
    { title: 'Shifts', desc: 'Configure work shift timings for attendance tracking', href: '/company/shifts', icon: <FiClock className="w-5 h-5" />, color: 'from-amber-500 to-orange-600', count: shifts.length },
    { title: 'Holidays', desc: 'Add public, festival, and company holidays for the year', href: '/company/holidays', icon: <FiCalendar className="w-5 h-5" />, color: 'from-red-500 to-rose-600', count: holidays.length },
    { title: 'Policies', desc: 'Create HR, leave, attendance, and other company policies', href: '/company/policies', icon: <FiFileText className="w-5 h-5" />, color: 'from-emerald-500 to-teal-600', count: policies.length },
  ];

  const featureLinks = [
    { title: 'Company Settings', desc: 'Configure company-wide settings, preferences & integrations', href: '/company/settings', icon: <FiSettings className="w-5 h-5" />, color: 'from-blue-500 to-indigo-600', isNew: true },
    { title: 'Company Reports', desc: 'View reports on company structure, headcount & compliance', href: '/company/reports', icon: <FiFileText className="w-5 h-5" />, color: 'from-teal-500 to-emerald-600', isNew: true },
  ];

  const isLoading = loading.companies || loading.branches || loading.departments;

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md">
          <FiBriefcase className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Company Management</h1>
          <p className="text-sm text-thb-text-secondary">Manage your company structure, masters, settings, and reports</p>
        </div>
      </div>

      {/* Quick Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100" />
                <div className="flex-1">
                  <div className="h-3 bg-slate-100 rounded w-12 mb-1" />
                  <div className="h-5 bg-slate-100 rounded w-8" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${stat.color} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-[11px] text-thb-text-secondary font-medium">{stat.label}</p>
                  <p className="text-lg font-bold text-thb-text-primary">{stat.value}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Company Masters Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FiDatabase className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-thb-text-primary">Company Masters</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {masterLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform`}>
                  {link.icon}
                </div>
                <span className="text-xs font-semibold text-thb-text-muted bg-slate-50 px-2 py-0.5 rounded-full">{link.count}</span>
              </div>
              <h3 className="text-sm font-bold text-thb-text-primary">{link.title}</h3>
              <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{link.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-500 group-hover:text-indigo-600">
                Open <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Company Settings & Reports Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FiSettings className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold text-thb-text-primary">Configuration & Insights</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featureLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-left p-5 rounded-xl border border-slate-200 hover:border-blue-300 bg-white hover:shadow-md transition-all group"
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
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-500 group-hover:text-blue-600">
                Open <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>
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
