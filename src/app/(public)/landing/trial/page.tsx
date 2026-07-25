'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FiArrowLeft,
  FiArrowRight,
  FiZap,
  FiCheck,
  FiUsers,
  FiClock,
  FiCoffee,
  FiDollarSign,
  FiBriefcase,
  FiSmile,
  FiTarget,
  FiBarChart2,
  FiShield,
  FiGlobe,
  FiClipboard,
  FiAward,
  FiCpu,
  FiHeart,
  FiFileText,
  FiPhoneCall,
  FiPackage,
  FiLayers,
  FiLock,
  FiStar,
} from 'react-icons/fi';

/* ─── Module Data for Selection ─── */
const allModules = [
  { icon: FiUsers, name: 'Employee Management', desc: 'Profiles, documents & lifecycle' },
  { icon: FiClock, name: 'Attendance', desc: 'Biometric, GPS & shifts' },
  { icon: FiCoffee, name: 'Leave Management', desc: 'Types, balances & approvals' },
  { icon: FiDollarSign, name: 'Payroll', desc: 'Salary, runs & payslips' },
  { icon: FiBriefcase, name: 'Recruitment (ATS)', desc: 'Jobs, pipeline & offers' },
  { icon: FiSmile, name: 'Onboarding', desc: 'Tasks & welcome flows' },
  { icon: FiTarget, name: 'Performance', desc: 'Reviews, goals & OKRs' },
  { icon: FiBarChart2, name: 'Analytics', desc: 'Dashboards & reports' },
  { icon: FiShield, name: 'Compliance', desc: 'Statutory & audit' },
  { icon: FiGlobe, name: 'Travel & Expense', desc: 'Requests & claims' },
  { icon: FiClipboard, name: 'Helpdesk', desc: 'Tickets & SLA tracking' },
  { icon: FiAward, name: 'Learning & Training', desc: 'Courses & enrollments' },
  { icon: FiCpu, name: 'AI Chatbot', desc: 'HR assistant & analytics' },
  { icon: FiHeart, name: 'Engagement', desc: 'Surveys & sentiment' },
  { icon: FiFileText, name: 'Documents', desc: 'DMS & e-signatures' },
  { icon: FiPhoneCall, name: 'AI Interview', desc: 'Proctoring & scoring' },
  { icon: FiLayers, name: 'Company Management', desc: 'Multi-company & groups' },
  { icon: FiLock, name: 'Role-Based Access', desc: 'Permissions & RBAC' },
  { icon: FiPackage, name: 'Assets', desc: 'Tracking & assignments' },
  { icon: FiStar, name: 'Workflows', desc: 'Automation engine' },
];

/* ─── Trial Benefits ─── */
const trialBenefits = [
  '15-day free trial, no credit card required',
  'Create your own subdomain (companyname.3boxeshrms.com)',
  'Full access to all features during trial',
  'After 15 days, choose a subscription plan to continue',
  'Customize which modules you want to try',
  'Data migration support available',
  'Dedicated onboarding specialist',
];

