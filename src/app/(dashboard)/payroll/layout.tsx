'use client';

/**
 * Payroll Layout — wraps every /payroll/* page with a sticky, categorized
 * sub-navigation bar so users can jump between payroll sub-modules without
 * going back to the landing page.
 *
 * Pattern: similar to how /employees/[id] uses tab navigation, but applied
 * to the entire payroll module via Next.js nested layout.
 *
 * The sub-nav groups 27 payroll sub-modules into 6 categories with
 * dropdown menus to keep the bar compact.
 */

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  FiDollarSign,
  FiChevronDown,
  FiChevronRight,
  FiLayers,
  FiPercent,
  FiDatabase,
  FiEdit3,
  FiShield,
  FiBarChart2,
  FiFileText,
  FiPlayCircle,
  FiCheckSquare,
  FiClock,
  FiActivity,
  FiLock,
  FiTruck,
  FiGrid,
  FiCalendar,
  FiBook,
  FiGlobe,
  FiCreditCard,
  FiFile,
  FiUserCheck,
  FiCpu,
  FiClipboard,
} from 'react-icons/fi';
import Link from 'next/link';

interface SubItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isNew?: boolean;
}

interface SubCategory {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SubItem[];
}

const categories: SubCategory[] = [
  {
    key: 'compensation',
    label: 'Compensation Setup',
    icon: FiLayers,
    items: [
      { label: 'CTC Templates', href: '/payroll/ctc-templates', icon: FiLayers },
      { label: 'CTC Calculator', href: '/payroll/ctc-calculator', icon: FiPercent },
      { label: 'Component Master', href: '/payroll/components', icon: FiDatabase },
      { label: 'Salary Settings', href: '/payroll/salary-settings', icon: FiEdit3 },
      { label: 'Payroll Definitions', href: '/payroll/definitions', icon: FiClipboard },
    ],
  },
  {
    key: 'tax',
    label: 'Tax & Statutory',
    icon: FiShield,
    items: [
      { label: 'Income Tax', href: '/payroll/income-tax', icon: FiFileText },
      { label: 'Tax Slabs', href: '/payroll/tax-slabs', icon: FiBarChart2 },
      { label: 'Statutory Components', href: '/payroll/statutory', icon: FiShield },
      { label: 'Gratuity', href: '/payroll/gratuity', icon: FiTruck },
    ],
  },
  {
    key: 'processing',
    label: 'Payroll Processing',
    icon: FiPlayCircle,
    items: [
      { label: 'Payroll Inputs', href: '/payroll/inputs', icon: FiEdit3 },
      { label: 'Pre-Payroll Validation', href: '/payroll/validations', icon: FiCheckSquare },
      { label: 'Payroll Processing', href: '/payroll/processing', icon: FiPlayCircle },
      { label: 'Overtime', href: '/payroll/overtime', icon: FiActivity },
      { label: 'Loans', href: '/payroll/loans', icon: FiDollarSign },
      { label: 'F&F Settlement', href: '/payroll/fnf', icon: FiTruck },
      { label: 'Payroll Holds', href: '/payroll/holds', icon: FiLock },
    ],
  },
  {
    key: 'global',
    label: 'Multi-Country',
    icon: FiGlobe,
    items: [
      { label: 'Currency & FX', href: '/payroll/currency', icon: FiDollarSign },
      { label: 'Dimensions', href: '/payroll/dimensions', icon: FiGrid },
      { label: 'Cross-Border Secondment', href: '/payroll/secondment', icon: FiGlobe, isNew: true },
      { label: 'Group Dashboard', href: '/payroll/group-dashboard', icon: FiGlobe, isNew: true },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance & Filing',
    icon: FiCalendar,
    items: [
      { label: 'Compliance Calendar', href: '/payroll/compliance', icon: FiCalendar },
      { label: 'GL Mapping', href: '/payroll/gl-mapping', icon: FiBook },
      { label: 'Bank File Generation', href: '/payroll/bank-files', icon: FiFile },
      { label: 'Reports & Dashboard', href: '/payroll/reports', icon: FiFileText },
    ],
  },
  {
    key: 'payments',
    label: 'Employee Payments',
    icon: FiCreditCard,
    items: [
      { label: 'Payment Methods', href: '/payroll/payment-methods', icon: FiCreditCard },
      { label: 'Payslips', href: '/payroll/payslips', icon: FiFileText },
    ],
  },
  {
    key: 'governance',
    label: 'Governance & AI',
    icon: FiCpu,
    items: [
      { label: 'Payroll Approvals', href: '/payroll/approvals', icon: FiUserCheck, isNew: true },
      { label: 'AI Insights', href: '/payroll/ai-insights', icon: FiCpu, isNew: true },
    ],
  },
];

function PayrollSubMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [openCat, setOpenCat] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenCat(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Find current category + label for the breadcrumb-style header
  const currentCategory = categories.find((cat) =>
    cat.items.some((item) => pathname === item.href || pathname?.startsWith(item.href + '/'))
  );
  const currentItem = currentCategory?.items.find(
    (item) => pathname === item.href || pathname?.startsWith(item.href + '/')
  );

  // Check for section pages (Masters / Transactions / Reports)
  const sectionPages: Record<string, { label: string; parent: string }> = {
    '/payroll/masters': { label: 'Payroll Masters', parent: 'Masters' },
    '/payroll/transactions': { label: 'Payroll Transactions', parent: 'Transactions' },
    '/payroll/reports': { label: 'Payroll Reports', parent: 'Reports' },
  };
  const currentSection = sectionPages[pathname || ''];

  const isLandingPage = pathname === '/payroll';

  return (
    <div className="thb-card overflow-hidden">
      {/* Top bar: Payroll title + breadcrumb */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border-b border-thb-border">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/payroll" className="flex items-center gap-1.5 font-semibold text-thb-text-primary hover:text-emerald-600 transition-colors">
            <FiDollarSign className="w-4 h-4 text-emerald-500" />
            Payroll
          </Link>
          {currentSection && (
            <>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <span className="font-medium text-emerald-700">{currentSection.label}</span>
            </>
          )}
          {currentItem && !currentSection && (
            <>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <span className="text-thb-text-secondary">{currentCategory?.label}</span>
              <FiChevronRight className="w-3 h-3 text-thb-text-muted" />
              <span className="font-medium text-emerald-700">{currentItem.label}</span>
            </>
          )}
          {isLandingPage && (
            <span className="ml-2 text-xs text-thb-text-muted">Overview</span>
          )}
        </div>
        <Link
          href="/payroll"
          className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
            isLandingPage
              ? 'bg-emerald-100 text-emerald-700'
              : 'text-thb-text-secondary hover:bg-slate-100 hover:text-thb-text-primary'
          }`}
        >
          Module Home
        </Link>
      </div>

      {/* Section quick-links + Category dropdown bar */}
      <div ref={navRef} className="relative flex items-center gap-1 px-2 py-1.5 overflow-x-auto bg-white">
        {/* Section quick-links */}
        <Link href="/payroll/masters" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${pathname === '/payroll/masters' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'}`}>
          <FiDatabase className="w-3.5 h-3.5" /> Masters
        </Link>
        <Link href="/payroll/transactions" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${pathname === '/payroll/transactions' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'}`}>
          <FiEdit3 className="w-3.5 h-3.5" /> Transactions
        </Link>
        <Link href="/payroll/reports" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${pathname === '/payroll/reports' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'}`}>
          <FiFileText className="w-3.5 h-3.5" /> Reports
        </Link>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        {/* Category dropdowns */}
        {categories.map((cat) => {
          const IconComp = cat.icon;
          const isCurrentCat = currentCategory?.key === cat.key;
          const isOpen = openCat === cat.key;
          return (
            <div key={cat.key} className="relative flex-shrink-0">
              <button
                onClick={() => setOpenCat(isOpen ? null : cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isCurrentCat
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isOpen
                    ? 'bg-slate-100 text-thb-text-primary'
                    : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {cat.label}
                <FiChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-thb-border py-1 z-50">
                  {cat.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    return (
                      <button
                        key={item.href}
                        onClick={() => {
                          router.push(item.href);
                          setOpenCat(null);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                          isActive ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-thb-text-secondary'
                        }`}
                      >
                        <ItemIcon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-thb-text-muted'}`} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.isNew && (
                          <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-violet-100 text-violet-700">New</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PayrollSubMenu />
      {children}
    </div>
  );
}
