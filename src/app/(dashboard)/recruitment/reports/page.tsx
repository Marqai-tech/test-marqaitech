'use client';

import { useState } from 'react';
import {
  FiUsers, FiClock, FiTarget, FiBarChart2,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── Report Types ── */
const reportTypes = [
  { key: 'hiring', label: 'Hiring Summary', icon: FiUsers, color: 'bg-green-50 text-green-600' },
  { key: 'time-to-hire', label: 'Time to Hire', icon: FiClock, color: 'bg-emerald-50 text-emerald-600' },
  { key: 'source', label: 'Source Analytics', icon: FiTarget, color: 'bg-amber-50 text-amber-600' },
  { key: 'offer', label: 'Offer Acceptance', icon: FiBarChart2, color: 'bg-teal-50 text-teal-600' },
];

/* ── Hiring Summary Data ── */
const hiringData = [
  { department: 'Engineering', open: 8, inProgress: 12, hired: 5 },
  { department: 'Marketing', open: 3, inProgress: 4, hired: 2 },
  { department: 'Sales', open: 5, inProgress: 7, hired: 3 },
  { department: 'HR', open: 1, inProgress: 2, hired: 1 },
  { department: 'Finance', open: 2, inProgress: 3, hired: 1 },
];

export default function RecruitmentReportsPage() {
  useAuthStore();
  const [activeReport, setActiveReport] = useState('hiring');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-50">
          <FiBarChart2 className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Recruitment Reports</h1>
          <p className="text-sm text-thb-text-secondary">Analyze hiring pipeline and recruitment effectiveness</p>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          const isActive = activeReport === rt.key;
          return (
            <button
              key={rt.key}
              onClick={() => setActiveReport(rt.key)}
              className={`thb-card p-4 flex flex-col items-center gap-2 text-center transition-all hover:shadow-md ${isActive ? 'ring-2 ring-green-500 shadow-md' : ''}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rt.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-green-600' : 'text-thb-text-secondary'}`}>{rt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Report Content */}
      {activeReport === 'hiring' && (
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border">
            <h2 className="font-semibold text-thb-text-primary">Hiring Summary</h2>
            <p className="text-xs text-thb-text-muted mt-0.5">Open positions and hiring progress by department</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Department</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Open</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">In Progress</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Hired</th>
                </tr>
              </thead>
              <tbody>
                {hiringData.map((row) => (
                  <tr key={row.department} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-sm text-thb-text-primary font-medium">{row.department}</td>
                    <td className="px-5 py-3 text-sm text-green-600 text-center font-semibold">{row.open}</td>
                    <td className="px-5 py-3 text-sm text-amber-600 text-center font-medium">{row.inProgress}</td>
                    <td className="px-5 py-3 text-sm text-emerald-600 text-center font-medium">{row.hired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'time-to-hire' && (
        <div className="thb-card p-8 text-center">
          <FiClock className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <h3 className="text-thb-text-primary font-semibold mb-1">Time to Hire</h3>
          <p className="text-sm text-thb-text-muted">Average time from requisition to offer acceptance will appear here</p>
        </div>
      )}

      {activeReport === 'source' && (
        <div className="thb-card p-8 text-center">
          <FiTarget className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <h3 className="text-thb-text-primary font-semibold mb-1">Source Analytics</h3>
          <p className="text-sm text-thb-text-muted">Effectiveness of different recruitment sources will appear here</p>
        </div>
      )}

      {activeReport === 'offer' && (
        <div className="thb-card p-8 text-center">
          <FiBarChart2 className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <h3 className="text-thb-text-primary font-semibold mb-1">Offer Acceptance</h3>
          <p className="text-sm text-thb-text-muted">Offer acceptance rates and decline analysis will appear here</p>
        </div>
      )}
    </div>
  );
}
