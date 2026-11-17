'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
/* Task 156 — the shell header is now the shared SmartHR gradient banner,
   identical to /dashboard and /employees/dashboard. */
import { PageBreadcrumbs, DateChip } from '@/components/dashboard/smarthr-widgets';

export interface DashboardTabConfig {
  label: string;
  key: string;
  icon: React.ReactNode;
  isNew?: boolean;
}

interface ModuleDashboardShellProps {
  moduleKey: string;            // e.g., 'company', 'employee' — matches navSections key
  moduleLabel: string;          // e.g., 'Company', 'Employee'
  moduleIcon: React.ReactNode;  // icon for the header
  gradientColor: string;        // e.g., 'from-emerald-500 to-green-600'
  tabs: DashboardTabConfig[];
  children: Record<string, ReactNode>;  // keyed by tab key
  overviewContent?: ReactNode;  // default/overview tab content
  /** Task 156 — SmartHR banner title (defaults to moduleLabel). */
  title?: string;
  /** Task 156 — SmartHR banner trail (defaults to [moduleLabel]). */
  trail?: string[];
  /** Task 156 — extra right-slot content for the banner (defaults to a DateChip). */
  headerRight?: ReactNode;
}

export default function ModuleDashboardShell({
  moduleKey,
  moduleLabel,
  moduleIcon,
  gradientColor,
  tabs,
  children,
  overviewContent,
  title,
  trail,
  headerRight,
}: ModuleDashboardShellProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab');

  // Find the active tab
  const [activeTab, setActiveTab] = useState<string>(
    tabFromUrl && tabs.some(t => t.key === tabFromUrl) ? tabFromUrl : (tabs[0]?.key || 'overview')
  );

  // Sync with URL
  useEffect(() => {
    if (tabFromUrl && tabs.some(t => t.key === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, tabs]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    // Update URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  // Render the active tab's content
  const renderContent = () => {
    if (activeTab === 'overview' && overviewContent) {
      return overviewContent;
    }
    if (children[activeTab]) {
      return children[activeTab];
    }
    // Placeholder for tabs without content — provide navigation to dedicated pages
    const tabLabel = tabs.find(t => t.key === activeTab)?.label || activeTab;
    const tabKey = activeTab;
    // Build a link to the dedicated page if it's a reports or settings tab
    let navLink = '';
    if (tabKey === 'reports') navLink = `/${moduleKey === 'company' ? 'reports' : moduleKey === 'employee' ? 'employees/dashboard' : moduleKey}/reports`;
    else if (tabKey === 'settings') navLink = `/${moduleKey === 'company' ? 'settings' : moduleKey === 'employee' ? 'settings' : moduleKey === 'payroll' ? 'payroll/salary-settings' : moduleKey}/settings`;

    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradientColor} flex items-center justify-center shadow-lg mb-4`}>
          {tabs.find(t => t.key === activeTab)?.icon || moduleIcon}
        </div>
        <h3 className="text-lg font-bold text-thb-text-primary mb-1">
          {tabLabel}
        </h3>
        <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
          {moduleLabel} {tabLabel} — view and manage {tabKey === 'reports' ? 'analytics and reports' : tabKey === 'settings' ? 'configuration and preferences' : 'details'}.
        </p>
        {navLink && (
          <a href={navLink} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
            Go to {tabLabel}
          </a>
        )}
      </div>
    );
  };

  /* Task 156 — the flat icon+h1 title row is replaced by the same royal→violet
     gradient PageBreadcrumbs banner every other dashboard uses; the tab bar
     (URL-synced, unchanged logic) sits right below it with a royal active pill. */
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div>
      {/* Module Header with Tabs */}
      <div className="mb-6">
        {/* SmartHR gradient banner (replaces the old flat module title row) */}
        <PageBreadcrumbs
          title={title ?? moduleLabel}
          trail={trail ?? [moduleLabel]}
          right={headerRight ?? <DateChip value={todayChip} />}
        />

        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-[#3A57C4] text-white shadow-sm'
                    : 'text-thb-text-secondary hover:text-thb-text-primary hover:bg-white/50'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-thb-text-secondary'}>{tab.icon}</span>
                {tab.label}
                {tab.isNew && (
                  <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 border border-emerald-200">
                    NEW
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {renderContent()}
      </div>
    </div>
  );
}
