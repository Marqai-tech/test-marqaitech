'use client';

import { useState } from 'react';
import { FiDownload, FiShield, FiBarChart2, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';

type ReportType = 'compliance-audit' | 'workflow-analytics' | 'policy-adherence';

const reports: { key: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'compliance-audit', label: 'Compliance Audit', icon: <FiShield className="w-5 h-5" />, desc: 'Audit trail and compliance' },
  { key: 'workflow-analytics', label: 'Workflow Analytics', icon: <FiBarChart2 className="w-5 h-5" />, desc: 'Workflow performance metrics' },
  { key: 'policy-adherence', label: 'Policy Adherence', icon: <FiFileText className="w-5 h-5" />, desc: 'Policy compliance tracking' },
];

const placeholderContent: Record<ReportType, { icon: React.ReactNode; title: string; desc: string }> = {
  'compliance-audit': { icon: <FiShield className="w-12 h-12 text-slate-300" />, title: 'Compliance Audit', desc: 'This report will show audit trail, compliance checks, and regulatory status.' },
  'workflow-analytics': { icon: <FiBarChart2 className="w-12 h-12 text-slate-300" />, title: 'Workflow Analytics', desc: 'This report will show workflow performance metrics, bottlenecks, and optimization insights.' },
  'policy-adherence': { icon: <FiFileText className="w-12 h-12 text-slate-300" />, title: 'Policy Adherence', desc: 'This report will show policy compliance tracking and adherence rates.' },
};

export default function GovernanceReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('compliance-audit');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Governance Reports</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Generate and export governance analytics</p>
        </div>
        <button
          onClick={() => toast.success('Report exported successfully')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium"
        >
          <FiDownload className="w-4 h-4" /> Export Report
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {reports.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            className={`thb-card p-4 text-left hover:shadow-md transition-all ${activeReport === r.key ? 'ring-2 ring-blue-500 shadow-md' : ''}`}
          >
            <div className={`p-2 rounded-lg inline-flex ${activeReport === r.key ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'} mb-2`}>{r.icon}</div>
            <p className="text-sm font-semibold text-thb-text-primary">{r.label}</p>
            <p className="text-xs text-thb-text-muted mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>

      <div className="thb-card p-8 text-center">
        <div className="flex justify-center mb-3">{placeholderContent[activeReport].icon}</div>
        <h3 className="text-lg font-semibold text-thb-text-primary">{placeholderContent[activeReport].title}</h3>
        <p className="text-sm text-thb-text-muted mt-2">{placeholderContent[activeReport].desc}</p>
      </div>
    </div>
  );
}
