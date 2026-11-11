'use client';

import { useEffect, useState, useCallback, useMemo, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiCalendar, FiPlus, FiCheck, FiX, FiClock, FiGrid, FiUserCheck, FiUserPlus,
  FiChevronRight, FiChevronLeft, FiDownload, FiUsers, FiSettings, FiBarChart2,
  FiFileText, FiRefreshCw, FiAlertCircle, FiLayers, FiActivity, FiBriefcase,
  FiInfo, FiUpload, FiInbox, FiLoader, FiChevronDown,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import LeaveRequestTracker from '@/components/LeaveRequestTracker';
import { normalizeLeaveBalances } from '@/lib/leave-balance-rules';

/* ── Types ── */
interface LeaveRequest {
  id: string; startDate: string; endDate: string; reason?: string | null;
  status: string; halfDay: boolean; comments?: string | null; halfDaySlot?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; avatar?: string | null; department?: { name: string } | null };
  leaveType?: { id: string; name: string; code: string };
  employeeId: string; leaveTypeId: string;
  currentApproverId?: string | null; workflowStage?: string | null;
  appliedByHR?: boolean;
  createdAt?: string | null;
}
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string }; }
interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface Employee {
  id: string; employeeId: string; firstName: string; lastName: string; employeeStatus?: string;
  dateOfJoining?: string | null; dateOfConfirmation?: string | null; employeeType?: string | null; gender?: string | null;
  leaveBalances?: LeaveBalance[]; reportingManager?: { id: string; firstName: string; lastName: string } | null; leavePolicyId?: string | null;
  department?: { id: string; name: string } | null; departmentId?: string | null;
}
interface Holiday { id: string; name: string; date: string; type?: string }

/* ── Helpers ── */
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
  while (cursor <= e && guard < 4000) {
    guard++; const dow = cursor.getUTCDay(); const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function ticketCode(id: string, createdAt?: string | null) {
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const tail = (id || '').replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, '0');
  return `LR-${yy}${mm}-${tail}`;
}

function appliedShort(d?: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  return `Applied ${dt.getDate()} ${dt.toLocaleDateString('en-US', { month: 'short' })}`;
}

function fmtNum(n: number) {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(2)).toString();
}

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return '—';
  const s = new Date(start); const e = new Date(end || start);
  if (s.getTime() === e.getTime()) return formatDate(start);
  return `${s.getDate()} ${s.toLocaleDateString('en-US', { month: 'short' })} – ${formatDate(end)}`;
}

/* ── Status pill styling (matches reference) ── */
function getStatusPill(status: string) {
  const s = (status || '').toLowerCase();
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Pending' },
    approved: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Approved' },
    rejected: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Rejected' },
    cancelled: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Cancelled' },
  };
  return map[s] || { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400', label: status };
}

/* ── Leave-type color theme (CL=emerald, SL=indigo-blue, EL=amber, C-Off=teal, ML=pink, LOP=red, etc.) ── */
type LeaveTheme = { color: string; soft: string };
function getLeaveTheme(code?: string, name?: string): LeaveTheme {
  const c = (code || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c.includes('c-off') || c.includes('coff') || c.includes('comp') || n.includes('compensatory')) return { color: '#14b8a6', soft: '#f0fdfa' };
  if (c === 'cl' || c.startsWith('cl') || n.includes('casual')) return { color: '#10b981', soft: '#ecfdf5' };
  if (c === 'sl' || c.startsWith('sl') || n.includes('sick')) return { color: '#4f6bf6', soft: '#eef2ff' };
  if (c === 'el' || c.startsWith('el') || n.includes('earned')) return { color: '#f59e0b', soft: '#fffbeb' };
  if (c === 'ml' || c.startsWith('ml') || n.includes('maternity')) return { color: '#ec4899', soft: '#fdf2f8' };
  if (c === 'pl' || c.startsWith('pl') || n.includes('paternity')) return { color: '#8b5cf6', soft: '#f5f3ff' };
  if (c.includes('lop') || n.includes('loss of pay')) return { color: '#ef4444', soft: '#fef2f2' };
  return { color: '#64748b', soft: '#f1f5f9' };
}

function typePolicyNote(code?: string, name?: string, total?: number) {
  const c = (code || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c.includes('c-off') || c.includes('coff') || c.includes('comp') || n.includes('compensatory')) return `Expires 31-Dec-${new Date().getFullYear()}`;
  if (c === 'cl' || c.startsWith('cl') || n.includes('casual')) return total && total > 0 ? `${(total / 12).toFixed(3)} credited monthly` : 'Casual leave';
  if (c === 'sl' || c.startsWith('sl') || n.includes('sick')) return 'Medical cert. if > 3 days';
  if (c === 'el' || c.startsWith('el') || n.includes('earned')) return '1.75 per 20 days worked';
  if (c === 'ml' || n.includes('maternity')) return '26 weeks · eligible';
  if (c === 'pl' || n.includes('paternity')) return 'Eligible';
  if (c.includes('lop') || n.includes('loss of pay')) return 'Unpaid · feeds payroll';
  return '';
}

