'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  FiHome, FiSearch, FiUsers, FiBriefcase, FiGlobe, FiStar,
  FiUserPlus, FiClock, FiCalendar, FiDollarSign, FiFolder,
  FiTrendingUp, FiBookOpen, FiLogOut, FiHeadphones,
  FiMessageCircle, FiGitBranch, FiShield, FiBarChart2,
  FiSettings, FiPackage, FiMap, FiCreditCard,
  FiWatch, FiAlertCircle, FiTruck, FiPercent, FiLayers,
  FiSliders, FiFileText, FiBell, FiZap, FiHeart, FiTarget,
  FiServer
} from 'react-icons/fi';
import { HiShieldCheck, HiSparkles, HiCollection } from 'react-icons/hi';

interface ModuleCard {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  gradient: string;
  href: string;
  badge?: string;
  category: string;
}

const allModules: ModuleCard[] = [
  // Platform Admin
  { key: 'super-admin', label: 'Super Admin', icon: <HiCollection className="w-6 h-6" />, description: 'Platform management, tenants & subscriptions', gradient: 'from-amber-500 to-orange-500', href: '/super-admin', badge: 'SaaS', category: 'Platform' },
  { key: 'ai-admin', label: 'AI Admin Console', icon: <FiZap className="w-6 h-6" />, description: 'AI model config, prompts & monitoring', gradient: 'from-amber-500 to-orange-500', href: '/ai-admin', badge: 'AI', category: 'Platform' },
  { key: 'tenant-admin', label: 'Tenant Admin', icon: <FiServer className="w-6 h-6" />, description: 'Multi-tenant management & provisioning', gradient: 'from-teal-500 to-cyan-500', href: '/tenant-admin', badge: 'SaaS', category: 'Platform' },

  // Core HR
  { key: 'dashboard', label: 'Dashboard', icon: <FiHome className="w-6 h-6" />, description: 'HR overview, analytics & quick actions', gradient: 'from-blue-500 to-cyan-500', href: '/dashboard', category: 'Core HR' },
  { key: 'company-management', label: 'Company Management', icon: <FiLayers className="w-6 h-6" />, description: 'Branches, departments & designations', gradient: 'from-teal-500 to-emerald-500', href: '/employees', category: 'Core HR' },
  { key: 'employees', label: 'Employees', icon: <FiUsers className="w-6 h-6" />, description: 'Directory, org chart & employee lifecycle', gradient: 'from-cyan-500 to-blue-500', href: '/employees', category: 'Core HR' },

  // Talent Acquisition
  { key: 'recruitment', label: 'Recruitment', icon: <FiBriefcase className="w-6 h-6" />, description: 'Requisitions, job postings & offers', gradient: 'from-violet-500 to-purple-500', href: '/recruitment', badge: 'AI', category: 'Talent Acquisition' },
  { key: 'requisitions', label: 'Requisitions', icon: <FiFileText className="w-6 h-6" />, description: 'Job requisitions & approval workflows', gradient: 'from-indigo-500 to-violet-500', href: '/requisitions', category: 'Talent Acquisition' },
  { key: 'offers', label: 'Offers', icon: <FiStar className="w-6 h-6" />, description: 'Offer letters & acceptance tracking', gradient: 'from-yellow-500 to-amber-500', href: '/offers', category: 'Talent Acquisition' },
  { key: 'job-portal', label: 'Job Portal', icon: <FiGlobe className="w-6 h-6" />, description: 'Public career site & applications', gradient: 'from-sky-500 to-blue-500', href: '/recruitment', badge: 'Portal', category: 'Talent Acquisition' },
  { key: 'ai-interview', label: 'AI Interview', icon: <HiSparkles className="w-6 h-6" />, description: 'AI-powered interview sessions & scoring', gradient: 'from-purple-500 to-fuchsia-500', href: '/ai-assistant', badge: 'AI', category: 'Talent Acquisition' },

  // Employee Lifecycle
  { key: 'preboarding', label: 'Preboarding', icon: <FiUserPlus className="w-6 h-6" />, description: 'Pre-boarding tasks & new hire portal', gradient: 'from-green-400 to-emerald-500', href: '/preboarding', category: 'Lifecycle' },
  { key: 'onboarding', label: 'Onboarding', icon: <FiUserPlus className="w-6 h-6" />, description: 'Pre-boarding, checklist & induction', gradient: 'from-green-500 to-emerald-500', href: '/onboarding', category: 'Lifecycle' },
  { key: 'attendance', label: 'Attendance', icon: <FiClock className="w-6 h-6" />, description: 'Mark attendance, shifts & regularization', gradient: 'from-teal-500 to-cyan-500', href: '/attendance', category: 'Lifecycle' },
  { key: 'leave', label: 'Leave Management', icon: <FiCalendar className="w-6 h-6" />, description: 'Leave requests, balance & calendar', gradient: 'from-emerald-500 to-green-500', href: '/leave', category: 'Lifecycle' },
  { key: 'separation', label: 'Separation', icon: <FiLogOut className="w-6 h-6" />, description: 'Resignations, clearance & exit process', gradient: 'from-red-500 to-rose-500', href: '/separation', category: 'Lifecycle' },
  { key: 'fnf', label: 'FNF Settlement', icon: <FiSliders className="w-6 h-6" />, description: 'Full & final settlement processing', gradient: 'from-rose-500 to-pink-500', href: '/fnf', category: 'Lifecycle' },

  // Compensation
  { key: 'payroll', label: 'Payroll', icon: <FiDollarSign className="w-6 h-6" />, description: 'Process payroll & generate payslips', gradient: 'from-green-500 to-teal-500', href: '/payroll', category: 'Compensation' },
  { key: 'salary-structures', label: 'Salary Structures', icon: <FiPercent className="w-6 h-6" />, description: 'CTC breakdown, components & templates', gradient: 'from-emerald-500 to-green-500', href: '/salary-structures', category: 'Compensation' },

  // Performance & Growth
  { key: 'performance', label: 'Performance', icon: <FiTrendingUp className="w-6 h-6" />, description: 'Reviews, goals & feedback cycles', gradient: 'from-amber-500 to-yellow-500', href: '/performance', category: 'Growth' },
  { key: 'training', label: 'Training', icon: <FiBookOpen className="w-6 h-6" />, description: 'Courses, learning paths & certifications', gradient: 'from-blue-500 to-indigo-500', href: '/training', category: 'Growth' },
  { key: 'engagement', label: 'Engagement', icon: <FiHeart className="w-6 h-6" />, description: 'Employee engagement surveys & insights', gradient: 'from-pink-500 to-rose-500', href: '/engagement', category: 'Growth' },
  { key: 'succession', label: 'Succession Planning', icon: <FiTarget className="w-6 h-6" />, description: 'Talent pipeline & succession mapping', gradient: 'from-indigo-500 to-violet-500', href: '/succession', category: 'Growth' },

  // Operations
  { key: 'projects', label: 'Projects', icon: <FiFolder className="w-6 h-6" />, description: 'Project list, kanban board & milestones', gradient: 'from-indigo-500 to-blue-500', href: '/projects', category: 'Operations' },
  { key: 'timesheets', label: 'Timesheets', icon: <FiWatch className="w-6 h-6" />, description: 'Time tracking & approval workflows', gradient: 'from-cyan-500 to-teal-500', href: '/timesheets', category: 'Operations' },
  { key: 'travel', label: 'Travel', icon: <FiMap className="w-6 h-6" />, description: 'Travel requests & itinerary management', gradient: 'from-sky-500 to-indigo-500', href: '/travel', category: 'Operations' },
  { key: 'expenses', label: 'Expenses', icon: <FiCreditCard className="w-6 h-6" />, description: 'Expense claims & reimbursement', gradient: 'from-orange-500 to-red-500', href: '/expenses', category: 'Operations' },
  { key: 'assets', label: 'Assets', icon: <FiPackage className="w-6 h-6" />, description: 'Asset allocation & tracking', gradient: 'from-slate-500 to-gray-500', href: '/assets', category: 'Operations' },
  { key: 'documents', label: 'Documents', icon: <FiFileText className="w-6 h-6" />, description: 'Document management & templates', gradient: 'from-gray-500 to-slate-500', href: '/documents', category: 'Operations' },

  // External Relations
  { key: 'clients', label: 'Clients', icon: <FiGlobe className="w-6 h-6" />, description: 'Client list & service management', gradient: 'from-teal-500 to-green-500', href: '/clients', category: 'External' },
  { key: 'vendors', label: 'Vendors', icon: <FiTruck className="w-6 h-6" />, description: 'Vendor management & invoices', gradient: 'from-orange-500 to-amber-500', href: '/vendors', category: 'External' },

  // Support & Intelligence
  { key: 'helpdesk', label: 'Helpdesk', icon: <FiHeadphones className="w-6 h-6" />, description: 'HR & IT helpdesk, knowledge base', gradient: 'from-sky-500 to-cyan-500', href: '/helpdesk', category: 'Support' },
  { key: 'grievances', label: 'Grievances', icon: <FiAlertCircle className="w-6 h-6" />, description: 'Employee grievances & resolution', gradient: 'from-red-500 to-orange-500', href: '/grievances', category: 'Support' },
  { key: 'ai-assistant', label: 'AI Assistant', icon: <FiZap className="w-6 h-6" />, description: 'AI-powered HR chatbot & help', gradient: 'from-purple-500 to-violet-500', href: '/ai-assistant', badge: 'AI', category: 'Support' },

  // Governance
  { key: 'workflows', label: 'Workflows', icon: <FiGitBranch className="w-6 h-6" />, description: 'Workflow builder & templates', gradient: 'from-fuchsia-500 to-pink-500', href: '/workflows', category: 'Governance' },
  { key: 'reports', label: 'Reports', icon: <FiBarChart2 className="w-6 h-6" />, description: 'HR analytics, reports & exports', gradient: 'from-emerald-500 to-teal-500', href: '/reports', category: 'Governance' },
  { key: 'settings', label: 'Settings', icon: <FiSettings className="w-6 h-6" />, description: 'General, notifications & integrations', gradient: 'from-slate-500 to-gray-600', href: '/settings', category: 'Governance' },
];

