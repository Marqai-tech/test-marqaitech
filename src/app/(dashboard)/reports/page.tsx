'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiDownload, FiUsers, FiCalendar, FiClock,
  FiDollarSign, FiBriefcase,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

type ReportType = 'employee_report' | 'leave_report' | 'attendance_report' | 'payroll_report' | 'recruitment_report';

const reportLabels: Record<ReportType, string> = {
  employee_report: 'Employee Report',
  leave_report: 'Leave Report',
  attendance_report: 'Attendance Report',
  payroll_report: 'Payroll Report',
  recruitment_report: 'Recruitment Report',
};

const reportIcons: Record<ReportType, React.ReactNode> = {
  employee_report: <FiUsers className="w-5 h-5" />,
  leave_report: <FiCalendar className="w-5 h-5" />,
  attendance_report: <FiClock className="w-5 h-5" />,
  payroll_report: <FiDollarSign className="w-5 h-5" />,
  recruitment_report: <FiBriefcase className="w-5 h-5" />,
};

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('employee_report');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics', { headers: getAuthHeaders() });
      if (res.ok) setAnalytics(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reports?type=${reportType}`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
      else toast.error('Failed to load report');
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [reportType]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const renderEmployeeReport = () => {
    const d = data as Record<string, unknown>;
    if (!d) return null;
    const deptDist = (d.departmentDistribution || {}) as Record<string, number>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Headcount</p><p className="text-2xl font-bold text-slate-900 mt-1">{(d.headcount as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">New Hires (30d)</p><p className="text-2xl font-bold text-emerald-600 mt-1">{(d.newHires as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Attrition</p><p className="text-2xl font-bold text-red-600 mt-1">{(d.attrition as number) || 0}</p></div>
        </div>
        {Object.keys(deptDist).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Department Distribution</h3>
            <div className="space-y-3">
              {Object.entries(deptDist).map(([name, count]) => {
                const max = Math.max(...Object.values(deptDist), 1);
                return (
                  <div key={name}>
                    <div className="flex justify-between mb-1"><span className="text-sm text-slate-700">{name}</span><span className="text-sm font-medium text-slate-900">{count as number}</span></div>
                    <div className="w-full h-6 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${((count as number) / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLeaveReport = () => {
    const d = data as Record<string, unknown>;
    if (!d) return null;
    const byType = (d.byType || {}) as Record<string, number>;
    const byStatus = (d.byStatus || {}) as Record<string, number>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total Requests</p><p className="text-2xl font-bold text-slate-900 mt-1">{(d.total as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">By Type</p><div className="mt-2 space-y-1">{Object.entries(byType).map(([k, v]) => (<p key={k} className="text-xs text-slate-600">{k}: <span className="font-medium">{v as number}</span></p>))}</div></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">By Status</p><div className="mt-2 space-y-1">{Object.entries(byStatus).map(([k, v]) => (<p key={k} className="text-xs text-slate-600">{k}: <span className="font-medium">{v as number}</span></p>))}</div></div>
        </div>
        {Object.keys(byType).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Leave Usage by Type</h3>
            <div className="space-y-3">{Object.entries(byType).map(([name, count]) => { const max = Math.max(...Object.values(byType), 1); return (<div key={name}><div className="flex justify-between mb-1"><span className="text-sm text-slate-700">{name}</span><span className="text-sm font-medium">{count as number}</span></div><div className="w-full h-5 bg-slate-100 rounded-full"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${((count as number) / max) * 100}%` }} /></div></div>); })}</div>
          </div>
        )}
      </div>
    );
  };

  const renderAttendanceReport = () => {
    const d = data as Record<string, unknown>;
    if (!d) return null;
    const byStatus = (d.byStatus || {}) as Record<string, number>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Attendance Rate</p><p className="text-2xl font-bold text-emerald-600 mt-1">{(d.attendanceRate as number) || 0}%</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Late Arrivals</p><p className="text-2xl font-bold text-amber-600 mt-1">{(d.lateArrivals as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total Overtime (h)</p><p className="text-2xl font-bold text-blue-600 mt-1">{((d.totalOvertime as number) || 0).toFixed(1)}</p></div>
        </div>
        {Object.keys(byStatus).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Attendance by Status</h3>
            <div className="space-y-3">{Object.entries(byStatus).map(([name, count]) => { const max = Math.max(...Object.values(byStatus), 1); return (<div key={name}><div className="flex justify-between mb-1"><span className="text-sm text-slate-700 capitalize">{name.replace('_', ' ')}</span><span className="text-sm font-medium">{count as number}</span></div><div className="w-full h-5 bg-slate-100 rounded-full"><div className="h-full bg-cyan-500 rounded-full" style={{ width: `${((count as number) / max) * 100}%` }} /></div></div>); })}</div>
          </div>
        )}
      </div>
    );
  };

  const renderPayrollReport = () => {
    const d = data as Record<string, unknown>;
    if (!d) return null;
    const deptCosts = (d.departmentCosts || {}) as Record<string, number>;
    const monthOverMonth = (d.monthOverMonth || {}) as Record<string, { gross: number; net: number; deductions: number }>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total Gross</p><p className="text-2xl font-bold text-slate-900 mt-1">${((d.totalGross as number) || 0).toLocaleString()}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total Net</p><p className="text-2xl font-bold text-emerald-600 mt-1">${((d.totalNet as number) || 0).toLocaleString()}</p></div>
        </div>
        {Object.keys(deptCosts).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Salary Costs by Department</h3>
            <div className="space-y-3">{Object.entries(deptCosts).map(([name, cost]) => { const max = Math.max(...Object.values(deptCosts), 1); return (<div key={name}><div className="flex justify-between mb-1"><span className="text-sm text-slate-700">{name}</span><span className="text-sm font-medium">${(cost as number).toLocaleString()}</span></div><div className="w-full h-5 bg-slate-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((cost as number) / max) * 100}%` }} /></div></div>); })}</div>
          </div>
        )}
        {Object.keys(monthOverMonth).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Month-over-Month</h3>
            <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-slate-200">{['Month', 'Gross', 'Net', 'Deductions'].map((h) => (<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>))}</tr></thead><tbody>{Object.entries(monthOverMonth).sort().map(([month, vals]) => (<tr key={month} className="border-b border-slate-100"><td className="px-3 py-2 text-sm font-medium text-slate-700">{month}</td><td className="px-3 py-2 text-sm text-slate-600">${vals.gross.toLocaleString()}</td><td className="px-3 py-2 text-sm text-emerald-600 font-medium">${vals.net.toLocaleString()}</td><td className="px-3 py-2 text-sm text-red-600">${vals.deductions.toLocaleString()}</td></tr>))}</tbody></table></div>
          </div>
        )}
      </div>
    );
  };

  const renderRecruitmentReport = () => {
    const d = data as Record<string, unknown>;
    if (!d) return null;
    const bySource = (d.sourceEffectiveness || {}) as Record<string, number>;
    const byStatus = (d.byStatus || {}) as Record<string, number>;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Open Positions</p><p className="text-2xl font-bold text-blue-600 mt-1">{(d.openPositions as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total Applications</p><p className="text-2xl font-bold text-slate-900 mt-1">{(d.totalApplications as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Time to Fill</p><p className="text-2xl font-bold text-slate-900 mt-1">{(d.timeToFill as string) || 'N/A'}</p></div>
        </div>
        {Object.keys(bySource).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Source Effectiveness</h3>
            <div className="space-y-3">{Object.entries(bySource).map(([name, count]) => { const max = Math.max(...Object.values(bySource), 1); return (<div key={name}><div className="flex justify-between mb-1"><span className="text-sm text-slate-700 capitalize">{name}</span><span className="text-sm font-medium">{count as number}</span></div><div className="w-full h-5 bg-slate-100 rounded-full"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${((count as number) / max) * 100}%` }} /></div></div>); })}</div>
          </div>
        )}
        {Object.keys(byStatus).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Recruitment Funnel</h3>
            <div className="space-y-2">{Object.entries(byStatus).map(([status, count]) => { const max = Math.max(...Object.values(byStatus), 1); return (<div key={status} className="flex items-center gap-3"><span className="text-xs text-slate-600 w-24 capitalize">{status.replace('_', ' ')}</span><div className="flex-1 h-6 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${((count as number) / max) * 100}%` }} /></div><span className="text-xs font-medium text-slate-700 w-8">{count as number}</span></div>); })}</div>
          </div>
        )}
      </div>
    );
  };

  const renderReport = () => {
    if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />))}</div>;
    switch (reportType) {
      case 'employee_report': return renderEmployeeReport();
      case 'leave_report': return renderLeaveReport();
      case 'attendance_report': return renderAttendanceReport();
      case 'payroll_report': return renderPayrollReport();
      case 'recruitment_report': return renderRecruitmentReport();
      default: return null;
    }
  };

  const analyticsData = analytics as Record<string, Record<string, unknown>> | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1><p className="text-slate-500 mt-1">Comprehensive HR data insights</p></div>
        <button onClick={() => toast.success('Report export will be available soon')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium text-sm text-slate-700"><FiDownload className="w-4 h-4" /> Export</button>
      </div>

      {analyticsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-1"><FiUsers className="w-4 h-4 text-blue-500" /><span className="text-xs text-slate-500">Employees</span></div><p className="text-xl font-bold text-slate-900">{(analyticsData.employees?.total as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-1"><FiCalendar className="w-4 h-4 text-amber-500" /><span className="text-xs text-slate-500">Pending Leaves</span></div><p className="text-xl font-bold text-slate-900">{(analyticsData.leave?.pending as number) || 0}</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-1"><FiClock className="w-4 h-4 text-cyan-500" /><span className="text-xs text-slate-500">Attendance</span></div><p className="text-xl font-bold text-slate-900">{(analyticsData.attendance?.rate as number) || 0}%</p></div>
          <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-1"><FiBriefcase className="w-4 h-4 text-purple-500" /><span className="text-xs text-slate-500">Open Positions</span></div><p className="text-xl font-bold text-slate-900">{(analyticsData.recruitment?.openPositions as number) || 0}</p></div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(reportLabels) as ReportType[]).map((type) => (
          <button key={type} onClick={() => setReportType(type)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportType === type ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            {reportIcons[type]} {reportLabels[type]}
          </button>
        ))}
      </div>

      {renderReport()}
    </div>
  );
}
