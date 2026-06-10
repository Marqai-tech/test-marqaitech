'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiLayers,
  FiDatabase,
  FiShield,
  FiBarChart2,
  FiEdit3,
  FiPlayCircle,
  FiDollarSign,
  FiGrid,
  FiCalendar,
  FiBook,
  FiFileText,
  FiFile,
  FiUsers,
  FiClock,
  FiAlertCircle,
  FiArrowRight,
  FiCreditCard,
  FiTruck,
  FiActivity,
  FiClipboard,
  FiLock,
  FiCheckSquare,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiInfo,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Sub-module tile configuration ── */
interface SubModuleTile {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  description: string;
  gradientBg: string;
  iconColor: string;
  ringColor: string;
}

const subModules: SubModuleTile[] = [
  {
    title: 'CTC Templates',
    icon: FiLayers,
    route: '/payroll/ctc-templates',
    description: 'Define and manage Cost to Company salary structures',
    gradientBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500/20',
  },
  {
    title: 'Component Master',
    icon: FiDatabase,
    route: '/payroll/components',
    description: 'Configure payroll earnings, deductions, and allowances',
    gradientBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    ringColor: 'ring-purple-500/20',
  },
  {
    title: 'Statutory Components',
    icon: FiShield,
    route: '/payroll/statutory',
    description: 'Country-specific tax, PF, ESI, and compliance setup',
    gradientBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    ringColor: 'ring-emerald-500/20',
  },
  {
    title: 'Tax Slabs',
    icon: FiBarChart2,
    route: '/payroll/tax-slabs',
    description: 'Configure progressive income tax slab rates',
    gradientBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    ringColor: 'ring-amber-500/20',
  },
  {
    title: 'Payroll Inputs',
    icon: FiEdit3,
    route: '/payroll/inputs',
    description: 'Manage attendance, leave, OT, and variable pay inputs',
    gradientBg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    ringColor: 'ring-rose-500/20',
  },
  {
    title: 'Payroll Processing',
    icon: FiPlayCircle,
    route: '/payroll/processing',
    description: 'Run payroll cycles, review, and approve',
    gradientBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-500',
    ringColor: 'ring-cyan-500/20',
  },
  {
    title: 'Currency & FX',
    icon: FiDollarSign,
    route: '/payroll/currency',
    description: 'Multi-currency configuration and exchange rates',
    gradientBg: 'bg-teal-500/10',
    iconColor: 'text-teal-500',
    ringColor: 'ring-teal-500/20',
  },
  {
    title: 'Dimensions',
    icon: FiGrid,
    route: '/payroll/dimensions',
    description: 'Multi-dimensional cost allocation setup',
    gradientBg: 'bg-orange-500/10',
    iconColor: 'text-orange-500',
    ringColor: 'ring-orange-500/20',
  },
  {
    title: 'Compliance',
    icon: FiCalendar,
    route: '/payroll/compliance',
    description: 'Statutory filing calendar and obligation tracking',
    gradientBg: 'bg-violet-500/10',
    iconColor: 'text-violet-500',
    ringColor: 'ring-violet-500/20',
  },
  {
    title: 'GL Mapping',
    icon: FiBook,
    route: '/payroll/gl-mapping',
    description: 'Map payroll components to general ledger accounts',
    gradientBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-500',
    ringColor: 'ring-indigo-500/20',
  },
  {
    title: 'Reports & Dashboard',
    icon: FiFileText,
    route: '/payroll/reports',
    description: 'Salary register, statutory reports, and payroll analytics',
    gradientBg: 'bg-slate-500/10',
    iconColor: 'text-slate-500',
    ringColor: 'ring-slate-500/20',
  },
  {
    title: 'Payroll Definitions',
    icon: FiClipboard,
    route: '/payroll/definitions',
    description: 'Configure pay frequency, cut-off dates, and costing segments',
    gradientBg: 'bg-sky-500/10',
    iconColor: 'text-sky-500',
    ringColor: 'ring-sky-500/20',
  },
  {
    title: 'Payment Methods',
    icon: FiCreditCard,
    route: '/payroll/payment-methods',
    description: 'Employee bank details, split payments, and payment setup',
    gradientBg: 'bg-lime-500/10',
    iconColor: 'text-lime-500',
    ringColor: 'ring-lime-500/20',
  },
  {
    title: 'Payslips',
    icon: FiFileText,
    route: '/payroll/payslips',
    description: 'Generate, view, and print employee payslips',
    gradientBg: 'bg-pink-500/10',
    iconColor: 'text-pink-500',
    ringColor: 'ring-pink-500/20',
  },
  {
    title: 'Loans',
    icon: FiDollarSign,
    route: '/payroll/loans',
    description: 'Manage employee loans, EMI tracking, and recovery',
    gradientBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-500',
    ringColor: 'ring-yellow-500/20',
  },
  {
    title: 'Overtime',
    icon: FiActivity,
    route: '/payroll/overtime',
    description: 'Track overtime hours, approvals, and payments',
    gradientBg: 'bg-fuchsia-500/10',
    iconColor: 'text-fuchsia-500',
    ringColor: 'ring-fuchsia-500/20',
  },
  {
    title: 'F&F Settlement',
    icon: FiTruck,
    route: '/payroll/fnf',
    description: 'Full and Final settlement for exiting employees',
    gradientBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    ringColor: 'ring-red-500/20',
  },
  {
    title: 'Payroll Holds',
    icon: FiLock,
    route: '/payroll/holds',
    description: 'Hold or suspend employee payroll processing',
    gradientBg: 'bg-gray-500/10',
    iconColor: 'text-gray-500',
    ringColor: 'ring-gray-500/20',
  },
  {
    title: 'Pre-Payroll Validation',
    icon: FiCheckSquare,
    route: '/payroll/validations',
    description: 'Validate employee data before processing payroll',
    gradientBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    ringColor: 'ring-emerald-500/20',
  },
  {
    title: 'Bank File Generation',
    icon: FiFile,
    route: '/payroll/bank-files',
    description: 'Generate NACH/NEFT/RTGS bank payment files',
    gradientBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500/20',
  },
];

