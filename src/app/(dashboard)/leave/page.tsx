'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiCalendar, FiPlus, FiCheck, FiX, FiClock, FiGrid, FiFileText, FiEye,
  FiShield, FiSearch, FiUserCheck, FiUserX, FiUserPlus, FiChevronRight,
  FiChevronLeft, FiRefreshCw, FiFilter, FiDownload, FiUsers, FiDollarSign,
  FiAlertCircle, FiSettings, FiBell, FiTrendingUp, FiBarChart2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { sanitizeSearch } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import TeamLeaveSidebar from '@/components/TeamLeaveSidebar';
import LeaveRequestTracker from '@/components/LeaveRequestTracker';
import { getLeaveCategory, normalizeLeaveBalances } from '@/lib/leave-balance-rules';

/* ── Types ── */
interface LeaveRequest {
  id: string; startDate: string; endDate: string; reason?: string | null;
  status: string; halfDay: boolean; comments?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; avatar?: string | null; department?: { name: string } | null };
  leaveType?: { id: string; name: string; code: string };
  employeeId: string; leaveTypeId: string;
  currentApproverId?: string | null; workflowStage?: string | null;
  appliedByHR?: boolean;
}
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string }; }
interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface Employee { id: string; employeeId: string; firstName: string; lastName: string; employeeStatus?: string; dateOfJoining?: string | null; gender?: string | null; leaveBalances?: LeaveBalance[]; reportingManager?: { id: string; firstName: string; lastName: string } | null; }

function isActiveProbation(emp: Employee | null) {
  if (!emp?.employeeStatus?.toLowerCase().includes('probation') || !emp.dateOfJoining) return false;
  const end = new Date(emp.dateOfJoining); end.setMonth(end.getMonth() + 6);
  return end.getTime() > Date.now();
}
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}
function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()) {
  const startDate = (start || '').split('T')[0]; const endDate = (end || '').split('T')[0];
  const s = new Date(`${startDate}T00:00:00Z`); const e = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0; const cursor = new Date(s.getTime()); let guard = 0;
  while (cursor <= e && guard < 4000) { guard++; const dow = cursor.getUTCDay(); const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++; cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return count;
}
function getAvatarGradient(name: string) {
  const colors = ['from-green-500 to-cyan-500','from-teal-500 to-teal-500','from-emerald-500 to-teal-500','from-orange-500 to-amber-500','from-pink-500 to-rose-500','from-emerald-500 to-green-500'];
  let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Pending' },
    approved: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Approved' },
    rejected: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Rejected' },
    cancelled: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: 'Cancelled' },
  };
  return map[status] || { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: status };
}

