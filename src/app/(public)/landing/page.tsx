'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FiUsers,
  FiClock,
  FiDollarSign,
  FiTarget,
  FiBriefcase,
  FiCpu,
  FiShield,
  FiCheck,
  FiArrowRight,
  FiZap,
  FiGrid,
  FiMenu,
  FiX,
  FiPlay,
  FiStar,
  FiGlobe,
  FiLock,
  FiAward,
  FiBarChart2,
  FiFileText,
  FiHeart,
  FiCoffee,
  FiSmile,
  FiClipboard,
  FiPhoneCall,
  FiPackage,
  FiLayers,
} from 'react-icons/fi';

/* ───────────────────── Data ───────────────────── */

const features = [
  {
    icon: FiLayers,
    title: 'Multi-Company Management',
    description: 'Manage multiple group companies, branches, and entities from a single dashboard with unified control and reporting.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: FiUsers,
    title: 'Employee Lifecycle',
    description: 'Complete hire-to-retire management — onboarding, transfers, promotions, resignations, and alumni tracking.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: FiClock,
    title: 'Attendance & Leave',
    description: 'Biometric, GPS, and shift-based attendance with geofencing, overtime, WFH snapshots, and smart leave workflows.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: FiDollarSign,
    title: 'Payroll & Compliance',
    description: 'Flexible salary structures, statutory compliance, bank files, payslips, and multi-country payroll processing.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: FiBriefcase,
    title: 'Recruitment ATS',
    description: 'Post jobs, track candidates through a visual pipeline, AI resume screening, interview scheduling, and offer management.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: FiTarget,
    title: 'Performance Management',
    description: '360° reviews, goal setting, OKRs, continuous feedback, calibration, and performance analytics dashboards.',
    color: 'from-indigo-500 to-blue-500',
  },
  {
    icon: FiCpu,
    title: 'AI-Powered',
    description: 'AI chatbot for HR queries, resume screening, predictive analytics, burnout detection, and anomaly insights.',
    color: 'from-fuchsia-500 to-pink-500',
  },
];

const modules = [
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
  { icon: FiZap, name: 'Workflows', desc: 'Automation engine' },
  { icon: FiPackage, name: 'Assets', desc: 'Tracking & assignments' },
  { icon: FiLayers, name: 'Company Management', desc: 'Multi-company & groups' },
  { icon: FiLock, name: 'Role-Based Access', desc: 'Permissions & RBAC' },
];

const trialBenefits = [
  '15-day free trial, no credit card required',
  'Create your own subdomain (companyname.3boxeshrms.com)',
  'Full access to all features during trial',
  'After 15 days, choose a subscription plan to continue',
];

const pricingPlans = [
  {
    name: 'Starter',
    price: '₹4,999',
    period: '/month',
    description: 'Perfect for small teams getting started with HR automation.',
    features: [
      'Up to 50 employees',
      'Core HR & Employee Management',
      'Attendance & Leave',
      'Basic Payroll',
      'Recruitment ATS',
      'Email Support',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '₹12,999',
    period: '/month',
    description: 'For growing companies that need advanced HR capabilities.',
    features: [
      'Up to 250 employees',
      'Everything in Starter',
      'Performance & OKRs',
      'Advanced Payroll & Compliance',
      'AI Chatbot & Analytics',
      'Multi-Company Support',
      'Custom Workflows',
      'Priority Support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Coming Soon',
    period: '',
    description: 'For large organizations with complex HR needs.',
    features: [
      'Unlimited employees',
      'Everything in Professional',
      'AI-Powered Insights',
      'Custom Integrations',
      'Dedicated Account Manager',
      'SLA Guarantee',
      'On-Premise Option',
      'Custom Training',
    ],
    cta: 'Contact Us',
    highlighted: false,
  },
];

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Trial', href: '#trial' },
  { label: 'Pricing', href: '#pricing' },
];

/* ───────────────────── Animated Counter ───────────────────── */

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return <span>{count.toLocaleString()}{suffix}</span>;
}