const categories = [
  { key: 'Platform', label: 'Platform', color: 'text-amber-600' },
  { key: 'Core HR', label: 'Core HR', color: 'text-blue-600' },
  { key: 'Talent Acquisition', label: 'Talent Acquisition', color: 'text-violet-600' },
  { key: 'Lifecycle', label: 'Employee Lifecycle', color: 'text-emerald-600' },
  { key: 'Compensation', label: 'Compensation', color: 'text-green-600' },
  { key: 'Growth', label: 'Performance & Growth', color: 'text-amber-600' },
  { key: 'Operations', label: 'Operations', color: 'text-indigo-600' },
  { key: 'External', label: 'External Relations', color: 'text-teal-600' },
  { key: 'Support', label: 'Support & Intelligence', color: 'text-purple-600' },
  { key: 'Governance', label: 'Governance', color: 'text-slate-600' },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  const filteredModules = useMemo(() => {
    let mods = allModules;
    if (activeCategory) {
      mods = mods.filter(m => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      mods = mods.filter(m =>
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    }
    return mods;
  }, [searchQuery, activeCategory]);

  // Group filtered modules by category
  const groupedModules = useMemo(() => {
    const groups: Record<string, ModuleCard[]> = {};
    for (const mod of filteredModules) {
      if (!groups[mod.category]) groups[mod.category] = [];
      groups[mod.category].push(mod);
    }
    return groups;
  }, [filteredModules]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="nexus-card p-6 bg-gradient-to-r from-blue-500 via-violet-500 to-purple-600 border-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <HiShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {greeting}, {firstName}!
              </h1>
              <p className="text-blue-100 mt-0.5 text-sm">Welcome to NEXUS HRMS. Select a module to get started.</p>
            </div>
          </div>
          {/* Search Bar */}
          <div className="relative max-w-md w-full">
            <FiSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20 transition-all text-sm"
            />
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeCategory === null
              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
              : 'bg-slate-100 text-nexus-text-secondary hover:bg-slate-200 hover:text-nexus-text-primary'
          }`}
        >
          All Modules ({allModules.length})
        </button>
        {categories.map(cat => {
          const count = allModules.filter(m => m.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === cat.key
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                  : 'bg-slate-100 text-nexus-text-secondary hover:bg-slate-200 hover:text-nexus-text-primary'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Module Cards - Grouped by Category */}
      {Object.entries(groupedModules).map(([category, modules]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-nexus-text-primary uppercase tracking-wider">
              {category}
            </h2>
            <div className="flex-1 h-px bg-nexus-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {modules.map(mod => (
              <button
                key={mod.key}
                onClick={() => router.push(mod.href)}
                className="nexus-card nexus-card-hover p-5 text-left group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform text-white`}>
                    {mod.icon}
                  </div>
                  {mod.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      mod.badge === 'AI'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {mod.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-nexus-text-primary group-hover:text-blue-600 transition-colors">
                  {mod.label}
                </h3>
                <p className="text-xs text-nexus-text-muted mt-1 leading-relaxed">
                  {mod.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {filteredModules.length === 0 && (
        <div className="text-center py-16">
          <FiSearch className="w-12 h-12 text-nexus-text-muted mx-auto mb-4" />
          <p className="text-nexus-text-secondary text-lg font-medium">No modules found</p>
          <p className="text-nexus-text-muted text-sm mt-1">Try adjusting your search query or category filter</p>
          <button
            onClick={() => { setSearchQuery(''); setActiveCategory(null); }}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