export default function TrialPage() {
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  const handleToggleModule = (name: string) => {
    setSelectedModules((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedModules([]);
      setSelectAll(false);
    } else {
      setSelectedModules(allModules.map((m) => m.name));
      setSelectAll(true);
    }
  };

  // Sync selectAll state with actual selection
  const isAllSelected = selectedModules.length === allModules.length;
  const isNoneSelected = selectedModules.length === 0;

  return (
    <div>
      {/* ─── Home/Back Button ─── */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/landing"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 text-white text-sm font-semibold hover:bg-white/30 transition-all border border-white/30"
          >
            <FiArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/30 border border-green-400/30">
            <FiZap className="w-4 h-4 text-green-200" />
            <span className="text-sm font-semibold text-green-200">15-Day Free Trial</span>
          </div>
        </div>
      </div>

      {/* ─── Hero ─── */}
      <section className="relative pt-8 sm:pt-12 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-50/80 via-emerald-50/40 to-white" />
        <div className="absolute top-10 left-1/3 w-72 h-72 bg-green-400/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/3 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900">
            Try 3Boxes HRMS{' '}
            <span className="gradient-text">Risk-Free</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Get full access to every feature for 15 days. No credit card needed, no strings
            attached. Select the modules you want to explore.
          </p>
        </div>
      </section>

      {/* ─── Trial Benefits ─── */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trialBenefits.slice(0, 4).map((benefit, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-green-50 border border-green-100 flex items-start gap-3"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <FiCheck className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm text-slate-700 leading-relaxed">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Module Selection ─── */}
      <section className="py-12 sm:py-16 bg-gradient-to-b from-green-50/30 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Select Modules to Try
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose which modules you want to experience during your 15-day free trial.
              You&apos;ll have full access to selected modules.
            </p>
          </div>

          {/* Select All / Clear All Buttons */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <button
              onClick={handleSelectAll}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isAllSelected
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-105'
              }`}
            >
              {isAllSelected ? (
                <>
                  <FiCheck className="w-4 h-4" />
                  All Selected
                </>
              ) : (
                <>
                  Select All ({allModules.length} modules)
                </>
              )}
            </button>
            <button
              onClick={() => {
                setSelectedModules([]);
                setSelectAll(false);
              }}
              disabled={isNoneSelected}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isNoneSelected
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-green-300 hover:text-green-700 shadow-sm'
              }`}
            >
              Clear All
            </button>
            {/* Counter */}
            <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-semibold text-emerald-700">
              {selectedModules.length} / {allModules.length} selected
            </div>
          </div>

          {/* Module Checkbox Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {allModules.map((mod, idx) => {
              const Icon = mod.icon;
              const isSelected = selectedModules.includes(mod.name);
              return (
                <button
                  key={idx}
                  onClick={() => handleToggleModule(mod.name)}
                  className={`group p-4 sm:p-5 rounded-xl transition-all duration-200 text-center border ${
                    isSelected
                      ? 'bg-green-50 border-green-300 shadow-md shadow-green-500/10'
                      : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-green-200'
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div className={`mb-3 inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg'
                      : 'bg-slate-50 text-slate-400'
                  }`}>
                    {isSelected ? (
                      <FiCheck className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{mod.name}</h4>
                  <p className="text-xs text-slate-500 leading-snug">{mod.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Subdomain Preview ─── */}
      <section className="py-12 sm:py-16 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/50 via-slate-900 to-emerald-900/30" />
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Subdomain Input */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-400/30 mb-6">
                <FiZap className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-green-300">
                  Your Subdomain
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
                Create Your{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                  HRMS Instance
                </span>
              </h2>

              <p className="mt-6 text-lg text-slate-300 leading-relaxed">
                Enter your company name to see your personalized subdomain.
                Your team will access 3Boxes HRMS at this unique URL.
              </p>

              {/* Subdomain Preview */}
              <div className="mt-8">
                <label className="text-sm text-slate-400 mb-2 block">Company Name</label>
                <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <input
                    type="text"
                    placeholder="e.g. acme"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none placeholder:text-slate-500"
                  />
                  <div className="px-4 py-3 bg-slate-700 text-slate-400 text-sm font-mono">
                    .3boxeshrms.com
                  </div>
                </div>
                {companyName && (
                  <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm">
                    <FiCheck className="w-4 h-4" />
                    <span className="font-mono">
                      {companyName}.3boxeshrms.com
                    </span>
                    <span className="text-slate-500">is available</span>
                  </div>
                )}
              </div>

              {/* Benefits */}
              <div className="mt-8 space-y-3">
                {trialBenefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
                      <FiCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-sm text-slate-200">{benefit}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-base font-semibold shadow-xl shadow-green-500/25 hover:shadow-green-500/40 hover:scale-105 transition-all"
              >
                Start Your 15-Day Free Trial
                <FiArrowRight className="w-5 h-5" />
              </button>

              {selectedModules.length > 0 && (
                <p className="mt-4 text-sm text-slate-400">
                  Starting trial with {selectedModules.length} module(s): {selectedModules.slice(0, 3).join(', ')}
                  {selectedModules.length > 3 ? ` and ${selectedModules.length - 3} more` : ''}
                </p>
              )}
            </div>

            {/* Right: Visual Preview */}
            <div className="relative">
              <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="ml-4 flex-1 h-8 bg-slate-700 rounded-lg flex items-center px-4">
                    <FiGlobe className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <span className="text-sm text-slate-300 font-mono">
                      {companyName || 'acme'}.3boxeshrms.com
                    </span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-green-500/30 flex items-center justify-center">
                      <FiUsers className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Employee Management</div>
                      <div className="text-xs text-slate-400">Active &mdash; 142 employees</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/30 flex items-center justify-center">
                      <FiDollarSign className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Payroll Processing</div>
                      <div className="text-xs text-slate-400">March 2026 &mdash; In Progress</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/30 flex items-center justify-center">
                      <FiCpu className="w-4 h-4 text-teal-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">AI Assistant</div>
                      <div className="text-xs text-slate-400">3 queries answered today</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-green-500/30 flex items-center justify-center">
                      <FiBriefcase className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Recruitment Pipeline</div>
                      <div className="text-xs text-slate-400">4 open positions &mdash; 23 candidates</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Your subdomain is ready</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <FiCheck className="w-3 h-3" /> Connected
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
