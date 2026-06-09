'use client';

import { useState } from 'react';
import { FiFileText, FiDownload, FiClock, FiCheckCircle, FiAlertTriangle, FiFilter, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// --- Report Categories ---
interface ReportDefinition {
  code: string;
  name: string;
  description: string;
  category: 'input' | 'standard' | 'normal' | 'statutory';
  format: string[];
  filters: string[];
  country?: string;
}

const INPUT_REPORTS: ReportDefinition[] = [
  { code: 'RPT_AT_SUM', name: 'Attendance Summary Report', description: 'Verify attendance data before payroll run — present days, absent days, leaves, holidays', category: 'input', format: ['PDF', 'Excel'], filters: ['Department', 'Location', 'Period'] },
  { code: 'RPT_MISS_INP', name: 'Missing Inputs Report', description: 'Identify employees with missing or incomplete payroll inputs', category: 'input', format: ['PDF', 'Excel'], filters: ['Input Type', 'Department', 'Period'] },
  { code: 'RPT_INP_VAR', name: 'Input Variance Report', description: 'Compare current period inputs against previous period to detect anomalies', category: 'input', format: ['PDF', 'Excel'], filters: ['Department', 'Variance Threshold', 'Period'] },
  { code: 'RPT_OT_SUM', name: 'Overtime Summary Report', description: 'Review overtime hours and cost before processing', category: 'input', format: ['PDF', 'Excel'], filters: ['Department', 'OT Type', 'Period'] },
  { code: 'RPT_LE_ENC', name: 'Leave Encashment Report', description: 'List of leave encashments to be processed in current period', category: 'input', format: ['PDF', 'Excel'], filters: ['Leave Type', 'Department', 'Period'] },
  { code: 'RPT_INV_DEC', name: 'Investment Declaration Report', description: 'Employee tax-saving declarations for TDS calculation', category: 'input', format: ['PDF', 'Excel'], filters: ['Section', 'Proof Status', 'Period'] },
];

const STANDARD_REPORTS: ReportDefinition[] = [
  { code: 'RPT_PAY_REG', name: 'Payroll Register', description: 'Complete payroll calculation detail for all employees in the period', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Location', 'Cost Center', 'Period', 'Currency'] },
  { code: 'RPT_PAY_SUM', name: 'Payroll Summary Report', description: 'Aggregated payroll cost by component across the organization', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Entity', 'Country', 'Period', 'Currency'] },
  { code: 'RPT_DEPT_PAY', name: 'Department-Wise Payroll', description: 'Payroll cost breakdown by department with headcount', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Entity', 'Location', 'Period'] },
  { code: 'RPT_CC_PAY', name: 'Cost Center Report', description: 'Payroll cost allocation by cost center with dimensional split', category: 'standard', format: ['PDF', 'Excel'], filters: ['Cost Center', 'Entity', 'Period', 'Currency'] },
  { code: 'RPT_BANK_DISB', name: 'Bank Disbursement Report', description: 'Payment file summary for bank upload and reconciliation', category: 'standard', format: ['PDF', 'Excel', 'Bank File'], filters: ['Bank', 'Currency', 'Period'] },
  { code: 'RPT_PAYSLIP', name: 'Payslip Register', description: 'Bulk payslip generation and delivery confirmation', category: 'standard', format: ['PDF (per employee)'], filters: ['Department', 'Period', 'Delivery Status'] },
  { code: 'RPT_CTC_REG', name: 'Salary Register (CTC)', description: 'CTC breakdown for all employees with component-wise split', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Grade', 'Entity', 'Period'] },
  { code: 'RPT_GL_POST', name: 'GL Posting Report', description: 'Journal entries generated from payroll for GL integration', category: 'standard', format: ['PDF', 'Excel', 'CSV'], filters: ['Entity', 'Period', 'GL Range', 'Currency'] },
  { code: 'RPT_CURR_CONV', name: 'Currency Conversion Report', description: 'Details of all cross-currency conversions applied in payroll', category: 'standard', format: ['PDF', 'Excel'], filters: ['Currency Pair', 'Entity', 'Period'] },
  { code: 'RPT_NEW_JOIN', name: 'New Joiner Payroll Report', description: 'Payroll details for employees joining in current period', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Period'] },
  { code: 'RPT_FINAL_SET', name: 'Exit/Final Settlement Report', description: 'Full and final settlement calculations for separated employees', category: 'standard', format: ['PDF', 'Excel'], filters: ['Department', 'Separation Type', 'Period'] },
];

const NORMAL_REPORTS: ReportDefinition[] = [
  { code: 'RPT_MOM_TREND', name: 'Month-over-Month Payroll Trend', description: 'Track payroll cost trends across months — headcount, gross, net, statutory, MoM variance', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Entity', 'Year', 'Currency'] },
  { code: 'RPT_SAL_DIST', name: 'Salary Structure Distribution', description: 'Analyze salary distribution across bands/grades', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Grade', 'Entity'] },
  { code: 'RPT_COMP_COST', name: 'Component-wise Cost Analysis', description: 'Detailed breakdown of payroll cost by component over time', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Component Type', 'Period Range'] },
  { code: 'RPT_EMP_HIST', name: 'Employee Pay History', description: 'Historical payroll details for individual employees', category: 'normal', format: ['PDF', 'Excel'], filters: ['Employee', 'Period Range'] },
  { code: 'RPT_HC_COST', name: 'Headcount Cost Report', description: 'Average cost per employee by dimension', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Location', 'Period', 'Currency'] },
  { code: 'RPT_PRORATE', name: 'Proration Report', description: 'Details of mid-period joins, exits, and salary changes', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Period'] },
  { code: 'RPT_LOAN_ADV', name: 'Loan and Advance Report', description: 'Outstanding loan balances and EMI tracking', category: 'normal', format: ['PDF', 'Excel'], filters: ['Loan Type', 'Department', 'Status'] },
  { code: 'RPT_OT_ANALYSIS', name: 'Overtime Cost Analysis', description: 'Overtime cost trends and patterns by department', category: 'normal', format: ['PDF', 'Excel'], filters: ['Department', 'Period Range'] },
];

const STATUTORY_REPORTS: ReportDefinition[] = [
  { code: 'IND_PF_ECR', name: 'PF ECR (Electronic Challan cum Return)', description: 'Monthly PF return in ECR format for EPFO', category: 'statutory', format: ['CSV (ECR format)'], filters: ['Period'], country: 'India' },
  { code: 'IND_ESI_RET', name: 'ESI Half-Yearly Return', description: 'Half-yearly ESI return for ESIC', category: 'statutory', format: ['Online portal'], filters: ['Period'], country: 'India' },
  { code: 'IND_TDS_24Q', name: 'TDS Return (Form 24Q)', description: 'Quarterly TDS return in NSDL format', category: 'statutory', format: ['TXT (NSDL format)'], filters: ['Quarter'], country: 'India' },
  { code: 'IND_FORM16', name: 'Form 16 (TDS Certificate)', description: 'Annual TDS certificate for employees', category: 'statutory', format: ['PDF (prescribed format)'], filters: ['Year'], country: 'India' },
  { code: 'IND_PTAX_RET', name: 'Professional Tax Return', description: 'Monthly/annual professional tax return', category: 'statutory', format: ['State-specific format'], filters: ['Period', 'State'], country: 'India' },
  { code: 'US_W2', name: 'W-2 Wage Statement', description: 'Annual wage statement for IRS/SSA', category: 'statutory', format: ['EFW2 (SSA format)'], filters: ['Year'], country: 'United States' },
  { code: 'US_941', name: '941 Quarterly Return', description: 'Quarterly federal tax return for IRS', category: 'statutory', format: ['IRS e-file'], filters: ['Quarter'], country: 'United States' },
  { code: 'US_1095C', name: '1095-C (ACA Reporting)', description: 'Annual ACA reporting form', category: 'statutory', format: ['AIR format'], filters: ['Year'], country: 'United States' },
  { code: 'UK_P60', name: 'P60 (End of Year Certificate)', description: 'Annual end-of-year certificate for HMRC', category: 'statutory', format: ['PDF (prescribed)'], filters: ['Year'], country: 'United Kingdom' },
  { code: 'UK_P11D', name: 'P11D (Benefits in Kind)', description: 'Annual benefits in kind report for HMRC', category: 'statutory', format: ['Online / PDF'], filters: ['Year'], country: 'United Kingdom' },
  { code: 'UK_FPS', name: 'FPS (Full Payment Submission)', description: 'Per-pay-period RTI submission to HMRC', category: 'statutory', format: ['RTI XML'], filters: ['Period'], country: 'United Kingdom' },
  { code: 'SG_IR8A', name: 'IR8A (Tax Return)', description: 'Annual income tax return for IRAS', category: 'statutory', format: ['AIS (Auto-Inclusion Scheme)'], filters: ['Year'], country: 'Singapore' },
  { code: 'SG_CPF_RET', name: 'CPF Contribution Report', description: 'Monthly CPF contribution report', category: 'statutory', format: ['CPF EZPay format'], filters: ['Period'], country: 'Singapore' },
  { code: 'SG_SDL_FWL', name: 'SDL/FWL Return', description: 'Monthly SkillsFuture Levy and Foreign Worker Levy return', category: 'statutory', format: ['CPF EZPay / MOM format'], filters: ['Period'], country: 'Singapore' },
];

type ReportCategory = 'input' | 'standard' | 'normal' | 'statutory';

function getCategoryBadge(category: ReportCategory) {
  const map: Record<ReportCategory, { badge: string; label: string }> = {
    input: { badge: 'nexus-badge nexus-badge-info', label: 'Input' },
    standard: { badge: 'nexus-badge nexus-badge-success', label: 'Standard' },
    normal: { badge: 'nexus-badge nexus-badge-warning', label: 'Normal' },
    statutory: { badge: 'nexus-badge nexus-badge-error', label: 'Statutory' },
  };
  return map[category];
}

export default function PayrollReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);

  const allReports = [...INPUT_REPORTS, ...STANDARD_REPORTS, ...NORMAL_REPORTS, ...STATUTORY_REPORTS];

  const filteredReports = allReports.filter(r => {
    if (activeTab !== 'all' && r.category !== activeTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    }
    return true;
  });

  const handleGenerate = async (report: ReportDefinition) => {
    setGenerating(report.code);
    try {
      // In a full implementation, this would call /api/payroll/reports/generate
      // For now, show a toast indicating the report generation request
      toast.success(`Generating ${report.name}... This will be available for download shortly.`);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setTimeout(() => setGenerating(null), 2000);
    }
  };

  const tabs: { key: ReportCategory | 'all'; label: string; count: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'all', label: 'All Reports', count: allReports.length, icon: FiFileText },
    { key: 'input', label: 'Input Reports', count: INPUT_REPORTS.length, icon: FiFilter },
    { key: 'standard', label: 'Standard Reports', count: STANDARD_REPORTS.length, icon: FiCheckCircle },
    { key: 'normal', label: 'Normal Reports', count: NORMAL_REPORTS.length, icon: FiClock },
    { key: 'statutory', label: 'Statutory Reports', count: STATUTORY_REPORTS.length, icon: FiAlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiFileText className="w-6 h-6 text-slate-500" />
            Payroll Reports
          </h1>
          <p className="text-nexus-text-secondary mt-1">Generate payroll, statutory, and compliance reports across all categories</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {tabs.slice(1).map(tab => {
          const IconComp = tab.icon;
          return (
            <div key={tab.key} className="nexus-card nexus-card-hover p-4 cursor-pointer" onClick={() => setActiveTab(tab.key)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center"><IconComp className="w-5 h-5 text-slate-500" /></div>
                <div>
                  <p className="text-xs font-medium text-nexus-text-secondary">{tab.label}</p>
                  <p className="text-xl font-bold text-nexus-text-primary">{tab.count}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-blue-600 shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="nexus-card p-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input
            type="text"
            placeholder="Search reports by name, code, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <div className="nexus-card p-12 text-center">
          <FiFileText className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
          <p className="text-nexus-text-secondary font-medium">No reports found</p>
          <p className="text-sm text-nexus-text-muted mt-1">Try adjusting your search or filter criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map(report => {
            const catInfo = getCategoryBadge(report.category);
            return (
              <div key={report.code} className="nexus-card nexus-card-hover p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-nexus-text-primary truncate">{report.name}</h3>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={catInfo.badge}>{catInfo.label}</span>
                      {report.country && <span className="nexus-badge nexus-badge-purple">{report.country}</span>}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-nexus-text-muted mb-3 leading-relaxed flex-1">{report.description}</p>
                <div className="mb-3">
                  <p className="text-xs font-medium text-nexus-text-secondary mb-1">Available Formats</p>
                  <div className="flex flex-wrap gap-1">
                    {report.format.map(f => (
                      <span key={f} className="px-2 py-0.5 bg-slate-100 rounded text-xs text-nexus-text-secondary">{f}</span>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-xs font-medium text-nexus-text-secondary mb-1">Filters</p>
                  <div className="flex flex-wrap gap-1">
                    {report.filters.map(f => (
                      <span key={f} className="px-2 py-0.5 border border-nexus-border rounded text-xs text-nexus-text-muted">{f}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleGenerate(report)}
                  disabled={generating === report.code}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"
                >
                  <FiDownload className="w-4 h-4" />
                  {generating === report.code ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
