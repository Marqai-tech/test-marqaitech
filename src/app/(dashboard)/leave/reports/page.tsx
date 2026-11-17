'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiDownload, FiCalendar, FiBarChart2, FiClock, FiRefreshCw, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LeaveReportsPage() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedCompanyId = useCompanyContextStore(s => s.selectedCompanyId);
  const [activeTab, setActiveTab] = useState<'summary' | 'department' | 'absenteeism'>('summary');
  const [leaveData, setLeaveData] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaveData = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      // Fetch both balances (for allocated/used) and pending leave requests
      // (for the Pending column). Previously the page read `b.allocated` and
      // `b.pending` from the balance API — but the balance API returns
      // `b.total` (not `allocated`) and has no `pending` field at all, so
      // both columns were always 0.
      const [balRes, leaveRes] = await Promise.all([
        fetch(`/api/leave/balance?${sq || ''}&limit=500`, { headers: getAuthHeaders() }),
        fetch(`/api/leave?status=pending&limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (balRes.ok) {
        const data = await balRes.json();
        setLeaveData(data.balances || data.data || []);
      } else {
        setLeaveData([]);
      }
      if (leaveRes?.ok) {
        const leaveJson = await leaveRes.json();
        setPendingLeaves(leaveJson.leaveRequests || []);
      } else {
        setPendingLeaves([]);
      }
    } catch {
      setLeaveData([]);
      setPendingLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchLeaveData(); }, [fetchLeaveData]);

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const sq = scopeQuery();
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'leave', format, companyId: selectedCompanyId }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leave-report.${format === 'excel' ? 'xlsx' : format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Failed to export report');
    }
  };

  // Calculate summary from real data.
  // BUG FIX: the balance API returns `total` (not `allocated`) and has no
  // `pending` field. We now read `b.total` for allocated, `b.used` for used,
  // and compute pending by counting pending LeaveRequest rows per leave type.
  const pendingByLeaveType = new Map<string, number>();
  pendingLeaves.forEach((lr: any) => {
    const ltName = lr.leaveType?.name || 'Unknown';
    pendingByLeaveType.set(ltName, (pendingByLeaveType.get(ltName) || 0) + 1);
  });

  const leaveTypeMap = new Map<string, { allocated: number; used: number; pending: number }>();
  leaveData.forEach((b: any) => {
    const typeName = b.leaveType?.name || b.leaveTypeName || 'Unknown';
    const allocated = b.total ?? b.allocated ?? b.totalDays ?? 0;  // FIXED: read `total`
    const used = b.used ?? b.usedDays ?? 0;
    const pending = 0; // pending is computed from pendingLeaves below
    const existing = leaveTypeMap.get(typeName) || { allocated: 0, used: 0, pending: 0 };
    existing.allocated += allocated;
    existing.used += used;
    leaveTypeMap.set(typeName, existing);
  });
  // Merge pending counts from pending leave requests (for leave types that
  // may have no balance rows yet, e.g. new employees)
  pendingByLeaveType.forEach((count, typeName) => {
    const existing = leaveTypeMap.get(typeName) || { allocated: 0, used: 0, pending: 0 };
    existing.pending += count;
    leaveTypeMap.set(typeName, existing);
  });

  const summaryData = Array.from(leaveTypeMap.entries()).map(([type, vals]) => ({
    leaveType: type,
    allocated: vals.allocated,
    used: vals.used,
    pending: vals.pending,
    available: vals.allocated - vals.used - vals.pending,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiFileText className="w-6 h-6 text-teal-500" />
            Leave Reports
          </h1>
          <p className="text-sm text-thb-text-secondary mt-1">Real-time leave balance and usage analytics</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => handleExport('csv')} className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">CSV</button>
          <button onClick={() => handleExport('excel')} className="px-3 py-2 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100">Excel</button>
          <button onClick={() => handleExport('pdf')} className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">PDF</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'summary' as const, label: 'Leave Summary', icon: <FiBarChart2 className="w-4 h-4" /> },
          { key: 'department' as const, label: 'Department-wise', icon: <FiCalendar className="w-4 h-4" /> },
          { key: 'absenteeism' as const, label: 'Absenteeism', icon: <FiClock className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report Content */}
      <div className="thb-card p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <FiRefreshCw className="w-6 h-6 text-teal-500 animate-spin" />
            <span className="ml-2 text-sm text-thb-text-secondary">Loading leave data...</span>
          </div>
        ) : summaryData.length === 0 ? (
          <div className="text-center py-12">
            <FiCalendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No leave data available</p>
            <p className="text-xs text-slate-400 mt-1">Leave balance data will appear here when employees have leave allocations</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === 'summary' && (
              <>
                <h2 className="text-lg font-semibold text-thb-text-primary">Leave Balance Summary</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-slate-600">Leave Type</th>
                        <th className="text-center px-4 py-2 font-semibold text-slate-600">Allocated</th>
                        <th className="text-center px-4 py-2 font-semibold text-slate-600">Used</th>
                        <th className="text-center px-4 py-2 font-semibold text-slate-600">Pending</th>
                        <th className="text-center px-4 py-2 font-semibold text-slate-600">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaryData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700">{row.leaveType}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{row.allocated}</td>
                          <td className="px-4 py-2 text-center text-amber-600">{row.used}</td>
                          <td className="px-4 py-2 text-center text-blue-600">{row.pending}</td>
                          <td className="px-4 py-2 text-center text-emerald-600 font-medium">{row.available}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td className="px-4 py-2 font-bold text-slate-700">Total</td>
                        <td className="px-4 py-2 text-center font-bold text-slate-700">{summaryData.reduce((s, r) => s + r.allocated, 0)}</td>
                        <td className="px-4 py-2 text-center font-bold text-amber-700">{summaryData.reduce((s, r) => s + r.used, 0)}</td>
                        <td className="px-4 py-2 text-center font-bold text-blue-700">{summaryData.reduce((s, r) => s + r.pending, 0)}</td>
                        <td className="px-4 py-2 text-center font-bold text-emerald-700">{summaryData.reduce((s, r) => s + r.available, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
            {activeTab === 'department' && (
              <DepartmentReport leaveData={leaveData} />
            )}
            {activeTab === 'absenteeism' && (
              <AbsenteeismReport leaveData={leaveData} pendingLeaves={pendingLeaves} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Department-wise Report ───────── */
function DepartmentReport({ leaveData }: { leaveData: any[] }) {
  // Group by employee's department (available on the balance's employee relation)
  const deptMap = new Map<string, { allocated: number; used: number; count: number }>();
  leaveData.forEach((b: any) => {
    const deptName = b.employee?.department?.name || b.employee?.departmentName || 'Unassigned';
    const existing = deptMap.get(deptName) || { allocated: 0, used: 0, count: 0 };
    existing.allocated += Number(b.total) || 0;
    existing.used += Number(b.used) || 0;
    existing.count += 1;
    deptMap.set(deptName, existing);
  });

  const deptData = Array.from(deptMap.entries()).map(([dept, vals]) => ({
    department: dept,
    employees: vals.count,
    allocated: vals.allocated,
    used: vals.used,
    avgUsed: vals.count > 0 ? (vals.used / vals.count).toFixed(1) : '0',
    utilization: vals.allocated > 0 ? Math.round((vals.used / vals.allocated) * 100) : 0,
  })).sort((a, b) => b.utilization - a.utilization);

  if (deptData.length === 0) {
    return (
      <div className="text-center py-12">
        <FiCalendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No department data available</p>
        <p className="text-xs text-slate-400 mt-1">Department-wise leave usage will appear here when employees are assigned to departments.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-thb-text-primary mb-3">Department-wise Leave Usage</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-600">Department</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Employees</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Allocated</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Used</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Avg/Employee</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deptData.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700">{row.department}</td>
                <td className="px-4 py-2 text-center text-slate-600">{row.employees}</td>
                <td className="px-4 py-2 text-center text-slate-600">{row.allocated}</td>
                <td className="px-4 py-2 text-center text-amber-600">{row.used}</td>
                <td className="px-4 py-2 text-center text-slate-600">{row.avgUsed}</td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                      <div className={`h-full rounded-full ${row.utilization > 80 ? 'bg-red-500' : row.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(row.utilization, 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8">{row.utilization}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ───────── Absenteeism Report (Bradford Score) ─────────
 * Bradford Score = (number of absence episodes)² × (total absence days)
 * Higher score = more problematic absenteeism pattern (frequent short absences).
 * Score < 100: Good, 100-799: Concerning, 800+: Action required
 */
function AbsenteeismReport({ leaveData, pendingLeaves }: { leaveData: any[]; pendingLeaves: any[] }) {
  // Group by employee: count distinct leave episodes + total days
  const empMap = new Map<string, { name: string; dept: string; episodes: number; totalDays: number; leaveTypes: Set<string> }>();
  leaveData.forEach((b: any) => {
    const empId = b.employee?.id || b.employeeId;
    if (!empId) return;
    const name = b.employee ? `${b.employee.firstName || ''} ${b.employee.lastName || ''}`.trim() : 'Unknown';
    const dept = b.employee?.department?.name || 'Unassigned';
    const existing = empMap.get(empId) || { name, dept, episodes: 0, totalDays: 0, leaveTypes: new Set() };
    if (Number(b.used) > 0) {
      existing.episodes += 1; // each leave type with usage counts as an episode (approximation)
      existing.totalDays += Number(b.used);
      if (b.leaveType?.name) existing.leaveTypes.add(b.leaveType.name);
    }
    empMap.set(empId, existing);
  });

  const absenteeismData = Array.from(empMap.entries()).map(([empId, vals]) => {
    const bradford = vals.episodes > 0 ? (vals.episodes * vals.episodes) * vals.totalDays : 0;
    return {
      employeeId: empId,
      name: vals.name,
      department: vals.dept,
      episodes: vals.episodes,
      totalDays: vals.totalDays,
      bradford,
      risk: bradford >= 800 ? 'High' : bradford >= 100 ? 'Medium' : 'Low',
    };
  }).filter(r => r.totalDays > 0).sort((a, b) => b.bradford - a.bradford);

  if (absenteeismData.length === 0) {
    return (
      <div className="text-center py-12">
        <FiClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No absenteeism data available</p>
        <p className="text-xs text-slate-400 mt-1">Absenteeism metrics will appear here when employees have used leave.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Bradford Score</strong> = (absence episodes)² × (total absence days). Higher scores indicate frequent short absences — a pattern more disruptive than occasional long absences.
          <strong className="ml-2">Risk levels:</strong> Low (&lt;100), Medium (100–799), High (800+).
        </p>
      </div>
      <h2 className="text-lg font-semibold text-thb-text-primary mb-3">Employee Absenteeism (Bradford Score)</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-600">Employee</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-600">Department</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Episodes</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Total Days</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Bradford Score</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-600">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {absenteeismData.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700">{row.name}</td>
                <td className="px-4 py-2 text-slate-600">{row.department}</td>
                <td className="px-4 py-2 text-center text-slate-600">{row.episodes}</td>
                <td className="px-4 py-2 text-center text-amber-600">{row.totalDays}</td>
                <td className="px-4 py-2 text-center font-bold text-slate-800">{row.bradford}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.risk === 'High' ? 'bg-red-50 text-red-700' :
                    row.risk === 'Medium' ? 'bg-amber-50 text-amber-700' :
                    'bg-emerald-50 text-emerald-700'
                  }`}>{row.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
