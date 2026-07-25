'use client';

import { useState } from 'react';
import { FiDownload, FiHelpCircle, FiClock, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';

type ReportType = 'ticket-summary' | 'sla-compliance' | 'agent-performance' | 'csat-scores';

const reports: { key: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'ticket-summary', label: 'Ticket Summary', icon: <FiHelpCircle className="w-5 h-5" />, desc: 'Ticket status overview' },
  { key: 'sla-compliance', label: 'SLA Compliance', icon: <FiClock className="w-5 h-5" />, desc: 'SLA adherence metrics' },
  { key: 'agent-performance', label: 'Agent Performance', icon: <FiBarChart2 className="w-5 h-5" />, desc: 'Agent productivity metrics' },
  { key: 'csat-scores', label: 'CSAT Scores', icon: <FiBarChart2 className="w-5 h-5" />, desc: 'Customer satisfaction scores' },
];

const ticketData = [
  { category: 'Hardware', open: 12, inProgress: 8, resolved: 45 },
  { category: 'Software', open: 18, inProgress: 14, resolved: 62 },
  { category: 'Network', open: 7, inProgress: 5, resolved: 28 },
  { category: 'Access/Permissions', open: 22, inProgress: 10, resolved: 55 },
  { category: 'Email/Communication', open: 5, inProgress: 3, resolved: 30 },
  { category: 'Other', open: 9, inProgress: 6, resolved: 20 },
];

export default function HelpdeskReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('ticket-summary');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Helpdesk Reports</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Generate and export helpdesk analytics</p>
        </div>
        <button
          onClick={() => toast.success('Report exported successfully')}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
        >
          <FiDownload className="w-4 h-4" /> Export Report
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {reports.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            className={`thb-card p-4 text-left hover:shadow-md transition-all ${activeReport === r.key ? 'ring-2 ring-green-500 shadow-md' : ''}`}
          >
            <div className={`p-2 rounded-lg inline-flex ${activeReport === r.key ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'} mb-2`}>{r.icon}</div>
            <p className="text-sm font-semibold text-thb-text-primary">{r.label}</p>
            <p className="text-xs text-thb-text-muted mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>

      {activeReport === 'ticket-summary' && (
        <div className="thb-card overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-lg font-bold text-thb-text-primary">Ticket Summary</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Category</th>
                <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Open</th>
                <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">In Progress</th>
                <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {ticketData.map(t => (
                <tr key={t.category} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2.5 px-4 font-medium text-thb-text-primary">{t.category}</td>
                  <td className="py-2.5 px-4 text-right text-red-500 font-medium">{t.open}</td>
                  <td className="py-2.5 px-4 text-right text-amber-600 font-medium">{t.inProgress}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{t.resolved}</td>
                </tr>
              ))}
              <tr className="bg-green-50 font-bold">
                <td className="py-3 px-4 text-green-700">Total</td>
                <td className="py-3 px-4 text-right text-green-700">{ticketData.reduce((s, t) => s + t.open, 0)}</td>
                <td className="py-3 px-4 text-right text-green-700">{ticketData.reduce((s, t) => s + t.inProgress, 0)}</td>
                <td className="py-3 px-4 text-right text-green-700">{ticketData.reduce((s, t) => s + t.resolved, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {activeReport === 'sla-compliance' && (
        <div className="thb-card p-8 text-center">
          <FiClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-thb-text-primary">SLA Compliance</h3>
          <p className="text-sm text-thb-text-muted mt-2">This report will show SLA adherence metrics and breach analysis.</p>
        </div>
      )}

      {activeReport === 'agent-performance' && (
        <div className="thb-card p-8 text-center">
          <FiBarChart2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-thb-text-primary">Agent Performance</h3>
          <p className="text-sm text-thb-text-muted mt-2">This report will show agent productivity metrics and performance rankings.</p>
        </div>
      )}

      {activeReport === 'csat-scores' && (
        <div className="thb-card p-8 text-center">
          <FiBarChart2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-thb-text-primary">CSAT Scores</h3>
          <p className="text-sm text-thb-text-muted mt-2">This report will show customer satisfaction scores and feedback trends.</p>
        </div>
      )}
    </div>
  );
}