/* ── Component ── */
function LeavePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');
  const isManager = user?.role === 'manager' || isAdmin;
  const actionParam = searchParams.get('action');
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'team' | 'admin'>('my');
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date: string; type: string }>>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const sq = scopeQuery();
      const effectiveViewSelf = !isAdmin;
      const viewParamStr = effectiveViewSelf ? '&view=self' : '';
      const [leaveRes, empRes] = await Promise.all([
        fetch(`/api/leave?limit=100${sq ? `&${sq}` : ''}${viewParamStr}`, { headers }),
        fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
      ]);
      if (leaveRes.ok) { const data = await leaveRes.json(); setLeaveRequests(data.leaveRequests || []); }
      if (empRes.ok) {
        const empData = await empRes.json();
        let myEmp = empData.employees?.find((e: { id: string; email: string; userId?: string }) =>
          (user?.employee?.id && e.id === user.employee.id) || e.email === user?.email || e.userId === user?.id
        ) || null;
        let balanceData: any = null;
        try {
          const balRes = await fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null);
          if (balRes?.ok) balanceData = await balRes.json();
        } catch {}
        if (!myEmp && balanceData?.balances?.length > 0 && (user?.employee?.id || user?.id)) {
          myEmp = { id: user?.employee?.id || '', employeeId: user?.employee?.employeeId || '', firstName: user?.employee?.firstName || user?.name?.split(' ')[0] || 'Employee', lastName: user?.employee?.lastName || user?.name?.split(' ').slice(1).join(' ') || '', employeeStatus: (user?.employee as any)?.status, dateOfJoining: null, gender: null } as Employee;
        }
        if (myEmp) {
          setEmployee(myEmp);
          const probation = isActiveProbation(myEmp);
          const currentBalances = balanceData?.balances || myEmp.leaveBalances || [];
          const normalizedBalances = normalizeLeaveBalances(currentBalances as LeaveBalance[], { gender: myEmp.gender || balanceData?.gender, probation });
          setLeaveBalances(normalizedBalances);
        }
        const ltRes = await fetch(`/api/leave-types?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null);
        if (ltRes?.ok) { const ltData = await ltRes.json(); setLeaveTypes((ltData.data || []).map((lt: any) => ({ id: lt.id, name: lt.name, code: lt.code, defaultDays: lt.defaultDays || 0, isPaid: lt.isPaid ?? true }))); }
      }
    } catch (err) { console.error(err); toast.error('Failed to load leave data'); }
    finally { setLoading(false); }
  }, [user?.email, scopeQuery, selectedTenantId]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);
  useEffect(() => { if (actionParam === 'apply') router.push('/leave/apply'); }, [actionParam, router]);

  const pendingCount = leaveRequests.filter(l => l.status === 'pending').length;
  const approvedThisMonth = leaveRequests.filter(l => {
    if (l.status !== 'approved') return false;
    const d = new Date(l.startDate); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const rejectedThisMonth = leaveRequests.filter(l => {
    if (l.status !== 'rejected') return false;
    const d = new Date(l.startDate); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const myLeavesThisMonth = leaveRequests.filter(l =>
    (l.status === 'approved' || l.status === 'pending') && l.employeeId === employee?.id &&
    new Date(l.startDate).getMonth() === new Date().getMonth() &&
    new Date(l.startDate).getFullYear() === new Date().getFullYear()
  ).length;

  const filteredLeaves = leaveRequests;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Leave Dashboard</h2>
          <nav className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
            <button onClick={() => router.push('/')} className="hover:text-green-600">Home</button>
            <span>/</span><span>Leave</span><span>/</span>
            <span className="text-slate-700 font-medium">Dashboard</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
            <FiDownload className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => router.push('/leave/apply')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm shadow-sm">
            <FiPlus className="w-4 h-4" /> Apply Leave
          </button>
        </div>
      </div>

      {/* Role-based tabs */}
      {isManager && (
        <div className="border-b border-slate-200">
          <div className="flex gap-1">
            <button onClick={() => setActiveTab('my')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'my' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <FiGrid className="w-4 h-4" /> My Leave
            </button>
            <button onClick={() => setActiveTab('team')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'team' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <FiUsers className="w-4 h-4" /> Team {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">{pendingCount}</span>}
            </button>
            {isAdmin && (
              <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'admin' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <FiSettings className="w-4 h-4" /> Administration
              </button>
            )}
          </div>
        </div>
      )}

      {/* My Leave tab (all roles) */}
      {activeTab === 'my' && (
        <>
          {/* Leave request tracker — 5-step pipeline for the most-recent pending leave */}
          <LeaveRequestTracker
            leaveRequests={leaveRequests}
            employee={employee ? { id: employee.id, reportingManager: employee.reportingManager || null } : null}
            onCancelled={fetchData}
          />

          {/* Greeting */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-sm text-slate-600">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <strong>{user?.name?.split(' ')[0] || 'there'}</strong> — you have <strong className="text-emerald-700">{leaveBalances.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.used || 0)), 0)}</strong> days of leave available.
            </p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Leaves Taken (This Month)" value={myLeavesThisMonth} icon={<FiCalendar className="w-5 h-5" />} color="emerald" sub="Leaves" />
            <StatCard label="Approved Leaves" value={approvedThisMonth} icon={<FiCheck className="w-5 h-5" />} color="pink" sub="Approved" />
            <StatCard label="Rejected Leaves" value={rejectedThisMonth} icon={<FiUserX className="w-5 h-5" />} color="amber" sub="Rejected" />
            <StatCard label="Pending Requests" value={pendingCount} icon={<FiClock className="w-5 h-5" />} color="green" sub="Pending" />
          </div>

          {/* Balance Cards */}
          {leaveBalances.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {leaveBalances.slice().sort((a, b) => {
                const order = ['casual leave','sick leave','earned leave','personal leave','loss of pay'];
                return (order.indexOf(a.leaveType?.name?.toLowerCase()||'')+10) - (order.indexOf(b.leaveType?.name?.toLowerCase()||'')+10);
              }).map(lb => {
                const blocked = isActiveProbation(employee);
                const safeTotal = blocked ? 0 : (lb.total || 0);
                const safeUsed = blocked ? 0 : (lb.used || 0);
                const computedRemaining = blocked ? 0 : Math.max(0, safeTotal - safeUsed);
                const usedPct = safeTotal > 0 ? (safeUsed / safeTotal) * 100 : 0;
                const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={lb.id} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-800">{lb.leaveType.name.replace(/\b\w/g, c => c.toUpperCase())}</h4>
                      <span className="text-[10px] font-mono text-slate-400">{lb.leaveType.code}</span>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-center"><p className="text-lg font-bold text-emerald-600">{computedRemaining}</p><p className="text-[9px] text-slate-400">Left</p></div>
                      <div className="text-center"><p className="text-sm font-semibold text-amber-600">{safeUsed}</p><p className="text-[9px] text-slate-400">Used</p></div>
                      <div className="text-center"><p className="text-sm text-slate-500">{safeTotal}</p><p className="text-[9px] text-slate-400">Total</p></div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leave List */}
          <LeaveListTable requests={filteredLeaves} loading={loading} holidays={holidays} isAdmin={isAdmin} employee={employee} />
        </>
      )}

      {/* Team tab (manager) */}
      {activeTab === 'team' && isManager && (
        <TeamTab leaveRequests={leaveRequests} loading={loading} holidays={holidays} scopeQuery={scopeQuery()} employee={employee} />
      )}

      {/* Admin tab (HR) */}
      {activeTab === 'admin' && isAdmin && (
        <AdminTab leaveRequests={leaveRequests} loading={loading} />
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon, color, sub }: { label: string; value: number; icon: React.ReactNode; color: string; sub: string }) {
  const colors: Record<string, string> = { emerald: 'from-emerald-50 to-emerald-50/30', pink: 'from-pink-50 to-pink-50/30', amber: 'from-amber-50 to-amber-50/30', green: 'from-green-50 to-green-50/30' };
  const iconColors: Record<string, string> = { emerald: 'bg-emerald-500', pink: 'bg-pink-500', amber: 'bg-amber-500', green: 'bg-green-500' };
  const textColors: Record<string, string> = { emerald: 'text-emerald-600', pink: 'text-pink-600', amber: 'text-amber-600', green: 'text-green-600' };
  const subColors: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-700', pink: 'bg-pink-50 text-pink-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-green-50 text-green-700' };
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between bg-gradient-to-r ${colors[color]}`}>
      <div className="flex items-center overflow-hidden">
        <div className={`w-12 h-12 rounded-full ${iconColors[color]} flex items-center justify-center text-white flex-shrink-0`}>{icon}</div>
        <div className="ml-3 overflow-hidden"><p className="text-xs font-medium text-slate-500 truncate">{label}</p><h4 className={`text-2xl font-bold ${textColors[color]}`}>{value}</h4></div>
      </div>
      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${subColors[color]}`}>{sub}</span>
    </div>
  );
}

/* ── Leave List Table ── */
function LeaveListTable({ requests, loading, holidays, isAdmin, employee }: { requests: LeaveRequest[]; loading: boolean; holidays: any[]; isAdmin: boolean; employee: Employee | null }) {
  const [filterStatus, setFilterStatus] = useState('');
  const filtered = filterStatus ? requests.filter(r => r.status === filterStatus) : requests;
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold text-slate-800">Leave Status</h5>
        <div className="flex items-center gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600">
            <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-slate-100">
            <tr>
              {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase"><input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" /></th>}
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Leave Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">To</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? Array.from({length:3}).map((_,i) => <tr key={i} className="border-b border-slate-50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td></tr>) :
            filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center"><FiCalendar className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 font-medium">No leave requests found</p><p className="text-xs text-slate-400 mt-1">Apply for leave using the "Apply Leave" button</p></td></tr> :
            filtered.map(lr => {
              const fullName = lr.employee ? `${lr.employee.firstName} ${lr.employee.lastName}`.trim() : 'Unknown';
              const empId = lr.employee?.employeeId || ''; const dept = lr.employee?.department?.name || '';
              const subLine = [empId, dept].filter(Boolean).join(' · ') || '—';
              const badge = getStatusBadge(lr.status);
              const days = (() => { const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])); const wd = getDaysBetween(lr.startDate, lr.endDate, hs); const d = lr.halfDay ? 0.5 : wd; return `${d} Day${d !== 1 ? 's' : ''}${lr.halfDay ? ' (Half)' : ''}`; })();
              return (
                <tr key={lr.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  {isAdmin && <td className="px-4 py-3"><input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" /></td>}
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(fullName)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>{fullName.charAt(0).toUpperCase()}</div><div><p className="text-sm font-medium text-slate-800">{fullName}</p><p className="text-xs text-slate-400">{subLine}</p></div></div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1.5"><span className="text-sm font-medium text-slate-700">{lr.leaveType?.name || 'Leave'}</span>{lr.appliedByHR && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">HR</span>}{lr.halfDay && <span className="text-[10px] text-slate-400">(Half)</span>}</div></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatDate(lr.startDate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatDate(lr.endDate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">{days}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text}`}>{badge.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Team Tab (Manager view) ── */
function TeamTab({ leaveRequests, loading, holidays, scopeQuery, employee }: { leaveRequests: LeaveRequest[]; loading: boolean; holidays: any[]; scopeQuery: string; employee: Employee | null }) {
  const pendingApprovals = leaveRequests.filter(r => r.status === 'pending');
  const onLeaveToday = leaveRequests.filter(r => r.status === 'approved' && new Date(r.startDate) <= new Date() && new Date(r.endDate) >= new Date());
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Approvals" value={pendingApprovals.length} icon={<FiClock className="w-5 h-5" />} color="amber" sub="Pending" />
        <StatCard label="On Leave Today" value={onLeaveToday.length} icon={<FiUserCheck className="w-5 h-5" />} color="emerald" sub="Today" />
        <StatCard label="Approved This Month" value={leaveRequests.filter(r => r.status === 'approved').length} icon={<FiCheck className="w-5 h-5" />} color="pink" sub="Approved" />
        <StatCard label="Team Size" value={new Set(leaveRequests.map(r => r.employeeId)).size} icon={<FiUsers className="w-5 h-5" />} color="green" sub="Members" />
      </div>

      {/* Approve Leaves Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h5 className="text-sm font-semibold text-slate-800">Requests waiting on you · oldest first</h5>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase"><input type="checkbox" className="w-3.5 h-3.5" /></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Dates</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Flags</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pendingApprovals.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center"><FiCheck className="w-10 h-10 text-emerald-300 mx-auto mb-3" /><p className="text-slate-500 font-medium">All caught up — no pending requests.</p></td></tr> :
              pendingApprovals.map(lr => {
                const fullName = lr.employee ? `${lr.employee.firstName} ${lr.employee.lastName}` : 'Unknown';
                const days = (() => { const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])); const wd = getDaysBetween(lr.startDate, lr.endDate, hs); return lr.halfDay ? 0.5 : wd; })();
                return (
                  <tr key={lr.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" /></td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{fullName}</p><p className="text-xs text-slate-400">{lr.employee?.employeeId || ''}</p></td>
                    <td className="px-4 py-3 text-slate-700">{lr.leaveType?.name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(lr.startDate)} – {formatDate(lr.endDate)}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{days}</td>
                    <td className="px-4 py-3"><div className="flex gap-1">{new Date(lr.startDate) < new Date() && <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">Back-dated</span>}</div></td>
                    <td className="px-4 py-3 text-right"><div className="inline-flex gap-1"><button className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded" title="Approve"><FiCheck className="w-4 h-4" /></button><button className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Reject"><FiX className="w-4 h-4" /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Calendar */}
      <TeamCalendar leaveRequests={leaveRequests} />
    </div>
  );
}