function initialsOf(name: string) {
  return (name || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function avatarHue(name: string) {
  return ([...(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 37) % 360;
}

function avatarBgStyle(name: string) {
  const h = avatarHue(name);
  return { background: `oklch(0.93 0.05 ${h})`, color: `oklch(0.42 0.12 ${h})` };
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
  const selectedCompanyId = useCompanyContextStore(s => s.selectedCompanyId);
  const ownCompany = useCompanyContextStore(s => s.ownCompany);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]); // team-wide (manager/admin)
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'team' | 'admin'>('my');
  const [teamCalendar, setTeamCalendar] = useState<{ team: any[]; leaves: any[]; byDate: Record<string, number[]> } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const sq = scopeQuery();
      const effectiveViewSelf = !isAdmin;
      const viewParamStr = effectiveViewSelf ? '&view=self' : '';
      const [leaveRes, empRes, holRes] = await Promise.all([
        fetch(`/api/leave?limit=100${sq ? `&${sq}` : ''}${viewParamStr}`, { headers }),
        fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
        fetch(`/api/holidays${sq ? `?${sq}` : ''}`, { headers }).catch(() => null),
      ]);
      if (leaveRes.ok) { const data = await leaveRes.json(); setLeaveRequests(data.leaveRequests || []); setAllLeaveRequests(data.leaveRequests || []); }
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
          myEmp = {
            id: user?.employee?.id || '',
            employeeId: user?.employee?.employeeId || '',
            firstName: user?.employee?.firstName || user?.name?.split(' ')[0] || 'Employee',
            lastName: user?.employee?.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
            employeeStatus: (user?.employee as any)?.status,
            dateOfJoining: null, gender: null,
          } as Employee;
        }
        if (myEmp) {
          setEmployee(myEmp);
          const probation = isActiveProbation(myEmp);
          const currentBalances = balanceData?.balances || myEmp.leaveBalances || [];
          const normalizedBalances = normalizeLeaveBalances(currentBalances as LeaveBalance[], { gender: myEmp.gender || balanceData?.gender, probation });
          setLeaveBalances(normalizedBalances);
        }
        const ltRes = await fetch(`/api/leave-types?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null);
        if (ltRes?.ok) {
          const ltData = await ltRes.json();
          setLeaveTypes((ltData.data || []).filter((lt: any) => lt.status === 'active' || lt.status === undefined).map((lt: any) => ({
            id: lt.id, name: lt.name, code: lt.code, defaultDays: lt.defaultDays || 0, isPaid: lt.isPaid ?? true,
          })));
        }
      }
      if (holRes?.ok) {
        const holData = await holRes.json();
        setHolidays(holData.data || []);
      }
      // Fetch team calendar for current month (managers/admins)
      if (isManager) {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        try {
          const calRes = await fetch(`/api/leave/team-calendar?month=${monthStr}${sq ? `&${sq}` : ''}`, { headers }).catch(() => null);
          if (calRes?.ok) {
            const calData = await calRes.json();
            setTeamCalendar({ team: calData.team || [], leaves: calData.leaves || [], byDate: calData.byDate || {} });
          }
        } catch {}
      }
    } catch (err) { console.error(err); toast.error('Failed to load leave data'); }
    finally { setLoading(false); }
  }, [user?.email, scopeQuery, selectedTenantId, selectedCompanyId, isAdmin, isManager]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);
  useEffect(() => { if (actionParam === 'apply') router.push('/leave/apply'); }, [actionParam, router]);

  const blocked = isActiveProbation(employee);
  const order = ['casual leave', 'sick leave', 'earned leave', 'compensatory off', 'comp off', 'maternity leave', 'paternity leave', 'personal leave', 'loss of pay'];
  const sortedBalances = useMemo(() => leaveBalances.slice().sort((a, b) => {
    const ai = order.indexOf(a.leaveType?.name?.toLowerCase() || ''); const bi = order.indexOf(b.leaveType?.name?.toLowerCase() || '');
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  }), [leaveBalances]);
  const cardBalances = sortedBalances.slice(0, 5);

  const pendingDaysFor = useCallback((leaveTypeId: string) => {
    const year = new Date().getFullYear();
    return leaveRequests
      .filter(l => l.status === 'pending' && l.leaveTypeId === leaveTypeId && new Date(l.startDate).getFullYear() === year)
      .reduce((s, l) => s + (l.halfDay ? 0.5 : getDaysBetween(l.startDate, l.endDate, new Set())), 0);
  }, [leaveRequests]);

  // Total available excludes maternity/paternity (like the design)
  const totalAvailable = useMemo(() => sortedBalances
    .filter(b => !/maternity|paternity/i.test(b.leaveType?.name || ''))
    .reduce((s, b) => s + (blocked ? 0 : Math.max(0, (b.total || 0) - (b.used || 0) - pendingDaysFor(b.leaveType.id))), 0),
    [sortedBalances, blocked, pendingDaysFor]);

  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const pendingCount = leaveRequests.filter(l => l.status === 'pending').length;
  const companyName = ownCompany?.name || user?.company?.name || user?.tenant?.name || 'your company';

  return (
    <div className="space-y-6">
      {/* Page header — portal replica */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400 mb-1.5">Home › Leave › Dashboard</p>
          <h1 className="text-[27px] font-extrabold tracking-tight text-slate-900 leading-tight">
            {activeTab === 'admin' ? 'Leave Administration' : activeTab === 'team' ? 'Team Leave Dashboard' : 'Leave Dashboard'}
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            {activeTab === 'admin'
              ? `Company-wide leave position · ${companyName} · FY ${new Date().getFullYear()}`
              : activeTab === 'team'
                ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting for your approval`
                : `Good ${greeting}, ${user?.name?.split(' ')[0] || 'there'} — you have ${fmtNum(totalAvailable)} days of leave available.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* "Configuring for" card — blue */}
          <div className="hidden md:flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
            <FiLayers className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Configuring for</p>
              <p className="text-[13.5px] font-bold text-blue-700 truncate max-w-[200px]">{companyName}</p>
            </div>
          </div>
          {isManager && (
            <button
              onClick={() => toast('Report export started')}
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-[9px] border border-slate-200 bg-white text-slate-700 text-[13.5px] font-semibold hover:bg-slate-50"
            >
              <FiDownload className="w-4 h-4" /> Reports
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => toast('Opening Non-Production Day posting')}
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-[9px] border border-slate-200 bg-white text-slate-700 text-[13.5px] font-semibold hover:bg-slate-50"
            >
              <FiCalendar className="w-4 h-4" /> NPD bulk leave
            </button>
          )}
          <button
            onClick={() => router.push('/leave/apply')}
            className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-[9px] bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold shadow-sm shadow-blue-600/30"
          >
            <FiPlus className="w-4 h-4" /> {isAdmin ? 'Apply on behalf' : 'Apply leave'}
          </button>
        </div>
      </div>

      {/* Role-based tabs */}
      {isManager && (
        <div className="border-b border-slate-200">
          <div className="flex gap-1">
            <button onClick={() => setActiveTab('my')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'my' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <FiGrid className="w-4 h-4" /> My Leave
            </button>
            <button onClick={() => setActiveTab('team')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'team' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <FiUsers className="w-4 h-4" /> Team {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">{pendingCount}</span>}
            </button>
            {isAdmin && (
              <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'admin' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <FiSettings className="w-4 h-4" /> Administration
              </button>
            )}
          </div>
        </div>
      )}

      {/* My Leave tab (Employee / Manager self view) */}
      {activeTab === 'my' && (
        <EmployeeView
          loading={loading}
          leaveRequests={leaveRequests}
          cardBalances={cardBalances}
          leaveTypes={leaveTypes}
          employee={employee}
          holidays={holidays}
          blocked={blocked}
          pendingDaysFor={pendingDaysFor}
          onApply={(code) => router.push(`/leave/apply${code ? `?type=${code}` : ''}`)}
          onCancelled={fetchData}
          scopeQuery={scopeQuery()}
        />
      )}

      {/* Team tab (Manager view) */}
      {activeTab === 'team' && isManager && (
        <ManagerView
          loading={loading}
          leaveRequests={allLeaveRequests}
          leaveTypes={leaveTypes}
          holidays={holidays}
          teamCalendar={teamCalendar}
          onCancelled={fetchData}
        />
      )}

      {/* Admin tab (HR view) */}
      {activeTab === 'admin' && isAdmin && (
        <HRView loading={loading} leaveRequests={allLeaveRequests} leaveTypes={leaveTypes} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   EMPLOYEE VIEW — 5 balance cards + tracker + table + side panel
   ════════════════════════════════════════════════════════════════════ */
function EmployeeView({
  loading, leaveRequests, cardBalances, leaveTypes, employee, holidays, blocked, pendingDaysFor, onApply, onCancelled, scopeQuery,
}: {
  loading: boolean;
  leaveRequests: LeaveRequest[];
  cardBalances: LeaveBalance[];
  leaveTypes: LeaveType[];
  employee: Employee | null;
  holidays: Holiday[];
  blocked: boolean;
  pendingDaysFor: (id: string) => number;
  onApply: (code?: string) => void;
  onCancelled: () => void;
  scopeQuery: string;
}) {
  return (
    <>
      {/* 5 balance cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {loading && cardBalances.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => <BalanceCardSkeleton key={i} />)
        ) : cardBalances.length === 0 ? (
          <div className="col-span-2 sm:col-span-3 xl:col-span-5 bg-white rounded-xl border border-slate-200 p-8 text-center">
            <FiInbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">No leave balances configured</p>
            <p className="text-xs text-slate-400 mt-1">Your leave balances will appear here once set up.</p>
          </div>
        ) : (
          cardBalances.map(b => (
            <BalanceCard key={b.id} balance={b} blocked={blocked} pending={pendingDaysFor(b.leaveType.id)} onApply={onApply} />
          ))
        )}
      </div>

      {/* Two-column layout: left = tracker + table; right = summary + team + holidays */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-4 min-w-0">
          <LeaveRequestTracker
            leaveRequests={leaveRequests}
            employee={employee ? { id: employee.id, reportingManager: employee.reportingManager || null } : null}
            onCancelled={onCancelled}
          />
          <LeaveStatusTable
            requests={leaveRequests}
            loading={loading}
            holidays={holidays}
            onApply={onApply}
            onCancelled={onCancelled}
          />
        </div>

        {/* Right column */}
        <MyLeaveSummaryPanel leaveRequests={leaveRequests} employee={employee} holidays={holidays} />
      </div>
    </>
  );
}

/* ── Balance Card (5-card row, colored top border + Apply button) ── */
function BalanceCard({ balance: lb, blocked, pending, onApply }: { balance: LeaveBalance; blocked: boolean; pending: number; onApply: (code?: string) => void }) {
  const theme = getLeaveTheme(lb.leaveType?.code, lb.leaveType?.name);
  const total = blocked ? 0 : (lb.total || 0);
  const used = blocked ? 0 : (lb.used || 0);
  const available = Math.max(0, total - used - pending);
  const usedPct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const pendingPct = total > 0 ? Math.min((pending / total) * 100, 100 - usedPct) : 0;
  const note = typePolicyNote(lb.leaveType?.code, lb.leaveType?.name, total);
  const code = (lb.leaveType?.code || lb.leaveType?.name || 'L').slice(0, 5).toUpperCase();

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden px-3.5 py-3.5 transition-all hover:shadow-md hover:-translate-y-px">
      {/* colored 3px top border */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: theme.color }} />
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: theme.color, background: theme.soft }}>{code}</span>
        <span className="text-xs font-semibold text-slate-500 truncate flex-1" title={lb.leaveType.name}>{lb.leaveType.name}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight text-slate-900 leading-none">{fmtNum(available)}</span>
        <span className="text-xs font-semibold text-slate-400">/ {fmtNum(total)} days</span>
      </div>
      {/* progress bar: used + pending */}
      <div className="flex w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2.5 gap-0.5">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${usedPct}%`, background: theme.color }} />
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pendingPct}%`, background: theme.color, opacity: 0.35 }} />
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: theme.color }} /> Used {fmtNum(used)}</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: theme.color, opacity: 0.35 }} /> Pending {fmtNum(pending)}</span>
      </div>
      {note && <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-dashed border-slate-200 min-h-[28px] truncate" title={note}>{note}</p>}
      <button
        onClick={() => onApply(lb.leaveType?.code)}
        className="w-full mt-2.5 h-[31px] rounded-lg border border-slate-200 bg-white text-blue-600 text-xs font-bold hover:bg-blue-50 hover:border-blue-200 inline-flex items-center justify-center gap-1"
      >
        Apply <FiChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BalanceCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3.5 animate-pulse">
      <div className="h-3 w-12 bg-slate-200 rounded mb-3" />
      <div className="h-7 w-20 bg-slate-200 rounded mb-3" />
      <div className="h-1.5 w-full bg-slate-100 rounded-full mb-2" />
      <div className="h-3 w-24 bg-slate-100 rounded mb-2" />
      <div className="h-7 w-full bg-slate-100 rounded" />
    </div>
  );
}

/* ── Leave Status Table with filter pills ── */
function LeaveStatusTable({
  requests, loading, holidays, onApply, onCancelled,
}: {
  requests: LeaveRequest[]; loading: boolean; holidays: Holiday[]; onApply: (code?: string) => void; onCancelled: () => void;
}) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: requests.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of requests) {
      const s = (r.status || '').toLowerCase() as keyof typeof c;
      if (s in c && s !== 'all') c[s]++;
    }
    return c;
  }, [requests]);

  const filtered = useMemo(() => (filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus))
    .slice().sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime()),
    [requests, filterStatus]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this leave request? This cannot be undone.')) return;
    try {
      setCancellingId(id);
      const res = await fetch(`/api/leave/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'cancelled' }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to cancel'); }
      toast.success('Leave request cancelled');
      onCancelled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel leave');
    } finally {
      setCancellingId(null);
    }
  };

  const pills: Array<{ key: typeof filterStatus; label: string }> = [
    { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'cancelled', label: 'Cancelled' },
  ];

  const th = 'px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div>
          <h3 className="text-[15px] font-bold text-slate-900">Leave status</h3>
          <p className="text-xs text-slate-500 mt-0.5">Your requests this year</p>
        </div>
        {/* Segmented filter with counts */}
        <div className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 border border-slate-200">
          {pills.map(p => {
            const active = filterStatus === p.key;
            const cnt = counts[p.key];
            return (
              <button
                key={p.key}
                onClick={() => setFilterStatus(p.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1 ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {p.label}
                <span className={`text-[10px] font-bold px-1 rounded-full ${active ? 'bg-slate-100 text-slate-600' : 'text-slate-400'}`}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="border-b border-slate-100 bg-slate-50/40">
            <tr>
              <th className={`text-left ${th}`}>Request</th>
              <th className={`text-left ${th}`}>Type</th>
              <th className={`text-left ${th}`}>Dates</th>
              <th className={`text-right ${th}`}>Days</th>
              <th className={`text-left ${th}`}>Reason</th>
              <th className={`text-left ${th}`}>Status</th>
              <th className={`text-right ${th}`}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-3 py-3.5"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                <td className="px-3 py-3.5"><div className="h-4 w-8 bg-slate-200 rounded" /></td>
                <td className="px-3 py-3.5"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                <td className="px-3 py-3.5"><div className="h-3 w-4 bg-slate-200 rounded ml-auto" /></td>
                <td className="px-3 py-3.5"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                <td className="px-3 py-3.5"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                <td className="px-3 py-3.5"><div className="h-3 w-10 bg-slate-200 rounded ml-auto" /></td>
              </tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center">
                <FiCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2" />
                <p className="text-slate-500 font-medium">No {filterStatus !== 'all' ? filterStatus : ''} requests</p>
                <p className="text-xs text-slate-400 mt-1">Apply for leave to get started.</p>
              </td></tr>
            ) : filtered.map(lr => {
              const pill = getStatusPill(lr.status);
              const theme = getLeaveTheme(lr.leaveType?.code, lr.leaveType?.name);
              const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
              const d = lr.halfDay ? 0.5 : getDaysBetween(lr.startDate, lr.endDate, hs);
              const reason = (lr.reason || '').trim() || '—';
              const sub = appliedShort(lr.createdAt || undefined);
              const isBackDated = new Date(lr.startDate) < new Date(Date.now() - 30 * 86_400_000);
              const isPending = lr.status === 'pending';
              return (
                <tr key={lr.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <p className="text-[13px] font-mono font-bold text-slate-800">{ticketCode(lr.id, lr.createdAt)}</p>
                    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: theme.color, background: theme.soft }} title={lr.leaveType?.name}>
                      {(lr.leaveType?.code || lr.leaveType?.name || 'L').slice(0, 5).toUpperCase()}
                    </span>
                    {lr.appliedByHR && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">HR</span>}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                    {fmtRange(lr.startDate, lr.endDate)}
                    {lr.halfDay && <p className="text-[11px] text-slate-400 mt-0.5">{lr.halfDaySlot === 'second_half' ? 'Second half' : 'First half'}</p>}
                    {isBackDated && <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">Back-dated</span>}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-700 text-right tabular-nums whitespace-nowrap">{fmtNum(d)}</td>
                  <td className="px-3 py-3 text-sm text-slate-700 truncate max-w-[200px]" title={reason}>
                    {reason}
                    {lr.status === 'rejected' && lr.comments && <p className="text-[11px] text-red-600 mt-0.5 truncate">&ldquo;{lr.comments}&rdquo;</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border whitespace-nowrap ${pill.bg} ${pill.text}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${pill.dot}`} /> {pill.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {isPending ? (
                      <button onClick={() => handleCancel(lr.id)} disabled={cancellingId === lr.id} className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50">
                        {cancellingId === lr.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : null}
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

/* ── My Leave Summary Panel (right column: summary + team out + holidays) ── */
function MyLeaveSummaryPanel({ leaveRequests, employee, holidays }: { leaveRequests: LeaveRequest[]; employee: Employee | null; holidays: Holiday[] }) {
  const year = new Date().getFullYear();
  const now = new Date();
  const monthShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

  let taken = 0, pending = 0, lop = 0;
  for (const l of leaveRequests) {
    if (new Date(l.startDate).getFullYear() !== year) continue;
    const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
    const days = l.halfDay ? 0.5 : getDaysBetween(l.startDate, l.endDate, hs);
    if (l.status === 'approved') {
      taken += days;
      const code = (l.leaveType?.code || '').toLowerCase();
      if (code.includes('lop') || code.includes('unpaid')) lop += days;
    } else if (l.status === 'pending') {
      pending += days;
    }
  }

  // Team on leave this week (Mon–Sun)
  const dow = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((dow + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const teamOnLeaveThisWeek = leaveRequests
    .filter(l => l.status === 'approved' && new Date(l.startDate) <= weekEnd && new Date(l.endDate) >= weekStart)
    .map(l => ({
      id: l.id,
      name: l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : 'Unknown',
      leaveTypeName: l.leaveType?.name || 'Leave',
      leaveTypeCode: l.leaveType?.code || '',
      startDate: l.startDate, endDate: l.endDate,
    }));

  const managerName = employee?.reportingManager
    ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
    : null;

  const subtitleRange = `${monthShort(new Date(year, 0, 1))} – ${monthShort(now)} ${year}`;
  const weekRangeSubtitle = `${weekStart.getDate()} – ${weekEnd.getDate()} ${monthShort(weekEnd)}`;
  const dashDate = (d?: string | null) => (d ? formatDate(d) : '—');

  const upcomingHolidays = holidays
    .map(h => ({ ...h, d: new Date(h.date) }))
    .filter(h => h.d >= now)
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      {/* My leave summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">My leave summary</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitleRange}</p>
        </div>
        <div className="px-4 pt-4 grid grid-cols-3 gap-2">
          {[
            { v: fmtNum(taken), l: 'Days taken' },
            { v: fmtNum(pending), l: 'Pending' },
            { v: fmtNum(lop), l: 'LOP days' },
          ].map(s => (
            <div key={s.l} className="text-center py-3 px-1 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-xl font-extrabold text-slate-900 leading-none">{s.v}</p>
              <p className="text-[11.5px] text-slate-500 mt-1.5">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <SummaryRow label="Policy" value={employee?.leavePolicyId ? 'Custom policy' : `Staff Policy ${year}`} />
          <SummaryRow label="Category" value={employee?.employeeType ? formatCategory(employee.employeeType) : 'White collar · Staff'} />
          <SummaryRow label="Approver" value={managerName || 'Reporting Manager'} />
          <SummaryRow label="DOJ · DOC" value={`${dashDate(employee?.dateOfJoining)} · ${dashDate(employee?.dateOfConfirmation)}`} />
        </div>
      </div>

      {/* Team out this week */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">Team out this week</h3>
          <p className="text-xs text-slate-500 mt-0.5">{weekRangeSubtitle}</p>
        </div>
        <div className="px-5 py-2">
          {teamOnLeaveThisWeek.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No team members on leave this week.</p>
          ) : (
            <ul>
              {teamOnLeaveThisWeek.slice(0, 6).map(t => {
                const theme = getLeaveTheme(t.leaveTypeCode, t.leaveTypeName);
                const sameDay = t.startDate === t.endDate;
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-2 border-t border-slate-100 first:border-t-0">
                    <span className="inline-grid place-content-center w-8 h-8 rounded-full font-bold text-[11px] flex-shrink-0" style={avatarBgStyle(t.name)}>
                      {initialsOf(t.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{t.name}</p>
                      <p className="text-[11.5px] text-slate-500">
                        {new Date(t.startDate).getDate()}{!sameDay ? `–${new Date(t.endDate).getDate()}` : ''} {new Date(t.endDate).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>
                    <span className="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ color: theme.color, background: theme.soft }}>
                      {(t.leaveTypeCode || t.leaveTypeName).slice(0, 4).toUpperCase()}
                    </span>
                  </li>
                );
              })}
              {teamOnLeaveThisWeek.length > 6 && (
                <li className="text-[11px] text-slate-400 text-center py-2">+{teamOnLeaveThisWeek.length - 6} more</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Upcoming holidays */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">Upcoming holidays</h3>
        </div>
        <div className="px-5 py-2">
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No upcoming holidays.</p>
          ) : (
            <ul>
              {upcomingHolidays.map(h => {
                const d = h.d;
                return (
                  <li key={h.id} className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-t-0">
                    <span className="w-[42px] h-[44px] flex-none rounded-lg bg-emerald-50 text-emerald-700 flex flex-col items-center justify-center text-[10px] font-semibold leading-tight">
                      <span className="text-base font-extrabold">{d.getDate()}</span>
                      {d.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{h.name}</p>
                      <p className="text-[11.5px] text-slate-500">{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-900 text-right">{value}</span>
    </div>
  );
}

function formatCategory(employmentType: string) {
  return employmentType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
}

/* ════════════════════════════════════════════════════════════════════
   MANAGER VIEW — 4 KPIs + approve table + 30-day team calendar
   ════════════════════════════════════════════════════════════════════ */
function ManagerView({ loading, leaveRequests, leaveTypes, holidays, teamCalendar, onCancelled }: {
  loading: boolean; leaveRequests: LeaveRequest[]; leaveTypes: LeaveType[]; holidays: Holiday[]; teamCalendar: { team: any[]; leaves: any[]; byDate: Record<string, number[]> } | null; onCancelled: () => void;
}) {
  const pendingApprovals = leaveRequests.filter(r => r.status === 'pending');
  const onLeaveToday = leaveRequests.filter(r => r.status === 'approved' && new Date(r.startDate) <= new Date() && new Date(r.endDate) >= new Date());

  const now = new Date();
  const dow = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((dow + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const outThisWeek = leaveRequests.filter(r => (r.status === 'approved' || r.status === 'pending') && new Date(r.startDate) <= weekEnd && new Date(r.endDate) >= weekStart);

  const lopDays = leaveRequests
    .filter(r => r.status === 'approved' && new Date(r.startDate).getMonth() === now.getMonth() && new Date(r.startDate).getFullYear() === now.getFullYear())
    .reduce((s, r) => {
      const code = (r.leaveType?.code || '').toLowerCase();
      if (!code.includes('lop') && !code.includes('unpaid')) return s;
      const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
      return s + (r.halfDay ? 0.5 : getDaysBetween(r.startDate, r.endDate, hs));
    }, 0);

  const kpis = [
    { label: 'Pending approvals', value: pendingApprovals.length, tone: 'warn' as const, icon: <FiClock className="w-4 h-4" />, foot: `${pendingApprovals.filter(a => new Date(a.startDate) < new Date()).length} back-dated` },
    { label: 'On leave today', value: onLeaveToday.length, tone: 'neutral' as const, icon: <FiCalendar className="w-4 h-4" />, foot: onLeaveToday[0] ? `${onLeaveToday[0].employee?.firstName || ''} ${onLeaveToday[0].employee?.lastName || ''}`.trim() : 'No one today' },
    { label: 'Out this week', value: outThisWeek.length, tone: 'neutral' as const, icon: <FiUsers className="w-4 h-4" />, foot: `${weekStart.getDate()}–${weekEnd.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })}` },
    { label: 'Team LOP · ' + now.toLocaleDateString('en-US', { month: 'short' }), value: fmtNum(lopDays), tone: lopDays > 0 ? 'err' as const : 'neutral' as const, icon: <FiAlertCircle className="w-4 h-4" />, foot: lopDays > 0 ? 'Feeds payroll' : 'None this month' },
  ];

  return (
    <div className="space-y-4">
      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <ApproveLeavesTable pendingApprovals={pendingApprovals} holidays={holidays} onCancelled={onCancelled} />

      <TeamCalendarGrid teamCalendar={teamCalendar} holidays={holidays} leaveRequests={leaveRequests} />
    </div>
  );
}

/* ── KPI Card (portal style with colored left bar) ── */
function KpiCard({ label, value, unit, foot, tone = 'neutral', icon }: {
  label: string; value: number | string; unit?: string; foot?: string; tone?: 'neutral' | 'warn' | 'err' | 'ok'; icon: ReactNode;
}) {
  const barColor = tone === 'warn' ? 'bg-amber-500' : tone === 'err' ? 'bg-red-500' : tone === 'ok' ? 'bg-emerald-500' : 'bg-transparent';
  const iconColor = tone === 'warn' ? 'text-amber-500' : tone === 'err' ? 'text-red-500' : tone === 'ok' ? 'text-emerald-500' : 'text-slate-400';
  return (
    <div className={`relative bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3.5 overflow-hidden`}>
      <div className={`absolute inset-y-0 left-0 w-[3px] ${barColor}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-[26px] font-extrabold tracking-tight text-slate-900 mt-1.5 leading-none">
        {value}{unit && <span className="text-[13px] font-semibold text-slate-400 ml-0.5">{unit}</span>}
      </p>
      {foot && <p className="text-xs text-slate-500 mt-1.5 truncate" title={foot}>{foot}</p>}
    </div>
  );
}

/* ── Approve Leaves Table (checkboxes + flags + approve/reject) ── */
function ApproveLeavesTable({ pendingApprovals, holidays, onCancelled }: {
  pendingApprovals: LeaveRequest[]; holidays: Holiday[]; onCancelled: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [typeF, setTypeF] = useState<string>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  const filtered = typeF === 'all' ? pendingApprovals : pendingApprovals.filter(a => a.leaveTypeId === typeF);
  const allOn = filtered.length > 0 && filtered.every(a => selected.includes(a.id));
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const approveOne = async (id: string) => {
    try {
      setApprovingId(id);
      const res = await fetch(`/api/leave/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'approved', comments: 'Approved' }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to approve'); }
      toast.success('Leave approved · balance deducted');
      onCancelled();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to approve'); }
    finally { setApprovingId(null); }
  };

  const bulkApprove = async () => {
    if (selected.length === 0) return;
    try {
      setBulkApproving(true);
      let ok = 0, fail = 0;
      for (const id of selected) {
        const res = await fetch(`/api/leave/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'approved', comments: 'Bulk approved' }) });
        if (res.ok) ok++; else fail++;
      }
      if (ok > 0) toast.success(`${ok} request${ok === 1 ? '' : 's'} approved`);
      if (fail > 0) toast.error(`${fail} failed to approve`);
      setSelected([]);
      onCancelled();
    } finally { setBulkApproving(false); }
  };

  const confirmReject = async (reason: string) => {
    if (!rejecting) return;
    try {
      const res = await fetch(`/api/leave/${rejecting.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'rejected', comments: reason }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to reject'); }
      toast.success('Leave rejected · employee notified');
      setRejecting(null);
      onCancelled();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to reject'); }
  };

  const th = 'px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div>
          <h3 className="text-[15px] font-bold text-slate-900">Approve leaves</h3>
          <p className="text-xs text-slate-500 mt-0.5">Requests waiting on you · oldest first</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={typeF} onChange={e => setTypeF(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-white">
            <option value="all">All types</option>
            {/* Group by leave type id */}
            {Array.from(new Set(pendingApprovals.map(a => a.leaveTypeId))).map(id => {
              const lt = pendingApprovals.find(a => a.leaveTypeId === id)?.leaveType;
              return <option key={id} value={id}>{lt?.code || lt?.name || id}</option>;
            })}
          </select>
          <button
            onClick={bulkApprove}
            disabled={!selected.length || bulkApproving}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {bulkApproving ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiCheck className="w-3.5 h-3.5" />}
            Approve selected{selected.length ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="border-b border-slate-100 bg-slate-50/40">
            <tr>
              <th className={`text-left ${th} w-9`}>
                <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? [] : filtered.map(a => a.id))} className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
              </th>
              <th className={`text-left ${th}`}>Employee</th>
              <th className={`text-left ${th}`}>Type</th>
              <th className={`text-left ${th}`}>Dates</th>
              <th className={`text-right ${th}`}>Days</th>
              <th className={`text-right ${th}`}>Balance</th>
              <th className={`text-left ${th}`}>Flags</th>
              <th className={`text-right ${th}`}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center">
                <FiCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2" />
                <p className="text-slate-500 font-medium">All caught up — no pending requests.</p>
              </td></tr>
            ) : filtered.map(a => {
              const fullName = a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : 'Unknown';
              const theme = getLeaveTheme(a.leaveType?.code, a.leaveType?.name);
              const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
              const days = a.halfDay ? 0.5 : getDaysBetween(a.startDate, a.endDate, hs);
              const isBackDated = new Date(a.startDate) < new Date();
              const isSel = selected.includes(a.id);
              // We don't have leave balance per team-member here — show '—' unless available
              const balanceLabel: string | null = null;
              return (
                <tr key={a.id} className={`hover:bg-slate-50/60 ${isSel ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(a.id)} className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="inline-grid place-content-center w-7 h-7 rounded-full font-bold text-[11px] flex-shrink-0" style={avatarBgStyle(fullName)}>{initialsOf(fullName)}</span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-slate-800 truncate">{fullName}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[200px]" title={a.reason || ''}>{a.reason || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: theme.color, background: theme.soft }} title={a.leaveType?.name}>
                      {(a.leaveType?.code || a.leaveType?.name || 'L').slice(0, 5).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                    {fmtRange(a.startDate, a.endDate)}
                    <p className="text-[11px] text-slate-400 mt-0.5">{appliedShort(a.createdAt || undefined)}</p>
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-700 text-right tabular-nums whitespace-nowrap">{fmtNum(days)}</td>
                  <td className="px-3 py-3 text-sm text-slate-500 text-right tabular-nums whitespace-nowrap">{balanceLabel !== null ? fmtNum(Number(balanceLabel)) : '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {isBackDated && <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Back-dated</span>}
                      {a.appliedByHR && <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">HR</span>}
                      {!isBackDated && !a.appliedByHR && <span className="text-[11px] text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => approveOne(a.id)} disabled={approvingId === a.id} title="Approve"
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white inline-flex items-center justify-center text-slate-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50">
                        {approvingId === a.id ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiCheck className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setRejecting(a)} title="Reject"
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white inline-flex items-center justify-center text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600">
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reject modal */}
      {rejecting && <RejectModal req={rejecting} onClose={() => setRejecting(null)} onConfirm={confirmReject} />}
    </div>
  );
}

/* ── Reject Modal ── */
function RejectModal({ req, onClose, onConfirm }: { req: LeaveRequest; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(false);
  const fullName = req.employee ? `${req.employee.firstName} ${req.employee.lastName}`.trim() : 'Unknown';
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-5" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md">
        <h3 className="text-base font-extrabold text-slate-900">Reject leave request</h3>
        <p className="text-xs text-slate-500 mt-1">{fullName} · {req.leaveType?.name || 'Leave'} · {fmtRange(req.startDate, req.endDate)}</p>
        <label className="block text-xs font-semibold text-slate-700 mt-4 mb-1.5">Rejection reason <span className="text-red-500">*</span></label>
        <textarea
          rows={3}
          autoFocus
          value={reason}
          onChange={e => { setReason(e.target.value); setErr(false); }}
          placeholder="Shared with the employee in the notification"
          className={`w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 ${err ? 'border-red-300 focus:ring-red-500/20' : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-400'}`}
        />
        {err && <p className="text-xs text-red-600 mt-1.5 font-semibold">Reason is mandatory on reject.</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={() => reason.trim() ? onConfirm(reason.trim()) : setErr(true)} className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
            <FiX className="w-4 h-4" /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Team Calendar (30-day grid, one row per team member) ── */
function TeamCalendarGrid({ teamCalendar, holidays, leaveRequests }: {
  teamCalendar: { team: any[]; leaves: any[]; byDate: Record<string, number[]> } | null;
  holidays: Holiday[];
  leaveRequests: LeaveRequest[];
}) {
  const now = new Date();
  const [calDate, setCalDate] = useState<{ year: number; month: number }>({ year: now.getFullYear(), month: now.getMonth() });
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Compute number of days in the selected month
  const daysInMonth = new Date(calDate.year, calDate.month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const holidaySet = useMemo(() => new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])), [holidays]);

  const team = teamCalendar?.team || [];
  const leaves = teamCalendar?.leaves || [];

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDay = now.getDate();
  const isThisMonth = calDate.year === now.getFullYear() && calDate.month === now.getMonth();

  const prevMonth = () => setCalDate(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const nextMonth = () => setCalDate(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

  const dowOf = (day: number) => new Date(calDate.year, calDate.month, day).getDay();
  const dateStrOf = (day: number) => `${calDate.year}-${String(calDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const leaveByEmpAndDay = useMemo(() => {
    const map = new Map<string, { leave: any; }>();
    for (const lv of leaves) {
      const s = new Date(lv.startDate); const e = new Date(lv.endDate);
      const c = new Date(s); let g = 0;
      while (c <= e && g < 400) {
        g++;
        const dk = c.toISOString().split('T')[0];
        if (dk.startsWith(`${calDate.year}-${String(calDate.month + 1).padStart(2, '0')}-`)) {
          map.set(`${lv.employee?.id}|${dk}`, { leave: lv });
        }
        c.setDate(c.getDate() + 1);
      }
    }
    return map;
  }, [leaves, calDate]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 flex-wrap gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-slate-900">Team calendar</h3>
          <p className="text-xs text-slate-500 mt-0.5">{MONTH_NAMES[calDate.month]} {calDate.year} · {team.length} members</p>
        </div>
        <div className="inline-flex items-center gap-2">
          <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center"><FiChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold text-slate-700 min-w-[90px] text-center">{MONTH_NAMES[calDate.month].slice(0, 3)} {calDate.year}</span>
          <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center"><FiChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row: day numbers */}
          <div className="grid gap-0.5 mb-1.5" style={{ gridTemplateColumns: `170px repeat(${daysInMonth}, minmax(26px, 1fr))` }}>
            <div />
            {days.map(d => {
              const dow = dowOf(d);
              const isWeekend = dow === 0 || dow === 6;
              const isHoliday = holidaySet.has(dateStrOf(d));
              const isToday = isThisMonth && d === todayDay;
              return (
                <div key={d} className={`text-center text-[10.5px] font-semibold py-1 rounded-md ${isToday ? 'bg-emerald-50 text-emerald-700' : isHoliday ? 'text-amber-600' : isWeekend ? 'text-slate-300' : 'text-slate-500'}`}>
                  <span className="block text-[8.5px] font-bold opacity-70">{DOW_LETTERS[dow]}</span>
                  {d}
                </div>
              );
            })}
          </div>
          {/* Member rows */}
          {team.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">No team members found.</p>
          ) : team.map(m => {
            const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Unknown';
            return (
              <div key={m.id} className="grid gap-0.5 mb-0.5 items-center" style={{ gridTemplateColumns: `170px repeat(${daysInMonth}, minmax(26px, 1fr))` }}>
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 pr-2 truncate">
                  <span className="inline-grid place-content-center w-6 h-6 rounded-full font-bold text-[10px] flex-shrink-0" style={avatarBgStyle(name)}>{initialsOf(name)}</span>
                  <span className="truncate">{name}</span>
                </div>
                {days.map(d => {
                  const dow = dowOf(d);
                  const isWeekend = dow === 0 || dow === 6;
                  const isHoliday = holidaySet.has(dateStrOf(d));
                  const dk = dateStrOf(d);
                  const lv = leaveByEmpAndDay.get(`${m.id}|${dk}`)?.leave;
                  const isToday = isThisMonth && d === todayDay;
                  const theme = lv ? getLeaveTheme(lv.leaveType?.code, lv.leaveType?.name) : null;
                  const isPending = lv?.status === 'pending';
                  // Determine if this day is the start of the leave bar
                  const leaveStart = lv ? new Date(lv.startDate) : null;
                  const leaveEnd = lv ? new Date(lv.endDate) : null;
                  const dayDate = new Date(`${dk}T00:00:00`);
                  const isStart = leaveStart && dayDate.getTime() === leaveStart.getTime();
                  const isEnd = leaveEnd && dayDate.getTime() === leaveEnd.getTime();
                  return (
                    <div key={d} className={`h-[26px] rounded-md relative ${isWeekend ? 'bg-slate-100' : 'bg-slate-50/50'} ${isToday ? 'ring-1 ring-emerald-400/30' : ''}`}>
                      {lv && theme && (
                        <span
                          className={`absolute inset-y-1 ${isStart ? 'left-1' : '-left-0.5'} ${isEnd ? 'right-1' : '-right-0.5'} flex items-center justify-center text-[9px] font-extrabold rounded-[5px] border ${isPending ? 'border-dashed' : ''}`}
                          style={{ background: isPending ? `repeating-linear-gradient(-45deg, ${theme.soft} 0 5px, #fff 5px 10px)` : theme.soft, color: theme.color, borderColor: theme.color + '40' }}
                          title={`${name} · ${lv.leaveType?.name || 'Leave'} · ${lv.status}`}
                        >
                          {isStart ? (lv.leaveType?.code || 'L').slice(0, 3).toUpperCase() : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded bg-emerald-100 border border-emerald-500" />Approved</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded border border-dashed border-emerald-500" style={{ background: 'repeating-linear-gradient(-45deg, #ecfdf5 0 4px, #fff 4px 8px)' }} />Pending</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded bg-slate-100 border border-slate-200" />Weekly off / holiday</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HR VIEW — 4 KPIs + quick actions + dept overview + leave-by-type + setup + jobs + activity
   ════════════════════════════════════════════════════════════════════ */
function HRView({ loading, leaveRequests, leaveTypes }: { loading: boolean; leaveRequests: LeaveRequest[]; leaveTypes: LeaveType[] }) {
  const now = new Date();
  const onLeaveToday = leaveRequests.filter(r => r.status === 'approved' && new Date(r.startDate) <= now && new Date(r.endDate) >= now);
  const pending = leaveRequests.filter(r => r.status === 'pending');
  const approved = leaveRequests.filter(r => r.status === 'approved');
  const lopDays = approved
    .filter(r => { const c = (r.leaveType?.code || '').toLowerCase(); return c.includes('lop') || c.includes('unpaid'); })
    .reduce((s, r) => s + (r.halfDay ? 0.5 : 1), 0);

  const teamSize = new Set(leaveRequests.map(r => r.employeeId)).size || 1;

  // Department aggregation from leaveRequests
  const depts = useMemo(() => {
    const map = new Map<string, { name: string; head: number; onLeave: number; pending: number; lop: number }>();
    for (const r of leaveRequests) {
      const dn = r.employee?.department?.name || 'Unassigned';
      if (!map.has(dn)) map.set(dn, { name: dn, head: 0, onLeave: 0, pending: 0, lop: 0 });
      const d = map.get(dn)!;
      d.head += 1; // headcount from unique employees in this dept
      if (r.status === 'approved' && new Date(r.startDate) <= now && new Date(r.endDate) >= now) d.onLeave += 1;
      if (r.status === 'pending') d.pending += 1;
      const code = (r.leaveType?.code || '').toLowerCase();
      if (r.status === 'approved' && (code.includes('lop') || code.includes('unpaid'))) d.lop += (r.halfDay ? 0.5 : 1);
    }
    // headcount should be unique employees not request count
    const uniqueByDept = new Map<string, Set<string>>();
    for (const r of leaveRequests) {
      const dn = r.employee?.department?.name || 'Unassigned';
      if (!uniqueByDept.has(dn)) uniqueByDept.set(dn, new Set());
      uniqueByDept.get(dn)!.add(r.employeeId);
    }
    const arr = Array.from(map.values());
    for (const d of arr) {
      d.head = uniqueByDept.get(d.name)?.size || d.head;
    }
    return arr.sort((a, b) => b.head - a.head).slice(0, 8);
  }, [leaveRequests]);

  const totalHead = depts.reduce((s, d) => s + d.head, 0) || teamSize;

  const kpis = [
    { label: 'On leave today', value: onLeaveToday.length, unit: ` / ${totalHead}`, tone: 'neutral' as const, icon: <FiCalendar className="w-4 h-4" />, foot: totalHead > 0 ? `${((onLeaveToday.length / totalHead) * 100).toFixed(1)}% of workforce` : 'No data' },
    { label: 'Pending approvals', value: pending.length, tone: 'warn' as const, icon: <FiClock className="w-4 h-4" />, foot: `${pending.filter(p => new Date(p.startDate) < now).length} back-dated` },
    { label: 'LOP days · ' + now.toLocaleDateString('en-US', { month: 'short' }), value: fmtNum(lopDays), tone: lopDays > 0 ? 'err' as const : 'neutral' as const, icon: <FiAlertCircle className="w-4 h-4" />, foot: 'Feeds payroll cut-off' },
    { label: 'Profiles not linked', value: 0, tone: 'neutral' as const, icon: <FiUsers className="w-4 h-4" />, foot: 'New joiners · no policy' },
  ];

  const quickActions = [
    { icon: <FiUserPlus className="w-4 h-4" />, t: 'Apply on behalf', s: 'HR applies leave for an employee', msg: 'Opening HR Leave Activities › Apply on behalf' },
    { icon: <FiCalendar className="w-4 h-4" />, t: 'Post NPD bulk leave', s: 'Dept · sub-dept · location', msg: 'Opening Non-Production Day posting' },
    { icon: <FiUpload className="w-4 h-4" />, t: 'Upload opening balance', s: 'Excel · row-wise errors', msg: 'Opening Upload Employee Leave Balance' },
    { icon: <FiDownload className="w-4 h-4" />, t: 'Leave reports', s: 'Balance · Taken · LOP · CF', msg: 'Opening Leave Reports' },
  ];

  // Leave taken by type bar chart
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of leaveRequests) {
      if (r.status !== 'approved') continue;
      const key = r.leaveType?.code || r.leaveType?.name || 'Other';
      map.set(key, (map.get(key) || 0) + (r.halfDay ? 0.5 : 1));
    }
    // Also include leave types that have 0 days
    for (const lt of leaveTypes) {
      const key = lt.code;
      if (!map.has(key)) map.set(key, 0);
    }
    return Array.from(map.entries()).map(([code, days]) => {
      const lt = leaveTypes.find(l => l.code === code);
      return { code, name: lt?.name || code, days, theme: getLeaveTheme(code, lt?.name) };
    }).sort((a, b) => b.days - a.days);
  }, [leaveRequests, leaveTypes]);
  const maxType = Math.max(1, ...byType.map(b => b.days));

  // Recent activity feed (from leaveRequests status changes)
  const activity = useMemo(() => leaveRequests
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime())
    .slice(0, 6)
    .map(r => {
      const who = r.employee ? `${r.employee.firstName} ${r.employee.lastName}`.trim() : 'Unknown';
      const status = (r.status || '').toLowerCase();
      const kindMap: Record<string, 'Approved' | 'Rejected' | 'Pending' | 'Cancelled'> = {
        approved: 'Approved', rejected: 'Rejected', pending: 'Pending', cancelled: 'Cancelled',
      };
      const kind = kindMap[status] || 'Pending';
      const verb = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status === 'cancelled' ? 'cancelled' : 'submitted';
      const when = r.createdAt ? timeAgo(new Date(r.createdAt)) : '—';
      return {
        who,
        what: `${verb} ${r.leaveType?.code || 'leave'} · ${fmtRange(r.startDate, r.endDate)}`,
        when,
        kind,
      };
    }), [leaveRequests]);

  const setupItems = [
    { step: 'Leave Policy', detail: `${leaveTypes.length} leave types · mapped to policies`, state: 'done' as const, screen: 'LV-001' },
    { step: 'Leave Master', detail: `${leaveTypes.length} leave types configured`, state: leaveTypes.length > 0 ? 'done' as const : 'todo' as const, screen: 'LV-003' },
    { step: 'Leave Rules', detail: 'Per-type policy rules & limits', state: 'warn' as const, screen: 'LV-004' },
    { step: 'Employee Leave Profile', detail: `${teamSize} employees linked`, state: 'warn' as const, screen: 'LV-0xx' },
    { step: 'Upload Opening Balance', detail: 'Year-start balance upload', state: 'todo' as const, screen: 'LV-0xx' },
    { step: 'Verify sample employee', detail: 'End-to-end leave test', state: 'todo' as const, screen: '—' },
  ];

  const scheduledJobs = [
    { name: 'Monthly CL / SL credit', when: `01-${now.toLocaleDateString('en-US', { month: 'short' })}-${now.getFullYear()}`, detail: 'CL 0.583 (WC) · 0.5 (BC) per month for new joiners' },
    { name: 'EL accrual run', when: `30-${now.toLocaleDateString('en-US', { month: 'short' })}-${now.getFullYear()}`, detail: 'WC 20 : 1.75 · BC 20 : 1.5 · Trainee 20 : 1' },
    { name: 'Year-end lapse & CF', when: `31-Dec-${now.getFullYear()}`, detail: 'CL carry forward only in first year · EL pro-rata incl. LWP' },
  ];

  return (
    <div className="space-y-4">
      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map(q => (
          <button key={q.t} onClick={() => toast(q.msg)} className="flex items-center gap-3 text-left bg-white border border-slate-200 rounded-xl shadow-sm p-3.5 hover:border-blue-400 hover:shadow-md hover:ring-2 hover:ring-blue-100 transition-all">
            <span className="w-[38px] h-[38px] flex-none rounded-lg bg-blue-50 text-blue-600 inline-grid place-content-center">{q.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-800 truncate">{q.t}</p>
              <p className="text-[11.5px] text-slate-500 truncate">{q.s}</p>
            </div>
            <FiChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Two-column: left = dept overview + leave-by-type; right = setup + jobs + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Department overview */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Department overview</h3>
                <p className="text-xs text-slate-500 mt-0.5">Today · {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
              <button onClick={() => toast('Exported LV-R01 Leave Balance Report (Excel)')} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <FiDownload className="w-3.5 h-3.5" /> Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-slate-100 bg-slate-50/40">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Headcount</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">On leave today</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">LOP (d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {depts.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">No department data available.</td></tr>
                  ) : depts.map(d => (
                    <tr key={d.name} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-semibold text-slate-800">{d.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{d.head}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-[90px] h-1.5 rounded-full bg-slate-100 overflow-hidden flex-none">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, d.head > 0 ? (d.onLeave / d.head) * 100 * 8 : 0)}%` }} />
                          </div>
                          <span className="tabular-nums text-slate-700 text-sm">{d.onLeave}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{d.pending || <span className="text-slate-400">0</span>}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${d.lop > 0 ? 'text-amber-700 font-bold' : 'text-slate-700'}`}>{fmtNum(d.lop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leave taken by type — horizontal bar chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-[15px] font-bold text-slate-900">Leave taken by type</h3>
              <p className="text-xs text-slate-500 mt-0.5">Days · FY {now.getFullYear()} to date</p>
            </div>
            <div className="p-5 space-y-3">
              {byType.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No leave taken yet this year.</p>
              ) : byType.map(b => (
                <div key={b.code} className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(120px, 150px) 1fr 52px' }}>
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 truncate">
                    <span className="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: b.theme.color, background: b.theme.soft }}>{b.code.slice(0, 4).toUpperCase()}</span>
                    <span className="truncate" title={b.name}>{b.name}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(b.days / maxType) * 100}%`, background: b.theme.color }} />
                  </div>
                  <span className="text-right text-[12.5px] font-bold text-slate-800 tabular-nums">{fmtNum(b.days)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Module set-up checklist */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-[15px] font-bold text-slate-900">Module set-up</h3>
              <p className="text-xs text-slate-500 mt-0.5">Part A · one-time, in this order</p>
            </div>
            <div className="px-5 py-2">
              <ol>
                {setupItems.map((s, i) => {
                  const toneClasses = s.state === 'done'
                    ? { bg: 'bg-emerald-50 text-emerald-700', icon: <FiCheck className="w-3 h-3" /> }
                    : s.state === 'warn'
                      ? { bg: 'bg-amber-50 text-amber-700', icon: <span className="text-[10px] font-extrabold">!</span> }
                      : { bg: 'bg-slate-100 text-slate-400', icon: <span className="text-[10px] font-extrabold">{i + 1}</span> };
                  return (
                    <li key={s.step} className="flex items-start gap-3 py-2.5 border-t border-slate-100 first:border-t-0">
                      <span className={`w-6 h-6 flex-none rounded-full inline-grid place-content-center ${toneClasses.bg}`}>{toneClasses.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800">{s.step}</p>
                        <p className="text-[11.5px] text-slate-500">{s.detail}</p>
                      </div>
                      <code className="font-mono text-[10.5px] bg-slate-100 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5 flex-none">{s.screen}</code>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* Scheduled jobs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-[15px] font-bold text-slate-900">Scheduled jobs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Part C · periodic</p>
            </div>
            <div className="px-5 py-2">
              <ul>
                {scheduledJobs.map(j => (
                  <li key={j.name} className="flex items-start gap-2.5 py-2.5 border-t border-slate-100 first:border-t-0">
                    <FiRefreshCw className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800">{j.name}</p>
                      <p className="text-[11.5px] text-slate-500">{j.detail}</p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 flex-none whitespace-nowrap">{j.when}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-[15px] font-bold text-slate-900">Recent activity</h3>
            </div>
            <div className="px-5 py-2">
              {activity.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No recent activity.</p>
              ) : (
                <ul>
                  {activity.map((a, i) => {
                    const dotColor = a.kind === 'Approved' ? 'bg-emerald-500' : a.kind === 'Rejected' ? 'bg-red-500' : a.kind === 'Cancelled' ? 'bg-slate-400' : 'bg-amber-500';
                    return (
                      <li key={i} className="flex gap-2.5 py-2.5 border-t border-slate-100 first:border-t-0">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-none ${dotColor}`} />
                        <div className="min-w-0">
                          <p className="text-[12.5px] text-slate-700"><span className="font-semibold">{a.who}</span> {a.what}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{a.when}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── time-ago helper ── */
function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function LeavePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>}>
      <LeavePageContent />
    </Suspense>
  );
}
