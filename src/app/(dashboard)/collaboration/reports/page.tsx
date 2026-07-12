'use client';

import { useState } from 'react';
import { FiDownload, FiMessageCircle, FiVideo, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';

type ReportType = 'chat-activity' | 'call-analytics' | 'productivity';

const reports: { key: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'chat-activity', label: 'Chat Activity', icon: <FiMessageCircle className="w-5 h-5" />, desc: 'Messaging activity overview' },
  { key: 'call-analytics', label: 'Call Analytics', icon: <FiVideo className="w-5 h-5" />, desc: 'Video/audio call metrics' },
  { key: 'productivity', label: 'Productivity', icon: <FiBarChart2 className="w-5 h-5" />, desc: 'Collaboration productivity' },
];

const placeholderContent: Record<ReportType, { icon: React.ReactNode; title: string; desc: string }> = {
  'chat-activity': { icon: <FiMessageCircle className="w-12 h-12 text-slate-300" />, title: 'Chat Activity', desc: 'This report will show messaging activity patterns, channel usage, and engagement metrics.' },
  'call-analytics': { icon: <FiVideo className="w-12 h-12 text-slate-300" />, title: 'Call Analytics', desc: 'This report will show video/audio call metrics, duration trends, and participant analytics.' },
  'productivity': { icon: <FiBarChart2 className="w-12 h-12 text-slate-300" />, title: 'Productivity', desc: 'This report will show collaboration productivity scores and trends.' },
};

export default function CollaborationReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('chat-activity');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Collaboration Reports</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Generate and export collaboration analytics</p>
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