/* ── Payroll Workflow Steps ── */
interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  route: string;
  statKey: string; // key in workflowData
}

const workflowSteps: WorkflowStep[] = [
  {
    step: 1,
    title: 'Setup Components',
    description: 'Configure earnings, deductions, and allowances in Component Master',
    route: '/payroll/components',
    statKey: 'hasComponents',
  },
  {
    step: 2,
    title: 'Setup Statutory',
    description: 'Configure PF, ESI, PT, TDS in Statutory Components',
    route: '/payroll/statutory',
    statKey: 'hasStatutory',
  },
  {
    step: 3,
    title: 'Create CTC Templates',
    description: 'Define salary structures using CTC Templates',
    route: '/payroll/ctc-templates',
    statKey: 'hasCTCTemplates',
  },
  {
    step: 4,
    title: 'Configure Tax Slabs',
    description: 'Set up progressive tax slab rates',
    route: '/payroll/tax-slabs',
    statKey: 'hasTaxSlabs',
  },
  {
    step: 5,
    title: 'Set Payment Methods',
    description: 'Configure employee bank details and payment preferences',
    route: '/payroll/payment-methods',
    statKey: 'hasPaymentMethods',
  },
  {
    step: 6,
    title: 'Collect Inputs',
    description: 'Gather attendance, leave, OT, and variable pay data',
    route: '/payroll/inputs',
    statKey: 'hasInputs',
  },
  {
    step: 7,
    title: 'Run Validations',
    description: 'Pre-payroll validation to check for data issues',
    route: '/payroll/validations',
    statKey: 'hasValidations',
  },
  {
    step: 8,
    title: 'Process Payroll',
    description: 'Create and run payroll cycle',
    route: '/payroll/processing',
    statKey: 'hasPayrollRuns',
  },
  {
    step: 9,
    title: 'Review & Approve',
    description: 'Review calculations and approve payroll',
    route: '/payroll/processing',
    statKey: 'hasApprovedRuns',
  },
  {
    step: 10,
    title: 'Generate Payslips',
    description: 'Generate employee payslips',
    route: '/payroll/payslips',
    statKey: 'hasPayslips',
  },
  {
    step: 11,
    title: 'File Compliance',
    description: 'Complete statutory filings',
    route: '/payroll/compliance',
    statKey: 'hasCompliance',
  },
  {
    step: 12,
    title: 'Close Period',
    description: 'Close the payroll period',
    route: '/payroll/processing',
    statKey: 'hasClosedRuns',
  },
];

/* ── Stats type ── */
interface SummaryStats {
  totalEmployees: number;
  activeCTCTemplates: number;
  pendingPayrollRuns: number;
  openComplianceItems: number;
}

