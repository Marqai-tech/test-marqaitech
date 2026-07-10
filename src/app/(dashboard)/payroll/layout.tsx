'use client';

/**
 * Payroll Layout — wraps every /payroll/* page with a simple breadcrumb bar.
 *
 * Navigation is driven by the 3 sidebar sub-section items:
 *   • Payroll Masters
 *   • Payroll Transactions
 *   • Payroll Reports
 *
 * The top bar shows:  Payroll > Section > Page  as a breadcrumb trail,
 * with the section links (Masters / Transactions / Reports) always visible.
 * No dropdown menus — all sub-page navigation happens via the sidebar.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { FiDollarSign, FiChevronRight, FiDatabase, FiEdit3, FiFileText } from 'react-icons/fi';

/* ── Route-to-section mapping ───────────────────────────────────────── */

interface PageInfo {
  section: 'masters' | 'transactions' | 'reports';
  label: string;
}

const routeMap: Record<string, PageInfo> = {
  // Masters
  '/payroll/ctc-templates':   { section: 'masters',      label: 'CTC Templates' },
  '/payroll/ctc-calculator':  { section: 'masters',      label: 'CTC Calculator' },
  '/payroll/components':      { section: 'masters',      label: 'Component Master' },
  '/payroll/salary-settings': { section: 'masters',      label: 'Salary Settings' },
  '/payroll/definitions':     { section: 'masters',      label: 'Payroll Definitions' },
  '/payroll/income-tax':      { section: 'masters',      label: 'Income Tax' },
  '/payroll/tax-slabs':       { section: 'masters',      label: 'Tax Slabs' },
  '/payroll/statutory':       { section: 'masters',      label: 'Statutory Components' },
  '/payroll/gratuity':        { section: 'masters',      label: 'Gratuity' },
  '/payroll/currency':        { section: 'masters',      label: 'Currency & FX' },
  '/payroll/dimensions':      { section: 'masters',      label: 'Dimensions' },
  '/payroll/payment-methods': { section: 'masters',      label: 'Payment Methods' },

  // Transactions
  '/payroll/inputs':          { section: 'transactions',  label: 'Payroll Inputs' },
  '/payroll/validations':     { section: 'transactions',  label: 'Pre-Payroll Validation' },
  '/payroll/processing':      { section: 'transactions',  label: 'Payroll Processing' },
  '/payroll/overtime':        { section: 'transactions',  label: 'Overtime' },
  '/payroll/loans':           { section: 'transactions',  label: 'Loans' },
  '/payroll/fnf':             { section: 'transactions',  label: 'F&F Settlement' },
  '/payroll/holds':           { section: 'transactions',  label: 'Payroll Holds' },
  '/payroll/bank-files':      { section: 'transactions',  label: 'Bank File Generation' },
  '/payroll/payslips':        { section: 'transactions',  label: 'Payslips' },
  '/payroll/secondment':      { section: 'transactions',  label: 'Cross-Border Secondment' },
  '/payroll/approvals':       { section: 'transactions',  label: 'Payroll Approvals' },
  '/payroll/ai-insights':     { section: 'transactions',  label: 'AI Insights' },
  '/payroll/group-dashboard': { section: 'transactions',  label: 'Group Dashboard' },

  // Reports
  '/payroll/reports':         { section: 'reports',       label: 'Reports & Dashboard' },
};

const sectionMeta: Record<string, { href: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  masters:      { href: '/payroll/masters',      label: 'Masters',      icon: FiDatabase },
  transactions: { href: '/payroll/transactions',  label: 'Transactions', icon: FiEdit3 },
  reports:      { href: '/payroll/reports',       label: 'Reports',      icon: FiFileText },
};

/* ── Component ──────────────────────────────────────────────────────── */

function PayrollBreadcrumb() {
  const pathname = usePathname();

  const isLanding = pathname === '/payroll';

  // Detect section landing pages
  const sectionLanding: Record<string, { section: 'masters' | 'transactions' | 'reports'; label: string }> = {
    '/payroll/masters':      { section: 'masters',      label: 'Payroll Masters' },
    '/payroll/transactions':  { section: 'transactions', label: 'Payroll Transactions' },
    '/payroll/reports':       { section: 'reports',      label: 'Payroll Reports' },
  };

  // Resolve current page info
  const landingInfo = sectionLanding[pathname || ''];
  const pageInfo = routeMap[pathname || ''];

  const currentSection = landingInfo?.section ?? pageInfo?.section;
  const currentPageLabel = landingInfo?.label ?? pageInfo?.label;

  // Determine which section quick-link is active
  const activeSection = currentSection ?? (pathname?.startsWith('/payroll/reports') ? 'reports' : pathname?.startsWith('/payroll/transactions') ? 'transactions' : 'masters');

  return (
    <div className="thb-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border-b border-thb-border">
        {/* Breadcrumb trail */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/payroll"
            className="flex items-center gap-1.5 font-semibold text-thb-text-primary hover:text-emerald-600 transition-colors"
          >
            <FiDollarSign className="w-4 h-4 text-emerald-500" />
            Payroll
          </Link>

          {/* Section level */}
          {currentSection && (
            <>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <Link
                href={sectionMeta[currentSection].href}
                className="text-thb-text-secondary hover:text-emerald-600 transition-colors"
              >
                {sectionMeta[currentSection].label}
              </Link>
            </>
          )}

          {/* Page level */}
          {currentPageLabel && !landingInfo && (
            <>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <span className="font-medium text-emerald-700">{currentPageLabel}</span>
            </>
          )}

          {/* Section landing page — just show section name as final crumb */}
          {landingInfo && (
            <>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <span className="font-medium text-emerald-700">{landingInfo.label}</span>
            </>
          )}

          {isLanding && (
            <span className="ml-2 text-xs text-thb-text-muted">Overview</span>
          )}
        </div>

        {/* Section quick-links (always visible) */}
        <div className="flex items-center gap-1">
          {(['masters', 'transactions', 'reports'] as const).map((key) => {
            const meta = sectionMeta[key];
            const Icon = meta.icon;
            const isActive = activeSection === key && !isLanding;
            return (
              <Link
                key={key}
                href={meta.href}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? key === 'masters'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : key === 'transactions'
                      ? 'bg-teal-100 text-teal-700 border border-teal-200'
                      : 'bg-amber-100 text-amber-700 border border-amber-200'
                    : 'text-thb-text-secondary hover:bg-slate-100 hover:text-thb-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────── */

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PayrollBreadcrumb />
      {children}
    </div>
  );
}
