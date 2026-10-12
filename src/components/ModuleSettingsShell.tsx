'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { FiFileText, FiSliders, FiSettings, FiCheckSquare, FiChevronRight } from 'react-icons/fi';

/**
 * ModuleSettingsShell — a shared 4-tab shell for every module's settings page.
 *
 * Standardizes the settings structure across all HRMS modules:
 *   1. Policy            — what the policy says (documents, high-level policy)
 *   2. Rules              — operational rules (max carry forward, probation, etc.)
 *   3. Configuration      — system configuration (enable/disable features, defaults)
 *   4. Approver Workflow  — multi-tier approval chain
 *
 * The 4 tabs are SEPARATE PAGES reachable via URL query param (?tab=policy |
 * rules | configuration | approver-workflow). The shell reads the active tab
 * from the URL and renders the corresponding content. The sidebar nav has
 * 4 sub-links per module pointing to each ?tab= URL — so users can navigate
 * directly to the right slice.
 *
 * "Connect all of them as a flow of data" — at the bottom of each tab, a
 * "Next: <next tab> →" link flows the user through the 4 tabs in order:
 * Policy → Rules → Configuration → Approver Workflow.
 *
 * Props:
 *   - moduleName: display name (e.g. "Leave", "Attendance")
 *   - moduleAccent: tailwind color name for the active tab (e.g. "green", "teal")
 *   - policy: ReactNode for the Policy tab content
 *   - rules: ReactNode for the Rules tab content
 *   - configuration: ReactNode for the Configuration tab content
 *   - approverWorkflow: ReactNode for the Approver Workflow tab content
 *   - basePath: the module's settings URL prefix (e.g. "/leave/settings")
 */
type TabKey = 'policy' | 'rules' | 'configuration' | 'approver-workflow';

const TABS: { key: TabKey; label: string; icon: ReactNode; description: string }[] = [
  { key: 'policy',            label: 'Policy',            icon: <FiFileText className="w-4 h-4" />,    description: 'Policy documents and high-level policy definitions' },
  { key: 'rules',             label: 'Rules',              icon: <FiSliders className="w-4 h-4" />,     description: 'Operational rules (limits, thresholds, periods)' },
  { key: 'configuration',     label: 'Configuration',      icon: <FiSettings className="w-4 h-4" />,    description: 'System configuration (defaults, feature toggles, integrations)' },
  { key: 'approver-workflow', label: 'Approver Workflow',  icon: <FiCheckSquare className="w-4 h-4" />, description: 'Multi-tier approval chain for this module' },
];

interface Props {
  moduleName: string;
  moduleAccent?: string; // tailwind color base e.g. "green", "teal", "emerald"
  basePath: string; // e.g. "/leave/settings"
  policy?: ReactNode;
  rules?: ReactNode;
  configuration?: ReactNode;
  approverWorkflow?: ReactNode;
  /** Optional header content (e.g. cross-links to other related pages) */
  headerExtra?: ReactNode;
}

export default function ModuleSettingsShell({
  moduleName, moduleAccent = 'green', basePath,
  policy, rules, configuration, approverWorkflow, headerExtra,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Task 87: render ONLY the tabs whose content was provided. Modules that
  // moved Configuration / Approver Workflow to standalone pages simply stop
  // passing those props — the shell adapts instead of showing empty tabs.
  const visibleTabs = TABS.filter(t =>
    (t.key === 'policy' && policy) ||
    (t.key === 'rules' && rules) ||
    (t.key === 'configuration' && configuration) ||
    (t.key === 'approver-workflow' && approverWorkflow)
  );

  const tabFromUrl = (searchParams.get('tab') as TabKey) || visibleTabs[0]?.key;
  const activeTab: TabKey = visibleTabs.some(t => t.key === tabFromUrl) ? tabFromUrl : (visibleTabs[0]?.key || 'policy');

  // Sync URL when user clicks a tab
  const setActiveTab = (key: TabKey) => {
    router.push(`${basePath}?tab=${key}`);
  };

  const currentTab = visibleTabs.find(t => t.key === activeTab)!;
  const currentIdx = visibleTabs.findIndex(t => t.key === activeTab);
  const nextTab = visibleTabs[currentIdx + 1];

  const accentClasses: Record<string, { activeBg: string; activeText: string; activeBorder: string; btn: string }> = {
    green:    { activeBg: 'bg-green-50',    activeText: 'text-green-700',    activeBorder: 'border-green-500',    btn: 'bg-green-500 hover:bg-green-600' },
    teal:     { activeBg: 'bg-teal-50',     activeText: 'text-teal-700',     activeBorder: 'border-teal-500',     btn: 'bg-teal-500 hover:bg-teal-600' },
    emerald:  { activeBg: 'bg-emerald-50',  activeText: 'text-emerald-700',  activeBorder: 'border-emerald-500',  btn: 'bg-emerald-500 hover:bg-emerald-600' },
    amber:    { activeBg: 'bg-amber-50',    activeText: 'text-amber-700',    activeBorder: 'border-amber-500',    btn: 'bg-amber-500 hover:bg-amber-600' },
    cyan:     { activeBg: 'bg-cyan-50',     activeText: 'text-cyan-700',     activeBorder: 'border-cyan-500',     btn: 'bg-cyan-500 hover:bg-cyan-600' },
  };
  const a = accentClasses[moduleAccent] || accentClasses.green;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">{moduleName} Settings</h1>
          <p className="text-thb-text-secondary mt-1">{currentTab.description}</p>
        </div>
        {headerExtra}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? `bg-white ${a.activeText} shadow-sm border ${a.activeBorder}`
                : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'policy' && (policy || <EmptyState moduleName={moduleName} tab="Policy" />)}
        {activeTab === 'rules' && (rules || <EmptyState moduleName={moduleName} tab="Rules" />)}
        {activeTab === 'configuration' && (configuration || <EmptyState moduleName={moduleName} tab="Configuration" />)}
        {activeTab === 'approver-workflow' && (approverWorkflow || <EmptyState moduleName={moduleName} tab="Approver Workflow" />)}
      </div>

      {/* Cross-flow navigation: "Next: <next tab> →" link at the bottom */}
      {nextTab && (
        <div className="flex items-center justify-between pt-4 border-t border-thb-border">
          <p className="text-xs text-thb-text-muted">
            Step {currentIdx + 1} of {visibleTabs.length} — {currentTab.label}
          </p>
          <button
            onClick={() => setActiveTab(nextTab.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white ${a.btn} transition-colors`}
          >
            Next: {nextTab.label} <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {!nextTab && (
        <div className="flex items-center justify-between pt-4 border-t border-thb-border">
          <p className="text-xs text-thb-text-muted">All {visibleTabs.length} steps complete — your {moduleName.toLowerCase()} settings flow is fully configured.</p>
          <Link href={basePath} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${a.activeBg} ${a.activeText} border ${a.activeBorder} transition-colors`}>
            Back to top
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyState({ moduleName, tab }: { moduleName: string; tab: string }) {
  return (
    <div className="thb-card p-12 text-center">
      <FiSettings className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <h3 className="text-md font-semibold text-thb-text-primary">{moduleName} {tab}</h3>
      <p className="text-sm text-thb-text-muted mt-1 max-w-md mx-auto">
        The {tab.toLowerCase()} section for {moduleName.toLowerCase()} is being prepared.
        In the meantime, you can configure {moduleName.toLowerCase()} settings via the existing tabs and pages.
      </p>
    </div>
  );
}
