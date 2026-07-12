'use client';

import { useState } from 'react';
import {
  FiUserPlus, FiBarChart2,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── Report Types ── */
const reportTypes = [
  { key: 'summary', label: 'Preboarding Summary', icon: FiUserPlus, color: 'bg-blue-50 text-blue-600' },
  { key: 'documents', label: 'Document Status', icon: FiBarChart2, color: 'bg-emerald-50 text-emerald-600' },
  { key: 'pipeline', label: 'Joining Pipeline', icon: FiUserPlus, color: 'bg-amber-50 text-amber-600' },
];

export default function PreboardingReportsPage() {
  useAuthStore();
  const [activeReport, setActiveReport] = useState('summary');

  const activeLabel = reportTypes.find(r => r.key === activeReport)?.label || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50">
          <FiBarChart2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Preboarding Reports</h1>
          <p className="text-sm text-thb-text-secondary">Track pre-joining progress and document readiness</p>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          const isActive = activeReport === rt.key;
          return (
            <button
              key={rt.key}
              onClick={() => setActiveReport(rt.key)}
              className={`thb-card p-4 flex flex-col items-center gap-2 text-center transition-all hover:shadow-md ${isActive ? 'ring-2 ring-blue-500 shadow-md' : ''}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rt.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : 'text-thb-text-secondary'}`}>{rt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Placeholder */}
      <div className="thb-card p-8 text-center">
        <FiUserPlus className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
        <h3 className="text-thb-text-primary font-semibold mb-1">{activeLabel}</h3>
        <p className="text-sm text-thb-text-muted">Report data and visualizations for {activeLabel.toLowerCase()} will appear here</p>
      </div>
    </div>
  );
}