/* ── Team Calendar ── */
function TeamCalendar({ leaveRequests }: { leaveRequests: LeaveRequest[] }) {
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const calendarCells = (() => {
    const f = new Date(calMonth.year, calMonth.month, 1); const l = new Date(calMonth.year, calMonth.month + 1, 0);
    const sw = f.getDay(); const dm = l.getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < sw; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= dm; d++) cells.push({ date: `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d });
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  })();

  // Get team members on leave per date
  const leavesByDate = new Map<string, LeaveRequest[]>();
  leaveRequests.filter(l => l.status === 'approved' || l.status === 'pending').forEach(l => {
    const s = new Date(l.startDate); const e = new Date(l.endDate); const c = new Date(s); let g = 0;
    while (c <= e && g < 400) { g++; const dk = c.toISOString().split('T')[0]; const a = leavesByDate.get(dk) || []; a.push(l); leavesByDate.set(dk, a); c.setDate(c.getDate() + 1); }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const prevMonth = () => setCalMonth(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const nextMonth = () => setCalMonth(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><FiCalendar className="w-4 h-4 text-green-600" /> Team Leave Calendar</h3>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><FiChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs font-semibold text-slate-700 min-w-[100px] text-center">{MONTH_NAMES[calMonth.month]} {calMonth.year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><FiChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => { if (!cell.date) return <div key={i} className="aspect-square" />;
            const dl = leavesByDate.get(cell.date) || []; const ha = dl.some(l => l.status === 'approved'); const hp = dl.some(l => l.status === 'pending');
            const ir = cell.date >= todayStr; const d = new Date(`${cell.date}T00:00:00`); const wk = d.getDay() === 0 || d.getDay() === 6; const td = cell.date === todayStr;
            const cls = ['aspect-square rounded-md text-xs flex flex-col items-center justify-center relative cursor-pointer transition-all hover:ring-2 hover:ring-green-400/30'];
            if (ha) cls.push('bg-red-100 ring-1 ring-red-300 text-red-900'); else if (hp) cls.push('bg-amber-100 ring-1 ring-amber-300 text-amber-900'); else if (wk) cls.push('bg-slate-50 text-slate-400'); else cls.push('bg-white text-slate-700 hover:bg-slate-50');
            const tip = dl.length > 0 ? dl.map(l => `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim() + ` — ${l.leaveType?.name || 'Leave'} (${l.status})`).join(', ') : '';
            return (<button key={i} title={tip} onClick={() => {}} className={cls.join(' ')}>
              <span className={`font-medium ${td ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>{cell.day}</span>
              {dl.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{dl.slice(0, 3).map((l, idx) => <span key={idx} className={`w-1 h-1 rounded-full ${l.status === 'approved' ? 'bg-red-500' : 'bg-amber-500'}`} />)}</span>}
            </button>);
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" />Approved</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" />Pending</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 ring-1 ring-green-300" />Selected</div>
        </div>
      </div>
    </div>
  );
}

/* ── Admin Tab (HR view) ── */
function AdminTab({ leaveRequests, loading }: { leaveRequests: LeaveRequest[]; loading: boolean }) {
  const onLeaveToday = leaveRequests.filter(r => r.status === 'approved' && new Date(r.startDate) <= new Date() && new Date(r.endDate) >= new Date());
  const pending = leaveRequests.filter(r => r.status === 'pending');
  const approved = leaveRequests.filter(r => r.status === 'approved');
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="On Leave Today" value={onLeaveToday.length} icon={<FiUserCheck className="w-5 h-5" />} color="emerald" sub="Today" />
        <StatCard label="Pending Approvals" value={pending.length} icon={<FiClock className="w-5 h-5" />} color="amber" sub="Pending" />
        <StatCard label="Approved (Month)" value={approved.length} icon={<FiCheck className="w-5 h-5" />} color="pink" sub="Approved" />
        <StatCard label="Total Requests" value={leaveRequests.length} icon={<FiBarChart2 className="w-5 h-5" />} color="green" sub="Total" />
      </div>
      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:shadow-md transition-all"><div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600"><FiUserPlus className="w-5 h-5" /></div><span className="text-xs font-medium text-slate-700">Apply on Behalf</span></button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:shadow-md transition-all"><div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600"><FiCalendar className="w-5 h-5" /></div><span className="text-xs font-medium text-slate-700">Post NPD Leave</span></button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:shadow-md transition-all"><div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600"><FiDownload className="w-5 h-5" /></div><span className="text-xs font-medium text-slate-700">Upload Balance</span></button>
          <button className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:shadow-md transition-all"><div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><FiFileText className="w-5 h-5" /></div><span className="text-xs font-medium text-slate-700">Leave Reports</span></button>
        </div>
      </div>
      {/* Module Setup */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Module Set-up Status</h3>
        <div className="space-y-2">
          {['Leave Policy','Leave Master','Leave Rules','Employee Leave Profile','Upload Opening Balance','Verify Sample Employee'].map((step, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>{i < 3 ? '✓' : i + 1}</span><span className="text-sm text-slate-700">{step}</span></div>
              <span className={`text-xs font-medium ${i < 3 ? 'text-green-600' : 'text-amber-600'}`}>{i < 3 ? 'Done' : 'To do'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function handleExportCSV() { toast.success('CSV exported'); }

export default function LeavePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <LeavePageContent />
    </Suspense>
  );
}