/* ───────────────────── Page Component ───────────────────── */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Fixed Header ─── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 backdrop-blur-lg shadow-sm border-b border-slate-100'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <Link href="/landing" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <FiGrid className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-slate-900">
                3Boxes <span className="gradient-text">HRMS</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* CTA + Mobile Toggle */}
            <div className="flex items-center gap-3">
              <Link
                href="/register"
                className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all"
              >
                Start Free Trial
                <FiArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-100 shadow-lg animate-slide-in-down">
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg text-center mt-3"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/80 via-violet-50/40 to-white" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-indigo-400/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-violet-400/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-8">
              <FiZap className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-700">
                AI-Powered Human Resource Management
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Transform Your HR{' '}
              <span className="gradient-text">with 3Boxes HRMS</span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              The all-in-one platform that modernizes every aspect of your HR operations — from
              hiring to retiring. Empower your team with AI-driven insights and seamless automation.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-base font-semibold shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all"
              >
                Start Your 15-Day Free Trial
                <FiArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-slate-700 text-base font-semibold border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
              >
                <FiPlay className="w-5 h-5 text-indigo-600" />
                See How It Works
              </a>
            </div>

            {/* Trust Badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <FiCheck className="w-4 h-4 text-emerald-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <FiCheck className="w-4 h-4 text-emerald-500" />
                Setup in 2 minutes
              </div>
              <div className="flex items-center gap-2">
                <FiCheck className="w-4 h-4 text-emerald-500" />
                Cancel anytime
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-16 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {[
              { value: 500, suffix: '+', label: 'Companies Trust Us' },
              { value: 50, suffix: 'K+', label: 'Employees Managed' },
              { value: 20, suffix: '+', label: 'HR Modules' },
              { value: 99, suffix: '.9%', label: 'Uptime SLA' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center p-4 sm:p-6 rounded-2xl bg-white border border-slate-100 shadow-sm"
              >
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 mb-4">
              <FiStar className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                Key Features
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              Everything You Need to Manage HR
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              From attendance tracking to AI-powered analytics, 3Boxes HRMS covers every aspect of
              modern human resource management.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group relative p-6 sm:p-8 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:border-slate-200 transition-all duration-300"
                >
                  {/* Icon */}
                  <div
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-lg mb-5`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{feature.description}</p>

                  {/* Hover gradient */}
                  <div
                    className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Modules Grid Section ─── */}
      <section id="modules" className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 border border-violet-100 mb-4">
              <FiGrid className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">
                Modules
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              20+ HR Modules at Your Fingertips
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              A comprehensive suite covering every HR function, designed to work together seamlessly.
            </p>
          </div>

          {/* Modules Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {modules.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={idx}
                  className="group p-4 sm:p-5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 text-center"
                >
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 mb-3 group-hover:bg-indigo-100 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{mod.name}</h4>
                  <p className="text-xs text-slate-500 leading-snug">{mod.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Trial Section ─── */}
      <section id="trial" className="py-16 sm:py-24 bg-slate-900 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-slate-900 to-violet-900/30" />
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 mb-6">
                <FiZap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-indigo-300">
                  Free Trial
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                Try 3Boxes HRMS{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                  Risk-Free
                </span>
              </h2>

              <p className="mt-6 text-lg text-slate-300 leading-relaxed">
                Get full access to every feature for 15 days. No credit card needed, no strings
                attached. Set up your own subdomain and experience the power of modern HR
                management.
              </p>

              {/* Benefits */}
              <div className="mt-8 space-y-4">
                {trialBenefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
                      <FiCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-slate-200">{benefit}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/register"
                className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-base font-semibold shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all"
              >
                Start Your 15-Day Free Trial
                <FiArrowRight className="w-5 h-5" />
              </Link>
            </div>

            {/* Right: Subdomain Visual */}
            <div className="relative">
              <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="ml-4 flex-1 h-8 bg-slate-700 rounded-lg flex items-center px-4">
                    <FiGlobe className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <span className="text-sm text-slate-300 font-mono">
                      acme.3boxeshrms.com
                    </span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center">
                      <FiUsers className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Employee Management</div>
                      <div className="text-xs text-slate-400">Active &mdash; 142 employees</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/30 flex items-center justify-center">
                      <FiDollarSign className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Payroll Processing</div>
                      <div className="text-xs text-slate-400">March 2026 &mdash; In Progress</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/30 flex items-center justify-center">
                      <FiCpu className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">AI Assistant</div>
                      <div className="text-xs text-slate-400">3 queries answered today</div>
                    </div>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/30 flex items-center justify-center">
                      <FiBriefcase className="w-4 h-4 text-pink-400" />
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

      {/* ─── Pricing Section ─── */}
      <section id="pricing" className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 mb-4">
              <FiDollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                Pricing
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Start with a 15-day free trial, then choose the plan that fits your organization.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, idx) => (
              <div
                key={idx}
                className={`relative rounded-2xl p-6 sm:p-8 transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-2xl shadow-indigo-500/25 scale-[1.02] lg:scale-105'
                    : plan.name === 'Enterprise'
                    ? 'bg-slate-900 text-white border border-slate-800'
                    : 'bg-white border border-slate-200 shadow-sm hover:shadow-lg'
                }`}
              >
                {/* Popular Badge */}
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-bold shadow-lg">
                    Most Popular
                  </div>
                )}

                {/* Enterprise Badge */}
                {plan.name === 'Enterprise' && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-bold">
                    Coming Soon
                  </div>
                )}

                <h3
                  className={`text-xl font-bold ${
                    plan.highlighted ? 'text-white' : plan.name === 'Enterprise' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {plan.name}
                </h3>

                <div className="mt-4">
                  <span
                    className={`text-4xl sm:text-5xl font-extrabold ${
                      plan.highlighted ? 'text-white' : plan.name === 'Enterprise' ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className={`text-sm ${
                        plan.highlighted ? 'text-indigo-200' : 'text-slate-500'
                      }`}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>

                <p
                  className={`mt-3 text-sm leading-relaxed ${
                    plan.highlighted ? 'text-indigo-200' : plan.name === 'Enterprise' ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-6 space-y-3">
                  {plan.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5">
                      <FiCheck
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          plan.highlighted ? 'text-indigo-200' : plan.name === 'Enterprise' ? 'text-slate-500' : 'text-emerald-500'
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          plan.highlighted ? 'text-indigo-100' : plan.name === 'Enterprise' ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                <Link
                  href={plan.name === 'Enterprise' ? '/landing' : '/register'}
                  className={`mt-8 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                    plan.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50 shadow-lg'
                      : plan.name === 'Enterprise'
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {plan.cta}
                  <FiArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-16 sm:py-24 bg-gradient-to-r from-indigo-600 to-violet-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Ready to Transform<br className="hidden sm:block" /> Your HR Operations?
          </h2>
          <p className="mt-6 text-lg sm:text-xl text-indigo-200 max-w-2xl mx-auto">
            Join hundreds of companies that trust 3Boxes HRMS to manage their workforce.
            Start your free trial today — no credit card required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-indigo-600 text-base font-bold shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
            >
              Start Free Trial
              <FiArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-500/30 text-white text-base font-semibold border border-indigo-400/40 hover:bg-indigo-500/40 transition-all"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-slate-900 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <Link href="/landing" className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
                  <FiGrid className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">
                  3Boxes <span className="text-indigo-400">HRMS</span>
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed">
                The complete AI-powered Human Resource Management System for modern organizations.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Product
              </h4>
              <ul className="space-y-2.5">
                {['Features', 'Modules', 'Pricing', 'AI Capabilities'].map((item) => (
                  <li key={item}>
                    <a
                      href={`#${item.toLowerCase().replace(' ', '-')}`}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Company
              </h4>
              <ul className="space-y-2.5">
                {['About Us', 'Careers', 'Blog', 'Contact'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Legal
              </h4>
              <ul className="space-y-2.5">
                {['Privacy Policy', 'Terms of Service', 'GDPR', 'Security'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm">
              &copy; {new Date().getFullYear()} 3Boxes HRMS. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm hover:text-white transition-colors">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
