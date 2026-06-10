'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiInfo,
  FiChevronDown,
  FiChevronUp,
  FiX,
  FiCheck,
  FiArrowRight,
} from 'react-icons/fi';

interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  route?: string;
}

interface ModuleWorkflowProps {
  moduleKey: string;
  title: string;
  subtitle?: string;
  steps: WorkflowStep[];
  accentColor?: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'cyan';
  completedSteps?: Set<number>;
}

const emptySubscribe = () => () => {};

const accentColorMap = {
  emerald: {
    headerBg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
    headerBorder: 'border-emerald-100',
    headerIconBg: 'bg-emerald-100',
    headerIconColor: 'text-emerald-600',
    badgeBg: 'text-emerald-700 bg-emerald-100',
    infoBannerBg: 'bg-emerald-50 border-emerald-100',
    infoBannerText: 'text-emerald-700',
    completeBg: 'bg-emerald-500',
    completeShadow: 'shadow-emerald-500/25',
    completeText: 'text-emerald-600',
    arrowColor: 'text-emerald-400',
    lineColor: 'bg-emerald-300',
  },
  blue: {
    headerBg: 'bg-gradient-to-r from-blue-50 to-indigo-50',
    headerBorder: 'border-blue-100',
    headerIconBg: 'bg-blue-100',
    headerIconColor: 'text-blue-600',
    badgeBg: 'text-blue-700 bg-blue-100',
    infoBannerBg: 'bg-blue-50 border-blue-100',
    infoBannerText: 'text-blue-700',
    completeBg: 'bg-blue-500',
    completeShadow: 'shadow-blue-500/25',
    completeText: 'text-blue-600',
    arrowColor: 'text-blue-400',
    lineColor: 'bg-blue-300',
  },
  violet: {
    headerBg: 'bg-gradient-to-r from-violet-50 to-purple-50',
    headerBorder: 'border-violet-100',
    headerIconBg: 'bg-violet-100',
    headerIconColor: 'text-violet-600',
    badgeBg: 'text-violet-700 bg-violet-100',
    infoBannerBg: 'bg-violet-50 border-violet-100',
    infoBannerText: 'text-violet-700',
    completeBg: 'bg-violet-500',
    completeShadow: 'shadow-violet-500/25',
    completeText: 'text-violet-600',
    arrowColor: 'text-violet-400',
    lineColor: 'bg-violet-300',
  },
  amber: {
    headerBg: 'bg-gradient-to-r from-amber-50 to-orange-50',
    headerBorder: 'border-amber-100',
    headerIconBg: 'bg-amber-100',
    headerIconColor: 'text-amber-600',
    badgeBg: 'text-amber-700 bg-amber-100',
    infoBannerBg: 'bg-amber-50 border-amber-100',
    infoBannerText: 'text-amber-700',
    completeBg: 'bg-amber-500',
    completeShadow: 'shadow-amber-500/25',
    completeText: 'text-amber-600',
    arrowColor: 'text-amber-400',
    lineColor: 'bg-amber-300',
  },
  rose: {
    headerBg: 'bg-gradient-to-r from-rose-50 to-pink-50',
    headerBorder: 'border-rose-100',
    headerIconBg: 'bg-rose-100',
    headerIconColor: 'text-rose-600',
    badgeBg: 'text-rose-700 bg-rose-100',
    infoBannerBg: 'bg-rose-50 border-rose-100',
    infoBannerText: 'text-rose-700',
    completeBg: 'bg-rose-500',
    completeShadow: 'shadow-rose-500/25',
    completeText: 'text-rose-600',
    arrowColor: 'text-rose-400',
    lineColor: 'bg-rose-300',
  },
  cyan: {
    headerBg: 'bg-gradient-to-r from-cyan-50 to-sky-50',
    headerBorder: 'border-cyan-100',
    headerIconBg: 'bg-cyan-100',
    headerIconColor: 'text-cyan-600',
    badgeBg: 'text-cyan-700 bg-cyan-100',
    infoBannerBg: 'bg-cyan-50 border-cyan-100',
    infoBannerText: 'text-cyan-700',
    completeBg: 'bg-cyan-500',
    completeShadow: 'shadow-cyan-500/25',
    completeText: 'text-cyan-600',
    arrowColor: 'text-cyan-400',
    lineColor: 'bg-cyan-300',
  },
};

