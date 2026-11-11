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
  createdAt?: string | null;
}
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string }; }
interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface Employee { id: string; employeeId: string; firstName: string; lastName: string; employeeStatus?: string; dateOfJoining?: string | null; gender?: string | null; leaveBalances?: LeaveBalance[]; reportingManager?: { id: string; firstName: string; lastName: string } | null; leavePolicyId?: string | null; }

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ───────── Left main column (2/3) ───────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Greeting + Apply Leave */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <strong>{user?.name?.split(' ')[0] || 'there'}</strong> — you have <strong className="text-emerald-700">{leaveBalances.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.used || 0)), 0)}</strong> days of leave available.
              </p>
              <button onClick={() => router.push('/leave/apply')} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm shadow-sm flex-shrink-0">
                <FiPlus className="w-4 h-4" /> Apply Leave
              </button>
            </div>

            {/* Leave balance cards — 5 in a row (CL, SL, EL, C-Off, ML, …) */}
            {leaveBalances.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {leaveBalances.slice().sort((a, b) => {
                  const order = ['casual leave','sick leave','earned leave','personal leave','loss of pay','comp off','maternity leave','paternity leave'];
                  return (order.indexOf(a.leaveType?.name?.toLowerCase()||'')+10) - (order.indexOf(b.leaveType?.name?.toLowerCase()||'')+10);
                }).slice(0, 5).map(lb => {
                  const blocked = isActiveProbation(employee);
                  const safeTotal = blocked ? 0 : (lb.total || 0);
                  const safeUsed = blocked ? 0 : (lb.used || 0);
                  const computedRemaining = blocked ? 0 : Math.max(0, safeTotal - safeUsed);
                  const usedPct = safeTotal > 0 ? (safeUsed / safeTotal) * 100 : 0;

                  // Leave-type-specific color theme (matches the screenshot's per-type coloring)
                  const code = (lb.leaveType?.code || '').toLowerCase();
                  const name = (lb.leaveType?.name || '').toLowerCase();
                  let theme: { border: string; badge: string; bar: string; dot: string; text: string };
                  if (code.includes('cl') || name.includes('casual')) {
                    theme = { border: 'border-t-emerald-500', badge: 'bg-emerald-500', bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' };
                  } else if (code.includes('sl') || name.includes('sick')) {
                    theme = { border: 'border-t-blue-500', badge: 'bg-blue-500', bar: 'bg-blue-500', dot: 'bg-blue-500', text: 'text-blue-700' };
                  } else if (code.includes('el') || name.includes('earned')) {
                    theme = { border: 'border-t-amber-500', badge: 'bg-amber-500', bar: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-700' };
                  } else if (code.includes('c-off') || code.includes('comp') || name.includes('compensatory')) {
                    theme = { border: 'border-t-teal-500', badge: 'bg-teal-500', bar: 'bg-teal-500', dot: 'bg-teal-500', text: 'text-teal-700' };
                  } else if (code.includes('ml') || name.includes('maternity')) {
                    theme = { border: 'border-t-pink-500', badge: 'bg-pink-500', bar: 'bg-pink-500', dot: 'bg-pink-500', text: 'text-pink-700' };
                  } else if (code.includes('pl') || name.includes('paternity')) {
                    theme = { border: 'border-t-indigo-500', badge: 'bg-indigo-500', bar: 'bg-indigo-500', dot: 'bg-indigo-500', text: 'text-indigo-700' };
                  } else if (code.includes('lop') || name.includes('loss of pay')) {
                    theme = { border: 'border-t-red-500', badge: 'bg-red-500', bar: 'bg-red-500', dot: 'bg-red-500', text: 'text-red-700' };
                  } else {
                    theme = { border: 'border-t-slate-500', badge: 'bg-slate-500', bar: 'bg-slate-500', dot: 'bg-slate-500', text: 'text-slate-700' };
                  }

                  // Pending count for this leave type (current-year pending leaves)
                  const pendingForType = leaveRequests
                    .filter(l => l.status === 'pending' && l.leaveTypeId === lb.leaveType.id && new Date(l.startDate).getFullYear() === new Date().getFullYear())
                    .reduce((s, l) => s + (l.halfDay ? 0.5 : getDaysBetween(l.startDate, l.endDate, new Set())), 0);

                  // Policy footnote per leave type
                  const footnote: string = (() => {
                    if (code.includes('cl') || name.includes('casual')) return safeTotal > 0 ? `${(safeTotal / 12).toFixed(3)} credited monthly` : 'Casual leave';
                    if (code.includes('sl') || name.includes('sick')) return 'Medical cert. if > 3 days';
                    if (code.includes('el') || name.includes('earned')) return safeTotal > 0 ? `${(safeTotal / 12).toFixed(2)} per month` : 'Earned leave';
                    if (code.includes('c-off') || code.includes('comp') || name.includes('compensatory')) return 'Expires 31-Dec-' + new Date().getFullYear();
                    if (code.includes('ml') || name.includes('maternity')) return '26 weeks · eligible';
                    if (code.includes('pl') || name.includes('paternity')) return 'Eligible';
                    return '';
                  })();

                  return (
                    <div key={lb.id} className={`bg-white rounded-xl border border-slate-200 border-t-4 ${theme.border} p-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-7 h-7 rounded-full ${theme.badge} flex items-center justify-center text-white text-[10px] font-bold`}>
                          {(lb.leaveType?.code || lb.leaveType?.name || 'L').slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <h4 className="text-[11px] font-semibold text-slate-700 truncate mb-1" title={lb.leaveType.name}>{lb.leaveType.name.replace(/\b\w/g, c => c.toUpperCase())}</h4>
                      <div className="flex items-baseline gap-1 mb-1.5">
                        <span className={`text-lg font-bold ${theme.text}`}>{safeUsed}</span>
                        <span className="text-xs text-slate-400">/ {safeTotal} days</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${theme.bar} rounded-full transition-all duration-500`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        <span className="flex items-center gap-0.5"><span className={`inline-block w-1.5 h-1.5 rounded-full ${theme.dot}`} /> Used {safeUsed}</span>
                        <span className="flex items-center gap-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" /> Pending {pendingForType}</span>
                      </div>
                      {footnote && <p className="text-[9px] text-slate-400 mt-1 truncate" title={footnote}>{footnote}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Leave request tracker — 5-step pipeline for the most-recent pending leave */}
            <LeaveRequestTracker
              leaveRequests={leaveRequests}
              employee={employee ? { id: employee.id, reportingManager: employee.reportingManager || null } : null}
              onCancelled={fetchData}
            />

            {/* Leave status table — with Reason column */}
            <LeaveListTable requests={filteredLeaves} loading={loading} holidays={holidays} isAdmin={isAdmin} employee={employee} />
          </div>

          {/* ───────── Right column — My leave summary (1/3) ───────── */}
          <div className="space-y-6">
            <MyLeaveSummaryPanel
              leaveRequests={leaveRequests}
              employee={employee}
            />
          </div>
        </div>
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
function LeaveListTable({ requests, loading, holidays }: { requests: LeaveRequest[]; loading: boolean; holidays: any[]; isAdmin?: boolean; employee?: Employee | null }) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const filtered = (filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus))
    .slice().sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime());

  // Ticket code helper (LR-YYMM-NNN)
  const ticketCode = (id: string, createdAt?: string | null) => {
    const d = createdAt ? new Date(createdAt) : new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const tail = (id || '').replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, '0');
    return `LR-${yy}${mm}-${tail}`;
  };

  // "Applied X Nov" subtext
  const appliedSubtext = (createdAt?: string | null) => {
    if (!createdAt) return '';
    const d = new Date(createdAt);
    return `Applied ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
  };

  // Leave-type badge color (matches the balance cards)
  const leaveTypeBadgeClass = (code?: string, name?: string) => {
    const c = (code || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (c.includes('cl') || n.includes('casual')) return 'bg-emerald-100 text-emerald-700';
    if (c.includes('sl') || n.includes('sick')) return 'bg-blue-100 text-blue-700';
    if (c.includes('el') || n.includes('earned')) return 'bg-amber-100 text-amber-700';
    if (c.includes('c-off') || c.includes('comp') || n.includes('compensatory')) return 'bg-teal-100 text-teal-700';
    if (c.includes('ml') || n.includes('maternity')) return 'bg-pink-100 text-pink-700';
    if (c.includes('pl') || n.includes('paternity')) return 'bg-indigo-100 text-indigo-700';
    if (c.includes('lop') || n.includes('loss of pay')) return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  // Cancel a pending leave
  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this leave request? This cannot be undone.')) return;
    try {
      setCancellingId(id);
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to cancel');
      }
      toast.success('Leave request cancelled');
      // Force a reload of the page data via a soft reload — the parent fetchData will fire on next render
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel leave');
    } finally {
      setCancellingId(null);
    }
  };

  // Status counts for filter pills
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length,
  };

  const statusPills: Array<{ key: typeof filterStatus; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h5 className="text-sm font-semibold text-slate-800">Leave status</h5>
            <p className="text-[10px] text-slate-400 mt-0.5">Your requests this year</p>
          </div>
        </div>
        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusPills.map(p => {
            const active = filterStatus === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setFilterStatus(p.key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
                <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>{counts[p.key]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[180px]" />
            <col className="w-[180px]" />
            <col className="w-[90px]" />
            <col />
            <col className="w-[120px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="bg-gray-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Request</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Dates</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Days</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reason</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? Array.from({length:3}).map((_,i) => <tr key={i} className="border-b border-slate-50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td></tr>) :
            filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center"><FiCalendar className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 font-medium">No leave requests found</p><p className="text-xs text-slate-400 mt-1">Apply for leave using the "Apply Leave" button</p></td></tr> :
            filtered.map(lr => {
              const badge = getStatusBadge(lr.status);
              const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
              const wd = getDaysBetween(lr.startDate, lr.endDate, hs);
              const d = lr.halfDay ? 0.5 : wd;
              const daysStr = `${d} Day${d !== 1 ? 's' : ''}${lr.halfDay ? ' (Half)' : ''}`;
              const dateStr = lr.startDate === lr.endDate
                ? formatDate(lr.startDate)
                : `${formatDate(lr.startDate)} – ${formatDate(lr.endDate)}`;
              const reason = (lr.reason || '').trim() || '—';
              const sub = appliedSubtext(lr.createdAt || undefined);
              const code = lr.leaveType?.code || '';
              const isBackDated = new Date(lr.startDate) < new Date(Date.now() - 30 * 86_400_000);
              const isPending = lr.status === 'pending';
              return (
                <tr key={lr.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-xs font-mono font-semibold text-slate-700">{ticketCode(lr.id, lr.createdAt || undefined)}</p>
                    {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${leaveTypeBadgeClass(code, lr.leaveType?.name)}`}>
                        {(code || lr.leaveType?.name || 'L').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-slate-700 truncate">{lr.leaveType?.name || 'Leave'}</span>
                      {lr.appliedByHR && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold flex-shrink-0">HR</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {dateStr}
                    {isBackDated && <span className="ml-1 inline-block text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Back-dated</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium whitespace-nowrap">{daysStr}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 truncate" title={reason}>{reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${badge.bg} ${badge.text}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        lr.status === 'approved' ? 'bg-emerald-500'
                        : lr.status === 'pending' ? 'bg-amber-500'
                        : lr.status === 'rejected' ? 'bg-red-500'
                        : 'bg-slate-400'
                      }`} />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isPending ? (
                      <button
                        onClick={() => handleCancel(lr.id)}
                        disabled={cancellingId === lr.id}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                      >
                        {cancellingId === lr.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── My Leave Summary Panel (right column) ── */
function MyLeaveSummaryPanel({ leaveRequests, employee }: { leaveRequests: LeaveRequest[]; employee: Employee | null }) {
  // Stats: Days taken / Pending / LOP days (current year)
  const year = new Date().getFullYear();
  let taken = 0, pending = 0, lop = 0;
  for (const l of leaveRequests) {
    if (new Date(l.startDate).getFullYear() !== year) continue;
    const hs = new Set(); // holidays not needed for stats
    const days = (l.halfDay ? 0.5 : getDaysBetween(l.startDate, l.endDate, hs));
    if (l.status === 'approved') {
      taken += days;
      const code = (l.leaveType?.code || '').toLowerCase();
      if (code.includes('lop') || code.includes('unpaid')) lop += days;
    } else if (l.status === 'pending') {
      pending += days;
    }
  }

  // Team on leave this week (Mon-Sun) — derived from the leaveRequests in scope.
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((dow + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const teamOnLeaveThisWeek = leaveRequests
    .filter(l => {
      if (l.status !== 'approved') return false;
      const s = new Date(l.startDate); const e = new Date(l.endDate);
      return s <= weekEnd && e >= weekStart;
    })
    .map(l => ({
      id: l.id,
      name: l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown',
      leaveTypeName: l.leaveType?.name || 'Leave',
      leaveTypeCode: l.leaveType?.code || '',
      startDate: l.startDate,
      endDate: l.endDate,
    }));

  const managerName = employee?.reportingManager
    ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
    : null;

  // Month-range subtitle (Jan – Nov 2026 style — shows Jan to current month)
  const monthShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const subtitleRange = `${monthShort(new Date(year, 0, 1))} – ${monthShort(now)} ${year}`;

  // Week-range subtitle (9 – 15 Nov style)
  const weekRangeSubtitle = `${weekStart.getDate()} – ${weekEnd.getDate()} ${monthShort(weekEnd)}`;

  // Leave-type color for the badge in team list
  const leaveTypeBadgeClass = (code: string) => {
    const c = (code || '').toLowerCase();
    if (c.includes('cl')) return 'bg-emerald-100 text-emerald-700';
    if (c.includes('sl')) return 'bg-blue-100 text-blue-700';
    if (c.includes('el')) return 'bg-amber-100 text-amber-700';
    if (c.includes('c-off') || c.includes('comp')) return 'bg-teal-100 text-teal-700';
    if (c.includes('ml')) return 'bg-pink-100 text-pink-700';
    if (c.includes('pl')) return 'bg-indigo-100 text-indigo-700';
    if (c.includes('lop')) return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      {/* ── My leave summary card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-thb-text-primary">My leave summary</h2>
          <p className="text-xs text-thb-text-secondary mt-0.5">{subtitleRange}</p>
        </div>

        {/* Stats — 3 light-gray stat boxes in a row */}
        <div className="p-5 grid grid-cols-3 gap-2">
          <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-2xl font-bold text-thb-text-primary">{taken}</p>
            <p className="text-[10px] text-thb-text-muted uppercase tracking-wider mt-0.5">Days taken</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
            <p className="text-[10px] text-thb-text-muted uppercase tracking-wider mt-0.5">Pending</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-2xl font-bold text-red-600">{lop}</p>
            <p className="text-[10px] text-thb-text-muted uppercase tracking-wider mt-0.5">LOP days</p>
          </div>
        </div>

        {/* Policy details */}
        <div className="px-5 pb-5 space-y-2.5">
          <SummaryRow icon={<FiFileText className="w-3.5 h-3.5" />} label="Policy" value={employee?.leavePolicyId ? 'Custom policy' : 'Staff Policy ' + year} />
          <SummaryRow icon={<FiUserCheck className="w-3.5 h-3.5" />} label="Category" value={employee?.employeeType ? formatCategory(employee.employeeType) : '—'} />
          <SummaryRow icon={<FiUsers className="w-3.5 h-3.5" />} label="Approver" value={managerName || 'Not assigned'} />
          <SummaryRow icon={<FiCalendar className="w-3.5 h-3.5" />} label="DOJ · DOC" value={employee?.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'} />
        </div>
      </div>

      {/* ── Team out this week card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-thb-text-primary">Team out this week</h2>
          <p className="text-xs text-thb-text-secondary mt-0.5">{weekRangeSubtitle}</p>
        </div>
        <div className="p-5">
          {teamOnLeaveThisWeek.length === 0 ? (
            <p className="text-xs text-thb-text-muted py-2 text-center">No team members on leave this week.</p>
          ) : (
            <ul className="space-y-3">
              {teamOnLeaveThisWeek.slice(0, 5).map(t => (
                <li key={t.id} className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(t.name)} flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0`}>
                    {t.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-thb-text-primary truncate">{t.name}</p>
                    <p className="text-[10px] text-thb-text-muted">
                      {new Date(t.startDate).getDate()}{t.startDate !== t.endDate ? `–${new Date(t.endDate).getDate()}` : ''} {new Date(t.endDate).toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${leaveTypeBadgeClass(t.leaveTypeCode)}`}>
                    {(t.leaveTypeCode || t.leaveTypeName).slice(0, 4).toUpperCase()}
                  </span>
                </li>
              ))}
              {teamOnLeaveThisWeek.length > 5 && (
                <li className="text-[10px] text-thb-text-muted text-center pt-1">+{teamOnLeaveThisWeek.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* helper: format employment type as category */
function formatCategory(employmentType: string) {
  return employmentType
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

/* ── Summary Row (right panel) ── */
function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-thb-text-muted">
        {icon} {label}
      </span>
      <span className="text-xs font-semibold text-thb-text-primary text-right">{value}</span>
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
