'use client';

import Link from 'next/link';
import { FiBarChart2, FiClock, FiAlertTriangle, FiArrowRight } from 'react-icons/fi';

export default function LeaveReportsPage() {
  const reports = [
    {
      href: '/leave/reports/overview',
      title: 'Leave Overview',
      desc: 'Year-to-date leave utilization, monthly trends, type distribution, top leave takers',
      icon: <FiBarChart2 className="w-6 h-6" />,
      color: 'blue',
      kpis: ['Days taken', 'Avg / employee', 'Pending approvals', 'LOP days'],
    },
    {
      href: '/leave/reports/balance',
      title: 'Leave Balance',
      desc: 'Employee-wise leave balances across all leave types with negative balance alerts',
      icon: <FiClock className="w-6 h-6" />,
      color: 'emerald',
      kpis: ['Total balance', 'Avg / employee', 'Leave types tracked', 'Negative balance count'],
    },
    {
      href: '/leave/reports/lop',
      title: 'LOP Report',
      desc: 'Loss of Pay days, salary deductions, sync status to payroll',
      icon: <FiAlertTriangle className="w-6 h-6" />,
      color: 'rose',
      kpis: ['LOP employees', 'Total LOP days', 'Salary deduction', 'Payroll sync status'],
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Leave Reports</h1>
        <p className="text-sm text-slate-500">Choose a report to view detailed leave analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reports.map(r => (
          <Link key={r.href} href={r.href} className="group bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-${r.color}-50 text-${r.color}-600`}>
              {r.icon}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{r.title}</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">{r.desc}</p>
            <div className="space-y-1.5 mb-4">
              {r.kpis.map(k => (
                <div key={k} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  {k}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm font-bold text-slate-700 group-hover:text-slate-900">
              View report <FiArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