export default function ModuleWorkflow({
  moduleKey,
  title,
  subtitle,
  steps,
  accentColor = 'emerald',
  completedSteps = new Set(),
}: ModuleWorkflowProps) {
  const router = useRouter();
  const storageKey = `nexus_workflow_collapsed_${moduleKey}`;
  const dismissKey = `nexus_workflow_dismissed_${moduleKey}`;

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(storageKey) === 'true'; } catch { return false; }
  });

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(dismissKey) === 'true'; } catch { return false; }
  });

  const handleToggleCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
  }, [collapsed, storageKey]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, 'true'); } catch { /* ignore */ }
  }, [dismissKey]);

  const handleShowWorkflow = useCallback(() => {
    setDismissed(false);
    setCollapsed(false);
    try { localStorage.setItem(dismissKey, 'false'); } catch { /* ignore */ }
  }, [dismissKey]);

  const handleNavigate = useCallback((route: string) => {
    router.push(route);
  }, [router]);

  if (!mounted) return null;

  const colors = accentColorMap[accentColor];
  const completedCount = steps.filter(s => completedSteps.has(s.step)).length;

  const getStepStatus = (step: WorkflowStep): 'complete' | 'current' | 'pending' => {
    if (completedSteps.has(step.step)) return 'complete';
    const firstIncomplete = steps.find(s => !completedSteps.has(s.step));
    if (firstIncomplete && firstIncomplete.step === step.step) return 'current';
    return 'pending';
  };

  if (dismissed) {
    return (
      <button
        onClick={handleShowWorkflow}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 text-xs font-medium hover:from-emerald-100 hover:to-teal-100 transition-all duration-200 shadow-sm"
      >
        <FiInfo className="w-3.5 h-3.5" />
        Show Workflow
      </button>
    );
  }

  return (
    <div className="nexus-card overflow-hidden border border-slate-100">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${colors.headerBg} border-b ${colors.headerBorder}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${colors.headerIconBg} flex items-center justify-center`}>
            <FiInfo className={`w-4 h-4 ${colors.headerIconColor}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-nexus-text-primary">{title}</h3>
            {subtitle && (
              <p className="text-xs text-nexus-text-secondary mt-0.5">{subtitle}</p>
            )}
          </div>
          <span className={`text-[10px] font-medium ${colors.badgeBg} px-2 py-0.5 rounded-full ml-2`}>
            {completedCount}/{steps.length} complete
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/60 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <FiChevronDown className="w-4 h-4" /> : <FiChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Dismiss workflow"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      {!collapsed && completedCount < steps.length && (
        <div className={`mx-5 mt-4 px-4 py-3 rounded-lg ${colors.infoBannerBg} border flex items-center gap-3`}>
          <FiInfo className={`w-4 h-4 ${colors.infoBannerText} flex-shrink-0`} />
          <p className={`text-xs ${colors.infoBannerText}`}>
            <span className="font-medium">Getting started?</span> Follow this step-by-step workflow to complete the process. Each step links to the relevant section.
          </p>
        </div>
      )}

      {/* Steps Content */}
      {!collapsed && (
        <div className="p-5">
          {/* Desktop: Horizontal scrollable */}
          <div className="hidden md:block">
            <div className="flex items-start gap-0 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-slate-50">
              {steps.map((step, index) => {
                const status = getStepStatus(step);
                const isClickable = !!step.route;
                return (
                  <div key={step.step} className="flex items-start flex-shrink-0">
                    <button
                      onClick={() => isClickable && handleNavigate(step.route!)}
                      className={`flex flex-col items-center text-center w-28 group ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                      title={`Step ${step.step}: ${step.title}`}
                      disabled={!isClickable}
                    >
                      {/* Step Circle */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 group-hover:scale-110 ${
                          status === 'complete'
                            ? `${colors.completeBg} text-white shadow-md ${colors.completeShadow}`
                            : status === 'current'
                            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-100'
                            : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                        }`}
                      >
                        {status === 'complete' ? (
                          <FiCheck className="w-5 h-5" />
                        ) : (
                          step.step
                        )}
                      </div>
                      {/* Title */}
                      <p
                        className={`text-[11px] font-medium mt-2 leading-tight ${
                          status === 'complete'
                            ? colors.completeText
                            : status === 'current'
                            ? 'text-blue-600'
                            : 'text-slate-400 group-hover:text-slate-500'
                        }`}
                      >
                        {step.title}
                      </p>
                      {/* Description */}
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                        {step.description}
                      </p>
                    </button>
                    {/* Arrow connector */}
                    {index < steps.length - 1 && (
                      <div className="flex items-center pt-3 px-1">
                        <FiArrowRight className={`w-4 h-4 flex-shrink-0 ${
                          status === 'complete' ? colors.arrowColor : 'text-slate-200'
                        }`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: Vertical layout */}
          <div className="md:hidden space-y-0">
            {steps.map((step, index) => {
              const status = getStepStatus(step);
              const isClickable = !!step.route;
              return (
                <div key={step.step} className="flex items-start">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <button
                      onClick={() => isClickable && handleNavigate(step.route!)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                        status === 'complete'
                          ? `${colors.completeBg} text-white shadow-sm`
                          : status === 'current'
                          ? 'bg-blue-500 text-white shadow-sm ring-2 ring-blue-100'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                      disabled={!isClickable}
                    >
                      {status === 'complete' ? <FiCheck className="w-4 h-4" /> : step.step}
                    </button>
                    {index < steps.length - 1 && (
                      <div className={`w-0.5 h-8 ${
                        status === 'complete' ? colors.lineColor : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                  {/* Step content */}
                  <button
                    onClick={() => isClickable && handleNavigate(step.route!)}
                    className="flex-1 ml-3 pb-3 text-left group"
                    disabled={!isClickable}
                  >
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-xs font-semibold ${
                          status === 'complete'
                            ? colors.completeText
                            : status === 'current'
                            ? 'text-blue-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {step.title}
                      </p>
                      {status === 'current' && (
                        <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          Next Step
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-nexus-text-muted mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded-full ${colors.completeBg} flex items-center justify-center`}>
                <FiCheck className="w-2.5 h-2.5 text-white" />
              </span>
              <span className="text-[10px] text-nexus-text-muted">Complete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">•</span>
              </span>
              <span className="text-[10px] text-nexus-text-muted">Current Step</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-slate-100" />
              <span className="text-[10px] text-nexus-text-muted">Pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