interface WorkflowData {
  hasComponents: boolean;
  hasStatutory: boolean;
  hasCTCTemplates: boolean;
  hasTaxSlabs: boolean;
  hasPaymentMethods: boolean;
  hasInputs: boolean;
  hasValidations: boolean;
  hasPayrollRuns: boolean;
  hasApprovedRuns: boolean;
  hasPayslips: boolean;
  hasCompliance: boolean;
  hasClosedRuns: boolean;
}

/* ── Payroll Tips ── */
const payrollTips = [
  {
    title: 'Configure Components First',
    description: 'Start by configuring Component Master and Statutory Components before processing payroll',
  },
  {
    title: 'Standardize with CTC Templates',
    description: 'Use CTC Templates to standardize salary structures across your organization',
  },
  {
    title: 'Run Validations Early',
    description: 'Run Pre-Payroll Validations before processing to catch data issues early',
  },
  {
    title: 'Follow the Lifecycle',
    description: 'Payroll runs follow a lifecycle: Open → Input Collection → Processing → Review → Approved → Disbursed → Closed',
  },
  {
    title: 'Verify with Reports',
    description: 'Check the Reports & Dashboard after processing to verify payroll accuracy',
  },
];

/* ── Component ── */
export default function PayrollManagementPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<SummaryStats>({
    totalEmployees: 0,
    activeCTCTemplates: 0,
    pendingPayrollRuns: 0,
    openComplianceItems: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [workflowData, setWorkflowData] = useState<WorkflowData>({
    hasComponents: false,
    hasStatutory: false,
    hasCTCTemplates: false,
    hasTaxSlabs: false,
    hasPaymentMethods: false,
    hasInputs: false,
    hasValidations: false,
    hasPayrollRuns: false,
    hasApprovedRuns: false,
    hasPayslips: false,
    hasCompliance: false,
    hasClosedRuns: false,
  });
  const [workflowExpanded, setWorkflowExpanded] = useState(true);

  /* Safely parse a settled fetch result */
  const safeParse = async (result: PromiseSettledResult<Response>): Promise<Record<string, unknown> | null> => {
    if (result.status !== 'fulfilled' || !result.value.ok) return null;
    try {
      return await result.value.json();
    } catch {
      return null;
    }
  };

  /* Safely extract array length from API response data */
  const safeArrayLen = (data: Record<string, unknown> | null, ...keys: string[]): number => {
    if (!data) return 0;
    for (const key of keys) {
      const arr = data[key];
      if (Array.isArray(arr)) return arr.length;
    }
    return 0;
  };

  /* Fetch summary stats */
  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const headers = getAuthHeaders();

      const results = await Promise.allSettled([
        fetch('/api/employees?limit=1', { headers }),
        fetch('/api/payroll/ctc-templates?limit=1', { headers }),
        fetch('/api/payroll/runs?limit=100', { headers }),
        fetch('/api/payroll/compliance?limit=100', { headers }),
        fetch('/api/payroll/components?limit=1', { headers }),
        fetch('/api/payroll/statutory?limit=1', { headers }),
        fetch('/api/payroll/tax-slabs?limit=1', { headers }),
        fetch('/api/payroll/payment-methods?limit=1', { headers }),
        fetch('/api/payroll/inputs?limit=1', { headers }),
        fetch('/api/payroll/validations?limit=1', { headers }),
        fetch('/api/payroll/payslips?limit=1', { headers }),
      ]);

      const [empRes, ctcRes, runsRes, complianceRes, compRes, statRes, taxRes, payMethodRes, inputsRes, validationsRes, payslipsRes] = results;

      const empData = await safeParse(empRes);
      const ctcData = await safeParse(ctcRes);
      const runsData = await safeParse(runsRes);
      const complianceData = await safeParse(complianceRes);
      const compData = await safeParse(compRes);
      const statData = await safeParse(statRes);
      const taxData = await safeParse(taxRes);
      const payMethodData = await safeParse(payMethodRes);
      const inputsData = await safeParse(inputsRes);
      const validationsData = await safeParse(validationsRes);
      const payslipsData = await safeParse(payslipsRes);

      let totalEmployees = 0;
      let activeCTCTemplates = 0;
      let pendingPayrollRuns = 0;
      let openComplianceItems = 0;

      try {
        if (empData) {
          totalEmployees = (empData.pagination as { total?: number })?.total || (empData.employees as unknown[])?.length || 0;
        }
      } catch { /* ignore parse error */ }

      try {
        if (ctcData) {
          const templates = (ctcData.templates || ctcData.ctcTemplates || []) as Array<{ status?: string }>;
          activeCTCTemplates = templates.filter(t => t.status === 'active').length || templates.length || 0;
        }
      } catch { /* ignore parse error */ }

      const runs = (() => {
        try {
          return ((runsData?.runs || runsData?.payrollRuns || []) as Array<{ status?: string }>) || [];
        } catch { return []; }
      })();
      pendingPayrollRuns = runs.filter(
        (r) => r.status === 'draft' || r.status === 'processing' || r.status === 'pending'
      ).length;

      try {
        if (complianceData) {
          const items = (complianceData.compliance || complianceData.items || []) as Array<{ status?: string }>;
          openComplianceItems = items.filter(
            (c) => c.status === 'pending' || c.status === 'overdue' || c.status === 'open'
          ).length;
        }
      } catch { /* ignore parse error */ }

      setStats({ totalEmployees, activeCTCTemplates, pendingPayrollRuns, openComplianceItems });

      // Workflow data - safely check for data existence
      const hasComponents = safeArrayLen(compData, 'components') > 0;
      const hasStatutory = safeArrayLen(statData, 'components', 'statutory') > 0;
      const hasCTCTemplates = activeCTCTemplates > 0;
      const hasTaxSlabs = safeArrayLen(taxData, 'taxSlabs', 'slabs') > 0;
      const hasPaymentMethods = safeArrayLen(payMethodData, 'paymentMethods', 'methods') > 0;
      const hasInputs = safeArrayLen(inputsData, 'inputs', 'payrollInputs') > 0;
      const hasValidations = safeArrayLen(validationsData, 'validations') > 0;
      const hasPayrollRuns = runs.length > 0;
      const hasApprovedRuns = runs.some((r) => r.status === 'approved' || r.status === 'completed');
      const hasPayslips = safeArrayLen(payslipsData, 'payslips') > 0;
      const hasCompliance = openComplianceItems > 0;
      const hasClosedRuns = runs.some((r) => r.status === 'closed' || r.status === 'disbursed');

      setWorkflowData({
        hasComponents,
        hasStatutory,
        hasCTCTemplates,
        hasTaxSlabs,
        hasPaymentMethods,
        hasInputs,
        hasValidations,
        hasPayrollRuns,
        hasApprovedRuns,
        hasPayslips,
        hasCompliance,
        hasClosedRuns,
      });
    } catch (err) {
      console.error('Payroll summary error:', err);
      // Don't show toast for individual API failures - the page should still render
      // Ensure default state is set so the page renders even on total failure
      setStats({ totalEmployees: 0, activeCTCTemplates: 0, pendingPayrollRuns: 0, openComplianceItems: 0 });
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchStats());
  }, [fetchStats]);

  /* Navigation handler */
  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route);
    },
    [router]
  );

  /* Determine step status: 'complete' | 'current' | 'pending' */
  const getStepStatus = (step: WorkflowStep): 'complete' | 'current' | 'pending' => {
    const isComplete = workflowData[step.statKey as keyof WorkflowData];
    if (isComplete) return 'complete';

    // Find the first incomplete step - that's the "current" one
    const firstIncomplete = workflowSteps.find(s => !workflowData[s.statKey as keyof WorkflowData]);
    if (firstIncomplete && firstIncomplete.step === step.step) return 'current';

    return 'pending';
  };

  const completedCount = workflowSteps.filter(s => workflowData[s.statKey as keyof WorkflowData]).length;

  /* Stats cards configuration */
  const statsCards = [
    {
      label: 'Total Employees',
      value: stats.totalEmployees,
      icon: FiUsers,
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      ring: 'ring-blue-100',
    },
    {
      label: 'Active CTC Templates',
      value: stats.activeCTCTemplates,
      icon: FiLayers,
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      ring: 'ring-emerald-100',
    },
    {
      label: 'Pending Payroll Runs',
      value: stats.pendingPayrollRuns,
      icon: FiClock,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      ring: 'ring-amber-100',
    },
    {
      label: 'Open Compliance Items',
      value: stats.openComplianceItems,
      icon: FiAlertCircle,
      bg: 'bg-rose-50',
      iconColor: 'text-rose-600',
      ring: 'ring-rose-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiDollarSign className="w-6 h-6 text-emerald-500" />
            Payroll Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">
            Configure salary structures, process payroll, and manage compliance
          </p>
        </div>
      </div>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="payroll"
        title="Payroll Tips"
        tips={payrollTips}
        userRole={user?.role}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => {
          const IconComp = card.icon;
          return (
            <div key={card.label} className="nexus-card nexus-card-hover p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-nexus-text-secondary">{card.label}</p>
                  {loadingStats ? (
                    <div className="h-8 w-12 bg-slate-200 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-nexus-text-primary mt-1">{card.value}</p>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center ${card.iconColor} ring-1 ${card.ring}`}>
                  <IconComp className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payroll Processing Workflow Guide */}
      <div className="nexus-card overflow-hidden border border-emerald-100">
        {/* Workflow Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FiInfo className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-nexus-text-primary">How to Process Payroll</h3>
              <p className="text-xs text-nexus-text-secondary mt-0.5">
                Follow this workflow to process payroll for the first time
              </p>
            </div>
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full ml-2">
              {completedCount}/{workflowSteps.length} complete
            </span>
          </div>
          <button
            onClick={() => setWorkflowExpanded(!workflowExpanded)}
            className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/60 transition-colors"
          >
            {workflowExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Info Banner */}
        {workflowExpanded && completedCount < workflowSteps.length && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 flex items-center gap-3">
            <FiInfo className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              <span className="font-medium">Getting started?</span> Follow this step-by-step workflow to set up and process your first payroll. Each step links to the relevant module.
            </p>
          </div>
        )}

        {/* Workflow Steps */}
        {workflowExpanded && (
          <div className="p-5">
            {/* Desktop: Horizontal scrollable */}
            <div className="hidden md:block">
              <div className="flex items-start gap-0 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-slate-50">
                {workflowSteps.map((step, index) => {
                  const status = getStepStatus(step);
                  return (
                    <div key={step.step} className="flex items-start flex-shrink-0">
                      <button
                        onClick={() => handleNavigate(step.route)}
                        className="flex flex-col items-center text-center w-28 group"
                        title={`Step ${step.step}: ${step.title}`}
                      >
                        {/* Step Circle */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 group-hover:scale-110 ${
                            status === 'complete'
                              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
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
                              ? 'text-emerald-600'
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
                      {index < workflowSteps.length - 1 && (
                        <div className="flex items-center pt-3 px-1">
                          <FiArrowRight className={`w-4 h-4 flex-shrink-0 ${
                            status === 'complete' ? 'text-emerald-400' : 'text-slate-200'
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
              {workflowSteps.map((step, index) => {
                const status = getStepStatus(step);
                return (
                  <div key={step.step} className="flex items-start">
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <button
                        onClick={() => handleNavigate(step.route)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                          status === 'complete'
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : status === 'current'
                            ? 'bg-blue-500 text-white shadow-sm ring-2 ring-blue-100'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {status === 'complete' ? <FiCheck className="w-4 h-4" /> : step.step}
                      </button>
                      {index < workflowSteps.length - 1 && (
                        <div className={`w-0.5 h-8 ${
                          status === 'complete' ? 'bg-emerald-300' : 'bg-slate-200'
                        }`} />
                      )}
                    </div>
                    {/* Step content */}
                    <button
                      onClick={() => handleNavigate(step.route)}
                      className="flex-1 ml-3 pb-3 text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-xs font-semibold ${
                            status === 'complete'
                              ? 'text-emerald-600'
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
                <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
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

      {/* Sub-module Tiles */}
      <div>
        <h2 className="text-sm font-semibold text-nexus-text-secondary uppercase tracking-wider mb-4">
          Payroll Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subModules.map((tile) => {
            const IconComp = tile.icon;
            return (
              <button
                key={tile.route}
                onClick={() => handleNavigate(tile.route)}
                className="nexus-card nexus-card-hover p-5 text-left group transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${tile.gradientBg} flex items-center justify-center ${tile.iconColor} ring-1 ${tile.ringColor} flex-shrink-0 transition-transform duration-200 group-hover:scale-110`}
                  >
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-nexus-text-primary group-hover:text-blue-600 transition-colors">
                        {tile.title}
                      </h3>
                      <FiArrowRight className="w-4 h-4 text-nexus-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-nexus-text-muted mt-1 leading-relaxed">
                      {tile.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
